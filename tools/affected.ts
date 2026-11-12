import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { each, fields, text, textList } from '../sim/content/read.ts';
import type { Fields } from '../sim/content/read.ts';
import raw from './affected-rules.json' with { type: 'json' };

export type AffectedRule =
  | { readonly kind: 'everything'; readonly paths: readonly string[] }
  | { readonly kind: 'importers'; readonly paths: readonly string[]; readonly alsoRun: readonly string[] }
  | { readonly kind: 'only'; readonly paths: readonly string[]; readonly run: readonly string[] };

export interface AffectedConfig {
  readonly testRoots: readonly string[];
  readonly graphRoots: readonly string[];
  readonly alwaysRun: readonly string[];
  readonly rules: readonly AffectedRule[];
}

export interface SourceText {
  readonly path: string;
  readonly text: string;
}

export interface ImportGraph {
  readonly files: ReadonlySet<string>;
  readonly importers: ReadonlyMap<string, readonly string[]>;
}

export type Selection =
  | { readonly kind: 'everything'; readonly reason: string }
  | { readonly kind: 'some'; readonly tests: readonly string[] };

export interface ShardResult {
  readonly code: number;
  readonly output: string;
}

export interface CliOptions {
  readonly run: boolean;
  readonly all: boolean;
  readonly jobs: number;
  readonly base: string;
  readonly head: string;
  readonly files: readonly string[] | null;
}

const CLI = {
  defaultBase: 'origin/main',
  defaultHead: 'HEAD',
  testSuffix: '.test.ts',
  isolation: '--experimental-test-isolation=none',
  reporter: '--test-reporter=spec',
  maxJobs: 4,
} as const;

const SPECIFIERS: readonly RegExp[] = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bnew URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g,
];

export function readRule(value: unknown, where: string): AffectedRule {
  const source: Fields = fields(value, where);
  const kind: string = text(source, 'kind', where);
  const paths: string[] = textList(source, 'paths', where);
  if (kind === 'everything') return { kind, paths };
  if (kind === 'importers') return { kind, paths, alsoRun: textList(source, 'alsoRun', where) };
  if (kind === 'only') return { kind, paths, run: textList(source, 'run', where) };
  throw new Error(`${where}.kind is ${kind}, not everything, importers or only`);
}

export function readConfig(value: unknown): AffectedConfig {
  const where: string = 'affected-rules';
  const source: Fields = fields(value, where);
  return {
    testRoots: textList(source, 'testRoots', where),
    graphRoots: textList(source, 'graphRoots', where),
    alwaysRun: textList(source, 'alwaysRun', where),
    rules: each(source['rules'], `${where}.rules`, readRule),
  };
}

export const AFFECTED: AffectedConfig = readConfig(raw);

