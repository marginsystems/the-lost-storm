import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../test/arena-support.ts';
import { OUTPOST_CONTENT } from '../test/road-support.ts';
import { finishQuests, must } from '../test/support.ts';
import { wheelReach } from './bot-spin.ts';
import { botFight, botInDanger, botPlay, botRoute, botStep, botTalk, botTravelTo, botWalkTo, createBot } from './bot.ts';
import { hotGround } from './bot-ground.ts';
import type { Bot, BotReport } from './bot.ts';
import { loadContent } from './content/content.ts';
import { exitWithheld } from './content/withheld.ts';
import type { Condition, Content, QuestDef, SkillDef, ZoneDef } from './content/types.ts';
import { offenceOf } from './world/combat.ts';
import { resolveSkill } from './stats.ts';
import type { Vec2 } from './math.ts';
import { stepWorld } from './world/step.ts';
import { createWorld } from './world/create.ts';
import { placeHazard } from './world/hazards.ts';
import { placeArea } from './world/areas.ts';
import { startSkill } from './world/skills.ts';
import type { ItemInstance, MonsterState, World } from './world/types.ts';
import { isUnidentified, veiled } from './identify.ts';
import { generateItem } from './items.ts';
import { createRng } from './rng.ts';

const content: Content = loadContent();

const ACT = {
  seeds: [11, 12, 13],
  minSeconds: 5,
  maxSeconds: 240,
  minLevel: 1,
  maxLevel: 4,
  maxDeaths: 1,
} as const;

function waitsOnFlag(conditions: readonly Condition[]): boolean {
  return conditions.some((condition: Condition): boolean => condition.type === 'flag' && !condition.not);
}

function waitsOnLevel(conditions: readonly Condition[]): boolean {
  return conditions.some((condition: Condition): boolean => condition.type === 'level' && !condition.not && condition.atLeast > ACT.maxLevel);
}

function levelGatedZones(): ReadonlySet<string> {
  const open: Set<string> = new Set<string>([content.world.start]);
  const queue: string[] = [content.world.start];
  while (queue.length > 0) {
    const from: ZoneDef | undefined = content.zones.get(queue.pop() ?? '');
    for (const exit of from?.exits ?? []) {
      if (open.has(exit.to) || waitsOnLevel(exit.requires) || exitWithheld(content, exit)) continue;
      open.add(exit.to);
      queue.push(exit.to);
    }
  }
  return new Set<string>([...content.zones.keys()].filter((id: string): boolean => !open.has(id)));
}

void test('the bot plays the whole act from a fresh save: every quest, in the time and at the level it is tuned for', (): void => {
  const townQuests: string[] = [...content.quests.values()].filter((quest: QuestDef): boolean => !waitsOnFlag(quest.when) && !quest.objectives.some((objective): boolean => waitsOnFlag(objective.when) || waitsOnLevel(objective.when))).map((quest: QuestDef): string => quest.id).toSorted();
  const gated: ReadonlySet<string> = levelGatedZones();
  const needed: string[] = [...content.zones.values()].filter((zone): boolean => zone.kind !== 'void' && !gated.has(zone.id)).map((zone): string => zone.id).toSorted();
  for (const seed of ACT.seeds) {
    const world: World = createWorld(content, { seed, save: null });
    const report: BotReport = botPlay(createBot(world));
    assert.equal(report.stuck, null, `seed ${seed}`);
    assert.deepEqual(report.completed.toSorted(), townQuests, `seed ${seed}`);
    assert.ok(report.seconds >= ACT.minSeconds && report.seconds <= ACT.maxSeconds, `seed ${seed} took ${report.seconds.toFixed(1)} seconds`);
    assert.ok(world.player.level >= ACT.minLevel && world.player.level <= ACT.maxLevel, `seed ${seed} ended at level ${world.player.level}`);
    assert.ok(report.deaths <= ACT.maxDeaths, `seed ${seed} died ${report.deaths} times`);
    assert.deepEqual(world.visited.toSorted(), needed, `seed ${seed}`);
  }
});

