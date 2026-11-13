import type { WebGLRenderer } from 'three';
import type { Content } from '../../sim/content/types.ts';
import type { QualityName } from '../mobile/quality.ts';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CharacterLibrary } from '../render/character-loader.ts';
import type { Veil } from '../transition.ts';
import { createVeil } from '../veil.ts';
import type { Lobby } from './compact.ts';
import { createLobbyScreen } from './lobby-screen.ts';
import type { LobbyScreen, LobbyView } from './lobby-screen.ts';
import { createLobbyStage } from './lobby-stage.ts';
import type { LobbyLook, LobbyStage } from './lobby-stage.ts';

export const LOBBY_FLOW = {
  settleFrames: 2,
  pauseSelector: '#hud > .pause',
  pauseOpenClass: 'open',
  bodyMark: 'lobby',
} as const;

export interface LobbyFlowParts {
  readonly root: HTMLElement;
  readonly veil: HTMLElement;
  readonly title: HTMLElement;
  readonly hud: HTMLElement;
  readonly renderer: WebGLRenderer;
  readonly content: Content;
  readonly library: CharacterLibrary;
  readonly loader: GLTFLoader;
  readonly lobby: Lobby | null;
  readonly look: () => LobbyLook;
  readonly view: () => LobbyView;
  readonly begin: () => void;
  readonly ready: () => Promise<void>;
  readonly enterColour: () => string | null;
  readonly startOver: () => void;
  readonly chooseHero: (id: string) => void;
  readonly openSettings: () => void;
  readonly tier: () => QualityName;
  readonly restore: () => void;
}

export interface LobbyFlow {
  readonly active: boolean;
  render(dt: number): boolean;
  open(): Promise<void>;
  toTitle(): Promise<void>;
  warm(): Promise<void>;
  restage(): void;
}

function frames(count: number): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    let left: number = count;
    const tick = (): void => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function lendPause(screen: LobbyScreen, hud: HTMLElement, open: () => void): void {
  const pause: Element | null = document.querySelector(LOBBY_FLOW.pauseSelector);
  if (!(pause instanceof HTMLElement)) return;
  screen.root.after(pause);
  const watcher: MutationObserver = new MutationObserver((): void => {
    if (pause.classList.contains(LOBBY_FLOW.pauseOpenClass)) return;
    watcher.disconnect();
    hud.append(pause);
  });
  open();
  if (!pause.classList.contains(LOBBY_FLOW.pauseOpenClass)) {
    hud.append(pause);
    return;
  }
  watcher.observe(pause, { attributes: true, attributeFilter: ['class'] });
}

export function createLobbyFlow(parts: LobbyFlowParts): LobbyFlow {
  const stage: LobbyStage = createLobbyStage(parts.content, parts.library, parts.loader);
  const veil: Veil = createVeil(parts.veil);
  let active: boolean = false;
  let busy: boolean = false;
  let warming: Promise<void> | null = null;
  const warmStage = (): Promise<void> => {
    stage.dress(parts.look());
    warming ??= stage.warm(parts.renderer, parts.tier());
    return warming;
  };

  const swap = async (into: boolean, middle: () => void, colour: string | null, hold: () => Promise<void> = (): Promise<void> => Promise.resolve()): Promise<void> => {
    if (busy) return;
    busy = true;
    screen.setBusy(true);
    if (!into) screen.hide();
    await veil.cover(colour);
    await hold();
    middle();
    active = into;
    document.body.toggleAttribute(`data-${LOBBY_FLOW.bodyMark}`, into);
    if (!into) parts.restore();
    if (into) {
      await warmStage();
      screen.setBusy(false);
      screen.show(parts.view());
    }
    await frames(LOBBY_FLOW.settleFrames);
    busy = false;
    screen.setBusy(false);
    await veil.lift();
  };

  const toTitle = (): Promise<void> =>
    swap(false, (): void => {
      parts.title.classList.remove('gone');
    }, null);

  const screen: LobbyScreen = createLobbyScreen(parts.root, parts.lobby, {
    primary: (): void => {
      void swap(false, parts.begin, parts.enterColour(), parts.ready);
    },
    startOver: (): void => {
      screen.setBusy(true);
      parts.startOver();
    },
    settings: (): void => {
      lendPause(screen, parts.hud, parts.openSettings);
    },
    back: (): void => {
      void toTitle();
    },
    chooseHero: (id: string): void => {
      if (!busy) parts.chooseHero(id);
    },
  });

  return {
    get active(): boolean {
      return active;
    },
    render(dt: number): boolean {
      if (!active) return false;
      stage.render(parts.renderer, dt, parts.tier(), window.devicePixelRatio);
      return true;
    },
    open(): Promise<void> {
      if (active) return Promise.resolve();
      return swap(true, (): void => {
        parts.title.classList.add('gone');
      }, null);
    },
    toTitle,
    warm(): Promise<void> {
      return warmStage();
    },
    restage(): void {
      stage.dress(parts.look());
      screen.setHeroes(parts.view().heroes);
    },
  };
}
