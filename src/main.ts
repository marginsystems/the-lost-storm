import type { Box3, Material, Scene } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cuesForEvent, cuesForUi, uiActionForCommand, warmSoundIds } from '../sim/audio.ts';
import type { SoundCue } from '../sim/audio.ts';
import type { AudioDef, UiAction, ZoneAmbience } from '../sim/content/audio.ts';
import { loadAudio } from '../sim/content/audio.ts';
import { loadContent } from '../sim/content/content.ts';
import type { Content, ItemBaseDef } from '../sim/content/types.ts';
import { baseOf } from '../sim/items.ts';
import type { Vec2 } from '../sim/math.ts';
import type { SaveData } from '../sim/save.ts';
import { toSave } from '../sim/save.ts';
import { createWorld } from '../sim/world/create.ts';
import { MAX_STEP, stepWorld } from '../sim/world/step.ts';
import type { Command, ItemInstance, World, WorldEvent } from '../sim/world/types.ts';
import type { Listener } from './audio/listener.ts';
import { createListener } from './audio/listener.ts';
import { readAssetBase } from './audio/manifest.ts';
import type { Placement } from './audio/mix.ts';
import { CENTRE } from './audio/mix.ts';
import type { AudioControls } from './audio/settings.ts';
import { browserSettingsStorage, createSettingsStore } from './audio/settings.ts';
import type { AudioSystem, Trigger } from './audio/system.ts';
import { createAudioSystem } from './audio/system.ts';
import type { AccountService } from './backend/account.ts';
import type { Backend, BackendState } from './backend/backend.ts';
import { createBrowserAccount, createBrowserBackend } from './backend/browser.ts';
import { createHud } from './hud/hud.ts';
import type { Hud } from './hud/hud-api.ts';
import type { Input } from './input.ts';
import { createInput } from './input.ts';
import type { Actors } from './render/actors.ts';
import { createActors } from './render/actors.ts';
import type { CharacterLibrary } from './render/character-loader.ts';
import { loadCharacters } from './render/character-loader.ts';
import type { Effects } from './render/effects.ts';
import { createEffects } from './render/effects.ts';
import type { IsoCamera } from './render/iso-camera.ts';
import { createIsoCamera } from './render/iso-camera.ts';
import type { ItemThumbnails } from './render/item-thumbnails.ts';
import { createItemThumbnails, wornImageKey } from './render/item-thumbnails.ts';
import type { LootView } from './render/loot-view.ts';
import { createLootView } from './render/loot-view.ts';
import type { Overlays } from './render/overlays.ts';
import { createOverlays } from './render/overlays.ts';
import type { ParticleSystem } from './render/particles.ts';
import { createParticles } from './render/particles.ts';
import type { Stage } from './render/stage.ts';
import { createStage } from './render/stage.ts';
import type { Weather } from './render/weather.ts';
import { createWeather } from './render/weather.ts';
import type { ZoneMarkers } from './render/zone-markers.ts';
import { createZoneMarkers } from './render/zone-markers.ts';
import { dressed } from './render/surfaces.ts';
import type { ZoneView } from './render/zone-view.ts';
import { buildZoneView, preloadZones } from './render/zone-view.ts';
import { createBrowserTimers } from './browser-timers.ts';
import { createAccountFlow } from './account-flow.ts';
import type { AccountFlow } from './account-flow.ts';
import { loadGoogleIdentity } from './google-identity.ts';
import type { GoogleIdentity } from './google-identity.ts';
import { createTitleAccount } from './title-account.ts';
import type { TitleAccount } from './title-account.ts';
import { createTitleSync } from './title-sync.ts';
import { changesSave } from './save-events.ts';
import type { ZoneTransition } from './transition.ts';
import type { VoicePlayer } from './voice.ts';
import { createZoneTransition } from './transition.ts';

const GAME = {
  maxFrame: 0.1,
  saveEvery: 2,
  soundLogLength: 300,
  millisecondsPerSecond: 1000,
} as const;

export interface DebugHandle {
  readonly world: World;
  readonly scene: Scene;
  readonly audio: AudioSystem;
  readonly sounds: readonly Trigger[];
  send(command: Command): void;
}

declare global {
  interface Window {
    storm?: DebugHandle;
  }
}

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found: HTMLElement | null = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`Missing #${id}`);
  return found;
}

