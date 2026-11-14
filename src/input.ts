import type { Box3 as Box3Type } from 'three';
import { Box3, Vector2, Vector3 } from 'three';
import type { ZoneExit } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { exitUnder } from '../sim/world/exits.ts';
import { aimedItem } from '../sim/world/finds.ts';
import { readyToRepeat } from '../sim/world/skills.ts';
import { stationNear } from '../sim/world/trade.ts';
import { chestNear, chestSpot } from '../sim/world/moment-chest.ts';
import type { Station } from '../sim/world/trade.ts';
import type { Command, GroundItem, MomentState, MonsterState, NpcState, World } from '../sim/world/types.ts';
import { waypointAt } from '../sim/world/waypoints.ts';
import type { Hud } from './hud/hud-api.ts';
import type { PickCandidate, ScreenRect } from './pick.ts';
import { pickActor } from './pick.ts';
import { exitPress } from './exit-press.ts';
import type { ItemPress } from './item-press.ts';
import { itemPress } from './item-press.ts';
import type { IsoCamera } from './render/iso-camera.ts';
import type { ActionId } from './settings/bindings.ts';
import { flaskAction, slotAction } from './settings/bindings.ts';
import type { SettingsStore } from './settings/store.ts';
import type { SurfaceRect } from './surface-rect.ts';
import { surfaceRect } from './surface-rect.ts';

export const INPUT = {
  holdInterval: 0.09,
  leftBinding: 'mouse_left',
  rightBinding: 'mouse_right',
  closeKey: 'Escape',
  advanceKeys: ['Space', 'Enter'],
} as const;

export interface InputHooks {
  heightOf(actorId: number): number;
  boundsOf(actorId: number, out: Box3Type): boolean;
  labelHover(): number | null;
  clickMarker(x: number, z: number, hostile: boolean): void;
  aimExit(exit: string | null): void;
  aimItem(groundId: number | null): void;
  playerAt(x: number, y: number): string | null;
  hoverPlayer(id: string | null): void;
  pressPlayer(id: string | null): boolean;
  pause(): void;
}

export interface Input {
  collect(dt: number): Command[];
  tap(clientX: number, clientY: number): void;
  holdAt(clientX: number, clientY: number): void;
  moveHold(clientX: number, clientY: number): void;
  releaseHold(): void;
  readonly hoveredId: number | null;
  readonly look: Vec2 | null;
}

export interface InputSurface {
  readonly addEventListener: HTMLCanvasElement['addEventListener'];
  getBoundingClientRect(): DOMRect;
  setPointerCapture(pointerId: number): void;
  readonly style: { cursor: string };
}

export interface KeySource {
  readonly addEventListener: Window['addEventListener'];
}

export type InputCamera = Pick<IsoCamera, 'groundPoint' | 'project' | 'rayDistanceTo' | 'zoomBy'>;

export type InputHud = Pick<Hud, 'isPointerOverUi' | 'closePanels' | 'togglePanel' | 'requestMap'>;

