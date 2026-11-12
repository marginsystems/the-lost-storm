import type { HintDef, HintDone, HintPanel, HintsDef, HintTrigger } from './content/hints.ts';
import { baseOf, slotOf } from './items.ts';
import { distance } from './math.ts';
import type { Vec2 } from './math.ts';
import { objectiveTarget } from './world/objective.ts';
import { questState } from './world/conditions.ts';
import type { ObjectiveTarget } from './world/objective.ts';
import type { GroundItem, ItemInstance, MonsterState, World, WorldEvent } from './world/types.ts';

export const HINTS = { maxShowSeconds: 14 } as const;

export interface HintState {
  seen: Set<string>;
  active: string | null;
  anchor: Vec2;
  talked: boolean;
  zoneChanged: boolean;
  pickedUp: boolean;
  skillsUsed: Set<string>;
  allocatedBase: number;
  equippedUids: ReadonlySet<number>;
  started: boolean;
  visibleFor: number;
  lastTime: number;
}

export interface HintInput {
  readonly events: readonly WorldEvent[];
  readonly open: ReadonlySet<HintPanel>;
  readonly enabled: boolean;
}

export type HintChange = { readonly type: 'show'; readonly hint: HintDef } | { readonly type: 'hide'; readonly hint: HintDef; readonly done: boolean };

function wornUids(world: World): number[] {
  return Object.values(world.player.equipped).flatMap((item: ItemInstance | null): number[] => (item === null ? [] : [item.uid]));
}

export function createHintState(seen: Iterable<string>): HintState {
  return { seen: new Set<string>(seen), active: null, anchor: { x: 0, z: 0 }, talked: false, zoneChanged: false, pickedUp: false, skillsUsed: new Set<string>(), allocatedBase: 0, equippedUids: new Set<number>(), started: false, visibleFor: 0, lastTime: 0 };
}

export function seedVeteran(defs: HintsDef, state: HintState, world: World): void {
  if (world.player.level <= 1 && world.player.kills === 0 && !Object.keys(world.quests).some((quest: string): boolean => questState(world, quest) === 'done')) return;
  for (const hint of defs.hints) {
    if (hint.forNewPlayers) state.seen.add(hint.id);
  }
}

function near(world: World, range: number, point: Vec2): boolean {
  return distance(world.player.pos, point) <= range;
}

function lifeFraction(world: World): number {
  return world.player.stats.maxLife > 0 ? world.player.life / world.player.stats.maxLife : 1;
}

function carries(world: World, slot: string | null): boolean {
  return slot === null || world.player.inventory.some((item: ItemInstance | null): boolean => item !== null && baseOf(world.content, item)?.slot === slot);
}

function gearInBag(world: World): boolean {
  return world.player.inventory.some((item: ItemInstance | null): boolean => item !== null && slotOf(world.content, item) !== null);
}

function triggered(trigger: HintTrigger, world: World, objective: ObjectiveTarget | null): boolean {
  const player = world.player;
  if (trigger.type === 'player_dead') return !player.alive;
  if (!player.alive) return false;
  let holds: boolean;
  switch (trigger.type) {
    case 'game_started':
      holds = true;
      break;
    case 'objective_person':
      holds = objective?.kind === 'person' && world.dialogue === null;
      break;
    case 'objective_exit':
      holds = objective?.kind === 'exit';
      break;
    case 'waypoint_near':
      holds = world.zone.waypoint !== null && near(world, trigger.range, world.zone.waypoint);
      break;
    case 'monster_near':
      holds = world.monsters.some((monster: MonsterState): boolean => monster.alive && near(world, trigger.range, monster.pos));
      break;
    case 'item_near':
      holds = world.ground.some((ground: GroundItem): boolean => ground.content.kind === 'item' && near(world, trigger.range, ground.pos));
      break;
    case 'skill_point':
      holds = player.skillPoints > 0;
      break;
    case 'skill_learned':
      holds = player.learned.includes(trigger.skill);
      break;
    case 'slot_filled':
      holds = (player.bar[trigger.slot] ?? null) !== null;
      break;
    case 'gear_in_bag':
      holds = gearInBag(world);
      break;
    case 'low_life':
      holds = lifeFraction(world) <= trigger.fraction && carries(world, trigger.carrying);
      break;
  }
  return holds;
}

