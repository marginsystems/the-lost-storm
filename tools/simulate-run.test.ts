import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOT, botWalkTo, createBot } from '../sim/bot.ts';
import type { Bot } from '../sim/bot.ts';
import { nearestWalkable } from '../sim/nav/grid.ts';
import { createWorld } from '../sim/world/create.ts';
import { forceStrike } from '../sim/world/moments.ts';
import { stepWorld } from '../sim/world/step.ts';
import type { MomentState, World } from '../sim/world/types.ts';
import { POLICIES } from './simulate-policies.ts';
import type { Job, Scenario } from './simulate-run.ts';
import { CONTENT, farm, runJob, scenarioName } from './simulate-run.ts';
import type { Fight, RunSummary } from './simulate-summary.ts';
import { summarize } from './simulate-summary.ts';

const GUARD = {
  seeds: [1, 2, 3],
  sliceMinutes: { min: 1, max: 6 },
  firstFight: { min: 10, max: 45 },
  standingSurvives: 20,
  standingLimit: 60,
  farmMinutes: 30,
  farmLevel: { min: 6, max: 13 },
  rareShare: 2 / 3,
  strikeGap: 6,
  dormantWait: 0.5,
  over: { hero: 9, low: 1, near: 7, minutes: 8, seed: 1, drastic: 1 / 3 },
} as const;

function runs(scenario: Scenario, skill: string): RunSummary[] {
  return GUARD.seeds.map((seed: number): RunSummary => summarize(runJob({ scenario, skill, build: 'mixed', seed } satisfies Job, POLICIES)));
}

const slices: readonly RunSummary[] = runs({ kind: 'slice' }, 'average');

void test('scenarios have readable names', (): void => {
  assert.deepEqual([scenarioName({ kind: 'slice' }), scenarioName({ kind: 'farm', minutes: 5 }), scenarioName({ kind: 'fight', moment: 'campfire', repeats: 2 }), scenarioName({ kind: 'level', level: 4, minutes: 9 }), scenarioName({ kind: 'over', hero: 9, zone: 1, minutes: 5 })], ['slice', 'farm 5m', 'fight campfire', 'level 4', 'hero 9 in level 1']);
});

void test('a level 9 hero earns drastically less experience a minute in level 1 content than in level 7 content', (): void => {
  const rate = (zone: number): number => {
    const run: RunSummary = summarize(runJob({ scenario: { kind: 'over', hero: GUARD.over.hero, zone, minutes: GUARD.over.minutes }, skill: 'careful', build: 'mixed', seed: GUARD.over.seed }, POLICIES));
    assert.equal(run.reason, 'done');
    return run.xp / Math.max(1, run.seconds);
  };
  const low: number = rate(GUARD.over.low);
  const near: number = rate(GUARD.over.near);
  assert.ok(low > 0, 'still levelling, never zero');
  assert.ok(low < near * GUARD.over.drastic, `${(low * 3600).toFixed(0)} an hour in level ${GUARD.over.low}, ${(near * 3600).toFixed(0)} in level ${GUARD.over.near}`);
});

void test('a farm that cannot reach the Hall says so instead of idling', (): void => {
  const world: World = createWorld(CONTENT, { seed: 2, save: null, opening: true });
  assert.equal(farm(createBot(world), world.time + 60, true, (): boolean => false), false);
});

void test('an average player walks from waking to the end card through every milestone in one to six minutes', (): void => {
  for (const run of slices) {
    assert.equal(run.reason, 'done', `seed ${run.seed ?? '?'}`);
    for (const rule of POLICIES.milestones) assert.ok(run.milestones[rule.name] !== undefined, `seed ${run.seed ?? '?'} never reached ${rule.name}`);
    const minutes: number = (run.milestones[POLICIES.endCard] ?? Infinity) / 60;
    assert.ok(minutes >= GUARD.sliceMinutes.min && minutes <= GUARD.sliceMinutes.max, `seed ${run.seed ?? '?'} took ${minutes.toFixed(1)} minutes`);
  }
});

void test('the first fight lasts ten to forty-five seconds for an average player', (): void => {
  for (const run of slices) {
    const first: Fight | undefined = run.fights[0];
    assert.ok(first !== undefined && first.outcome === 'resolved', `seed ${run.seed ?? '?'}`);
    assert.ok(first.seconds >= GUARD.firstFight.min && first.seconds <= GUARD.firstFight.max, `seed ${run.seed ?? '?'}: ${first.seconds.toFixed(1)} s`);
  }
});

void test('the first fight does not kill a hero who stands still inside it for twenty seconds', (): void => {
  const first: string = 'first_fire';
  for (const seed of GUARD.seeds) {
    const world: World = createWorld(CONTENT, { seed, save: null });
    const at = nearestWalkable(world.grid, { x: world.player.pos.x + GUARD.strikeGap, z: world.player.pos.z }, GUARD.strikeGap);
    const moment: MomentState | null = at === null ? null : forceStrike(world, at, first);
    assert.ok(moment !== null);
    const bot: Bot = createBot(world, { dodges: false, reaction: 0 });
    while (moment.phase === 'mark') stepWorld(world, [], BOT.step);
    botWalkTo(bot, world.zone.id, moment.pos, BOT.arrive);
    const woke: number = world.time;
    while (world.player.alive && world.time - woke < GUARD.standingLimit && moment.phase === 'awake') stepWorld(world, [], BOT.step);
    const survived: number = world.player.alive ? GUARD.standingLimit : world.time - woke;
    assert.ok(survived >= GUARD.standingSurvives, `seed ${seed}: a standing hero fell after ${survived.toFixed(1)} s`);
  }
});

void test('a careful player farming the Hall for thirty minutes finds a rare or better in most runs and levels steadily', (): void => {
  const farms: RunSummary[] = runs({ kind: 'farm', minutes: GUARD.farmMinutes }, 'careful');
  const rare: ReadonlySet<string> = new Set<string>(CONTENT.rarities.filter((rarity): boolean => rarity.weight <= (CONTENT.rarities.find((entry): boolean => entry.id === POLICIES.rare)?.weight ?? 0)).map((rarity): string => rarity.id));
  const lucky: number = farms.filter((run: RunSummary): boolean => run.drops.some((drop): boolean => rare.has(drop.rarity))).length;
  assert.ok(lucky / farms.length >= GUARD.rareShare, `${lucky} of ${farms.length} runs found a rare`);
  for (const run of farms) assert.ok(run.endLevel >= GUARD.farmLevel.min && run.endLevel <= GUARD.farmLevel.max, `seed ${run.seed ?? '?'} ended at level ${run.endLevel}`);
});

void test('a farm that finds the hero already standing in a dormant moment lets time pass instead of spinning', (): void => {
  const world: World = createWorld(CONTENT, { seed: 3, save: null });
  world.monsters = [];
  const moment: MomentState | null = forceStrike(world, { x: world.player.pos.x, z: world.player.pos.z }, 'first_fire');
  assert.ok(moment !== null);
  while (moment.phase === 'mark') stepWorld(world, [], BOT.step);
  assert.equal(moment.phase, 'dormant');
  const start: number = world.time;
  assert.equal(farm(createBot(world), start + GUARD.dormantWait, false, (): boolean => false), true);
  assert.ok(world.time >= start + GUARD.dormantWait);
});
