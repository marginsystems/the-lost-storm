import type { FriendRow, FriendsState } from './friends.ts';
import { friendRows, friendsSummary } from './friends.ts';

export const FRIENDS_VIEW = { title: 'Friends', empty: 'No friends yet. Click a name in chat to add one.', leaveMs: 600 } as const;

export interface FriendsViewOptions {
  readonly slot: HTMLElement;
  accept(name: string): void;
  remove(name: string): void;
}

export interface FriendsView {
  render(state: FriendsState): void;
}

interface Shown {
  readonly row: FriendRow;
  readonly element: HTMLLIElement;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const made: HTMLElementTagNameMap[K] = document.createElement(tag);
  made.className = className;
  parent.append(made);
  return made;
}

function fadeOut(element: HTMLElement, className: string): void {
  element.classList.add(className);
  window.setTimeout((): void => element.remove(), FRIENDS_VIEW.leaveMs);
}

export function createFriendsView(options: FriendsViewOptions): FriendsView {
  const box: HTMLDivElement = make('div', 'friends', options.slot);
  const inner: HTMLDivElement = make('div', 'friends-inner', box);
  const header: HTMLButtonElement = make('button', 'friends-header', inner);
  header.type = 'button';
  make('span', 'friends-title', header).textContent = FRIENDS_VIEW.title;
  const summary: HTMLSpanElement = make('span', 'friends-summary', header);
  const body: HTMLDivElement = make('div', 'friends-body', inner);
  const bodyInner: HTMLDivElement = make('div', 'friends-body-inner', body);
  const list: HTMLUListElement = make('ul', 'friends-list', bodyInner);
  const empty: HTMLDivElement = make('div', 'friends-empty', bodyInner);
  make('span', 'friends-empty-text', empty).textContent = FRIENDS_VIEW.empty;
  const shown: Map<string, Shown> = new Map<string, Shown>();
  let said: string = '';

  header.addEventListener('click', (): void => {
    box.classList.toggle('expanded');
  });

  const action = (parent: HTMLElement, label: string, run: () => void): void => {
    const button: HTMLButtonElement = make('button', 'friends-action', parent);
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', (): void => {
      button.disabled = true;
      run();
    });
  };

  const rowFor = (row: FriendRow): HTMLLIElement => {
    const element: HTMLLIElement = document.createElement('li');
    element.className = `friends-row ${row.kind}`;
    const line: HTMLDivElement = make('div', 'friends-row-inner', element);
    make('span', 'friends-dot', line);
    make('span', 'friends-name', line).textContent = row.name;
    switch (row.kind) {
      case 'incoming':
        make('span', 'friends-note', line).textContent = 'asks to be friends';
        action(line, 'Accept', (): void => options.accept(row.name));
        action(line, 'Decline', (): void => options.remove(row.name));
        break;
      case 'outgoing':
        make('span', 'friends-note', line).textContent = 'request sent';
        action(line, 'Cancel', (): void => options.remove(row.name));
        break;
      case 'friend':
        break;
    }
    return element;
  };

  const tell = (text: string): void => {
    if (text === said) return;
    said = text;
    for (const old of summary.querySelectorAll('.friends-count:not(.leaving)')) if (old instanceof HTMLElement) fadeOut(old, 'leaving');
    if (text !== '') make('span', 'friends-count', summary).textContent = text;
  };

  return {
    render(state: FriendsState): void {
      box.classList.toggle('shown', state.available && state.list !== null);
      tell(friendsSummary(state.list));
      const rows: readonly FriendRow[] = friendRows(state.list);
      empty.classList.toggle('shown', state.list !== null && rows.length === 0);
      const keys: ReadonlySet<string> = new Set<string>(rows.map((row: FriendRow): string => row.key));
      for (const [key, old] of shown) {
        if (keys.has(key)) continue;
        shown.delete(key);
        fadeOut(old.element, 'leaving');
      }
      let before: HTMLLIElement | null = null;
      for (const row of rows.toReversed()) {
        const known: Shown | undefined = shown.get(row.key);
        const element: HTMLLIElement = known?.element ?? rowFor(row);
        if (known === undefined) {
          shown.set(row.key, { row, element });
          list.insertBefore(element, before);
        }
        element.classList.toggle('here', row.here);
        before = element;
      }
    },
  };
}
