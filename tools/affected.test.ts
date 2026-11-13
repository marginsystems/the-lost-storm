import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AFFECTED, buildImportGraph, targetsOf, countOf, defaultJobs, dependents, filesToRun, globToRegExp, matchesAny, parseArgs, readRepository, resolveSpecifier, selectTests, shard, specifiersOf, testCommand } from './affected.ts';
import type { AffectedConfig, AffectedRule, ImportGraph, Selection, SourceText } from './affected.ts';
import { readConfig, readRule } from './affected.ts';

function glob(...parts: readonly string[]): string {
  return parts.join('/');
}

const SOURCES: readonly SourceText[] = [
  { path: 'sim/rng.ts', text: "export const seed = 1;\n" },
  { path: 'sim/rng.test.ts', text: "import { seed } from './rng.ts';\n" },
  { path: 'sim/stats.ts', text: "import { seed } from './rng.ts';\nimport monsters from '../data/monsters.json' with { type: 'json' };\n" },
  { path: 'sim/world/step.test.ts', text: "import {\n  stats,\n} from '../stats.ts';\n" },
  { path: 'sim/content/content.test.ts', text: "import { readFileSync } from 'node:fs';\n" },
  { path: 'src/render/draw.ts', text: "import * as THREE from 'three';\nimport { stats } from '../../sim/stats';\n" },
  { path: 'src/render/draw.test.ts', text: "import { draw } from './draw.ts';\n" },
  { path: 'src/hud/bar.ts', text: "import css from './bar.css?inline';\n" },
  { path: 'src/hud/bar.test.ts', text: "import { bar } from './bar.ts';\n" },
  { path: 'src/hud/menu.test.ts', text: "import { menu } from './menu.ts';\n" },
  { path: 'src/hud/menu.ts', text: "export const menu = 1;\n" },
  { path: 'src/backend/remote.ts', text: "export { merge } from './merge.ts';\n" },
  { path: 'src/backend/merge.ts', text: "export const merge = 1;\n" },
  { path: 'src/backend/account.test.ts', text: "import { other } from './account.ts';\n" },
  { path: 'src/backend/remote.test.ts', text: "const loaded = await import('./remote.ts');\n" },
  { path: 'src/title-screen.test.ts', text: "const css = readFileSync(new URL('./title-screen.css', import.meta.url), 'utf8');\n" },
  { path: 'src/gone.test.ts', text: "import { gone } from './gone.ts';\n" },
  { path: 'test/rules.test.ts', text: "import { test } from 'node:test';\n" },
  { path: 'test/support.ts', text: "export const support = 1;\n" },
];

const EXTRA: readonly string[] = ['data/monsters.json', 'src/hud/bar.css', 'src/title-screen.css'];
const GRAPH: ImportGraph = buildImportGraph(SOURCES, EXTRA);
const TESTS: readonly string[] = SOURCES.map((source: SourceText): string => source.path).filter((path: string): boolean => path.endsWith('.test.ts')).toSorted();

const RULES: readonly AffectedRule[] = [
  { kind: 'everything', paths: ['package.json', 'test/support.ts'] },
  { kind: 'importers', paths: [glob('sim', '**'), glob('test', '**', '*.test.ts')], alsoRun: [] },
  { kind: 'importers', paths: [glob('data', '**')], alsoRun: ['sim/content/content.test.ts'] },
  { kind: 'importers', paths: [glob('src', '**')], alsoRun: [] },
  { kind: 'importers', paths: [glob('src', 'hud', '**')], alsoRun: [glob('src', 'hud', '**', '*.test.ts')] },
  { kind: 'importers', paths: [glob('src', 'backend', '**')], alsoRun: [glob('src', 'backend', '**', '*.test.ts')] },
  { kind: 'only', paths: [glob('**', '*.md'), glob('public', '**')], run: [] },
];

const CONFIG: AffectedConfig = { testRoots: ['sim', 'src', 'test'], graphRoots: ['sim', 'src', 'test', 'data'], alwaysRun: ['test/rules.test.ts'], rules: RULES };

function testsOf(selection: Selection, what: string): readonly string[] {
  switch (selection.kind) {
    case 'everything':
      assert.fail(`${what} should not run everything: ${selection.reason}`);
      break;
    case 'some':
      return selection.tests;
  }
  return [];
}

function some(changed: readonly string[]): readonly string[] {
  return testsOf(selectTests(changed, GRAPH, TESTS, CONFIG), changed.join(', '));
}

void test('globs match paths segment by segment', (): void => {
  assert.ok(globToRegExp(glob('sim', '**')).test('sim/world/step.ts'));
  assert.ok(globToRegExp(glob('**', '*.md')).test('README.md'));
  assert.ok(globToRegExp(glob('**', '*.md')).test('docs/story/lines.md'));
  assert.ok(globToRegExp(glob('test', '*-support.ts')).test('test/arena-support.ts'));
  assert.ok(!globToRegExp(glob('test', '*-support.ts')).test('test/deep/arena-support.ts'));
  assert.ok(globToRegExp(glob('src', 'hud', '**', '*.test.ts')).test('src/hud/bar.test.ts'));
  assert.ok(!globToRegExp('package.json').test('packageXjson'));
  assert.ok(matchesAny('.github/workflows/ci.yml', [glob('.github', '**')]));
});

