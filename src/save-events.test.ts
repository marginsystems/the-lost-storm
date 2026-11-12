import assert from 'node:assert/strict';
import { test } from 'node:test';
import { botPlay, CAREFUL, createBot } from '../sim/bot.ts';
import type { Bot, BotReport } from '../sim/bot.ts';
import { loadContent } from '../sim/content/content.ts';
import type { Content } from '../sim/content/types.ts';
import { toSave } from '../sim/save.ts';
import { createWorld } from '../sim/world/create.ts';
import { stepWorld } from '../sim/world/step.ts';
import { enterZone } from '../sim/world/zones.ts';
import type { World, WorldEvent } from '../sim/world/types.ts';
import { must } from '../test/support.ts';
import { changesSave } from './save-events.ts';

const content: Content = loadContent();
const PLAY = { seed: 11, dt: 1 / 60, fewestChanges: 50 } as const;

function kept(world: World): string {
  const { nextItemUid: _nextItemUid, ...rest } = toSave(world);
  return JSON.stringify(rest);
}

void test('a step that changes nothing a save holds does not ask for one', (): void => {
  const world: World = createWorld(content, { seed: PLAY.seed, save: null });
  const before: string = kept(world);
  const events: WorldEvent[] = stepWorld(world, [], PLAY.dt);
  assert.equal(kept(world), before);
  assert.equal(changesSave(events), false);
  assert.equal(changesSave([]), false);
});

void test('through a whole play of the act, every step that changes what a save holds reports an event that asks for a save', (): void => {
  const world: World = createWorld(content, { seed: PLAY.seed, save: null });
  const missed: string[] = [];
  let before: string = kept(world);
  let changes: number = 0;
  const bot: Bot = createBot(world, CAREFUL, (events: readonly WorldEvent[]): void => {
    const after: string = kept(world);
    if (after === before) return;
    before = after;
    changes += 1;
    if (!changesSave(events)) missed.push(`a step with only [${events.map((event: WorldEvent): string => event.type).join(', ')}] changed the save`);
  });
  const report: BotReport = botPlay(bot);
  assert.equal(report.stuck, null);
  assert.ok(changes >= PLAY.fewestChanges, `only ${changes} steps changed the save`);
  assert.deepEqual(missed, []);
});

void test('a respawn asks for a save because it can cost experience', (): void => {
  assert.equal(changesSave([{ type: 'player_respawn' }]), true);
});

void test('drinking a flask and refilling flasks each ask for a save', (): void => {
  const world: World = createWorld(content, { seed: PLAY.seed, save: null });
  enterZone(world, must(content.zones.get('duskway'), 'duskway'), { type: 'start' });
  world.monsters = [];
  world.player.life = 1;
  const before: string = kept(world);
  const drink: WorldEvent[] = stepWorld(world, [{ type: 'flask', slot: 0 }], PLAY.dt);
  assert.notEqual(kept(world), before);
  assert.equal(changesSave(drink), true);
  enterZone(world, must(content.zones.get(content.world.start), 'start'), { type: 'start' });
  const spent: string = kept(world);
  const refill: WorldEvent[] = stepWorld(world, [], PLAY.dt);
  assert.notEqual(kept(world), spent);
  assert.equal(changesSave(refill), true);
  assert.equal(changesSave(stepWorld(world, [], PLAY.dt)), false);
});
