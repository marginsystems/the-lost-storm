import type { Bot } from '../sim/bot.ts';
import { BOT, botStep, createBot } from '../sim/bot.ts';
import type { Content, XpBeyond } from '../sim/content/types.ts';
import { xpToNextLevel } from '../sim/progression.ts';
import { createWorld } from '../sim/world/create.ts';
import { monsterXpScale } from '../sim/world/monster-xp.ts';
import type { World, WorldEvent } from '../sim/world/types.ts';
import { bandBuilds, buildWeapon } from './endgame-band.ts';
import type { BuildPolicy, Policies, SkillPolicy } from './simulate-policies.ts';
import { planFor } from './simulate-policies.ts';
import { farm, fixedLevel } from './simulate-run.ts';
import { spread } from './simulate-summary.ts';
import { gearUp, raiseTo } from './simulate-trial.ts';

export interface PaceBand {
  readonly from: number;
  readonly to: number;
}

export const LEVEL_PACE = {
  levels: [20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48],
  builds: ['glass', 'tank', 'caster', 'spinner'],
  skill: 'average',
  seeds: [1, 2],
  windowMinutes: 6,
  settle: 3,
  reference: { from: 20, to: 30 } satisfies PaceBand,
  bands: [
    { from: 30, to: 40 },
    { from: 40, to: 50 },
  ] satisfies readonly PaceBand[],
  tolerance: 1 / 3,
} as const;

export interface FarmRun {
  readonly level: number;
  readonly seconds: number;
  readonly base: number;
  readonly kills: number;
  readonly deaths: number;
}

export interface PaceRow {
  readonly level: number;
  readonly runs: number;
  readonly xpPerMinute: number;
  readonly killsPerLevel: number;
  readonly minutes: number;
  readonly deaths: number;
}

export function withXpBeyond(content: Content, beyond: XpBeyond | null): Content {
  return { ...content, world: { ...content.world, scaling: { ...content.world.scaling, xpBeyond: beyond } } };
}

export function farmRun(content: Content, policies: Policies, level: number, build: string, seed: number, minutes: number = LEVEL_PACE.windowMinutes): FarmRun {
  const skill: SkillPolicy | undefined = policies.skills.get(LEVEL_PACE.skill);
  const plan: BuildPolicy | undefined = policies.builds.get(build);
  if (skill === undefined || plan === undefined) throw new Error(`no policy ${LEVEL_PACE.skill}/${build}`);
  const weapon = buildWeapon(content, plan, level);
  if (weapon === null) throw new Error(`${build} has no weapon at level ${level}`);
  const fixed: Content = fixedLevel(content, level);
  const world: World = createWorld(fixed, plan.hero === null ? { seed, save: null, opening: false } : { seed, save: null, opening: false, hero: plan.hero });
  const tally = { xp: 0, kills: 0 };
  const bot: Bot = createBot(world, skill.habits, (events: readonly WorldEvent[]): void => {
    for (const event of events) {
      if (event.type === 'xp') tally.xp += event.amount;
      if (event.type === 'death' && event.team === 'monster') tally.kills += 1;
    }
  }, planFor(skill, plan));
  raiseTo(world, level);
  gearUp(bot, weapon.id, level);
  for (let waited: number = 0; waited < LEVEL_PACE.settle; waited += BOT.step) botStep(bot, []);
  world.player.life = world.player.maxLife;
  world.player.mana = world.player.stats.maxMana;
  tally.xp = 0;
  tally.kills = 0;
  const start: number = world.time;
  const deaths: number = bot.deaths;
  farm(bot, start + minutes * 60, skill.loot, (): boolean => world.player.level > level);
  return { level, seconds: world.time - start, base: tally.xp / monsterXpScale(content.world.scaling, level), kills: tally.kills, deaths: bot.deaths - deaths };
}

export function paceRow(content: Content, level: number, runs: readonly FarmRun[]): PaceRow {
  const need: number = xpToNextLevel(content.player.xp, level);
  const scale: number = monsterXpScale(content.world.scaling, level);
  const yielded: readonly FarmRun[] = runs.filter((run: FarmRun): boolean => run.base > 0);
  const minutes: number[] = yielded.map((run: FarmRun): number => ((need / (run.base * scale)) * run.seconds) / 60);
  const kills: number[] = yielded.map((run: FarmRun): number => (need / (run.base * scale)) * run.kills);
  const seconds: number = runs.reduce((sum: number, run: FarmRun): number => sum + run.seconds, 0);
  const xp: number = runs.reduce((sum: number, run: FarmRun): number => sum + run.base * scale, 0);
  return { level, runs: runs.length, xpPerMinute: seconds > 0 ? (xp / seconds) * 60 : 0, killsPerLevel: spread(kills).median, minutes: yielded.length === 0 ? Number.POSITIVE_INFINITY : spread(minutes).median, deaths: runs.reduce((sum: number, run: FarmRun): number => sum + run.deaths, 0) };
}

export function bandMinutes(rows: readonly PaceRow[], band: PaceBand): number {
  const inside: readonly PaceRow[] = rows.filter((row: PaceRow): boolean => row.level >= band.from && row.level < band.to);
  return inside.length === 0 ? 0 : inside.reduce((sum: number, row: PaceRow): number => sum + row.minutes, 0) / inside.length;
}

export function bandRatio(rows: readonly PaceRow[], reference: PaceBand, band: PaceBand): number {
  return bandMinutes(rows, band) / bandMinutes(rows, reference);
}

export function withinTolerance(ratio: number, tolerance: number): boolean {
  return ratio >= 1 - tolerance && ratio <= 1 + tolerance;
}

export function benchBuilds(policies: Policies): string[] {
  return LEVEL_PACE.builds.filter((name: string): boolean => bandBuilds(policies).includes(name));
}

export function paceTable(rows: readonly PaceRow[]): string {
  const head: string = '| level | xp per minute | kills per level | minutes per level | deaths |';
  const line: string = '|---|---|---|---|---|';
  const body: string[] = rows.map((row: PaceRow): string => `| ${row.level} | ${Math.round(row.xpPerMinute)} | ${Math.round(row.killsPerLevel)} | ${Math.round(row.minutes * 10) / 10} | ${row.deaths} |`);
  return [head, line, ...body].join('\n');
}

export function bandTable(rows: readonly PaceRow[], reference: PaceBand, bands: readonly PaceBand[]): string {
  const head: string = '| levels | mean minutes per level | against 20 to 30 |';
  const line: string = '|---|---|---|';
  const body: string[] = [reference, ...bands].map((band: PaceBand): string => `| ${band.from} to ${band.to} | ${Math.round(bandMinutes(rows, band) * 10) / 10} | ${Math.round(bandRatio(rows, reference, band) * 100) / 100} |`);
  return [head, line, ...body].join('\n');
}