void test('only relative specifiers of every import form are read', (): void => {
  const text: string = "import a from './a.ts';\nimport {\n  b,\n} from '../b';\nimport './c.css';\nexport { d } from './d.ts';\nconst e = await import('./e.ts');\nnew URL('./f.css', import.meta.url);\nimport * as THREE from 'three';\nimport { test } from 'node:test';\n";
  assert.deepEqual(specifiersOf(text).toSorted(), ['../b', './a.ts', './c.css', './d.ts', './e.ts', './f.css']);
});

void test('a specifier resolves to the file it names, with or without its extension or query', (): void => {
  const files: ReadonlySet<string> = new Set<string>(['sim/stats.ts', 'src/hud/bar.css', 'sim/nav/index.ts']);
  assert.equal(resolveSpecifier('src/render/draw.ts', '../../sim/stats', files), 'sim/stats.ts');
  assert.equal(resolveSpecifier('src/hud/bar.ts', './bar.css?inline', files), 'src/hud/bar.css');
  assert.equal(resolveSpecifier('sim/world/step.ts', '../nav', files), 'sim/nav/index.ts');
  assert.equal(resolveSpecifier('src/gone.test.ts', './gone.ts', files), 'src/gone.ts');
});

void test('a test reaches the file it is named after and any repository file it names by path', (): void => {
  const files: ReadonlySet<string> = new Set<string>(['src/input.ts', 'src/input.test.ts', 'data/zones/shallows.json', '.github/workflows/ci.yml']);
  const reader: SourceText = { path: 'src/input.test.ts', text: "readFileSync('src/input.ts');\nreadFileSync('data/zones/shallows.json');\nreadFileSync('.github/workflows/ci.yml');\nconst other = 'src/missing.ts';\n" };
  assert.deepEqual(targetsOf(reader, files).toSorted(), ['.github/workflows/ci.yml', 'data/zones/shallows.json', 'src/input.ts', 'src/input.ts']);
});

void test('dependents follow imports transitively and stop on cycles', (): void => {
  const cyclic: ImportGraph = buildImportGraph([
    { path: 'a.ts', text: "import './b.ts';\n" },
    { path: 'b.ts', text: "import './a.ts';\n" },
  ]);
  assert.deepEqual([...dependents(cyclic, 'a.ts')].toSorted(), ['a.ts', 'b.ts']);
  assert.ok(dependents(GRAPH, 'sim/rng.ts').has('src/render/draw.test.ts'));
});

void test('a sim change runs every test that imports it, through any layer', (): void => {
  assert.deepEqual(some(['sim/rng.ts']), ['sim/rng.test.ts', 'sim/world/step.test.ts', 'src/render/draw.test.ts', 'test/rules.test.ts']);
});

void test('a data change runs the content check and every test that loads the file', (): void => {
  assert.deepEqual(some(['data/monsters.json']), ['sim/content/content.test.ts', 'sim/world/step.test.ts', 'src/render/draw.test.ts', 'test/rules.test.ts']);
});

void test('a HUD change runs the HUD tests and nothing else that does not import it', (): void => {
  assert.deepEqual(some(['src/hud/bar.css']), ['src/hud/bar.test.ts', 'src/hud/menu.test.ts', 'test/rules.test.ts']);
});

void test('a backend change runs the backend tests', (): void => {
  assert.deepEqual(some(['src/backend/merge.ts']), ['src/backend/account.test.ts', 'src/backend/remote.test.ts', 'test/rules.test.ts']);
});

void test('a stylesheet read through new URL runs the test that reads it', (): void => {
  assert.deepEqual(some(['src/title-screen.css']), ['src/title-screen.test.ts', 'test/rules.test.ts']);
});

void test('a deleted file still runs the tests that imported it', (): void => {
  assert.deepEqual(some(['src/gone.ts']), ['src/gone.test.ts', 'test/rules.test.ts']);
});

void test('a changed test runs itself', (): void => {
  assert.deepEqual(some(['sim/world/step.test.ts']), ['sim/world/step.test.ts', 'test/rules.test.ts']);
});

void test('docs and public assets run only the rules test', (): void => {
  assert.deepEqual(some(['README.md', 'docs/story/lines.md', 'public/models/hero.glb']), ['test/rules.test.ts']);
});

void test('config, shared support, an unmapped path or no diff at all run everything', (): void => {
  for (const changed of [['package.json'], ['src/hud/bar.css', 'test/support.ts'], ['scripts/new.sh'], []]) assert.equal(selectTests(changed, GRAPH, TESTS, CONFIG).kind, 'everything', changed.join(', '));
});

