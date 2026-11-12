import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { HudPanel } from './hud-api.ts';
import { closedBy, COVER_CLASS, coverOf, HUD_PANELS, PANEL_COVER, sheetOverflow } from './panel-cover.ts';
import type { CoverState } from './panel-cover.ts';

const CLOSED: Readonly<Record<HudPanel, boolean>> = { inventory: false, character: false, tree: false, map: false };

function css(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function ruleFor(sheet: string, cover: string, target: string, declaration: RegExp): boolean {
  const rules: RegExpMatchArray[] = [...sheet.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  return rules.some((rule: RegExpMatchArray): boolean => {
    const selectors: readonly string[] = (rule[1] ?? '').split(',').map((part: string): string => part.trim());
    const body: string = rule[2] ?? '';
    return selectors.some((selector: string): boolean => selector.includes(`.${cover}`) && selector.endsWith(target)) && declaration.test(body);
  });
}

function hides(sheet: string, cover: string, target: string): boolean {
  return ruleFor(sheet, cover, target, /opacity:\s*0;/);
}

void test('every HUD panel is listed once in the panel order', (): void => {
  assert.deepEqual(HUD_PANELS.toSorted(), Object.keys(PANEL_COVER).toSorted());
});

void test('nothing is covered while every panel is closed', (): void => {
  assert.deepEqual(coverOf(CLOSED), { side: false, full: false });
});

void test('each panel covers what its entry says', (): void => {
  for (const panel of HUD_PANELS) {
    const cover: CoverState = coverOf({ ...CLOSED, [panel]: true });
    assert.equal(cover.side, PANEL_COVER[panel] === 'side', panel);
    assert.equal(cover.full, PANEL_COVER[panel] === 'full', panel);
  }
});

void test('a side panel and the map open together cover both', (): void => {
  assert.deepEqual(coverOf({ ...CLOSED, inventory: true, map: true }), { side: true, full: true });
});

void test('the minimap and the quest tracker give way under every cover', (): void => {
  const minimap: string = css('../minimap/minimap.css');
  for (const cover of Object.values(COVER_CLASS)) {
    assert.ok(hides(minimap, cover, '.minimap'), `${cover} hides the minimap`);
    assert.ok(hides(minimap, cover, '.hud-quests'), `${cover} hides the quest tracker`);
  }
});

void test('the objective arrow gives way under the full map', (): void => {
  assert.ok(hides(css('../objective/objective.css'), COVER_CLASS.full, '.objective-arrow.visible'));
});

void test('covered corner pieces stop taking clicks at once, the minimap frame included', (): void => {
  const minimap: string = css('../minimap/minimap.css');
  for (const cover of Object.values(COVER_CLASS)) {
    for (const target of ['.minimap', '.minimap-frame', '.hud-quests']) assert.ok(ruleFor(minimap, cover, target, /pointer-events:\s*none;/), `${cover} ${target}`);
  }
});

void test('the full map closes the other panels and they close it', (): void => {
  const all: Readonly<Record<HudPanel, boolean>> = { inventory: true, character: true, tree: true, map: false };
  assert.deepEqual(closedBy('map', all, false), ['inventory', 'character', 'tree']);
  assert.deepEqual(closedBy('inventory', { ...CLOSED, map: true }, false), ['map']);
  assert.deepEqual(closedBy('character', { ...CLOSED, inventory: true }, false), []);
});

void test('the Storm Chart is never on screen with another panel: opening it closes them and opening one closes it', (): void => {
  assert.deepEqual(closedBy('tree', { ...CLOSED, inventory: true, character: true, map: true }, false), ['inventory', 'character', 'map']);
  for (const other of ['inventory', 'character', 'map'] as const) assert.deepEqual(closedBy(other, { ...CLOSED, tree: true }, false), ['tree']);
  assert.deepEqual(closedBy('inventory', { ...CLOSED, tree: true }, true), ['tree']);
});

void test('as sheets, a panel shares the screen only with the inventory', (): void => {
  assert.deepEqual(closedBy('character', { ...CLOSED, inventory: true }, true), []);
  assert.deepEqual(closedBy('inventory', { ...CLOSED, character: true }, true), []);
});

void test('turning into sheets keeps the latest panel beside the inventory and closes the rest', (): void => {
  const crowded: Readonly<Record<HudPanel, boolean>> = { ...CLOSED, inventory: true, character: true, map: true };
  assert.deepEqual(sheetOverflow(crowded, 'map'), ['character']);
  assert.deepEqual(sheetOverflow(crowded, 'character'), ['map']);
  assert.deepEqual(sheetOverflow(crowded, 'inventory'), ['map']);
  assert.deepEqual(sheetOverflow(crowded, null), ['map']);
  assert.deepEqual(sheetOverflow({ ...CLOSED, inventory: true, character: true }, 'character'), []);
});
