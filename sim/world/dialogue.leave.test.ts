import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TOWN_CONTENT, TOWN_ZONE } from '../../test/town-support.ts';
import type { Content, ZoneDef, ZoneNpc } from '../content/types.ts';
import { createWorld } from './create.ts';
import type { QuestPin } from './quest-pins.ts';
import { questPins } from './quest-pins.ts';
import { stepWorld } from './step.ts';
import { setFlags } from './story.ts';
import type { NpcState, World } from './types.ts';

const DT: number = 1 / 60;
const LEAVE: number = 2;

function townWith(leave: number): Content {
  const npcs: ZoneNpc[] = TOWN_ZONE.npcs.map((placed: ZoneNpc): ZoneNpc => (placed.npc === 'courier' ? { ...placed, when: [{ type: 'flag', flag: 'seen', is: 'near', not: true }], leave } : placed));
  const zone: ZoneDef = { ...TOWN_ZONE, npcs };
  return { ...TOWN_CONTENT, zones: new Map<string, ZoneDef>([...TOWN_CONTENT.zones, [zone.id, zone]]) };
}

function courier(world: World): NpcState | undefined {
  return world.npcs.find((npc: NpcState): boolean => npc.def.id === 'courier');
}

function run(world: World, seconds: number): void {
  for (let frame: number = 0; frame < Math.round(seconds / DT); frame += 1) stepWorld(world, [], DT);
}

void test('a placed figure with a leave time eases out over that time once its condition stops holding, then is gone', (): void => {
  const world: World = createWorld(townWith(LEAVE), { seed: 1, save: null });
  assert.equal(courier(world)?.fade, 1);
  setFlags(world, { seen: 'near' });
  const leaving: NpcState | undefined = courier(world);
  assert.ok(leaving !== undefined);
  run(world, LEAVE / 2);
  const half: number = courier(world)?.fade ?? -1;
  assert.ok(half > 0.4 && half < 0.6, `half way out at ${half}`);
  run(world, LEAVE / 2 + DT * 2);
  assert.equal(courier(world), undefined);
  assert.ok(world.npcs.some((npc: NpcState): boolean => npc.def.id === 'keeper'));
});

void test('a placed figure without a leave time is gone as soon as its condition stops holding', (): void => {
  const world: World = createWorld(townWith(0), { seed: 2, save: null });
  assert.ok(courier(world) !== undefined);
  setFlags(world, { seen: 'near' });
  assert.equal(courier(world), undefined);
});

void test('a figure whose condition holds again before it has gone is drawn whole again', (): void => {
  const world: World = createWorld(townWith(LEAVE), { seed: 3, save: null });
  setFlags(world, { seen: 'near' });
  run(world, LEAVE / 2);
  assert.ok((courier(world)?.fade ?? 1) < 1);
  setFlags(world, { seen: 'far' });
  run(world, DT);
  assert.equal(courier(world)?.fade, 1);
  run(world, LEAVE * 2);
  assert.equal(courier(world)?.fade, 1);
});

void test('a figure that is leaving cannot be talked to', (): void => {
  const world: World = createWorld(townWith(LEAVE), { seed: 4, save: null });
  setFlags(world, { seen: 'near' });
  const leaving: NpcState | undefined = courier(world);
  assert.ok(leaving !== undefined);
  stepWorld(world, [{ type: 'talk', npcId: leaving.id }], DT);
  assert.equal(world.player.intent.type, 'idle');
  assert.equal(world.dialogue, null);
  assert.ok(!questPins(world, null).some((pin: QuestPin): boolean => pin.kind === 'npc' && pin.npcId === leaving.id));
});
