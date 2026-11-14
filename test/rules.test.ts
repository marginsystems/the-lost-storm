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

const FLAT_SHAPE: RegExp = new RegExp(joined('new (Ring|Circle|Torus)Geo', 'metry\\b|new LineLo', 'op\\b|sectorGeometry\\(Math\\.PI \\* 2'));
const FLAT_SHAPE_ALLOWED: Readonly<Record<string, string>> = {
  'src/render/contact-shadow.ts': 'the soft shadow under an actor, a texture that fades to nothing before the disc ends',
  'src/lobby/lobby-stage.ts': 'the lobby floor the character stands on, not an effect',
  'src/render/moment-view.ts': 'the floor of a moment bubble, dressed in a surface, not an effect',
};

void test('ground effects are light from the ground-light shader, never flat rings, discs or outlines', (): void => {
  const found: string[] = [];
  for (const source of typescript) {
    if (!source.path.startsWith('src') || source.path.endsWith('.test.ts') || FLAT_SHAPE_ALLOWED[source.path] !== undefined) continue;
    source.lines.forEach((line: string, index: number): void => {
      if (FLAT_SHAPE.test(line)) found.push(`${source.path}:${index + 1}`);
    });
  }
  assert.deepEqual(found, [], 'draw ground effects with createGroundLight in src/render/ground-light.ts');
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

const ASSET_URL_HOME: string = 'src/render/asset-url.ts';
const PUBLIC_BASE: RegExp = /import\.meta\.env\.BASE_URL/;
const RAW_ASSET_PATH: RegExp = /(?<!\bassetUrl)\(\s*['"`](?:\.?\/)?(?:models|textures)\//;
const RAW_ASSET_SOURCE: RegExp = /(?:\.src\s*=|\burl\()\s*['"`]?(?:\.?\/)?(?:models|textures)\//;
const LOADER_CALL: RegExp = /\.(?:loadAsync|loadFromURL|setPath)\(\s*(?!assetUrl\()/;

function bypassesAssetUrl(text: string): boolean {
  return PUBLIC_BASE.test(text) || RAW_ASSET_PATH.test(text) || RAW_ASSET_SOURCE.test(text) || LOADER_CALL.test(text);
}

void test('the asset guard catches every way a public model or texture could skip its version', (): void => {
  const caught: readonly string[] = [
    "loader.loadAsync('models/world/coins.glb');",
    'loader.loadAsync(`${base}models/x.glb`, progress);',
    'loader.loadAsync(path);',
    "textureLoader.load('textures/cobble_color.webp', done);",
    "fetch('/models/world/coins.glb');",
    "image.src = 'textures/a.webp';",
    'image.src = `/models/${name}.glb`;',
    "background: url('textures/a.webp');",
    'const url = `${import.meta.env.BASE_URL}${path}`;',
    "loader.setPath('models/');",
  ];
  const allowed: readonly string[] = [
    'loader.loadAsync(assetUrl(path), progress);',
    "bitmaps.load(assetUrl('textures/a.webp'), done, done);",
    "const LOOT = { coinModel: 'models/world/coins.glb' };",
    'await loadModel(loader, def.model);',
    'fetch(url, init);',
  ];
  for (const text of caught) assert.ok(bypassesAssetUrl(text), text);
  for (const text of allowed) assert.ok(!bypassesAssetUrl(text), text);
});

void test('shipped code asks for public models and textures only through assetUrl', (): void => {
  const found: string[] = [];
  for (const source of sources) {
    if (!source.path.startsWith('src') || source.path.endsWith('.test.ts') || source.path === ASSET_URL_HOME) continue;
    source.lines.forEach((line: string, index: number): void => {
      if (bypassesAssetUrl(line)) found.push(`${source.path}:${index + 1}`);
    });
  }
  assert.deepEqual(found, [], `build every URL into public/models or public/textures with assetUrl in ${ASSET_URL_HOME}`);
});

const BANNED_BODY: RegExp =new RegExp(joined('make', '[\\s_.-]*human'), 'i');
const BANNED_BODY_ROOTS: readonly string[] = ['src', 'sim', 'tools', 'data', 'blender', 'play'];
const BANNED_BODY_REMAINS: readonly string[] = ['public/models/world/still_figure.glb', 'public/models/world/still_figure_bowed.glb'];
const BANNED_BODY_BINARY: RegExp = /\.(glb|gltf|bin|png|jpe?g|webp|avif|ktx2|hdr|exr|ico|woff2?|ttf|otf|mp3|ogg|wav|pyc|blend)$/i;
const MODEL_ROW: RegExp = /^\| `public\//;

function everyFile(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string): string[] => {
    const path: string = join(dir, name);
    return statSync(path).isDirectory() ? everyFile(path) : [path];
  });
}

void test('no code, data or build script names the banned body generator, and only the two old still figures were built from it', (): void => {
  for (const path of BANNED_BODY_ROOTS.flatMap(everyFile)) {
    if (BANNED_BODY_BINARY.test(path)) continue;
    assert.ok(!BANNED_BODY.test(readFileSync(path, 'utf8')), `${path} names it`);
  }
  for (const row of readFileSync('ASSETS.md', 'utf8').split('\n')) {
    if (!MODEL_ROW.test(row) || !BANNED_BODY.test(row)) continue;
    assert.ok(BANNED_BODY_REMAINS.some((path: string): boolean => row.startsWith(`| \`${path}\``)), `ASSETS.md lists a model built from it: ${row.slice(0, 80)}`);
  }
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

const NATIVE_TAGS: string = 'select|option|optgroup|datalist|dialog';
const NATIVE_INPUTS: string = 'date|datetime-local|month|week|time|color|file|number';
const NATIVE_UI: readonly { readonly what: string; readonly pattern: RegExp }[] = [
  { what: 'a native menu or dialog element', pattern: new RegExp(`<(${NATIVE_TAGS})\\b`) },
  { what: 'a native menu or dialog element', pattern: new RegExp(`(createElement|\\bel)\\(\\s*['"\`](${NATIVE_TAGS})['"\`]`) },
  { what: 'a native dialog or picker call', pattern: /\.(showModal|showPicker|requestPicker)\s*\(|\bshow(Open|Save|Directory)(File)?Picker\s*\(/ },
  { what: 'a browser alert, confirm or prompt', pattern: /(^|[^.\w$])(window\.)?(alert|confirm|prompt)\s*\(/ },
  { what: 'a native date, colour, file or number field', pattern: new RegExp(`<input\\b[^>]*\\btype\\s*=\\s*["']?(${NATIVE_INPUTS})\\b`) },
  { what: 'a native date, colour, file or number field', pattern: new RegExp(`\\.type\\s*=\\s*['"\`](${NATIVE_INPUTS})['"\`]|setAttribute\\(\\s*['"]type['"]\\s*,\\s*['"](${NATIVE_INPUTS})['"]`) },
  { what: 'a title tooltip', pattern: /\stitle=["'{`]|(?<!document)\.title\s*=(?!=)|setAttribute\(\s*['"]title['"]/ },
  { what: 'an SVG title tooltip', pattern: /<title>|\bsvg\(\s*['"]title['"]/ },
];
const NATIVE_UI_ALLOWED: Readonly<Record<string, string>> = {};

function nativeUiShipped(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string): string[] => {
    const path: string = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'local' || name === 'models' || name === 'textures' ? [] : nativeUiShipped(path);
    return (name.endsWith('.ts') && !name.endsWith('.test.ts')) || name.endsWith('.html') ? [path] : [];
  });
}

function nativeUiIn(path: string, text: string): string[] {
  const html: boolean = path.endsWith('.html');
  const lines: readonly string[] = html ? text.replace(/<title>[^<]*<\/title>/g, '').split('\n') : text.split('\n');
  return lines.flatMap((line: string, index: number): string[] =>
    NATIVE_UI.filter((rule: { readonly what: string; readonly pattern: RegExp }): boolean => rule.pattern.test(line)).map((rule: { readonly what: string }): string => `${path}:${index + 1} has ${rule.what}`),
  );
}

void test('the native-control guard catches every way to show the browser own UI', (): void => {
  const caught: readonly string[] = [
    '<select class="x"></select>',
    "const box = el('select', 'x', parent);",
    "document.createElement('datalist');",
    '<dialog open>',
    'dialog.showModal();',
    'input.showPicker();',
    'window.alert(message);',
    'if (confirm(text)) go();',
    'const name = prompt("name");',
    '<input type="number" min="0">',
    '<input class="a" type=date>',
    "field.type = 'color';",
    "field.setAttribute('type', 'file');",
    '<a class="icon" title="Discord">',
    'button.title = name;',
    "node.setAttribute('title', name);",
    '<svg><title>Shape</title></svg>',
    "svg('title', '', shape, {});",
  ];
  const allowed: readonly string[] = [
    'const flow = { confirm: id };',
    'flow.confirm(id);',
    'void flow.prompt();',
    'promptText(touch, hint);',
    "input.type = 'range';",
    '<input type="email" name="email">',
    'document.title = name;',
    'const title: HTMLElement = el("div", "panel-title", parent);',
    'if (a.title === b.title) return;',
    'readonly title: string;',
    'aria-label="Discord"',
  ];
  for (const text of caught) assert.ok(nativeUiIn('x.ts', text).length > 0, text);
  for (const text of allowed) assert.deepEqual(nativeUiIn('x.ts', text), [], text);
  assert.deepEqual(nativeUiIn('x.html', '<title>Page</title>'), []);
});

void test('the game shows no native control or pop-up from the browser or the system', (): void => {
  const found: string[] = [];
  for (const path of [...nativeUiShipped('src'), ...nativeUiShipped('play'), ...nativeUiShipped('public'), 'index.html']) {
    if (NATIVE_UI_ALLOWED[path] !== undefined) continue;
    found.push(...nativeUiIn(path, readFileSync(path, 'utf8')));
  }
  assert.deepEqual(found, [], 'draw it with the HUD components (src/hud/dropdown.ts for a choice list, the HUD tooltip for a hint)');
});