void test('the bot walks, talks and travels between zones', (): void => {
  const world: World = finishQuests(createWorld(content, { seed: 12, save: null }));
  const bot: Bot = createBot(world);
  assert.deepEqual(botRoute(world, 'hall_of_time')?.map((exit): string => exit.id), []);
  assert.equal(botRoute(world, 'nowhere'), null);
  assert.deepEqual(botRoute(world, 'hideout')?.map((exit): string => exit.id), ['east']);
  assert.equal(botTravelTo(bot, 'hideout'), true);
  assert.equal(world.zone.id, 'hideout');
  assert.equal(botWalkTo(bot, 'hideout', { x: 22, z: 21 }, 3), true);
  assert.equal(botTalk(bot, 'warden_guide'), true);
  assert.equal(world.dialogue, null);
  assert.equal(botTalk(bot, 'nobody'), false);
});

void test('the bot routes through a chain of exits and back', (): void => {
  const world: World = finishQuests(createWorld(OUTPOST_CONTENT, { seed: 12, save: null }));
  const bot: Bot = createBot(world);
  assert.equal(world.zone.id, 'hub');
  assert.deepEqual(botRoute(world, 'outpost')?.map((exit): string => exit.id), ['outpost_stair']);
  assert.equal(botTravelTo(bot, 'outpost'), true);
  assert.equal(world.zone.id, 'outpost');
  assert.deepEqual(botRoute(world, 'hub')?.map((exit): string => exit.id), ['stair']);
  assert.equal(botTravelTo(bot, 'hub'), true);
  assert.equal(world.zone.id, 'hub');
});

void test('the bot will not route through an exit that is still locked', (): void => {
  const world: World = createWorld(content, { seed: 13, save: null });
  assert.equal(botTravelTo(createBot(world), 'between'), true);
  assert.equal(world.zone.id, 'between');
  assert.equal(botRoute(world, 'hall_of_time'), null);
  assert.equal(botTravelTo(createBot(world), 'hall_of_time'), false);
  assert.equal(world.zone.id, 'between');
});

void test('the bot reads a live mark on the ground and the landing spot of a leap as danger', (): void => {
  const world: World = arena(21);
  const caller: MonsterState = place(world, 'test_caller', { x: ARENA_CENTRE.x + 8, z: ARENA_CENTRE.z });
  const mark: SkillDef = must(world.content.skills.get('test_mark'), 'mark');
  startSkill(world, caller, mark, { x: ARENA_CENTRE.x - caller.pos.x, z: ARENA_CENTRE.z - caller.pos.z });
  assert.equal(botInDanger(world, ARENA_CENTRE), true);
  assert.equal(botInDanger(world, { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z - 6 }), false);
  caller.action = null;
  placeHazard(world, offenceOf(caller), mark, ARENA_CENTRE);
  assert.equal(botInDanger(world, ARENA_CENTRE), true);
  assert.equal(botInDanger(world, { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z - 6 }), false);
  world.hazards = [];
  const ghoul: MonsterState = place(world, 'test_ghoul', { x: ARENA_CENTRE.x - 8, z: ARENA_CENTRE.z });
  startSkill(world, ghoul, must(world.content.skills.get('test_pounce'), 'pounce'), { x: 8, z: 0 });
  assert.equal(botInDanger(world, { x: ARENA_CENTRE.x - 0.8, z: ARENA_CENTRE.z }), true);
  assert.equal(botInDanger(world, { x: ARENA_CENTRE.x - 7, z: ARENA_CENTRE.z + 4 }), false);
});

const CHARGE_TEST = {
  brute: 2.2,
  slamAt: 0.1,
  watch: 2,
  letGoBy: 0.5,
  slamReach: 3,
  slamWindup: 1.2,
} as const;

interface ChargeWatch {
  hurt: number;
  letGoAt: number;
  farthest: number;
}

