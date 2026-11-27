import type { KeyMoveHintState, KeyMoveHintStep } from './key-move-hint.ts';
import { NO_KEY_MOVE_HINT, noteGroundClick } from './key-move-hint.ts';
import { heightAt, terrainMap } from '../sim/nav/terrain.ts';
import type { Box3 as Box3Type } from 'three';
import { Box3, Vector2 } from 'three';
import type { Vector3 } from 'three';
import type { ZoneExit, ZoneWaypoint } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { exitShown, exitUnder } from '../sim/world/exits.ts';
import type { PlaceRef } from '../sim/content/markers.ts';
import { aimedItem } from '../sim/world/finds.ts';
import { readyToRepeat } from '../sim/world/skills.ts';
import { stationNear } from '../sim/world/trade.ts';
import { chestNear, chestSpot } from '../sim/world/moment-chest.ts';
import type { Station } from '../sim/world/trade.ts';
import { cacheNear } from '../sim/world/caches.ts';
import type { Cache } from '../sim/world/caches.ts';
import type { Command, GroundItem, MomentState, MonsterState, NpcState, PlayerState, World } from '../sim/world/types.ts';
import { waypointAt } from '../sim/world/waypoints.ts';
import { portalNear } from '../sim/world/portal.ts';
import type { PortalEnd } from '../sim/world/portal-types.ts';
import type { ClickFacts, ClickResolution, InputReading, PersonPick } from './click-reading.ts';
import { describeInput, resolveClick } from './click-reading.ts';
import type { Hud } from './hud/hud-api.ts';
import type { PickCandidate, ScreenRect } from './pick.ts';
import { PICK, pickActor } from './pick.ts';
import { exitPress } from './exit-press.ts';
import type { ItemPress } from './item-press.ts';
import { itemPress } from './item-press.ts';
import type { KeyWalk, MoveKeys } from './move-keys.ts';
import { createKeyWalk, keysDirection } from './move-keys.ts';
import { heroMotion, motionAim } from './skill-steer.ts';
import type { SkillDef } from '../sim/content/types.ts';
import type { IsoCamera } from './render/iso-camera.ts';
import { CAMERA } from './render/iso-camera.ts';
import { clickThrough } from './render/prop-cutaway.ts';
import { clickFloor, clickHeight, sightReady } from './render/terrain-sight.ts';
import type { ActionId } from './settings/bindings.ts';
import { flaskAction, slotAction } from './settings/bindings.ts';
import type { SettingsStore } from './settings/store.ts';
import type { SurfaceRect } from './surface-rect.ts';
import { surfaceRect } from './surface-rect.ts';

export const INPUT = {
  holdInterval: 0.09,
  toggleStartWindow: 0.5,
  leftBinding: 'mouse_left',
  rightBinding: 'mouse_right',
  mouseButtons: [
    { binding: 'mouse_left', name: 'left', button: 0, bit: 1 },
    { binding: 'mouse_right', name: 'right', button: 2, bit: 2 },
  ],
  closeKey: 'Escape',
  advanceKeys: ['Space', 'Enter'],
  halfTurnDegrees: 180,
} as const;

export interface InputHooks {
  heightOf(actorId: number): number;
  boundsOf(actorId: number, out: Box3Type): boolean;
  labelHover(): number | null;
  clickMarker(x: number, z: number, hostile: boolean): void;
  aimPlace(place: PlaceRef | null): void;
  placeAt(pointer: Vector2): PlaceRef | null;
  usePlace(place: PlaceRef): void;
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
  readonly reading: InputReading;
}

export interface MouseButton {
  readonly binding: string;
  readonly name: string;
  readonly button: number;
  readonly bit: number;
}

export interface ToggledSkill {
  readonly slot: number;
  started: boolean;
  waited: number;
}

