import type { WebGLRenderer } from 'three';
import type { Content } from '../../sim/content/types.ts';
import type { QualityName } from '../mobile/quality.ts';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CharacterLibrary } from '../render/character-loader.ts';
import type { Veil } from '../transition.ts';
import { createVeil, VEIL } from '../veil.ts';
import { LOBBY_RESUME } from './lobby-resume.ts';
import type { CreateCheck } from './character-desk.ts';
import { createCharacterControls } from './character-controls.ts';
import type { CharacterControls, CharacterHooks } from './character-controls.ts';
import type { Lobby } from './compact.ts';
import { createLobbyScreen, LOBBY_SCREEN } from './lobby-screen.ts';
import type { LobbyScreen, LobbyView, SheetView } from './lobby-screen.ts';
import { createLobbyStage } from './lobby-stage.ts';
import type { LobbyLook, LobbyStage } from './lobby-stage.ts';

export const LOBBY_FLOW = {
  settleFrames: 2,
  pauseSelector: '#hud > .pause',
  cardSelector: '#hud > .fb',
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
  readonly view: () => SheetView;
  readonly begin: () => void;
  readonly ready: () => Promise<void>;
  readonly enterColour: () => string | null;
  readonly startOver: () => void;
  readonly chooseHero: (id: string) => void;
  readonly characters: CharacterHooks;
  readonly openSettings: () => void;
  readonly openFeedback: (() => void) | null;
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

async function settled(node: HTMLElement): Promise<void> {
  const finite: Animation[] = node.getAnimations({ subtree: true }).filter((animation: Animation): boolean => animation.effect?.getComputedTiming().endTime !== Infinity);
  await Promise.allSettled(finite.map((animation: Animation): Promise<Animation> => animation.finished));
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

function lend(screen: LobbyScreen, hud: HTMLElement, selector: string, open: () => void): void {
  const pause: Element | null = document.querySelector(selector);
  if (!(pause instanceof HTMLElement)) return;
  screen.root.after(pause);
  const watcher: MutationObserver = new MutationObserver((): void => {
    if (pause.classList.contains(LOBBY_FLOW.pauseOpenClass)) return;
    watcher.disconnect();
    void settled(pause).then((): boolean => {
      const closed: boolean = !pause.classList.contains(LOBBY_FLOW.pauseOpenClass);
      if (closed) hud.append(pause);
      return closed;
    });
  });
  open();
  if (!pause.classList.contains(LOBBY_FLOW.pauseOpenClass)) {
    hud.append(pause);
    return;
  }
  watcher.observe(pause, { attributes: true, attributeFilter: ['class'] });
}

export function createLobbyFlow(parts: LobbyFlowParts): LobbyFlow {
  const characters: CharacterControls = createCharacterControls(parts.content, parts.characters);
  const view = (): LobbyView => {
    const sheet: SheetView = parts.view();
    return { ...sheet, ...characters.view(sheet.name) };
  };
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

  const swap = async (into: boolean, middle: () => void, colour: string | null, hold: () => Promise<void> = (): Promise<void> => Promise.resolve(), covered: boolean = false): Promise<void> => {
    if (busy) return;
    busy = true;
    screen.setBusy(true);
    if (!into) screen.hide();
    if (!covered) await veil.cover(colour);
    await hold();
    middle();
    active = into;
    document.body.toggleAttribute(`data-${LOBBY_FLOW.bodyMark}`, into);
    if (!into) parts.restore();
    if (into) {
      await warmStage();
      screen.setBusy(false);
      screen.show(view());
      void refresh();
    }
    await frames(LOBBY_FLOW.settleFrames);
    busy = false;
    screen.setBusy(false);
    await veil.lift();
  };

  const refresh = async (): Promise<void> => {
    await characters.refresh();
    if (!active) return;
    const next: LobbyView = view();
    screen.setCards(next.cards);
    screen.setUsername(next.username);
  };

  const leave = async (go: () => Promise<boolean>): Promise<void> => {
    if (busy) return;
    busy = true;
    screen.setBusy(true);
    await veil.cover(null);
    if (await go()) return;
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
      if (characters.only()) parts.startOver();
      else void remove();
    },
    settings: (): void => {
      lend(screen, parts.hud, LOBBY_FLOW.pauseSelector, parts.openSettings);
    },
    feedback: ((): (() => void) | null => {
      const open: (() => void) | null = parts.openFeedback;
      return open === null ? null : (): void => lend(screen, parts.hud, LOBBY_FLOW.cardSelector, open);
    })(),
    back: (): void => {
      void toTitle();
    },
    chooseHero: (id: string): void => {
      if (!busy) parts.chooseHero(id);
    },
    pick: (key: string): void => {
      void leave((): Promise<boolean> => characters.pick(key));
    },
    create: async (name: string): Promise<string | null> => {
      if (busy) return null;
      const checked: CreateCheck = await characters.check(name);
      if (checked.kind === 'refused') return checked.text;
      void leave((): Promise<boolean> => characters.enterNew(checked.name, checked.id));
      return null;
    },
    suggest: (): string | null => characters.suggest(),
  });

  const remove = async (): Promise<void> => {
    const refusal: string | null = await characters.remove(view().name ?? LOBBY_SCREEN.unnamed);
    if (refusal !== null) {
      screen.refuse(refusal);
      screen.setBusy(false);
      return;
    }
    await leave((): Promise<boolean> => {
      characters.reload();
      return Promise.resolve(true);
    });
  };

  const leaveTitle = (): void => {
    parts.title.classList.add('gone');
  };

  const resume = (): Promise<void> => {
    if (active) return Promise.resolve();
    parts.veil.classList.add(VEIL.coverClass);
    document.documentElement.classList.remove(LOBBY_RESUME.className);
    return swap(
      true,
      leaveTitle,
      null,
      async (): Promise<void> => {
        leaveTitle();
        await settled(parts.title);
      },
      true,
    );
  };

  if (characters.resuming) void resume();

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
