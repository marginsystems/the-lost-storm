import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import { aimAt } from '../bot.ts';
import { spinAim } from '../bot-plan.ts';
import type { BossDef, BossPhase, Content, MonsterDef, SkillDef } from '../content/types.ts';
import { distance } from '../math.ts';
import { stepBosses } from './boss.ts';
import { applyHit, offenceOf, targetsOf } from './combat.ts';
import { heldAtLine, holdersOf, lifeFloor } from './count.ts';
import { removeCorpses } from './monsters.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

const DT: number = 1 / 30;
const gate: MonsterDef = must(ARENA_CONTENT.monsters.get('timekeeper_gatekeeper'), 'gatekeeper');
const thrall: MonsterDef = must(ARENA_CONTENT.monsters.get('mended'), 'mended');
const slam: SkillDef = must(ARENA_CONTENT.skills.get('test_slam'), 'test_slam');

const SKILLS: readonly SkillDef[] = [
  { ...slam, id: 'k_cut', cooldown: 0, windup: 0.3, recovery: 0.2, engageRange: 2.5, echo: 0 },
  { ...slam, id: 'k_ring', cooldown: 0, windup: 0.3, recovery: 0.2, engageRange: 2.5, echo: 0, delivery: { type: 'nova', radius: 5, side: 'foes' } },
  { ...slam, id: 'k_far', cooldown: 0, windup: 0.3, recovery: 0.2, engageRange: 12, echo: 0, delivery: { type: 'nova', radius: 5, side: 'foes' } },
];

function phase(below: number, extra: Partial<BossPhase>): BossPhase {
  return { below, skills: [], barks: [], measure: ['k_cut'], beat: 1, holds: [], unseal: [], anchor: null, support: null, ...extra };
}

const KEEPER: BossDef = {
  ...must(gate.boss, 'gate boss'),
  barks: { aggro: [], death: [] },
  firstKill: null,
  phases: [phase(1, { measure: ['k_cut', 'k_ring', 'k_cut'], beat: 1.5, holds: ['t_clock'] }), phase(0.5, { holds: ['t_book'], unseal: ['t_book'], anchor: { monster: 't_book', radius: 3 } })],
  countBreak: { stagger: 2, open: 4, damageTaken: 1.5 },
  yields: true,
  presence: null,
};

const MONSTERS: readonly MonsterDef[] = [
  { ...thrall, id: 't_keeper', life: 1000, scalesLife: false, moveSpeed: 4, skill: 'k_cut', boss: KEEPER },
  { ...thrall, id: 't_counter', life: 1000, scalesLife: false, moveSpeed: 0, skill: 'k_cut', boss: { ...KEEPER, phases: [phase(1, { holds: ['t_clock', 't_tally'] })] } },
  { ...thrall, id: 't_reacher', life: 1000, scalesLife: false, moveSpeed: 4, skill: 'k_cut', boss: { ...KEEPER, phases: [phase(1, { measure: ['k_cut', 'k_far'], beat: 1 })] } },
  { ...thrall, id: 't_clock', life: 200, scalesLife: false, xp: 0, behaviour: { type: 'fixed', sealed: false, collateral: 1, strikes: null }, poise: { knockback: 0, stagger: 0, resolve: 0 } },
  { ...thrall, id: 't_tally', life: 300, scalesLife: false, xp: 0, behaviour: { type: 'fixed', sealed: false, collateral: 1, strikes: { count: 3, gap: 2 } }, poise: { knockback: 0, stagger: 0, resolve: 0 } },
  { ...thrall, id: 't_book', life: 200, scalesLife: false, xp: 0, behaviour: { type: 'fixed', sealed: true, collateral: 0, strikes: null }, poise: { knockback: 0, stagger: 0, resolve: 0 } },
];

const CONTENT: Content = {
  ...ARENA_CONTENT,
  skills: new Map<string, SkillDef>([...ARENA_CONTENT.skills, ...SKILLS.map((skill: SkillDef): [string, SkillDef] => [skill.id, skill])]),
  monsters: new Map<string, MonsterDef>([...ARENA_CONTENT.monsters, ...MONSTERS.map((def: MonsterDef): [string, MonsterDef] => [def.id, def])]),
};

