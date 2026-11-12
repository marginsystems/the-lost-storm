import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { botFight, botInDanger, createBot } from '../bot.ts';
import type { Bot } from '../bot.ts';
import { loadContent } from '../content/content.ts';
import type { BossDef, Condition, Content, MonsterDef, QuestDef, ZoneDef, ZonePack } from '../content/types.ts';
import { phaseAt, pickBossSkill } from './boss.ts';
import { applyHit, offenceOf } from './combat.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';
import { SKILLS } from './skills.ts';
import { enterZone } from './zones.ts';

const shipped: Content = loadContent();
const DT: number = 1 / 30;
const ROOM: string = 'proving_ground';

type EventOf<T extends WorldEvent['type']> = Extract<WorldEvent, { readonly type: T }>;

function ofType<T extends WorldEvent['type']>(events: readonly WorldEvent[], type: T): EventOf<T>[] {
  return events.filter((event: WorldEvent): event is EventOf<T> => event.type === type);
}

function room(monster: string, when: readonly Condition[] = []): Content {
  const bastion: ZoneDef = zoneOf(shipped, 'drowned_bastion');
  const packs: ZonePack[] = [{ x: 28, z: 14, members: [{ monster, count: 1, mods: [] }], when }];
  const zone: ZoneDef = { ...bastion, id: ROOM, level: 2, surge: null, packs, exits: [], waypoint: null };
  return { ...shipped, zones: new Map<string, ZoneDef>([...shipped.zones, [zone.id, zone]]) };
}

function bossOf(world: World): MonsterState {
  return must(world.monsters.find((monster: MonsterState): boolean => monster.def.boss !== null), 'boss');
}

function sturdy(world: World): World {
  world.player.stats.maxLife = 100000;
  world.player.maxLife = 100000;
  world.player.life = 100000;
  world.player.stats.lifeRegen = 5000;
  return world;
}

function bosses(): MonsterDef[] {
  return [...shipped.monsters.values()].filter((monster: MonsterDef): boolean => monster.boss !== null);
}

function run(world: World, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  const steps: number = Math.round(seconds / DT);
  for (let step: number = 0; step < steps; step += 1) events.push(...stepWorld(world, [], DT));
  return events;
}

function strike(world: World, boss: MonsterState): WorldEvent[] {
  world.player.pos = { x: boss.pos.x, z: boss.pos.z + 1.6 };
  world.player.cooldowns = {};
  world.player.action = null;
  world.player.queued = null;
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < 150; step += 1) {
    const fresher: WorldEvent[] = stepWorld(world, step === 0 ? [{ type: 'skill', slot: 0, aim: boss.pos, targetId: boss.id }] : [], DT);
    events.push(...fresher);
    if (ofType(fresher, 'damage').some((event): boolean => event.targetId === boss.id)) break;
  }
  return events;
}

function hurt(world: World, boss: MonsterState, toFraction: number): WorldEvent[] {
  boss.life = Math.floor(boss.maxLife * toFraction) + 1;
  return strike(world, boss);
}

void test('the act ships at least two bosses, each with more than one skill and a second phase that adds one', (): void => {
  assert.ok(bosses().length >= 2);
  for (const def of bosses()) {
    const boss: BossDef = must(def.boss, def.id);
    assert.ok(boss.phases.length >= 2, `${def.id} phases`);
    const first: Set<string> = new Set<string>(must(boss.phases[0], 'first phase').skills.map((entry): string => entry.skill));
    const last: Set<string> = new Set<string>(must(boss.phases.at(-1), 'last phase').skills.map((entry): string => entry.skill));
    assert.ok(first.size >= 2, `${def.id} opens with one skill`);
    assert.ok([...last].some((skill: string): boolean => !first.has(skill)), `${def.id} gains nothing in its last phase`);
    for (const phase of boss.phases) for (const entry of phase.skills) assert.ok(must(shipped.skills.get(entry.skill), entry.skill).windup >= 0.7, `${entry.skill} has too short a wind-up to read`);
  }
});

void test('the active phase is the last one whose threshold the life fraction has reached', (): void => {
  const boss: BossDef = must(must(shipped.monsters.get('one_before'), 'boss').boss, 'boss block');
  assert.equal(phaseAt(boss, 1), 0);
  assert.equal(phaseAt(boss, 0.51), 0);
  assert.equal(phaseAt(boss, 0.5), 1);
  assert.equal(phaseAt(boss, 0.01), 1);
});

