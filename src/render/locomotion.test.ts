import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, MonsterDef, RigDef } from '../../sim/content/types.ts';
import type { Motion } from '../../sim/world/types.ts';
import { must } from '../../test/support.ts';
import type { ClipKind, GaitChoice } from './locomotion.ts';
import { chooseGait, clipKindOf, flinches, LOCOMOTION, staggerRate } from './locomotion.ts';

const MOTIONS: readonly Motion[] = ['still', 'stride', 'knocked', 'pulled', 'dash', 'lunge', 'rising'];

const BAND = {
  slowest: 0.33,
  fastest: 2.2,
  paces: [1, 0.85, 0.75, 0.45],
} as const;

const content: Content = loadContent();

void test('every way a character can move maps to a clip that explains it, and only standing still maps to the idle clip', (): void => {
  const kinds: Map<Motion, ClipKind> = new Map<Motion, ClipKind>(MOTIONS.map((motion: Motion): [Motion, ClipKind] => [motion, clipKindOf(motion)]));
  assert.deepEqual(Object.fromEntries(kinds), { still: 'idle', stride: 'gait', knocked: 'stagger', pulled: 'stagger', dash: 'action', lunge: 'action', rising: 'rise' });
  assert.deepEqual(MOTIONS.filter((motion: Motion): boolean => clipKindOf(motion) === 'idle'), ['still']);
});

void test('a walk plays at the rate that makes the planted foot cover exactly the ground the body covers', (): void => {
  const gaits = [{ groundSpeed: 1.2 }, { groundSpeed: 7 }];
  for (const speed of [0.3, 1, 2.5, 4, 7.6, 9]) {
    for (const scale of [1, 1.3]) {
      const choice: GaitChoice = must(chooseGait(gaits, scale, speed, 0), `gait at ${speed}`);
      const gait = must(gaits[choice.index], 'gait');
      assert.ok(Math.abs(choice.rate * gait.groundSpeed * scale - speed) < 1e-9);
    }
  }
  assert.equal(chooseGait(gaits, 1, LOCOMOTION.minSpeed / 2, 0), null);
});

void test('the gait picks the clip nearest its natural pace, sooner slowed than hurried, and does not flip back and forth at the crossing', (): void => {
  const gaits = [{ groundSpeed: 1.2 }, { groundSpeed: 7 }];
  assert.equal(must(chooseGait(gaits, 1, 1.5, 1), 'slow').index, 0);
  assert.equal(must(chooseGait(gaits, 1, 6, 0), 'fast').index, 1);
  const crossing: number = Math.exp((Math.log(7) + LOCOMOTION.hurryCost * Math.log(1.2)) / (1 + LOCOMOTION.hurryCost));
  assert.equal(must(chooseGait(gaits, 1, crossing * 1.05, 0), 'held walk').index, 0);
  assert.equal(must(chooseGait(gaits, 1, crossing * 0.95, 1), 'held jog').index, 1);
});

void test('a knockback reels for as long as the push lasts, and a push too short to read is a flinch', (): void => {
  assert.ok(flinches(LOCOMOTION.flinchTime / 2));
  assert.ok(!flinches(LOCOMOTION.flinchTime * 2));
  assert.ok(Math.abs(staggerRate(LOCOMOTION.staggerReel) - 1) < 1e-9);
  assert.ok(staggerRate(0.2) > staggerRate(0.4));
  assert.equal(staggerRate(100), LOCOMOTION.minStaggerRate);
  assert.equal(staggerRate(1e-3), LOCOMOTION.maxStaggerRate);
});

void test('every monster walks, strafes, backs off and circles at speeds its rig has a gait for, without racing or crawling the clip', (): void => {
  const problems: string[] = [];
  for (const monster of content.monsters.values()) {
    const def: MonsterDef = monster;
    const rig: RigDef = must(content.rigs.get(def.rig), def.rig);
    for (const pace of BAND.paces) {
      const speed: number = def.moveSpeed * pace;
      const choice: GaitChoice = must(chooseGait(rig.gaits, def.scale, speed, -1), `${def.id} at ${speed}`);
      if (choice.rate < BAND.slowest || choice.rate > BAND.fastest) problems.push(`${def.id} at ${speed.toFixed(2)} m/s plays ${must(rig.gaits[choice.index], 'gait').clip} at ${choice.rate.toFixed(2)}x`);
    }
  }
  const hero: RigDef = must(content.rigs.get(content.player.rig), 'hero rig');
  const run: GaitChoice = must(chooseGait(hero.gaits, 1, content.player.baseStats.moveSpeed, -1), 'hero run');
  if (run.rate < BAND.slowest || run.rate > BAND.fastest) problems.push(`the hero runs his gait at ${run.rate.toFixed(2)}x`);
  assert.deepEqual(problems, []);
});
