import type { Box3, Material } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { cuesForEvent, cuesForUi, uiActionForCommand, warmSoundIds } from '../sim/audio.ts';
import { zoneCharacterNeeds } from '../sim/wear.ts';
import { noteInConsole, warnInConsole } from './backend/console-log.ts';
import { runFrames } from './frame-loop.ts';
import { element } from './dom-element.ts';
import { startTitleAccount } from './title-signin.ts';
import { fadePageOut } from './landing/leave.ts';
import { markInput, markPlaying, wireFolds, wireHudAway, wireTitleKeys } from './title-screen.ts';
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
import { insideAwakeMoment } from '../sim/world/moments.ts';
import { MAX_STEP, stepWorld } from '../sim/world/step.ts';
import type { DebugHooks } from './debug-handle.ts';
import { attachDebug } from './debug-handle.ts';
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
import type { ZoneAmbience as ZoneLight } from '../sim/content/types.ts';
import { createSettingsStore as createGameSettings } from './settings/store.ts';
import type { Backend, BackendState } from './backend/backend.ts';
import { createBrowserAccount, createBrowserBackend, createBrowserMinter } from './backend/browser.ts';
import type { Minter } from './backend/minter.ts';
import { createHud } from './hud/hud.ts';
import { findLabel } from './hud/pickup-notes.ts';
import type { Hud } from './hud/hud-api.ts';
import type { Input } from './input.ts';
import { createInput } from './input.ts';
import { createPauseMenu } from './hud/pause-menu.ts';
import { frameGate } from './frame-gate.ts';
import type { FrameGate } from './frame-gate.ts';
import { startLaunch } from './launch/launch.ts';
import type { Launch } from './launch/launch.ts';
import type { PauseMenu } from './hud/pause-menu.ts';
import type { GraphicsPreset, SettingsSection } from './settings/settings.ts';
import type { SettingsStore } from './settings/store.ts';
import { createHintStore } from './hints-store.ts';
import type { ObjectiveMarker } from './objective/objective-marker.ts';
import { createObjectiveMarker } from './objective/objective-marker.ts';
import { createBrowserStore } from './storage.ts';
import type { Mobile, MobileBoot } from './mobile/mobile.ts';
import { bootMobile, startMobile } from './mobile/mobile.ts';
import type { QualityName } from './mobile/quality.ts';
import { createBrowserLobby } from './lobby/compact.ts';
import type { Lobby } from './lobby/compact.ts';
import { mountGameBoard } from './lobby/game-board.ts';
import type { GameBoard } from './lobby/game-board.ts';
import { mountBackdrops } from './dither/mount.ts';
import { createLobbyFlow } from './lobby/lobby-flow.ts';
import type { LobbyFlow } from './lobby/lobby-flow.ts';
import type { LobbyView } from './lobby/lobby-screen.ts';
import type { LobbyLook } from './lobby/lobby-stage.ts';
import { lobbyHero } from './lobby/lobby-sheet.ts';
import { PLAYED_KEY, readPlayed } from './launch/played.ts';
import { spokenName } from './lobby/lobby-model.ts';
import { createNameStep, wireEnter } from './lobby/name-step.ts';
import { readHeroName } from './lobby/hero-name.ts';
import type { Minimap } from './minimap/minimap.ts';
import { createMinimap } from './minimap/minimap.ts';
import type { Leaderboard } from './backend/api.ts';
import type { NameVoiceClient, SpokenName } from './backend/name-voice.ts';
import { createBrowserNameVoice } from './opening/browser-voice.ts';
import type { Opening } from './opening/opening.ts';
import { createOpening } from './opening/opening.ts';
import { createBrowserJournalCountClient } from './journal-count/browser-journal-count.ts';
import type { JournalCountClient } from './backend/journal-count-api.ts';
import { loadCountLines } from './journal-count/count-lines.ts';
import type { JournalCount } from './journal-count/journal-count.ts';
import { createJournalCount } from './journal-count/journal-count.ts';
import type { GlitchView } from './glitch/glitch-view.ts';
import { createGlitchView } from './glitch/glitch-view.ts';
import { createGlitchSettings } from './glitch/glitch-settings.ts';
import type { GlitchSettingsStore } from './glitch/glitch-settings.ts';
import type { Actors } from './render/actors.ts';
import { createActors } from './render/actors.ts';
import type { CharacterLibrary, Dresser } from './render/character-loader.ts';
import { loadCharacters, loadRemainingCharacters } from './render/character-loader.ts';
import { createEffects } from './render/effects.ts';
import type { MomentEffects } from './render/moment-effects.ts';
import { momentEffects } from './render/moment-effects.ts';
import type { Ward } from './render/ward.ts';
import { createWard } from './render/ward.ts';
import type { IsoCamera } from './render/iso-camera.ts';
import { createIsoCamera } from './render/iso-camera.ts';
import { cameraSight } from './render/sight.ts';
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
import { WARM_UP, warmUp, warmUpWithin } from './render/warm-up.ts';
import type { Sky } from './render/sky-weather.ts';
import { createSky } from './render/sky-weather.ts';
import type { Rainfall } from './render/rainfall.ts';
import { createRainfall } from './render/rainfall.ts';
import type { ZoneMarkers } from './render/zone-markers.ts';
import { createZoneMarkers } from './render/zone-markers.ts';
import { dressed, dressedProp, propDressing } from './render/surfaces.ts';
import type { ZoneView } from './render/zone-view.ts';
import { buildZoneView, preloadZones, releaseOtherZones } from './render/zone-view.ts';
import { neighbourZones } from './render/zone-assets.ts';
import { createBrowserTimers } from './browser-timers.ts';
import { createOverlayManager, cssMotionMs } from './hud/overlays.ts';
import type { OverlayManager } from './hud/overlays.ts';
import { readServerUrl } from './backend/server-url.ts';
import { createTitleSync, followSync } from './title-sync.ts';
import { createStatusLine, TITLE_NOTICES } from './title-status.ts';
import { BROWSER_NOTICES, createdOrUnsupported, failureText, probeBrowser, reloadHelps, UnsupportedBrowser, unsupportedReason } from './browser-support.ts';
import { defaultBar } from '../sim/skill-book.ts';
import type { Bar } from '../sim/skill-book.ts';
import { shippedKeys, showTitleKeys, skillSlots, TITLE_KEYS, titleKeyRows, titleNames } from './title-keys.ts';
import type { StatusLine } from './title-status.ts';
import { changesSave } from './save-events.ts';
import type { TransitionReport, ZoneTransition } from './transition.ts';
import type { VoicePlayer } from './voice.ts';
import { createZoneTransition, describeTransition, veilColour } from './transition.ts';
import { createVeil } from './veil.ts';
import type { FigureGauge } from './render/figure-gauge.ts';
import { createFigureGauge } from './render/figure-gauge.ts';
import { untilCycleEnds } from './loading-mark.ts';

