import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActionDef, ResolvedKeys, SlotDefault } from './bindings.ts';
import { actionTable, keyLabel, rebind, resolveKeys, sanitizeOverrides, slotAction } from './bindings.ts';

const SLOTS: readonly SlotDefault[] = [
  { name: 'Cleave', bindings: ['mouse_left'] },
  { name: 'Thunderclap', bindings: ['KeyQ'] },
  { name: 'Storm Bolt', bindings: ['KeyW', 'mouse_right'] },
];

const TABLE: readonly ActionDef[] = actionTable(SLOTS);

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

void test('sanitizing drops every override when they would collide', (): void => {
  assert.deepEqual(sanitizeOverrides(TABLE, { inventory: ['KeyB'], tree: ['KeyB'] }), {});
  assert.deepEqual(sanitizeOverrides(TABLE, { inventory: ['KeyQ'] }), {});
});

void test('labels read plainly', (): void => {
  assert.equal(keyLabel('KeyQ'), 'Q');
  assert.equal(keyLabel('Digit3'), '3');
  assert.equal(keyLabel('mouse_right'), 'RMB');
  assert.equal(keyLabel('Escape'), 'Esc');
  assert.equal(keyLabel('Numpad4'), 'Num 4');
  assert.equal(keyLabel('F5'), 'F5');
});
