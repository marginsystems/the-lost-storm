import assert from 'node:assert/strict';
import { test } from 'node:test';
import { burstCount, particleAlpha, PARTICLES } from './particles.ts';

void test('a particle eases in from nothing and fades out to nothing, whatever its life', (): void => {
  for (const span of [0.1, 0.3, 1.2]) {
    assert.equal(particleAlpha(span, span), 0);
    assert.equal(particleAlpha(0, span), 0);
    assert.ok(particleAlpha(span - 1 / 120, span) < 0.5);
    for (let life: number = span; life > 0; life -= span / 50) {
      const alpha: number = particleAlpha(life, span);
      assert.ok(alpha >= 0 && alpha <= 1);
    }
  }
  assert.ok(particleAlpha(0.6, 1.2) > 0.99);
  assert.equal(particleAlpha(0.5, 0), 0);
});

void test('a burst never spawns more than the cap, and density scales it', (): void => {
  assert.equal(burstCount(1000, 1, 0.5), PARTICLES.burstCap);
  assert.equal(burstCount(20, 0.5, 0), 10);
  assert.equal(burstCount(20, 0, 0.99), 0);
  assert.equal(burstCount(-4, 1, 0.5), 0);
});
