import type { Scene } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadContent } from '../sim/content/content.ts';
import type { Content } from '../sim/content/types.ts';
import { baseOf } from '../sim/items.ts';
import type { SaveData } from '../sim/save.ts';
import { parseSaveText, toSave } from '../sim/save.ts';
import { createWorld } from '../sim/world/create.ts';
import { MAX_STEP, stepWorld } from '../sim/world/step.ts';
import type { Command, ItemInstance, World, WorldEvent } from '../sim/world/types.ts';
import { createHud } from './hud/hud.ts';
import type { Hud } from './hud/hud-api.ts';
import type { Input } from './input.ts';
import { createInput } from './input.ts';
import type { Actors } from './render/actors.ts';
import { createActors } from './render/actors.ts';
import type { ArenaView } from './render/arena-view.ts';
import { buildArena } from './render/arena-view.ts';
import type { CharacterLibrary } from './render/character-loader.ts';
import { loadCharacters } from './render/character-loader.ts';
import type { Effects } from './render/effects.ts';
import { createEffects } from './render/effects.ts';
import type { IsoCamera } from './render/iso-camera.ts';
import { createIsoCamera } from './render/iso-camera.ts';
import type { ItemThumbnails } from './render/item-thumbnails.ts';
import { createItemThumbnails } from './render/item-thumbnails.ts';
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
import { clearSave, readSaveText, writeSave } from './storage.ts';

const GAME = {
  maxFrame: 0.1,
  saveEvery: 2,
} as const;

const SAVE_EVENTS: ReadonlySet<WorldEvent['type']> = new Set<WorldEvent['type']>(['character_changed', 'level_up', 'pickup', 'surge', 'xp']);

export interface DebugHandle {
  readonly world: World;
  readonly scene: Scene;
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

async function start(): Promise<void> {
  const canvas: HTMLCanvasElement = element('scene', HTMLCanvasElement);
  const title: HTMLDivElement = element('title', HTMLDivElement);
  const status: HTMLParagraphElement = element('title-status', HTMLParagraphElement);
  const enter: HTMLButtonElement = element('title-enter', HTMLButtonElement);
  const reset: HTMLButtonElement = element('title-reset', HTMLButtonElement);
  const vignette: HTMLDivElement = element('vignette', HTMLDivElement);

  const content: Content = loadContent();
  const save: SaveData | null = parseSaveText(content, readSaveText());
  const stage: Stage = createStage(canvas);
  const camera: IsoCamera = createIsoCamera(stage.camera, canvas);
  const loader: GLTFLoader = new GLTFLoader();

  const [library, arena]: [CharacterLibrary, ArenaView] = await Promise.all([loadCharacters(loader, content), buildArena(loader, content, stage.scene)]);
  const loot: LootView = await createLootView(loader, stage.scene, library);
  const thumbnails: ItemThumbnails = createItemThumbnails(library);

  const world: World = createWorld(content, { seed: Date.now() >>> 0, save });
  const queue: Command[] = [];
  const send = (command: Command): void => {
    queue.push(command);
  };
  const particles: ParticleSystem = createParticles(stage.scene);
  const weather: Weather = createWeather();
  const effects: Effects = createEffects(stage.scene, particles, camera, arena.torches, (power: number): void => weather.strike(power));
  const actors: Actors = createActors(stage.scene, library, world);
  const itemImage = (item: ItemInstance): string | null => {
    const visual: string | null = baseOf(content, item)?.visual ?? null;
    return visual === null ? null : (thumbnails.get(visual) ?? null);
  };
  const hud: Hud = createHud(element('hud', HTMLDivElement), { world, send, itemImage });
  const overlays: Overlays = createOverlays(element('overlays', HTMLDivElement), camera, (id: number): number => actors.heightOf(id), (groundId: number): void => send({ type: 'pickup', groundId }));
  const input: Input = createInput(canvas, world, camera, hud, {
    heightOf: (id: number): number => actors.heightOf(id),
    clickMarker: (x: number, z: number, hostile: boolean): void => effects.clickMarker(x, z, hostile),
  });
  if (import.meta.env.DEV) window.storm = { world, scene: stage.scene, send };

  let playing: boolean = false;
  let hitStop: number = 0;
  let dirty: boolean = false;
  let sinceSave: number = 0;
  let last: number = performance.now();

  const persist = (): void => {
    if (!dirty) return;
    dirty = !writeSave(toSave(world));
    sinceSave = 0;
  };

  const frame = (now: number): void => {
    const dt: number = Math.min(GAME.maxFrame, Math.max(0, (now - last) / 1000));
    last = now;
    let events: WorldEvent[] = [];
    if (playing) {
      queue.push(...input.collect(dt));
      hitStop = Math.max(0, hitStop - dt);
      if (hitStop <= 0) {
        let remaining: number = dt;
        while (remaining > 1e-5) {
          const step: number = Math.min(MAX_STEP, remaining);
          events = events.concat(stepWorld(world, queue.splice(0, queue.length), step));
          remaining -= step;
        }
      }
    }
    const simDt: number = playing && hitStop <= 0 ? dt : 0;
    actors.handle(events, world);
    effects.handle(events, world);
    overlays.handle(events, world);
    hud.handleEvents(events);
    hitStop = Math.max(hitStop, effects.takeHitStop());
    if (events.some((event: WorldEvent): boolean => SAVE_EVENTS.has(event.type))) dirty = true;

    actors.sync(simDt, world, input.hoveredId);
    loot.sync(world);
    camera.update(dt, world.player.pos.x, world.player.pos.z);
    effects.update(dt, world);
    particles.update(dt);
    weather.update(dt);
    arena.update(now / 1000);
    stage.follow(world.player.pos.x, world.player.pos.z);
    stage.setFlash(weather.flash);
    overlays.update(dt, world, input.hoveredId);
    hud.update(dt);
    vignette.style.setProperty('--hurt', effects.hurt.toFixed(3));
    stage.render();

    sinceSave += dt;
    if (sinceSave > GAME.saveEvery) persist();
    requestAnimationFrame(frame);
  };

  window.addEventListener('resize', (): void => stage.resize());
  window.addEventListener('beforeunload', persist);
  document.addEventListener('visibilitychange', (): void => {
    if (document.hidden) persist();
  });

  camera.snap(world.player.pos.x, world.player.pos.z);
  requestAnimationFrame(frame);

  status.classList.add('quiet');
  enter.disabled = false;
  enter.textContent = save === null ? 'Enter' : 'Continue';
  reset.hidden = save === null;
  enter.addEventListener('click', (): void => {
    title.classList.add('gone');
    playing = true;
  });
  reset.addEventListener('click', (): void => {
    dirty = false;
    clearSave();
    window.location.reload();
  });
}

start().catch((error: unknown): void => {
  const status: HTMLElement | null = document.getElementById('title-status');
  if (status !== null) status.textContent = error instanceof Error ? `The storm failed to gather: ${error.message}` : 'The storm failed to gather.';
  throw error;
});
