import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SkillDef } from '../sim/content/types.ts';
import type { Build, Clear, Encounter } from './balance-support.ts';
import { BALANCE_CONTENT, BUILDS, clearEncounter, ENCOUNTERS } from './balance-support.ts';

const LEVELS: readonly number[] = [4, 5, 7];
const SEEDS: readonly number[] = [1, 2, 3];
const LIMITS = {
  paceSpread: 1.65,
  topShare: 0.7,
  leastShare: 0.01,
} as const;

interface Outcome {
  readonly level: number;
  readonly encounter: Encounter;
  readonly build: Build;
  readonly runs: readonly Clear[];
}

const outcomes: readonly Outcome[] = LEVELS.flatMap((level: number): Outcome[] =>
  ENCOUNTERS.flatMap((encounter: Encounter): Outcome[] => BUILDS.map((build: Build): Outcome => ({ level, encounter, build, runs: SEEDS.map((seed: number): Clear => clearEncounter(build, encounter, level, seed)) }))),
);

function pace(outcome: Outcome): number {
  return outcome.runs.reduce((sum: number, run: Clear): number => sum + run.seconds, 0) / outcome.runs.length;
}

function shares(outcome: Outcome): Map<string, number> {
  const totals: Map<string, number> = new Map<string, number>();
  for (const run of outcome.runs) for (const [skill, amount] of run.damage) totals.set(skill, (totals.get(skill) ?? 0) + amount);
  const sum: number = [...totals.values()].reduce((total: number, amount: number): number => total + amount, 0);
  return new Map<string, number>([...totals].map(([skill, amount]: [string, number]): [string, number] => [skill, amount / sum]));
}

void test('every build clears a pack and a tough guarded enemy at every tested level and lives', (): void => {
  for (const outcome of outcomes) {
    for (const run of outcome.runs) assert.ok(run.cleared && run.alive, `${outcome.build.name} at level ${outcome.level} against the ${outcome.encounter.name}`);
  }
});

void test('the three builds clear each encounter at a similar pace', (): void => {
  for (const level of LEVELS) {
    for (const encounter of ENCOUNTERS) {
      const paces: number[] = outcomes.filter((outcome: Outcome): boolean => outcome.level === level && outcome.encounter === encounter).map(pace);
      assert.ok(Math.max(...paces) <= Math.min(...paces) * LIMITS.paceSpread, `level ${level} ${encounter.name}: ${paces.map((seconds: number): string => seconds.toFixed(1)).join(', ')} s`);
    }
  }
});

void test('no single skill beyond the basic attack carries a build, and every damaging skill a build slots does real work somewhere', (): void => {
  const basic: string | null = BALANCE_CONTENT.player.skillBar[0]?.skill ?? null;
  const best: Map<string, number> = new Map<string, number>();
  for (const outcome of outcomes) {
    for (const [skill, share] of shares(outcome)) {
      if (skill !== basic) assert.ok(share <= LIMITS.topShare, `${skill} deals ${(share * 100).toFixed(0)}% for ${outcome.build.name} at level ${outcome.level} against the ${outcome.encounter.name}`);
      best.set(skill, Math.max(best.get(skill) ?? 0, share));
    }
  }
  const slotted: Set<string> = new Set<string>(BUILDS.flatMap((build: Build): readonly string[] => build.order));
  const damaging: string[] = [...slotted].filter((id: string): boolean => {
    const skill: SkillDef | undefined = BALANCE_CONTENT.skills.get(id);
    return skill !== undefined && (skill.damage.weaponPercent > 0 || skill.damage.flatMax > 0);
  });
  for (const skill of damaging) assert.ok((best.get(skill) ?? 0) >= LIMITS.leastShare, `${skill} never does more than ${((best.get(skill) ?? 0) * 100).toFixed(1)}% of a build's damage`);
});
