import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Vector3 } from 'three';
import type { Vector2 } from 'three';
import { must, worldIn, zoneOf } from '../test/support.ts';
import { loadContent } from '../sim/content/content.ts';
import type { Content, ZoneExit } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { createWorld } from '../sim/world/create.ts';
import { stepWorld } from '../sim/world/step.ts';
import type { Command, EncounterState, World } from '../sim/world/types.ts';
import { wakeLength } from '../sim/world/wake.ts';
import { enterZone } from '../sim/world/zones.ts';
import type { KeyValueStore } from './backend/backend.ts';
import type { Input, InputCamera, InputHooks, InputHud, InputSurface, KeySource } from './input.ts';
import { createInput } from './input.ts';
import { stickMove } from './mobile/touch-map.ts';
import type { SlotDefault } from './settings/bindings.ts';
import type { SettingsStore } from './settings/store.ts';
import { createSettingsStore } from './settings/store.ts';

void test('pointer presses become world input only on the canvas, so a click on the HUD never moves the hero', (): void => {
  const source: string = readFileSync('src/input.ts', 'utf8');
  const listeners: string[] = [...source.matchAll(/(\w+)\.addEventListener\(\s*'(pointer\w+|mouse\w+|click|touch\w+)'/g)].map((match: RegExpExecArray): string => `${match[1] ?? ''}.${match[2] ?? ''}`);
  assert.ok(listeners.includes('canvas.pointerdown'));
  for (const listener of listeners) assert.ok(listener.startsWith('canvas.'), `${listener} listens outside the canvas`);
});

const content: Content = loadContent();
const DT: number = 1 / 60;
const VIEW = { size: 1000, span: 22 } as const;
const SLOTS: readonly SlotDefault[] = [{ name: 'Cleave', bindings: ['mouse_left'] }];

interface Rig {
  readonly world: World;
  readonly input: Input;
}

function rect(): DOMRect {
  return { x: 0, y: 0, width: VIEW.size, height: VIEW.size, top: 0, left: 0, right: VIEW.size, bottom: VIEW.size, toJSON: (): null => null };
}

function rig(world: World): Rig {
  const canvas: InputSurface = { addEventListener: (): void => undefined, getBoundingClientRect: rect, setPointerCapture: (): void => undefined, style: { cursor: 'default' } };
  const keys: KeySource = { addEventListener: (): void => undefined };
  const camera: InputCamera = {
    groundPoint: (pointer: Vector2): Vector3 => new Vector3(world.player.pos.x + pointer.x * VIEW.span, 0, world.player.pos.z - pointer.y * VIEW.span),
    project: (): boolean => false,
    rayDistanceTo: (): number => Infinity,
    zoomBy: (): void => undefined,
  };
  const hud: InputHud = { isPointerOverUi: (): boolean => false, closePanels: (): boolean => false, togglePanel: (): void => undefined, requestMap: (): void => undefined };
  const store: KeyValueStore = { read: (): null => null, write: (): boolean => true, remove: (): void => undefined };
  const settings: SettingsStore = createSettingsStore(store, SLOTS, { flasks: 0, ladder: false });
  const hooks: InputHooks = { heightOf: (): number => 1.8, boundsOf: (): boolean => false, labelHover: (): null => null, clickMarker: (): void => undefined, aimExit: (): void => undefined, aimItem: (): void => undefined, pause: (): void => undefined };
  return { world, input: createInput(canvas, keys, world, camera, hud, settings, hooks) };
}

function screenOf(world: World, ground: Vec2): Vec2 {
  const ndc: Vec2 = { x: (ground.x - world.player.pos.x) / VIEW.span, z: -(ground.z - world.player.pos.z) / VIEW.span };
  return { x: ((ndc.x + 1) / 2) * VIEW.size, z: ((1 - ndc.z) / 2) * VIEW.size };
}

function run(setup: Rig, seconds: number, done: () => boolean, extra: () => readonly Command[] = (): readonly Command[] => []): void {
  for (let clock: number = 0; clock < seconds && !done(); clock += DT) stepWorld(setup.world, [...setup.input.collect(DT), ...extra()], DT);
}

function voidWithLight(seed: number): World {
  const world: World = createWorld(content, { seed, save: null, opening: true });
  const wake = must(world.wake, 'wake');
  for (let step: number = 0; step < Math.ceil(wakeLength(wake.plan) / DT) + 1; step += 1) stepWorld(world, [], DT);
  Object.assign(world.flags, { opening: 'read', first_choice: 'took_journal', first_blade: 'found' });
  for (let clock: number = 0; clock < 90 && !world.encounters.some((state: EncounterState): boolean => state.pos !== null); clock += DT) {
    stepWorld(world, [{ type: 'move', held: true, dest: { x: world.player.pos.x + world.heading.x * 6, z: world.player.pos.z + world.heading.z * 6 } }], DT);
  }
  stepWorld(world, [{ type: 'stop' }], DT);
  return world;
}

function lightOf(world: World): ZoneExit {
  return must(world.zone.exits[0], 'light exit');
}

function arrivedBy(zoneId: string, exitId: string): World {
  const world: World = worldIn(content, zoneId, 5);
  enterZone(world, zoneOf(content, zoneId), { type: 'exit', exit: exitId });
  world.events = [];
  return world;
}

function toward(from: Vec2, to: Vec2, metres: number): Vec2 {
  const gap: number = Math.hypot(to.x - from.x, to.z - from.z);
  return { x: from.x + ((to.x - from.x) / gap) * metres, z: from.z + ((to.z - from.z) / gap) * metres };
}

void test('holding the pointer still, far ahead toward the light, walks the hero into it and through, though the ground under the pointer comes to rest on the light', (): void => {
  const world: World = voidWithLight(11);
  const setup: Rig = rig(world);
  const from: string = world.zone.id;
  const point: Vec2 = screenOf(world, toward(world.player.pos, lightOf(world), VIEW.span * 0.7));
  setup.input.holdAt(point.x, point.z);
  run(setup, 60, (): boolean => world.zone.id !== from);
  assert.notEqual(world.zone.id, from);
});

void test('a held pointer dragged across the light and resting on it carries the hero through', (): void => {
  const world: World = voidWithLight(12);
  const setup: Rig = rig(world);
  const from: string = world.zone.id;
  const start: Vec2 = screenOf(world, toward(world.player.pos, lightOf(world), 3));
  setup.input.holdAt(start.x, start.z);
  run(setup, 0.3, (): boolean => false);
  const onLight: Vec2 = screenOf(world, lightOf(world));
  setup.input.moveHold(onLight.x, onLight.z);
  run(setup, 60, (): boolean => world.zone.id !== from);
  assert.notEqual(world.zone.id, from);
});

void test('a tap on the ground inside the light travels', (): void => {
  const world: World = voidWithLight(13);
  const setup: Rig = rig(world);
  const from: string = world.zone.id;
  const inside: Vec2 = screenOf(world, toward(lightOf(world), world.player.pos, lightOf(world).radius * 0.5));
  setup.input.tap(inside.x, inside.z);
  run(setup, 60, (): boolean => world.zone.id !== from);
  assert.notEqual(world.zone.id, from);
});

void test('the stick held toward the light walks the hero through it', (): void => {
  const world: World = voidWithLight(14);
  const setup: Rig = rig(world);
  const from: string = world.zone.id;
  let moving: boolean = false;
  run(setup, 60, (): boolean => world.zone.id !== from, (): readonly Command[] => {
    const light: ZoneExit = lightOf(world);
    const gap: number = Math.hypot(light.x - world.player.pos.x, light.z - world.player.pos.z);
    const command = stickMove(world.player.pos, { x: (light.x - world.player.pos.x) / gap, z: (light.z - world.player.pos.z) / gap }, moving);
    moving = true;
    return command === null ? [] : [command];
  });
  assert.notEqual(world.zone.id, from);
});

void test('every zone exit travels by a held pointer resting on it and by a click on it', (): void => {
  const exits: readonly { readonly zone: string; readonly exit: string }[] = [
    { zone: 'hall_of_time', exit: 'mist' },
    { zone: 'hall_of_time', exit: 'east' },
    { zone: 'hideout', exit: 'west' },
  ];
  for (const { zone, exit } of exits) {
    for (const press of ['held', 'click'] as const) {
      const world: World = arrivedBy(zone, exit);
      const setup: Rig = rig(world);
      const target: ZoneExit = must(world.zone.exits.find((entry: ZoneExit): boolean => entry.id === exit), exit);
      const point: Vec2 = screenOf(world, target);
      if (press === 'held') setup.input.holdAt(point.x, point.z);
      else setup.input.tap(point.x, point.z);
      run(setup, 30, (): boolean => world.zone.id !== zone);
      assert.equal(world.zone.id, target.to, `${press} on ${zone}.${exit}`);
    }
  }
});

void test('a held walk across the waypoint keeps walking past it', (): void => {
  const world: World = worldIn(content, 'hideout', 6);
  const mark = must(world.zone.waypoint, 'waypoint');
  const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const gap: number = Math.hypot(mark.x - start.x, mark.z - start.z);
  const dir: Vec2 = { x: (mark.x - start.x) / gap, z: (mark.z - start.z) / gap };
  const setup: Rig = rig(world);
  const point: Vec2 = screenOf(world, toward(world.player.pos, mark, 5));
  setup.input.holdAt(point.x, point.z);
  const along = (): number => (world.player.pos.x - start.x) * dir.x + (world.player.pos.z - start.z) * dir.z;
  run(setup, 30, (): boolean => along() > gap + 2);
  assert.ok(along() > gap + 2, `stopped ${(gap - along()).toFixed(2)} m short of the waypoint`);
});
