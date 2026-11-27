import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import { skillVfx } from './parse-vfx.ts';
import { ContentError } from './read.ts';
import type { SkillVfx } from './vfx-types.ts';

void test('an effect with no lightning, impact or trail keeps the plain look', (): void => {
  assert.deepEqual(skillVfx({ style: 'bolt', color: '#9be1ff' }, 'vfx'), { style: 'bolt', color: '#9be1ff', cue: 'none', light: 1, lightning: null, impact: null, trail: 0, linger: 0, gather: null, wave: null, punch: null, burn: null, shadow: null, water: null, cover: null, rim: false });
});

void test('an effect reads its water and refuses water with no depth', (): void => {
  assert.deepEqual(skillVfx({ style: 'gap', color: '#5fa9cf', water: { deep: '#0e3a5c', foam: '#d6efff', depth: 0.6 } }, 'vfx').water, { deep: '#0e3a5c', foam: '#d6efff', depth: 0.6 });
  assert.throws((): SkillVfx => skillVfx({ style: 'gap', color: '#5fa9cf', water: { deep: '#0e3a5c', foam: '#d6efff', depth: 0 } }, 'vfx'));
});

void test('an effect reads its shadow and refuses a shadow with no strength', (): void => {
  assert.deepEqual(skillVfx({ style: 'roll', color: '#8a7a62', shadow: { color: '#6a3fd0', strength: 0.9 } }, 'vfx').shadow, { color: '#6a3fd0', strength: 0.9 });
  assert.throws((): SkillVfx => skillVfx({ style: 'roll', color: '#8a7a62', shadow: { color: '#6a3fd0', strength: 0 } }, 'vfx'));
});

void test('an effect reads its lightning, impact and trail', (): void => {
  const vfx: SkillVfx = skillVfx({ style: 'fork', color: '#b8e8ff', cue: 'hand', lightning: { forks: 2, glow: 0.6, afterglow: 0.3, jitter: 0.5 }, impact: { sparks: 10, flash: 1.5 }, trail: 1.2 }, 'vfx');
  assert.deepEqual(vfx.lightning, { forks: 2, glow: 0.6, afterglow: 0.3, jitter: 0.5, width: 1, core: 1 });
  assert.deepEqual(vfx.impact, { sparks: 10, flash: 1.5 });
  assert.equal(vfx.trail, 1.2);
});

void test('an effect reads the light that gathers before it leaves and how long its trail hangs', (): void => {
  const vfx: SkillVfx = skillVfx({ style: 'orb', color: '#a66bff', linger: 0.5, gather: { radius: 0.3, lift: 0.1, size: [0, 0.5, 1], glow: [0, 1, 0.7], dust: 40, light: 8 } }, 'vfx');
  assert.equal(vfx.linger, 0.5);
  assert.deepEqual(vfx.gather, { radius: 0.3, lift: 0.1, size: [0, 0.5, 1], glow: [0, 1, 0.7], dust: 40, light: 8 });
});

void test('an effect reads a wave front and the after-waves that follow it', (): void => {
  const vfx: SkillVfx = skillVfx({ style: 'wave', color: '#c9d8f2', wave: { halfWidth: 1.3, depth: 1.6, mist: 40, swell: [0.4, 1, 0.3], ripples: [{ delay: 0.9, strength: 0.4 }, { delay: 1.2, strength: 0.2 }], quiet: 2 } }, 'vfx');
  assert.deepEqual(vfx.wave, { halfWidth: 1.3, depth: 1.6, mist: 40, swell: [0.4, 1, 0.3], ripples: [{ delay: 0.9, strength: 0.4 }, { delay: 1.2, strength: 0.2 }], quiet: 2 });
});

void test('a lightning look may widen its strand and soften its core', (): void => {
  const vfx: SkillVfx = skillVfx({ style: 'mist', color: '#c9d6e2', lightning: { forks: 0, glow: 0.7, afterglow: 0.3, jitter: 0.2, width: 2.2, core: 0.15 } }, 'vfx');
  assert.deepEqual(vfx.lightning, { forks: 0, glow: 0.7, afterglow: 0.3, jitter: 0.2, width: 2.2, core: 0.15 });
});

