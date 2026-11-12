import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, MonsterDef, RigDef } from '../../sim/content/types.ts';
import type { Motion } from '../../sim/world/types.ts';
import { must } from '../../test/support.ts';
import type { BodyState, ClipKind, GaitChoice } from './locomotion.ts';
import { rigClipNames } from '../../sim/content/clips.ts';
import { BODY_STATES, chooseGait, clipKindOf, clipsFor, knockPose, LOCOMOTION } from './locomotion.ts';

const MOTIONS: readonly Motion[] = ['still', 'stride', 'knocked', 'pulled', 'dash', 'lunge', 'rising'];

const BAND = {
  slowest: 0.33,
  fastest: 2.2,
  paces: [1, 0.85, 0.75, 0.45],
} as const;

const content: Content = loadContent();

void test('every way a character can move maps to a clip that explains it, and only standing still maps to the idle clip', (): void => {
  const kinds: Map<Motion, ClipKind> = new Map<Motion, ClipKind>(MOTIONS.map((motion: Motion): [Motion, ClipKind] => [motion, clipKindOf(motion)]));
  assert.deepEqual(Object.fromEntries(kinds), { still: 'idle', stride: 'gait', knocked: 'knock', pulled: 'knock', dash: 'action', lunge: 'action', rising: 'rise' });
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

void test('a knockback is a short hop back: it lifts and leans from nothing, peaks halfway through the push and lands as the push ends', (): void => {
  const span: number = LOCOMOTION.fullHopTime;
  assert.deepEqual(knockPose(span, span), { lift: 0, lean: 0 });
  assert.ok(knockPose(span, 0).lift < 1e-9 && knockPose(span, 0).lean < 1e-9);
  const peak = knockPose(span, span / 2);
  assert.ok(Math.abs(peak.lift - LOCOMOTION.hop) < 1e-9 && Math.abs(peak.lean - LOCOMOTION.tilt) < 1e-9);
  assert.ok(knockPose(span, span / 4).lift < peak.lift);
  assert.ok(knockPose(span / 4, span / 8).lift < peak.lift);
  assert.deepEqual(knockPose(0, 0), { lift: 0, lean: 0 });
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

function stateProblems(who: string, rig: RigDef, animations: readonly string[]): string[] {
  const named: Set<string> = new Set<string>(rigClipNames(rig));
  const problems: string[] = [];
  for (const animation of animations) {
    for (const state of BODY_STATES) {
      const clips: readonly string[] = clipsFor(state, { idle: rig.clips.idle, gaits: rig.gaits.map((gait): string => gait.clip), hit: rig.clips.hit, death: rig.clips.death, rise: rig.clips.rise, action: rig.clips.actions[animation]?.clip ?? null });
      if (clips.length === 0) problems.push(`${who} has nothing to play when ${state}`);
      for (const clip of clips) if (!named.has(clip)) problems.push(`${who} would play ${clip} when ${state}, which its rig does not load`);
    }
  }
  return problems;
}

void test('the hero, every monster and every echo that turns have a clip, or a standing fallback, for everything the sim can put them through, so no body ever shows the bind pose', (): void => {
  const problems: string[] = [];
  for (const monster of content.monsters.values()) {
    const skill = must(content.skills.get(monster.skill), monster.skill);
    problems.push(...stateProblems(monster.id, must(content.rigs.get(monster.rig), monster.rig), [skill.animation]));
  }
  for (const moment of content.moments.defs.values()) {
    for (const echo of moment.echoes) {
      if (!echo.turns || echo.look === null) continue;
      const monster = must(content.monsters.get(echo.monster), echo.monster);
      const skill = must(content.skills.get(monster.skill), monster.skill);
      problems.push(...stateProblems(`${moment.id} echo of ${echo.monster}`, must(content.rigs.get(echo.look.rig), echo.look.rig), [skill.animation]));
    }
  }
  const hero: RigDef = must(content.rigs.get(content.player.rig), 'hero rig');
  problems.push(...stateProblems('the hero', hero, Object.keys(hero.clips.actions)));
  assert.deepEqual(problems, []);
  const bare = { idle: 'Idle', gaits: [], hit: [], death: [], rise: null, action: null };
  assert.deepEqual(BODY_STATES.map((state: BodyState): readonly string[] => clipsFor(state, bare)), BODY_STATES.map((): readonly string[] => ['Idle']));
  assert.deepEqual(clipsFor('death', { ...bare, rise: 'Lie_Down' }), ['Lie_Down']);
});
