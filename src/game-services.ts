import { element } from './dom-element.ts';
import { loadContent } from '../sim/content/content.ts';
import type { Content } from '../sim/content/types.ts';
import type { SaveData } from '../sim/save.ts';
import type { AccountService } from './backend/account.ts';
import { createSettingsStore as createGameSettings } from './settings/store.ts';
import type { SettingsStore } from './settings/store.ts';
import type { Backend, BackendState } from './backend/backend.ts';
import { createBrowserAccount, createBrowserBackend, createBrowserMinter } from './backend/browser.ts';
import { createMemoryBackend } from './backend/memory.ts';
import type { Minter } from './backend/minter.ts';
import { createBrowserStore } from './storage.ts';
import { createBrowserLobby } from './lobby/compact.ts';
import type { Lobby } from './lobby/compact.ts';
import { createBrowserTimers } from './browser-timers.ts';
import { createTitleSync } from './title-sync.ts';
import { defaultBar } from '../sim/skill-book.ts';
import type { Bar } from '../sim/skill-book.ts';
import { shippedKeys, showTitleKeys, skillSlots, TITLE_KEYS, titleKeyRows, titleNames } from './title-keys.ts';

export interface GameServicesDeps {
  readonly title: HTMLDivElement;
  readonly serverUrl: string | undefined;
  readonly watching: boolean;
}

export interface GameServices {
  readonly content: Content;
  readonly backend: Backend;
  readonly account: AccountService | null;
  readonly showSync: (state: BackendState) => void;
  readonly loadingSave: Promise<SaveData | null>;
  readonly minter: Minter | null;
  readonly lobby: Lobby | null;
  readonly gameSettings: SettingsStore;
  readonly titleBar: { current: Bar };
  readonly drawTitleKeys: () => void;
}

export function startGameServices(deps: GameServicesDeps): GameServices {
  const { title, serverUrl, watching } = deps;
  const content: Content = loadContent();
  const backend: Backend = watching ? createMemoryBackend(content) : createBrowserBackend(content, serverUrl);
  const account: AccountService | null = createBrowserAccount(content, serverUrl);
  const showSync: (state: BackendState) => void = createTitleSync(element('title-sync', HTMLParagraphElement), createBrowserTimers());
  const loadingSave: Promise<SaveData | null> = backend.load();
  const minter: Minter | null = createBrowserMinter(content, serverUrl);
  const lobby: Lobby | null = createBrowserLobby(serverUrl, true);
  title.dataset['lobby'] = lobby === null ? 'off' : 'on';
  const gameSettings: SettingsStore = createGameSettings(createBrowserStore(), skillSlots(content), shippedKeys(content, lobby !== null));
  const titleBar: { current: Bar } = { current: defaultBar(content) };
  const drawTitleKeys = (): void => {
    showTitleKeys(document.querySelector(`.${TITLE_KEYS.listClass}`), titleKeyRows(gameSettings.keys(), titleNames(content, titleBar.current)));
  };
  drawTitleKeys();
  gameSettings.subscribe(drawTitleKeys);
  return { content, backend, account, showSync, loadingSave, minter, lobby, gameSettings, titleBar, drawTitleKeys };
}
