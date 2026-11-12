import type { BoardRow } from '../backend/api.ts';
import { el, setText } from '../hud/dom.ts';
import { rankText } from './lobby-model.ts';

export interface BoardView {
  render(rows: readonly BoardRow[], you: string | null): void;
}

interface RowParts {
  readonly item: HTMLLIElement;
  readonly rank: HTMLSpanElement;
  readonly dot: HTMLSpanElement;
  readonly name: HTMLSpanElement;
  readonly level: HTMLSpanElement;
}

export const BOARD_MOTION: { readonly leaveMs: number } = { leaveMs: 520 };

function makeRow(list: HTMLOListElement): RowParts {
  const item: HTMLLIElement = el('li', 'board-row entering', list);
  const rank: HTMLSpanElement = el('span', 'board-rank', item);
  const dot: HTMLSpanElement = el('span', 'board-dot', item);
  const name: HTMLSpanElement = el('span', 'board-name', item);
  const level: HTMLSpanElement = el('span', 'board-level', item);
  return { item, rank, dot, name, level };
}

function fill(parts: RowParts, row: BoardRow, you: string | null, animate: boolean): void {
  setText(parts.rank, rankText(row.rank), animate);
  setText(parts.name, row.name, false);
  setText(parts.level, String(row.level), animate);
  parts.item.title = `${row.name} · level ${row.level} · ${row.furthest}`;
  parts.dot.classList.toggle('on', row.online);
  parts.item.classList.toggle('you', row.name === you);
}

export function createBoardView(list: HTMLOListElement, slots: number): BoardView {
  const rows: Map<string, RowParts> = new Map<string, RowParts>();
  const blanks: HTMLLIElement[] = [];

  for (let index: number = 0; index < slots; index += 1) blanks.push(el('li', 'board-row blank', list));

  const leave = (parts: RowParts, top: number): void => {
    parts.item.classList.add('leaving');
    parts.item.style.top = `${top}px`;
    window.setTimeout((): void => {
      parts.item.remove();
    }, BOARD_MOTION.leaveMs);
  };

  return {
    render(next: readonly BoardRow[], you: string | null): void {
      const shown: readonly BoardRow[] = next.slice(0, slots);
      const before: Map<HTMLLIElement, number> = new Map<HTMLLIElement, number>();
      for (const parts of rows.values()) before.set(parts.item, parts.item.offsetTop);
      const keep: Set<string> = new Set<string>(shown.map((row: BoardRow): string => row.name));
      for (const [name, parts] of rows) {
        if (keep.has(name)) continue;
        rows.delete(name);
        leave(parts, before.get(parts.item) ?? 0);
      }
      for (const row of shown) {
        const existing: RowParts | undefined = rows.get(row.name);
        const parts: RowParts = existing ?? makeRow(list);
        rows.set(row.name, parts);
        fill(parts, row, you, existing !== undefined);
        list.appendChild(parts.item);
      }
      blanks.forEach((blank: HTMLLIElement, index: number): void => {
        blank.classList.toggle('filled', index < shown.length);
        list.appendChild(blank);
      });
      for (const parts of rows.values()) {
        const from: number | undefined = before.get(parts.item);
        const delta: number = from === undefined ? 0 : from - parts.item.offsetTop;
        if (delta === 0) continue;
        parts.item.classList.add('flip');
        parts.item.style.transform = `translateY(${delta}px)`;
      }
      list.getBoundingClientRect();
      for (const parts of rows.values()) {
        parts.item.classList.remove('flip', 'entering');
        parts.item.style.transform = '';
      }
    },
  };
}
