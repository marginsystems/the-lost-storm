import { createEcho } from './echo.ts';
import type { EchoChain } from './echo.ts';
import type { SoundCue } from '../../sim/audio.ts';
import type { AmbienceLoop, AmbienceStinger, ZoneAmbience } from '../../sim/content/audio.ts';
import type { AmbienceTracker } from './ambience.ts';
import { createAmbienceTracker, runBatch } from './ambience.ts';
import type { BufferLoader, LoadOptions } from './buffers.ts';
import { createBufferLoader, LOOP_LOAD, PLAY_LOAD, WARM_LOAD } from './buffers.ts';
import type { BufferCache } from './cache.ts';
import { createBufferCache } from './cache.ts';
import { createManifestLoader } from './manifest-loader.ts';
import type { ManifestLoader } from './manifest-loader.ts';
import type { AssetManifest } from './manifest.ts';
import type { Placement } from './mix.ts';
import { CENTRE } from './mix.ts';
import type { AudioControls, AudioSettings } from './settings.ts';
import { pickVariant, pitchRate, delayBetween, volumeScale } from './variation.ts';
import type { VoiceLimiter } from './voices.ts';
import { createVoiceLimiter } from './voices.ts';
import { warmPaths } from './warm.ts';

const SYSTEM = {
  cacheBytes: 64 * 1024 * 1024,
  msPerSecond: 1000,
  bytesPerSample: 4,
  latePlaySeconds: 0.6,
  failedRetrySeconds: 30,
  duckLevel: 0.3,
  duckAttack: 0.06,
  duckRelease: 0.35,
  settingsSmoothing: 0.03,
  ambienceFade: 3,
  muffleOpenHz: 20000,
  muffleClosedHz: 700,
  muffleSmoothing: 0.5,
  stingerPan: 0.6,
  manifestRetrySeconds: 10,
  loopRetrySeconds: 35,
  manifestTimeoutMs: 8000,
  soundTimeoutMs: 20000,
  warmLanes: 2,
  warmFill: 0.75,
} as const;

export interface Trigger {
  readonly sound: string;
  readonly time: number;
  readonly volume: number;
  readonly gain: number;
  readonly pan: number;
}

export interface AudioSystem {
  readonly controls: AudioControls;
  readonly configured: boolean;
  unlock(): void;
  play(cue: SoundCue, place: Placement): void;
  playVoice(lineId: string): Promise<void>;
  playEcho(audio: ArrayBuffer): Promise<void>;
  warm(ids: readonly string[]): void;
  stopVoice(): void;
  startAmbience(zone: ZoneAmbience): void;
  stopAmbience(): void;
  update(dt: number): void;
  setMuffled(on: boolean): void;
  onTrigger(listener: (trigger: Trigger) => void): void;
}

export interface AudioOptions {
  readonly base: string | null;
  readonly controls: AudioControls;
  readonly random: () => number;
  readonly clock: () => number;
}

interface Running {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

interface StingerTimer {
  readonly stinger: AmbienceStinger;
  left: number;
}

interface Graph {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly effects: GainNode;
  readonly voice: GainNode;
  readonly ambience: GainNode;
  readonly muffle: BiquadFilterNode;
}

export function createAudioSystem(options: AudioOptions): AudioSystem {
  const { base, controls, random, clock } = options;
  const limiter: VoiceLimiter = createVoiceLimiter(clock);
  const cache: BufferCache<AudioBuffer> = createBufferCache<AudioBuffer>(SYSTEM.cacheBytes, (buffer: AudioBuffer): number => buffer.length * buffer.numberOfChannels * SYSTEM.bytesPerSample);
  const lastVariant: Map<string, number> = new Map<string, number>();
  const listeners: ((trigger: Trigger) => void)[] = [];
  const loops: Running[] = [];
  let timers: StingerTimer[] = [];
  const loader: ManifestLoader = createManifestLoader({
    base,
    clock,
    retrySeconds: SYSTEM.manifestRetrySeconds,
    timeoutMs: SYSTEM.manifestTimeoutMs,
    fetchJson: async (url: string, signal: AbortSignal): Promise<unknown> => {
      const response: Response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`${response.status}`);
      const data: unknown = await response.json();
      return data;
    },
  });
  let graph: Graph | null = null;
  let muffled: boolean = false;
  let voicesPlaying: number = 0;
  const zoneLoops: AmbienceTracker<AmbienceLoop> = createAmbienceTracker<AmbienceLoop>();
  let loopRetryLeft: number = 0;
  let warmIds: readonly string[] = [];
  let warming: boolean = false;
  let speaking: AudioBufferSourceNode | null = null;
  let voiceRequest: number = 0;

