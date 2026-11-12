import type { Leaderboard, YourRow } from '../backend/lobby-api.ts';
import { el, label, setText } from '../hud/dom.ts';
import type { Lobby } from './compact.ts';
import { createLobbyPanel } from './lobby-panel.ts';
import type { LobbyPanel } from './lobby-panel.ts';
import { passedNames, rankText } from './lobby-model.ts';

export interface GameBoard {
  setPlaying(playing: boolean): void;
  noteLevel(level: number): void;
  toggle(): void;
  close(): boolean;
}

export const GAME_BOARD: {
  readonly key: string;
  readonly closeKey: string;
  readonly rows: number;
  readonly refreshMs: number;
  readonly afterLevelMs: number;
  readonly toastMs: number;
  readonly toastLeaveMs: number;
  readonly unnamed: string;
} = {
  key: 'KeyL',
  closeKey: 'Escape',
  rows: 10,
  refreshMs: 60_000,
  afterLevelMs: 8000,
  toastMs: 2800,
  toastLeaveMs: 520,
  unnamed: 'Save once to join the ladder',
};

function passedText(names: readonly string[], you: YourRow): string {
  const [first] = names;
  const who: string = names.length === 1 && first !== undefined ? first : `${names.length} players`;
  return `You passed ${who} · now ${rankText(you.rank)}`;
}

function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export function mountGameBoard(hud: HTMLElement, lobby: Lobby): GameBoard {
  const root: HTMLDivElement = el('div', 'lobby game-lobby', hud);
  const panel: LobbyPanel = createLobbyPanel(root, { title: 'Ladder', rows: GAME_BOARD.rows, ticker: false });
  const pinned: HTMLDivElement = el('div', 'lobby-pinned board-row you', panel.root);
  const pinRank: HTMLSpanElement = el('span', 'board-rank', pinned);
  el('span', 'board-dot on', pinned);
  const pinName: HTMLSpanElement = el('span', 'board-name', pinned);
  const pinLevel: HTMLSpanElement = el('span', 'board-level', pinned);
  const toasts: HTMLDivElement = el('div', 'lobby-toasts', hud);
  let playing: boolean = false;
  let level: number | null = null;

  const toast = (text: string): void => {
    const item: HTMLDivElement = label('lobby-toast', text, toasts);
    item.getBoundingClientRect();
    item.classList.add('in');
    window.setTimeout((): void => {
      item.classList.remove('in');
      window.setTimeout((): void => {
        item.remove();
      }, GAME_BOARD.toastLeaveMs);
    }, GAME_BOARD.toastMs);
  };

  const pin = (board: Leaderboard): void => {
    const mine: YourRow | null = board.you;
    setText(pinRank, mine === null ? '' : rankText(mine.rank), true);
    setText(pinName, mine === null ? GAME_BOARD.unnamed : mine.name, false);
    setText(pinLevel, mine === null ? '' : String(mine.level), true);
  };

  const toggle = (): void => {
    const open: boolean = !root.classList.contains('open');
    root.classList.toggle('open', open);
    if (open) void lobby.feed.refresh(false);
  };

  const close = (): boolean => {
    if (!root.classList.contains('open')) return false;
    root.classList.remove('open');
    return true;
  };

  lobby.feed.subscribe((board: Leaderboard | null, previous: Leaderboard | null): void => {
    panel.show(board);
    if (board === null) return;
    pin(board);
    const passed: readonly string[] = passedNames(previous, board);
    if (playing && passed.length > 0 && board.you !== null) toast(passedText(passed, board.you));
  });

  window.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (!playing || event.repeat || typing(event.target)) return;
    if (event.code === GAME_BOARD.key) toggle();
    else if (event.code === GAME_BOARD.closeKey) close();
  });

  return {
    setPlaying(next: boolean): void {
      playing = next;
      lobby.feed.every(next ? GAME_BOARD.refreshMs : 0);
      if (!next) close();
    },
    noteLevel(next: number): void {
      if (level !== null && next > level) lobby.feed.soon(GAME_BOARD.afterLevelMs);
      level = next;
    },
    toggle,
    close,
  };
}