const GAME = {
  maxFrame: 0.1,
  saveEvery: 2,
  soundLogLength: 300,
  millisecondsPerSecond: 1000,
  idleWaitMs: 1500,
  titleArrivalMs: 1000,
} as const;

const titleLines: { current: StatusLine | null } = { current: null };

function whenIdle(work: () => void): void {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(work, { timeout: GAME.idleWaitMs });
  else window.setTimeout(work, GAME.idleWaitMs);
}

async function start(): Promise<void> {
  mountBackdrops();
  const canvas: HTMLCanvasElement = element('scene', HTMLCanvasElement);
  const title: HTMLDivElement = element('title', HTMLDivElement);
  const status: HTMLParagraphElement = element('title-status', HTMLParagraphElement);
  const enter: HTMLButtonElement = element('title-enter', HTMLButtonElement);
  const reset: HTMLButtonElement = element('title-reset', HTMLButtonElement);
  const vignette: HTMLDivElement = element('vignette', HTMLDivElement);
  const titlePlace: HTMLParagraphElement = element('title-place', HTMLParagraphElement);
  const statusLine: StatusLine = createStatusLine<HTMLSpanElement>(status, (): HTMLSpanElement => document.createElement('span'), createBrowserTimers());
  titleLines.current = statusLine;
  const placeLine: StatusLine = createStatusLine<HTMLSpanElement>(titlePlace, (): HTMLSpanElement => document.createElement('span'), createBrowserTimers());

  const mobile: MobileBoot = bootMobile();
  markInput(document.body, mobile.touch);
  wireFolds([{ button: element('title-controls-open', HTMLButtonElement), panel: element('title-controls', HTMLDivElement) }, { button: element('title-credits-open', HTMLButtonElement), panel: element('title-credits', HTMLDivElement) }], element('title-foot', HTMLElement));
  const overlayManager: OverlayManager = createOverlayManager({ body: document.body, timers: createBrowserTimers(), motionMs: (): number => cssMotionMs(document.documentElement), inPlay: (): boolean => playing });
  const launch: Launch = startLaunch({ serverUrl: import.meta.env.VITE_SERVER_URL, build: import.meta.env.VITE_BUILD_ID, device: mobile.touch ? 'phone' : 'desktop', hud: element('hud', HTMLDivElement), title: element('title', HTMLDivElement), onEnd: (): void => {
    overlayManager.send({ type: 'interrupt', cause: 'endcard' });
  } });
  statusLine.show('Loading…');
  const unsupported: string | null = unsupportedReason(probeBrowser(window, Array.prototype));
  if (unsupported !== null) throw new UnsupportedBrowser(unsupported);
  const content: Content = loadContent();
  const backend: Backend = createBrowserBackend(content, import.meta.env.VITE_SERVER_URL);
  const account: AccountService | null = createBrowserAccount(content, import.meta.env.VITE_SERVER_URL);
  const showSync: (state: BackendState) => void = createTitleSync(element('title-sync', HTMLParagraphElement), createBrowserTimers());
  const loadingSave: Promise<SaveData | null> = backend.load();
  const minter: Minter | null = createBrowserMinter(content, import.meta.env.VITE_SERVER_URL);
  const lobby: Lobby | null = createBrowserLobby(import.meta.env.VITE_SERVER_URL, true);
  title.dataset['lobby'] = lobby === null ? 'off' : 'on';
  const gameSettings: SettingsStore = createGameSettings(createBrowserStore(), skillSlots(content), shippedKeys(content, lobby !== null));
  const titleBar: { current: Bar } = { current: defaultBar(content) };
  const drawTitleKeys = (): void => {
    showTitleKeys(document.querySelector(`.${TITLE_KEYS.listClass}`), titleKeyRows(gameSettings.keys(), titleNames(content, titleBar.current)));
  };
  drawTitleKeys();
  gameSettings.subscribe(drawTitleKeys);
  const stage: Stage = createdOrUnsupported((): Stage => createStage(canvas, mobile.quality.tier));
  const camera: IsoCamera = createIsoCamera(stage.camera, canvas);
  const loader: GLTFLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const dresser: Dresser = (dress: Readonly<Record<string, string>>, material: Material): Material => dressed(content, dress, material);

  const save: SaveData | null = await loadingSave;
  if (save !== null) {
    titleBar.current = save.bar;
    drawTitleKeys();
  }
  if (lobby !== null) void lobby.feed.refresh(true);
  let heroName: string | null = null;
  const nameVoice: NameVoiceClient | null = createBrowserNameVoice(import.meta.env.VITE_SERVER_URL);
  lobby?.feed.subscribe((board: Leaderboard | null): void => {
    if (board !== null) heroName = spokenName(board);
  });
  const world: World = createWorld(content, { seed: Date.now() >>> 0, save, opening: true });
  const propDresser: Dresser = (dress: Readonly<Record<string, string>>, material: Material): Material => dressedProp(content, dress, material, propDressing(world.zone));
  const [library, firstView]: [CharacterLibrary, ZoneView] = await Promise.all([loadCharacters(loader, content, dresser, zoneCharacterNeeds(content, world.zone, world.player.equipped)), buildZoneView(loader, content, world.zone, stage.scene, mobile.quality.tier.name)]);
  const loot: LootView = await createLootView(loader, stage.scene, library);
  const shownPieces: string[] = [...content.itemBases.values()].flatMap((base: ItemBaseDef): string[] => base.wear.slice(0, 1));
  let thumbnails: ItemThumbnails = new Map<string, string>();
  let zoneView: ZoneView = firstView;
  let markers: ZoneMarkers = createZoneMarkers(stage.scene, world.zone);
  stage.setAmbience(world.zone.ambience);
  placeLine.show(world.zone.name);

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
      const place: Placement | null = cue.position === null ? CENTRE : listener(cue.position, cue.reach);
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
  const weather: Sky = createSky(stage.scene);
  const rain: Rainfall = createRainfall(stage, mobile.quality, gameSettings);
  const applyWeather = (zone: World['zone']): void => {
    weather.setLightning(zone.weather.lightning);
    rain.setWeather(zone.weather);
  };
  applyWeather(world.zone);
  const effects: MomentEffects = momentEffects(createEffects(stage.scene, particles, camera, (power: number): void => weather.pulse(power)), { scene: stage.scene, loader, content, library, dresser: propDresser, tier: mobile.quality.tier, flash: (power: number): void => weather.strike(power), trauma: (amount: number): void => camera.addTrauma(amount) }, stage.renderer, stage.camera);
  effects.setTorches(zoneView.torches);
  const ward: Ward = createWard(stage.scene);
  const actors: Actors = createActors(stage.scene, library, world, mobile.quality.tier.msaaSamples > 0, cameraSight(stage.camera));
  const figureGauge: FigureGauge = createFigureGauge();
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
  const glitchSettings: GlitchSettingsStore = createGlitchSettings(createBrowserStore());
  const pauseMenu: PauseMenu = createPauseMenu(element('hud', HTMLDivElement), {
    overlays: overlayManager,
    settings: gameSettings,
    glitches: glitchSettings,
    audio: controls,
    soundHealth: audio.health,
    feedback: launch.canSend ? (): void => launch.open('ask') : null,
    onOpen: (): void => playUi('panel_open'),
    onClose: (): void => playUi('panel_close'),
    life: (): number => world.player.life,
    onTitle: (): void => {
      overlayManager.send({ type: 'interrupt', cause: 'lobby' });
      ladder?.setPlaying(false);
      persist();
      backend.flush();
      playing = false;
      markPlaying(document.body, false);
      audio.stopAmbience();
      enter.textContent = 'Continue';
      titleBar.current = world.player.bar;
      drawTitleKeys();
      void lobbyFlow?.open();
    },
  });

  const hud: Hud = createHud(element('hud', HTMLDivElement), {
    world,
    send,
    itemImage,
    unverified: (item: ItemInstance): boolean => minter?.unverified(world, item) ?? false,
    audio: controls,
    settings: gameSettings,
    openSettings: (section: SettingsSection): void => pauseMenu.open(section),
    playUi,
    voice,
    readBook: (item: ItemInstance): void => {
      opening.readBook(item);
    },
    touch: mobile.touch,
    qualityTier: (): string => (mobile.quality.tier.name === 'desktop' ? gameSettings.get().graphics.quality : `${gameSettings.get().graphics.quality} ${mobile.quality.tier.name}`),
    overlays: overlayManager,
  });
  const overlays: Overlays = createOverlays(element('overlays', HTMLDivElement), camera, {
    findLabel: findLabel(mobile.touch),
    heightOf: (id: number): number => actors.heightOf(id),
    onPickup: (groundId: number): void => {
      hud.hideGroundItem();
      send({ type: 'pickup', groundId });
    },
    onLootEnter: (item: ItemInstance, x: number, y: number): void => hud.showGroundItem(item, x, y),
    onLootMove: (x: number, y: number): void => hud.moveGroundItem(x, y),
    onLootLeave: (): void => hud.hideGroundItem(),
    onTravel: (exit: string): void => send({ type: 'travel', exit }),
    onTalk: (npcId: number): void => send({ type: 'talk', npcId }),
    onWaypoint: (): void => {
      const waypoint = world.zone.waypoint;
      if (waypoint === null) return;
      send({ type: 'move', held: false, dest: { x: waypoint.x, z: waypoint.z } });
      hud.requestMap(true);
    },
  });
  const objectiveMarker: ObjectiveMarker = createObjectiveMarker(stage.scene, camera, element('hud', HTMLDivElement));
  const ladder: GameBoard | null = lobby === null ? null : mountGameBoard(element('hud', HTMLDivElement), lobby, { isToggleKey: (code: string): boolean => gameSettings.keys().actionOf(code) === 'ladder', overlays: overlayManager });
  const minimap: Minimap = createMinimap(element('hud', HTMLDivElement), { world, send, clickMarker: (x: number, z: number, hostile: boolean): void => effects.clickMarker(x, z, hostile), isToggleKey: (code: string): boolean => gameSettings.keys().actionOf(code) === 'minimap' });
  const input: Input = createInput(canvas, window, world, camera, hud, gameSettings, {
    heightOf: (id: number): number => actors.heightOf(id),
    boundsOf: (id: number, out: Box3): boolean => actors.boundsOf(id, out),
    labelHover: (): number | null => overlays.labelHover(),
    clickMarker: (x: number, z: number, hostile: boolean): void => effects.clickMarker(x, z, hostile),
    aimExit: (exit: string | null): void => overlays.aimExit(exit),
    aimItem: (groundId: number | null): void => overlays.aimItem(groundId),
    pause: (): void => {
      if (playing && !transition.blocking) pauseMenu.open(null);
    },
  });
  const applyGraphics = (): void => {
    const preset: GraphicsPreset = gameSettings.preset();
    stage.applyGraphics(preset);
    particles.setDensity(preset.effectsDensity);
    zoneView.setLightBudget(preset.lights);
  };
  gameSettings.subscribe(applyGraphics);
  applyGraphics();
  const touch: Mobile = startMobile(mobile, { canvas, hudRoot: element('hud', HTMLDivElement), world, input, hud, camera, stage, openMenu: (): void => {
      if (playing && !transition.blocking) pauseMenu.open(null);
    } });
  const opening: Opening = createOpening({ world, camera, hud: element('hud', HTMLDivElement), touch: mobile.touch, overlays: overlayManager, send, nameOf: (): string | null => heroName ?? readHeroName(createBrowserStore()), fetchVoice: (): Promise<SpokenName | null> => (nameVoice === null || heroName === null ? Promise.resolve(null) : nameVoice.fetch()), playVoice: (clip: ArrayBuffer): Promise<void> => audio.playEcho(clip), setAmbience: (light: ZoneLight): void => stage.setAmbience(light), setRain: (amount: number): void => rain.setWeather({ ...world.zone.weather, rain: amount }), refreshName: (): Promise<void> => (lobby === null ? Promise.resolve() : lobby.feed.refresh(true)) });
  const glitches: GlitchView = createGlitchView({
    world,
    scene: stage.scene,
    app: element('hud', HTMLDivElement),
    mistZone: content.zones.get(world.glitch.def.mistZone) ?? world.zone,
    quality: mobile.quality.tier.name,
    settings: glitchSettings,
    hero: () => actors.hero(),
    send,
    setAmbience: (ambience): void => stage.setAmbience(ambience),
    restoreAmbience: (): void => { stage.setAmbience(world.zone.ambience); opening.relight(); },
    silence: (): void => {
      audio.stopAmbience();
      voice.stop();
    },
    resume: (): void => startZoneAmbience(),
  });
  const journalCountClient: JournalCountClient | null = createBrowserJournalCountClient(import.meta.env.VITE_SERVER_URL);
  const journalCount: JournalCount | null = journalCountClient === null ? null : createJournalCount({ world, hud: element('hud', HTMLDivElement), client: journalCountClient, lines: loadCountLines(), store: createBrowserStore(), onScreen: (): boolean => playing && !pauseMenu.isOpen });
  const debug: DebugHooks = attachDebug({ world, scene: stage.scene, renderer: stage.renderer, audio, sounds, send });

  let playing: boolean = false;
  let lobbyFlow: LobbyFlow | null = null;
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

  const presentScene = (events: readonly WorldEvent[]): void => {
    actors.handle(events, world);
    effects.handle(events, world);
    overlays.handle(events, world);
    glitches.handle(events);
    if (!glitches.silences(events)) for (const event of events) playCues(cuesForEvent(audioDef, world, event));
    if (events.some((event: WorldEvent): boolean => event.type === 'zone_edited')) void refreshZone().catch((error: unknown): void => {
        warnInConsole(`Zone rebuild after a glitch failed: ${String(error)}`);
      });
    hitStop = Math.max(hitStop, effects.takeHitStop());
    if (changesSave(events)) dirty = true;
  };
  const present = (events: readonly WorldEvent[]): void => {
    presentScene(events);
    hud.handleEvents(events);
  };

  const refreshZone = async (): Promise<void> => {
    const edited: World['zone'] = world.zone;
    const next: ZoneView = await buildZoneView(loader, content, edited, stage.scene, mobile.quality.tier.name);
    if (world.zone !== edited || zoneView.zone.id !== edited.id) {
      next.dispose();
      return;
    }
    zoneView.dispose();
    zoneView = next;
    zoneView.setLightBudget(gameSettings.preset().lights);
    effects.setTorches(zoneView.torches);
    torchVersion = zoneView.lightsVersion;
  };

  const preloadNearZones = (): void => {
    if (!mobile.quality.tier.preloadNearZones) return;
    preloadZones(loader, content, neighbourZones(content, world.zone)).catch((error: unknown): void => {
      warnInConsole(`Preloading the next zones failed: ${String(error)}`);
    });
  };

  const showZone = async (events: readonly WorldEvent[]): Promise<void> => {
    presentScene(events);
    effects.clear();
    particles.clear();
    markers.dispose();
    zoneView.dispose();
    zoneView = await buildZoneView(loader, content, world.zone, stage.scene, mobile.quality.tier.name);
    if (mobile.quality.tier.releaseOtherZones) releaseOtherZones(content, world.zone);
    preloadNearZones();
    markers = createZoneMarkers(stage.scene, world.zone);
    stage.setAmbience(world.zone.ambience);
    applyWeather(world.zone);
    zoneView.setLightBudget(gameSettings.preset().lights);
    effects.setTorches(zoneView.torches);
    torchVersion = zoneView.lightsVersion;
    await warmUpWithin(stage, stage.scene, stage.camera, [...actors.standIns(world.zone), ...loot.standIns(world)], createBrowserTimers(), WARM_UP.zoneWaitMs);
    startZoneAmbience();
    glitches.refresh();
    camera.snap(world.player.pos.x, world.player.pos.z);
    stage.follow(world.player.pos.x, world.player.pos.z);
    const hideWarm: () => void = effects.showWarm(world.player.pos.x, world.player.pos.z);
    stage.render();
    hideWarm();
    queue.length = 0;
    hitStop = 0;
    saveHeld = false;
    persist();
  };

  const transition: ZoneTransition = createZoneTransition({
    veil: createVeil(element('fade', HTMLDivElement)),
    timers: createBrowserTimers(),
    now: (): number => performance.now(),
    onReport: (report: TransitionReport): void => {
      if (import.meta.env.DEV) noteInConsole(describeTransition(report));
    },
    onError: (error: unknown): void => {
    failed = true;
    playing = false;
    markPlaying(document.body, false);
    statusLine.show(error instanceof Error ? `${world.zone.name} could not be built: ${error.message}` : `${world.zone.name} could not be built.`);
    status.classList.remove('quiet');
    placeLine.show(world.zone.name);
    enter.textContent = 'Reload';
    reset.hidden = true;
    ladder?.setPlaying(false);
    title.classList.remove('gone');
    },
  });

  const frame = (now: number): void => {
    const dt: number = Math.min(GAME.maxFrame, Math.max(0, (now - last) / 1000));
    if (last > 0) transition.frame(now - last);
    last = now;
    let events: WorldEvent[] = [];
    const gate: FrameGate = frameGate({ playing, blocking: transition.blocking, lost: touch.lost, menuOpen: pauseMenu.isOpen });
    const collected: Command[] = gate.collect ? [...input.collect(dt), ...touch.collect(dt)] : [];
    if (gate.queue) queue.push(...collected);
    if (gate.step) {
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
    debug.record(events);
    if (minter?.pump(world) === true) dirty = true;
    if (events.some((event: WorldEvent): boolean => event.type === 'zone_changed')) {
      const held: WorldEvent[] = events;
      saveHeld = true;
      transition.begin((): Promise<void> => showZone(held), veilColour(content.zones, held), (): void => hud.handleEvents(held));
    } else {
      present(events);
    }

    if (transition.presenting) {
      const simDt: number = gate.step && hitStop <= 0 ? dt : 0;
      actors.sync(simDt, world, input.hoveredId);
      loot.sync(world);
      opening.update();
      journalCount?.update();
      camera.update(dt, world.player.pos.x, world.player.pos.z);
      effects.update(dt, world);
      ward.update(dt, world);
      stage.follow(world.player.pos.x, world.player.pos.z);
      overlays.update(dt, world, input.hoveredId);
      weather.update(dt, world.player.pos.x, world.player.pos.z, glitchSettings.get().reduceFlashes);
      rain.update(dt, world.player.pos.x, world.player.pos.z, weather.flash, zoneView);
      zoneView.update(now / 1000, dt, world, { look: input.look, figure: figureGauge.measure(actors.hero(), now / 1000), flash: weather.flash });
      if (zoneView.lightsVersion !== torchVersion) {
        torchVersion = zoneView.lightsVersion;
        effects.setTorches(zoneView.torches);
      }
      markers.update(dt, now / 1000, world);
      objectiveMarker.update(dt, now / 1000, world);
      stage.setFlash(weather.light);
      minimap.update(dt);
    }
    audio.setMuffled(insideAwakeMoment(world));
    audio.update(dt);
    particles.update(dt);
    hud.update(dt, transition.blocking ? 'veiled' : 'shown');
    touch.update();
    ladder?.noteLevel(world.player.level);
    launch.update(world, dt, gate.queue);
    vignette.style.setProperty('--hurt', effects.hurt.toFixed(3));
    if (transition.presenting) glitches.update(now / 1000, dt, gate.queue && hitStop <= 0 && !transition.blocking ? dt : 0);
    if (lobbyFlow?.render(dt) !== true) stage.render();

    sinceSave += dt;
    if (sinceSave > GAME.saveEvery) persist();
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
  runFrames(
    frame,
    (error: unknown): void => {
      warnInConsole(`A frame failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      touch.fault();
    },
    { request: (callback: (now: number) => void): void => void requestAnimationFrame(callback) },
  );
  void warmUp(stage, stage.scene, stage.camera, [...actors.standIns(world.zone), ...loot.standIns(world)]);
  const loadTheRest = async (): Promise<void> => {
    await loadRemainingCharacters(loader, content, dresser, library);
    actors.refreshWear(world);
    await warmUp(stage, stage.scene, stage.camera, loot.standIns(world));
    thumbnails = await createItemThumbnails(library, shownPieces, createBrowserTimers());
    hud.refreshItems();
  };

  status.classList.remove('failed');
  if (backend.freshStart()) statusLine.show(TITLE_NOTICES.freshStart);
  else if (backend.setAside()) statusLine.show(TITLE_NOTICES.setAside);
  else status.classList.add('quiet');
  const titleLoader: HTMLDivElement = element('title-loader', HTMLDivElement);
  await untilCycleEnds(titleLoader);
  titleLoader.classList.add('done');
  followSync(backend, showSync, readServerUrl(import.meta.env.VITE_SERVER_URL).kind === 'ok');
  if (account !== null) {
    startTitleAccount(account, (busy: boolean): void => {
      enter.disabled = busy;
      reset.disabled = busy;
    });
  }
  enter.disabled = false;
  window.setTimeout((): void => {
    whenIdle((): void => {
      loadTheRest().catch((error: unknown): void => {
        warnInConsole(`Loading the remaining characters failed: ${String(error)}`);
      });
    });
  }, GAME.titleArrivalMs);
  enter.textContent = save === null ? 'Enter' : 'Continue';
  reset.hidden = true;
  title.classList.add('ready');
  const begin = (): void => {
    dirty = true;
    title.classList.add('gone');
    launch.note('pressed_enter');
    playing = true;
    markPlaying(document.body, true);
    ladder?.setPlaying(true);
    audio.unlock();
    playUi('title_gone');
    startZoneAmbience();
    preloadNearZones();
  };
  wireTitleKeys(title, enter);
  wireHudAway(document.body, element('hud', HTMLDivElement));
  const startOver = async (): Promise<void> => {
    dirty = false;
    reset.disabled = true;
    enter.disabled = true;
    createHintStore(createBrowserStore()).clear();
    launch.forgetPlayed();
    await Promise.all([backend.reset(), fadePageOut()]);
    window.location.reload();
  };
  reset.addEventListener('click', (): void => {
    void startOver();
  });
  let entered: boolean = save !== null;
  const flow: LobbyFlow = createLobbyFlow({ tier: (): QualityName => mobile.quality.tier.name, restore: (): void => stage.resize(), root: element('lobby', HTMLDivElement), veil: element('lobby-veil', HTMLDivElement), title, hud: element('hud', HTMLDivElement), renderer: stage.renderer, content, library, loader, lobby, look: (): LobbyLook => ({ equipped: world.player.equipped }), view: (): LobbyView => ({ name: heroName ?? readHeroName(createBrowserStore()), hero: lobbyHero(content, world.player, world.zone.name, readPlayed(createBrowserStore().read(PLAYED_KEY))), known: entered }), enterColour: (): string => world.zone.ambience.background, begin: (): void => {
    entered = true;
    begin();
  }, ready: (): Promise<void> => effects.ready, startOver: (): void => void startOver(), openSettings: (): void => pauseMenu.open('graphics') });
  lobbyFlow = flow;
  whenIdle((): void => void flow.warm());
  const openLobby = (): void => void flow.open();
  wireEnter({ enter, begin: openLobby, failed: (): boolean => failed, step: createNameStep({ card: enter.parentElement ?? title, enter, lobby, fresh: save === null, store: createBrowserStore(), body: 'man', random: Math.random, begin: openLobby }) });
}

start().catch((error: unknown): void => {
  titleLines.current?.freeze();
  const status: HTMLElement | null = document.getElementById('title-status');
  if (status !== null) {
    status.textContent = failureText(error);
    status.classList.add('failed');
  }
  document.getElementById('title-loader')?.classList.add('done');
  const enter: HTMLElement | null = document.getElementById('title-enter');
  if (reloadHelps(error) && enter instanceof HTMLButtonElement) {
    enter.textContent = BROWSER_NOTICES.reload;
    enter.disabled = false;
    enter.addEventListener('click', (): void => window.location.reload());
    document.getElementById('title')?.classList.add('stuck');
  }
  throw error;
});
