import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHAPE_CONTENT, shapeSkill } from '../../test/shape-support.ts';
import { shapeDelivery, shapeProblems, skillPress } from './parse-shapes.ts';
import { ContentError } from './read.ts';
import type { Content, SkillDef } from './types.ts';

void test('each new delivery reads from data with its own fields', (): void => {
  assert.deepEqual(shapeDelivery('chain', { range: 9, jumps: 3, jumpRange: 5, falloff: 0.8 }, 'x'), { type: 'chain', range: 9, jumps: 3, jumpRange: 5, falloff: 0.8 });
  assert.deepEqual(shapeDelivery('blink', { range: 7, radius: 0 }, 'x'), { type: 'blink', range: 7, radius: 0 });
  assert.deepEqual(shapeDelivery('beam', { range: 11, width: 0.8 }, 'x'), { type: 'beam', range: 11, width: 0.8 });
  assert.deepEqual(shapeDelivery('area', { range: 9, radius: 3, duration: 4, pulse: 0.5, pull: 0, slow: 1, anchor: 'ground' }, 'x'), { type: 'area', range: 9, radius: 3, duration: 4, pulse: 0.5, pull: 0, slow: 1, weaken: 0, anchor: 'ground', opening: false, pushForward: false, stoke: null, length: 0, blocks: false, slam: null, aura: null });
  const opening = shapeDelivery('area', { range: 4, radius: 2, duration: 1, pulse: 0, pull: 0, slow: 1, anchor: 'ground', opening: true }, 'x');
  assert.ok(opening.type === 'area' && opening.opening);
});

void test('an area may burn hotter with every pulse, up to a cap, and only an area that pulses may', (): void => {
  const banked = shapeDelivery('area', { range: 0, radius: 4, duration: 6, pulse: 1, pull: 0, slow: 1, anchor: 'caster', stoke: { perPulse: 0.2, max: 1 } }, 'x');
  assert.ok(banked.type === 'area');
  assert.deepEqual(banked.stoke, { perPulse: 0.2, max: 1 });
  assert.throws((): unknown => shapeDelivery('area', { range: 0, radius: 4, duration: 6, pulse: 0, pull: 0, slow: 1, anchor: 'caster', stoke: { perPulse: 0.2, max: 1 } }, 'x'), ContentError);
  assert.throws((): unknown => shapeDelivery('area', { range: 0, radius: 4, duration: 6, pulse: 1, pull: 0, slow: 1, anchor: 'caster', stoke: { perPulse: 0, max: 1 } }, 'x'), ContentError);
});

void test('a field that pulses less often than it lasts, a fractional jump count or an unknown anchor is refused', (): void => {
  assert.throws(() => shapeDelivery('area', { range: 9, radius: 3, duration: 1, pulse: 2, pull: 0, slow: 1, anchor: 'ground' }, 'x'), ContentError);
  assert.throws(() => shapeDelivery('area', { range: 9, radius: 3, duration: 1, pulse: 0, pull: 0, slow: 1, anchor: 'sky' }, 'x'), ContentError);
  assert.throws(() => shapeDelivery('chain', { range: 9, jumps: 1.5, jumpRange: 5, falloff: 0.8 }, 'x'), ContentError);
  assert.throws(() => shapeDelivery('area', { range: 9, radius: 3, duration: 1, pulse: 0.0001, pull: 0, slow: 1, anchor: 'ground' }, 'x'), ContentError);
  assert.throws(() => skillPress({ press: { type: 'channel', interval: 0.000001, max: 3 } }, 'x'), ContentError);
});

void test('hold and brand are optional and read as charge, channel or a burst skill', (): void => {
  assert.deepEqual(skillPress({}, 'x'), { press: null, brand: null, momentum: null, burn: null, soak: null, spend: null, spent: 0 });
  assert.deepEqual(skillPress({ spend: { damage: 0.07, area: 0.025, range: 0.025 } }, 'x').spend, { damage: 0.07, area: 0.025, range: 0.025, stun: 0 });
  assert.equal(skillPress({ spend: { damage: 0.07, area: 0.025, range: 0.025, stun: 0.9 } }, 'x').spend?.stun, 0.9);
  assert.throws(() => skillPress({ spend: { damage: 0, area: 0, range: 0, stun: -1 } }, 'x'), ContentError);
  assert.throws(() => skillPress({ spend: { damage: -1, area: 0, range: 0 } }, 'x'), ContentError);
  assert.deepEqual(skillPress({ press: { type: 'channel', interval: 0.2, max: 3 } }, 'x').press, { type: 'channel', interval: 0.2, max: 3, move: 0, passThrough: false, hint: null });
  assert.deepEqual(skillPress({ press: { type: 'charge', max: 1, damageScale: 3, areaScale: 1.4 }, brand: { duration: 6, burst: 'pop' } }, 'x'), {
    press: { type: 'charge', max: 1, damageScale: 3, areaScale: 1.4, hint: null },
    brand: { duration: 6, burst: 'pop' },
    momentum: null,
    burn: null,
    soak: null,
    spend: null,
    spent: 0,
  });
});

