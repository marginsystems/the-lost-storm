import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyEquipment } from '../sim/items.ts';
import { createWorld } from '../sim/world/create.ts';
import type { Command, World } from '../sim/world/types.ts';
import { content, createMemoryStore, makeSave, storedLocal } from '../test/backend-support.ts';
import type { Backend, KeyValueStore } from './backend/backend.ts';
import { createEpochs, SAVE_EPOCH } from './backend/epoch.ts';
import { createLocalBackend, SAVE_KEY } from './backend/local.ts';
import { createSwitchableBackend } from './backend/switchable.ts';
import { createCharacterSwitch } from './character-switch.ts';
import type { CharacterSwitch } from './character-switch.ts';
import { createHeroPick } from './lobby/hero-pick.ts';
import type { HeroPick } from './lobby/hero-pick.ts';
import type { BuiltZone } from './transition.ts';

interface Rig {
  readonly world: World;
  readonly store: KeyValueStore;
  readonly pick: HeroPick;
  readonly queue: Command[];
  readonly switcher: CharacterSwitch;
  readonly heard: string[];
  readonly titleBar: { current: readonly (string | null)[] };
  readonly failing: { rebuilds: number };
}

function rig(): Rig {
  const store: KeyValueStore = createMemoryStore();
  const world: World = createWorld(content, { seed: 1, save: makeSave(5, 0) });
  const queue: Command[] = [];
  const heard: string[] = [];
  const titleBar: { current: readonly (string | null)[] } = { current: [] };
  const failing: { rebuilds: number } = { rebuilds: 0 };
  const pick: HeroPick = createHeroPick({
    content,
    chosen: world.player.hero,
    standing: () => ({ level: world.player.level, xp: world.player.xp, equipped: emptyEquipment() }),
    entered: (): boolean => false,
    load: (): Promise<void> => Promise.resolve(),
    keep: (): void => undefined,
    restage: (): void => undefined,
    settled: (): Promise<void> => Promise.resolve(),
  });
  const backend = createSwitchableBackend((): Backend => createLocalBackend(content, store, createEpochs(SAVE_EPOCH)));
  const switcher: CharacterSwitch = createCharacterSwitch({
    content,
    world,
    backend,
    store,
    pick,
    queue,
    titleBar,
    rereads: [(): void => void heard.push('reread')],
    forget: (known: boolean): void => void heard.push(known ? 'known' : 'fresh'),
    dress: (hero: string): Promise<void> => {
      heard.push(`dress ${hero}`);
      return Promise.resolve();
    },
    rebuild: (): Promise<BuiltZone> => {
      heard.push('rebuild');
      queue.length = 0;
      if (failing.rebuilds > 0) {
        failing.rebuilds -= 1;
        return Promise.reject(new Error('the zone did not build'));
      }
      return Promise.resolve({ ready: Promise.resolve() });
    },
  });
  return { world, store, pick, queue, switcher, heard, titleBar, failing };
}

void test('a switch takes the character the store now holds into the same world', async (): Promise<void> => {
  const { world, store, queue, switcher, heard, titleBar } = rig();
  const player = world.player;
  store.write(SAVE_KEY, storedLocal(makeSave(8, 0)));
  queue.push({ type: 'advance' });
  await switcher.switched();
  assert.equal(world.player, player);
  assert.equal(world.player.level, 8);
  assert.deepEqual(queue, []);
  assert.equal(titleBar.current, world.player.bar);
  assert.deepEqual(heard, ['known', 'reread', `dress ${world.player.hero}`]);
});

void test('a switch to a character not yet woken starts a fresh world with no hero chosen', async (): Promise<void> => {
  const { world, pick, switcher, heard } = rig();
  await switcher.switched();
  assert.equal(world.player.level, 1);
  assert.equal(pick.chosen, content.player.heroes.length < 2 ? content.player.hero.id : null);
  assert.equal(heard[0], 'fresh');
});

void test('entering after a switch rebuilds the zone once and keeps what was chosen in the lobby', async (): Promise<void> => {
  const { queue, switcher, heard } = rig();
  await switcher.ready();
  assert.ok(!heard.includes('rebuild'));
  await switcher.switched();
  const chosen: Command = { type: 'hero', hero: 'woman' };
  queue.push(chosen);
  await switcher.ready();
  await switcher.ready();
  assert.equal(heard.filter((entry: string): boolean => entry === 'rebuild').length, 1);
  assert.deepEqual(queue, [chosen]);
});

void test('a rebuild that fails keeps the lobby choice queued and rebuilds again on the next entry', async (): Promise<void> => {
  const { queue, switcher, heard, failing } = rig();
  await switcher.switched();
  const chosen: Command = { type: 'hero', hero: 'woman' };
  queue.push(chosen);
  failing.rebuilds = 1;
  await assert.rejects(switcher.ready());
  assert.deepEqual(queue, [chosen]);
  await switcher.ready();
  assert.equal(heard.filter((entry: string): boolean => entry === 'rebuild').length, 2);
  assert.deepEqual(queue, [chosen]);
});
