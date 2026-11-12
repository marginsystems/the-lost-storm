import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { GAME_LAYERS } from '../title-screen.ts';
import { createHudGate, HUD_GATE, hudGateCss } from './hud-gate.ts';
import type { HudGate, HudGateTarget } from './hud-gate.ts';

interface Mount {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

const FAINT_LIMIT: number = 0.5;

const ALLOWED_IN_A_HIDDEN_HUD: readonly string[] = ['ctx-notice', 'glitch-white', 'hud-fps', 'name-echo', 'pause', 'reader-veil', 'tc-stick'];

const MOUNT_SITES: Readonly<Record<string, string>> = {
  'src/mobile/touch-ui.ts:canvas.after(layer)': '.tc',
  'src/mobile/touch-ui.ts:document.body)': '.tc-rotate',
};

const ESCAPING_MOUNT: RegExp = /document\.body\)|document\.(body|documentElement)\.(append|appendChild|prepend|insertBefore)\(|\b(canvas|hud|hudRoot|app|overlays|vignette|fade)\.(after|before|replaceWith)\(|element\('app'/;
const ROOT_OF_SITE: RegExp = /canvas\.after\(layer\)|document\.body\)/;

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

void test('only the name letters, the note, the faint joystick, the glitch white-out and the menus survive a hidden HUD', (): void => {
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
    assert.ok(gated(layer), `${layer} is mounted at ${mount.path}:${mount.line} but the HUD gate does not cover it`);
  }
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
