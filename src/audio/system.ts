import type { SoundCue } from '../../sim/audio.ts';
import type { AmbienceLoop, AmbienceStinger, ZoneAmbience } from '../../sim/content/audio.ts';
import type { BufferCache } from './cache.ts';
import { createBufferCache } from './cache.ts';
import type { AssetManifest } from './manifest.ts';
import { assetUrl, parseManifest } from './manifest.ts';
import type { Placement } from './mix.ts';
import { CENTRE } from './mix.ts';
import type { AudioControls, AudioSettings } from './settings.ts';
import { pickVariant, pitchRate, delayBetween, volumeScale } from './variation.ts';
import type { VoiceLimiter } from './voices.ts';
import { createVoiceLimiter } from './voices.ts';

const SYSTEM = {
  cacheBytes: 48 * 1024 * 1024,
  bytesPerSample: 4,
  latePlaySeconds: 0.6,
  failedRetrySeconds: 30,
  duckLevel: 0.3,
  duckAttack: 0.06,
  duckRelease: 0.35,
  settingsSmoothing: 0.03,
  ambienceFade: 3,
  stingerPan: 0.6,
  manifestName: 'manifest.json',
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
  stopVoice(): void;
  startAmbience(zone: ZoneAmbience): void;
  stopAmbience(): void;
  update(dt: number): void;
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
}

export function createAudioSystem(options: AudioOptions): AudioSystem {
  const { base, controls, random, clock } = options;
  const limiter: VoiceLimiter = createVoiceLimiter(clock);
  const cache: BufferCache<AudioBuffer> = createBufferCache<AudioBuffer>(SYSTEM.cacheBytes, (buffer: AudioBuffer): number => buffer.length * buffer.numberOfChannels * SYSTEM.bytesPerSample);
  const pending: Map<string, Promise<AudioBuffer | null>> = new Map<string, Promise<AudioBuffer | null>>();
  const failed: Map<string, number> = new Map<string, number>();
  const lastVariant: Map<string, number> = new Map<string, number>();
  const listeners: ((trigger: Trigger) => void)[] = [];
  const loops: Running[] = [];
  let timers: StingerTimer[] = [];
  let graph: Graph | null = null;
  let manifest: AssetManifest | null = null;
  let voicesPlaying: number = 0;
  let speaking: AudioBufferSourceNode | null = null;
  let voiceRequest: number = 0;
  let manifestLoad: Promise<void> = Promise.resolve();

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

  const load = (path: string): Promise<AudioBuffer | null> => {
    const cached: AudioBuffer | undefined = cache.get(path);
    if (cached !== undefined) return Promise.resolve(cached);
    const running: Promise<AudioBuffer | null> | undefined = pending.get(path);
    if (running !== undefined) return running;
    const lastFailure: number | undefined = failed.get(path);
    if (lastFailure !== undefined && clock() - lastFailure < SYSTEM.failedRetrySeconds) return Promise.resolve(null);
    const url: string | null = base === null ? null : assetUrl(base, path);
    const current: Graph | null = graph;
    if (url === null || current === null) return Promise.resolve(null);
    const request: Promise<AudioBuffer | null> = (async (): Promise<AudioBuffer | null> => {
      try {
        const response: Response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status}`);
        const buffer: AudioBuffer = await current.context.decodeAudioData(await response.arrayBuffer());
        cache.set(path, buffer);
        return buffer;
      } catch {
        failed.set(path, clock());
        return null;
      } finally {
        pending.delete(path);
      }
    })();
    pending.set(path, request);
    return request;
  };

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
    if (manifest === null) await manifestLoad;
    const current: Graph | null = graph;
    const paths: readonly string[] | undefined = manifest?.sfx.get(cue.sound);
    if (current === null || paths === undefined) {
      limiter.end(cue.sound);
      return;
    }
    const variant: number = pickVariant(paths.length, lastVariant.get(cue.sound) ?? -1, random);
    lastVariant.set(cue.sound, variant);
    const path: string | undefined = paths[variant];
    const asked: number = current.context.currentTime;
    const buffer: AudioBuffer | null = path === undefined ? null : await load(path);
    if (buffer === null || current.context.currentTime - asked > SYSTEM.latePlaySeconds) {
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
    if (!limiter.tryStart(cue.sound, cue.maxVoices, cue.cooldown)) return;
    report(cue, place);
    playOn(bus, cue, place).catch((): void => limiter.end(cue.sound));
  };

  const duck = (delta: number): void => {
    voicesPlaying = Math.max(0, voicesPlaying + delta);
    applySettings(controls.get());
  };

  const startLoop = async (loop: AmbienceLoop): Promise<void> => {
    await manifestLoad;
    const current: Graph | null = graph;
    const path: string | undefined = manifest?.sfx.get(loop.sound)?.[0];
    if (current === null || path === undefined) return;
    const buffer: AudioBuffer | null = await load(path);
    if (buffer === null) return;
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
  };

  const loadManifest = async (): Promise<void> => {
    const url: string | null = base === null ? null : assetUrl(base, SYSTEM.manifestName);
    if (url === null) return;
    try {
      const response: Response = await fetch(url);
      if (!response.ok) return;
      manifest = parseManifest(await response.json());
    } catch {
      manifest = null;
    }
  };

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
        for (const bus of [effects, voice, ambience]) bus.connect(master);
        master.connect(context.destination);
        graph = { context, master, effects, voice, ambience };
        applySettings(controls.get());
        context.resume().catch((): void => undefined);
        document.addEventListener('visibilitychange', (): void => {
          const action: Promise<void> = document.hidden ? context.suspend() : context.resume();
          action.catch((): void => undefined);
        });
        manifestLoad = loadManifest();
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
      await manifestLoad;
      const current: Graph | null = graph;
      const path: string | undefined = manifest?.voice.get(lineId);
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
      for (const loop of zone.loops) startLoop(loop).catch((): void => undefined);
      timers = zone.stingers.map((stinger: AmbienceStinger): StingerTimer => ({ stinger, left: delayBetween(stinger.minDelay, stinger.maxDelay, random) }));
    },
    stopAmbience(): void {
      timers = [];
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
    update(dt: number): void {
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