interface Hall {
  readonly world: World;
  readonly keeper: MonsterState;
  readonly clock: MonsterState;
  readonly book: MonsterState;
}

function hall(seed: number): Hall {
  const world: World = arena(seed, CONTENT);
  const book: MonsterState = place(world, 't_book', { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z });
  const clock: MonsterState = place(world, 't_clock', { x: ARENA_CENTRE.x + 7, z: ARENA_CENTRE.z });
  const keeper: MonsterState = place(world, 't_keeper', { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 2 });
  book.aggro = false;
  clock.aggro = false;
  world.player.maxLife = 1e6;
  world.player.life = 1e6;
  return { world, keeper, clock, book };
}

function hit(world: World, target: MonsterState, times: number = 1): WorldEvent[] {
  const seen: WorldEvent[] = [];
  for (let index: number = 0; index < times; index += 1) {
    world.events = [];
    applyHit(world, { ...offenceOf(world.player), damageMin: 100, damageMax: 100, damagePercent: 0, critChance: 0 }, target, must(CONTENT.skills.get('k_cut'), 'k_cut'), { x: 1, z: 0 });
    stepBosses(world);
    seen.push(...world.events, ...stepWorld(world, [], DT));
  }
  return seen;
}

function run(world: World, seconds: number, hold: () => void = (): void => undefined): WorldEvent[] {
  const seen: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) {
    hold();
    seen.push(...stepWorld(world, [], DT));
  }
  return seen;
}

function ofType<T extends WorldEvent['type']>(events: readonly WorldEvent[], type: T): Extract<WorldEvent, { readonly type: T }>[] {
  return events.filter((event: WorldEvent): event is Extract<WorldEvent, { readonly type: T }> => event.type === type);
}

void test('his life holds just above the line while a holder stands, and he says so once', (): void => {
  const { world, keeper, clock } = hall(1);
  const events: WorldEvent[] = hit(world, keeper, 12);
  assert.equal(keeper.life, lifeFloor(world, keeper));
  assert.ok(keeper.life > keeper.maxLife * 0.5, 'the line is not crossed');
  assert.equal(keeper.phase, 0);
  assert.ok(heldAtLine(world, keeper));
  assert.deepEqual(holdersOf(world, keeper).map((holder: MonsterState): number => holder.id), [clock.id]);
  assert.equal(ofType(events, 'boss_held').length, 1);
  assert.ok(ofType(events, 'damage').some((event): boolean => event.targetId === keeper.id && event.amount === 0), 'a held hit lands for nothing');
});

void test('breaking the last holder breaks the count: he staggers, opens, and the next hit crosses the line', (): void => {
  const { world, keeper, clock, book } = hall(2);
  hit(world, keeper, 12);
  const broke: WorldEvent[] = hit(world, clock, 3);
  assert.equal(clock.alive, false);
  assert.equal(ofType(broke, 'count_broken').length, 1);
  assert.ok(keeper.stagger > 0, 'he staggers');
  assert.ok(keeper.openUntil > world.time, 'he is open');
  assert.equal(book.sealed, true);
  const before: number = keeper.life;
  const crossed: WorldEvent[] = hit(world, keeper);
  assert.equal(before - keeper.life, 150, 'an open hit lands half again as hard');
  assert.equal(keeper.phase, 1);
  assert.equal(book.sealed, false, 'the next phase unseals what it names');
  assert.equal(ofType(crossed, 'piece_unsealed').length, 1);
});

void test('a holder broken before the line is reached means the line never holds', (): void => {
  const { world, keeper, clock } = hall(3);
  hit(world, clock, 3);
  hit(world, keeper, 6);
  assert.equal(keeper.phase, 1);
  assert.ok(keeper.life < keeper.maxLife * 0.5);
});

void test('a sealed piece cannot be struck until its phase opens it', (): void => {
  const { world, book } = hall(4);
  assert.equal(targetsOf(world, offenceOf(world.player)).includes(book), false);
  book.sealed = false;
  assert.equal(targetsOf(world, offenceOf(world.player)).includes(book), true);
});

