import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armed, must, withoutGlitches, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { ZoneFlash } from '../content/story-types.ts';
import type { Content, QuestDef, ZoneDef, ZoneExit } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { questState, restraintOf } from './conditions.ts';
import { flashHolds } from './flash.ts';
import { hudHidden } from './hud.ts';
import { currentObjective, startQuests } from './quests.ts';
import { stepWorld } from './step.ts';
import { setFlags } from './story.ts';
import type { GroundItem, NpcState, World, WorldEvent } from './types.ts';

const SHIPPED: Content = loadContent();
const DT: number = 1 / 30;
const TALK_LIMIT: number = 30;
const WALK = { lead: 6, limit: 120 } as const;
const NORTH: Vec2 = { x: 0, z: -1 };

function flashZone(): ZoneDef {
  return must(SHIPPED.zones.get('next_moment'), 'the flash zone');
}

function rules(): ZoneFlash {
  return must(flashZone().flash, 'flash rules');
}

function quest(id: string): QuestDef {
  return must(SHIPPED.quests.get(id), `quest ${id}`);
}

function npcOf(world: World, id: string): NpcState {
  return must(world.npcs.find((npc: NpcState): boolean => npc.def.id === id), `npc ${id}`);
}

function talk(world: World, id: string): WorldEvent[] {
  const npc: NpcState = npcOf(world, id);
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(TALK_LIMIT / DT) && world.dialogue === null; step += 1) events.push(...stepWorld(world, step === 0 ? [{ type: 'talk', npcId: npc.id }] : [], DT));
  for (let guard: number = 0; guard < 50 && world.dialogue !== null; guard += 1) events.push(...stepWorld(world, [{ type: 'advance' }], DT));
  events.push(...stepWorld(world, [], DT));
  return events;
}

function said(events: readonly WorldEvent[]): string[] {
  return events.flatMap((event: WorldEvent): string[] => (event.type === 'dialogue_line' ? [event.line.id] : []));
}

function barked(events: readonly WorldEvent[]): string[] {
  return events.flatMap((event: WorldEvent): string[] => (event.type === 'bark' ? [event.line.id] : []));
}

function zonesEntered(events: readonly WorldEvent[]): string[] {
  return events.flatMap((event: WorldEvent): string[] => (event.type === 'zone_changed' ? [event.to] : []));
}

function wait(world: World, seconds: number, until: () => boolean = (): boolean => false): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let passed: number = 0; passed < seconds && !until(); passed += DT) events.push(...stepWorld(world, [], DT));
  return events;
}

function walk(world: World, dir: Vec2, until: () => boolean): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let passed: number = 0; passed < WALK.limit && !until(); passed += DT) events.push(...stepWorld(world, [{ type: 'move', held: true, dest: { x: world.player.pos.x + dir.x * WALK.lead, z: world.player.pos.z + dir.z * WALK.lead } }], DT));
  return events;
}

function stand(world: World, x: number, z: number): WorldEvent[] {
  world.player.pos = { x, z };
  world.player.path = [];
  world.player.intent = { type: 'idle' };
  return stepWorld(world, [], DT);
}

function freed(level: number, choice: string | null): World {
  const world: World = withoutGlitches(worldIn(SHIPPED, 'hideout', 11));
  world.player.level = level;
  world.flags['keeper_defeated'] = 'defeated';
  startQuests(world);
  setFlags(world, { opening: 'read', first_blade: 'found' });
  if (choice !== null) setFlags(world, { first_choice: choice });
  world.visited.push('hall_of_time', 'ledger_hall');
  setFlags(world, { ledger_keeper_defeated: 'defeated', warden_fell: 'fell' });
  stepWorld(world, [], DT);
  talk(world, 'reeve');
  assert.equal(world.flags['reeve_freed'], 'freed');
  world.events = [];
  return world;
}

function intoTheWhite(world: World): WorldEvent[] {
  const events: WorldEvent[] = wait(world, rules().calm + 1, (): boolean => world.zone.id === 'next_moment');
  events.push(...wait(world, rules().seconds + 1, (): boolean => world.zone.id === 'between'));
  return events;
}

