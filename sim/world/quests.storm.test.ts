import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, withoutGlitches, worldIn } from '../../test/support.ts';
import type { BossDef } from '../content/boss-types.ts';
import { loadContent } from '../content/content.ts';
import type { Content, QuestDef, ZoneExit } from '../content/types.ts';
import { directionOf } from '../math.ts';
import { stepBosses } from './boss.ts';
import { kill } from './combat.ts';
import { currentObjective, startQuests } from './quests.ts';
import { stepWorld } from './step.ts';
import { setFlags } from './story.ts';
import type { GroundItem, MonsterState, NpcState, World, WorldEvent } from './types.ts';

const SHIPPED: Content = loadContent();
const DT: number = 1 / 60;
const LIMIT: number = 30;
const LEAVE: number = 3;

function npcOf(world: World, id: string): NpcState {
  return must(world.npcs.find((npc: NpcState): boolean => npc.def.id === id), `npc ${id}`);
}

function hasNpc(world: World, id: string): boolean {
  return world.npcs.some((npc: NpcState): boolean => npc.def.id === id);
}

function talk(world: World, id: string): WorldEvent[] {
  const npc: NpcState = npcOf(world, id);
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(LIMIT / DT) && world.dialogue === null; step += 1) events.push(...stepWorld(world, step === 0 ? [{ type: 'talk', npcId: npc.id }] : [], DT));
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

function stand(world: World, x: number, z: number): WorldEvent[] {
  world.player.pos = { x, z };
  world.player.path = [];
  world.player.intent = { type: 'idle' };
  return stepWorld(world, [], DT);
}

function wait(world: World, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) events.push(...stepWorld(world, [], DT));
  return events;
}

function quest(id: string): QuestDef {
  return must(SHIPPED.quests.get(id), `quest ${id}`);
}

function living(world: World, monster: string): MonsterState[] {
  return world.monsters.filter((candidate: MonsterState): boolean => candidate.alive && candidate.def.id === monster);
}

function after(zone: string, flags: Readonly<Record<string, string>>, level: number): World {
  const world: World = withoutGlitches(worldIn(SHIPPED, zone, level));
  setFlags(world, { opening: 'begun', reeve_freed: 'freed', first_to_stop_defeated: 'defeated', loom_defeated: 'defeated', ...flags });
  startQuests(world);
  world.events = [];
  return world;
}

function exitOf(world: World, id: string): ZoneExit {
  return must(world.zone.exits.find((exit: ZoneExit): boolean => exit.id === id), `exit ${id}`);
}

void test('the way out of the Loom’s room shows only once the Loom is beaten, and leads to the Storm Rim', (): void => {
  const before: World = withoutGlitches(worldIn(SHIPPED, 'mender_loom', 43));
  const down: ZoneExit = exitOf(before, 'down');
  assert.equal(down.to, 'storm_rim');
  assert.equal(down.hiddenWhenLocked, true);
  assert.deepEqual(down.requires, [{ type: 'flag', flag: 'loom_defeated', is: 'defeated', not: false }]);
  const storm: QuestDef = quest('the_storm');
  assert.deepEqual(storm.when, [{ type: 'flag', flag: 'loom_defeated', is: null, not: false }]);
});

void test('the Warden waits at the far side of the Eye, says where he has been, and goes ahead into the Calm', (): void => {
  const world: World = after('storm_rim', {}, 45);
  assert.equal(currentObjective(world, quest('the_storm'))?.id, 'rim');
  stand(world, 233, 35);
  assert.equal(currentObjective(world, quest('the_storm'))?.id, 'warden');
  const eye: World = after('storm_eye', {}, 49);
  eye.quests = { ...world.quests };
  const warden: NpcState = npcOf(eye, 'warden_returned');
  stand(eye, warden.pos.x + 1, warden.pos.z + 1);
  assert.deepEqual(said(talk(eye, 'warden_returned')), ['warden_returned_storm', 'warden_returned_fire', 'warden_returned_changed', 'warden_returned_together']);
  assert.equal(eye.flags['warden_returned'], 'returned');
  wait(eye, LEAVE);
  assert.equal(hasNpc(eye, 'warden_returned'), false);
  assert.equal(currentObjective(eye, quest('the_storm'))?.id, 'calm');
});

