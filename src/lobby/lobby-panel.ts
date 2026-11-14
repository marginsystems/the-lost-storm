import type { Leaderboard, LevelUpNote } from '../backend/api.ts';
import { el, label, setText } from '../hud/dom.ts';
import { createBoardView } from './board-view.ts';
import type { BoardView } from './board-view.ts';
import { ensureLobbyStyles } from './styles.ts';
import { agoText, levelUpText, onlineText } from './lobby-model.ts';

export type PanelState = 'loading' | 'ready' | 'unreachable';

export interface LobbyPanel {
  readonly root: HTMLElement;
  show(board: Leaderboard | null): void;
  stop(): void;
}

export interface LobbyPanelOptions {
  readonly title: string;
  readonly rows: number;
  readonly ticker: boolean;
}

export const LOBBY_PANEL: { readonly tickerMs: number; readonly tickerLines: number; readonly swapMs: number; readonly empty: string; readonly unreachable: string } = {
  tickerMs: 4200,
  tickerLines: 5,
  swapMs: 260,
  empty: 'No one has woken yet.',
  unreachable: 'The ladder is out of reach right now.',
};

interface Ticker {
  show(notes: readonly LevelUpNote[]): void;
  stop(): void;
}

function createTicker(parent: HTMLElement): Ticker {
  const box: HTMLDivElement = el('div', 'lobby-ticker', parent);
  const line: HTMLDivElement = el('div', 'lobby-ticker-line', box);
  const what: HTMLSpanElement = el('span', 'lobby-ticker-what', line);
  const when: HTMLSpanElement = el('span', 'lobby-ticker-when', line);
  let notes: readonly LevelUpNote[] = [];
  let index: number = 0;
  let painted: boolean = false;
  let timer: number | null = null;

  const paint = (): void => {
    const note: LevelUpNote | undefined = notes[index % Math.max(1, notes.length)];
    what.textContent = note === undefined ? '' : levelUpText(note);
    when.textContent = note === undefined ? '' : agoText(note.minutesAgo);
    box.classList.toggle('shown', note !== undefined);
    line.classList.remove('out');
  };

  const swap = (): void => {
    line.classList.add('out');
    window.setTimeout(paint, LOBBY_PANEL.swapMs);
  };

  const cycle = (): void => {
    if (timer !== null) window.clearInterval(timer);
    timer = notes.length > 1 ? window.setInterval((): void => {
      index += 1;
      swap();
    }, LOBBY_PANEL.tickerMs) : null;
  };

  return {
    show(next: readonly LevelUpNote[]): void {
      const trimmed: readonly LevelUpNote[] = next.slice(0, LOBBY_PANEL.tickerLines);
      const changed: boolean = !painted || trimmed.map(levelUpText).join('|') !== notes.map(levelUpText).join('|');
      notes = trimmed;
      painted = true;
      if (!changed) {
        const note: LevelUpNote | undefined = notes[index % Math.max(1, notes.length)];
        if (note !== undefined) when.textContent = agoText(note.minutesAgo);
        return;
      }
      index = 0;
      swap();
      cycle();
    },
    stop(): void {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    },
  };
}

export function createLobbyPanel(parent: HTMLElement, options: LobbyPanelOptions): LobbyPanel {
  ensureLobbyStyles();
  const root: HTMLElement = el('section', 'lobby-panel', parent);
  root.dataset['state'] = 'loading';
  const head: HTMLDivElement = el('div', 'lobby-head', root);
  label('lobby-title', options.title, head);
  const online: HTMLSpanElement = el('span', 'lobby-online', head);
  el('i', 'lobby-online-dot', online);
  const onlineCount: HTMLSpanElement = el('span', 'lobby-online-count', online);
  const list: HTMLOListElement = el('ol', 'lobby-board', root);
  const board: BoardView = createBoardView(list, options.rows);
  const note: HTMLDivElement = label('lobby-note', '', root);
  const ticker: Ticker | null = options.ticker ? createTicker(root) : null;

  return {
    root,
    show(next: Leaderboard | null): void {
      if (next === null) {
        if (root.dataset['state'] !== 'ready') {
          root.dataset['state'] = 'unreachable';
          setText(note, LOBBY_PANEL.unreachable, false);
        }
        return;
      }
      root.dataset['state'] = 'ready';
      root.classList.toggle('empty', next.top.length === 0);
      setText(note, LOBBY_PANEL.empty, false);
      online.classList.toggle('shown', next.online > 0);
      setText(onlineCount, onlineText(next.online), true);
      board.render(next.top, next.you === null ? null : next.you.name);
      ticker?.show(next.levelUps);
    },
    stop(): void {
      ticker?.stop();
    },
  };
}
