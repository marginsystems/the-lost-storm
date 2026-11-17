import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { MarkerKind, MarkerLibrary } from '../sim/content/marker-types.ts';
import { markerLibrary } from '../sim/content/parse-markers.ts';

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

const BARE_TYPE: RegExp = /^[a-z][a-z0-9-]*$/;

function hasOnBareType(css: string): readonly string[] {
  const preludes: readonly string[] = [...css.matchAll(/([^{};]+)\{/g)].map((found: RegExpMatchArray): string => (found[1] ?? '').trim());
  return preludes.flatMap((prelude: string): string[] => {
    if (!prelude.includes(':has(')) return [];
    let flat: string = prelude;
    while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, '');
    return flat.split(',').flatMap((selector: string): string[] => {
      const subject: string = (selector.trim().split(/[\s>+~]+/).at(-1) ?? '').replace(/::?[a-z-]+/g, '');
      return BARE_TYPE.test(subject) ? [prelude] : [];
    });
  });
}

void test('the :has() guard catches a selector that ends on a bare element type and passes one that ends on a class', (): void => {
  const caught: readonly string[] = ['body:has(.banner.zone) .exit-label span {', '.hud:has(.open) > div {', 'body:has(.a) i::before {', '.a, body.touch:has(.b:not(.c)) .d span {'];
  const allowed: readonly string[] = ['body.zone-banner .exit-label span {', '.hud.fit-sheets:has(.hud-panel.open) > .hud-quests {', 'body:has(.hud.chart-open) #overlays {', '.a:has(.b) .c span.d {', '@media (max-width: 600px) {'];
  for (const text of caught) assert.ok(hasOnBareType(text).length > 0, text);
  for (const text of allowed) assert.deepEqual(hasOnBareType(text), [], text);
});