void test('arguments name the base, the head, a run, every test, the jobs and explicit files', (): void => {
  assert.deepEqual(parseArgs([], 8), { run: false, all: false, jobs: 4, base: 'origin/main', head: 'HEAD', files: null });
  assert.deepEqual(parseArgs(['--run', '--all', '--base', 'abc', '--head', 'def', '--jobs', '2'], 8), { run: true, all: true, jobs: 2, base: 'abc', head: 'def', files: null });
  assert.deepEqual(parseArgs(['--', 'sim/rng.ts', '--run'], 8), { run: false, all: false, jobs: 4, base: 'origin/main', head: 'HEAD', files: ['sim/rng.ts', '--run'] });
  assert.throws((): unknown => parseArgs(['--fast'], 8));
  assert.throws((): unknown => parseArgs(['--jobs', '0'], 8));
  assert.throws((): unknown => parseArgs(['--base'], 8));
});

void test('jobs leave a core free and stop at four', (): void => {
  assert.equal(defaultJobs(1), 1);
  assert.equal(defaultJobs(3), 2);
  assert.equal(defaultJobs(16), 4);
});

void test('files split round robin into at most the asked number of shards', (): void => {
  assert.deepEqual(shard(['a', 'b', 'c', 'd', 'e'], 2), [['a', 'c', 'e'], ['b', 'd']]);
  assert.deepEqual(shard(['a'], 4), [['a']]);
  assert.deepEqual(shard([], 4), []);
});

void test('everything runs every test file, a selection only its own', (): void => {
  assert.deepEqual(filesToRun({ kind: 'everything', reason: 'x' }, ['a.test.ts', 'b.test.ts']), ['a.test.ts', 'b.test.ts']);
  assert.deepEqual(filesToRun({ kind: 'some', tests: ['b.test.ts'] }, ['a.test.ts', 'b.test.ts']), ['b.test.ts']);
});

void test('each shard runs its files in one process with the spec reporter', (): void => {
  assert.deepEqual(testCommand(['a.test.ts']), ['--test', '--experimental-test-isolation=none', '--test-reporter=spec', 'a.test.ts']);
});

void test('the totals add up across every shard', (): void => {
  const output: string = 'ℹ tests 3\nℹ pass 3\nℹ fail 0\nℹ tests 2\nℹ pass 1\nℹ fail 1\n';
  assert.equal(countOf(output, 'tests'), 5);
  assert.equal(countOf(output, 'fail'), 1);
});

void test('the rules file reads into typed rules and refuses an unknown kind', (): void => {
  assert.deepEqual(readRule({ kind: 'only', paths: ['a'], run: ['b'] }, 'r'), { kind: 'only', paths: ['a'], run: ['b'] });
  assert.throws((): unknown => readRule({ kind: 'some', paths: [] }, 'r'), /not everything, importers or only/);
  assert.throws((): unknown => readConfig({ testRoots: [] }));
  assert.ok(AFFECTED.rules.length > 0);
});

const REPO = readRepository('.', AFFECTED);

void test('a changed model or clip under public runs the content check that reads it', (): void => {
  const tests: readonly string[] = testsOf(selectTests(['public/models/characters/hero.glb'], REPO.graph, REPO.testFiles, AFFECTED), 'public model');
  assert.deepEqual(tests, ['sim/content/content.test.ts', 'test/rules.test.ts']);
});

void test('every test that reads files from disk is named by a rule, so a change to what it reads runs it', (): void => {
  const named: readonly string[] = [...AFFECTED.alwaysRun, ...AFFECTED.rules.flatMap((rule: AffectedRule): readonly string[] => (rule.kind === 'importers' ? rule.alsoRun : rule.kind === 'only' ? rule.run : []))];
  const readers: readonly string[] = REPO.testFiles.filter((path: string): boolean => /from 'node:fs'/.test(readFileSync(path, 'utf8')) && path !== 'tools/affected.test.ts');
  for (const reader of readers) assert.ok(matchesAny(reader, named), `${reader} reads files, so it needs a rule in tools/affected-rules.ts naming it`);
});

void test('every file in the repository folders matches a rule', (): void => {
  for (const path of REPO.graph.files) assert.ok(AFFECTED.rules.some((rule: AffectedRule): boolean => matchesAny(path, rule.paths)), `${path} matches no rule`);
});

void test('in this repository a sim module reaches its own test and the world tests that use it', (): void => {
  const tests: readonly string[] = testsOf(selectTests(['sim/rng.ts'], REPO.graph, REPO.testFiles, AFFECTED), 'sim/rng.ts');
  assert.ok(tests.includes('sim/rng.test.ts'));
  assert.ok(tests.includes('sim/world/step.test.ts'));
  assert.ok(tests.length < REPO.testFiles.length);
});
