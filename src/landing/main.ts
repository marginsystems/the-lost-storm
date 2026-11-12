import { readServerUrl } from '../backend/server-url.ts';
import type { ServerUrl } from '../backend/server-url.ts';
import { fetchLadder } from '../backend/ladder.ts';
import type { Ladder, LadderRow } from '../backend/ladder.ts';

const LIVE: { readonly refreshMs: number } = { refreshMs: 30_000 };

function element<T extends HTMLElement>(id: string, kind: new () => T): T | null {
  const found: HTMLElement | null = document.getElementById(id);
  return found instanceof kind ? found : null;
}

function row(entry: LadderRow): HTMLLIElement {
  const item: HTMLLIElement = document.createElement('li');
  const rank: HTMLSpanElement = document.createElement('span');
  rank.className = 'live-rank';
  rank.textContent = String(entry.rank);
  const name: HTMLSpanElement = document.createElement('span');
  name.className = entry.online ? 'live-name on' : 'live-name';
  name.textContent = entry.name;
  const level: HTMLSpanElement = document.createElement('span');
  level.className = 'live-level';
  level.textContent = `Level ${entry.level}`;
  item.append(rank, name, level);
  return item;
}

function show(panel: HTMLElement, ladder: Ladder): void {
  const online: HTMLElement | null = element('live-online', HTMLElement);
  const list: HTMLOListElement | null = element('live-top', HTMLOListElement);
  const empty: HTMLElement | null = element('live-empty', HTMLElement);
  if (online === null || list === null || empty === null) return;
  online.textContent = String(ladder.online);
  const chip: HTMLElement | null = element('live-chip', HTMLElement);
  const chipOnline: HTMLElement | null = element('live-chip-online', HTMLElement);
  if (chip !== null && chipOnline !== null) {
    chipOnline.textContent = String(ladder.online);
    chip.classList.add('ready');
  }
  list.replaceChildren(...ladder.top.map(row));
  empty.hidden = ladder.top.length > 0;
  panel.classList.add('ready');
}

function watch(panel: HTMLElement, serverUrl: string): void {
  const refresh = async (): Promise<void> => {
    if (document.hidden) return;
    const ladder: Ladder | null = await fetchLadder(serverUrl, (url: string, init: RequestInit): Promise<Response> => fetch(url, init));
    if (ladder !== null) show(panel, ladder);
  };
  void refresh();
  window.setInterval((): void => void refresh(), LIVE.refreshMs);
  document.addEventListener('visibilitychange', (): void => void refresh());
}

const server: ServerUrl = readServerUrl(import.meta.env.VITE_SERVER_URL);
const panel: HTMLElement | null = element('live', HTMLElement);
if (server.kind === 'ok' && panel !== null) watch(panel, server.url);
