import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { emptyEquipment, generateItem } from '../../sim/items.ts';
import { createRng } from '../../sim/rng.ts';
import type { KeyValueStore } from '../backend/backend.ts';
import { HERO_KEY, heroChoice, keepHero, readHero } from './hero-choice.ts';

const content: Content = loadContent();

function memory(): KeyValueStore {
  const values: Map<string, string> = new Map<string, string>();
  return {
    read: (key: string): string | null => values.get(key) ?? null,
    write: (key: string, value: string): boolean => {
      values.set(key, value);
      return true;
    },
    remove: (key: string): void => {
      values.delete(key);
    },
  };
}

void test('the chosen hero is kept on the device, and a kept id the game does not know is ignored', (): void => {
  const store: KeyValueStore = memory();
  assert.equal(readHero(store, content), null);
  keepHero(store, 'woman');
  assert.equal(store.read(HERO_KEY), 'woman');
  assert.equal(readHero(store, content), 'woman');
  keepHero(store, 'nobody');
  assert.equal(readHero(store, content), null);
});

void test('the lobby offers every hero with the weapon it finds while the choice is open, and nothing once it is closed', (): void => {
  const open = must(heroChoice(content, { level: 1, xp: 0, equipped: emptyEquipment() }, 'woman'), 'open choice');
  assert.equal(open.chosen, 'woman');
  assert.deepEqual(open.options, [
    { id: 'man', name: 'Man', finds: 'Rusted Blade' },
    { id: 'woman', name: 'Woman', finds: 'Worn Crossbow' },
  ]);
  const armed = { ...emptyEquipment(), weapon: must(generateItem(content, createRng(1), 5, 1, 'rusted_blade', 'common'), 'blade') };
  assert.equal(heroChoice(content, { level: 1, xp: 0, equipped: armed }, 'man'), null);
  assert.equal(heroChoice(content, { level: 2, xp: 0, equipped: emptyEquipment() }, 'man'), null);
  assert.equal(heroChoice({ ...content, player: { ...content.player, heroes: content.player.heroes.slice(0, 1) } }, { level: 1, xp: 0, equipped: emptyEquipment() }, 'man'), null);
});
