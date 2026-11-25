import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { MonsterScaling } from '../content/types.ts';
import { lifeTimesAt, monsterScale } from './monster-scale.ts';
import type { MonsterScale } from './monster-scale.ts';

const content: MonsterScaling = loadContent().world.scaling;
const shipped: MonsterScaling = { ...content, lifeTimes: [] };

const TODAY = { lifePerLevel: 0.3, damagePerLevel: 0.28, lastLevel: 5 } as const;
const STEEP = { lifePerLevel: 1.2, damagePerLevel: 1.12, firstLevel: 10, lastLevel: 30 } as const;

void test('monsters up to level 5 are exactly as tough as before the ramp', (): void => {
  for (let level: number = 1; level <= TODAY.lastLevel; level += 1) {
    assert.deepEqual(monsterScale(shipped, level), { life: 1 + TODAY.lifePerLevel * (level - 1), damage: 1 + TODAY.damagePerLevel * (level - 1) });
  }
});

void test('from level 10 on monsters grow at the steep slopes exactly', (): void => {
  for (let level: number = STEEP.firstLevel; level <= STEEP.lastLevel; level += 1) {
    assert.deepEqual(monsterScale(shipped, level), { life: 1 + STEEP.lifePerLevel * (level - 1), damage: 1 + STEEP.damagePerLevel * (level - 1) });
  }
});

void test('between the ends of the ramp toughness rises every level and stays between the two slopes', (): void => {
  let previous: MonsterScale = monsterScale(shipped, 1);
  for (let level: number = 2; level <= STEEP.lastLevel; level += 1) {
    const scale: MonsterScale = monsterScale(shipped, level);
    assert.ok(scale.life > previous.life && scale.damage > previous.damage, `level ${level}`);
    assert.ok(scale.life >= 1 + TODAY.lifePerLevel * (level - 1) && scale.life <= 1 + STEEP.lifePerLevel * (level - 1), `level ${level}`);
    previous = scale;
  }
});

void test('without a ramp the slopes are flat at every level', (): void => {
  const flat: MonsterScaling = { lifePerLevel: 0.5, damagePerLevel: 0.25, xpPerLevel: 0.1, xpBeyond: null, ramp: null, lifeTimes: [] };
  assert.deepEqual(monsterScale(flat, 21), { life: 11, damage: 6 });
});

void test('life times are one with no points, hold the end values outside them and run straight between them', (): void => {
  const points = [{ level: 13, times: 1 }, { level: 15, times: 2 }, { level: 20, times: 3 }];
  assert.equal(lifeTimesAt([], 25), 1);
  assert.equal(lifeTimesAt(points, 9), 1);
  assert.equal(lifeTimesAt(points, 14), 1.5);
  assert.equal(lifeTimesAt(points, 17.5), 2.5);
  assert.equal(lifeTimesAt(points, 30), 3);
});

void test('the shipped life times leave Hourfall and every hit as they were and give deeper monsters more life', (): void => {
  for (let level: number = 1; level <= STEEP.lastLevel; level += 1) {
    const plain: MonsterScale = monsterScale(shipped, level);
    const timed: MonsterScale = monsterScale(content, level);
    assert.equal(timed.damage, plain.damage, `level ${level}`);
    if (level <= 13) assert.equal(timed.life, plain.life, `level ${level}`);
    else assert.ok(timed.life > plain.life, `level ${level}`);
  }
});
