import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { MomentField } from '../content/moment-types.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { distance } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import { CHESTED, echoesOf, FIELD, fieldContent, fieldWorld, fieldZone, RAID, slay, standAt } from '../../test/moment-support.ts';
import { must } from '../../test/support.ts';
import { createWorld } from './create.ts';
import { chestNear, chestReach, chestSpot } from './moment-chest.ts';
import { forceStrike } from './moments.ts';
import { stepWorld } from './step.ts';
import type { Command, GroundItem, MomentState, World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';

const DT: number = 1 / 30;
const FAR = { x: 150, z: 150 } as const;

function run(world: World, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let elapsed: number = 0; elapsed < seconds; elapsed += DT) events.push(...stepWorld(world, [], DT));
  return events;
}

function withZone(content: Content, zone: ZoneDef): Content {
  return { ...content, zones: new Map<string, ZoneDef>([...content.zones, [zone.id, zone]]) };
}

function quietField(patch: Partial<MomentField> = {}): MomentField {
  return { ...FIELD, start: 0, max: 1, interval: { min: 1000, max: 1000 }, ...patch };
}

function struck(world: World, def: string, at = { x: 40, z: 40 }): MomentState {
  standAt(world, FAR);
  const moment: MomentState = must(forceStrike(world, at, def), 'forced strike');
  run(world, world.content.moments.telegraph + DT * 2);
  assert.equal(moment.phase, 'dormant');
  return moment;
}

function act(world: World, command: Command): WorldEvent[] {
  return stepWorld(world, [command], DT);
}

function runUntil(world: World, done: () => boolean, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let elapsed: number = 0; elapsed < seconds && !done(); elapsed += DT) events.push(...stepWorld(world, [], DT));
  return events;
}

function woken(world: World, def: string): MomentState {
  const moment: MomentState = struck(world, def);
  standAt(world, moment.pos);
  run(world, DT * 2);
  assert.equal(moment.phase, 'awake');
  return moment;
}

function goldDrops(events: readonly WorldEvent[]): number[] {
  return events.flatMap((event: WorldEvent): number[] => (event.type === 'drop' && event.ground.content.kind === 'gold' ? [event.ground.content.amount] : []));
}

function chestEvents(events: readonly WorldEvent[]): WorldEvent[] {
  return events.filter((event: WorldEvent): boolean => event.type === 'moment_chest' || event.type === 'chest_opened');
}

void test('a peaceful moment wakes holding a closed chest that blocks the ground it stands on', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = struck(world, CHESTED.id);
  standAt(world, moment.pos);
  const events: WorldEvent[] = run(world, DT * 2);
  assert.equal(moment.chest, 'closed');
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'moment_chest' && event.moment === moment));
  const spot = must(chestSpot(moment), 'chest spot');
  assert.equal(isWalkable(world.grid, spot.x, spot.z), false);
  assert.equal(chestNear(world, spot), moment);
  assert.equal(chestNear(world, moment.pos), null);
});

void test('a moment that turns hostile never shows its chest and resolves and pays as before', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = struck(world, RAID.id);
  standAt(world, moment.pos);
  const woke: WorldEvent[] = run(world, DT * 2);
  assert.ok(echoesOf(world, moment).length > 0);
  assert.equal(moment.chest, 'none');
  assert.equal(chestNear(world, must(chestSpot(moment), 'chest spot')), null);
  assert.deepEqual(act(world, { type: 'open', momentId: moment.id }).filter((event: WorldEvent): boolean => event.type === 'chest_opened'), []);
  slay(world, echoesOf(world, moment));
  const after: WorldEvent[] = run(world, DT * 2);
  assert.equal(moment.outcome, 'resolved');
  assert.equal(chestEvents([...woke, ...after]).length, 0);
  assert.equal(goldDrops(after).length, 1);
  assert.ok(must(goldDrops(after)[0], 'reward gold') >= RAID.reward.goldMin);
});

void test('a moment in a field without combat never shows its chest', (): void => {
  const world: World = fieldWorld(quietField({ combat: false }));
  const moment: MomentState = woken(world, CHESTED.id);
  assert.equal(moment.chest, 'none');
  run(world, CHESTED.awake + 1);
  assert.equal(moment.outcome, 'played');
  assert.equal(world.ground.length, 0);
});

