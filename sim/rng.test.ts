import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng, pickWeighted } from './rng.ts';
import type { Rng, Weighted } from './rng.ts';

function draw(rng: Rng, count: number): number[] {
  return Array.from({ length: count }, (): number => rng.next());
}

void test('the same seed gives the same sequence and different seeds differ', (): void => {
  assert.deepEqual(draw(createRng(42), 20), draw(createRng(42), 20));
  assert.notDeepEqual(draw(createRng(42), 20), draw(createRng(43), 20));
});

void test('next stays in [0, 1) and state advances', (): void => {
  const rng: Rng = createRng(1);
  const before: number = rng.state();
  for (const value of draw(rng, 1000)) assert.ok(value >= 0 && value < 1);
  assert.notEqual(rng.state(), before);
});

void test('int stays inside its inclusive range and reaches both ends', (): void => {
  const rng: Rng = createRng(5);
  const seen: Set<number> = new Set<number>();
  for (let index: number = 0; index < 500; index += 1) {
    const value: number = rng.int(2, 5);
    assert.ok(Number.isInteger(value) && value >= 2 && value <= 5);
    seen.add(value);
  }
  assert.deepEqual([...seen].toSorted((a: number, b: number): number => a - b), [2, 3, 4, 5]);
  assert.equal(rng.int(3, 3), 3);
});

void test('range and chance respect their bounds', (): void => {
  const rng: Rng = createRng(9);
  for (let index: number = 0; index < 500; index += 1) {
    const value: number = rng.range(-3, 4);
    assert.ok(value >= -3 && value < 4);
  }
  assert.ok(!rng.chance(0));
  assert.ok(rng.chance(1));
});

interface Option extends Weighted {
  readonly name: string;
}

void test('pickWeighted follows the weights roughly and skips zero weights', (): void => {
  const rng: Rng = createRng(11);
  const options: readonly Option[] = [
    { name: 'common', weight: 8 },
    { name: 'rare', weight: 2 },
    { name: 'never', weight: 0 },
  ];
  const counts: Record<string, number> = { common: 0, rare: 0, never: 0 };
  for (let index: number = 0; index < 5000; index += 1) {
    const picked: Option | null = pickWeighted(rng, options);
    if (picked !== null) counts[picked.name] = (counts[picked.name] ?? 0) + 1;
  }
  assert.equal(counts['never'], 0);
  const share: number = (counts['common'] ?? 0) / 5000;
  assert.ok(share > 0.75 && share < 0.85, `common share ${share}`);
});

void test('pickWeighted returns null with nothing to pick', (): void => {
  const rng: Rng = createRng(1);
  assert.equal(pickWeighted(rng, []), null);
  assert.equal(pickWeighted(rng, [{ weight: 0 }]), null);
});