void test('an effect the kit cannot draw is refused with the field that is wrong', (): void => {
  const refused: readonly [Readonly<Record<string, unknown>>, string][] = [
    [{ lightning: { forks: 1.5, glow: 0.5, afterglow: 0.2, jitter: 0.3 } }, 'vfx.lightning.forks'],
    [{ lightning: { forks: 9, glow: 0.5, afterglow: 0.2, jitter: 0.3 } }, 'vfx.lightning.forks'],
    [{ lightning: { forks: 1, glow: 2, afterglow: 0.2, jitter: 0.3 } }, 'vfx.lightning.glow'],
    [{ lightning: { forks: 1, glow: 0.5, afterglow: 0, jitter: 0.3 } }, 'vfx.lightning.afterglow'],
    [{ lightning: { forks: 1, glow: 0.5, afterglow: 0.2 } }, 'vfx.lightning.jitter'],
    [{ impact: { sparks: -1, flash: 1 } }, 'vfx.impact.sparks'],
    [{ impact: { sparks: 2.5, flash: 1 } }, 'vfx.impact.sparks'],
    [{ impact: { sparks: 3, flash: -1 } }, 'vfx.impact.flash'],
    [{ lightning: { forks: 1, glow: 0.5, afterglow: 0.2, jitter: 0.3, width: 0 } }, 'vfx.lightning.width'],
    [{ lightning: { forks: 1, glow: 0.5, afterglow: 0.2, jitter: 0.3, core: -1 } }, 'vfx.lightning.core'],
    [{ trail: -0.5 }, 'vfx.trail'],
    [{ linger: -0.1 }, 'vfx.linger'],
    [{ wave: { halfWidth: 1, depth: 1, mist: 0, swell: [1, 1], ripples: [{ delay: 1, strength: 0.4 }, { delay: 0.5, strength: 0.2 }], quiet: 2 } }, 'vfx.wave.ripples[1].delay'],
    [{ wave: { halfWidth: 1, depth: 1, mist: 0, swell: [1, 1], ripples: [{ delay: 1, strength: 1.4 }], quiet: 2 } }, 'vfx.wave.ripples[0].strength'],
    [{ wave: { halfWidth: 0, depth: 1, mist: 0, swell: [1, 1], ripples: [], quiet: 2 } }, 'vfx.wave.halfWidth'],
    [{ wave: { halfWidth: 1, depth: 1, mist: 0, swell: [1, 1], ripples: [{ delay: 1, strength: 0.4 }], quiet: 1 } }, 'vfx.wave.quiet'],
    [{ gather: { radius: 0, lift: 0, size: [0, 1], glow: [0, 1], dust: 1, light: 1 } }, 'vfx.gather.radius'],
    [{ gather: { radius: 0.3, lift: 0, size: [0], glow: [0, 1], dust: 1, light: 1 } }, 'vfx.gather.size'],
    [{ gather: { radius: 0.3, lift: 0, size: [0, 1.2], glow: [0, 1], dust: 1, light: 1 } }, 'vfx.gather.size[1]'],
    [{ gather: { radius: 0.3, lift: 0, size: [0, 1], glow: 'up', dust: 1, light: 1 } }, 'vfx.gather.glow'],
    [{ gather: { radius: 0.3, lift: 0, size: [0, 1], glow: [0, 1], dust: -1, light: 1 } }, 'vfx.gather.dust'],
    [{ punch: { dust: 2.5, kick: 3 } }, 'vfx.punch.dust'],
    [{ punch: { dust: 12, kick: 0 } }, 'vfx.punch.kick'],
    [{ burn: { flares: [{ at: 0.5, strength: 1 }, { at: 0.2, strength: 0.5 }], embers: 1, light: 1 } }, 'vfx.burn.flares[1].at'],
    [{ burn: { flares: [{ at: 0.5, strength: 1.5 }], embers: 1, light: 1 } }, 'vfx.burn.flares[0].strength'],
  ];
  for (const [change, field] of refused) {
    assert.throws(
      (): SkillVfx => skillVfx({ style: 'bolt', color: '#9be1ff', ...change }, 'vfx'),
      (error: unknown): boolean => error instanceof ContentError && error.message.includes(field),
      field,
    );
  }
});

void test('the shipped lightning skills that strike a target carry a lightning look and an impact', (): void => {
  const content = loadContent();
  const lit: string[] = [...content.skills.values()].filter((skill): boolean => skill.vfx.lightning !== null && skill.delivery.type !== 'blink').map((skill): string => skill.id);
  assert.ok(lit.length >= 2);
  for (const id of lit) assert.notEqual(content.skills.get(id)?.vfx.impact ?? null, null, id);
});

void test('a punch kicks a whole number of dust motes off the ground at a speed', (): void => {
  assert.deepEqual(skillVfx({ style: 'fork', color: '#9fe8ff', punch: { dust: 14, kick: 4.5 } }, 'vfx').punch, { dust: 14, kick: 4.5 });
});

void test('a burn look reads its flares in order, with embers and a warm light', (): void => {
  assert.deepEqual(skillVfx({ style: 'fire', color: '#ff7a1a', burn: { flares: [{ at: 0.1, strength: 1 }, { at: 0.3, strength: 0.5 }], embers: 20, light: 5 } }, 'vfx').burn, { flares: [{ at: 0.1, strength: 1 }, { at: 0.3, strength: 0.5 }], embers: 20, light: 5 });
});

void test('an effect reads a ground cover and refuses one with no glow', (): void => {
  assert.deepEqual(skillVfx({ style: 'mist', color: '#8c877d', cover: { glow: 0.14, wobble: 0.3 } }, 'vfx').cover, { glow: 0.14, wobble: 0.3 });
  assert.throws((): SkillVfx => skillVfx({ style: 'mist', color: '#8c877d', cover: { glow: 0, wobble: 0.3 } }, 'vfx'));
  assert.throws((): SkillVfx => skillVfx({ style: 'mist', color: '#8c877d', cover: { glow: 0.2, wobble: 1.5 } }, 'vfx'));
});
