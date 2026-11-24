import type { Content } from '../../sim/content/types.ts';
import { createCharactersApi } from '../backend/characters-api.ts';
import { warnInConsole } from '../backend/console-log.ts';
import type { CharactersApi } from '../backend/characters-api.ts';
import type { RemoveOutcome, RosterPlace } from '../backend/roster-store.ts';
import { readServerUrl } from '../backend/server-url.ts';
import type { ServerUrl } from '../backend/server-url.ts';
import { CHARACTER_KEYS } from '../character-keys.ts';
import { createBrowserStore } from '../storage.ts';
import { reloadPage } from '../gpu-release.ts';
import { createCharacterDesk } from './character-desk.ts';
import type { CharacterDesk, CreateCheck } from './character-desk.ts';
import { removeRefusalText, stripCards } from './character-strip-model.ts';
import type { CardView, LiveCharacter } from './character-strip-model.ts';
import type { NameBody, PickedName } from './name-pool.ts';
import { createBrowserSuggester } from './name-suggester.ts';
import type { NameSuggester } from './name-suggester.ts';
import { markResume, takeResume } from './lobby-resume.ts';
import type { FlagStore } from './lobby-resume.ts';

export const CHARACTER_CONTROLS: { readonly retries: number } = { retries: 3 };

export interface CharacterHooks {
  readonly serverUrl: string | undefined;
  persist(): void;
  hold(held: boolean): void;
  flush(): void;
  retire(): void;
  switched(): Promise<void>;
  level(): number | null;
  hero(): string | null;
}

export interface CharacterView {
  readonly cards: readonly CardView[];
  readonly username: string | null;
  readonly only: boolean;
}

export interface CharacterControls {
  readonly resuming: boolean;
  view(name: string | null): CharacterView;
  pick(key: string): Promise<boolean>;
  check(name: string): Promise<CreateCheck>;
  enterNew(name: string, id: string | null): Promise<boolean>;
  suggest(): string | null;
  refresh(): Promise<void>;
  only(): boolean;
  remove(name: string): Promise<string | null>;
  reload(): void;
}

const NEW_CHARACTER_BODY: NameBody | null = null;

const SESSION_FLAGS: FlagStore = {
  getItem: (key: string): string | null => window.sessionStorage.getItem(key),
  setItem: (key: string, value: string): void => {
    window.sessionStorage.setItem(key, value);
  },
  removeItem: (key: string): void => {
    window.sessionStorage.removeItem(key);
  },
};

function browserFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init);
}

export function createCharacterControls(content: Content, hooks: CharacterHooks): CharacterControls {
  const server: ServerUrl = readServerUrl(hooks.serverUrl);
  const place: RosterPlace = { store: createBrowserStore(), serverUrl: server.kind === 'ok' ? server.url : null, extraKeys: CHARACTER_KEYS };
  const api: CharactersApi | null = server.kind === 'ok' ? createCharactersApi(server.url, browserFetch) : null;
  const desk: CharacterDesk = createCharacterDesk({ content, place, api, random: Math.random });
  const suggester: NameSuggester = createBrowserSuggester(hooks.serverUrl);
  const check = async (name: string, retries: number): Promise<CreateCheck> => {
    const checked: CreateCheck = await desk.check(name);
    if (checked.kind !== 'taken') return checked;
    suggester.refuse(name);
    if (!suggester.suggested(name) || retries >= CHARACTER_CONTROLS.retries) return checked;
    const next: PickedName | null = await suggester.next(NEW_CHARACTER_BODY);
    return next === null ? checked : check(next.name, retries + 1);
  };
  const reload = (): void => {
    markResume(SESSION_FLAGS);
    reloadPage();
  };
  const switchOut = async (move: () => boolean): Promise<boolean> => {
    hooks.persist();
    hooks.hold(true);
    hooks.flush();
    await Promise.resolve();
    hooks.retire();
    const moved: boolean = move();
    const swapped: boolean = await hooks.switched().then(
      (): boolean => true,
      (error: unknown): boolean => {
        warnInConsole(`Switching characters in place failed, so the page reloads instead: ${String(error)}`);
        return false;
      },
    );
    if (!swapped) {
      reload();
      return moved;
    }
    hooks.hold(false);
    return moved;
  };
  return {
    resuming: takeResume(SESSION_FLAGS),
    view(name: string | null): CharacterView {
      const live: LiveCharacter = { name, hero: hooks.hero(), level: hooks.level() };
      desk.note(live);
      return { cards: stripCards(desk.facts(live)), username: desk.username(), only: desk.only() };
    },
    pick: (key: string): Promise<boolean> => switchOut((): boolean => desk.pick(key)),
    check: (name: string): Promise<CreateCheck> => check(name, 0),
    enterNew: (name: string, id: string | null): Promise<boolean> => switchOut((): boolean => desk.open(name, id)),
    suggest(): string | null {
      return suggester.pick(NEW_CHARACTER_BODY)?.name ?? null;
    },
    refresh: (): Promise<void> => desk.refresh(),
    only: (): boolean => desk.only(),
    async remove(name: string): Promise<string | null> {
      hooks.persist();
      hooks.hold(true);
      const outcome: RemoveOutcome = await desk.remove();
      const refusal: string | null = removeRefusalText(outcome, name);
      if (refusal !== null) hooks.hold(false);
      return refusal;
    },
    reload,
  };
}