void test('he plays his measure in order and never starts two steps within a beat', (): void => {
  const { world, keeper } = hall(5);
  const starts: { readonly skill: string; readonly time: number }[] = [];
  for (let step: number = 0; step < Math.round(9 / DT); step += 1) {
    world.player.pos = { x: keeper.pos.x + 1.5, z: keeper.pos.z };
    world.player.life = world.player.maxLife;
    for (const event of stepWorld(world, [], DT)) if (event.type === 'skill_start' && event.actorId === keeper.id) starts.push({ skill: event.skill.id, time: world.time });
  }
  assert.ok(starts.length >= 4, `he struck ${starts.length} times`);
  starts.forEach((start, index: number): void => {
    assert.equal(start.skill, ['k_cut', 'k_ring', 'k_cut'][index % 3]);
    const before = starts[index - 1];
    if (before !== undefined) assert.ok(start.time - before.time >= 1.5 - 1e-6, 'a beat apart');
  });
});

void test('his own strike cracks a clock it reaches, though he never chooses it as a foe', (): void => {
  const { world, keeper, clock } = hall(6);
  clock.pos = { x: keeper.pos.x + 3, z: keeper.pos.z };
  const life: number = clock.life;
  run(world, 4, (): void => {
    world.player.pos = { x: keeper.pos.x - 1.5, z: keeper.pos.z };
    world.player.life = world.player.maxLife;
  });
  assert.ok(clock.life < life, 'the ring reached the clock');
  assert.equal(keeper.foeId === clock.id, false);
});

void test('a fixed piece never moves, never acts and is not pushed', (): void => {
  const { world, clock } = hall(7);
  const at = { x: clock.pos.x, z: clock.pos.z };
  clock.aggro = true;
  run(world, 3, (): void => {
    world.player.pos = { x: clock.pos.x + 0.3, z: clock.pos.z };
  });
  assert.ok(distance(clock.pos, at) < 1e-6);
  assert.equal(clock.action, null);
});

void test('in an anchored phase he never leaves the anchor by more than its radius', (): void => {
  const { world, keeper, clock, book } = hall(8);
  hit(world, clock, 3);
  hit(world, keeper, 6);
  assert.equal(keeper.phase, 1);
  let farthest: number = 0;
  run(world, 6, (): void => {
    world.player.pos = { x: book.pos.x + 9, z: book.pos.z };
    world.player.life = world.player.maxLife;
    farthest = Math.max(farthest, distance(keeper.pos, book.pos));
  });
  assert.ok(farthest <= 3 + 0.5, `he strayed ${farthest} m`);
});

void test('at the end a yielding boss stands down: no corpse is taken, and the defeat says he yielded', (): void => {
  const { world, keeper, clock, book } = hall(9);
  hit(world, clock, 3);
  hit(world, keeper, 6);
  book.sealed = false;
  hit(world, book, 3);
  const events: WorldEvent[] = hit(world, keeper, 12);
  assert.equal(keeper.alive, false);
  assert.equal(keeper.yielded, true);
  assert.equal(ofType(events, 'boss_defeated')[0]?.yielded, true);
  keeper.deadTime = 1e3;
  removeCorpses(world);
  assert.ok(world.monsters.includes(keeper), 'his body stays where he yielded');
});

void test('the bot strikes what holds a held foe instead of the foe', (): void => {
  const { world, keeper, clock } = hall(10);
  assert.equal(aimAt(world, [keeper], [keeper]), keeper);
  hit(world, keeper, 12);
  assert.equal(aimAt(world, [keeper], [keeper]), clock);
});

void test('the bot goes to the holder of a held boss even when the boss is out of its sight and the holder has never been struck', (): void => {
  const { world, keeper, clock } = hall(12);
  hit(world, keeper, 12);
  assert.equal(clock.aggro, false);
  assert.equal(aimAt(world, [], []), clock);
});

void test('a spinning hero steers past a boss held at his line to the holder, and turns back on the boss once the holder is gone', (): void => {
  const { world, keeper, clock, book } = hall(12);
  hit(world, keeper, 12);
  assert.ok(heldAtLine(world, keeper));
  const cleave: SkillDef = must(ARENA_CONTENT.skills.get('cleave'), 'cleave');
  world.player.pos = { x: keeper.pos.x, z: keeper.pos.z - 1.5 };
  book.alive = false;
  const aim = spinAim(world, cleave);
  assert.ok(aim !== null && distance(aim, clock.pos) < 0.01, JSON.stringify(aim));
  clock.alive = false;
  assert.ok(!heldAtLine(world, keeper));
  const back = spinAim(world, cleave);
  assert.ok(back !== null && distance(back, keeper.pos) < 0.01, JSON.stringify(back));
});