void test('a :has() selector never ends on a bare element type, which restyles every such element on any change in the page', (): void => {
  const found: string[] = sources.filter((source: SourceFile): boolean => source.path.endsWith('.css')).flatMap((source: SourceFile): string[] => hasOnBareType(source.lines.join('\n')).map((prelude: string): string => `${source.path}: ${prelude}`));
  assert.deepEqual(found, [], 'set a class from code for the state the :has() reads, or end the selector on a class');
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

const PLACE_GLOW: RegExp = /\b(createGroundLight|createLightPool)\(/;
const PLACE_READ: RegExp = /\.(waypoint|exits|checkpoints)\b/;

void test('waypoints, ways between levels and checkpoints are solid models, never drawn by ground light alone', (): void => {
  const library: MarkerLibrary = markerLibrary(JSON.parse(readFileSync('data/markers.json', 'utf8')), 'markers');
  const missing: string[] = [...library.kinds.values()].filter((kind: MarkerKind): boolean => !kind.model.endsWith('.glb') || !existsSync(join('public', kind.model))).map((kind: MarkerKind): string => kind.id);
  assert.deepEqual(missing, [], 'every marker kind in data/markers.json names a model under public/models');
  const glowing: string[] = typescript.filter((source: SourceFile): boolean => source.path.startsWith('src') && !source.path.endsWith('.test.ts') && source.lines.some((line: string): boolean => PLACE_GLOW.test(line)) && source.lines.some((line: string): boolean => PLACE_READ.test(line))).map((source: SourceFile): string => source.path);
  assert.deepEqual(glowing, [], 'draw a place with createPlaceMarkers from a marker kind, not with ground light');
});

const WHOLE_OBJECT_BOUNDS: RegExp = /\.(setFromObject|expandByObject)\(/;
const WHOLE_OBJECT_BOUNDS_ALLOWED: Readonly<Record<string, string>> = {
  'src/lobby/lobby-scenery.ts': 'a static scenery model measured once to size it, no skin',
  'src/render/ground-models.ts': 'static world props measured to fit their footprint, no skin',
  'src/render/item-thumbnails.ts': 'a portrait rig made at the origin and measured vertex by vertex once, never cached',
};

void test('a character is measured from its live bones with actorBounds, never from cached whole-object boxes that go stale', (): void => {
  const found: string[] = [];
  for (const source of typescript) {
    if (!source.path.startsWith('src') || source.path.endsWith('.test.ts') || WHOLE_OBJECT_BOUNDS_ALLOWED[source.path] !== undefined) continue;
    source.lines.forEach((line: string, index: number): void => {
      if (WHOLE_OBJECT_BOUNDS.test(line)) found.push(`${source.path}:${index + 1}`);
    });
  }
  assert.deepEqual(found, [], 'measure an actor or figure with actorBounds in src/render/actor-bounds.ts');
});

const LAID_FLAT: RegExp = /(\.rotation\.x = |\.rotateX\()-Math\.PI \/ 2/;
const LAID_FLAT_ALLOWED: Readonly<Record<string, string>> = {
  'src/render/void-view.ts': 'the ground and mist sheets of the void, which has no terrain, not an effect',
  'src/render/void-light.ts': 'the light pools of the void, which has no terrain',
  'src/render/zone-view.ts': 'the abyss under a zone, not an effect',
  'src/render/moment-view.ts': 'the floor of a moment bubble, dressed in a surface, not an effect',
  'src/render/shore-rock.ts': 'rock geometry, not an effect',
  'src/render/contact-shadow.ts': 'the soft shadow under an actor, not an effect',
};

void test('every ground effect lies on the surface under it as a decal, never as a plane laid at a height', (): void => {
  const found: string[] = [];
  for (const source of typescript) {
    if (!source.path.startsWith('src') || source.path.endsWith('.test.ts') || LAID_FLAT_ALLOWED[source.path] !== undefined) continue;
    if (source.lines.some((line: string): boolean => line.includes('layOnGround('))) continue;
    source.lines.forEach((line: string, index: number): void => {
      if (LAID_FLAT.test(line)) found.push(`${source.path}:${index + 1}`);
    });
  }
  assert.deepEqual(found, [], 'draw a ground effect with createGroundLight, or with layOnGround and the decal shaders of src/render/ground-decal.ts');
});

void test('only the decal pass decides the floor a ground effect stands on', (): void => {
  const found: string[] = [];
  for (const source of typescript) {
    if (!source.path.startsWith('src') || source.path.endsWith('.test.ts') || source.path === 'src/render/ground-decal.ts') continue;
    source.lines.forEach((line: string, index: number): void => {
      if (line.includes('uDecalLevel')) found.push(`${source.path}:${index + 1}`);
    });
  }
  assert.deepEqual(found, [], 'a ground effect takes its floor from the terrain under it, set by setLevel in src/render/ground-decal.ts');
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

const CREDIT_PAGE: string = 'play/index.html';
const CC_BY_SOURCE: RegExp = /^\| ([^|(`]+?)(?: \([^|]*\))? \| [^|]+ \| [^|]+ \| CC BY 4\.0 \|/;

void test('every CC BY source in ASSETS.md is credited on the title screen', (): void => {
  const page: string = readFileSync(CREDIT_PAGE, 'utf8');
  const titles: readonly string[] = readFileSync('ASSETS.md', 'utf8')
    .split('\n')
    .flatMap((row: string): string[] => {
      const title: string | undefined = CC_BY_SOURCE.exec(row)?.[1];
      return title === undefined ? [] : [title];
    });
  assert.ok(titles.length > 0, 'ASSETS.md names no CC BY source');
  for (const title of titles) assert.ok(page.includes(title), `${CREDIT_PAGE} does not credit the CC BY source "${title}"`);
  assert.ok(page.includes('creativecommons.org/licenses/by/4.0'), `${CREDIT_PAGE} does not name where the CC BY 4.0 licence is`);
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

const FLOOR_PLACED: readonly string[] = [
  'src/render/effects.ts',
  'src/render/storm-effects.ts',
  'src/render/effect-kit.ts',
  'src/render/ability-cues.ts',
  'src/render/spin-view.ts',
  'src/render/shockwave.ts',
  'src/render/telegraphs.ts',
  'src/render/ward-view.ts',
  'src/render/dash-trail.ts',
  'src/render/overlays.ts',
  'src/render/health-bars.ts',
  'src/render/projectile-views.ts',
  'src/render/torch-flames.ts',
];
const PLACING: RegExp = /(\.position\.set|camera\.project|new Vector3)\(/g;
const PASSED_HEIGHT: RegExp = /^[\w.]+\.y$/;

function callArguments(text: string, open: number): readonly string[] {
  const found: string[] = [];
  let depth: number = 0;
  let start: number = open;
  for (let index: number = open; index < text.length; index += 1) {
    const char: string = text.charAt(index);
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) {
        found.push(text.slice(start, index).trim());
        return found;
      }
    } else if (char === ',' && depth === 1) {
      found.push(text.slice(start, index).trim());
      start = index + 1;
    }
    if (depth === 1 && index === open) start = index + 1;
  }
  return found;
}

function floorSkipsIn(text: string): readonly string[] {
  const found: string[] = [];
  for (const match of text.matchAll(PLACING)) {
    const args: readonly string[] = callArguments(text, match.index + match[0].length - 1);
    const [x, y] = args;
    if (x === undefined || y === undefined || args.length < 3 || x === '0') continue;
    if (y.includes('floorUp(') || PASSED_HEIGHT.test(y)) continue;
    found.push(`${match[0]}${args.join(', ')})`);
  }
  return found;
}

void test('the floor guard catches an effect placed at a fixed height and passes one placed on the floor', (): void => {
  const caught: readonly string[] = ['mesh.position.set(x, 0, z);', 'light.mesh.position.set(at.x, GROUND_LIGHT.height + 0.02, at.z);', 'camera.project(monster.pos.x, heightOf(monster.id) + LIFT, monster.pos.z, point);', 'const to = new Vector3(next.x, STORM.bodyHeight, next.z);'];
  const allowed: readonly string[] = ['mesh.position.set(x, floorUp(x, 0, z), z);', 'camera.project(label.x, label.y, label.z, point);', 'keeper.position.set(0, DEPTH, 0);', 'const at = new Vector3();', 'chargeGlow.position.set(at.x, floorUp(at.x, at.y, at.z), at.z);'];
  for (const text of caught) assert.equal(floorSkipsIn(text).length, 1, text);
  for (const text of allowed) assert.deepEqual(floorSkipsIn(text), [], text);
});

void test('effects, numbers and bars stand on the floor under them, through floorUp', (): void => {
  const found: string[] = [];
  for (const path of FLOOR_PLACED) for (const skip of floorSkipsIn(readFileSync(path, 'utf8'))) found.push(`${path}: ${skip}`);
  assert.deepEqual(found, [], 'place it with floorUp from src/render/terrain-lift.ts so it stands on the terrace it is on');
});
