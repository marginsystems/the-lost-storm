import type { ZoneEncounter, ZoneVoid } from '../content/story-types.ts';
import type { ItemSlot } from '../content/types.ts';
import { generateItem, slotOf } from '../items.ts';
import type { Vec2 } from '../math.ts';
import { distance, dot, length, normalize } from '../math.ts';
import { allHold } from './conditions.ts';
import { equipFromInventory } from './character.ts';
import { moveExit } from './exits.ts';
import { isWalkable, nearestWalkable } from '../nav/grid.ts';
import { removeGround } from './ground.ts';
import { setFlags } from './story.ts';
import type { EncounterState, GroundItem, ItemInstance, World, WorldEvent } from './types.ts';

const DEGREES: number = Math.PI / 180;

const ENCOUNTER = {
  closeShare: 0.5,
  clearReach: 8,
} as const;

function groundOf(world: World, state: EncounterState): GroundItem | null {
  return world.ground.find((ground: GroundItem): boolean => ground.id === state.groundId) ?? null;
}

function layItem(world: World, met: ZoneEncounter, state: EncounterState, base: string, pos: Vec2): void {
  const lying: GroundItem | null = groundOf(world, state);
  if (lying !== null) {
    lying.pos = { x: pos.x, z: pos.z };
    lying.from = { x: pos.x, z: pos.z };
    return;
  }
  const commonRarity: string | null = world.content.rarities[0]?.id ?? null;
  const item: ItemInstance | null = generateItem(world.content, world.rng, world.nextItemUid, 1, base, commonRarity);
  if (item === null) return;
  world.nextItemUid += 1;
  const ground: GroundItem = { id: world.nextId, pos: { x: pos.x, z: pos.z }, from: { x: pos.x, z: pos.z }, content: { kind: 'item', item }, age: 0, kept: false, find: met.id };
  world.nextId += 1;
  world.ground.push(ground);
  world.events.push({ type: 'drop', ground });
  state.groundId = ground.id;
}

function place(world: World, met: ZoneEncounter, state: EncounterState, ahead: number): void {
  const aim: Vec2 = { x: world.player.pos.x + world.heading.x * ahead, z: world.player.pos.z + world.heading.z * ahead };
  const pos: Vec2 = isWalkable(world.grid, aim.x, aim.z) ? aim : (nearestWalkable(world.grid, aim, ENCOUNTER.clearReach) ?? aim);
  state.pos = pos;
  state.off = 0;
  switch (met.find.type) {
    case 'item':
      layItem(world, met, state, met.find.item, pos);
      break;
    case 'exit':
      moveExit(world, met.find.exit, pos);
      break;
  }
}

function withdraw(world: World, state: EncounterState): void {
  if (state.groundId !== null) removeGround(world, state.groundId);
}

function wandered(world: World, rules: ZoneVoid, met: ZoneEncounter, state: EncounterState, pos: Vec2, travelled: number, dt: number): boolean {
  const toward: Vec2 = { x: pos.x - world.player.pos.x, z: pos.z - world.player.pos.z };
  const away: number = length(toward);
  const cosine: number = dot(normalize(toward, world.heading), world.heading);
  const astray: boolean = away > met.ahead * ENCOUNTER.closeShare && cosine < Math.cos(rules.wander.degrees * DEGREES);
  if (!astray) state.off = 0;
  else if (travelled > 0) state.off += dt;
  return away > met.ahead * rules.wander.farther || state.off > rules.wander.seconds;
}

function stepOne(world: World, rules: ZoneVoid, met: ZoneEncounter, travelled: number, dt: number): void {
  const index: number = world.encounters.findIndex((entry: EncounterState): boolean => entry.id === met.id);
  const existing: EncounterState | undefined = world.encounters[index];
  if (!allHold(world, met.when)) {
    if (existing === undefined) return;
    withdraw(world, existing);
    world.encounters.splice(index, 1);
    return;
  }
  const state: EncounterState = existing ?? { id: met.id, walked: 0, moving: 0, pos: null, off: 0, groundId: null };
  if (existing === undefined) world.encounters.push(state);
  state.walked += travelled;
  if (travelled > 0) state.moving += dt;
  const late: boolean = met.latest !== null && state.moving >= met.latest;
  if (state.pos === null) {
    if (late) place(world, met, state, 0);
    else if (state.walked >= met.after) place(world, met, state, met.ahead);
    return;
  }
  if (met.find.type === 'item' && groundOf(world, state) === null) return;
  if (late) {
    if (distance(state.pos, world.player.pos) > 0) place(world, met, state, 0);
    return;
  }
  if (wandered(world, rules, met, state, state.pos, travelled, dt)) place(world, met, state, met.ahead);
}

function wieldFound(world: World, item: ItemInstance): void {
  const slot: ItemSlot | null = slotOf(world.content, item);
  const index: number = world.player.inventory.findIndex((held: ItemInstance | null): boolean => held?.uid === item.uid);
  if (slot === null || index < 0 || world.player.equipped[slot] !== null) return;
  equipFromInventory(world, index);
}

function takeFinds(world: World, rules: ZoneVoid, events: readonly WorldEvent[]): void {
  for (const event of events) {
    if (event.type !== 'pickup' || event.ground.find === null) continue;
    const found: string = event.ground.find;
    const met: ZoneEncounter | undefined = rules.encounters.find((entry: ZoneEncounter): boolean => entry.id === found);
    if (met === undefined || met.find.type !== 'item') continue;
    setFlags(world, met.find.sets);
    if (met.find.equip && event.ground.content.kind === 'item') wieldFound(world, event.ground.content.item);
  }
}

export function stepEncounters(world: World, rules: ZoneVoid, travelled: number, dt: number): void {
  takeFinds(world, rules, world.events);
  for (const met of rules.encounters) stepOne(world, rules, met, travelled, dt);
}
