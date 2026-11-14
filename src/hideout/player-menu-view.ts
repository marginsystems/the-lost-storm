import type { ReportReason } from '../backend/api.ts';
import type { CloseReason, EntryId, MenuAction, MenuAnchor, MenuEntry, MenuFacts, MenuStep, Placed } from './player-menu.ts';
import { actionOf, cycle, menuEntries, placeMenu } from './player-menu.ts';

export const PLAYER_MENU_VIEW = {
  gap: 10,
  leaveMs: 320,
  closeKey: 'Escape',
  nextKeys: ['ArrowDown'],
  previousKeys: ['ArrowUp'],
  ownKeys: ['Escape', 'ArrowDown', 'ArrowUp', 'Enter', ' ', 'Tab'],
  openClass: 'open',
  belowClass: 'below',
} as const;

const REASONS: readonly { readonly reason: ReportReason; readonly label: string }[] = [
  { reason: 'abuse', label: 'Abuse' },
  { reason: 'spam', label: 'Spam' },
  { reason: 'other', label: 'Other' },
];

export interface MenuTarget {
  readonly name: string;
  readonly username: string | null;
}

export type ScreenSpot = MenuAnchor;

export type MenuChoice = MenuAction | { readonly type: 'block' } | { readonly type: 'report'; readonly reason: ReportReason };

export interface PlayerMenuViewOptions {
  readonly root: HTMLElement;
  readonly frame: HTMLElement;
  readonly events: Window;
  choose(choice: MenuChoice): void;
  closed(reason: CloseReason): void;
}

export interface PlayerMenuView {
  open(target: MenuTarget, facts: MenuFacts, anchor: ScreenSpot, focus: boolean): void;
  render(facts: MenuFacts): void;
  place(anchor: ScreenSpot): void;
  step(step: MenuStep): void;
  note(text: string | null): void;
  close(reason: CloseReason): void;
  isOpen(): boolean;
  takeCanvasPress(): boolean;
}

interface Item {
  readonly id: EntryId;
  readonly button: HTMLButtonElement;
  readonly label: HTMLSpanElement;
  readonly detail: HTMLSpanElement;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const made: HTMLElementTagNameMap[K] = document.createElement(tag);
  made.className = className;
  parent.append(made);
  return made;
}

function button(className: string, parent: HTMLElement): HTMLButtonElement {
  const made: HTMLButtonElement = make('button', className, parent);
  made.type = 'button';
  return made;
}

function owns(event: KeyboardEvent): boolean {
  return PLAYER_MENU_VIEW.ownKeys.some((key: string): boolean => key === event.key);
}

export function swapText(holder: HTMLElement, text: string): void {
  const current: Element | null = holder.querySelector('.pm-text:not(.leaving)');
  if (current?.textContent === text) return;
  if (current !== null) {
    current.classList.add('leaving');
    window.setTimeout((): void => current.remove(), PLAYER_MENU_VIEW.leaveMs);
  }
  if (text === '') return;
  const fresh: HTMLSpanElement = make('span', 'pm-text', holder);
  fresh.textContent = text;
}

