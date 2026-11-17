import { PerspectiveCamera, Plane, Raycaster, Vector3 } from 'three';
import type { Vector2 } from 'three';
import { loadContent } from '../sim/content/content.ts';
import type { Content } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { stepWorld } from '../sim/world/step.ts';
import type { Command, World } from '../sim/world/types.ts';
import type { KeyValueStore } from '../src/backend/backend.ts';
import type { Input, InputCamera, InputHooks, InputHud, InputSurface, KeySource } from '../src/input.ts';
import { createInput } from '../src/input.ts';
import { CAMERA } from '../src/render/iso-camera.ts';
import { cameraEye, TERRAIN_SIGHT } from '../src/render/terrain-sight.ts';
import type { FloorTest, PassThrough } from '../src/render/terrain-lift.ts';
import { liftAt, rayToFloor, rayToSurface } from '../src/render/terrain-lift.ts';
import type { SlotDefault } from '../src/settings/bindings.ts';
import type { SettingsStore } from '../src/settings/store.ts';
import { createSettingsStore } from '../src/settings/store.ts';

export const inputContent: Content = loadContent();
export const DT: number = 1 / 60;
export const VIEW = { size: 1000, span: 22 } as const;
export const SLOTS: readonly SlotDefault[] = [{ name: 'Cleave', bindings: ['mouse_left'] }];

export interface Rig {
  readonly world: World;
  readonly input: Input;
  readonly fire: (type: string, pointer?: Partial<FakePointer>) => void;
  readonly settings: SettingsStore;
  readonly focus: (field: EventTarget) => void;
}

export interface FakePointer {
  readonly button: number;
  readonly buttons: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly shiftKey: boolean;
  readonly code: string;
  readonly repeat: boolean;
}

type Heard = Map<string, EventListenerOrEventListenerObject[]>;

function hearing(heard: Heard): (type: string, listener: EventListenerOrEventListenerObject | null) => void {
  return (type: string, listener: EventListenerOrEventListenerObject | null): void => {
    if (listener !== null) heard.set(type, [...(heard.get(type) ?? []), listener]);
  };
}

function rect(): DOMRect {
  return { x: 0, y: 0, width: VIEW.size, height: VIEW.size, top: 0, left: 0, right: VIEW.size, bottom: VIEW.size, toJSON: (): null => null };
}

export interface PlayerHooks {
  readonly at: string | null;
  readonly takes: (id: string | null) => boolean;
  readonly pressed: (string | null)[];
  readonly hovered: (string | null)[];
}

export function noPlayers(): PlayerHooks {
  return { at: null, takes: (): boolean => false, pressed: [], hovered: [] };
}

export function rig(world: World, overUi: () => boolean = (): boolean => false, players: PlayerHooks = noPlayers(), label: () => number | null = (): number | null => null, slots: readonly SlotDefault[] = SLOTS, lens: InputCamera | null = null): Rig {
  const heard: Heard = new Map<string, EventListenerOrEventListenerObject[]>();
  const canvas: InputSurface = { addEventListener: hearing(heard), getBoundingClientRect: rect, setPointerCapture: (): void => undefined, style: { cursor: 'default' } };
  const keys: KeySource = { addEventListener: hearing(heard) };
  const fire = (type: string, pointer: Partial<FakePointer> = {}): void => {
    const event: Event = Object.assign(new Event(type), { button: -1, buttons: 0, clientX: 0, clientY: 0, pointerId: 1, pointerType: 'mouse', shiftKey: false, code: '', repeat: false }, pointer);
    for (const listener of heard.get(type) ?? []) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  };
  const camera: InputCamera = lens ?? {
    groundPoint: (pointer: Vector2): Vector3 => new Vector3(world.player.pos.x + pointer.x * VIEW.span, 0, world.player.pos.z - pointer.y * VIEW.span),
    project: (): boolean => false,
    zoomBy: (): void => undefined,
  };
  const hud: InputHud = { isPointerOverUi: overUi, closePanels: (): boolean => false, togglePanel: (): void => undefined, requestMap: (): void => undefined, readInput: (): void => undefined };
  const store: KeyValueStore = { read: (): null => null, write: (): boolean => true, remove: (): void => undefined };
  const settings: SettingsStore = createSettingsStore(store, slots, { flasks: 0, ladder: false });
  const hooks: InputHooks = { heightOf: (): number => 1.8, boundsOf: (): boolean => false, labelHover: label, clickMarker: (): void => undefined, aimPlace: (): void => undefined, placeAt: (): null => null, usePlace: (): void => undefined, aimItem: (): void => undefined,
    playerAt: (): string | null => players.at,
    hoverPlayer: (id: string | null): void => {
      players.hovered.push(id);
    },
    pressPlayer: (id: string | null): boolean => {
      players.pressed.push(id);
      return players.takes(id);
    },
    pause: (): void => undefined,
  };
  const focus = (field: EventTarget): void => {
    for (const listener of heard.get('focusin') ?? []) field.addEventListener('focusin', listener);
    field.dispatchEvent(new Event('focusin'));
  };
  return { world, input: createInput(canvas, keys, world, camera, hud, settings, hooks), fire, settings, focus };
}