void test('a boss uses more than one skill in a fight, and only skills of its active phase', (): void => {
  for (const def of bosses()) {
    const world: World = sturdy(worldIn(room(def.id), ROOM, 3));
    const boss: MonsterState = bossOf(world);
    const block: BossDef = must(def.boss, def.id);
    world.player.pos = { x: 28, z: 22 };
    const opening: Set<string> = new Set<string>(must(block.phases[0], 'phase').skills.map((entry): string => entry.skill));
    const used: string[] = ofType(run(world, 40), 'skill_start').filter((event): boolean => event.actorId === boss.id).map((event): string => event.skill.id);
    assert.ok(new Set<string>(used).size >= 2, `${def.id} used ${[...new Set<string>(used)].join(', ')}`);
    assert.ok(used.every((skill: string): boolean => opening.has(skill)), `${def.id} used a later phase's skill at full life`);
    hurt(world, boss, 0.4);
    assert.equal(boss.phase, 1);
    const later: string[] = ofType(run(world, 60), 'skill_start').filter((event): boolean => event.actorId === boss.id).map((event): string => event.skill.id);
    const second: Set<string> = new Set<string>(must(block.phases[1], 'phase').skills.map((entry): string => entry.skill));
    assert.ok(later.every((skill: string): boolean => second.has(skill)));
    assert.ok(later.some((skill: string): boolean => !opening.has(skill)), `${def.id} never used its new skill in 60s`);
  }
});

void test('a skill on cooldown is not picked while another is ready, and the pick is reproducible', (): void => {
  const pick = (seed: number): string[] => {
    const world: World = worldIn(room('mason'), ROOM, seed);
    const boss: MonsterState = bossOf(world);
    const block: BossDef = must(boss.def.boss, 'boss');
    return Array.from({ length: 12 }, (): string => must(pickBossSkill(world, boss, block), 'skill').id);
  };
  assert.deepEqual(pick(5), pick(5));
  assert.ok(new Set<string>(pick(5)).size >= 2);
  const world: World = worldIn(room('mason'), ROOM, 6);
  const boss: MonsterState = bossOf(world);
  boss.cooldowns['mason_hammer'] = 3;
  for (let attempt: number = 0; attempt < 12; attempt += 1) assert.equal(pickBossSkill(world, boss, must(boss.def.boss, 'boss'))?.id, 'mason_stone');
  boss.cooldowns['mason_stone'] = 5;
  assert.equal(pickBossSkill(world, boss, must(boss.def.boss, 'boss'))?.id, 'mason_hammer');
});

void test('crossing a threshold fires the phase event once and the phase barks follow it', (): void => {
  const world: World = worldIn(room('one_before'), ROOM, 7);
  const boss: MonsterState = bossOf(world);
  boss.spawnTime = 0;
  const first: WorldEvent[] = hurt(world, boss, 0.5);
  assert.deepEqual(ofType(first, 'boss_phase'), [{ type: 'boss_phase', monsterId: boss.id, phase: 1 }]);
  assert.deepEqual(ofType(first, 'bark').filter((event): boolean => event.line.id.includes('half')).map((event): string => event.speaker), ['one_before']);
  const again: WorldEvent[] = hurt(world, boss, 0.3);
  assert.equal(ofType(again, 'boss_phase').length, 0);
  assert.equal(ofType(again, 'bark').length, 0);
});

void test('a boss is not staggered, its wind-up is not interrupted, and it takes a fraction of the knockback', (): void => {
  const world: World = sturdy(worldIn(room('mason'), ROOM, 8));
  const boss: MonsterState = bossOf(world);
  const cleave = must(world.content.skills.get('cleave'), 'cleave');
  boss.spawnTime = 0;
  boss.aggro = true;
  world.player.pos = { x: boss.pos.x, z: boss.pos.z + 2.5 };
  for (let step: number = 0; step < 200 && boss.action?.phase !== 'windup'; step += 1) stepWorld(world, [], DT);
  assert.equal(boss.action?.phase, 'windup');
  world.events = [];
  applyHit(world, offenceOf(world.player), boss, cleave, { x: 0, z: -1 });
  assert.equal(boss.stagger, 0);
  assert.equal(boss.action.phase, 'windup');
  assert.equal(ofType(world.events, 'skill_interrupt').length, 0);
  assert.ok(Math.abs(Math.hypot(boss.knock.x, boss.knock.z) - cleave.knockback * must(boss.def.boss, 'boss').poise.knockback) < 1e-9);

  const plain: World = worldIn(shipped, 'drowned_bastion', 8);
  const thrall: MonsterState = must(plain.monsters.find((monster: MonsterState): boolean => monster.def.id === 'bone_thrall'), 'thrall');
  applyHit(plain, offenceOf(plain.player), thrall, cleave, { x: 0, z: -1 });
  if (thrall.alive) assert.equal(thrall.stagger, cleave.stagger);
  assert.ok(Math.abs(Math.hypot(thrall.knock.x, thrall.knock.z) - cleave.knockback) < 1e-9);
});

