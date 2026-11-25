import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, withoutGlitches, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { startQuests } from './quests.ts';
import { stepWorld } from './step.ts';
import { setFlags } from './story.ts';
import { enterZone } from './zones.ts';
import type { GroundItem, NpcState, World, WorldEvent } from './types.ts';

const SHIPPED: Content = loadContent();
const DT: number = 1 / 60;
const LIMIT: number = 30;

function past(id: string): World {
  const world: World = withoutGlitches(worldIn(SHIPPED, id, 5));
  world.flags['keeper_defeated'] = 'defeated';
  startQuests(world);
  setFlags(world, { opening: 'begun' });
  world.events = [];
  return world;
}

function talk(world: World, id: string): string[] {
  const npc: NpcState = must(world.npcs.find((candidate: NpcState): boolean => candidate.def.id === id), `npc ${id}`);
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(LIMIT / DT) && world.dialogue === null; step += 1) events.push(...stepWorld(world, step === 0 ? [{ type: 'talk', npcId: npc.id }] : [], DT));
  for (let guard: number = 0; guard < 50 && world.dialogue !== null; guard += 1) events.push(...stepWorld(world, [{ type: 'advance' }], DT));
  events.push(...stepWorld(world, [], DT));
  return events.flatMap((event: WorldEvent): string[] => (event.type === 'dialogue_line' ? [event.line.id] : []));
}

function hasGuide(world: World): boolean {
  return world.npcs.some((npc: NpcState): boolean => npc.def.id === 'warden_guide');
}

function inHideout(world: World): void {
  enterZone(world, must(SHIPPED.zones.get('hideout'), 'the hideout'), { type: 'exit', exit: 'west' });
}

void test('the Warden who stands at the Hideout fire goes ahead into the caves once the hero has met him there, and is not in two places at once', (): void => {
  const world: World = past('under_hall');
  inHideout(world);
  assert.equal(hasGuide(world), true);
  enterZone(world, must(SHIPPED.zones.get('under_hall'), 'the caves'), { type: 'exit', exit: 'lair' });
  talk(world, 'warden_below');
  assert.equal(world.flags['warden_ahead'], 'ahead');
  inHideout(world);
  assert.equal(hasGuide(world), false);
});

void test('a hero who reaches the bottom of the caves without meeting the Warden above has still left him behind at the fire', (): void => {
  const world: World = past('under_hall_3');
  world.player.pos = { x: 150, z: 126 };
  stepWorld(world, [], DT);
  assert.equal(world.flags['warden_ahead'], 'ahead');
  inHideout(world);
  assert.equal(hasGuide(world), false);
});

void test('with a restraint reward owed, Reeve answers the quest on the very next talk and tells of the lantern after it', (): void => {
  const world: World = past('hideout');
  world.flags['first_choice'] = 'took_journal';
  world.player.tally.restraint = 5;
  world.visited.push('ledger_hall');
  setFlags(world, { ledger_keeper_defeated: 'defeated', warden_fell: 'fell' });
  stepWorld(world, [], DT);
  talk(world, 'reeve');
  const before: number = world.ground.length;
  assert.deepEqual(talk(world, 'reeve'), ['reeve_other_column', 'reeve_kept_it']);
  const found: GroundItem[] = world.ground.slice(before).filter((ground: GroundItem): boolean => ground.content.kind === 'item' && ground.content.item.rarity === 'stormtouched');
  assert.equal(found.length, 1);
  assert.deepEqual(talk(world, 'reeve'), ['reeve_into_fire', 'reeve_not_lost']);
});
