import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import { skillVfx } from './parse-vfx.ts';
import { ContentError } from './read.ts';
import type { SkillVfx } from './vfx-types.ts';

void test('an effect with no lightning, impact or trail keeps the plain look', (): void => {
  assert.deepEqual(skillVfx({ style: 'bolt', color: '#9be1ff' }, 'vfx'), { style: 'bolt', color: '#9be1ff', cue: 'none', light: 1, lightning: null, impact: null, trail: 0 });
});

void test('an effect reads its lightning, impact and trail', (): void => {
  const vfx: SkillVfx = skillVfx({ style: 'fork', color: '#b8e8ff', cue: 'hand', lightning: { forks: 2, glow: 0.6, afterglow: 0.3, jitter: 0.5 }, impact: { sparks: 10, flash: 1.5 }, trail: 1.2 }, 'vfx');
  assert.deepEqual(vfx.lightning, { forks: 2, glow: 0.6, afterglow: 0.3, jitter: 0.5, width: 1, core: 1 });
  assert.deepEqual(vfx.impact, { sparks: 10, flash: 1.5 });
  assert.equal(vfx.trail, 1.2);
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
