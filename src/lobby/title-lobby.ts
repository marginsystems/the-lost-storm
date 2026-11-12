import type { Leaderboard, YourRow } from '../backend/api.ts';
import { el, setText } from '../hud/dom.ts';
import { COMPACT, watchFocus } from './compact.ts';
import type { Lobby } from './compact.ts';
import { createLobbyPanel } from './lobby-panel.ts';
import type { LobbyPanel } from './lobby-panel.ts';
import { rankText } from './lobby-model.ts';

export interface TitleLobby {
  stop(): void;
}

type YouMode = 'hidden' | 'line';

export function mountTitleLobby(root: HTMLElement, lobby: Lobby): TitleLobby {
  const panel: LobbyPanel = createLobbyPanel(root, { title: COMPACT.title, rows: COMPACT.rows, ticker: true });
  const you: HTMLDivElement = el('div', 'lobby-you', panel.root);
  you.dataset['mode'] = 'hidden';
  const line: HTMLDivElement = el('div', 'lobby-you-line board-row you', you);
  const lineRank: HTMLSpanElement = el('span', 'board-rank', line);
  el('span', 'board-dot on', line);
  const lineName: HTMLSpanElement = el('span', 'board-name', line);
  const lineLevel: HTMLSpanElement = el('span', 'board-level', line);

  const setMode = (mode: YouMode): void => {
    if (you.dataset['mode'] !== mode) you.dataset['mode'] = mode;
  };

  const showYou = (board: Leaderboard): void => {
    const mine: YourRow | null = board.you;
    if (mine === null) {
      setMode('hidden');
      return;
    }
    setText(lineRank, rankText(mine.rank), true);
    setText(lineName, mine.name, false);
    setText(lineLevel, String(mine.level), true);
    setMode('line');
  };

  const unsubscribe: () => void = lobby.feed.subscribe((board: Leaderboard | null): void => {
    panel.show(board);
    if (board !== null) showYou(board);
  });
  const unwatch: () => void = watchFocus(lobby.feed);
  lobby.feed.every(COMPACT.refreshMs);
  void lobby.feed.refresh(true);

  return {
    stop(): void {
      unsubscribe();
      unwatch();
      panel.stop();
    },
  };
}
