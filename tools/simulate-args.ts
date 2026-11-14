import type { Job, Scenario } from './simulate-run.ts';
import { RUN } from './simulate-run.ts';
import type { Policies } from './simulate-policies.ts';

export const DEFAULTS = {
  runs: 12,
  farmMinutes: 30,
  repeats: 10,
  seed: 1,
  skills: ['careful', 'average', 'poor'],
  builds: ['mixed'],
} as const;

export type Command = { readonly kind: 'simulate'; readonly scenario: Scenario; readonly jobs: readonly Job[]; readonly workers: number; readonly out: string | null; readonly record: string | null } | { readonly kind: 'replay'; readonly files: readonly string[]; readonly out: string | null } | { readonly kind: 'help'; readonly problem: string | null };

export const USAGE: string = [
  'npm run simulate -- <scenario> [options]',
  '',
  'scenarios',
  '  slice                 a new character from waking to the end card',
  '  farm                  the slice, then N minutes clearing moments in the Hall (--minutes, default 30)',
  '  fight <moment>        the slice, then one moment struck and fought N times (--repeats, default 10)',
  '  level <n>             from waking until level n, farming after the slice (--minutes caps it, default 120)',
  '  over <n>              the slice, then the hero raised to level n farms N minutes in wild zones fixed at --zone (default 1)',
  '  replay <file.jsonl>…  read recorded measurement streams (from --record or storm.saveMeasurements() in a dev build) into the same report',
  '',
  'options',
  '  --runs N              runs per policy (default 12)',
  '  --skill a,b|all       player skill policies (default careful,average,poor)',
  '  --build a,b|all       Skill Tree build policies (default mixed)',
  '  --seed N              first seed; run i uses seed N+i (default 1)',
  '  --workers N           worker threads (default half the cores)',
  '  --out FILE            where to write the JSON report (default simulate-out/<scenario>-<time>.json)',
  '  --record DIR          also write each run as a JSON lines measurement stream into DIR',
].join('\n');

const MISSING: string = '';

function option(args: readonly string[], name: string): string | null {
  const at: number = args.indexOf(`--${name}`);
  if (at < 0) return null;
  const value: string | undefined = args[at + 1];
  return value === undefined || value.startsWith('--') ? MISSING : value;
}

function whole(value: string | null, fallback: number): number | null {
  if (value === null) return fallback;
  if (value === MISSING) return null;
  const parsed: number = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function names(value: string | null, fallback: readonly string[], known: ReadonlyMap<string, unknown>): string[] | null {
  if (value === null) return [...fallback];
  if (value === 'all') return [...known.keys()];
  const list: string[] = value.split(',').filter((name: string): boolean => name !== '');
  return list.length > 0 && list.every((name: string): boolean => known.has(name)) ? list : null;
}

function positional(args: readonly string[]): string[] {
  const out: string[] = [];
  for (let index: number = 0; index < args.length; index += 1) {
    const arg: string = args[index] ?? '';
    if (arg.startsWith('--')) index += args[index + 1]?.startsWith('--') === false ? 1 : 0;
    else out.push(arg);
  }
  return out;
}

function scenarioOf(words: readonly string[], args: readonly string[]): Scenario | string {
  const [kind, value] = words;
  if (kind === undefined) return 'no scenario';
  const minutes: number | null = whole(option(args, 'minutes'), kind === 'level' ? RUN.levelMinutes : DEFAULTS.farmMinutes);
  if (minutes === null) return '--minutes must be a whole number';
  switch (kind) {
    case 'slice':
      return { kind };
    case 'farm':
      return { kind, minutes };
    case 'fight': {
      const repeats: number | null = whole(option(args, 'repeats'), DEFAULTS.repeats);
      if (value === undefined) return 'fight needs a moment id';
      return repeats === null ? '--repeats must be a whole number' : { kind, moment: value, repeats };
    }
    case 'level': {
      const level: number | null = whole(value ?? null, 0);
      return level === null || level < 2 ? 'level needs a target level of 2 or more' : { kind, level, minutes };
    }
    case 'over': {
      const hero: number | null = whole(value ?? null, 0);
      const zone: number | null = whole(option(args, 'zone'), 1);
      if (hero === null || hero < 1) return 'over needs a hero level of 1 or more';
      return zone === null || zone < 1 ? '--zone must be a level of 1 or more' : { kind, hero, zone, minutes };
    }
    default:
      return `unknown scenario ${kind}`;
  }
}

const OPTIONS: ReadonlySet<string> = new Set<string>(['runs', 'skill', 'build', 'seed', 'workers', 'out', 'record', 'minutes', 'repeats', 'zone']);

export function parseArgs(args: readonly string[], policies: Policies, moments: ReadonlySet<string>, cores: number): Command {
  const words: string[] = positional(args);
  if (args.includes('--help') || words.length === 0) return { kind: 'help', problem: null };
  const unknown: string | undefined = args.find((arg: string): boolean => arg.startsWith('--') && !OPTIONS.has(arg.slice(2)));
  if (unknown !== undefined) return { kind: 'help', problem: `unknown option ${unknown}` };
  const out: string | null = option(args, 'out');
  const blank: string | undefined = ['out', 'record', 'skill', 'build'].find((name: string): boolean => option(args, name) === MISSING);
  if (blank !== undefined) return { kind: 'help', problem: `--${blank} needs a value` };
  if (words[0] === 'replay') return words.length > 1 ? { kind: 'replay', files: words.slice(1), out } : { kind: 'help', problem: 'replay needs at least one file' };
  const scenario: Scenario | string = scenarioOf(words, args);
  if (typeof scenario === 'string') return { kind: 'help', problem: scenario };
  if (scenario.kind === 'fight' && !moments.has(scenario.moment)) return { kind: 'help', problem: `no moment ${scenario.moment}; known: ${[...moments].join(', ')}` };
  const runs: number | null = whole(option(args, 'runs'), DEFAULTS.runs);
  const seed: number | null = whole(option(args, 'seed'), DEFAULTS.seed);
  const workers: number | null = whole(option(args, 'workers'), Math.max(1, Math.floor(cores / 2)));
  const skills: string[] | null = names(option(args, 'skill'), DEFAULTS.skills, policies.skills);
  const builds: string[] | null = names(option(args, 'build'), DEFAULTS.builds, policies.builds);
  if (runs === null || seed === null || workers === null) return { kind: 'help', problem: '--runs, --seed and --workers must be whole numbers' };
  if (skills === null) return { kind: 'help', problem: `--skill must name ${[...policies.skills.keys()].join(', ')} or all` };
  if (builds === null) return { kind: 'help', problem: `--build must name ${[...policies.builds.keys()].join(', ')} or all` };
  const jobs: Job[] = skills.flatMap((skill: string): Job[] => builds.flatMap((build: string): Job[] => Array.from({ length: runs }, (_unused: unknown, index: number): Job => ({ scenario, skill, build, seed: seed + index }))));
  return { kind: 'simulate', scenario, jobs, workers, out, record: option(args, 'record') };
}