void test('a bot holding a charge lets it go when a blow is coming at it, and steps out of the blow', (): void => {
  const world: World = arena(24);
  const brute: MonsterState = place(world, 'test_brute', { x: ARENA_CENTRE.x + CHARGE_TEST.brute, z: ARENA_CENTRE.z });
  world.player.pos = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z };
  world.player.skills[0] = must(world.content.skills.get('cleave_heave'), 'cleave_heave');
  const seen: ChargeWatch = { hurt: 0, letGoAt: Infinity, farthest: 0 };
  let start: number = world.time;
  const bot: Bot = createBot(world, { dodges: true, reaction: 0 }, (events): void => {
    for (const event of events) if (event.type === 'damage' && event.targetTeam === 'player') seen.hurt += event.amount;
    if (world.time - start <= CHARGE_TEST.slamWindup) seen.farthest = Math.max(seen.farthest, Math.hypot(world.player.pos.x - brute.pos.x, world.player.pos.z - brute.pos.z));
    if (world.player.action !== null && !world.player.held.includes(0)) seen.letGoAt = Math.min(seen.letGoAt, world.time);
  });
  botStep(bot, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: brute.pos, targetId: brute.id }]);
  start = world.time;
  while (world.time - start < CHARGE_TEST.slamAt) botStep(bot, []);
  startSkill(world, brute, must(world.content.skills.get('test_slam'), 'test_slam'), { x: world.player.pos.x - brute.pos.x, z: world.player.pos.z - brute.pos.z });
  botFight(bot, (): boolean => world.time - start >= CHARGE_TEST.watch, null);
  assert.ok(seen.letGoAt - start < CHARGE_TEST.letGoBy, `let go at ${seen.letGoAt - start}`);
  assert.equal(seen.hurt, 0);
  assert.ok(seen.farthest > CHARGE_TEST.slamReach, `got only ${seen.farthest} from the slam`);
});

const HOT_TEST = {
  foe: 1.4,
  outside: 4,
  patch: 1.6,
  watch: 0.8,
  ring: 2.8,
  ringPatches: 8,
  coolStep: 4,
  idle: 60,
} as const;

void test('ground that hurts while you stand in it is danger: a foe\'s burning patch and a heated floor, never the hero\'s own fire', (): void => {
  const world: World = arena(25);
  const foe: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x + HOT_TEST.outside * 2, z: ARENA_CENTRE.z });
  const patch: SkillDef = must(world.content.skills.get('cinder_patch'), 'cinder_patch');
  assert.equal(hotGround(world, ARENA_CENTRE), false);
  placeArea(world, offenceOf(world.player), patch, ARENA_CENTRE);
  assert.equal(hotGround(world, ARENA_CENTRE), false);
  world.areas = [];
  placeArea(world, offenceOf(foe), patch, ARENA_CENTRE);
  assert.equal(hotGround(world, ARENA_CENTRE), true);
  assert.equal(botInDanger(world, ARENA_CENTRE), true);
  assert.equal(hotGround(world, { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + HOT_TEST.outside }), false);
  world.areas = [];
  world.zone = { ...world.zone, floors: Object.fromEntries(Object.keys(world.zone.floors).map((tile: string): [string, string] => [tile, 'vent_ground'])) };
  assert.equal(hotGround(world, ARENA_CENTRE), true);
});

void test('a bot fighting from a foe\'s burning patch steps out by a short step that keeps the foe in reach', (): void => {
  const world: World = arena(26);
  world.player.pos = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z };
  const foe: MonsterState = place(world, 'test_rower', { x: ARENA_CENTRE.x + HOT_TEST.foe, z: ARENA_CENTRE.z });
  const patch: SkillDef = must(world.content.skills.get('cinder_patch'), 'cinder_patch');
  placeArea(world, offenceOf(foe), patch, { x: ARENA_CENTRE.x - HOT_TEST.patch / 2, z: ARENA_CENTRE.z });
  const bot: Bot = createBot(world, { dodges: true, reaction: 0 });
  const start: number = world.time;
  botFight(bot, (): boolean => world.time - start >= HOT_TEST.watch, null);
  assert.equal(hotGround(world, world.player.pos), false);
  const reach: number = must(world.player.skills[0], 'basic attack').engageRange;
  assert.ok(Math.hypot(world.player.pos.x - foe.pos.x, world.player.pos.z - foe.pos.z) - foe.radius <= reach + world.player.radius, 'the foe stays in reach');
});

