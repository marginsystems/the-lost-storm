import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHAPE_CONTENT, shapeSkill } from '../../test/shape-support.ts';
import { shapeDelivery, shapeProblems, skillHolds } from './parse-shapes.ts';
import { ContentError } from './read.ts';
import type { Content, SkillDef } from './types.ts';

void test('each new delivery reads from data with its own fields', (): void => {
  assert.deepEqual(shapeDelivery('chain', { range: 9, jumps: 3, jumpRange: 5, falloff: 0.8 }, 'x'), { type: 'chain', range: 9, jumps: 3, jumpRange: 5, falloff: 0.8 });
  assert.deepEqual(shapeDelivery('blink', { range: 7, radius: 0 }, 'x'), { type: 'blink', range: 7, radius: 0 });
  assert.deepEqual(shapeDelivery('beam', { range: 11, width: 0.8 }, 'x'), { type: 'beam', range: 11, width: 0.8 });
  assert.deepEqual(shapeDelivery('field', { range: 9, radius: 3, duration: 4, pulse: 0.5, pull: 0, slow: 1, anchor: 'ground' }, 'x'), { type: 'field', range: 9, radius: 3, duration: 4, pulse: 0.5, pull: 0, slow: 1, anchor: 'ground' });
});

void test('a field that pulses less often than it lasts, a fractional jump count or an unknown anchor is refused', (): void => {
  assert.throws(() => shapeDelivery('field', { range: 9, radius: 3, duration: 1, pulse: 2, pull: 0, slow: 1, anchor: 'ground' }, 'x'), ContentError);
  assert.throws(() => shapeDelivery('field', { range: 9, radius: 3, duration: 1, pulse: 0, pull: 0, slow: 1, anchor: 'sky' }, 'x'), ContentError);
  assert.throws(() => shapeDelivery('chain', { range: 9, jumps: 1.5, jumpRange: 5, falloff: 0.8 }, 'x'), ContentError);
});

void test('hold and brand are optional and read as charge, channel or a burst skill', (): void => {
  assert.deepEqual(skillHolds({}, 'x'), { hold: null, brand: null });
  assert.deepEqual(skillHolds({ hold: { type: 'channel', interval: 0.2, max: 3 } }, 'x').hold, { type: 'channel', interval: 0.2, max: 3 });
  assert.deepEqual(skillHolds({ hold: { type: 'charge', max: 1, damageScale: 3, areaScale: 1.4 }, brand: { duration: 6, burst: 'pop' } }, 'x'), {
    hold: { type: 'charge', max: 1, damageScale: 3, areaScale: 1.4 },
    brand: { duration: 6, burst: 'pop' },
  });
});

void test('a brand must burst as a nova, and a blink cannot be held', (): void => {
  assert.deepEqual(shapeProblems(SHAPE_CONTENT), []);
  const bad: readonly SkillDef[] = [
    { ...shapeSkill('test_brander'), id: 'bad_brand', brand: { duration: 3, burst: 'test_fork' } },
    { ...shapeSkill('test_step'), id: 'bad_step', hold: { type: 'charge', max: 1, damageScale: 2, areaScale: 1 } },
  ];
  const content: Content = { ...SHAPE_CONTENT, skills: new Map<string, SkillDef>([...SHAPE_CONTENT.skills, ...bad.map((def: SkillDef): [string, SkillDef] => [def.id, def])]) };
  assert.equal(shapeProblems(content).length, 2);
});
