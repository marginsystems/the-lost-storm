import type { Content, ItemBaseDef, RarityDef } from '../sim/content/types.ts';
import type { Measurement } from '../sim/measure.ts';
import type { MomentOutcome } from '../sim/world/types.ts';

export interface Fight {
  readonly moment: string;
  readonly level: number;
  readonly seconds: number;
  readonly taken: number;
  readonly dealt: number;
  readonly flasks: number;
  readonly died: boolean;
  readonly outcome: MomentOutcome;
}

export interface Death {
  readonly t: number;
  readonly zone: string;
  readonly foe: string;
  readonly skill: string;
}

export interface Sample {
  readonly t: number;
  readonly dps: number;
  readonly toughness: number;
  readonly itemLevels: number;
}

export interface Placed {
  readonly t: number;
  readonly place: string;
  readonly path: string;
}

export interface Dropped {
  readonly t: number;
  readonly rarity: string;
  readonly slot: string;
}

export interface RunSummary {
  readonly scenario: string;
  readonly policy: string;
  readonly seed: number | null;
  readonly seconds: number;
  readonly reason: string;
  readonly milestones: Readonly<Record<string, number>>;
  readonly levels: Readonly<Record<string, number>>;
  readonly startLevel: number;
  readonly endLevel: number;
  readonly deaths: readonly Death[];
  readonly takenByFoe: Readonly<Record<string, number>>;
  readonly takenBySkill: Readonly<Record<string, number>>;
  readonly dealtBySkill: Readonly<Record<string, number>>;
  readonly fights: readonly Fight[];
  readonly flasks: number;
  readonly xp: number;
  readonly gold: number;
  readonly outcomes: Readonly<Record<string, number>>;
  readonly drops: readonly Dropped[];
  readonly power: readonly Sample[];
  readonly chart: readonly Placed[];
}

interface OpenFight {
  readonly moment: string;
  readonly level: number;
  readonly start: number;
  taken: number;
  dealt: number;
  flasks: number;
  died: boolean;
}

function add(record: Record<string, number>, key: string, amount: number): void {
  record[key] = (record[key] ?? 0) + amount;
}

function latest(open: ReadonlyMap<number, OpenFight>): OpenFight | null {
  return [...open.values()].at(-1) ?? null;
}

export function summarize(stream: readonly Measurement[]): RunSummary {
  let scenario: string = 'unknown';
  let policy: string = 'unknown';
  let seed: number | null = null;
  let seconds: number = 0;
  let reason: string = 'unfinished';
  let startLevel: number | null = null;
  let endLevel: number = 1;
  let flasks: number = 0;
  let xp: number = 0;
  let gold: number = 0;
  const milestones: Record<string, number> = {};
  const levels: Record<string, number> = {};
  const deaths: Death[] = [];
  const takenByFoe: Record<string, number> = {};
  const takenBySkill: Record<string, number> = {};
  const dealtBySkill: Record<string, number> = {};
  const fights: Fight[] = [];
  const outcomes: Record<string, number> = {};
  const drops: Dropped[] = [];
  const power: Sample[] = [];
  const chart: Placed[] = [];
  const open: Map<number, OpenFight> = new Map<number, OpenFight>();
  for (const entry of stream) {
    seconds = Math.max(seconds, entry.t);
    const fight: OpenFight | null = latest(open);
    switch (entry.kind) {
      case 'session':
        scenario = entry.scenario;
        policy = entry.policy;
        seed = entry.seed;
        break;
      case 'milestone':
        milestones[entry.name] ??= entry.t;
        break;
      case 'zone':
        break;
      case 'level':
        startLevel ??= entry.level;
        endLevel = entry.level;
        levels[String(entry.level)] ??= entry.t;
        break;
      case 'xp':
        xp += entry.amount;
        break;
      case 'gold':
        gold += entry.amount;
        break;
      case 'drop':
        drops.push({ t: entry.t, rarity: entry.rarity, slot: entry.slot });
        break;
      case 'hit':
        if (entry.taken) {
          add(takenByFoe, entry.foe, entry.amount);
          add(takenBySkill, entry.skill, entry.amount);
          if (fight !== null) fight.taken += entry.amount;
        } else {
          add(dealtBySkill, entry.skill, entry.amount);
          if (fight !== null) fight.dealt += entry.amount;
        }
        break;
      case 'kill':
        break;
      case 'death':
        deaths.push({ t: entry.t, zone: entry.zone, foe: entry.foe, skill: entry.skill });
        if (fight !== null) fight.died = true;
        break;
      case 'flask':
        flasks += 1;
        if (fight !== null) fight.flasks += 1;
        break;
      case 'fight':
        open.set(entry.id, { moment: entry.moment, level: entry.level, start: entry.t, taken: 0, dealt: 0, flasks: 0, died: false });
        break;
      case 'moment': {
        add(outcomes, entry.outcome, 1);
        const ended: OpenFight | undefined = open.get(entry.id);
        if (ended === undefined) break;
        open.delete(entry.id);
        fights.push({ moment: ended.moment, level: ended.level, seconds: entry.t - ended.start, taken: ended.taken, dealt: ended.dealt, flasks: ended.flasks, died: ended.died, outcome: entry.outcome });
        break;
      }
      case 'skill':
        break;
      case 'chart':
        chart.push({ t: entry.t, place: entry.place, path: entry.path });
        break;
      case 'power':
        power.push({ t: entry.t, dps: entry.dps, toughness: entry.toughness, itemLevels: entry.itemLevels });
        break;
      case 'end':
        reason = entry.reason;
        break;
    }
  }
  return { scenario, policy, seed, seconds, reason, milestones, levels, startLevel: startLevel ?? endLevel, endLevel, deaths, takenByFoe, takenBySkill, dealtBySkill, fights, flasks, xp, gold, outcomes, drops, power, chart };
}