void test('a soak reads as the share of speed a struck target keeps and how long it lasts', (): void => {
  assert.deepEqual(skillPress({ soak: { tempo: 0.7, duration: 2 } }, 'x').soak, { tempo: 0.7, duration: 2 });
  assert.throws(() => skillPress({ soak: { tempo: 0, duration: 2 } }, 'x'), ContentError);
  assert.throws(() => skillPress({ soak: { tempo: 1.2, duration: 2 } }, 'x'), ContentError);
  assert.throws(() => skillPress({ soak: { tempo: 0.7, duration: 0 } }, 'x'), ContentError);
});

void test('a burn reads as a duration, a tick no longer than it and a share of the hit', (): void => {
  assert.deepEqual(skillPress({ burn: { duration: 1.25, tick: 0.25, share: 0.15 } }, 'x').burn, { duration: 1.25, tick: 0.25, share: 0.15 });
  assert.throws(() => skillPress({ burn: { duration: 1, tick: 2, share: 0.1 } }, 'x'), ContentError);
  assert.throws(() => skillPress({ burn: { duration: 1, tick: 0.001, share: 0.1 } }, 'x'), ContentError);
  assert.throws(() => skillPress({ burn: { duration: 1, tick: 0.25, share: 0 } }, 'x'), ContentError);
});

void test('a brand must burst as a nova, and a blink or a leap cannot be held', (): void => {
  assert.deepEqual(shapeProblems(SHAPE_CONTENT), []);
  const bad: readonly SkillDef[] = [
    { ...shapeSkill('test_brander'), id: 'bad_brand', brand: { duration: 3, burst: 'test_fork' } },
    { ...shapeSkill('test_step'), id: 'bad_step', press: { type: 'charge', max: 1, damageScale: 2, areaScale: 1, hint: null } },
    { ...shapeSkill('test_heave'), id: 'bad_leap', leap: { distance: 4, stopShort: 1, airTime: 0.3, lane: false } },
  ];
  const content: Content = { ...SHAPE_CONTENT, skills: new Map<string, SkillDef>([...SHAPE_CONTENT.skills, ...bad.map((def: SkillDef): [string, SkillDef] => [def.id, def])]) };
  assert.equal(shapeProblems(content).length, 3);
});

void test('a channel may carry the hero along, and a momentum block reads its gain, cap, grace, drain, steady mark and rising steps', (): void => {
  assert.equal(skillPress({ press: { type: 'channel', interval: 0.3, max: 60, move: 1 } }, 'x').press?.type, 'channel');
  assert.throws(() => skillPress({ press: { type: 'channel', interval: 0.3, max: 60, move: 1.5 } }, 'x'), ContentError);
  assert.equal(skillPress({ press: { type: 'channel', interval: 0.3, max: 60, move: 1, hint: 'Hold to keep turning' } }, 'x').press?.hint, 'Hold to keep turning');
  assert.throws(() => skillPress({ press: { type: 'channel', interval: 0.3, max: 60, hint: 4 } }, 'x'), ContentError);
  const block = { perHit: 1, cap: 20, grace: 0.6, drain: 10, steady: 4, manaPerHit: 0.5, lifePerHit: 0, tiers: [{ at: 5, turn: 1.1, reach: 1.1 }, { at: 12, turn: 1.3, reach: 1.2 }] };
  assert.deepEqual(skillPress({ momentum: block }, 'x').momentum, block);
  assert.throws(() => skillPress({ momentum: { ...block, steady: 30 } }, 'x'), ContentError);
  assert.throws(() => skillPress({ momentum: { ...block, tiers: [{ at: 12, turn: 1.3, reach: 1.2 }, { at: 5, turn: 1.1, reach: 1.1 }] } }, 'x'), ContentError);
  assert.throws(() => skillPress({ momentum: { ...block, tiers: [{ at: 25, turn: 1.3, reach: 1.2 }] } }, 'x'), ContentError);
});

void test('only a channelled skill can build momentum', (): void => {
  const block = { perHit: 1, cap: 20, grace: 0.6, drain: 10, steady: 4, manaPerHit: 0.5, lifePerHit: 0, tiers: [] };
  const loose: SkillDef = { ...shapeSkill('test_fork'), id: 'bad_momentum', momentum: block };
  const content: Content = { ...SHAPE_CONTENT, skills: new Map<string, SkillDef>([...SHAPE_CONTENT.skills, [loose.id, loose]]) };
  assert.deepEqual(shapeProblems(content), ['skill bad_momentum builds momentum, so it must be channelled']);
});

void test('a skill that spends momentum can neither build it nor be held', (): void => {
  const spend = { damage: 0.1, area: 0, range: 0, stun: 0 };
  const held: SkillDef = { ...shapeSkill('test_fork'), id: 'bad_spend', spend, press: { type: 'charge', max: 1, damageScale: 2, areaScale: 1, hint: null } };
  const content: Content = { ...SHAPE_CONTENT, skills: new Map<string, SkillDef>([...SHAPE_CONTENT.skills, [held.id, held]]) };
  assert.deepEqual(shapeProblems(content), ['skill bad_spend spends momentum, so it can neither build it nor be held']);
});