export function createPlayerMenuView(options: PlayerMenuViewOptions): PlayerMenuView {
  const menu: HTMLDivElement = make('div', 'player-menu', options.root);
  menu.setAttribute('role', 'menu');
  menu.tabIndex = -1;
  const inner: HTMLDivElement = make('div', 'player-menu-inner', menu);
  const head: HTMLDivElement = make('div', 'player-menu-head', inner);
  const name: HTMLSpanElement = make('span', 'player-menu-name', head);
  const user: HTMLSpanElement = make('span', 'player-menu-user', head);
  const list: HTMLDivElement = make('div', 'player-menu-list', inner);
  const items: Item[] = [];
  const confirm: HTMLDivElement = make('div', 'player-menu-step confirm', inner);
  const confirmBody: HTMLDivElement = make('div', 'player-menu-step-body', confirm);
  const confirmText: HTMLSpanElement = make('span', 'player-menu-ask', confirmBody);
  const confirmRow: HTMLDivElement = make('div', 'player-menu-choices', confirmBody);
  const blockButton: HTMLButtonElement = button('player-menu-choice', confirmRow);
  blockButton.textContent = 'Block';
  const keepButton: HTMLButtonElement = button('player-menu-choice', confirmRow);
  keepButton.textContent = 'Cancel';
  const report: HTMLDivElement = make('div', 'player-menu-step report', inner);
  const reportBody: HTMLDivElement = make('div', 'player-menu-step-body', report);
  make('span', 'player-menu-ask', reportBody).textContent = 'What is wrong?';
  const reportRow: HTMLDivElement = make('div', 'player-menu-choices', reportBody);
  const reasonButtons: HTMLButtonElement[] = REASONS.map(({ reason, label }): HTMLButtonElement => {
    const made: HTMLButtonElement = button('player-menu-choice', reportRow);
    made.textContent = label;
    made.addEventListener('click', (): void => options.choose({ type: 'report', reason }));
    return made;
  });
  const noteBox: HTMLDivElement = make('div', 'player-menu-note', inner);
  const noteText: HTMLDivElement = make('div', 'player-menu-note-text', noteBox);
  let entries: readonly MenuEntry[] = [];
  let facts: MenuFacts | null = null;
  let open: boolean = false;
  let canvasPress: boolean = false;
  let current: MenuStep = 'entries';

  for (const id of ['message', 'trade', 'friend', 'mute', 'block', 'report'] as const) {
    const made: HTMLButtonElement = button('player-menu-item', list);
    made.setAttribute('role', 'menuitem');
    const label: HTMLSpanElement = make('span', 'pm-label', made);
    const detail: HTMLSpanElement = make('span', 'pm-detail', made);
    made.addEventListener('click', (): void => {
      const entry: MenuEntry | undefined = entries.find((candidate: MenuEntry): boolean => candidate.id === id);
      if (entry === undefined || facts === null) return;
      const action: MenuAction | null = actionOf(entry, facts);
      if (action !== null) options.choose(action);
    });
    items.push({ id, button: made, label, detail });
  }
  blockButton.addEventListener('click', (): void => options.choose({ type: 'block' }));
  keepButton.addEventListener('click', (): void => {
    view.step('entries');
  });

  const focusables = (): readonly HTMLButtonElement[] => {
    switch (current) {
      case 'entries':
        return items.filter((item: Item): boolean => !item.button.disabled).map((item: Item): HTMLButtonElement => item.button);
      case 'confirm_block':
        return [blockButton, keepButton];
      case 'report':
        return reasonButtons;
    }
    return [];
  };

  const focusFirst = (): void => {
    focusables()[0]?.focus({ preventScroll: true });
  };

  const giveBack = (): void => {
    const active: Element | null = document.activeElement;
    if (active instanceof HTMLElement && menu.contains(active)) active.blur();
  };

  menu.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (!owns(event)) return;
    event.stopPropagation();
    if (event.key === PLAYER_MENU_VIEW.closeKey) {
      event.preventDefault();
      if (current === 'entries') view.close('escape');
      else view.step('entries');
      return;
    }
    const forward: boolean = PLAYER_MENU_VIEW.nextKeys.some((key: string): boolean => key === event.key);
    const back: boolean = PLAYER_MENU_VIEW.previousKeys.some((key: string): boolean => key === event.key);
    if (!forward && !back) return;
    event.preventDefault();
    const buttons: readonly HTMLButtonElement[] = focusables();
    const at: number = buttons.findIndex((candidate: HTMLButtonElement): boolean => candidate === document.activeElement);
    buttons[cycle(buttons.length, at, forward ? 1 : -1)]?.focus({ preventScroll: true });
  });
  menu.addEventListener('keyup', (event: KeyboardEvent): void => {
    if (owns(event)) event.stopPropagation();
  });

  options.events.addEventListener(
    'keydown',
    (event: KeyboardEvent): void => {
      if (!open || event.key !== PLAYER_MENU_VIEW.closeKey || menu.contains(event.target instanceof Node ? event.target : null)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      view.close('escape');
    },
    { capture: true },
  );
  options.events.addEventListener(
    'pointerdown',
    (event: PointerEvent): void => {
      if (!open) {
        canvasPress = false;
        return;
      }
      if (event.target instanceof Node && menu.contains(event.target)) return;
      canvasPress = event.target instanceof HTMLCanvasElement;
      view.close('outside');
    },
    { capture: true },
  );

  const view: PlayerMenuView = {
    open(target: MenuTarget, next: MenuFacts, anchor: ScreenSpot, focus: boolean): void {
      swapText(name, target.name);
      swapText(user, target.username ?? '');
      current = 'confirm_block';
      view.step('entries');
      confirmText.textContent = `Block ${target.name}?`;
      view.note(null);
      view.render(next);
      open = true;
      menu.classList.add(PLAYER_MENU_VIEW.openClass);
      view.place(anchor);
      if (focus) focusFirst();
    },
    render(next: MenuFacts): void {
      facts = next;
      entries = menuEntries(next);
      for (const item of items) {
        const entry: MenuEntry | undefined = entries.find((candidate: MenuEntry): boolean => candidate.id === item.id);
        if (entry === undefined) continue;
        swapText(item.label, entry.label);
        swapText(item.detail, entry.detail);
        if (!entry.enabled && document.activeElement === item.button) menu.focus({ preventScroll: true });
        item.button.disabled = !entry.enabled;
        item.button.classList.toggle('soon', entry.soon);
      }
    },
    place(anchor: ScreenSpot): void {
      const base: DOMRect = options.root.getBoundingClientRect();
      const frame: DOMRect = options.frame.getBoundingClientRect();
      const placed: Placed = placeMenu({ x: anchor.x + frame.left - base.left, top: anchor.top + frame.top - base.top, bottom: anchor.bottom + frame.top - base.top }, { width: inner.offsetWidth, height: inner.offsetHeight }, { width: base.width, height: base.height }, PLAYER_MENU_VIEW.gap);
      menu.style.transform = `translate3d(${placed.left.toFixed(1)}px, ${placed.top.toFixed(1)}px, 0)`;
      menu.classList.toggle(PLAYER_MENU_VIEW.belowClass, placed.below);
    },
    step(next: MenuStep): void {
      if (next === current) return;
      current = next;
      confirm.classList.toggle('shown', next === 'confirm_block');
      report.classList.toggle('shown', next === 'report');
      list.classList.toggle('dim', next !== 'entries');
      for (const choice of [blockButton, keepButton]) choice.tabIndex = next === 'confirm_block' ? 0 : -1;
      for (const choice of reasonButtons) choice.tabIndex = next === 'report' ? 0 : -1;
      if (open) focusFirst();
    },
    note(text: string | null): void {
      noteBox.classList.toggle('shown', text !== null);
      if (text !== null) swapText(noteText, text);
    },
    close(reason: CloseReason): void {
      if (!open) return;
      open = false;
      giveBack();
      menu.classList.remove(PLAYER_MENU_VIEW.openClass);
      options.closed(reason);
    },
    isOpen(): boolean {
      return open;
    },
    takeCanvasPress(): boolean {
      const took: boolean = canvasPress;
      canvasPress = false;
      return took;
    },
  };
  return view;
}