const REPOSITORY_PATH: RegExp = /['"`](\.?\w[\w.-]*(?:\/[\w.-]+)*)['"`]/g;

export function globToRegExp(glob: string): RegExp {
  let pattern: string = '';
  for (let index: number = 0; index < glob.length; index += 1) {
    const char: string = glob.charAt(index);
    if (char === '*' && glob.charAt(index + 1) === '*') {
      const slash: boolean = glob.charAt(index + 2) === '/';
      pattern += slash ? '(?:.*/)?' : '.*';
      index += slash ? 2 : 1;
    } else if (char === '*') {
      pattern += '[^/]*';
    } else if (char === '?') {
      pattern += '[^/]';
    } else {
      pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${pattern}$`);
}

export function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some((glob: string): boolean => globToRegExp(glob).test(path));
}

export function specifiersOf(source: string): string[] {
  return SPECIFIERS.flatMap((pattern: RegExp): string[] => [...source.matchAll(pattern)].map((match: RegExpExecArray): string => match[1] ?? '')).filter((specifier: string): boolean => specifier.startsWith('.'));
}

export function resolveSpecifier(from: string, specifier: string, files: ReadonlySet<string>): string {
  const bare: string = specifier.split('?')[0] ?? specifier;
  const base: string = normalize(join(dirname(from), bare)).split('\\').join('/');
  const candidates: readonly string[] = [base, `${base}.ts`, `${base}/index.ts`];
  return candidates.find((candidate: string): boolean => files.has(candidate)) ?? base;
}

export function repositoryPathsOf(source: string, files: ReadonlySet<string>): string[] {
  return [...source.matchAll(REPOSITORY_PATH)].map((match: RegExpExecArray): string => match[1] ?? '').filter((path: string): boolean => files.has(path));
}

export function targetsOf(source: SourceText, files: ReadonlySet<string>): string[] {
  const targets: string[] = specifiersOf(source.text).map((specifier: string): string => resolveSpecifier(source.path, specifier, files));
  targets.push(...repositoryPathsOf(source.text, files));
  const sibling: string = source.path.replace(/\.test\.ts$/, '.ts');
  if (sibling !== source.path && files.has(sibling)) targets.push(sibling);
  return targets.filter((target: string): boolean => target !== source.path);
}

export function buildImportGraph(sources: readonly SourceText[], extraFiles: readonly string[] = []): ImportGraph {
  const files: Set<string> = new Set<string>([...sources.map((source: SourceText): string => source.path), ...extraFiles]);
  const importers: Map<string, string[]> = new Map<string, string[]>();
  for (const source of sources) {
    for (const target of targetsOf(source, files)) {
      const list: string[] = importers.get(target) ?? [];
      if (!list.includes(source.path)) list.push(source.path);
      importers.set(target, list);
    }
  }
  return { files, importers };
}

export function dependents(graph: ImportGraph, start: string): Set<string> {
  const seen: Set<string> = new Set<string>([start]);
  const queue: string[] = [start];
  for (let next: string | undefined = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const importer of graph.importers.get(next) ?? []) {
      if (seen.has(importer)) continue;
      seen.add(importer);
      queue.push(importer);
    }
  }
  return seen;
}

function testsFor(rule: AffectedRule, changed: string, graph: ImportGraph, testFiles: readonly string[]): string[] {
  let reached: Set<string> = new Set<string>();
  let globs: readonly string[] = [];
  switch (rule.kind) {
    case 'everything':
      break;
    case 'only':
      globs = rule.run;
      break;
    case 'importers':
      reached = dependents(graph, changed);
      if (changed.endsWith('.ts') && !changed.endsWith(CLI.testSuffix)) reached.add(changed.replace(/\.ts$/, CLI.testSuffix));
      globs = rule.alsoRun;
      break;
  }
  return testFiles.filter((test: string): boolean => reached.has(test) || matchesAny(test, globs));
}

export function selectTests(changed: readonly string[], graph: ImportGraph, testFiles: readonly string[], config: AffectedConfig): Selection {
  if (changed.length === 0) return { kind: 'everything', reason: 'no changed files were found' };
  const tests: Set<string> = new Set<string>(testFiles.filter((test: string): boolean => matchesAny(test, config.alwaysRun)));
  for (const path of changed) {
    const rules: readonly AffectedRule[] = config.rules.filter((rule: AffectedRule): boolean => matchesAny(path, rule.paths));
    if (rules.length === 0) return { kind: 'everything', reason: `${path} matches no rule` };
    const broad: AffectedRule | undefined = rules.find((rule: AffectedRule): boolean => rule.kind === 'everything');
    if (broad !== undefined) return { kind: 'everything', reason: `${path} affects every test` };
    for (const rule of rules) for (const test of testsFor(rule, path, graph, testFiles)) tests.add(test);
  }
  return { kind: 'some', tests: [...tests].toSorted() };
}

function walk(root: string, dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(join(root, dir));
  } catch {
    return [];
  }
  return names.flatMap((name: string): string[] => {
    const path: string = dir === '' ? name : `${dir}/${name}`;
    if (name === 'node_modules') return [];
    return statSync(join(root, path)).isDirectory() ? walk(root, path) : [path];
  });
}

export function readRepository(root: string, config: AffectedConfig): { readonly graph: ImportGraph; readonly testFiles: readonly string[] } {
  const all: string[] = config.graphRoots.flatMap((dir: string): string[] => walk(root, dir));
  const sources: SourceText[] = all.filter((path: string): boolean => path.endsWith('.ts')).map((path: string): SourceText => ({ path, text: readFileSync(join(root, path), 'utf8') }));
  const testFiles: string[] = config.testRoots.flatMap((dir: string): string[] => walk(root, dir)).filter((path: string): boolean => path.endsWith(CLI.testSuffix)).toSorted();
  return { graph: buildImportGraph(sources, all), testFiles };
}

function git(root: string, args: readonly string[]): string[] | null {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.split('\n').map((line: string): string => line.trim()).filter((line: string): boolean => line !== '');
}

export function changedFiles(root: string, base: string, head: string): string[] | null {
  const committed: string[] | null = git(root, ['diff', '--name-only', '--no-renames', `${base}...${head}`]);
  if (committed === null) return null;
  if (head !== CLI.defaultHead) return committed;
  const staged: string[] | null = git(root, ['diff', '--name-only', '--no-renames', 'HEAD']);
  const untracked: string[] | null = git(root, ['ls-files', '--others', '--exclude-standard']);
  if (staged === null || untracked === null) return null;
  return [...new Set<string>([...committed, ...staged, ...untracked])].toSorted();
}

export function defaultJobs(cores: number): number {
  return Math.max(1, Math.min(CLI.maxJobs, cores - 1));
}

export function parseArgs(argv: readonly string[], cores: number = availableParallelism()): CliOptions {
  let run: boolean = false;
  let all: boolean = false;
  let jobs: number = defaultJobs(cores);
  let base: string = CLI.defaultBase;
  let head: string = CLI.defaultHead;
  let files: string[] | null = null;
  for (let index: number = 0; index < argv.length; index += 1) {
    const arg: string = argv[index] ?? '';
    const value: string | undefined = argv[index + 1];
    if (files !== null) files.push(arg);
    else if (arg === '--run') run = true;
    else if (arg === '--all') all = true;
    else if (arg === '--') files = [];
    else if (value === undefined) throw new Error(`${arg} needs a value or is unknown`);
    else if (arg === '--base') base = value;
    else if (arg === '--head') head = value;
    else if (arg === '--jobs' && /^[1-9]\d*$/.test(value)) jobs = Number(value);
    else throw new Error(`unknown argument ${arg} ${value}`);
    if (arg === '--base' || arg === '--head' || arg === '--jobs') index += 1;
  }
  return { run, all, jobs, base, head, files };
}

export function filesToRun(selection: Selection, testFiles: readonly string[]): readonly string[] {
  let files: readonly string[] = testFiles;
  switch (selection.kind) {
    case 'everything':
      break;
    case 'some':
      files = selection.tests;
      break;
  }
  return files;
}

export function shard(files: readonly string[], jobs: number): string[][] {
  const shards: string[][] = Array.from({ length: Math.max(1, jobs) }, (): string[] => []);
  files.forEach((file: string, index: number): void => {
    shards[index % shards.length]?.push(file);
  });
  return shards.filter((group: readonly string[]): boolean => group.length > 0);
}

export function testCommand(files: readonly string[]): string[] {
  return ['--test', CLI.isolation, CLI.reporter, ...files];
}

export function countOf(output: string, label: string): number {
  return [...output.matchAll(new RegExp(`^\\S+ ${label} (\\d+)$`, 'gm'))].reduce((sum: number, match: RegExpExecArray): number => sum + Number(match[1] ?? '0'), 0);
}

function runShard(root: string, files: readonly string[]): Promise<ShardResult> {
  return new Promise<ShardResult>((resolve: (result: ShardResult) => void): void => {
    const child = spawn(process.execPath, testCommand(files), { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: string[] = [];
    child.stdout.on('data', (chunk: Buffer): void => {
      chunks.push(chunk.toString('utf8'));
    });
    child.stderr.on('data', (chunk: Buffer): void => {
      chunks.push(chunk.toString('utf8'));
    });
    child.on('close', (code: number | null): void => {
      const output: string = chunks.join('');
      process.stdout.write(output);
      resolve({ code: code ?? 1, output });
    });
  });
}

async function main(): Promise<number> {
  const root: string = process.cwd();
  const options: CliOptions = parseArgs(process.argv.slice(2));
  const { graph, testFiles } = readRepository(root, AFFECTED);
  const changed: string[] | null = options.files === null ? changedFiles(root, options.base, options.head) : [...options.files];
  const everything: Selection | null = options.all ? { kind: 'everything', reason: 'asked for every test' } : changed === null ? { kind: 'everything', reason: `git could not diff ${options.base}...${options.head}` } : null;
  const selection: Selection = everything ?? selectTests(changed ?? [], graph, testFiles, AFFECTED);
  const files: readonly string[] = filesToRun(selection, testFiles);
  const why: string = selection.kind === 'everything' ? `every test file (${selection.reason})` : `${files.length} of ${testFiles.length} test files`;
  if (!options.run) {
    console.log(files.join('\n'));
    console.error(`affected: ${why}`);
    return 0;
  }
  const shards: string[][] = shard(files, options.jobs);
  console.log(`affected: running ${why} in ${shards.length} process${shards.length === 1 ? '' : 'es'}`);
  const results: ShardResult[] = await Promise.all(shards.map((group: readonly string[]): Promise<ShardResult> => runShard(root, group)));
  const output: string = results.map((result: ShardResult): string => result.output).join('\n');
  const failed: number = results.filter((result: ShardResult): boolean => result.code !== 0).length;
  console.log(`affected: ${countOf(output, 'tests')} tests, ${countOf(output, 'pass')} passed, ${countOf(output, 'fail')} failed${failed > 0 ? `, ${failed} process${failed === 1 ? '' : 'es'} exited non-zero` : ''}`);
  return failed > 0 ? 1 : 0;
}

if (relative(process.cwd(), process.argv[1] ?? '') === relative(process.cwd(), fileURLToPath(import.meta.url))) process.exitCode = await main();
