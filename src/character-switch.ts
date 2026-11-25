import type { Content } from '../sim/content/types.ts';
import type { Bar } from '../sim/skill-book.ts';
import type { SaveData } from '../sim/save.ts';
import { adoptWorld } from '../sim/world/adopt.ts';
import type { Command, ItemInstance, World } from '../sim/world/types.ts';
import { warnInConsole } from './backend/console-log.ts';
import type { KeyValueStore } from './backend/backend.ts';
import type { SwitchableBackend } from './backend/switchable.ts';
import { readHero, startingHero } from './lobby/hero-choice.ts';
import type { HeroPick } from './lobby/hero-pick.ts';
import type { BuiltZone } from './transition.ts';

export interface CharacterSwitchDeps {
  readonly content: Content;
  readonly world: World;
  readonly backend: SwitchableBackend;
  readonly store: KeyValueStore;
  readonly pick: HeroPick;
  readonly queue: Command[];
  readonly titleBar: { current: Bar };
  readonly rereads: readonly (() => void)[];
  forget(known: boolean): void;
  dress(hero: string): Promise<void>;
  rebuild(): Promise<BuiltZone>;
}

export interface CharacterSwitch {
  switched(): Promise<void>;
  ready(): Promise<void>;
}

export function createCharacterSwitch(deps: CharacterSwitchDeps): CharacterSwitch {
  const { content, world, queue } = deps;
  let stale: boolean = false;
  return {
    async switched(): Promise<void> {
      const next: SaveData | null = await deps.backend.reopen();
      const kept: string | null = next === null ? readHero(deps.store, content) : null;
      const seed: number = Date.now() >>> 0;
      const stash: readonly (ItemInstance | null)[] | null = deps.backend.stash();
      adoptWorld(world, kept === null ? { seed, save: next, opening: true, stash } : { seed, save: next, opening: true, hero: kept, stash });
      deps.pick.reset(startingHero(content, next === null ? null : world.player.hero, kept));
      queue.length = 0;
      stale = true;
      deps.titleBar.current = world.player.bar;
      deps.forget(next !== null);
      for (const reread of deps.rereads) reread();
      await deps.dress(deps.pick.chosen ?? world.player.hero).catch((error: unknown): void => {
        warnInConsole(`Loading the body of the chosen character failed: ${String(error)}`);
      });
    },
    async ready(): Promise<void> {
      if (!stale) return;
      const chosen: Command[] = queue.splice(0, queue.length);
      let built: BuiltZone;
      try {
        built = await deps.rebuild();
      } finally {
        queue.unshift(...chosen);
      }
      stale = false;
      await built.ready;
    },
  };
}