void test('clicking the chest walks the hero to it, opens it once for its gold, and the moment then fades as opened and is gone', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = woken(world, CHESTED.id);
  const spot = must(chestSpot(moment), 'chest spot');
  assert.ok(distance(world.player.pos, spot) > chestReach(world));
  const events: WorldEvent[] = act(world, { type: 'open', momentId: moment.id });
  assert.equal(moment.chest, 'closed');
  events.push(...runUntil(world, (): boolean => moment.chest !== 'closed', 6));
  assert.equal(moment.chest, 'opening');
  assert.ok(distance(world.player.pos, spot) <= chestReach(world));
  const opened = must(events.find((event: WorldEvent): boolean => event.type === 'chest_opened'), 'chest opened');
  assert.ok(opened.type === 'chest_opened');
  assert.ok(opened.gold >= must(CHESTED.chest, 'chest').goldMin);
  assert.deepEqual(goldDrops(events), [opened.gold]);
  const pile: GroundItem = must(world.ground.find((ground: GroundItem): boolean => ground.content.kind === 'gold'), 'gold pile');
  assert.ok(distance(pile.pos, spot) < 2);
  events.push(...act(world, { type: 'open', momentId: moment.id }));
  events.push(...run(world, world.content.moments.chest.open));
  assert.equal(moment.phase, 'fading');
  assert.equal(moment.outcome, 'opened');
  assert.equal(moment.chest, 'opened');
  assert.equal(events.filter((event: WorldEvent): boolean => event.type === 'chest_opened').length, 1);
  assert.deepEqual(goldDrops(events), [opened.gold]);
  assert.equal(chestNear(world, spot), null);
  run(world, world.content.moments.fade + DT);
  assert.equal(world.moments.includes(moment), false);
  assert.equal(isWalkable(world.grid, spot.x, spot.z), true);
});

function chestGoldAt(level: number): number {
  const zone = { ...fieldZone(quietField()), level };
  const world: World = createWorld(withZone(fieldContent(quietField()), zone), { seed: 5, save: null });
  enterZone(world, zone, { type: 'start' });
  const moment: MomentState = woken(world, CHESTED.id);
  const events: WorldEvent[] = act(world, { type: 'open', momentId: moment.id });
  events.push(...runUntil(world, (): boolean => moment.chest !== 'closed', 6));
  return goldDrops(events).reduce((sum: number, amount: number): number => sum + amount, 0);
}

void test('the gold in a chest grows with the zone level', (): void => {
  assert.ok(chestGoldAt(8) > chestGoldAt(1));
});

void test('an opening chest finishes as opened even when the hero walks out of the bubble at once', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = woken(world, CHESTED.id);
  act(world, { type: 'open', momentId: moment.id });
  runUntil(world, (): boolean => moment.chest !== 'closed', 6);
  standAt(world, FAR);
  const events: WorldEvent[] = run(world, world.content.moments.chest.open);
  assert.equal(moment.outcome, 'opened');
  assert.equal(goldDrops(events).length, 0);
});

void test('walking over or standing by a closed chest never opens it, and it holds the moment past its awake time and the hero leaving', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = woken(world, CHESTED.id);
  const spot = must(chestSpot(moment), 'chest spot');
  standAt(world, { x: spot.x + 1.2, z: spot.z });
  const near: WorldEvent[] = run(world, 2);
  standAt(world, FAR);
  const away: WorldEvent[] = run(world, CHESTED.awake + 1);
  assert.equal(moment.phase, 'awake');
  assert.equal(moment.chest, 'closed');
  assert.equal(chestEvents([...near, ...away]).length, 0);
  const rest: WorldEvent[] = run(world, world.content.moments.chest.linger);
  assert.equal(moment.outcome, 'played');
  assert.equal(moment.chest, 'closed');
  assert.equal(goldDrops([...near, ...away, ...rest]).length, 0);
});

void test('a field of chest moments keeps striking fresh ones after each is opened, so the hall can be farmed', (): void => {
  const world: World = fieldWorld(quietField({ table: [{ moment: CHESTED.id, weight: 1 }], interval: { min: 2, max: 2 } }));
  const seen: Set<number> = new Set<number>();
  for (let round: number = 0; round < 3; round += 1) {
    runUntil(world, (): boolean => world.moments.some((moment: MomentState): boolean => moment.phase === 'dormant' && !seen.has(moment.id)), 20);
    const moment: MomentState = must(world.moments.find((candidate: MomentState): boolean => candidate.phase === 'dormant' && !seen.has(candidate.id)), `moment ${String(round)}`);
    seen.add(moment.id);
    standAt(world, moment.pos);
    run(world, DT * 2);
    act(world, { type: 'open', momentId: moment.id });
    runUntil(world, (): boolean => moment.outcome !== null, 10);
    assert.equal(moment.outcome, 'opened');
  }
  assert.equal(seen.size, 3);
});

void test('every shipped moment that can stay peaceful holds a chest', (): void => {
  for (const def of loadContent().moments.defs.values()) {
    const peaceful: boolean = def.turnChance < 1 || !def.echoes.some((entry): boolean => entry.turns);
    assert.equal(def.chest !== null, peaceful, def.id);
  }
});
