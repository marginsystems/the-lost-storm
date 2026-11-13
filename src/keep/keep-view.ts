import { hudHidden } from '../../sim/world/hud.ts';
import type { World } from '../../sim/world/types.ts';
import type { Clock, KeyValueStore } from '../backend/backend.ts';
import { el, label } from '../hud/dom.ts';
import { armPlay, calm, closePlay, IDLE_PLAY, KEEP_PROMPT, keepDismissed, levelGained, readDismissed, stepPlay, worthAsking } from './keep-prompt.ts';
import type { PlayPrompt } from './keep-prompt.ts';
import keepCss from './keep.css?inline';

export const KEEP_VIEW = {
  styleId: 'keep-styles',
  sheetSelector: '.lobby-sheet',
  on: 'on',
  off: 'off',
} as const;

export interface KeepViewDeps {
  readonly world: World;
  readonly hud: HTMLElement;
  readonly lobby: HTMLElement;
  readonly store: KeyValueStore;
  readonly clock: Clock;
  readonly offered: () => boolean;
  readonly cloud: () => boolean;
  readonly online: () => boolean;
  readonly inPlay: () => boolean;
  readonly signIn: () => void;
}

export interface KeepView {
  update(dt: number): void;
}

interface Ask {
  readonly root: HTMLElement;
}

function ensureStyles(): void {
  if (document.getElementById(KEEP_VIEW.styleId) !== null) return;
  const style: HTMLStyleElement = document.createElement('style');
  style.id = KEEP_VIEW.styleId;
  style.textContent = keepCss;
  document.head.append(style);
}

function button(parent: HTMLElement, className: string, text: string, onClick: () => void): void {
  const made: HTMLButtonElement = el('button', className, parent);
  made.type = 'button';
  made.textContent = text;
  made.addEventListener('click', onClick);
}

function ask(parent: HTMLElement, className: string, title: string | null, line: string, signIn: () => void, later: () => void): Ask {
  const root: HTMLDivElement = el('div', `keep ${className}`, parent);
  root.dataset['shown'] = KEEP_VIEW.off;
  root.inert = true;
  const inner: HTMLDivElement = el('div', 'keep-inner', root);
  if (title !== null) label('keep-title', title, inner);
  label('keep-line', line, inner);
  const row: HTMLDivElement = el('div', 'keep-row', inner);
  button(row, 'keep-go', KEEP_PROMPT.signIn, signIn);
  button(row, 'keep-later', KEEP_PROMPT.later, later);
  return { root };
}

function setShown(target: Ask | null, shown: boolean): void {
  if (target === null) return;
  const next: string = shown ? KEEP_VIEW.on : KEEP_VIEW.off;
  if (target.root.dataset['shown'] === next) return;
  target.root.dataset['shown'] = next;
  target.root.inert = !shown;
}

export function createKeepView(deps: KeepViewDeps): KeepView {
  const { world, store } = deps;
  ensureStyles();
  let dismissedAt: number | null = readDismissed(store);
  let play: PlayPrompt = IDLE_PLAY;
  let level: number = world.player.level;

  const later = (): void => {
    dismissedAt = deps.clock();
    keepDismissed(store, dismissedAt);
    play = closePlay(play);
  };
  const signIn = (): void => {
    play = closePlay(play);
    deps.signIn();
  };

  let note: Ask | null = null;
  const sheetNote = (): Ask | null => {
    const sheet: Element | null = deps.lobby.querySelector(KEEP_VIEW.sheetSelector);
    return sheet instanceof HTMLElement ? ask(sheet, 'keep-note', null, KEEP_PROMPT.sheetLine, signIn, later) : null;
  };
  const card: Ask = ask(deps.hud, 'keep-card', KEEP_PROMPT.cardTitle, KEEP_PROMPT.cardLine, signIn, later);
  card.root.setAttribute('role', 'status');

  return {
    update(dt: number): void {
      if (levelGained(level, world.player.level)) play = armPlay(play);
      level = world.player.level;
      const worth: boolean = worthAsking({ offered: deps.offered(), cloud: deps.cloud(), online: deps.online(), level: world.player.level, dismissedAt, now: deps.clock() });
      const onScreen: boolean = deps.inPlay() && world.player.alive && !hudHidden(world);
      play = stepPlay(play, { worth, onScreen, calm: calm(world.monsters, world.player.pos, world.time - world.glitch.lastFight), dt });
      note ??= sheetNote();
      setShown(note, worth);
      setShown(card, play.visible);
    },
  };
}