  const report = (cue: SoundCue, place: Placement): void => {
    const trigger: Trigger = { sound: cue.sound, time: clock(), volume: cue.volume, gain: place.gain, pan: place.pan };
    for (const listener of listeners) listener(trigger);
  };

  const applySettings = (settings: AudioSettings): void => {
    if (graph === null) return;
    const now: number = graph.context.currentTime;
    const ducked: number = voicesPlaying > 0 ? SYSTEM.duckLevel : 1;
    graph.master.gain.setTargetAtTime(settings.muted ? 0 : settings.volumes.master, now, SYSTEM.settingsSmoothing);
    graph.effects.gain.setTargetAtTime(settings.volumes.effects * ducked, now, voicesPlaying > 0 ? SYSTEM.duckAttack : SYSTEM.duckRelease);
    graph.ambience.gain.setTargetAtTime(settings.volumes.ambience * ducked, now, voicesPlaying > 0 ? SYSTEM.duckAttack : SYSTEM.duckRelease);
    graph.voice.gain.setTargetAtTime(settings.volumes.voice, now, SYSTEM.settingsSmoothing);
  };

  controls.subscribe(applySettings);

  const buffers: BufferLoader<AudioBuffer> = createBufferLoader<AudioBuffer>({
    base,
    clock,
    cache,
    failedRetrySeconds: SYSTEM.failedRetrySeconds,
    timeoutMs: SYSTEM.soundTimeoutMs,
    ready: (): boolean => graph !== null,
    fetchBytes: async (url: string, signal: AbortSignal): Promise<ArrayBuffer> => {
      const response: Response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`${response.status}`);
      return response.arrayBuffer();
    },
    decode: (bytes: ArrayBuffer): Promise<AudioBuffer> => {
      if (graph === null) return Promise.reject(new Error('no audio graph'));
      return graph.context.decodeAudioData(bytes);
    },
  });
  const load = (path: string, how: LoadOptions = PLAY_LOAD): Promise<AudioBuffer | null> => buffers.load(path, how);

  const connect = (source: AudioBufferSourceNode, volume: number, pan: number, bus: GainNode, current: Graph, onEnd: () => void): void => {
    const gain: GainNode = current.context.createGain();
    gain.gain.value = volume;
    const panner: StereoPannerNode = current.context.createStereoPanner();
    panner.pan.value = pan;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(bus);
    source.addEventListener('ended', (): void => {
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
      onEnd();
    });
  };

  const playOn = async (bus: 'effects' | 'ambience', cue: SoundCue, place: Placement): Promise<void> => {
    const current: Graph | null = graph;
    if (current === null) {
      limiter.end(cue.sound);
      return;
    }
    const asked: number = clock();
    if (loader.current() === null) await loader.ready();
    const paths: readonly string[] | undefined = loader.current()?.sfx.get(cue.sound);
    if (paths === undefined) {
      limiter.end(cue.sound);
      return;
    }
    const variant: number = pickVariant(paths.length, lastVariant.get(cue.sound) ?? -1, random);
    lastVariant.set(cue.sound, variant);
    const path: string | undefined = paths[variant];
    const buffer: AudioBuffer | null = path === undefined ? null : await load(path);
    if (buffer === null || clock() - asked > SYSTEM.latePlaySeconds) {
      limiter.end(cue.sound);
      return;
    }
    const source: AudioBufferSourceNode = current.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitchRate(random);
    connect(source, cue.volume * place.gain * volumeScale(random), place.pan, current[bus], current, (): void => limiter.end(cue.sound));
    source.start();
  };

  const trigger = (bus: 'effects' | 'ambience', cue: SoundCue, place: Placement): void => {
    ensureManifest();
    if (!limiter.tryStart(cue.sound, cue.maxVoices, cue.cooldown)) return;
    report(cue, place);
    playOn(bus, cue, place).catch((): void => limiter.end(cue.sound));
  };

  const duck = (delta: number): void => {
    voicesPlaying = Math.max(0, voicesPlaying + delta);
    applySettings(controls.get());
  };

  const startLoop = async (loop: AmbienceLoop, generation: number): Promise<boolean> => {
    await loader.ready();
    const current: Graph | null = graph;
    const manifest: AssetManifest | null = loader.current();
    if (current === null || !zoneLoops.current(generation)) return true;
    if (manifest === null) return false;
    const path: string | undefined = manifest.sfx.get(loop.sound)?.[0];
    if (path === undefined) return true;
    const buffer: AudioBuffer | null = await load(path, LOOP_LOAD);
    if (!zoneLoops.current(generation)) return true;
    if (buffer === null) return false;
    const source: AudioBufferSourceNode = current.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain: GainNode = current.context.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(loop.volume, current.context.currentTime, SYSTEM.ambienceFade / 3);
    source.connect(gain);
    gain.connect(current.ambience);
    source.start(0, random() * buffer.duration);
    loops.push({ source, gain });
    return true;
  };

  const attemptLoops = (): void => {
    runBatch(zoneLoops, startLoop).catch((): void => undefined);
  };

  const ensureManifest = (): void => {
    if (graph !== null) loader.ensure();
  };

  const startWarm = (): void => {
    const manifest: AssetManifest | null = loader.current();
    if (manifest === null || graph === null || warming) return;
    const queue: readonly string[] = warmPaths(warmIds, manifest);
    if (queue.length === 0) return;
    warming = true;
    let next: number = 0;
    const lane = (): Promise<void> => {
      if (next >= queue.length || cache.bytes >= SYSTEM.cacheBytes * SYSTEM.warmFill) return Promise.resolve();
      const path: string | undefined = queue[next];
      next += 1;
      return path === undefined ? lane() : load(path, WARM_LOAD).then(lane);
    };
    Promise.all(Array.from({ length: SYSTEM.warmLanes }, lane)).catch((): void => undefined);
  };

  loader.onLoaded((): void => {
    attemptLoops();
    startWarm();
  });

  return {
    controls,
    configured: base !== null,
    unlock(): void {
      if (base === null || graph !== null) return;
      try {
        const context: AudioContext = new AudioContext();
        const master: GainNode = context.createGain();
        const effects: GainNode = context.createGain();
        const voice: GainNode = context.createGain();
        const ambience: GainNode = context.createGain();
        const muffle: BiquadFilterNode = context.createBiquadFilter();
        muffle.type = 'lowpass';
        muffle.frequency.value = muffled ? SYSTEM.muffleClosedHz : SYSTEM.muffleOpenHz;
        for (const bus of [effects, voice]) bus.connect(master);
        ambience.connect(muffle);
        muffle.connect(master);
        master.connect(context.destination);
        graph = { context, master, effects, voice, ambience, muffle };
        applySettings(controls.get());
        context.resume().catch((): void => undefined);
        document.addEventListener('visibilitychange', (): void => {
          const action: Promise<void> = document.hidden ? context.suspend() : context.resume();
          action.catch((): void => undefined);
        });
        loader.ensure();
      } catch {
        graph = null;
      }
    },
    play(cue: SoundCue, place: Placement): void {
      trigger('effects', cue, place);
    },
    async playVoice(lineId: string): Promise<void> {
      this.stopVoice();
      const request: number = voiceRequest;
      ensureManifest();
      await loader.ready();
      const current: Graph | null = graph;
      const path: string | undefined = loader.current()?.voice.get(lineId);
      if (current === null || path === undefined) return;
      const buffer: AudioBuffer | null = await load(path);
      if (buffer === null || request !== voiceRequest) return;
      const source: AudioBufferSourceNode = current.context.createBufferSource();
      source.buffer = buffer;
      speaking = source;
      await new Promise<void>((resolve: () => void): void => {
        connect(source, 1, 0, current.voice, current, (): void => {
          if (speaking === source) speaking = null;
          duck(-1);
          resolve();
        });
        duck(1);
        source.start();
      });
    },
    async playEcho(audio: ArrayBuffer): Promise<void> {
      const current: Graph | null = graph;
      if (current === null) return;
      let buffer: AudioBuffer;
      try {
        buffer = await current.context.decodeAudioData(audio.slice(0));
      } catch {
        return;
      }
      const echo: EchoChain = createEcho(current.context, current.voice);
      const source: AudioBufferSourceNode = current.context.createBufferSource();
      source.buffer = buffer;
      source.connect(echo.input);
      duck(1);
      await new Promise<void>((resolve: () => void): void => {
        source.addEventListener('ended', (): void => {
          window.setTimeout((): void => {
            source.disconnect();
            echo.release();
            duck(-1);
            resolve();
          }, echo.tail * SYSTEM.msPerSecond);
        });
        source.start();
      });
    },
    warm(ids: readonly string[]): void {
      warmIds = ids;
      startWarm();
    },
    stopVoice(): void {
      voiceRequest += 1;
      const source: AudioBufferSourceNode | null = speaking;
      speaking = null;
      if (source === null) return;
      try {
        source.stop();
      } catch {
        return;
      }
    },
    startAmbience(zone: ZoneAmbience): void {
      this.stopAmbience();
      zoneLoops.start(zone.loops);
      loopRetryLeft = SYSTEM.loopRetrySeconds;
      attemptLoops();
      timers = zone.stingers.map((stinger: AmbienceStinger): StingerTimer => ({ stinger, left: delayBetween(stinger.minDelay, stinger.maxDelay, random) }));
    },
    stopAmbience(): void {
      timers = [];
      zoneLoops.stop();
      for (const running of loops.splice(0, loops.length)) {
        try {
          running.source.stop();
        } catch {
          continue;
        }
        running.source.disconnect();
        running.gain.disconnect();
      }
    },
    setMuffled(on: boolean): void {
      if (on === muffled) return;
      muffled = on;
      if (graph === null) return;
      graph.muffle.frequency.setTargetAtTime(on ? SYSTEM.muffleClosedHz : SYSTEM.muffleOpenHz, graph.context.currentTime, SYSTEM.muffleSmoothing);
    },
    update(dt: number): void {
      ensureManifest();
      loopRetryLeft -= dt;
      if (loopRetryLeft <= 0) {
        loopRetryLeft = SYSTEM.loopRetrySeconds;
        attemptLoops();
      }
      for (const timer of timers) {
        timer.left -= dt;
        if (timer.left > 0) continue;
        timer.left = delayBetween(timer.stinger.minDelay, timer.stinger.maxDelay, random);
        const cue: SoundCue = { sound: timer.stinger.sound, volume: timer.stinger.volume, maxVoices: 1, cooldown: 0, position: null };
        trigger('ambience', cue, { gain: CENTRE.gain, pan: (random() * 2 - 1) * SYSTEM.stingerPan });
      }
    },
    onTrigger(listener: (trigger: Trigger) => void): void {
      listeners.push(listener);
    },
  };
}