export interface Spread {
  readonly n: number;
  readonly mean: number;
  readonly median: number;
  readonly p10: number;
  readonly p90: number;
}

export function percentile(sorted: readonly number[], share: number): number {
  if (sorted.length === 0) return 0;
  const at: number = (sorted.length - 1) * share;
  const low: number = Math.floor(at);
  const high: number = Math.ceil(at);
  const a: number = sorted[low] ?? 0;
  const b: number = sorted[high] ?? a;
  return a + (b - a) * (at - low);
}

export function spread(values: readonly number[]): Spread {
  const sorted: number[] = values.toSorted((a: number, b: number): number => a - b);
  const mean: number = sorted.length === 0 ? 0 : sorted.reduce((sum: number, value: number): number => sum + value, 0) / sorted.length;
  return { n: sorted.length, mean, median: percentile(sorted, 0.5), p10: percentile(sorted, 0.1), p90: percentile(sorted, 0.9) };
}

export interface Reached {
  readonly share: number;
  readonly seconds: Spread;
}

export interface MomentReport {
  readonly moment: string;
  readonly fights: number;
  readonly clearRate: number;
  readonly deathRate: number;
  readonly seconds: Spread;
  readonly taken: Spread;
  readonly dealt: Spread;
  readonly flasks: Spread;
}

export interface PowerPoint {
  readonly minute: number;
  readonly dps: number;
  readonly toughness: number;
  readonly itemLevels: number;
  readonly places: number;
}

export interface PolicyReport {
  readonly policy: string;
  readonly runs: number;
  readonly stuck: readonly string[];
  readonly minutes: Spread;
  readonly milestones: Readonly<Record<string, Reached>>;
  readonly levels: Readonly<Record<string, Reached>>;
  readonly endLevel: Spread;
  readonly deaths: Spread;
  readonly deathPlaces: readonly (readonly [string, number])[];
  readonly flasks: Spread;
  readonly xpPerMinute: Spread;
  readonly goldPerMinute: Spread;
  readonly clearedPerMinute: Spread;
  readonly expiredPerMinute: Spread;
  readonly moments: readonly MomentReport[];
  readonly dropsPerHour: Readonly<Record<string, number>>;
  readonly dropsPerHourBySlot: Readonly<Record<string, number>>;
  readonly rareChance: Readonly<Record<string, number | null>>;
  readonly topChance: Readonly<Record<string, number | null>>;
  readonly power: readonly PowerPoint[];
  readonly places: readonly (readonly [string, number])[];
  readonly takenByFoe: Readonly<Record<string, number>>;
  readonly takenBySkill: Readonly<Record<string, number>>;
  readonly dealtBySkill: Readonly<Record<string, number>>;
}