function usedSlot(world: World, state: HintState, slot: number): boolean {
  const skill: string | null = world.player.bar[slot] ?? null;
  return skill !== null && state.skillsUsed.has(skill);
}

function finished(done: HintDone, world: World, state: HintState, open: ReadonlySet<HintPanel>): boolean {
  const player = world.player;
  let complete: boolean;
  switch (done.type) {
    case 'moved':
      complete = distance(player.pos, state.anchor) >= done.distance;
      break;
    case 'talked':
      complete = state.talked;
      break;
    case 'panel':
      complete = open.has(done.panel);
      break;
    case 'zone_changed':
      complete = state.zoneChanged;
      break;
    case 'skills_used':
      complete = done.slots.every((slot: number): boolean => usedSlot(world, state, slot));
      break;
    case 'picked_up':
      complete = state.pickedUp;
      break;
    case 'equipped':
      complete = wornUids(world).some((uid: number): boolean => !state.equippedUids.has(uid));
      break;
    case 'allocated':
      complete = player.allocated.length > state.allocatedBase || player.skillPoints === 0;
      break;
    case 'life_above':
      complete = player.alive && lifeFraction(world) >= done.fraction;
      break;
    case 'alive':
      complete = player.alive;
      break;
  }
  return complete;
}

function observe(state: HintState, world: World, events: readonly WorldEvent[]): void {
  for (const event of events) {
    if (event.type === 'dialogue_line') state.talked = true;
    else if (event.type === 'zone_changed') state.zoneChanged = true;
    else if (event.type === 'pickup') state.pickedUp = true;
    else if (event.type === 'skill_start' && event.actorId === world.player.id) state.skillsUsed.add(event.skill.id);
  }
}

function begin(state: HintState, world: World, hint: HintDef): void {
  state.active = hint.id;
  state.anchor = { x: world.player.pos.x, z: world.player.pos.z };
  state.talked = false;
  state.zoneChanged = false;
  state.pickedUp = false;
  state.skillsUsed = new Set<string>();
  state.allocatedBase = world.player.allocated.length;
  state.equippedUids = new Set<number>(wornUids(world));
  state.visibleFor = 0;
  state.lastTime = world.time;
}

export function stepHints(defs: HintsDef, world: World, state: HintState, input: HintInput): HintChange[] {
  const changes: HintChange[] = [];
  observe(state, world, input.events);
  const current: HintDef | undefined = defs.hints.find((hint: HintDef): boolean => hint.id === state.active);
  if (current !== undefined) {
    if (world.dialogue === null) state.visibleFor += world.time - state.lastTime;
    state.lastTime = world.time;
    if (finished(current.done, world, state, input.open)) {
      state.seen.add(current.id);
      state.active = null;
      changes.push({ type: 'hide', hint: current, done: true });
    } else if (state.visibleFor >= HINTS.maxShowSeconds) {
      state.seen.add(current.id);
      state.active = null;
      changes.push({ type: 'hide', hint: current, done: true });
    } else if (!input.enabled || (!world.player.alive && current.trigger.type !== 'player_dead')) {
      state.active = null;
      changes.push({ type: 'hide', hint: current, done: false });
    }
    return changes;
  }
  if (!input.enabled) return changes;
  const objective: ObjectiveTarget | null = objectiveTarget(world);
  const next: HintDef | undefined = defs.hints.find((hint: HintDef): boolean => !state.seen.has(hint.id) && hint.after.every((id: string): boolean => state.seen.has(id)) && triggered(hint.trigger, world, objective));
  if (next === undefined) return changes;
  begin(state, world, next);
  changes.push({ type: 'show', hint: next });
  return changes;
}