export function heroCamera(world: World): InputCamera {
  const view: PerspectiveCamera = new PerspectiveCamera(CAMERA.fov, 1, TERRAIN_SIGHT.near, TERRAIN_SIGHT.far);
  const raycaster: Raycaster = new Raycaster();
  const plane: Plane = new Plane(new Vector3(0, 1, 0), 0);
  const hit: Vector3 = new Vector3();
  const projected: Vector3 = new Vector3();
  const place = (): void => {
    const { x, z } = world.player.pos;
    view.position.copy(cameraEye(world.zone, x, z));
    view.lookAt(x, liftAt(world.zone, x, z) + CAMERA.lookHeight, z);
    view.updateMatrixWorld(true);
  };
  const aimAt = (pointer: Vector2): Raycaster => {
    place();
    raycaster.setFromCamera(pointer, view);
    return raycaster;
  };
  return {
    groundPoint(pointer: Vector2, heightOf?: (x: number, z: number) => number, through: PassThrough | null = null, isFloor: FloorTest | null = null): Vector3 | null {
      const { ray } = aimAt(pointer);
      if (heightOf !== undefined) return isFloor === null ? rayToSurface(ray, heightOf, hit, through) : rayToFloor(ray, heightOf, isFloor, hit, through);
      return ray.intersectPlane(plane, hit);
    },
    project(x: number, y: number, z: number, out: Vector2): boolean {
      place();
      projected.set(x, y, z).project(view);
      out.set((projected.x * 0.5 + 0.5) * VIEW.size, (-projected.y * 0.5 + 0.5) * VIEW.size);
      return projected.z > -1 && projected.z < 1;
    },
    zoomBy: (): void => undefined,
  };
}

export function screenOf(world: World, ground: Vec2): Vec2 {
  const ndc: Vec2 = { x: (ground.x - world.player.pos.x) / VIEW.span, z: -(ground.z - world.player.pos.z) / VIEW.span };
  return { x: ((ndc.x + 1) / 2) * VIEW.size, z: ((1 - ndc.z) / 2) * VIEW.size };
}

export function run(setup: Rig, seconds: number, done: () => boolean, extra: () => readonly Command[] = (): readonly Command[] => []): void {
  for (let clock: number = 0; clock < seconds && !done(); clock += DT) stepWorld(setup.world, [...setup.input.collect(DT), ...extra()], DT);
}

export const LEFT = { button: 0, bit: 1 } as const;
export const RIGHT = { button: 2, bit: 2 } as const;

export function at(point: Vec2, button: number, buttons: number): Partial<FakePointer> {
  return { clientX: point.x, clientY: point.z, button, buttons };
}

export function clickOn(setup: Rig, point: Vec2): Command[] {
  setup.fire('pointermove', at(point, -1, 0));
  setup.fire('pointerdown', at(point, LEFT.button, LEFT.bit));
  const commands: Command[] = setup.input.collect(DT);
  setup.fire('pointerup', at(point, LEFT.button, 0));
  return [...commands, ...setup.input.collect(DT)];
}

export function floorAhead(world: World): Vec2 {
  return screenOf(world, { x: world.player.pos.x + 3, z: world.player.pos.z + 3 });
}
