import type { WebGLRenderer } from 'three';
import type { Content } from '../../sim/content/types.ts';
import type { QualityName } from '../mobile/quality.ts';
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
  readonly lobby: Lobby | null;
  readonly look: () => LobbyLook;
  readonly view: () => LobbyView;
  readonly begin: () => void;
  readonly enterColour: () => string | null;
  readonly startOver: () => void;
  readonly openSettings: () => void;
  readonly tier: () => QualityName;
  readonly restore: () => void;
}

export interface LobbyFlow {
  readonly active: boolean;
  render(dt: number): boolean;
  open(): Promise<void>;
  warm(): Promise<void>;
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
  const stage: LobbyStage = createLobbyStage(parts.content, parts.library);
  const veil: Veil = createVeil(parts.veil);
  let active: boolean = false;
  let busy: boolean = false;

  const swap = async (into: boolean, middle: () => void, colour: string | null): Promise<void> => {
    if (busy) return;
    busy = true;
    screen.setBusy(true);
    if (!into) screen.hide();
    await veil.cover(colour);
    middle();
    active = into;
    document.body.toggleAttribute(`data-${LOBBY_FLOW.bodyMark}`, into);
    if (!into) parts.restore();
    if (into) {
      stage.dress(parts.look());
      screen.setBusy(false);
      screen.show(parts.view());
    }
    await frames(LOBBY_FLOW.settleFrames);
    busy = false;
    screen.setBusy(false);
    await veil.lift();
  };

  const screen: LobbyScreen = createLobbyScreen(parts.root, parts.lobby, {
    primary: (): void => {
      void swap(false, parts.begin, parts.enterColour());
    },
    startOver: (): void => {
      screen.setBusy(true);
      parts.startOver();
    },
    settings: (): void => {
      lendPause(screen, parts.hud, parts.openSettings);
    },
    back: (): void => {
      void swap(false, (): void => {
        parts.title.classList.remove('gone');
      }, null);
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
    warm(): Promise<void> {
      stage.dress(parts.look());
      return stage.warm(parts.renderer, parts.tier());
    },
  };
}
