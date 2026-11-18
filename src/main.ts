import type { Box3, Material, Vector2 } from 'three';
import { Raycaster } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { cuesForLife, uiActionForCommand } from '../sim/audio.ts';
import { zoneCharacterNeeds } from '../sim/wear.ts';
import { carriedPictures, goodsPictures } from '../sim/pictures.ts';
import { heroRig } from '../sim/hero.ts';
import { noteInConsole, warnInConsole } from './backend/console-log.ts';
import { keepFrames } from './frame-keeper.ts';
import { HOST } from './host.ts';
import type { WatchEffect } from './frame-watch.ts';
import { startPerfReports } from './perf/perf-start.ts';
import type { PerfReports } from './perf/perf-start.ts';
import type { FrameKeeper } from './frame-keeper.ts';
import { element } from './dom-element.ts';
import { startKeepPrompt } from './keep/keep-start.ts';
import { fadePageOut } from './landing/leave.ts';
import { markPlaying, wireHudAway, wireTitleKeys } from './title-screen.ts';
import type { UiAction } from '../sim/content/audio.ts';
import { lifeSounds } from './life-audio.ts';
import type { GameAudio } from './game-audio.ts';
import type { TitleBoot } from './title-boot.ts';
import { bootTitle } from './title-boot.ts';
import type { GameServices } from './game-services.ts';
import { startGameServices } from './game-services.ts';
import { createPlayOverlays } from './play-overlays.ts';
import { startGameGlitches } from './game-glitches.ts';
import { createGameAudio } from './game-audio.ts';
import type { HeroDef, LineDef } from '../sim/content/types.ts';
import type { SaveData } from '../sim/save.ts';
import { toSave } from '../sim/save.ts';
import { createWorld } from '../sim/world/create.ts';
import { insideAwakeMoment } from '../sim/world/moments.ts';
import { prepareZone } from '../sim/world/zones.ts';
import { MAX_STEP, stepWorld } from '../sim/world/step.ts';
import type { DebugHooks } from './debug-handle.ts';
import type { WatchRequest, Watching } from './watch/replay-watch.ts';
import { fetchWatching, watchCaption, watchRequest, watchTicks } from './watch/replay-watch.ts';
import type { WatchCaption } from './watch/watch-caption.ts';
import { createWatchCaption } from './watch/watch-caption.ts';
import { attachDebug } from './debug-handle.ts';
import type { Command, ItemInstance, PlayerState, World, WorldEvent } from '../sim/world/types.ts';
import { voiceAudible } from './audio/settings.ts';
import type { ZoneAmbience as ZoneLight } from '../sim/content/types.ts';
import { pagePlay } from './backend/browser.ts';
import { watchElsewhere } from './hud/elsewhere-card.ts';
import type { Elsewhere } from './hud/elsewhere-card.ts';
import { playerHooks, startHideout } from './hideout/hideout.ts';
import { startAuction } from './auction/auction-start.ts';
import { createHud } from './hud/hud.ts';
import type { Hud, HudApi } from './hud/hud-api.ts';
import { startProfile } from './profile/profile-start.ts';
import type { Input } from './input.ts';
import { createInput } from './input.ts';
import { createPauseMenu } from './hud/pause-menu.ts';
import { frameGate } from './frame-gate.ts';
import type { FrameGate } from './frame-gate.ts';
import type { PauseMenu } from './hud/pause-menu.ts';
import type { GraphicsPreset, GraphicsSettings, SettingsSection } from './settings/settings.ts';
import { createHintStore } from './hints-store.ts';
import type { ObjectiveMarker } from './objective/objective-marker.ts';
import { createObjectiveMarker } from './objective/objective-marker.ts';
import { createBrowserStore } from './storage.ts';
import type { Mobile } from './mobile/mobile.ts';
import { startMobile } from './mobile/mobile.ts';
import type { QualityName } from './mobile/quality.ts';
import { mountGameBoard } from './lobby/game-board.ts';
import type { GameBoard } from './lobby/game-board.ts';
import { createLobbyFlow } from './lobby/lobby-flow.ts';
import type { LobbyFlow } from './lobby/lobby-flow.ts';
import type { SheetView } from './lobby/lobby-screen.ts';
import type { LobbyLook } from './lobby/lobby-stage.ts';
import { lobbyHero } from './lobby/lobby-sheet.ts';
import { PLAYED_KEY, readPlayed } from './launch/played.ts';
import { spokenName } from './lobby/lobby-model.ts';
import { createNameStep, wireEnter } from './lobby/name-step.ts';
import { createBrowserSuggester } from './lobby/name-suggester.ts';
import { readHeroName } from './lobby/hero-name.ts';
import { keepHero, readHero, startingHero } from './lobby/hero-choice.ts';
import { createHeroPick } from './lobby/hero-pick.ts';
import type { HeroPick } from './lobby/hero-pick.ts';
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
import { createGlitchSettings } from './glitch/glitch-settings.ts';
import type { GlitchSettingsStore } from './glitch/glitch-settings.ts';
import type { Actors } from './render/actors.ts';
import { createActors } from './render/actors.ts';
import type { CharacterLibrary, Dresser } from './render/character-loader.ts';
import { loadCharacters, loadNeeds, loadRemainingCharacters, usePrivateClips } from './render/character-loader.ts';
import type { PrivateClips } from './render/private-clips.ts';
import { browserClipDeps, loadPrivateClips } from './render/private-clips.ts';
import { readAssetBase } from './audio/manifest.ts';
import { createEffects } from './render/effects.ts';
import type { MomentEffects } from './render/moment-effects.ts';
import { momentEffects } from './render/moment-effects.ts';
import type { Ward } from './render/ward.ts';
import { createWard } from './render/ward.ts';
import type { IsoCamera } from './render/iso-camera.ts';
import { createIsoCamera, liftAt } from './render/iso-camera.ts';
import { cutawayCompany, setCutawayCompany } from './render/prop-cutaway.ts';
import { cameraSight } from './render/sight.ts';
import { startItemPictures } from './render/item-pictures-start.ts';
import { fightNear } from './render/fight-near.ts';
import type { LootView } from './render/loot-view.ts';
import { createLootView } from './render/loot-view.ts';
import type { Overlays } from './render/overlays.ts';
import { OVERLAYS } from './render/overlays.ts';
import type { ParticleSystem } from './render/particles.ts';
import { createParticles } from './render/particles.ts';
import type { Stage } from './render/stage.ts';
import { createStage } from './render/stage.ts';
import { WARM_UP, waitWithin, warmUp, warmUpWithin } from './render/warm-up.ts';
import type { TurnGate } from './render/paced-work.ts';
import { browserPacer, turnGate } from './render/paced-work.ts';
import type { Sky } from './render/sky-weather.ts';
import { createSky } from './render/sky-weather.ts';
import type { RenderScale } from './render/render-scale.ts';
import { createRenderScale } from './render/render-scale.ts';
import type { Rainfall } from './render/rainfall.ts';
import { createRainfall } from './render/rainfall.ts';
import type { PlaceMarkers } from './render/place-markers.ts';
import { createPlaceMarkers, settledMarkers } from './render/place-markers.ts';
import type { PlaceRef } from '../sim/content/markers.ts';
import { dressed, dressedProp, propDressing } from './render/surfaces.ts';
import type { ZoneView } from './render/zone-view.ts';
import { buildZoneView, preloadZones, releaseOtherZones } from './render/zone-view.ts';
import { neighbourZones } from './render/zone-assets.ts';
import { createBrowserTimers } from './browser-timers.ts';
import { readServerUrl } from './backend/server-url.ts';
import { followSync } from './title-sync.ts';
import { TITLE_NOTICES } from './title-status.ts';
import { createdOrUnsupported, probeBrowser, RETRY, UnsupportedBrowser, unsupportedReason } from './browser-support.ts';
import { runStart } from './start-failure.ts';
import type { StatusLine } from './title-status.ts';
import { changesSave, urgentEvents } from './save-events.ts';
import type { BuiltZone, TransitionReport, ZoneTransition } from './transition.ts';
import { createZoneTransition, describeTransition, veilColour } from './transition.ts';
import { createVeil } from './veil.ts';
import type { HurtVignette } from './vignette-hurt.ts';
import { createHurtVignette } from './vignette-hurt.ts';
import type { FigureGauge } from './render/figure-gauge.ts';
import { createFigureGauge, figureJoints } from './render/figure-gauge.ts';
import { untilCycleEnds } from './loading-mark.ts';
import { reloadPage } from './gpu-release.ts';

