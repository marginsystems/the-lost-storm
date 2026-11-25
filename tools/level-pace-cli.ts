import type { Content } from '../sim/content/types.ts';
import type { FarmRun, PaceRow } from './level-pace.ts';
import { bandTable, benchBuilds, farmRun, LEVEL_PACE, paceRow, paceTable, withXpBeyond } from './level-pace.ts';
import { POLICIES } from './simulate-policies.ts';
import { CONTENT } from './simulate-run.ts';

function option(name: string, fallback: string): string {
  const at: number = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : (process.argv[at + 1] ?? fallback);
}

function numbers(text: string): number[] {
  return text.split(',').map(Number).filter((value: number): boolean => Number.isInteger(value) && value > 0);
}

function positive(name: string, values: readonly number[]): readonly number[] {
  if (values.length === 0) throw new Error(`--${name} needs whole numbers above zero`);
  return values;
}

const levels: readonly number[] = positive('levels', numbers(option('levels', LEVEL_PACE.levels.join(','))));
if (levels.some((level: number): boolean => level > CONTENT.player.xp.maxLevel)) throw new Error(`--levels cannot go above the level cap ${CONTENT.player.xp.maxLevel}`);
const seeds: readonly number[] = positive('seeds', numbers(option('seeds', LEVEL_PACE.seeds.join(','))));
const minutes: number = Number(option('minutes', String(LEVEL_PACE.windowMinutes)));
if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('--minutes needs a number above zero');
const builds: string[] = option('builds', benchBuilds(POLICIES).join(',')).split(',');
const rule = CONTENT.world.scaling.xpBeyond;
const runsByLevel: Map<number, FarmRun[]> = new Map<number, FarmRun[]>();
for (const level of levels) {
  const runs: FarmRun[] = [];
  for (const build of builds) for (const seed of seeds) runs.push(farmRun(CONTENT, POLICIES, level, build, seed, minutes));
  runsByLevel.set(level, runs);
  process.stderr.write(`level ${level}: ${runs.reduce((sum: number, run: FarmRun): number => sum + run.kills, 0)} kills in ${Math.round(runs.reduce((sum: number, run: FarmRun): number => sum + run.seconds, 0))} s, ${runs.reduce((sum: number, run: FarmRun): number => sum + run.deaths, 0)} deaths\n`);
}
const variants: readonly { readonly name: string; readonly content: Content }[] = [
  { name: 'before: the cap raised, monster experience still rising by 0.15 a level', content: withXpBeyond(CONTENT, null) },
  { name: rule === null ? 'after: no rule' : `after: monster experience above level ${rule.from} times ${rule.lift} and grows by ${rule.growth} a level`, content: CONTENT },
];
for (const variant of variants) {
  const rows: PaceRow[] = levels.map((level: number): PaceRow => paceRow(variant.content, level, runsByLevel.get(level) ?? []));
  process.stdout.write(`## ${variant.name}\n\n${paceTable(rows)}\n\n${bandTable(rows, LEVEL_PACE.reference, LEVEL_PACE.bands)}\n\n`);
}
process.stdout.write(`${JSON.stringify([...runsByLevel.values()].flat())}\n`);