export function createInput(canvas: InputSurface, windowEvents: KeySource, world: World, camera: InputCamera, hud: InputHud, settings: SettingsStore, hooks: InputHooks): Input {
  const pointer: Vector2 = new Vector2(0, 0);
  const bottom: Vector3 = new Vector3();
  const box: Box3 = new Box3();
  const corner: Vector2 = new Vector2();
  const held: Set<string> = new Set<string>();
  const pressed: string[] = [];
  const lifted: string[] = [];
  let hoveredId: number | null = null;
  let pointerInside: boolean = false;
  let mouse: boolean = false;
  let look: Vec2 | null = null;
  let holdTimer: number = 0;
  let shift: boolean = false;
  let tapping: boolean = false;
  let pressedItem: boolean = false;
  let pressedExit: string | null = null;
  let pressedPlayer: boolean = false;
  const extra: Command[] = [];
  const canvasRect: SurfaceRect = surfaceRect(canvas);

  const slotFor = (binding: string): number => world.content.player.skillBar.findIndex((_entry, slot: number): boolean => settings.keys().bindingsOf(slotAction(slot)).includes(binding));

  const press = (binding: string): void => {
    if (held.has(binding)) return;
    held.add(binding);
    pressed.push(binding);
  };

  const trackPoint = (clientX: number, clientY: number): void => {
    const rect: DOMRect = canvasRect.read();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  };
  const track = (event: PointerEvent | WheelEvent): void => {
    trackPoint(event.clientX, event.clientY);
  };

  canvas.addEventListener('pointerdown', (event: PointerEvent): void => {
    track(event);
    shift = event.shiftKey;
    canvas.setPointerCapture(event.pointerId);
    if (event.button === 0) press(INPUT.leftBinding);
    if (event.button === 2) press(INPUT.rightBinding);
  });
  canvas.addEventListener('pointermove', (event: PointerEvent): void => {
    track(event);
    mouse = event.pointerType === 'mouse';
    shift = event.shiftKey;
    pointerInside = true;
  });
  canvas.addEventListener('pointerenter', (): void => {
    canvasRect.stale();
  });
  windowEvents.addEventListener('resize', (): void => {
    canvasRect.stale();
  });
  canvas.addEventListener('pointerleave', (): void => {
    pointerInside = false;
  });
  const lift = (binding: string): void => {
    if (!held.delete(binding)) return;
    lifted.push(binding);
  };
  const release = (event: PointerEvent): void => {
    if (event.button === 0) lift(INPUT.leftBinding);
    if (event.button === 2) lift(INPUT.rightBinding);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', (event: MouseEvent): void => event.preventDefault());
  canvas.addEventListener(
    'wheel',
    (event: WheelEvent): void => {
      event.preventDefault();
      camera.zoomBy(event.deltaY);
    },
    { passive: false },
  );
  windowEvents.addEventListener('keydown', (event: KeyboardEvent): void => {
    shift = event.shiftKey;
    if (event.repeat) return;
    const action: ActionId | null = settings.keys().actionOf(event.code);
    if (event.code === INPUT.closeKey) {
      if (hud.closePanels()) return;
      if (world.dialogue !== null) extra.push({ type: 'stop' });
      else hooks.pause();
    }
    else if (action === 'inventory') hud.togglePanel('inventory');
    else if (action === 'character') hud.togglePanel('character');
    else if (action === 'tree') hud.togglePanel('tree');
    else if (action === 'map') hud.togglePanel('map');
    else if (action === 'pause') hooks.pause();
    else if (action === 'frameRate') {
      event.preventDefault();
      settings.setShowFps(!settings.get().graphics.showFps);
    }
    else press(event.code);
  });
  windowEvents.addEventListener('keyup', (event: KeyboardEvent): void => {
    shift = event.shiftKey;
    lift(event.code);
  });
  windowEvents.addEventListener('blur', (): void => {
    for (const binding of held) lifted.push(binding);
    held.clear();
    shift = false;
  });

  const screenRect = (id: number): ScreenRect | null => {
    if (!hooks.boundsOf(id, box)) return null;
    let minX: number = Infinity;
    let minY: number = Infinity;
    let maxX: number = -Infinity;
    let maxY: number = -Infinity;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          if (!camera.project(x, y, z, corner)) continue;
          minX = Math.min(minX, corner.x);
          minY = Math.min(minY, corner.y);
          maxX = Math.max(maxX, corner.x);
          maxY = Math.max(maxY, corner.y);
        }
      }
    }
    return minX > maxX ? null : { minX, minY, maxX, maxY };
  };

  const candidateFor = (kind: PickCandidate['kind'], id: number, x: number, z: number): PickCandidate => {
    bottom.set(x, 0, z);
    const body: ScreenRect | null = screenRect(id);
    return { id, kind, body, footGap: camera.rayDistanceTo(pointer, bottom, 0), depth: body === null ? 0 : -body.maxY };
  };

  const pickActors = (): PickCandidate | null => {
    const labelId: number | null = hooks.labelHover();
    if (hud.isPointerOverUi()) return null;
    if (!pointerInside) {
      const labelled: NpcState | undefined = world.npcs.find((npc: NpcState): boolean => npc.id === labelId);
      return labelled === undefined ? null : candidateFor('npc', labelled.id, labelled.pos.x, labelled.pos.z);
    }
    const rect: DOMRect = canvasRect.read();
    const point = { x: ((pointer.x + 1) / 2) * rect.width, y: ((1 - pointer.y) / 2) * rect.height };
    const candidates: PickCandidate[] = [];
    for (const monster of world.monsters) {
      if (monster.alive) candidates.push(candidateFor('monster', monster.id, monster.pos.x, monster.pos.z));
    }
    for (const npc of world.npcs) candidates.push(candidateFor('npc', npc.id, npc.pos.x, npc.pos.z));
    return pickActor(candidates, point, labelId);
  };

  const playerAt = (): string | null => {
    if (!pointerInside || hud.isPointerOverUi()) return null;
    const rect: DOMRect = canvasRect.read();
    return hooks.playerAt(((pointer.x + 1) / 2) * rect.width, ((1 - pointer.y) / 2) * rect.height);
  };

  const exitAt = (ground: Vec2 | null): ZoneExit | null => {
    if (ground === null || !pointerInside || hud.isPointerOverUi()) return null;
    return exitUnder(world, ground);
  };

  const itemAt = (ground: Vec2 | null): GroundItem | null => {
    if (ground === null || !pointerInside || hud.isPointerOverUi()) return null;
    return aimedItem(world, ground);
  };

  const onWaypointMark = (ground: Vec2 | null): boolean => {
    const waypoint = world.zone.waypoint;
    if (ground === null || waypoint === null || !pointerInside || hud.isPointerOverUi()) return false;
    return waypointAt(world, ground);
  };

  const chestAt = (ground: Vec2 | null): MomentState | null => {
    if (ground === null || !pointerInside || hud.isPointerOverUi()) return null;
    return chestNear(world, ground);
  };

  const stationAt = (ground: Vec2 | null): Station | null => {
    if (ground === null || !pointerInside || hud.isPointerOverUi()) return null;
    return stationNear(world, ground);
  };

  return {
    get hoveredId(): number | null {
      return hoveredId;
    },
    get look(): Vec2 | null {
      return look;
    },
    tap(clientX: number, clientY: number): void {
      trackPoint(clientX, clientY);
      pointerInside = true;
      tapping = true;
      shift = false;
      pressed.push(INPUT.leftBinding);
      lifted.push(INPUT.leftBinding);
    },
    holdAt(clientX: number, clientY: number): void {
      trackPoint(clientX, clientY);
      pointerInside = true;
      shift = false;
      press(INPUT.leftBinding);
    },
    moveHold(clientX: number, clientY: number): void {
      trackPoint(clientX, clientY);
    },
    releaseHold(): void {
      lift(INPUT.leftBinding);
      if (pressed.includes(INPUT.leftBinding)) tapping = true;
      else pointerInside = false;
    },
    collect(dt: number): Command[] {
      const commands: Command[] = extra.splice(0, extra.length);
      const picked: PickCandidate | null = pickActors();
      const target: MonsterState | null = picked?.kind === 'monster' ? (world.monsters.find((monster: MonsterState): boolean => monster.id === picked.id) ?? null) : null;
      const person: NpcState | null = picked?.kind === 'npc' ? (world.npcs.find((npc: NpcState): boolean => npc.id === picked.id) ?? null) : null;
      hoveredId = target?.id ?? person?.id ?? null;
      const other: string | null = target === null && person === null ? playerAt() : null;
      hooks.hoverPlayer(other);
      const groundHit: Vector3 | null = camera.groundPoint(pointer);
      const ground: Vec2 | null = groundHit === null ? null : { x: groundHit.x, z: groundHit.z };
      look = mouse && pointerInside ? ground : null;
      const item: GroundItem | null = target === null && person === null && other === null ? itemAt(ground) : null;
      hooks.aimItem(item?.id ?? null);
      const exit: ZoneExit | null = target === null && person === null && other === null && item === null ? exitAt(ground) : null;
      hooks.aimExit(exit?.id ?? null);
      const chest: MomentState | null = target === null && person === null && item === null && exit === null ? chestAt(ground) : null;
      const station: Station | null = target === null && person === null && item === null && exit === null && chest === null ? stationAt(ground) : null;
      const marked: boolean = target === null && person === null && item === null && exit === null && chest === null && station === null && onWaypointMark(ground);
      if (tapping) {
        tapping = false;
        pointerInside = false;
      }
      canvas.style.cursor = target !== null ? 'crosshair' : item !== null || exit !== null || person !== null || other !== null || chest !== null || station !== null || marked ? 'pointer' : 'default';
      const aim: Vec2 | null = target === null ? ground : { x: target.pos.x, z: target.pos.z };
      const fresh: Set<string> = new Set<string>(pressed.splice(0, pressed.length));
      const up: Set<string> = new Set<string>(lifted.splice(0, lifted.length));
      if (fresh.has(INPUT.leftBinding) && !shift && world.dialogue === null && hooks.pressPlayer(other)) {
        fresh.delete(INPUT.leftBinding);
        pressedPlayer = true;
      }
      if (pressedPlayer && !held.has(INPUT.leftBinding)) {
        pressedPlayer = false;
        up.delete(INPUT.leftBinding);
      }
      world.content.player.skillBar.forEach((_entry, slot: number): void => {
        const bound: readonly string[] = settings.keys().bindingsOf(slotAction(slot));
        if (bound.some((binding: string): boolean => fresh.has(binding))) commands.push({ type: 'hold', slot, down: true });
        if (bound.some((binding: string): boolean => up.has(binding)) && !bound.some((binding: string): boolean => held.has(binding))) commands.push({ type: 'hold', slot, down: false });
      });
      holdTimer -= dt;
      const holdTick: boolean = holdTimer <= 0;
      if (holdTick) holdTimer = INPUT.holdInterval;
      if (world.dialogue !== null) {
        if (fresh.has(INPUT.leftBinding) || INPUT.advanceKeys.some((key: string): boolean => fresh.has(key))) commands.push({ type: 'advance' });
        return commands;
      }
      world.player.flasks.forEach((_flask, slot: number): void => {
        const action: ActionId | null = flaskAction(slot);
        if (action !== null && settings.keys().bindingsOf(action).some((binding: string): boolean => fresh.has(binding))) commands.push({ type: 'flask', slot });
      });
      if (aim === null || ground === null) return commands;
      const steering = world.player.action;
      if (steering !== null && steering.slot !== null && steering.skill.press !== null && settings.keys().bindingsOf(slotAction(steering.slot)).some((binding: string): boolean => held.has(binding))) commands.push({ type: 'steer', aim });

      const leftSlot: number = slotFor(INPUT.leftBinding);
      const leftFresh: boolean = fresh.has(INPUT.leftBinding);
      if (leftFresh) hud.requestMap(marked && !shift);
      const leftRepeats: boolean = leftFresh || (world.player.skills[leftSlot]?.press ?? null) === null;
      const leftHeld: boolean = held.has(INPUT.leftBinding) && !pressedPlayer;
      const itemHit: ItemPress = itemPress(pressedItem, { fresh: leftFresh, held: leftHeld, free: target === null && person === null && !shift, item: item?.id ?? null });
      pressedItem = itemHit.onItem;
      const leftTick: boolean = leftFresh || (leftHeld && holdTick);
      if (leftFresh) pressedExit = exit?.id ?? null;
      else if (!leftHeld) pressedExit = null;
      if (leftFresh || leftHeld) {
        if (target !== null) {
          if (leftRepeats && leftTick) commands.push({ type: 'skill', slot: leftSlot, aim, targetId: target.id });
          if (leftFresh) hooks.clickMarker(target.pos.x, target.pos.z, true);
        } else if (shift) {
          if (leftRepeats && leftTick) commands.push({ type: 'skill', slot: leftSlot, aim: ground, targetId: null });
        } else if (person !== null) {
          if (leftFresh) commands.push({ type: 'talk', npcId: person.id });
        } else if (pressedItem) {
          if (itemHit.pickup !== null && item !== null) {
            commands.push({ type: 'pickup', groundId: itemHit.pickup });
            hooks.clickMarker(item.pos.x, item.pos.z, false);
          }
        } else if (chest !== null) {
          const spot: Vec2 | null = chestSpot(chest);
          if (leftFresh && spot !== null) {
            commands.push({ type: 'open', momentId: chest.id });
            hooks.clickMarker(spot.x, spot.z, false);
          }
        } else if (station !== null) {
          if (leftFresh) {
            commands.push({ type: 'use', prop: station.index });
            hooks.clickMarker(station.placed.x, station.placed.z, false);
          }
        } else if (!leftFresh && pressedExit !== null) {
          hooks.aimExit(pressedExit);
        } else if (exit !== null) {
          const through: Command | null = exitPress(exit.id, { fresh: leftFresh, travelling: world.player.intent.type === 'travel', ground });
          if (through !== null) commands.push(through);
          if (leftFresh) hooks.clickMarker(exit.x, exit.z, false);
        } else {
          commands.push({ type: 'move', held: !leftFresh, dest: ground });
          if (leftFresh) hooks.clickMarker(ground.x, ground.z, false);
        }
      }

      world.content.player.skillBar.forEach((_entry, slot: number): void => {
        for (const binding of settings.keys().bindingsOf(slotAction(slot))) {
          if (binding === INPUT.leftBinding) continue;
          const isFresh: boolean = fresh.has(binding);
          if (!isFresh && !(held.has(binding) && readyToRepeat(world.player, world.player.skills[slot]))) continue;
          commands.push({ type: 'skill', slot, aim, targetId: null });
          return;
        }
      });
      return commands;
    },
  };
}