export interface Report {
  readonly scenario: string;
  readonly policies: readonly PolicyReport[];
  readonly flags: readonly string[];
  readonly rarities: readonly string[];
}

export interface ReportRules {
  readonly rare: string;
  readonly windows: readonly number[];
  readonly sampleMinutes: number;
}

function perMinute(runs: readonly RunSummary[], value: (run: RunSummary) => number): Spread {
  return spread(runs.filter((run: RunSummary): boolean => run.seconds > 0).map((run: RunSummary): number => value(run) / (run.seconds / 60)));
}

function reachedSpread(runs: readonly RunSummary[], keys: readonly string[], pick: (run: RunSummary) => Readonly<Record<string, number>>): Record<string, Reached> {
  const out: Record<string, Reached> = {};
  for (const key of keys) {
    const times: number[] = runs.flatMap((run: RunSummary): number[] => {
      const t: number | undefined = pick(run)[key];
      return t === undefined ? [] : [t];
    });
    out[key] = { share: runs.length === 0 ? 0 : times.length / runs.length, seconds: spread(times) };
  }
  return out;
}

function shares(runs: readonly RunSummary[], pick: (run: RunSummary) => Readonly<Record<string, number>>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const run of runs) for (const [key, amount] of Object.entries(pick(run))) add(totals, key, amount);
  const sum: number = Object.values(totals).reduce((total: number, amount: number): number => total + amount, 0);
  return Object.fromEntries(Object.entries(totals).map(([key, amount]: [string, number]): [string, number] => [key, sum === 0 ? 0 : amount / sum]).toSorted((a: [string, number], b: [string, number]): number => b[1] - a[1]));
}

function momentReports(runs: readonly RunSummary[]): MomentReport[] {
  const byMoment: Map<string, Fight[]> = new Map<string, Fight[]>();
  for (const run of runs) for (const fight of run.fights) byMoment.set(fight.moment, [...(byMoment.get(fight.moment) ?? []), fight]);
  return [...byMoment]
    .map(([moment, fights]: [string, Fight[]]): MomentReport => {
      const cleared: Fight[] = fights.filter((fight: Fight): boolean => fight.outcome === 'resolved');
      return {
        moment,
        fights: fights.length,
        clearRate: cleared.length / fights.length,
        deathRate: fights.filter((fight: Fight): boolean => fight.died).length / fights.length,
        seconds: spread(cleared.map((fight: Fight): number => fight.seconds)),
        taken: spread(fights.map((fight: Fight): number => fight.taken)),
        dealt: spread(fights.map((fight: Fight): number => fight.dealt)),
        flasks: spread(fights.map((fight: Fight): number => fight.flasks)),
      };
    })
    .toSorted((a: MomentReport, b: MomentReport): number => a.moment.localeCompare(b.moment));
}

function rarerThan(content: Content, rare: string): Set<string> {
  const pivot: RarityDef | undefined = content.rarities.find((rarity: RarityDef): boolean => rarity.id === rare);
  return new Set<string>(content.rarities.filter((rarity: RarityDef): boolean => pivot !== undefined && rarity.weight <= pivot.weight).map((rarity: RarityDef): string => rarity.id));
}

export function topRarity(content: Content): string {
  return content.rarities.toSorted((a: RarityDef, b: RarityDef): number => a.weight - b.weight)[0]?.id ?? 'none';
}

function windowChance(runs: readonly RunSummary[], minutes: number, wanted: ReadonlySet<string>): number | null {
  const long: RunSummary[] = runs.filter((run: RunSummary): boolean => run.seconds >= minutes * 60 - 1);
  if (long.length === 0) return null;
  const lucky: number = long.filter((run: RunSummary): boolean => run.drops.some((drop: Dropped): boolean => wanted.has(drop.rarity) && drop.t <= minutes * 60)).length;
  return lucky / long.length;
}