void test('in the Calm the Seeker comes once the hero has spoken with the Warden, is fought beside him, and its fall ends the act', (): void => {
  const world: World = after('the_search', { warden_returned: 'returned' }, 50);
  world.quests = { ...world.quests, the_storm: 2 };
  assert.deepEqual(living(world, 'the_seeker'), []);
  const heard: WorldEvent[] = stand(world, 25, 36);
  assert.equal(currentObjective(world, quest('the_storm'))?.id, 'stand');
  assert.ok(barked([...heard, ...wait(world, 0.2)]).includes('timekeeper_seeker_doors'));
  stand(world, 20, 32);
  const stood: WorldEvent[] = talk(world, 'warden_returned');
  assert.deepEqual(said(stood), ['warden_returned_quiet', 'warden_returned_fair']);
  assert.equal(world.flags['seeker_stand'], 'stood');
  assert.ok(barked(stood).includes('warden_returned_two'));
  const seeker: MonsterState = must(living(world, 'the_seeker')[0], 'the Seeker');
  assert.equal(seeker.level, 50);
  const boss: BossDef = must(seeker.def.boss, 'the Seeker is a boss');
  assert.equal(boss.title, 'the Seeker');
  assert.equal(boss.firstKill?.flag, 'seeker_defeated');
  assert.ok(hasNpc(world, 'warden_returned'));
  kill(world, seeker, directionOf(0));
  stepBosses(world);
  const ended: WorldEvent[] = [...world.events, ...wait(world, 0.5)];
  assert.equal(world.flags['seeker_defeated'], 'defeated');
  assert.ok(ended.some((event: WorldEvent): boolean => event.type === 'act_ended' && event.act === 'act_2'));
  assert.equal(currentObjective(world, quest('the_storm'))?.id, 'fire');
  wait(world, LEAVE);
  assert.equal(hasNpc(world, 'warden_returned'), false);
});

void test('after the Seeker the Warden stands at the Hideout fire, and a hero who left ten moments untouched is given a Legendary by Reeve', (): void => {
  const world: World = after('hideout', { warden_returned: 'returned', seeker_stand: 'stood', seeker_defeated: 'defeated', warden_fell: 'fell', ledger_keeper_defeated: 'defeated' }, 50);
  world.quests = { ...world.quests, the_storm: 5, the_count: quest('the_count').objectives.length, the_untouched: quest('the_untouched').objectives.length, the_next_count: quest('the_next_count').objectives.length };
  world.player.tally.restraint = 10;
  world.visited.push('ledger_hall');
  stepWorld(world, [], DT);
  const warden: NpcState = npcOf(world, 'warden_returned');
  stand(world, warden.pos.x + 1, warden.pos.z);
  assert.deepEqual(said(talk(world, 'warden_returned')), ['warden_returned_back', 'warden_returned_agree', 'warden_returned_no_one']);
  assert.deepEqual(said(talk(world, 'warden_returned')), ['warden_returned_close']);
  startQuests(world);
  assert.equal(currentObjective(world, quest('the_untouched_again'))?.id, 'speak');
  const reeve: NpcState = npcOf(world, 'reeve');
  stand(world, reeve.pos.x + 1, reeve.pos.z);
  const before: number = world.ground.length;
  assert.deepEqual(said(talk(world, 'reeve')), ['reeve_column_longer', 'reeve_column_out_there']);
  const found: GroundItem[] = world.ground.slice(before).filter((ground: GroundItem): boolean => ground.content.kind === 'item' && ground.content.item.rarity === 'stormtouched');
  assert.equal(found.length, 1);
});

void test('a hero with fewer than ten untouched moments is not given the second reward', (): void => {
  const world: World = after('hideout', { seeker_defeated: 'defeated', first_choice: 'took_journal' }, 50);
  world.player.tally.restraint = 9;
  startQuests(world);
  assert.equal(currentObjective(world, quest('the_untouched_again')), null);
});