void test('a measure step he cannot reach is passed over after a beat, and the next step he can reach is played', (): void => {
  const world: World = arena(11, CONTENT);
  const reacher: MonsterState = place(world, 't_reacher', { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z });
  world.player.maxLife = 1e6;
  world.player.life = 1e6;
  reacher.aggro = true;
  const starts: { readonly skill: string; readonly time: number }[] = [];
  for (let step: number = 0; step < Math.round(4 / DT); step += 1) {
    world.player.pos = { x: reacher.pos.x + 7, z: reacher.pos.z };
    world.player.life = world.player.maxLife;
    for (const event of stepWorld(world, [], DT)) if (event.type === 'skill_start' && event.actorId === reacher.id) starts.push({ skill: event.skill.id, time: world.time });
  }
  assert.ok(starts.length > 0, 'the measure moved on');
  assert.ok(starts.every((start): boolean => start.skill === 'k_far'), 'the step out of reach is never struck');
  assert.ok(must(starts[0], 'first start').time <= 2.5, `first ranged step at ${must(starts[0], 'first start').time}`);
});

function strikeWith(world: World, target: MonsterState, damage: number): number {
  const before: number = target.life;
  applyHit(world, { ...offenceOf(world.player), damageMin: damage, damageMax: damage, damagePercent: 0, critChance: 0 }, target, must(CONTENT.skills.get('k_cut'), 'k_cut'), { x: 1, z: 0 });
  return before - target.life;
}

void test('a piece that takes strikes loses a set share to any hit, once a gap, and breaks on its last strike', (): void => {
  const { world } = hall(9);
  const tally: MonsterState = place(world, 't_tally', { x: ARENA_CENTRE.x - 7, z: ARENA_CENTRE.z });
  assert.equal(strikeWith(world, tally, 1), 100, 'a light hit strikes a full share');
  assert.equal(strikeWith(world, tally, 5000), 0, 'a heavy hit inside the gap does nothing');
  run(world, 2.1);
  assert.equal(strikeWith(world, tally, 5000), 100, 'a heavy hit strikes no more than a share');
  run(world, 2.1);
  strikeWith(world, tally, 1);
  assert.equal(tally.alive, false);
});

void test('a burn never wears down a piece that takes strikes', (): void => {
  const { world } = hall(10);
  const tally: MonsterState = place(world, 't_tally', { x: ARENA_CENTRE.x - 7, z: ARENA_CENTRE.z });
  const skill: SkillDef = must(CONTENT.skills.get('k_cut'), 'k_cut');
  tally.burn = { source: skill.id, skill, offence: offenceOf(world.player), perTick: 50, tickLeft: 0.1, ticksLeft: 10 };
  run(world, 2);
  assert.equal(tally.life, tally.maxLife);
});

void test('the bot turns from a holder that is waiting out its strike gap to one it can strike, and back once the gap has passed', (): void => {
  const world: World = arena(14, CONTENT);
  world.player.maxLife = 1e6;
  world.player.life = 1e6;
  const counter: MonsterState = place(world, 't_counter', { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 6 });
  const clock: MonsterState = place(world, 't_clock', { x: ARENA_CENTRE.x + 7, z: ARENA_CENTRE.z });
  const tally: MonsterState = place(world, 't_tally', { x: ARENA_CENTRE.x - 3, z: ARENA_CENTRE.z });
  clock.aggro = false;
  tally.aggro = false;
  world.player.pos = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z };
  hit(world, counter, 12);
  assert.ok(heldAtLine(world, counter));
  assert.equal(aimAt(world, [], []), tally);
  strikeWith(world, tally, 1);
  assert.equal(aimAt(world, [], []), clock);
  const cleave: SkillDef = must(ARENA_CONTENT.skills.get('cleave'), 'cleave');
  const aim = spinAim(world, cleave);
  assert.ok(aim !== null && distance(aim, clock.pos) < 0.01, JSON.stringify(aim));
  world.time = tally.strikeReady;
  assert.equal(aimAt(world, [], []), tally);
});
