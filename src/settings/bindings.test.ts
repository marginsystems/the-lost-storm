import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActionDef, ResolvedKeys, SlotDefault } from './bindings.ts';
import { actionTable, flaskAction, keyLabel, rebind, resolveKeys, sanitizeOverrides, slotAction } from './bindings.ts';

const SLOTS: readonly SlotDefault[] = [
  { name: 'Cleave', bindings: ['mouse_left'] },
  { name: 'Thunderclap', bindings: ['KeyQ'] },
  { name: 'Storm Bolt', bindings: ['KeyW', 'mouse_right'] },
];

const TABLE: readonly ActionDef[] = actionTable(SLOTS, 2);

void test('the table lists every action once with no default conflicts', (): void => {
  const ids: string[] = TABLE.map((def: ActionDef): string => def.id);
  assert.equal(new Set(ids).size, ids.length);
  const codes: string[] = TABLE.flatMap((def: ActionDef): readonly string[] => def.defaults);
  assert.equal(new Set(codes).size, codes.length);
  for (const id of ['primary', 'skill:1', 'skill:2', 'inventory', 'character', 'tree', 'map', 'minimap', 'dodge', 'flask1', 'pause']) assert.ok(ids.includes(id), id);
});

void test('slot zero is the move and attack action', (): void => {
  assert.equal(slotAction(0), 'primary');
  assert.equal(slotAction(2), 'skill:2');
});

void test('defaults resolve in both directions', (): void => {
  const keys: ResolvedKeys = resolveKeys(TABLE, {});
  assert.equal(keys.actionOf('KeyQ'), 'skill:1');
  assert.equal(keys.actionOf('mouse_right'), 'skill:2');
  assert.equal(keys.actionOf('KeyZ'), null);
  assert.deepEqual(keys.bindingsOf('skill:2'), ['KeyW', 'mouse_right']);
  assert.equal(keys.labelOf('inventory'), 'I');
  assert.equal(keys.labelOf('primary'), 'LMB');
});

void test('rebinding replaces the action keys and frees the old ones', (): void => {
  const result = rebind(TABLE, {}, 'inventory', 'KeyB');
  const keys: ResolvedKeys = resolveKeys(TABLE, result.kind === 'ok' ? result.overrides : {});
  assert.equal(keys.actionOf('KeyB'), 'inventory');
  assert.equal(keys.actionOf('KeyI'), null);
});

void test('rebinding onto a key in use reports the owner', (): void => {
  const result = rebind(TABLE, {}, 'inventory', 'KeyQ');
  assert.deepEqual(result.kind === 'conflict' ? result.with.id : null, 'skill:1');
});

void test('a key an action already holds is not a conflict with itself', (): void => {
  assert.equal(rebind(TABLE, {}, 'inventory', 'KeyI').kind, 'ok');
});

void test('reserved keys and locked actions are refused', (): void => {
  assert.equal(rebind(TABLE, {}, 'inventory', 'Escape').kind, 'refused');
  assert.equal(rebind(TABLE, {}, 'inventory', 'mouse_left').kind, 'refused');
  assert.equal(rebind(TABLE, {}, 'inventory', 'ShiftLeft').kind, 'refused');
  assert.equal(rebind(TABLE, {}, 'inventory', 'mouse_right').kind, 'refused');
  assert.equal(rebind(TABLE, {}, 'primary', 'KeyB').kind, 'refused');
  assert.equal(rebind(TABLE, {}, 'pause', 'Escape').kind, 'ok');
});

void test('sanitizing drops unknown actions, bad codes and locked actions', (): void => {
  const clean = sanitizeOverrides(TABLE, { inventory: ['KeyB'], nothing: ['KeyX'], tree: ['bad key'], primary: ['KeyZ'], map: ['Escape'] });
  assert.deepEqual(clean, { inventory: ['KeyB'] });
});

void test('sanitizing drops the overrides that collide and keeps the rest', (): void => {
  assert.deepEqual(sanitizeOverrides(TABLE, { inventory: ['KeyB'], tree: ['KeyB'] }), {});
  assert.deepEqual(sanitizeOverrides(TABLE, { inventory: ['KeyB'], map: ['Escape'] }), { inventory: ['KeyB'] });
});

void test('a saved key wins over a default that arrived later, which then goes unbound', (): void => {
  const overrides = sanitizeOverrides(TABLE, { inventory: ['KeyB'], map: ['KeyL'] });
  assert.deepEqual(overrides, { inventory: ['KeyB'], map: ['KeyL'] });
  const keys = resolveKeys(TABLE, overrides);
  assert.equal(keys.actionOf('KeyL'), 'map');
  assert.deepEqual(keys.bindingsOf('ladder'), []);
  assert.deepEqual(sanitizeOverrides(TABLE, { inventory: ['KeyM'], map: ['KeyI'] }), { inventory: ['KeyM'], map: ['KeyI'] });
});

void test('labels read plainly', (): void => {
  assert.equal(keyLabel('KeyQ'), 'Q');
  assert.equal(keyLabel('Digit3'), '3');
  assert.equal(keyLabel('mouse_right'), 'RMB');
  assert.equal(keyLabel('Escape'), 'Esc');
  assert.equal(keyLabel('Numpad4'), 'Num 4');
  assert.equal(keyLabel('F5'), 'F5');
});

void test('the first five flask slots each have a key action and later slots have none', (): void => {
  assert.equal(flaskAction(0), 'flask1');
  assert.equal(flaskAction(4), 'flask5');
  assert.equal(flaskAction(5), null);
  assert.deepEqual(resolveKeys(TABLE, {}).bindingsOf('flask2'), ['Digit2']);
});

void test('the table offers a key for each flask the game has and no more', (): void => {
  const ids = (flasks: number): string[] => actionTable(SLOTS, flasks).map((def: ActionDef): string => def.id).filter((id: string): boolean => id.startsWith('flask'));
  assert.deepEqual(ids(2), ['flask1', 'flask2']);
  assert.deepEqual(ids(0), []);
  assert.deepEqual(ids(9), ['flask1', 'flask2', 'flask3', 'flask4', 'flask5']);
  assert.equal(resolveKeys(actionTable(SLOTS, 2), {}).actionOf('Digit3'), null);
  assert.equal(rebind(actionTable(SLOTS, 2), {}, 'inventory', 'Digit3').kind, 'ok');
});
