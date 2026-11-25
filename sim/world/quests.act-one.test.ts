import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, withoutGlitches, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, QuestDef } from '../content/types.ts';
import { directionOf } from '../math.ts';
import { kill } from './combat.ts';
import { restraintOf } from './conditions.ts';
import { currentObjective, startQuests } from './quests.ts';
import { stepWorld } from './step.ts';
import { setFlags } from './story.ts';
import type { GroundItem, MonsterState, NpcState, World, WorldEvent } from './types.ts';

const SHIPPED: Content = loadContent();
const DT: number = 1 / 60;
const LIMIT: number = 30;

function npcOf(world: World, id: string): NpcState {
  return must(world.npcs.find((npc: NpcState): boolean => npc.def.id === id), `npc ${id}`);
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

function quest(id: string): QuestDef {
  return must(SHIPPED.quests.get(id), `quest ${id}`);
}

function living(world: World, monster: string): MonsterState[] {
  return world.monsters.filter((candidate: MonsterState): boolean => candidate.alive && candidate.def.id === monster);
}

function past(id: string): World {
  const world: World = withoutGlitches(worldIn(SHIPPED, id, 5));
  world.flags['keeper_defeated'] = 'defeated';
  startQuests(world);
  setFlags(world, { opening: 'begun' });
  world.events = [];
  return world;
}

void test('the Warden waits in the Hourfall Caves and tells the hero what lives there and what burns below', (): void => {
  const world: World = past('under_hall');
  assert.equal(currentObjective(world, quest('the_bottom'))?.id, 'caves');
  assert.deepEqual(said(talk(world, 'warden_below')), ['warden_below_runs_down', 'warden_below_runoff', 'warden_below_hungry', 'warden_below_burned', 'warden_below_meet']);
  assert.equal(currentObjective(world, quest('the_bottom'))?.id, 'bottom');
  assert.deepEqual(said(talk(world, 'warden_below')), ['warden_below_close']);
});

void test('at the bottom the Warden holds the way, the Reclaimer comes up for him, and once he sends the hero on he is gone and more of them stand where he was', (): void => {
  const world: World = past('under_hall_3');
  stand(world, 150, 126);
  stand(world, 150, 126);
  assert.equal(currentObjective(world, quest('the_bottom'))?.id, 'hold');
  assert.deepEqual(living(world, 'timekeeper_reclaimer'), []);
  const held: WorldEvent[] = talk(world, 'warden_below');
  assert.deepEqual(said(held), ['warden_below_as_far', 'warden_below_behind_me']);
  assert.equal(world.flags['warden_stand'], 'held');
  assert.ok(barked(held).includes('warden_below_not_for_you'));
  const reclaimer: MonsterState = must(living(world, 'timekeeper_reclaimer')[0], 'the Reclaimer');
  assert.ok(barked(stand(world, 157, 109)).includes('warden_below_not_forgotten'));
  kill(world, reclaimer, directionOf(0));
  setFlags(world, { reclaimer_defeated: 'defeated' });
  stepWorld(world, [], DT);
  assert.equal(currentObjective(world, quest('the_bottom'))?.id, 'go');
  stand(world, 150, 128);
  assert.deepEqual(said(talk(world, 'warden_below')), ['warden_below_hold_way', 'warden_below_go_now', 'warden_below_never_its_own']);
  assert.equal(world.flags['warden_fell'], 'fell');
  assert.equal(world.npcs.some((npc: NpcState): boolean => npc.def.id === 'warden_below'), false);
  assert.ok(living(world, 'timekeeper_marshal').length > 0);
  assert.equal(currentObjective(world, quest('the_bottom'))?.id, 'down');
});

void test('once the Warden has fallen he no longer stands at the Hideout fire, and Reeve tells of it after his own story', (): void => {
  const world: World = past('hideout');
  assert.ok(world.npcs.some((npc: NpcState): boolean => npc.def.id === 'warden_guide'));
  assert.equal(world.npcs.some((npc: NpcState): boolean => npc.def.id === 'reeve'), false);
  world.visited.push('ledger_hall');
  setFlags(world, { ledger_keeper_defeated: 'defeated', warden_fell: 'fell' });
  stepWorld(world, [], DT);
  assert.equal(world.npcs.some((npc: NpcState): boolean => npc.def.id === 'warden_guide'), false);
  assert.equal(currentObjective(world, quest('the_count'))?.id, 'fire');
  const freed: WorldEvent[] = talk(world, 'reeve');
  assert.deepEqual(said(freed), ['reeve_kept_book', 'reeve_believed', 'reeve_wrong', 'reeve_one_book', 'reeve_not_again']);
  assert.equal(world.flags['reeve_freed'], 'freed');
  assert.ok(freed.some((event: WorldEvent): boolean => event.type === 'act_ended' && event.act === 'act_1'));
  assert.deepEqual(said(talk(world, 'reeve')), ['reeve_into_fire', 'reeve_not_lost']);
  assert.deepEqual(said(talk(world, 'reeve')), ['reeve_ask_again']);
});

void test('Reeve names the fight and yields in words of his own', (): void => {
  const reeve = must(SHIPPED.monsters.get('ledger_keeper'), 'the ledger boss');
  assert.equal(reeve.name, 'Reeve');
  assert.deepEqual(must(reeve.boss, 'boss').barks.death, ['ledger_keeper_enough', 'ledger_keeper_the_pen']);
});

void test('restraint is the moments left untouched plus a journal left lying in the mist', (): void => {
  const world: World = past('hideout');
  world.visited.push('hall_of_time');
  world.player.tally.restraint = 3;
  assert.equal(restraintOf(world), 4);
  world.flags['first_choice'] = 'took_journal';
  assert.equal(restraintOf(world), 3);
});

void test('a freed Reeve gives a hero who left five moments untouched a legendary find, and gives nothing to one who left four', (): void => {
  for (const [left, given] of [[5, 1], [4, 0]] as const) {
    const world: World = past('hideout');
    world.flags['first_choice'] = 'took_journal';
    world.player.tally.restraint = left;
    world.visited.push('ledger_hall');
    setFlags(world, { ledger_keeper_defeated: 'defeated' });
    stepWorld(world, [], DT);
    talk(world, 'reeve');
    const before: number = world.ground.length;
    const column: string[] = said(talk(world, 'reeve'));
    const found: GroundItem[] = world.ground.slice(before).filter((ground: GroundItem): boolean => ground.content.kind === 'item' && ground.content.item.rarity === 'stormtouched');
    assert.equal(found.length, given, `left ${left}`);
    assert.deepEqual(column, given === 1 ? ['reeve_other_column', 'reeve_kept_it'] : ['reeve_ask_again'], `left ${left}`);
  }
});
