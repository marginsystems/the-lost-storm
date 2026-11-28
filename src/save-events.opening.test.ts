import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../sim/content/content.ts';
import type { Content } from '../sim/content/types.ts';
import { toSave } from '../sim/save.ts';
import type { SaveData } from '../sim/save.ts';
import { createWorld } from '../sim/world/create.ts';
import { stepWorld } from '../sim/world/step.ts';
import { wakeLength } from '../sim/world/wake.ts';
import { must } from '../test/support.ts';
import type { ItemInstance, World, WorldEvent } from '../sim/world/types.ts';
import { changesSave } from './save-events.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const JOURNAL: ItemInstance = { uid: 9100, base: 'worn_journal', rarity: 'common', level: 1, affixes: [], ledger: null };

void test('reading the journal in the opening asks for a save, and the save it writes keeps the journal taken and the page read', (): void => {
  const world: World = createWorld(content, { seed: 3, save: null, opening: true });
  world.player.inventory[0] = JOURNAL;
  world.flags['first_choice'] = 'took_journal';
  const wake = must(world.wake, 'wake');
  for (let step: number = 0; step < Math.ceil(wakeLength(wake.plan) / DT) + 1; step += 1) stepWorld(world, [], DT);
  const events: readonly WorldEvent[] = stepWorld(world, [{ type: 'read', book: 'journal', page: 'do_not' }], DT);
  assert.equal(changesSave(events), true);
  const written: SaveData = toSave(world);
  assert.equal(written.flags['first_choice'], 'took_journal');
  assert.equal(written.flags['opening'], 'read');
});

void test('any change to a story flag asks for a save', (): void => {
  assert.equal(changesSave([{ type: 'flags_changed', flags: ['anything'] }]), true);
});