function sampleAt<T extends { readonly t: number }>(list: readonly T[], t: number): T | null {
  let best: T | null = null;
  for (const entry of list) if (entry.t <= t) best = entry;
  return best;
}

function powerCurve(runs: readonly RunSummary[], every: number): PowerPoint[] {
  const longest: number = Math.max(0, ...runs.map((run: RunSummary): number => run.seconds));
  const points: PowerPoint[] = [];
  for (let minute: number = 0; minute * 60 <= longest; minute += every) {
    const live: RunSummary[] = runs.filter((run: RunSummary): boolean => run.seconds >= minute * 60);
    const samples: Sample[] = live.flatMap((run: RunSummary): Sample[] => {
      const sample: Sample | null = sampleAt(run.power, minute * 60);
      return sample === null ? [] : [sample];
    });
    points.push({
      minute,
      dps: spread(samples.map((sample: Sample): number => sample.dps)).median,
      toughness: spread(samples.map((sample: Sample): number => sample.toughness)).median,
      itemLevels: spread(samples.map((sample: Sample): number => sample.itemLevels)).median,
      places: spread(live.map((run: RunSummary): number => run.chart.filter((placed: Placed): boolean => placed.t <= minute * 60).length)).median,
    });
  }
  return points;
}

function firstPlaces(runs: readonly RunSummary[]): [string, number][] {
  const times: Map<string, number[]> = new Map<string, number[]>();
  for (const run of runs) for (const placed of run.chart) times.set(placed.place, [...(times.get(placed.place) ?? []), placed.t]);
  return [...times].map(([place, list]: [string, number[]]): [string, number] => [place, spread(list).median]).toSorted((a: [string, number], b: [string, number]): number => a[1] - b[1]);
}

function deathPlaces(runs: readonly RunSummary[]): [string, number][] {
  const counts: Record<string, number> = {};
  for (const run of runs) for (const death of run.deaths) add(counts, `${death.zone} / ${death.foe} / ${death.skill}`, 1);
  return Object.entries(counts).toSorted((a: [string, number], b: [string, number]): number => b[1] - a[1]);
}

function perHour(runs: readonly RunSummary[], key: (drop: Dropped) => string, keys: readonly string[]): Record<string, number> {
  const hours: number = runs.reduce((sum: number, run: RunSummary): number => sum + run.seconds, 0) / 3600;
  const counts: Record<string, number> = Object.fromEntries(keys.map((name: string): [string, number] => [name, 0]));
  for (const run of runs) for (const drop of run.drops) add(counts, key(drop), 1);
  return Object.fromEntries(Object.entries(counts).map(([name, count]: [string, number]): [string, number] => [name, hours === 0 ? 0 : count / hours]));
}