function journalAgain(world: World): GroundItem | null {
  return world.ground.find((ground: GroundItem): boolean => ground.find === 'journal_again') ?? null;
}

function exitOf(world: World, id: string): ZoneExit {
  return must(world.zone.exits.find((exit: ZoneExit): boolean => exit.id === id), `exit ${id}`);
}

function home(world: World): WorldEvent[] {
  const events: WorldEvent[] = walk(world, NORTH, (): boolean => world.encounters.some((state): boolean => state.id === 'light_home' && state.pos !== null));
  events.push(...stepWorld(world, [{ type: 'travel', exit: exitOf(world, 'to_the_fire').id }], DT));
  events.push(...wait(world, WALK.limit, (): boolean => world.zone.id === 'hideout'));
  return events;
}

void test('the flash is a quiet zone off the map that waits on the flag it sets', (): void => {
  const zone: ZoneDef = flashZone();
  assert.equal(zone.packs.length, 0);
  assert.equal(zone.exits.length, 0);
  assert.equal(
    SHIPPED.world.acts.some((act): boolean => act.atlas.places.some((place): boolean => place.zone === zone.id)),
    false,
  );
  assert.equal(rules().from, 'hideout');
  assert.equal(rules().into, 'between');
  assert.ok(rules().seconds >= 18 && rules().seconds <= 24);
  assert.deepEqual(rules().sets, { next_count: 'flashed' });
});

void test('before the end of Act I, or below level 30, the hero stays at the fire', (): void => {
  const low: World = freed(29, null);
  assert.deepEqual(zonesEntered(wait(low, 10)), []);
  const early: World = withoutGlitches(worldIn(SHIPPED, 'hideout', 12));
  early.player.level = 30;
  assert.deepEqual(zonesEntered(wait(early, 10)), []);
});

void test('once Act I has ended at level 30 a few calm seconds at the fire open the flash, where the HUD is hidden and nothing can be fought', (): void => {
  const world: World = freed(30, null);
  assert.equal(hudHidden(world), false);
  const opened: WorldEvent[] = wait(world, rules().calm + 1, (): boolean => world.zone.id === 'next_moment');
  assert.deepEqual(zonesEntered(opened), ['next_moment']);
  assert.ok(world.time >= rules().calm);
  assert.equal(hudHidden(world), true);
  armed(world);
  for (const command of [{ type: 'skill', slot: 0, aim: { x: 14, z: 20 }, targetId: null }, { type: 'strike', at: { x: 14, z: 20 }, moment: null }, { type: 'flask', slot: 0 }] as const) assert.equal(flashHolds(world, command), true);
  const tried: WorldEvent[] = stepWorld(world, [{ type: 'skill', slot: 0, aim: { x: 14, z: 20 }, targetId: null }], DT);
  assert.equal(tried.some((event: WorldEvent): boolean => event.type === 'skill_start'), false);
  assert.equal(world.player.action, null);
  const from: Vec2 = { ...world.player.pos };
  walk(world, NORTH, (): boolean => from.z - world.player.pos.z > 3);
  assert.ok(from.z - world.player.pos.z > 3);
});

void test('the voice from inside calls as the hero nears the door, and after about twenty seconds the seam builds and tears into the white', (): void => {
  const world: World = freed(30, null);
  const events: WorldEvent[] = intoTheWhite(world);
  assert.deepEqual(zonesEntered(events), ['next_moment', 'between']);
  const seam: WorldEvent | undefined = events.find((event: WorldEvent): boolean => event.type === 'flash_seam');
  assert.deepEqual(seam, { type: 'flash_seam', zone: 'next_moment', seconds: rules().seam });
  const seamAt: number = events.indexOf(must(seam, 'seam'));
  const tornAt: number = events.findIndex((event: WorldEvent): boolean => event.type === 'zone_changed' && event.to === 'between');
  assert.ok(seamAt < tornAt);
  assert.equal(world.flags['next_count'], 'flashed');
  assert.equal(questState(world, 'the_next_count'), 'active');
  assert.equal(currentObjective(world, quest('the_next_count'))?.id, 'fire');
});