void test('a boss barks when it notices the hero and when it dies, and drops its guaranteed reward', (): void => {
  const world: World = worldIn(room('one_before'), ROOM, 9);
  const boss: MonsterState = bossOf(world);
  const block: BossDef = must(boss.def.boss, 'boss');
  boss.spawnTime = 0;
  world.player.pos = { x: boss.pos.x, z: boss.pos.z + 6 };
  const noticed: WorldEvent[] = run(world, 1);
  assert.deepEqual(ofType(noticed, 'bark').map((event): string => event.line.id), block.barks.aggro);
  assert.equal(ofType(run(world, 2), 'bark').length, 0);
  boss.phase = block.phases.length - 1;
  const dying: WorldEvent[] = hurt(world, boss, 0);
  assert.equal(boss.alive, false);
  assert.deepEqual(ofType(dying, 'bark').map((event): string => event.line.id), block.barks.death);
  const drops = ofType(dying, 'drop').map((event) => event.ground.content);
  const items = drops.flatMap((content) => (content.kind === 'item' ? [content.item] : []));
  assert.equal(items.length, block.drop.items);
  assert.ok(items.every((item): boolean => item.rarity === block.drop.rarity));
  const gold = drops.flatMap((content) => (content.kind === 'gold' ? [content.amount] : []));
  assert.equal(gold.length, 1);
  assert.ok(must(gold[0], 'gold') >= block.drop.goldMin);
});

void test('one blow that takes a boss through a threshold and kills it still announces the phase before the death', (): void => {
  const world: World = worldIn(room('one_before'), ROOM, 14);
  const boss: MonsterState = bossOf(world);
  const block: BossDef = must(boss.def.boss, 'boss');
  boss.spawnTime = 0;
  boss.life = 1;
  const events: WorldEvent[] = strike(world, boss);
  assert.equal(boss.alive, false);
  assert.deepEqual(ofType(events, 'boss_phase'), [{ type: 'boss_phase', monsterId: boss.id, phase: 1 }]);
  const spoken: string[] = ofType(events, 'bark').map((event): string => event.line.id);
  assert.deepEqual(spoken.slice(-block.barks.death.length), block.barks.death);
  assert.ok(spoken.indexOf('one_before_half_1') >= 0 && spoken.indexOf('one_before_half_1') < spoken.indexOf(must(block.barks.death[0], 'death line')));
});

void test('a boss that outlives the hero starts the next attempt from its first phase', (): void => {
  const world: World = worldIn(room('mason'), ROOM, 15);
  const boss: MonsterState = bossOf(world);
  boss.spawnTime = 0;
  hurt(world, boss, 0.4);
  assert.equal(boss.phase, 1);
  world.player.life = 1;
  world.player.stats.lifeRegen = 0;
  world.player.pos = { x: boss.pos.x, z: boss.pos.z + 2 };
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < 900 && ofType(events, 'player_respawn').length === 0; step += 1) events.push(...stepWorld(world, [], DT));
  assert.equal(ofType(events, 'player_respawn').length, 1);
  assert.equal(boss.life, boss.maxLife);
  assert.equal(boss.phase, 0);
  assert.equal(boss.nextSkill, null);
  const again: WorldEvent[] = hurt(world, boss, 0.4);
  assert.deepEqual(ofType(again, 'boss_phase'), [{ type: 'boss_phase', monsterId: boss.id, phase: 1 }]);
});

