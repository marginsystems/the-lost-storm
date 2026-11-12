import type { MomentReport, PolicyReport, PowerPoint, Reached, Report, Spread } from './simulate-summary.ts';

export const REPORT = {
  topShares: 6,
  topPlaces: 12,
  topDeaths: 5,
} as const;

function fixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

export function clock(seconds: number): string {
  const whole: number = Math.max(0, Math.round(seconds));
  const minutes: number = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

function spreadText(value: Spread, show: (number: number) => string): string {
  if (value.n === 0) return 'none';
  return `${show(value.median)} (p10 ${show(value.p10)}, p90 ${show(value.p90)}, mean ${show(value.mean)})`;
}

function timeText(value: Spread): string {
  return spreadText(value, clock);
}

function numberText(value: Spread, digits: number = 1): string {
  return spreadText(value, (number: number): string => fixed(number, digits));
}

function percent(value: number): string {
  return `${fixed(value * 100, 0)}%`;
}

function reachedLines(title: string, entries: Readonly<Record<string, Reached>>, label: (key: string) => string): string[] {
  const keys: string[] = Object.keys(entries);
  if (keys.length === 0) return [];
  return [
    `  ${title}`,
    ...keys.toSorted((a: string, b: string): number => (entries[a]?.seconds.median ?? 0) - (entries[b]?.seconds.median ?? 0)).map((key: string): string => {
      const reached: Reached | undefined = entries[key];
      return reached === undefined ? '' : `    ${label(key).padEnd(18)} ${timeText(reached.seconds)}${reached.share < 1 ? `  reached by ${percent(reached.share)}` : ''}`;
    }),
  ];
}

function shareLine(title: string, entries: Readonly<Record<string, number>>): string {
  const top: string = Object.entries(entries)
    .slice(0, REPORT.topShares)
    .map(([key, share]: [string, number]): string => `${key} ${percent(share)}`)
    .join(', ');
  return `  ${title.padEnd(20)} ${top === '' ? 'none' : top}`;
}

function momentLine(moment: MomentReport): string {
  return `    ${moment.moment.padEnd(16)} ${String(moment.fights).padStart(4)} fights, cleared ${percent(moment.clearRate).padStart(4)}, died in ${percent(moment.deathRate).padStart(4)}; length ${numberText(moment.seconds)} s; taken ${numberText(moment.taken, 0)}; dealt ${numberText(moment.dealt, 0)}; flasks ${numberText(moment.flasks)}`;
}

function powerLine(point: PowerPoint): string {
  return `    ${String(point.minute).padStart(3)} min  dps ${fixed(point.dps, 1).padStart(6)}  toughness ${fixed(point.toughness, 0).padStart(5)}  item levels ${fixed(point.itemLevels, 0).padStart(3)}  chart places ${fixed(point.places, 0)}`;
}

function chanceText(entries: Readonly<Record<string, number | null>>): string {
  return Object.entries(entries)
    .map(([minutes, chance]: [string, number | null]): string => `${minutes} min ${chance === null ? 'n/a' : percent(chance)}`)
    .join(', ');
}

function rateText(entries: Readonly<Record<string, number>>): string {
  return Object.entries(entries)
    .map(([key, rate]: [string, number]): string => `${key} ${fixed(rate, 1)}`)
    .join(', ');
}

export function policyText(report: PolicyReport): string[] {
  return [
    `${report.policy}  (${report.runs} runs; minutes per run ${numberText(report.minutes)})`,
    ...reachedLines('milestones', report.milestones, (key: string): string => key),
    ...reachedLines('levels', report.levels, (key: string): string => `level ${key}`),
    `  end level           ${numberText(report.endLevel)}`,
    `  deaths              ${numberText(report.deaths)}${report.deathPlaces.length === 0 ? '' : `  where: ${report.deathPlaces.slice(0, REPORT.topDeaths).map(([place, count]: readonly [string, number]): string => `${place} x${count}`).join('; ')}`}`,
    `  flasks              ${numberText(report.flasks)}`,
    `  xp / min            ${numberText(report.xpPerMinute)}`,
    `  gold / min          ${numberText(report.goldPerMinute)}`,
    `  cleared / min       ${numberText(report.clearedPerMinute, 2)}   missed (expired or faded) / min ${numberText(report.expiredPerMinute, 2)}`,
    ...(report.moments.length === 0 ? [] : ['  moments', ...report.moments.map(momentLine)]),
    `  drops / hour        ${rateText(report.dropsPerHour)}`,
    `  by slot             ${rateText(report.dropsPerHourBySlot)}`,
    `  rare or better by   ${chanceText(report.rareChance)}`,
    `  top rarity by       ${chanceText(report.topChance)}`,
    shareLine('damage taken from', report.takenByFoe),
    shareLine('taken by skill', report.takenBySkill),
    shareLine('dealt by skill', report.dealtBySkill),
    ...(report.power.length <= 1 ? [] : ['  power over time (medians)', ...report.power.map(powerLine)]),
    ...(report.places.length === 0 ? [] : [`  first chart places  ${report.places.slice(0, REPORT.topPlaces).map(([place, t]: readonly [string, number]): string => `${place} ${clock(t)}`).join(', ')}`]),
  ];
}

export function reportText(report: Report): string {
  const flags: string[] = report.flags.length === 0 ? ['  none'] : report.flags.map((flag: string): string => `  ! ${flag}`);
  return [`scenario: ${report.scenario}`, '', ...report.policies.flatMap((policy: PolicyReport): string[] => [...policyText(policy), '']), 'flags', ...flags, ''].join('\n');
}