export function policyReport(content: Content, policy: string, runs: readonly RunSummary[], rules: ReportRules): PolicyReport {
  const milestoneNames: string[] = [...new Set<string>(runs.flatMap((run: RunSummary): string[] => Object.keys(run.milestones)))];
  const levelNames: string[] = [...new Set<string>(runs.flatMap((run: RunSummary): string[] => Object.keys(run.levels)))].toSorted((a: string, b: string): number => Number(a) - Number(b));
  const rare: Set<string> = rarerThan(content, rules.rare);
  const top: Set<string> = new Set<string>([topRarity(content)]);
  const slots: string[] = [...new Set<string>([...content.itemBases.values()].flatMap((base: ItemBaseDef): string[] => (base.slot === null ? [] : [base.slot])))];
  return {
    policy,
    runs: runs.length,
    stuck: runs.filter((run: RunSummary): boolean => run.reason !== 'done').map((run: RunSummary): string => `seed ${run.seed ?? '?'}: ${run.reason}`),
    minutes: spread(runs.map((run: RunSummary): number => run.seconds / 60)),
    milestones: reachedSpread(runs, milestoneNames, (run: RunSummary): Readonly<Record<string, number>> => run.milestones),
    levels: reachedSpread(runs, levelNames, (run: RunSummary): Readonly<Record<string, number>> => run.levels),
    endLevel: spread(runs.map((run: RunSummary): number => run.endLevel)),
    deaths: spread(runs.map((run: RunSummary): number => run.deaths.length)),
    deathPlaces: deathPlaces(runs),
    flasks: spread(runs.map((run: RunSummary): number => run.flasks)),
    xpPerMinute: perMinute(runs, (run: RunSummary): number => run.xp),
    goldPerMinute: perMinute(runs, (run: RunSummary): number => run.gold),
    clearedPerMinute: perMinute(runs, (run: RunSummary): number => run.outcomes['resolved'] ?? 0),
    expiredPerMinute: perMinute(runs, (run: RunSummary): number => (run.outcomes['expired'] ?? 0) + (run.outcomes['faded'] ?? 0)),
    moments: momentReports(runs),
    dropsPerHour: perHour(runs, (drop: Dropped): string => drop.rarity, content.rarities.map((rarity: RarityDef): string => rarity.id)),
    dropsPerHourBySlot: perHour(runs, (drop: Dropped): string => drop.slot, slots),
    rareChance: Object.fromEntries(rules.windows.map((minutes: number): [string, number | null] => [String(minutes), windowChance(runs, minutes, rare)])),
    topChance: Object.fromEntries(rules.windows.map((minutes: number): [string, number | null] => [String(minutes), windowChance(runs, minutes, top)])),
    power: powerCurve(runs, rules.sampleMinutes),
    places: firstPlaces(runs),
    takenByFoe: shares(runs, (run: RunSummary): Readonly<Record<string, number>> => run.takenByFoe),
    takenBySkill: shares(runs, (run: RunSummary): Readonly<Record<string, number>> => run.takenBySkill),
    dealtBySkill: shares(runs, (run: RunSummary): Readonly<Record<string, number>> => run.dealtBySkill),
  };
}

export const OUTLIERS = {
  minFights: 3,
  minRunsForNeverDies: 5,
  minDropsForRarity: 30,
} as const;

export function outliers(content: Content, reports: readonly PolicyReport[], fights: boolean): string[] {
  const flags: string[] = [];
  for (const report of reports) {
    if (report.stuck.length > 0) flags.push(`${report.policy}: ${report.stuck.length} of ${report.runs} runs did not finish (${report.stuck.slice(0, 3).join('; ')})`);
    for (const moment of report.moments) if (moment.fights >= OUTLIERS.minFights && moment.clearRate === 0) flags.push(`${report.policy}: never clears ${moment.moment} (${moment.fights} fights)`);
    if (fights && report.runs >= OUTLIERS.minRunsForNeverDies && report.deaths.mean === 0) flags.push(`${report.policy}: never dies in ${report.runs} runs`);
  }
  const drops: number = reports.reduce((sum: number, report: PolicyReport): number => sum + Object.values(report.dropsPerHour).reduce((total: number, rate: number): number => total + rate, 0) * report.minutes.mean * report.runs / 60, 0);
  if (drops >= OUTLIERS.minDropsForRarity) {
    for (const rarity of content.rarities) if (reports.every((report: PolicyReport): boolean => (report.dropsPerHour[rarity.id] ?? 0) === 0)) flags.push(`${rarity.id} never dropped (${Math.round(drops)} drops in all)`);
  }
  return flags;
}

export function buildReport(content: Content, runs: readonly RunSummary[], rules: ReportRules): Report {
  const policies: string[] = [...new Set<string>(runs.map((run: RunSummary): string => run.policy))];
  const reports: PolicyReport[] = policies.map((policy: string): PolicyReport => policyReport(content, policy, runs.filter((run: RunSummary): boolean => run.policy === policy), rules));
  const fights: boolean = runs.some((run: RunSummary): boolean => run.fights.length > 0);
  return { scenario: runs[0]?.scenario ?? 'none', policies: reports, flags: outliers(content, reports, fights), rarities: content.rarities.map((rarity: RarityDef): string => rarity.id) };
}