void test('a boss that crosses a threshold picks from the new phase at once, even before the phase is announced', (): void => {
  const base: Content = room('mason');
  const mason: MonsterDef = must(base.monsters.get('mason'), 'mason');
  const block: BossDef = must(mason.boss, 'boss');
  const split: BossDef = {
    ...block,
    phases: [
      { below: 1, skills: [{ skill: 'mason_hammer', weight: 1 }], barks: [] },
      { below: 0.5, skills: [{ skill: 'mason_slam', weight: 1 }], barks: [] },
    ],
  };
  const content: Content = { ...base, monsters: new Map<string, MonsterDef>([...base.monsters, [mason.id, { ...mason, boss: split }]]) };
  const world: World = sturdy(worldIn(content, ROOM, 17));
  const boss: MonsterState = bossOf(world);
  boss.spawnTime = 0;
  boss.aggro = true;
  boss.nextSkill = must(world.content.skills.get('mason_hammer'), 'hammer');
  boss.life = Math.floor(boss.maxLife * 0.4);
  assert.equal(boss.phase, 0);
  assert.equal(pickBossSkill(world, boss, split)?.id, 'mason_slam');
  world.player.pos = { x: boss.pos.x, z: boss.pos.z + 2.5 };
  const events: WorldEvent[] = stepWorld(world, [], DT);
  const started = ofType(events, 'skill_start').filter((event): boolean => event.actorId === boss.id);
  assert.deepEqual(started.map((event): string => event.skill.id), ['mason_slam']);
});

void test('the lane a bolt is read by reaches as far as the bolt does', (): void => {
  const world: World = sturdy(worldIn(room('mason'), ROOM, 16));
  const boss: MonsterState = bossOf(world);
  const stone = must(world.content.skills.get('mason_stone'), 'stone');
  const delivery = stone.delivery;
  const range: number = delivery.type === 'projectile' ? delivery.range : 0;
  assert.ok(range > 0);
  boss.spawnTime = 0;
  boss.pos = { x: 28, z: 6 };
  boss.action = { skill: stone, phase: 'windup', timeLeft: 0.5, windup: stone.windup, recovery: stone.recovery, direction: { x: 0, z: 1 }, target: null, travelSpeed: 0, travelLeft: 0 };
  assert.equal(botInDanger(world, { x: 28, z: 6 + range - 1 }), true);
  assert.equal(botInDanger(world, { x: 28, z: 6 + range + SKILLS.projectileOrigin }), true);
  assert.equal(botInDanger(world, { x: 28, z: 6 + range + SKILLS.projectileOrigin + 4 }), false);
  assert.equal(botInDanger(world, { x: 33, z: 6 + range - 1 }), false);
  assert.equal(botInDanger(world, { x: 28, z: 4 }), false);
});

void test('a pack whose condition fails does not spawn, so a beaten boss is not handed out again', (): void => {
  const hunt: QuestDef = { id: 'hunt', name: 'Hunt', requires: [], objectives: [{ id: 'slay', type: 'defeat', monster: 'mason', text: 'Slay' }] };
  const during: Condition[] = [{ type: 'objective', quest: 'hunt', objective: 'slay', is: 'current', not: false }];
  const content: Content = { ...room('mason', during), quests: new Map<string, QuestDef>([[hunt.id, hunt]]) };
  const world: World = worldIn(content, ROOM, 10);
  assert.equal(world.monsters.length, 1);
  const boss: MonsterState = bossOf(world);
  boss.spawnTime = 0;
  hurt(world, boss, 0);
  assert.equal(boss.alive, false);
  assert.deepEqual(world.quests, { hunt: 1 });
  enterZone(world, zoneOf(content, ROOM), { type: 'start' });
  assert.equal(world.monsters.length, 0);
  world.quests = { hunt: 0 };
  enterZone(world, zoneOf(content, ROOM), { type: 'start' });
  assert.equal(world.monsters.length, 1);
});

void test('the bot beats each boss at the level the act expects, and reading the telegraph is what keeps it alive', (): void => {
  for (const def of bosses()) {
    const fight = (dodges: boolean): { readonly won: boolean; readonly deaths: number; readonly lifeLeft: number } => {
      const world: World = worldIn(room(def.id), ROOM, 21);
      world.player.level = 3;
      const bot: Bot = createBot(world, { dodges, reaction: 0 });
      const boss: MonsterState = bossOf(world);
      const won: boolean = botFight(bot, (): boolean => !boss.alive, def.id);
      return { won, deaths: bot.deaths, lifeLeft: world.player.life / world.player.maxLife };
    };
    const careful = fight(true);
    const reckless = fight(false);
    assert.ok(careful.won, `${def.id}: the bot did not win while dodging`);
    assert.ok(careful.deaths < reckless.deaths || (careful.deaths === reckless.deaths && careful.lifeLeft > reckless.lifeLeft), `${def.id}: dodging did not help (careful ${JSON.stringify(careful)}, reckless ${JSON.stringify(reckless)})`);
  }
});