void test('walking up to the lit doorway tears the flash before its time runs out', (): void => {
  const world: World = freed(30, null);
  wait(world, rules().calm + 1, (): boolean => world.zone.id === 'next_moment');
  const door: Vec2 = must(rules().threshold, 'threshold');
  const started: number = world.time;
  const events: WorldEvent[] = [];
  for (let passed: number = 0; passed < WALK.limit && world.zone.id === 'next_moment'; passed += DT) events.push(...stepWorld(world, [{ type: 'move', held: true, dest: door }], DT));
  assert.ok(barked(events).includes('moment_voice_come_in'));
  assert.ok(barked(events).includes('moment_voice_kept_it'));
  assert.equal(world.zone.id, 'between');
  assert.ok(world.time - started < rules().seconds);
});

void test('in the white the hero left the journal for, it lies on the ground again, and leaving it or taking it does not count toward restraint a second time', (): void => {
  const left: World = freed(30, null);
  const before: number = restraintOf(left);
  assert.equal(before, 1);
  intoTheWhite(left);
  assert.equal(left.shore, null);
  walk(left, NORTH, (): boolean => journalAgain(left) !== null);
  assert.notEqual(journalAgain(left), null);
  assert.equal(restraintOf(left), before);
  home(left);
  assert.equal(left.zone.id, 'hideout');
  assert.equal(restraintOf(left), before);

  const took: World = freed(30, null);
  intoTheWhite(took);
  walk(took, NORTH, (): boolean => journalAgain(took) !== null);
  const lying: GroundItem = must(journalAgain(took), 'the journal again');
  stepWorld(took, [{ type: 'pickup', groundId: lying.id }], DT);
  wait(took, 5, (): boolean => took.flags['second_choice'] !== undefined);
  assert.equal(took.flags['second_choice'], 'took_journal');
  assert.equal(took.flags['first_choice'], undefined);
  assert.equal(restraintOf(took), before);
});

void test('a hero who took the journal in Act I finds no second one in the white, and restraint stays where it was', (): void => {
  const world: World = freed(30, 'took_journal');
  const before: number = restraintOf(world);
  intoTheWhite(world);
  walk(world, NORTH, (): boolean => world.encounters.some((state): boolean => state.id === 'light_home' && state.pos !== null));
  assert.equal(journalAgain(world), null);
  assert.equal(world.ground.some((ground: GroundItem): boolean => ground.find === 'journal'), false);
  assert.equal(restraintOf(world), before);
});

void test('the light in the white leads back to the fire, Reeve tells of the next count, and the way out hears a Timekeeper from far off', (): void => {
  const world: World = freed(30, null);
  const travelled: WorldEvent[] = [...intoTheWhite(world), ...home(world)];
  assert.deepEqual(zonesEntered(travelled), ['next_moment', 'between', 'hideout']);
  assert.deepEqual(said(talk(world, 'reeve')), ['reeve_next_open', 'reeve_next_in_it', 'reeve_next_face', 'reeve_next_out', 'reeve_next_touch', 'reeve_next_wait']);
  assert.equal(world.flags['next_count'], 'told');
  assert.equal(currentObjective(world, quest('the_next_count'))?.id, 'out');
  assert.deepEqual(said(talk(world, 'reeve')), ['reeve_into_fire', 'reeve_not_lost']);
  assert.deepEqual(said(talk(world, 'reeve')), ['reeve_next_reminder']);
  assert.deepEqual(said(talk(world, 'reeve')), ['reeve_next_reminder']);
  assert.ok(barked(stand(world, 24, 8)).includes('timekeeper_seeker_first_page'));
  stand(world, 29.5, 7);
  assert.equal(questState(world, 'the_next_count'), 'active');
  const out: WorldEvent[] = [...stepWorld(world, [{ type: 'travel', exit: exitOf(world, 'outward').id }], DT), ...wait(world, 10, (): boolean => world.zone.id === 'still_reach')];
  assert.deepEqual(zonesEntered(out), ['still_reach']);
  wait(world, 1);
  assert.equal(questState(world, 'the_next_count'), 'done');
});