void test('a bot on a foe\'s burning patch stays to land the blow that kills a foe in reach, and steps out once it is down', (): void => {
  const world: World = arena(28);
  world.player.pos = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z };
  const foe: MonsterState = place(world, 'test_rower', { x: ARENA_CENTRE.x + HOT_TEST.foe, z: ARENA_CENTRE.z });
  foe.life = 1;
  const patch: SkillDef = must(world.content.skills.get('cinder_patch'), 'cinder_patch');
  const from: Vec2 = { ...world.player.pos };
  placeArea(world, offenceOf(foe), patch, { x: from.x - HOT_TEST.patch / 2, z: from.z });
  const bot: Bot = createBot(world, { dodges: true, reaction: 0 });
  const start: number = world.time;
  const watch: { wandered: number } = { wandered: 0 };
  botFight(bot, (): boolean => {
    if (foe.alive) watch.wandered = Math.max(watch.wandered, Math.hypot(world.player.pos.x - from.x, world.player.pos.z - from.z));
    return !foe.alive || world.time - start >= HOT_TEST.watch;
  }, null);
  assert.equal(foe.alive, false);
  assert.ok(watch.wandered < HOT_TEST.coolStep / 4, 'it swung where it stood');
});

function spinningAt(world: World, foe: MonsterState): SkillDef {
  const spin: SkillDef = resolveSkill(world.content, must(world.content.skills.get('cleave'), 'cleave'), ['whirling_cleave', 'endless_turn']);
  world.player.skills = [spin, null, null, null, null, null];
  world.player.mana = 200;
  foe.aggro = true;
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: foe.pos, targetId: foe.id }], 1 / 60);
  world.player.skills = [spin, null, null, null, null, null];
  assert.ok(world.player.action !== null);
  return spin;
}

void test('a spinning bot on a foe\'s burning ground steps out only by a short step that keeps the pack in the wheel, and otherwise keeps turning where it stands', (): void => {
  const world: World = arena(27);
  world.player.pos = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z };
  const foe: MonsterState = place(world, 'test_rower', { x: ARENA_CENTRE.x + HOT_TEST.foe, z: ARENA_CENTRE.z });
  const spin: SkillDef = spinningAt(world, foe);
  foe.action = null;
  foe.cooldowns = { [foe.def.skill]: HOT_TEST.idle };
  const patch: SkillDef = must(world.content.skills.get('cinder_patch'), 'cinder_patch');
  const from: Vec2 = { ...world.player.pos };
  placeArea(world, offenceOf(foe), patch, from);
  for (let turn: number = 0; turn < HOT_TEST.ringPatches; turn += 1) {
    const angle: number = (turn / HOT_TEST.ringPatches) * Math.PI * 2;
    placeArea(world, offenceOf(foe), patch, { x: from.x + Math.cos(angle) * HOT_TEST.ring, z: from.z + Math.sin(angle) * HOT_TEST.ring });
  }
  assert.equal(hotGround(world, from), true);
  let steps: number = 0;
  botFight(createBot(world), (): boolean => (steps += 1) > 1, null);
  const held: Vec2 | null = goalOf(world);
  assert.ok(held === null || Math.hypot(held.x - from.x, held.z - from.z) <= HOT_TEST.coolStep, 'no far walk away from the pack');
  world.areas = world.areas.slice(0, 1);
  steps = 0;
  botFight(createBot(world), (): boolean => (steps += 1) > 1, null);
  const goal: Vec2 = must(goalOf(world), 'a short step');
  assert.equal(hotGround(world, goal), false);
  assert.ok(Math.hypot(goal.x - from.x, goal.z - from.z) <= HOT_TEST.coolStep);
  assert.ok(Math.hypot(goal.x - foe.pos.x, goal.z - foe.pos.z) - foe.radius <= wheelReach(spin), 'the foe stays in the wheel');
});

