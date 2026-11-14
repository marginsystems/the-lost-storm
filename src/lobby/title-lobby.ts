import type { Leaderboard, Ranking, YourRow } from '../backend/api.ts';
import { RANKINGS } from '../backend/api.ts';
import { el, label, setText } from '../hud/dom.ts';
import { COMPACT, watchFocus } from './compact.ts';
import type { Lobby } from './compact.ts';
import type { LobbyFeed } from './lobby-feed.ts';
import { createLobbyPanel } from './lobby-panel.ts';
import type { LobbyPanel } from './lobby-panel.ts';
import { RANKING_TABS, rankText, rankValueText, tabOf } from './lobby-model.ts';
import type { RankingTab } from './lobby-model.ts';

export interface TitleLobby {
  stop(): void;
}

type YouMode = 'hidden' | 'line';

export const TITLE_LOBBY: { readonly tabProperty: string; readonly rankedClass: string } = { tabProperty: '--lobby-tab', rankedClass: 'ranked' };

export function mountTitleLobby(root: HTMLElement, lobby: Lobby): TitleLobby {
  root.classList.add(TITLE_LOBBY.rankedClass);
  const panel: LobbyPanel = createLobbyPanel(root, { title: COMPACT.title, rows: COMPACT.rows, ticker: true });
  const tabs: HTMLDivElement = el('div', 'lobby-tabs', null);
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Rank by');
  el('i', 'lobby-tab-glide', tabs);
  const caption: HTMLDivElement = label('lobby-caption', '', null);
  panel.head.after(tabs, caption);
  const buttons: Map<Ranking, HTMLButtonElement> = new Map<Ranking, HTMLButtonElement>();

  const you: HTMLDivElement = el('div', 'lobby-you', panel.root);
  you.dataset['mode'] = 'hidden';
  const line: HTMLDivElement = el('div', 'lobby-you-line board-row you', you);
  const lineRank: HTMLSpanElement = el('span', 'board-rank', line);
  el('span', 'board-dot on', line);
  const lineName: HTMLSpanElement = el('span', 'board-name', line);
  const linePlace: HTMLSpanElement = el('span', 'board-place', line);
  const lineValue: HTMLSpanElement = el('span', 'board-level', line);
  let active: Ranking = 'level';

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
    setText(linePlace, mine.furthest, true);
    setText(lineValue, rankValueText(mine, board.by), true);
    setMode('line');
  };

  const paint = (board: Leaderboard | null): void => {
    panel.show(board);
    if (board !== null) showYou(board);
  };

  const select = (by: Ranking, fetch: boolean): void => {
    active = by;
    const tab: RankingTab = tabOf(by);
    tabs.style.setProperty(TITLE_LOBBY.tabProperty, String(RANKING_TABS.indexOf(tab)));
    for (const [ranking, made] of buttons) {
      made.setAttribute('aria-selected', String(ranking === by));
      made.tabIndex = ranking === by ? 0 : -1;
    }
    setText(caption, tab.caption, true);
    for (const ranking of RANKINGS) if (ranking !== 'level') lobby.boards[ranking].every(ranking === by ? COMPACT.refreshMs : 0);
    const feed: LobbyFeed = lobby.boards[by];
    const held: Leaderboard | null = feed.current();
    if (held !== null) paint(held);
    if (fetch) void feed.refresh(held === null);
  };

  for (const tab of RANKING_TABS) {
    const made: HTMLButtonElement = el('button', 'lobby-tab', tabs);
    made.type = 'button';
    made.setAttribute('role', 'tab');
    made.textContent = tab.label;
    made.addEventListener('click', (): void => select(tab.by, true));
    made.addEventListener('keydown', (event: KeyboardEvent): void => {
      const step: number = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const next: RankingTab | undefined = RANKING_TABS[(RANKING_TABS.indexOf(tab) + step + RANKING_TABS.length) % RANKING_TABS.length];
      if (next === undefined) return;
      select(next.by, true);
      buttons.get(next.by)?.focus();
    });
    buttons.set(tab.by, made);
  }

  const unsubscribes: (() => void)[] = RANKINGS.map((by: Ranking): (() => void) =>
    lobby.boards[by].subscribe((board: Leaderboard | null): void => {
      if (by === active) paint(board);
    }),
  );
  const unwatch: () => void = watchFocus(lobby.boards.level);
  lobby.feed.every(COMPACT.refreshMs);
  select('level', false);
  for (const by of RANKINGS) void lobby.boards[by].refresh(true);

  return {
    stop(): void {
      for (const unsubscribe of unsubscribes) unsubscribe();
      for (const by of RANKINGS) if (by !== 'level') lobby.boards[by].every(0);
      unwatch();
      panel.stop();
    },
  };
}