function startTitleAccount(account: AccountService, setBusy: (busy: boolean) => void): void {
  const mount: HTMLDivElement = element('title-google', HTMLDivElement);
  const view: TitleAccount = createTitleAccount(
    {
      root: element('title-account', HTMLDivElement),
      button: mount,
      line: element('title-account-line', HTMLParagraphElement),
      name: element('title-account-name', HTMLSpanElement),
      note: element('title-account-note', HTMLParagraphElement),
    },
    createBrowserTimers(),
  );
  const flow: AccountFlow = createAccountFlow({
    account,
    view,
    timers: createBrowserTimers(),
    setBusy,
    reload: (): void => {
      window.location.reload();
    },
    showButton: async (clientId: string, nonce: string, onCredential: (credential: string) => void): Promise<boolean> => {
      const identity: GoogleIdentity | null = await loadGoogleIdentity();
      if (identity === null) return false;
      identity.start({ clientId, nonce, onCredential }, mount);
      return true;
    },
  });
  element('title-signout', HTMLButtonElement).addEventListener('click', (): void => {
    void flow.signOut();
  });
  void flow.start();
}

async function start(): Promise<void> {
  const canvas: HTMLCanvasElement = element('scene', HTMLCanvasElement);
  const title: HTMLDivElement = element('title', HTMLDivElement);
  const status: HTMLParagraphElement = element('title-status', HTMLParagraphElement);
  const enter: HTMLButtonElement = element('title-enter', HTMLButtonElement);
  const reset: HTMLButtonElement = element('title-reset', HTMLButtonElement);
  const vignette: HTMLDivElement = element('vignette', HTMLDivElement);
  const titlePlace: HTMLParagraphElement = element('title-place', HTMLParagraphElement);

  status.textContent = 'Reading the rules…';
  const content: Content = loadContent();
  const backend: Backend = createBrowserBackend(content, import.meta.env.VITE_SERVER_URL);
  const account: AccountService | null = createBrowserAccount(content, import.meta.env.VITE_SERVER_URL);
  const showSync: (state: BackendState) => void = createTitleSync(element('title-sync', HTMLParagraphElement), createBrowserTimers());
  const loadingSave: Promise<SaveData | null> = backend.load();
  const stage: Stage = createStage(canvas);
  const camera: IsoCamera = createIsoCamera(stage.camera, canvas);
  const loader: GLTFLoader = new GLTFLoader();
  const loadingCharacters: Promise<CharacterLibrary> = loadCharacters(loader, content, (dress: Readonly<Record<string, string>>, material: Material): Material => dressed(content, dress, material));

  const save: SaveData | null = await loadingSave;
  const world: World = createWorld(content, { seed: Date.now() >>> 0, save });
  status.textContent = 'Raising the dead and the walls…';
  const [library, firstView]: [CharacterLibrary, ZoneView] = await Promise.all([loadingCharacters, buildZoneView(loader, content, world.zone, stage.scene)]);
  status.textContent = 'Waking the world…';
  const loot: LootView = await createLootView(loader, stage.scene, library);
  const shownPieces: string[] = [...content.itemBases.values()].flatMap((base: ItemBaseDef): string[] => base.wear.slice(0, 1));
  const thumbnails: ItemThumbnails = createItemThumbnails(library, shownPieces);
  let zoneView: ZoneView = firstView;
  let markers: ZoneMarkers = createZoneMarkers(stage.scene, world.zone);
  stage.setAmbience(world.zone.ambience);
  titlePlace.textContent = world.zone.name;

  const audioDef: AudioDef = loadAudio(content);
  const controls: AudioControls = createSettingsStore(browserSettingsStorage());
  const audio: AudioSystem = createAudioSystem({
    base: readAssetBase(import.meta.env['VITE_ASSET_BASE']),
    controls,
    random: Math.random,
    clock: (): number => performance.now() / GAME.millisecondsPerSecond,
  });
  audio.warm(warmSoundIds(audioDef));
  const listener: Listener = createListener(camera, canvas, (): Vec2 => world.player.pos);
  const playCues = (cues: readonly SoundCue[]): void => {
    for (const cue of cues) {
      const place: Placement | null = cue.position === null ? CENTRE : listener(cue.position);
      if (place !== null) audio.play(cue, place);
    }
  };
  const playUi = (action: UiAction): void => playCues(cuesForUi(audioDef, action));
  const startZoneAmbience = (): void => {
    const ambience: ZoneAmbience | undefined = audioDef.ambience.get(world.zone.id);
    if (ambience === undefined) audio.stopAmbience();
    else audio.startAmbience(ambience);
  };
  const sounds: Trigger[] = [];
  if (import.meta.env.DEV) {
    audio.onTrigger((trigger: Trigger): void => {
      sounds.push(trigger);
      if (sounds.length > GAME.soundLogLength) sounds.shift();
    });
  }
  const queue: Command[] = [];
  const send = (command: Command): void => {
    queue.push(command);
    const action: UiAction | null = uiActionForCommand(command);
    if (action !== null) playUi(action);
  };
  const particles: ParticleSystem = createParticles(stage.scene);
  const weather: Weather = createWeather();
  const effects: Effects = createEffects(stage.scene, particles, camera, (power: number): void => weather.strike(power));
  effects.setTorches(zoneView.torches);
  const actors: Actors = createActors(stage.scene, library, world);
  const itemImage = (item: ItemInstance): string | null => {
    const base: ItemBaseDef | null = baseOf(content, item);
    if (base === null) return null;
    if (base.visual !== null) return thumbnails.get(base.visual) ?? null;
    const piece: string | null = base.wear[0] ?? null;
    return piece === null ? null : (thumbnails.get(wornImageKey(piece)) ?? null);
  };
  const voice: VoicePlayer = {
    play(lineId: string): void {
      audio.playVoice(lineId).catch((): void => undefined);
    },
    stop(): void {
      audio.stopVoice();
    },
  };
  const hud: Hud = createHud(element('hud', HTMLDivElement), { world, send, itemImage, audio: controls, playUi, voice });
  const overlays: Overlays = createOverlays(element('overlays', HTMLDivElement), camera, {
    heightOf: (id: number): number => actors.heightOf(id),
    onPickup: (groundId: number): void => send({ type: 'pickup', groundId }),
    onTravel: (exit: string): void => send({ type: 'travel', exit }),
    onTalk: (npcId: number): void => send({ type: 'talk', npcId }),
    onWaypoint: (): void => {
      const waypoint = world.zone.waypoint;
      if (waypoint === null) return;
      send({ type: 'move', held: false, dest: { x: waypoint.x, z: waypoint.z } });
      hud.requestMap(true);
    },
  });
  const input: Input = createInput(canvas, world, camera, hud, {
    heightOf: (id: number): number => actors.heightOf(id),
    boundsOf: (id: number, out: Box3): boolean => actors.boundsOf(id, out),
    labelHover: (): number | null => overlays.labelHover(),
    clickMarker: (x: number, z: number, hostile: boolean): void => effects.clickMarker(x, z, hostile),
    aimExit: (exit: string | null): void => overlays.aimExit(exit),
  });
  if (import.meta.env.DEV) window.storm = { world, scene: stage.scene, audio, sounds, send };

  let playing: boolean = false;
  let torchVersion: number = 0;
  let failed: boolean = false;
  let saveHeld: boolean = false;
  let hitStop: number = 0;
  let dirty: boolean = false;
  let sinceSave: number = 0;
  let last: number = performance.now();

  const persist = (): void => {
    if (!dirty || saveHeld) return;
    dirty = !backend.save(toSave(world));
    sinceSave = 0;
  };

  const present = (events: readonly WorldEvent[]): void => {
    actors.handle(events, world);
    effects.handle(events, world);
    overlays.handle(events, world);
    hud.handleEvents(events);
    for (const event of events) playCues(cuesForEvent(audioDef, world, event));
    hitStop = Math.max(hitStop, effects.takeHitStop());
    if (changesSave(events)) dirty = true;
  };

  const showZone = async (events: readonly WorldEvent[]): Promise<void> => {
    present(events);
    effects.clear();
    particles.clear();
    markers.dispose();
    zoneView.dispose();
    zoneView = await buildZoneView(loader, content, world.zone, stage.scene);
    markers = createZoneMarkers(stage.scene, world.zone);
    stage.setAmbience(world.zone.ambience);
    effects.setTorches(zoneView.torches);
    torchVersion = zoneView.lightsVersion;
    startZoneAmbience();
    camera.snap(world.player.pos.x, world.player.pos.z);
    queue.length = 0;
    hitStop = 0;
    saveHeld = false;
    persist();
  };

  const transition: ZoneTransition = createZoneTransition(element('fade', HTMLDivElement), (error: unknown): void => {
    failed = true;
    playing = false;
    status.textContent = error instanceof Error ? `${world.zone.name} could not be built: ${error.message}` : `${world.zone.name} could not be built.`;
    status.classList.remove('quiet');
    titlePlace.textContent = world.zone.name;
    enter.textContent = 'Reload';
    reset.hidden = true;
    title.classList.remove('gone');
  });

  const frame = (now: number): void => {
    const dt: number = Math.min(GAME.maxFrame, Math.max(0, (now - last) / 1000));
    last = now;
    let events: WorldEvent[] = [];
    const live: boolean = playing && !transition.blocking;
    if (live) {
      queue.push(...input.collect(dt));
      hitStop = Math.max(0, hitStop - dt);
      if (hitStop <= 0) {
        let remaining: number = dt;
        while (remaining > 1e-5 && !events.some((event: WorldEvent): boolean => event.type === 'zone_changed')) {
          const step: number = Math.min(MAX_STEP, remaining);
          events = events.concat(stepWorld(world, queue.splice(0, queue.length), step));
          remaining -= step;
        }
      }
    }
    if (events.some((event: WorldEvent): boolean => event.type === 'zone_changed')) {
      const held: WorldEvent[] = events;
      saveHeld = true;
      transition.begin((): Promise<void> => showZone(held));
    } else {
      present(events);
    }

    if (!transition.blocking) {
      const simDt: number = live && hitStop <= 0 ? dt : 0;
      actors.sync(simDt, world, input.hoveredId);
      loot.sync(world);
      camera.update(dt, world.player.pos.x, world.player.pos.z);
      effects.update(dt, world);
      stage.follow(world.player.pos.x, world.player.pos.z);
      overlays.update(dt, world, input.hoveredId);
    }
    audio.update(dt);
    particles.update(dt);
    weather.update(dt);
    zoneView.update(now / 1000, dt, world);
    if (zoneView.lightsVersion !== torchVersion) {
      torchVersion = zoneView.lightsVersion;
      effects.setTorches(zoneView.torches);
    }
    markers.update(dt, now / 1000, world);
    stage.setFlash(weather.flash);
    hud.update(dt);
    vignette.style.setProperty('--hurt', effects.hurt.toFixed(3));
    stage.render();

    sinceSave += dt;
    if (sinceSave > GAME.saveEvery) persist();
    requestAnimationFrame(frame);
  };

  window.addEventListener('resize', (): void => stage.resize());
  window.addEventListener('beforeunload', (): void => {
    persist();
    backend.flush();
  });
  document.addEventListener('visibilitychange', (): void => {
    if (!document.hidden) return;
    persist();
    backend.flush();
  });

  camera.snap(world.player.pos.x, world.player.pos.z);
  requestAnimationFrame(frame);
  void preloadZones(loader, content);

  status.classList.remove('failed');
  status.classList.add('quiet');
  element('title-loader', HTMLDivElement).classList.add('done');
  showSync(backend.state());
  backend.subscribe(showSync);
  if (account !== null) {
    startTitleAccount(account, (busy: boolean): void => {
      enter.disabled = busy;
      reset.disabled = busy;
    });
  }
  enter.disabled = false;
  enter.textContent = save === null ? 'Enter' : 'Continue';
  reset.hidden = save === null;
  enter.addEventListener('click', (): void => {
    if (failed) {
      window.location.reload();
      return;
    }
    title.classList.add('gone');
    playing = true;
    audio.unlock();
    startZoneAmbience();
  });
  const startOver = async (): Promise<void> => {
    dirty = false;
    reset.disabled = true;
    enter.disabled = true;
    await backend.reset();
    window.location.reload();
  };
  reset.addEventListener('click', (): void => {
    void startOver();
  });
}

start().catch((error: unknown): void => {
  const status: HTMLElement | null = document.getElementById('title-status');
  if (status !== null) {
    status.textContent = error instanceof Error ? `The storm failed to gather: ${error.message}` : 'The storm failed to gather.';
    status.classList.add('failed');
  }
  document.getElementById('title-loader')?.classList.add('done');
  throw error;
});
