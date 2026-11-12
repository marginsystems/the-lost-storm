import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../sim/content/content.ts';
import type { Content } from '../sim/content/types.ts';
import { actionTable, resolveKeys } from './settings/bindings.ts';
import type { TitleKeyRow } from './title-keys.ts';
import { defaultKeys, shippedKeys, skillSlots, TITLE_KEYS, titleKeyRows, titleKeysHtml, titleNames } from './title-keys.ts';
import type { TitleNames } from './title-keys.ts';

const content: Content = loadContent();
const names: TitleNames = titleNames(content);
const flaskNames: readonly string[] = names.flasks;

function rowFor(rows: readonly TitleKeyRow[], does: string): TitleKeyRow | undefined {
  return rows.find((row: TitleKeyRow): boolean => row.does.includes(does));
}

void test('without a server the list has no Ladder key, and it lists the minimap and the pause menu from the binding table', (): void => {
  const rows: readonly TitleKeyRow[] = titleKeyRows(defaultKeys(content, false), names);
  assert.equal(rowFor(rows, 'Ladder'), undefined);
  assert.equal(rowFor(rows, 'Minimap')?.keys.includes('Tab'), true);
  assert.deepEqual(rowFor(rows, 'Pause menu'), { keys: 'Esc', does: 'Pause menu' });
  assert.deepEqual(rows[0], TITLE_KEYS.primary);
  assert.deepEqual(rows.at(-1), TITLE_KEYS.zoom);
});

void test('with a server the Ladder key joins the panel row', (): void => {
  const panels: TitleKeyRow | undefined = rowFor(titleKeyRows(defaultKeys(content, true), names), 'Ladder');
  assert.ok(panels !== undefined);
  assert.equal(panels.keys, 'M · Tab · L');
  assert.equal(panels.does, 'World map · Minimap · Ladder');
});

void test('a skill bound to a key and the right mouse reads as one row, and flasks carry their own names', (): void => {
  const rows: readonly TitleKeyRow[] = titleKeyRows(defaultKeys(content, false), names);
  const bolt: TitleKeyRow | undefined = rows.find((row: TitleKeyRow): boolean => row.keys.includes('right mouse'));
  assert.ok(bolt !== undefined);
  assert.match(bolt.keys, / or right mouse$/);
  const flasks: TitleKeyRow | undefined = rowFor(rows, flaskNames[0] ?? '');
  assert.equal(flasks?.does, flaskNames.join(TITLE_KEYS.joiner));
});

void test('a rebound key shows on the title as the player bound it', (): void => {
  const table = actionTable(skillSlots(content), shippedKeys(content, false));
  const rows: readonly TitleKeyRow[] = titleKeyRows(resolveKeys(table, { inventory: ['KeyB'] }), names);
  assert.match(rowFor(rows, 'Inventory')?.keys ?? '', /^B · /);
});

void test('the rows become escaped definition-list markup', (): void => {
  assert.equal(titleKeysHtml([{ keys: 'A & <B>', does: 'Do' }]), '<div><dt>A &amp; &lt;B&gt;</dt><dd>Do</dd></div>');
});

void test('skills on the starting bar show by name and the empty slots share one row', (): void => {
  const rows: readonly TitleKeyRow[] = titleKeyRows(defaultKeys(content, false), names);
  for (const name of names.skills.slice(1)) if (name !== null) assert.ok(rowFor(rows, name) !== undefined, name);
  const open: TitleKeyRow | undefined = rows.find((row: TitleKeyRow): boolean => row.does === TITLE_KEYS.openSlots);
  assert.equal(open !== undefined, names.skills.slice(1).includes(null));
});
