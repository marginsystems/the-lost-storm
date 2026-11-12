import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

interface SourceFile {
  readonly path: string;
  readonly lines: readonly string[];
}

const ROOTS: readonly string[] = ['src', 'sim', 'test', 'tools'];
const CODE: RegExp = /\.(ts|css)$/;
const MAX_LINES: number = 700;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string): string[] => {
    const path: string = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return CODE.test(name) ? [path] : [];
  });
}

const sources: readonly SourceFile[] = ROOTS.flatMap(files).map((path: string): SourceFile => ({ path, lines: readFileSync(path, 'utf8').split('\n') }));
const typescript: readonly SourceFile[] = sources.filter((source: SourceFile): boolean => source.path.endsWith('.ts'));
const joined = (...parts: string[]): string => parts.join('');
const BLOCK_OPEN: string = joined('/', '*');
const SLASH_COMMENT: RegExp = new RegExp(joined('^\\s*/', '/'));
const TRAILING_COMMENT: RegExp = new RegExp(joined('[;{}),]\\s+/', '/\\s'));
const BANNED: readonly RegExp[] = [
  new RegExp(joined(':\\s*an', 'y\\b')),
  new RegExp(joined('as an', 'y\\b')),
  new RegExp(joined('<an', 'y>')),
  new RegExp(joined('@ts-', 'ignore')),
  new RegExp(joined('@ts-', 'expect-error')),
  new RegExp(joined('@ts-', 'nocheck')),
  new RegExp(joined('(eslint|oxlint)-', 'disable')),
];
const NON_NULL: RegExp = new RegExp(joined('[\\w\\])]', '!(?!=)'));
const RENDER_IMPORT: RegExp = new RegExp(joined("from '(three|\\.\\./src|", "\\.\\./\\.\\./src)"));
const DOM_GLOBAL: RegExp = new RegExp('\\b(window|document|localStorage)\\.');

void test('source files carry no comments', (): void => {
  for (const { path, lines } of sources) {
    lines.forEach((line: string, index: number): void => {
      assert.ok(!line.includes(BLOCK_OPEN), `${path}:${index + 1} has a block comment`);
      if (path.endsWith('.css')) return;
      assert.ok(!SLASH_COMMENT.test(line), `${path}:${index + 1} has a line comment`);
      assert.ok(!TRAILING_COMMENT.test(line), `${path}:${index + 1} has a trailing comment`);
    });
  }
});

void test('typescript avoids escape hatches', (): void => {
  for (const { path, lines } of typescript) {
    lines.forEach((line: string, index: number): void => {
      for (const pattern of BANNED) assert.ok(!pattern.test(line), `${path}:${index + 1} matches ${pattern.source}`);
      assert.ok(!NON_NULL.test(line), `${path}:${index + 1} uses a non-null assertion`);
    });
  }
});

void test('game logic in sim never touches Three.js, the render layer or the DOM', (): void => {
  for (const { path, lines } of typescript.filter((source: SourceFile): boolean => source.path.startsWith('sim'))) {
    lines.forEach((line: string, index: number): void => {
      assert.ok(!RENDER_IMPORT.test(line), `${path}:${index + 1} imports the render layer`);
      assert.ok(!DOM_GLOBAL.test(line), `${path}:${index + 1} uses a browser global`);
    });
  }
});

void test('no source file grows past the size limit', (): void => {
  for (const { path, lines } of sources) assert.ok(lines.length <= MAX_LINES, `${path} has ${lines.length} lines`);
});

void test('every test file sits beside the file it tests', (): void => {
  for (const { path } of typescript.filter((source: SourceFile): boolean => source.path.endsWith('.test.ts') && !source.path.startsWith('test'))) {
    assert.ok(statSync(path.replace('.test.ts', '.ts')).isFile(), `${path} has no source file`);
  }
});