const GAME = {
  maxFrame: 0.1,
  saveEvery: 2,
  idleWaitMs: 1500,
  titleArrivalMs: 1000,
} as const;

const titleLines: { current: StatusLine | null } = { current: null };

function whenIdle(work: () => void): void {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(work, { timeout: GAME.idleWaitMs });
  else window.setTimeout(work, GAME.idleWaitMs);
}

async function start(): Promise<void> {
  const { canvas, title, status, enter, reset, vignette, statusLine, placeLine, mobile, overlayManager, launch }: TitleBoot = bootTitle({ lines: titleLines, serverUrl: import.meta.env.VITE_SERVER_URL, build: import.meta.env.VITE_BUILD_ID, inPlay: (): boolean => playing });
  const hurtVignette: HurtVignette = createHurtVignette(vignette);
  statusLine.show('Loading…');
  const unsupported: string | null = unsupportedReason(probeBrowser(window, Array.prototype));
  if (unsupported !== null) throw new UnsupportedBrowser(unsupported);
  const { content, backend, account, showSync, loadingSave, minter, lobby, gameSettings, titleBar, drawTitleKeys }: GameServices = startGameServices({ title, serverUrl: import.meta.env.VITE_SERVER_URL });
  const stage: Stage = createdOrUnsupported((): Stage => createStage(canvas, mobile.quality.tier));
  const camera: IsoCamera = createIsoCamera(stage.camera, canvas);
  const loader: GLTFLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const privateClips: Promise<PrivateClips> = loadPrivateClips(browserClipDeps(readAssetBase(import.meta.env['VITE_ASSET_BASE']), loader));
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
  const keptHero: string | null = save === null ? readHero(createBrowserStore(), content) : null;
  const watchAsked: WatchRequest | null = import.meta.env.DEV ? watchRequest(window.location.search) : null;
  const watching: Watching | null = watchAsked === null ? null : await fetchWatching(content, watchAsked);
  const world: World = watching !== null ? watching.replayer.arena.world : createWorld(content, keptHero === null ? { seed: Date.now() >>> 0, save, opening: true } : { seed: Date.now() >>> 0, save, opening: true, hero: keptHero });
  let entered: boolean = save !== null;
  const keepChosen = (id: string): void => {
    keepHero(createBrowserStore(), id);
    send({ type: 'hero', hero: id });
  };
  const loadGate: TurnGate = turnGate(browserPacer());
  const pick: HeroPick = createHeroPick({ content, chosen: startingHero(content, save === null ? null : world.player.hero, keptHero), standing: (): PlayerState => world.player, entered: (): boolean => entered, keep: keepChosen, restage: (): void => flow.restage(), settled: (): Promise<void> => {
    wantCarried();
    return pictures.items.settled();
  }, load: (id: string): Promise<void> => loadNeeds(loader, content, dresser, library, zoneCharacterNeeds(content, world.zone, world.player.equipped, id), loadGate) });
  const propDresser: Dresser = (dress: Readonly<Record<string, string>>, material: Material): Material => dressedProp(content, dress, material, propDressing(world.zone));
  const [library, firstView]: [CharacterLibrary, ZoneView] = await Promise.all([loadCharacters(loader, content, dresser, zoneCharacterNeeds(content, world.zone, world.player.equipped, world.player.hero)), buildZoneView(loader, content, world.zone, stage.scene, mobile.quality.tier.name)]);
  void privateClips.then((clips: PrivateClips): void => usePrivateClips(library, content.player.heroes.map((hero: HeroDef): string => hero.rig), clips));
  const loot: LootView = await createLootView(loader, stage.scene, library);
  let zoneView: ZoneView = firstView;
  let markers: PlaceMarkers = createPlaceMarkers(stage.scene, loader, content, world.zone, world);
  const placeRay: Raycaster = new Raycaster();
  stage.setAmbience(world.zone.ambience);
  stage.setHeroLight(world.zone.heroLight);
  placeLine.show(world.zone.name);
  const { audioDef, controls, audio, sounds, voice, playCues, playEvent, releaseHeld, playUi, startZoneAmbience, lobbyBed, quietBeds, hushBeds, unlockAudio }: GameAudio = createGameAudio({ content, world, camera, canvas, assetBase: import.meta.env['VITE_ASSET_BASE'], logSounds: import.meta.env.DEV });
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
  const renderScale: RenderScale = createRenderScale(stage.renderer.getPixelRatio());
  const effects: MomentEffects = momentEffects(createEffects(stage.scene, particles, camera, (power: number): void => weather.pulse(power), (): boolean => !gameSettings.get().graphics.streakEffects), { scene: stage.scene, loader, content, library, dresser: propDresser, tier: mobile.quality.tier, particles, flash: (power: number): void => weather.strike(power), trauma: (amount: number): void => camera.addTrauma(amount) }, stage.renderer, stage.camera);
  effects.setTorches(zoneView.torches);
  const ward: Ward = createWard(stage.scene);
  const actors: Actors = createActors(stage.scene, library, world, mobile.quality.tier.msaaSamples > 0, cameraSight(stage.camera), particles);
  const figureGauge: FigureGauge = createFigureGauge(figureJoints(content.rigs.get(heroRig(content, world.player.hero))?.bodyParts ?? {}));
  const pictures = startItemPictures({ content, library, loader, dresser, hero: (): string | null => pick.chosen ?? world.player.hero, refresh: (): void => { hud.refreshItems(); profilePanel?.refreshItems(); }, busy: (): boolean => fightNear(world) });
  const wantCarried = (): void => pictures.items.want([...carriedPictures(content, world.player), ...goodsPictures(content)]);
  const glitchSettings: GlitchSettingsStore = createGlitchSettings(createBrowserStore());
  const pauseMenu: PauseMenu = createPauseMenu(element('hud', HTMLDivElement), {
    overlays: overlayManager,
    settings: gameSettings,
    glitches: glitchSettings,
    audio: controls,
    soundHealth: audio.health,
    feedback: launch.feedback,
    onOpen: (): void => playUi('panel_open'),
    onClose: (): void => playUi('panel_close'),
    life: (): number => world.player.life,
    onTitle: (): void => void leavePlay()?.open(),
  });

  const qualityTier = (): string => (mobile.quality.tier.name === 'desktop' ? gameSettings.get().graphics.quality : `${gameSettings.get().graphics.quality} ${mobile.quality.tier.name}`);
  const hudApi: HudApi = {
    world,
    send,
    itemImage: (item: ItemInstance): string | null => pictures.items.image(item),
    unverified: (item: ItemInstance): boolean => minter?.unverified(world, item) ?? false,
    audio: controls,
    settings: gameSettings,
    openSettings: (section: SettingsSection): void => pauseMenu.open(section),
    feedback: launch.feedback,
    playUi,
    voice,
    readBook: (item: ItemInstance): void => void opening.readBook(item),
    touch: mobile.touch,
    qualityTier,
    overlays: overlayManager,
    auction: startAuction({ content, serverUrl: import.meta.env.VITE_SERVER_URL, backend, world, send, save: (): void => saveNow(), unverified: (item: ItemInstance): boolean => minter?.unverified(world, item) ?? true }),
  };
  const hud: Hud = createHud(element('hud', HTMLDivElement), hudApi);
  const profilePanel = startProfile(lobby, { api: hudApi, content, pictures, hosts: { play: element('hud', HTMLDivElement), lobby: element('lobby', HTMLDivElement) } });
  const overlays: Overlays = createPlayOverlays({ world, camera, touch: mobile.touch, gameSettings, actors, hud, send });
  const hideout = startHideout(import.meta.env.VITE_SERVER_URL, { scene: stage.scene, library, content, feather: mobile.quality.tier.msaaSamples > 0, camera, labels: element('overlays', HTMLDivElement), hud: element('hud', HTMLDivElement), loader, dresser, gate: loadGate, sight: cameraSight(stage.camera), screen: hud, sync: (): Promise<void> => { dirty = true; saveNow(); return backend.sync(); }, openProfile: lobby === null ? null : (name: string): void => lobby.profiles.open(name) });
  const objectiveMarker: ObjectiveMarker = createObjectiveMarker(stage.scene, camera, element('hud', HTMLDivElement), hud.targets);
  const ladder: GameBoard | null = lobby === null ? null : mountGameBoard(element('hud', HTMLDivElement), lobby, { isToggleKey: (code: string): boolean => gameSettings.keys().actionOf(code) === 'ladder', overlays: overlayManager });
  const minimap: Minimap = createMinimap(element('hud', HTMLDivElement), { world, send, clickMarker: (x: number, z: number, hostile: boolean): void => effects.clickMarker(x, z, hostile), isToggleKey: (code: string): boolean => gameSettings.keys().actionOf(code) === 'minimap' });
  const input: Input = createInput(canvas, window, world, camera, hud, gameSettings, {
    ...playerHooks(hideout),
    heightOf: (id: number): number => actors.heightOf(id),
    boundsOf: (id: number, out: Box3): boolean => actors.boundsOf(id, out),
    labelHover: (): number | null => overlays.labelHover(),
    clickMarker: (x: number, z: number, hostile: boolean): void => effects.clickMarker(x, z, hostile),
    aimPlace: (place: PlaceRef | null): void => {
      overlays.aimExit(place === null ? null : place.type === 'exit' ? place.exit : place.type === 'waypoint' ? OVERLAYS.waypointId : null);
      markers.aim(place);
    },
    placeAt: (pointer: Vector2): PlaceRef | null => {
      placeRay.setFromCamera(pointer, stage.camera);
      return markers.pick(placeRay.ray);
    },
    usePlace: (place: PlaceRef): void => markers.use(place),
    aimItem: (groundId: number | null): void => overlays.aimItem(groundId),
    pause: (): void => (playing && !transition.blocking ? pauseMenu.open(null) : undefined),
  });
  const applyGraphics = (): void => {
    const preset: GraphicsPreset = gameSettings.preset();
    stage.applyGraphics(preset);
    particles.setDensity(preset.effectsDensity);
    zoneView.setGraphics(preset);
  };
  gameSettings.subscribe(applyGraphics);
  applyGraphics();
  const touch: Mobile = startMobile(mobile, { canvas, hudRoot: element('hud', HTMLDivElement), world, input, hud, camera, stage, itemNames: overlays.itemNames, feedback: launch.feedback, openMenu: (): void => {
      if (playing && !transition.blocking) pauseMenu.open(null);
    } });
  const opening: Opening = createOpening({ world, camera, hud: element('hud', HTMLDivElement), touch: mobile.touch, overlays: overlayManager, pageVoice: { busy: (): boolean => audio.speaking().length > 0, soundOn: (): boolean => voiceAudible(controls.get()), say: (line: LineDef): void => void voice.play(line) }, send, nameOf: (): string | null => heroName ?? readHeroName(createBrowserStore()), fetchVoice: (): Promise<SpokenName | null> => (nameVoice === null || heroName === null ? Promise.resolve(null) : nameVoice.fetch()), playVoice: (clip: ArrayBuffer): Promise<void> => audio.playEcho(clip), setAmbience: (light: ZoneLight): void => stage.setAmbience(light), setRain: (amount: number): void => rain.setWeather({ ...world.zone.weather, rain: amount }), refreshName: (): Promise<void> => (lobby === null ? Promise.resolve() : lobby.feed.refresh(true)) });
  const glitches: GlitchView = startGameGlitches({ world, stage, glitchSettings, actors, send });
  const journalCountClient: JournalCountClient | null = createBrowserJournalCountClient(import.meta.env.VITE_SERVER_URL);
  const journalCount: JournalCount | null = journalCountClient === null ? null : createJournalCount({ world, hud: element('hud', HTMLDivElement), client: journalCountClient, lines: loadCountLines(), store: createBrowserStore(), onScreen: (): boolean => playing && !pauseMenu.isOpen });
  const perf: PerfReports = startPerfReports({ serverUrl: import.meta.env.VITE_SERVER_URL, build: import.meta.env.VITE_BUILD_ID, renderer: stage.renderer, world, touch: mobile.touch, tier: (): QualityName => mobile.quality.tier.name, graphics: (): GraphicsSettings => gameSettings.get().graphics, inPlay: (): boolean => playing && !elsewhere.replaced && !transition.blocking && !touch.lost && lobbyFlow?.active !== true });
  const debug: DebugHooks = attachDebug({ world, scene: stage.scene, renderer: stage.renderer, audio, sounds, camera, send });

  let playing: boolean = false;
  let lobbyFlow: LobbyFlow | null = null;
  let torchVersion: number = 0;
  let failed: boolean = false;
  let saveHeld: boolean = false;
  let watchCaptionView: WatchCaption | null = null;
  let hitStop: number = 0;
  let dirty: boolean = false;
  let urgent: boolean = false;
  let sinceSave: number = 0;
  let last: number = performance.now();

  const persist = (): void => {
    if (watching !== null || (!dirty && !urgent) || saveHeld) return;
    dirty = !backend.save(toSave(world), { urgent });
    urgent = false;
    sinceSave = 0;
  };
  const saveNow = (): void => {
    persist();
    backend.flush();
  };

  const leavePlay = (): LobbyFlow | null => {
    overlayManager.send({ type: 'interrupt', cause: 'lobby' });
    ladder?.setPlaying(false);
    saveNow();
    perf.left();
    playing = false;
    markPlaying(document.body, false);
    quietBeds();
    releaseHeld();
    enter.textContent = 'Continue';
    titleBar.current = world.player.bar;
    drawTitleKeys();
    return lobbyFlow;
  };
  const presentScene = (events: readonly WorldEvent[]): void => {
    actors.handle(events, world);
    effects.handle(events, world);
    overlays.handle(events, world);
    glitches.handle(events);
    for (const event of events) playEvent(event);
    hitStop = Math.max(hitStop, effects.takeHitStop());
    if (changesSave(events)) {
      dirty = true;
      wantCarried();
    }
    if (urgentEvents(events)) urgent = true;
  };
  const present = (events: readonly WorldEvent[]): void => {
    presentScene(events);
    hud.handleEvents(events);
  };

  const preloadNearZones = (): void => {
    if (!mobile.quality.tier.preloadNearZones) return;
    preloadZones(loader, content, neighbourZones(content, world.zone)).catch((error: unknown): void => {
      warnInConsole(`Preloading the next zones failed: ${String(error)}`);
    });
  };

  const prepareNearZones = (): void => {
    for (const near of neighbourZones(content, world.zone)) prepareZone(content, near);
  };

  const showZone = async (events: readonly WorldEvent[]): Promise<BuiltZone> => {
    presentScene(events);
    effects.clear();
    particles.clear();
    markers.dispose();
    zoneView.dispose();
    const bodies: Promise<void> = loadNeeds(loader, content, dresser, library, zoneCharacterNeeds(content, world.zone, world.player.equipped, world.player.hero), loadGate).catch((error: unknown): void => {
      warnInConsole(`Loading the characters of ${world.zone.id} failed: ${String(error)}`);
    });
    const bodiesIn: Promise<void> = waitWithin(bodies, createBrowserTimers(), WARM_UP.bodiesWaitMs);
    zoneView = await buildZoneView(loader, content, world.zone, stage.scene, mobile.quality.tier.name);
    if (mobile.quality.tier.releaseOtherZones) releaseOtherZones(content, world.zone);
    preloadNearZones();
    markers = createPlaceMarkers(stage.scene, loader, content, world.zone, world);
    const markersReady: Promise<void> = settledMarkers(markers, warnInConsole);
    stage.setAmbience(world.zone.ambience);
    stage.setHeroLight(world.zone.heroLight);
    applyWeather(world.zone);
    zoneView.setGraphics(gameSettings.preset());
    effects.setTorches(zoneView.torches);
    torchVersion = zoneView.lightsVersion;
    await warmUpWithin(stage, stage.scene, stage.camera, [...actors.standIns(world.zone), ...loot.standIns(world), ...rain.standIns()], createBrowserTimers(), WARM_UP.zoneWaitMs, Promise.all([zoneView.ready, markersReady]).then((): void => undefined));
    prepareNearZones();
    startZoneAmbience();
    glitches.refresh();
    camera.snap(world.player.pos.x, world.player.pos.z, liftAt(world.zone, world.player.pos.x, world.player.pos.z));
    stage.follow(world.player.pos.x, world.player.pos.z, world.zone.floorHeight + liftAt(world.zone, world.player.pos.x, world.player.pos.z), 0);
    const hideWarm: () => void = effects.showWarm(world.player.pos.x, world.player.pos.z);
    stage.render();
    hideWarm();
    queue.length = 0;
    hitStop = 0;
    saveHeld = false;
    persist();
    return { ready: bodiesIn };
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
    const interval: number = last > 0 ? now - last : 0;
    const dt: number = Math.min(GAME.maxFrame, Math.max(0, (now - last) / 1000));
    if (last > 0) transition.frame(now - last);
    last = now;
    let events: WorldEvent[] = [];
    const gate: FrameGate = frameGate({ playing, blocking: transition.blocking, lost: touch.lost || elsewhere.replaced, menuOpen: pauseMenu.isOpen, hidden: HOST.pauseWhenHidden && document.hidden, presenting: transition.presenting, covered: lobbyFlow?.active === true, gpuQueued: stage.gpuQueued() });
    if (gate.present) {
      overlays.readHud(dt);
      objectiveMarker.readHud(dt);
    }
    const collected: Command[] = gate.collect ? [...input.collect(dt), ...touch.collect(dt)] : [];
    if (gate.queue && watching === null) queue.push(...collected);
    if (gate.step) {
      keeper.stepped();
      hitStop = Math.max(0, hitStop - dt);
      if (hitStop <= 0 && watching !== null) {
        events = watchTicks(watching, dt);
        watchCaptionView?.show(watchCaption(watching));
      }
      else if (hitStop <= 0) {
        let remaining: number = dt;
        while (remaining > 1e-5 && !events.some((event: WorldEvent): boolean => event.type === 'zone_changed')) {
          const step: number = Math.min(MAX_STEP, remaining);
          events = events.concat(stepWorld(world, queue.splice(0, queue.length), step));
          remaining -= step;
        }
      }
    }
    debug.record(events);
    hideout?.frame(dt, playing, world, gate.present);
    if (minter?.pump(world) === true) urgent = true;
    if (events.some((event: WorldEvent): boolean => event.type === 'zone_changed')) {
      const held: WorldEvent[] = events;
      saveHeld = true;
      transition.begin((): Promise<BuiltZone> => showZone(held), veilColour(content.zones, held), (): void => hud.handleEvents(held));
    } else {
      present(events);
      if (events.some((event: WorldEvent): boolean => event.type === 'waypoint_unlocked')) markers.use({ type: 'waypoint' });
    }

    const presentNow: boolean = gate.present && transition.presenting;
    if (presentNow) {
      const simDt: number = gate.step && hitStop <= 0 ? dt : 0;
      actors.sync(simDt, world, input.hoveredId);
      loot.sync(world);
      opening.update();
      journalCount?.update();
      camera.update(dt, world.player.pos.x, world.player.pos.z, liftAt(world.zone, world.player.pos.x, world.player.pos.z));
      effects.update(dt, world);
      ward.update(dt, world);
      stage.follow(world.player.pos.x, world.player.pos.z, world.zone.floorHeight + liftAt(world.zone, world.player.pos.x, world.player.pos.z), dt);
      setCutawayCompany(cutawayCompany({ x: world.player.pos.x, z: world.player.pos.z, floor: 0 }, world.monsters, (x: number, z: number): number => world.zone.floorHeight + liftAt(world.zone, x, z)));
      overlays.update(dt, world, input.hoveredId);
      weather.update(dt, world.player.pos.x, world.player.pos.z, glitchSettings.get().reduceFlashes);
      rain.update(dt, world.player.pos.x, world.player.pos.z, weather.flash, zoneView);
      zoneView.update(now / 1000, dt, world, { look: input.look, figure: figureGauge.measure(actors.hero(), now / 1000), flash: weather.flash });
      for (const sound of lifeSounds(zoneView.takeLifeEvents())) playCues(cuesForLife(audioDef, sound.event, sound.at));
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
    hurtVignette.show(effects.hurt);
    if (presentNow) glitches.update(now / 1000, dt, gate.queue && hitStop <= 0 && !transition.blocking ? dt : 0);
    perf.frame(now);
    if (lobbyFlow?.render(dt) !== true && gate.draw && !hud.coversScene()) {
      perf.beforeRender(now);
      stage.render();
      perf.afterRender();
      const moved: boolean = renderScale.fit(stage.renderer.getPixelRatio());
      if ((!transition.blocking && renderScale.observe({ intervalMs: interval, workMs: performance.now() - now })) || moved) stage.setRenderScale(renderScale.scale);
    }
    sinceSave += dt;
    if (urgent || sinceSave > GAME.saveEvery) persist();
  };
  window.addEventListener('resize', (): void => stage.resize());
  window.addEventListener('beforeunload', saveNow);
  const elsewhere: Elsewhere = watchElsewhere(element('hud', HTMLDivElement), pagePlay(), reloadPage);
  camera.snap(world.player.pos.x, world.player.pos.z, liftAt(world.zone, world.player.pos.x, world.player.pos.z));
  const keeper: FrameKeeper = keepFrames({
    hud: element('hud', HTMLDivElement),
    frame,
    fault: (error: unknown): void => {
      warnInConsole(`A frame failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      touch.fault();
    },
    inPlay: (): boolean => playing && !elsewhere.replaced && !transition.blocking && !touch.lost && lobbyFlow?.active !== true,
    hidden: saveNow,
    resumed: (): void => void (last = performance.now()),
    noted: (effect: WatchEffect): void => {
      if (effect !== 'clear') perf.note(effect);
    },
  });
  void warmUp(stage, stage.scene, stage.camera, [...actors.standIns(world.zone), ...loot.standIns(world), ...rain.standIns()], Promise.all([zoneView.ready, settledMarkers(markers, warnInConsole)]).then((): void => undefined)).then((): void => (!playing && !transition.blocking && lobbyFlow?.active !== true ? stage.render() : undefined));
  const loadTheRest = async (): Promise<void> => {
    await loadRemainingCharacters(loader, content, dresser, library, { timers: createBrowserTimers(), warn: warnInConsole }, loadGate);
    actors.refreshWear(world);
    await warmUp(stage, stage.scene, stage.camera, [...loot.standIns(world), ...(await loot.dropStandIns(world, browserPacer()))]);
    hud.warm();
  };
  wantCarried();

  status.classList.remove('failed');
  if (backend.freshStart()) statusLine.show(TITLE_NOTICES.freshStart);
  else if (backend.setAside()) statusLine.show(TITLE_NOTICES.setAside);
  else status.classList.add('quiet');
  const titleLoader: HTMLDivElement = element('title-loader', HTMLDivElement);
  prepareNearZones();
  await untilCycleEnds(titleLoader);
  titleLoader.classList.add('done');
  followSync(backend, showSync, readServerUrl(import.meta.env.VITE_SERVER_URL).kind === 'ok');
  const setBusy = (busy: boolean): void => {
    enter.disabled = busy;
    reset.disabled = busy;
  };
  if (account !== null) startKeepPrompt({ account, world, hud: element('hud', HTMLDivElement), lobby: element('lobby', HTMLDivElement), store: createBrowserStore(), setBusy, save: saveNow, cloud: (): boolean => backend.state() === 'cloud', inPlay: (): boolean => playing && !pauseMenu.isOpen && !transition.blocking, toTitle: (): void => void (playing ? leavePlay() : lobbyFlow)?.toTitle() });
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
    unlockAudio();
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
    hushBeds();
    await Promise.all([backend.reset(), fadePageOut()]);
    reloadPage();
  };
  reset.addEventListener('click', (): void => {
    void startOver();
  });
  const flow: LobbyFlow = createLobbyFlow({ tier: (): QualityName => mobile.quality.tier.name, restore: (): void => stage.resize(), showFps: (): boolean => gameSettings.get().graphics.showFps, qualityTier, root: element('lobby', HTMLDivElement), veil: element('lobby-veil', HTMLDivElement), title, hud: element('hud', HTMLDivElement), renderer: stage.renderer, content, library, loader, lobby, look: (): LobbyLook => pick.look(), view: (): SheetView => ({ name: heroName ?? readHeroName(createBrowserStore()), hero: lobbyHero(content, world.player, world.zone.name, readPlayed(createBrowserStore().read(PLAYED_KEY))), known: entered, heroes: pick.choice() }), enterColour: (): string => world.zone.ambience.background, begin: (): void => {
    entered = true;
    begin();
  }, ready: (): Promise<void> => effects.ready, startOver: (): void => void startOver(), characters: { serverUrl: import.meta.env.VITE_SERVER_URL, persist, hold: (held: boolean): void => void (saveHeld = held), flush: (): void => backend.flush(), level: (): number | null => (entered ? world.player.level : null), hero: (): string | null => pick.chosen }, chooseHero: (id: string): void => void pick.choose(id), previewHero: (id: string | null): void => void pick.preview(id), openSettings: (): void => pauseMenu.open('graphics'), openFeedback: launch.feedback, bed: lobbyBed });
  lobbyFlow = flow;
  whenIdle((): void => void flow.warm());
  const openLobby = (): void => void flow.open();
  if (watching !== null) {
    watchCaptionView = createWatchCaption(element('hud', HTMLDivElement));
    entered = true;
    begin();
  }
  wireEnter({ enter, begin: openLobby, failed: (): boolean => failed, step: createNameStep({ card: enter.parentElement ?? title, enter, lobby, fresh: save === null, store: createBrowserStore(), body: (): ReturnType<HeroPick['body']> => pick.body(), suggester: createBrowserSuggester(import.meta.env.VITE_SERVER_URL), begin: openLobby }) });
}

document.documentElement.dataset['boot'] = RETRY.started;
runStart(start, (): void => {
  titleLines.current?.freeze();
});