void test('a fight that makes no progress for twelve seconds is dropped, and the foe is left alone for a while', (): void => {
  const world: World = createWorld(content, { seed: 21, save: null });
  const bot: Bot = createBot(world);
  const foe: MonsterState | undefined = world.monsters.find((monster: MonsterState): boolean => monster.alive);
  assert.ok(foe !== undefined);
  foe.aggro = true;
  foe.pos = { x: world.player.pos.x + 3, z: world.player.pos.z };
  bot.focus = foe.id;
  bot.fightAt = world.time;
  bot.progressAt = world.time - 20;
  botFight(bot, (): boolean => false, null);
  assert.ok((bot.ignored.get(foe.id) ?? 0) > world.time + 100);
});

void test('a foe that was dropped is not picked again as the preferred one, and the fight records which foe it is on', (): void => {
  const world: World = createWorld(content, { seed: 22, save: null });
  const bot: Bot = createBot(world);
  const foe: MonsterState | undefined = world.monsters.find((monster: MonsterState): boolean => monster.alive);
  assert.ok(foe !== undefined);
  foe.aggro = true;
  foe.pos = { x: world.player.pos.x + 3, z: world.player.pos.z };
  bot.ignored.set(foe.id, world.time + 1000);
  botFight(bot, (): boolean => false, foe.def.id);
  const intent = world.player.intent;
  assert.ok(intent.type !== 'attack' || intent.targetId !== foe.id);
  bot.ignored.clear();
  botFight(bot, (): boolean => world.player.intent.type === 'attack', foe.def.id);
  assert.notEqual(bot.focus, -1);
});

function goalOf(world: World): Vec2 | null {
  return world.player.action?.goal ?? null;
}

void test('a careful bot caught in a telegraphed swing while the Millwheel turns steers the wheel out of it', (): void => {
  const world: World = arena(22);
  const spin: SkillDef = resolveSkill(world.content, must(world.content.skills.get('cleave'), 'cleave'), ['whirling_cleave', 'endless_turn']);
  assert.ok(spin.press?.type === 'channel');
  world.player.skills = [spin, null, null, null, null, null];
  world.player.mana = 200;
  const brute: MonsterState = place(world, 'test_brute', { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
  brute.aggro = true;
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: brute.pos, targetId: brute.id }], 1 / 60);
  world.player.skills = [spin, null, null, null, null, null];
  assert.ok(world.player.action !== null);
  brute.cooldowns = {};
  startSkill(world, brute, must(world.content.skills.get('test_slam'), 'slam'), { x: world.player.pos.x - brute.pos.x, z: world.player.pos.z - brute.pos.z });
  assert.equal(botInDanger(world, world.player.pos), true);
  let steps: number = 0;
  botFight(createBot(world), (): boolean => (steps += 1) > 1, null);
  const goal: Vec2 | null = goalOf(world);
  assert.ok(goal !== null);
  assert.equal(botInDanger(world, goal), false);
});

void test('the bot reads what it carries for free as soon as its bag changes', (): void => {
  const bot: Bot = createBot(createWorld(content, { seed: 21, save: null }));
  const hidden: ItemInstance = veiled(content, must(generateItem(content, createRng(21), 9001, 8, 'gale_charm', 'rare'), 'rare'));
  bot.world.player.inventory.fill(null);
  bot.world.player.inventory[0] = hidden;
  const gold: number = bot.world.player.gold;
  bot.bagChanged = true;
  botStep(bot, []);
  const held: ItemInstance = must(bot.world.player.inventory[0], 'held');
  assert.equal(isUnidentified(held), false);
  assert.deepEqual(held.affixes, hidden.affixes);
  assert.equal(bot.world.player.gold, gold);
});