const STARTS_SOMETHING: RegExp = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bgetBuiltinModule\s*\(\s*)['"`](?:node:)?(?:http|https|http2|net|tls|dgram|child_process|cluster|worker_threads|inspector|playwright[^'"`]*|puppeteer[^'"`]*|selenium-webdriver)['"`]|\.listen\s*\(|\bnew\s+Worker\s*\(/;

void test('the process guard catches every way a test could start a server, a browser or a process', (): void => {
  const caught: readonly string[] = [
    "import { createServer } from 'node:http';",
    'import { spawn } from "child_process";',
    "const net = await import('node:net');",
    "const http = await import(\n  'node:http'\n);",
    'const { fork } = require("node:child_process");',
    "const child = process.getBuiltinModule('node:child_process');",
    "import { chromium } from 'playwright-core';",
    'server.listen (0);',
    "new Worker(new URL('./w.ts', import.meta.url));",
  ];
  const allowed: readonly string[] = ["import { test } from 'node:test';", "import { readFileSync } from 'node:fs';", 'const listener = 1;'];
  for (const text of caught) assert.ok(STARTS_SOMETHING.test(text), text);
  for (const text of allowed) assert.ok(!STARTS_SOMETHING.test(text), text);
});

void test('no test starts a server, a browser or another process', (): void => {
  for (const { path, lines } of typescript.filter((source: SourceFile): boolean => source.path.endsWith('.test.ts') && source.path !== 'test/rules.test.ts')) {
    assert.ok(!STARTS_SOMETHING.test(lines.join('\n')), `${path} starts a server, a browser or a process`);
  }
});

void test('every shipped model and texture is listed in ASSETS.md', (): void => {
  const assets: string = readFileSync('ASSETS.md', 'utf8');
  const models = (dir: string): string[] =>
    readdirSync(dir).flatMap((name: string): string[] => {
      const path: string = join(dir, name);
      if (statSync(path).isDirectory()) return models(path);
      return [path];
    });
  for (const path of [...models('public/models'), ...models('public/textures')]) assert.ok(assets.includes(path), `${path} is missing from ASSETS.md`);
});

interface SpokenLine {
  readonly id: string;
  readonly text: string;
}

function isSpokenLine(value: unknown): value is SpokenLine {
  return typeof value === 'object' && value !== null && 'id' in value && 'text' in value && typeof value.id === 'string' && typeof value.text === 'string';
}

void test('every spoken line is written down in the story notes with the same words', (): void => {
  const story: string = readFileSync('docs/story/lines.md', 'utf8');
  const parsed: unknown = JSON.parse(readFileSync('data/lines.json', 'utf8'));
  assert.ok(Array.isArray(parsed));
  const lines: readonly unknown[] = parsed;
  for (const line of lines) {
    assert.ok(isSpokenLine(line));
    assert.ok(story.includes(`| \`${line.id}\` | ${line.text} |`), `${line.id} is missing from docs/story/lines.md or its words differ`);
  }
});

const SHOWN_ROOTS: readonly string[] = ['src', 'data', 'play', 'public'];
const SHOWN: RegExp = /\.(ts|css|html|json)$/;
const RETIRED_RARITY_WORD: RegExp = new RegExp(joined('Storm', 'touched'));

function shownFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string): string[] => {
    const path: string = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'local' || name === 'models' || name === 'textures' ? [] : shownFiles(path);
    return SHOWN.test(name) ? [path] : [];
  });
}

void test('no player-facing text calls the top rarity anything but Legendary', (): void => {
  const paths: readonly string[] = ['index.html', 'README.md', ...SHOWN_ROOTS.flatMap(shownFiles)];
  for (const path of paths) {
    readFileSync(path, 'utf8').split('\n').forEach((line: string, index: number): void => {
      assert.ok(!RETIRED_RARITY_WORD.test(line), `${path}:${index + 1} shows the retired rarity name`);
    });
  }
  const items: unknown = JSON.parse(readFileSync('data/items.json', 'utf8'));
  assert.ok(typeof items === 'object' && items !== null && 'rarities' in items && Array.isArray(items.rarities));
  const names: readonly unknown[] = items.rarities.map((rarity: unknown): unknown => (typeof rarity === 'object' && rarity !== null && 'name' in rarity ? rarity.name : null));
  assert.equal(names.at(-1), 'Legendary');
});
