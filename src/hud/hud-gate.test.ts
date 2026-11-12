import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GAME_LAYERS } from '../title-screen.ts';
import { createHudGate, followWorld, HUD_GATE, hudGateCss, panelPart, shownData } from './hud-gate.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { generateItem } from '../../sim/items.ts';
import { createWorld } from '../../sim/world/create.ts';
import { stepWorld } from '../../sim/world/step.ts';
import type { GroundItem, ItemInstance, World } from '../../sim/world/types.ts';
import { HUD_FRAME, HUD_PARTS } from '../../sim/world/hud.ts';
import type { HudGate, HudGateTarget } from './hud-gate.ts';

interface Mount {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

const FAINT_LIMIT: number = 0.5;

const ALLOWED_IN_A_HIDDEN_HUD: readonly string[] = ['ctx-notice', 'fb', 'glitch-white', 'hud-bottom', 'hud-fps', 'hud-hint', 'name-echo', 'pause', 'reader-veil', 'tc-stick'];

const MOUNT_SITES: Readonly<Record<string, string>> = {
  'src/mobile/touch-ui.ts:canvas.after(layer)': '.tc',
  'src/mobile/touch-ui.ts:document.body)': '.tc-rotate',
  'src/mobile/mobile.ts:canvas.parentElement': '.ctx-notice',
};

const ESCAPING_MOUNT: RegExp = /document\.body\)|document\.(body|documentElement)\.(append|appendChild|prepend|insertBefore)\(|\b(canvas|hud|hudRoot|app|overlays|vignette|fade)\.(after|before|replaceWith)\(|element\('app'|canvas\.parentElement/;
const ROOT_OF_SITE: RegExp = /canvas\.after\(layer\)|document\.body\)|canvas\.parentElement/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string): string[] => {
    const path: string = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

function escapingMounts(): Mount[] {
  return sourceFiles('src')
    .filter((path: string): boolean => !path.startsWith(join('src', 'landing')))
    .flatMap((path: string): Mount[] =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((text: string, index: number): Mount[] => (ESCAPING_MOUNT.test(text) ? [{ path, line: index + 1, text }] : [])),
    );
}

function siteOf(mount: Mount): string {
  const matched: RegExpExecArray | null = ROOT_OF_SITE.exec(mount.text);
  return `${mount.path}:${matched?.[0] ?? mount.text.trim()}`;
}

function gated(selector: string): boolean {
  return HUD_GATE.roots.some((root: string): boolean => root === selector) || HUD_GATE.loose.some((loose: string): boolean => loose === selector);
}

function body(): HudGateTarget {
  return { dataset: {} };
}

void test('only the name letters, the note, the faint joystick, the glitch white-out, the menus and the feedback card survive a hidden HUD', (): void => {
  assert.deepEqual([...HUD_GATE.keep].toSorted(), [...ALLOWED_IN_A_HIDDEN_HUD]);
  assert.equal(HUD_GATE.faint, 'tc-stick');
  const faint: readonly number[] = [HUD_GATE.faintIdle, HUD_GATE.faintHeld];
  assert.ok(faint.every((opacity: number, index: number): boolean => opacity > 0 && opacity < FAINT_LIMIT && (index === 0 || opacity > (faint[index - 1] ?? 0))));
});

void test('every child of a HUD root, and every loose HUD layer, is hidden and unclickable while the gate is closed', (): void => {
  const css: string = hudGateCss();
  const keep: string = HUD_GATE.keep.map((name: string): string => `.${name}`).join(', ');
  for (const root of HUD_GATE.roots) assert.ok(css.includes(`body[data-hud-gate='closed'] ${root} > :not(${keep})`), root);
  for (const loose of HUD_GATE.loose) assert.ok(css.includes(`body[data-hud-gate='closed'] ${loose}`), loose);
  const rule: string = css.slice(0, css.indexOf('}'));
  assert.match(rule, /filter: opacity\(0\) !important/);
  assert.match(rule, /visibility: hidden !important/);
  assert.match(rule, /pointer-events: none !important/);
});

void test('every game layer is either gated or a layer of world labels', (): void => {
  for (const layer of GAME_LAYERS) assert.ok(gated(layer) || HUD_GATE.open.some((open: string): boolean => open === layer), `${layer} is neither gated nor open`);
});

void test('nothing is mounted outside the HUD roots unless it is a registered, gated layer', (): void => {
  const mounts: Mount[] = escapingMounts();
  assert.ok(mounts.length > 0);
  for (const mount of mounts) {
    const layer: string | undefined = MOUNT_SITES[siteOf(mount)];
    assert.ok(layer !== undefined, `${mount.path}:${mount.line} mounts UI outside the HUD roots; mount it under #hud or register it with the HUD gate`);
    assert.ok(gated(layer) || HUD_GATE.above.some((above: string): boolean => above === layer), `${layer} is mounted at ${mount.path}:${mount.line} but the HUD gate does not cover it`);
  }
});

void test('only the graphics and fault notice sits above the HUD gate, so it shows on the title, in the lobby and in play', (): void => {
  assert.deepEqual([...HUD_GATE.above], ['.ctx-notice']);
  assert.equal(gated('.ctx-notice'), false);
  assert.ok(escapingMounts().some((mount: Mount): boolean => MOUNT_SITES[siteOf(mount)] === '.ctx-notice'));
});

void test('the gate closes at once and opens with a reveal that settles', (): void => {
  const target: HudGateTarget = body();
  const gate: HudGate = createHudGate(target, true);
  assert.equal(target.dataset['hudGate'], 'closed');
  gate.settle();
  assert.equal(gate.state(), 'closed');
  gate.set(false);
  assert.equal(target.dataset['hudGate'], 'opening');
  gate.set(false);
  assert.equal(gate.state(), 'opening');
  gate.settle();
  assert.equal(target.dataset['hudGate'], 'open');
  gate.set(true);
  assert.equal(target.dataset['hudGate'], 'closed');
  assert.equal(createHudGate(body(), false).state(), 'open');
});

void test('a HUD part the hero has not earned is taken out of the layout, and each has its rule', (): void => {
  const css: string = hudGateCss();
  for (const part of HUD_PARTS) assert.ok(css.includes(`body[data-hud-show]:not([data-hud-show~='${part}']) [${HUD_GATE.partAttribute}~='${part}']`), part);
  assert.doesNotMatch(css, /data-hud-slot/);
  assert.ok(css.includes('display: none !important'));
  assert.ok(css.includes(`animation: ${HUD_GATE.partAnimation} var(--spring-snappy-ms) var(--spring-snappy)`));
  const fade: string = css.slice(css.indexOf(`@keyframes ${HUD_GATE.partAnimation}`));
  assert.match(fade, /opacity: 0/);
  assert.doesNotMatch(fade, /translate|transform|scale/);
});

void test('the gate writes the shown parts to the page', (): void => {
  const page: HudGateTarget = { dataset: {} };
  const gate: HudGate = createHudGate(page, false);
  gate.show({ parts: ['life', 'inventory'], slots: [0, 3] });
  assert.equal(page.dataset['hudShow'], 'life inventory');
  assert.equal(page.dataset['hudSlots'], undefined);
  gate.show({ parts: [], slots: [] });
  assert.equal(page.dataset['hudShow'], '');
  assert.equal(shownData({ parts: ['map'], slots: [] }).hudShow, 'map');
});

void test('each menu panel button belongs to its own HUD part', (): void => {
  assert.equal(panelPart('tree'), 'chart');
  assert.equal(panelPart('inventory'), 'inventory');
});

const JOURNEY = {
  step: 1 / 60,
  lead: 6,
  limit: 90,
} as const;

function carried(content: Content, world: World): boolean {
  return world.player.inventory.some((item: ItemInstance | null): boolean => item !== null && (content.itemBases.get(item.base)?.book ?? null) !== null);
}

function lying(world: World): GroundItem | null {
  return world.ground.find((ground: GroundItem): boolean => ground.find !== null) ?? null;
}

void test('picking up the journal in the mist opens the gate on the life globe and the bag, and nothing else', (): void => {
  const content: Content = loadContent();
  const world: World = createWorld(content, { seed: 4, save: null, opening: true });
  const page: HudGateTarget = { dataset: {} };
  const gate: HudGate = createHudGate(page, true);
  followWorld(gate, world, false);
  assert.equal(gate.state(), 'closed');
  for (let seconds: number = 0; lying(world) === null && seconds < JOURNEY.limit; seconds += JOURNEY.step) {
    stepWorld(world, [{ type: 'move', held: true, dest: { x: world.player.pos.x, z: world.player.pos.z + JOURNEY.lead } }], JOURNEY.step);
    followWorld(gate, world, false);
    assert.equal(gate.state(), 'closed');
  }
  const journal: GroundItem | null = lying(world);
  assert.ok(journal !== null);
  stepWorld(world, [{ type: 'pickup', groundId: journal.id }], JOURNEY.step);
  for (let seconds: number = 0; !carried(content, world) && seconds < JOURNEY.limit; seconds += JOURNEY.step) stepWorld(world, [], JOURNEY.step);
  assert.ok(carried(content, world));
  assert.equal(world.player.equipped.weapon, null);
  followWorld(gate, world, false);
  assert.notEqual(gate.state(), 'closed');
  assert.equal(page.dataset['hudShow'], HUD_FRAME.join(' '));
});

void test('a note read as the HUD first arrives holds the frame back until it closes, so the frame fades in once', (): void => {
  const content: Content = loadContent();
  const world: World = createWorld(content, { seed: 2, save: null, opening: true });
  const gate: HudGate = createHudGate({ dataset: {} }, true);
  const journal: ItemInstance | null = generateItem(content, world.rng, world.nextItemUid, 1, 'worn_journal', null);
  assert.ok(journal !== null);
  world.player.inventory[0] = journal;
  followWorld(gate, world, true);
  assert.equal(gate.state(), 'closed');
  followWorld(gate, world, false);
  assert.equal(gate.state(), 'opening');
  gate.settle();
  followWorld(gate, world, true);
  assert.equal(gate.state(), 'open');
});

void test('a closed gate hides every piece of the bottom row except the hint, so a first hint can show in the mist', (): void => {
  const css: string = hudGateCss();
  const keep: string = HUD_GATE.keep.map((name: string): string => `.${name}`).join(', ');
  assert.ok(css.includes(`body[data-hud-gate='closed'] #hud > .hud-bottom > :not(${keep})`));
  assert.ok(HUD_GATE.keep.includes('hud-hint'));
});