export interface PointerReport {
  readonly button: number;
  readonly buttons: number;
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

export type InputCamera = Pick<IsoCamera, 'groundPoint' | 'project' | 'zoomBy'>;

export type InputHud = Pick<Hud, 'isPointerOverUi' | 'closePanels' | 'togglePanel' | 'requestMap' | 'showKeyMoveLine' | 'readInput'>;

export function createInput(canvas: InputSurface, windowEvents: KeySource, world: World, camera: InputCamera, hud: InputHud, settings: SettingsStore, hooks: InputHooks): Input {
  const pointer: Vector2 = new Vector2(0, 0);
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
  let keyHint: KeyMoveHintState = NO_KEY_MOVE_HINT;
  let hintClock: number = 0;
  let pressedPlayer: boolean = false;
  let enteredZone: string = world.zone.id;
  let lastClick: ClickResolution | null = null;
  let toggled: ToggledSkill | null = null;
  let dropToggle: boolean = false;
  let overUi: boolean = false;
  const extra: Command[] = [];
  const yaw: number = (CAMERA.yawDegrees * Math.PI) / INPUT.halfTurnDegrees;
  const keyWalk: KeyWalk = createKeyWalk(yaw);
  let touching: boolean = false;
  const down = (action: ActionId): boolean => settings.keys().bindingsOf(action).some((binding: string): boolean => held.has(binding));
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

  const lift = (binding: string): void => {
    if (!held.delete(binding)) return;
    lifted.push(binding);
  };
  const liftMouse = (): void => {
    for (const mouseButton of INPUT.mouseButtons) lift(mouseButton.binding);
  };
  const follow = (event: PointerReport): void => {
    for (const mouseButton of INPUT.mouseButtons) {
      if (!buttonDown(event.buttons, mouseButton)) lift(mouseButton.binding);
      else if (event.button === mouseButton.button) {
        held.add(mouseButton.binding);
        pressed.push(mouseButton.binding);
      }
    }
  };

  canvas.addEventListener('pointerdown', (event: PointerEvent): void => {
    track(event);
    shift = event.shiftKey;
    pointerInside = true;
    touching = event.pointerType === 'touch';
    follow(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event: PointerEvent): void => {
    track(event);
    mouse = event.pointerType === 'mouse';
    touching = event.pointerType === 'touch';
    shift = event.shiftKey;
    pointerInside = true;
    follow(event);
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
  canvas.addEventListener('pointerup', follow);
  canvas.addEventListener('pointercancel', liftMouse);
  canvas.addEventListener('lostpointercapture', liftMouse);
  windowEvents.addEventListener('contextmenu', blockNativeMenu);
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
  const releaseAll = (): void => {
    for (const binding of held) lifted.push(binding);
    held.clear();
    shift = false;
    dropToggle = true;
  };
  const releaseKeys = (): void => {
    for (const binding of held) if (!INPUT.mouseButtons.some((mouseButton: MouseButton): boolean => mouseButton.binding === binding)) lift(binding);
  };
  windowEvents.addEventListener('focusin', (event: FocusEvent): void => {
    if (isTextField(event.target)) releaseKeys();
  });
  windowEvents.addEventListener('blur', releaseAll);
  windowEvents.addEventListener('visibilitychange', releaseAll);

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

  const candidateFor = (kind: PickCandidate['kind'], id: number, x: number, z: number, hit: Vector3 | null): PickCandidate => {
    const body: ScreenRect | null = screenRect(id);
    const onFloor: boolean = hit !== null && Math.abs(hit.y - heightAt(world.zone, x, z)) <= PICK.floorRise;
    return { id, kind, body, footGap: hit !== null && onFloor ? Math.hypot(hit.x - x, hit.z - z) : Infinity, depth: body === null ? 0 : -body.maxY };
  };

  const pickActors = (hit: Vector3 | null): PickCandidate | null => {
    const labelId: number | null = hooks.labelHover();
    if (hud.isPointerOverUi()) return null;
    if (!pointerInside) {
      const labelled: NpcState | undefined = world.npcs.find((npc: NpcState): boolean => npc.id === labelId);
      return labelled === undefined ? null : candidateFor('npc', labelled.id, labelled.pos.x, labelled.pos.z, null);
    }
    const rect: DOMRect = canvasRect.read();
    const point = { x: ((pointer.x + 1) / 2) * rect.width, y: ((1 - pointer.y) / 2) * rect.height };
    const candidates: PickCandidate[] = [];
    for (const monster of world.monsters) {
      if (monster.alive) candidates.push(candidateFor('monster', monster.id, monster.pos.x, monster.pos.z, hit));
    }
    for (const hero of world.heroes) {
      if (hero.alive && hero.party !== world.player.party) candidates.push(candidateFor('monster', hero.id, hero.pos.x, hero.pos.z, hit));
    }
    for (const npc of world.npcs) candidates.push(candidateFor('npc', npc.id, npc.pos.x, npc.pos.z, hit));
    return pickActor(candidates, point, null);
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

  const placeHere = (): PlaceRef | null => (pointerInside && !hud.isPointerOverUi() ? hooks.placeAt(pointer) : null);

  const placedExit = (place: PlaceRef | null): ZoneExit | null => {
    if (place === null || place.type !== 'exit') return null;
    return world.zone.exits.find((exit: ZoneExit): boolean => exit.id === place.exit && exitShown(world, exit)) ?? null;
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

  const portalAt = (ground: Vec2 | null): PortalEnd | null => {
    if (ground === null || !pointerInside || hud.isPointerOverUi()) return null;
    return portalNear(world, ground);
  };

  const stationAt = (ground: Vec2 | null): Station | Cache | null => {
    if (ground === null || !pointerInside || hud.isPointerOverUi()) return null;
    return stationNear(world, ground) ?? cacheNear(world, ground);
  };

  const reading = (): InputReading => ({ click: lastClick, held: INPUT.mouseButtons.filter((mouseButton: MouseButton): boolean => held.has(mouseButton.binding)).map((mouseButton: MouseButton): string => mouseButton.name), inside: pointerInside, overUi, toggled: toggled === null ? null : (world.player.skills[toggled.slot]?.name ?? null), movement: settings.get().movement === 'keys' && !touching ? 'keys' : 'click' });
  hud.readInput((): string => describeInput(reading()));

  return {
    get hoveredId(): number | null {
      return hoveredId;
    },
    get look(): Vec2 | null {
      return look;
    },
    get reading(): InputReading {
      return reading();
    },
    tap(clientX: number, clientY: number): void {
      trackPoint(clientX, clientY);
      touching = true;
      pointerInside = true;
      tapping = true;
      shift = false;
      pressed.push(INPUT.leftBinding);
      lifted.push(INPUT.leftBinding);
    },
    holdAt(clientX: number, clientY: number): void {
      trackPoint(clientX, clientY);
      touching = true;
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
      hintClock += dt;
      const endToggle = (): void => {
        if (toggled === null) return;
        commands.push({ type: 'hold', slot: toggled.slot, down: false });
        toggled = null;
      };
      if (world.zone.id !== enteredZone) {
        enteredZone = world.zone.id;
        liftMouse();
        endToggle();
        pressedExit = null;
        pressedItem = false;
        pressedPlayer = false;
      }
      overUi = hud.isPointerOverUi();
      const raised: boolean = terrainMap(world.zone) !== null && sightReady(world.zone);
      const groundHit: Vector3 | null = camera.groundPoint(pointer, raised ? clickHeight(world.zone) : undefined, clickThrough(pointer), raised ? clickFloor(world.zone) : null);
      const picked: PickCandidate | null = pickActors(groundHit);
      const target: MonsterState | PlayerState | null = picked?.kind === 'monster' ? (world.monsters.find((monster: MonsterState): boolean => monster.id === picked.id) ?? world.heroes.find((hero: PlayerState): boolean => hero.id === picked.id) ?? null) : null;
      const person: NpcState | null = picked?.kind === 'npc' ? (world.npcs.find((npc: NpcState): boolean => npc.id === picked.id) ?? null) : null;
      hoveredId = target?.id ?? person?.id ?? null;
      const other: string | null = target === null && person === null ? playerAt() : null;
      hooks.hoverPlayer(other);
      const ground: Vec2 | null = groundHit === null ? null : { x: groundHit.x, z: groundHit.z };
      look = mouse && pointerInside ? ground : null;
      const item: GroundItem | null = target === null && person === null && other === null ? itemAt(ground) : null;
      hooks.aimItem(item?.id ?? null);
      const place: PlaceRef | null = target === null && person === null && other === null && item === null ? placeHere() : null;
      const exit: ZoneExit | null = target === null && person === null && other === null && item === null ? (placedExit(place) ?? exitAt(ground)) : null;
      const chest: MomentState | null = target === null && person === null && item === null && exit === null ? chestAt(ground) : null;
      const station: Station | Cache | null = target === null && person === null && item === null && exit === null && chest === null ? stationAt(ground) : null;
      const portal: PortalEnd | null = target === null && person === null && item === null && exit === null && chest === null && station === null ? portalAt(ground) : null;
      const marked: boolean = target === null && person === null && item === null && exit === null && chest === null && station === null && portal === null && (place?.type === 'waypoint' || onWaypointMark(ground));
      hooks.aimPlace(exit !== null ? { type: 'exit', exit: exit.id } : marked ? { type: 'waypoint' } : null);
      const personPick: PersonPick = person === null ? 'none' : pointerInside ? 'body' : 'label';
      if (tapping) {
        tapping = false;
        pointerInside = false;
      }
      canvas.style.cursor = target !== null ? 'crosshair' : item !== null || exit !== null || person !== null || other !== null || chest !== null || station !== null || portal !== null || marked ? 'pointer' : 'default';
      const aim: Vec2 | null = target === null ? ground : { x: target.pos.x, z: target.pos.z };
      const byKeys: boolean = settings.get().movement === 'keys' && !touching;
      const leftSlot: number = slotFor(INPUT.leftBinding);
      const fresh: Set<string> = new Set<string>(pressed.splice(0, pressed.length));
      const up: Set<string> = new Set<string>(lifted.splice(0, lifted.length));
      const leftDown: boolean = fresh.has(INPUT.leftBinding);
      if (leftDown) pressedPlayer = false;
      const tookPlayer: boolean = leftDown && !shift && world.dialogue === null && hooks.pressPlayer(other);
      if (tookPlayer) {
        fresh.delete(INPUT.leftBinding);
        pressedPlayer = true;
      }
      const facts = (freshPress: boolean, onItem: boolean, heldExit: boolean): ClickFacts => ({ fresh: freshPress, player: tookPlayer, dialogue: world.dialogue !== null, ground: aim !== null && ground !== null, target: target !== null, shift, person: personPick, item: onItem, chest: chest !== null, station: station !== null, portal: portal !== null, heldExit, exit: exit !== null, travelling: world.player.intent.type === 'travel', keys: byKeys, armed: (world.player.skills[leftSlot] ?? null) !== null });
      if (tookPlayer || (leftDown && (world.dialogue !== null || aim === null || ground === null))) lastClick = resolveClick(facts(true, false, false));
      if (pressedPlayer && !held.has(INPUT.leftBinding)) {
        pressedPlayer = false;
        up.delete(INPUT.leftBinding);
      }
      const toggling: boolean = settings.get().heldSkills === 'toggle';
      if (dropToggle || !toggling) endToggle();
      dropToggle = false;
      if (toggled !== null) {
        const acting = world.player.action;
        if (acting !== null && acting.slot === toggled.slot) toggled.started = true;
        else if (toggled.started) endToggle();
        else {
          toggled.waited += dt;
          if (toggled.waited > INPUT.toggleStartWindow) endToggle();
        }
      }
      const spent: Set<string> = new Set<string>();
      world.content.player.skillBar.forEach((_entry, slot: number): void => {
        const bound: readonly string[] = settings.keys().bindingsOf(slotAction(slot));
        const keyed: readonly string[] = bound.filter((binding: string): boolean => binding !== INPUT.leftBinding && fresh.has(binding));
        if (keyed.length > 0 && toggled !== null && toggled.slot !== slot && (world.player.skills[slot] ?? null) !== null) endToggle();
        if (keyed.length > 0 && toggling && (world.player.skills[slot]?.press ?? null) !== null) {
          if (toggled?.slot === slot) {
            endToggle();
            for (const binding of keyed) spent.add(binding);
            return;
          }
          toggled = { slot, started: false, waited: 0 };
        }
        if (bound.some((binding: string): boolean => fresh.has(binding))) commands.push({ type: 'hold', slot, down: true });
        if (bound.some((binding: string): boolean => up.has(binding)) && !bound.some((binding: string): boolean => held.has(binding)) && toggled?.slot !== slot) commands.push({ type: 'hold', slot, down: false });
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
      const moveKeys: MoveKeys = { up: down('moveUp'), down: down('moveDown'), left: down('moveLeft'), right: down('moveRight') };
      if (byKeys) commands.push(...keyWalk.step(moveKeys, world.player.pos));
      const keyWay: Vec2 | null = byKeys ? keysDirection(moveKeys, yaw) : null;
      const aimFor = (skill: SkillDef | null, cursor: Vec2 | null): Vec2 | null => (skill === null ? cursor : motionAim(heroMotion(skill), { movement: byKeys ? 'keys' : 'click', keys: keyWay, cursor, from: world.player.pos }));
      const steering = world.player.action;
      const steerAim: Vec2 | null = steering === null ? null : aimFor(steering.skill, aim === null || ground === null ? null : aim);
      if (steering !== null && steerAim !== null && steering.slot !== null && steering.skill.press !== null && (toggled?.slot === steering.slot || settings.keys().bindingsOf(slotAction(steering.slot)).some((binding: string): boolean => held.has(binding)))) commands.push({ type: 'steer', aim: steerAim });
      if (aim === null || ground === null) return commands;

      const leftFresh: boolean = fresh.has(INPUT.leftBinding);
      if (leftFresh) hud.requestMap(marked && !shift);
      if (leftFresh && marked && !shift) hooks.usePlace({ type: 'waypoint' });
      const leftRepeats: boolean = leftFresh || (world.player.skills[leftSlot]?.press ?? null) === null;
      const leftHeld: boolean = held.has(INPUT.leftBinding) && !pressedPlayer;
      const itemHit: ItemPress = itemPress(pressedItem, { fresh: leftFresh, held: leftHeld, free: target === null && person === null && !shift, item: item?.id ?? null });
      pressedItem = itemHit.onItem;
      const leftTick: boolean = leftFresh || (leftHeld && holdTick);
      if (leftFresh) pressedExit = exit?.id ?? null;
      else if (!leftHeld) pressedExit = null;
      const click: ClickResolution = resolveClick(facts(leftFresh, pressedItem, pressedExit !== null));
      if (leftFresh) {
        lastClick = click;
        const noted: KeyMoveHintStep = noteGroundClick(keyHint, { at: hintClock, movement: settings.get().movement, touch: touching, moveKeyHeld: moveKeys.up || moveKeys.down || moveKeys.left || moveKeys.right, facts: facts(true, pressedItem, pressedExit !== null) });
        keyHint = noted.state;
        if (noted.show) hud.showKeyMoveLine();
      }
      if (leftFresh || leftHeld) {
        switch (click.kind) {
          case 'skill':
            if (leftFresh && (world.player.skills[leftSlot] ?? null) !== null) endToggle();
            if (leftRepeats && leftTick) commands.push({ type: 'skill', slot: leftSlot, aim: aimFor(world.player.skills[leftSlot] ?? null, target === null ? ground : aim) ?? ground, targetId: target?.id ?? null });
            if (leftFresh && target !== null) hooks.clickMarker(target.pos.x, target.pos.z, true);
            break;
          case 'talk':
            if (leftFresh && person !== null) commands.push({ type: 'talk', npcId: person.id });
            break;
          case 'pickup':
            if (itemHit.pickup !== null && item !== null) {
              commands.push({ type: 'pickup', groundId: itemHit.pickup });
              hooks.clickMarker(item.pos.x, item.pos.z, false);
            }
            break;
          case 'open': {
            const spot: Vec2 | null = chest === null ? null : chestSpot(chest);
            if (leftFresh && chest !== null && spot !== null) {
              commands.push({ type: 'open', momentId: chest.id });
              hooks.clickMarker(spot.x, spot.z, false);
            }
            break;
          }
          case 'use':
            if (leftFresh && station !== null) {
              commands.push({ type: 'use', prop: station.index });
              hooks.clickMarker(station.placed.x, station.placed.z, false);
            }
            break;
          case 'portal':
            if (leftFresh && portal !== null) {
              commands.push({ type: 'enter_portal' });
              hooks.clickMarker(portal.pos.x, portal.pos.z, false);
            }
            break;
          case 'swallowed':
            hooks.aimPlace(pressedExit === null ? null : { type: 'exit', exit: pressedExit });
            break;
          case 'exit': {
            if (exit === null) break;
            const through: Command | null = exitPress(exit.id, { fresh: leftFresh, travelling: world.player.intent.type === 'travel', ground });
            if (through !== null) commands.push(through);
            if (leftFresh) hooks.clickMarker(exit.x, exit.z, false);
            break;
          }
          case 'move': {
            const waypoint: ZoneWaypoint | null = world.zone.waypoint;
            const dest: Vec2 = leftFresh && marked && !shift && waypoint !== null ? { x: waypoint.x, z: waypoint.z } : ground;
            commands.push({ type: 'move', held: !leftFresh, dest });
            if (leftFresh) hooks.clickMarker(ground.x, ground.z, false);
            break;
          }
          case 'player':
          case 'advance':
          case 'none':
            break;
        }
      }

      world.content.player.skillBar.forEach((_entry, slot: number): void => {
        for (const binding of settings.keys().bindingsOf(slotAction(slot))) {
          if (binding === INPUT.leftBinding || spent.has(binding)) continue;
          const isFresh: boolean = fresh.has(binding);
          if (!isFresh && !(held.has(binding) && readyToRepeat(world.player, world.player.skills[slot]))) continue;
          commands.push({ type: 'skill', slot, aim: aimFor(world.player.skills[slot] ?? null, aim) ?? aim, targetId: null });
          return;
        }
      });
      return commands;
    },
  };
}

export function isTextField(target: EventTarget | null): boolean {
  return target !== null && 'selectionStart' in target;
}

const TEXT_ENTRY_TYPES: ReadonlySet<string> = new Set<string>(['text', 'search', 'email', 'url', 'tel', 'password', 'textarea']);

export function takesText(target: EventTarget | null): boolean {
  if (!isTextField(target) || target === null) return false;
  const type: unknown = Reflect.get(target, 'type');
  return typeof type !== 'string' || TEXT_ENTRY_TYPES.has(type);
}

export function blockNativeMenu(event: Event): void {
  if (!takesText(event.target)) event.preventDefault();
}

export function buttonDown(buttons: number, mouseButton: MouseButton): boolean {
  return Math.floor(buttons / mouseButton.bit) % 2 === 1;
}
