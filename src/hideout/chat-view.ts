import type { ReportReason } from '../backend/api.ts';
import type { ChatLine } from '../backend/live-protocol.ts';
import { LIVE_LIMITS } from '../backend/live-protocol.ts';
import type { ChatEntry, ChatState } from './chat.ts';
import type { Mutes } from './mute.ts';

export const CHAT_VIEW = {
  placeholder: 'Press Enter to talk',
  namePlaceholder: 'Your name',
  nameChars: 32,
  enterKeys: ['Enter', 'NumpadEnter'],
  closeKey: 'Escape',
} as const;

const REASONS: readonly { readonly reason: ReportReason; readonly label: string }[] = [
  { reason: 'abuse', label: 'Abuse' },
  { reason: 'spam', label: 'Spam' },
  { reason: 'other', label: 'Other' },
];

export interface ChatViewOptions {
  readonly root: HTMLElement;
  readonly events: Window;
  readonly mutes: Mutes;
  say(text: string): boolean;
  canFocus(): boolean;
  report(line: ChatLine, reason: ReportReason): void;
  befriend(name: string): void;
  rename(name: string): void;
}

export interface ChatView {
  readonly friendsSlot: HTMLElement;
  show(open: boolean): void;
  render(state: ChatState): void;
  hideReport(): void;
  hideFriend(): void;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement | null = null): HTMLElementTagNameMap[K] {
  const made: HTMLElementTagNameMap[K] = document.createElement(tag);
  made.className = className;
  parent?.append(made);
  return made;
}

function typingIn(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

interface Row {
  readonly entry: ChatEntry;
  readonly element: HTMLLIElement;
}

export function createChatView(options: ChatViewOptions): ChatView {
  const panel: HTMLDivElement = make('div', 'hideout-chat', options.root);
  const friendsSlot: HTMLDivElement = make('div', 'chat-slot', panel);
  const list: HTMLOListElement = make('ol', 'chat-lines', panel);
  const field: HTMLInputElement = make('input', 'chat-field', panel);
  field.type = 'text';
  field.maxLength = LIVE_LIMITS.sayChars;
  field.placeholder = CHAT_VIEW.placeholder;
  field.autocomplete = 'off';
  field.spellcheck = false;
  const menu: HTMLDivElement = make('div', 'chat-menu', panel);
  const mute: HTMLButtonElement = make('button', 'chat-menu-item', menu);
  const reportItem: HTMLButtonElement = make('button', 'chat-menu-item', menu);
  reportItem.textContent = 'Report line';
  const reasons: HTMLDivElement = make('div', 'chat-reasons', menu);
  const reasonRow: HTMLDivElement = make('div', 'chat-reasons-row', reasons);
  const friend: HTMLButtonElement = make('button', 'chat-menu-item', menu);
  friend.textContent = 'Add friend';
  const rows: Map<string, Row> = new Map<string, Row>();
  let open: boolean = false;
  let target: Extract<ChatEntry, { readonly kind: 'line' }> | null = null;

  const giveBack = (): void => {
    field.blur();
  };

  const closeMenu = (): void => {
    menu.classList.remove('open', 'reasons-open');
    target = null;
  };

  for (const choice of REASONS) {
    const button: HTMLButtonElement = make('button', 'chat-reason', reasonRow);
    button.textContent = choice.label;
    button.addEventListener('click', (): void => {
      if (target !== null) options.report(target.line, choice.reason);
      closeMenu();
    });
  }

  const openMenu = (entry: Extract<ChatEntry, { readonly kind: 'line' }>, anchor: HTMLElement): void => {
    target = entry;
    mute.textContent = options.mutes.has(entry.line.name) ? 'Unmute' : 'Mute';
    menu.classList.remove('reasons-open');
    const panelBox: DOMRect = panel.getBoundingClientRect();
    const anchorBox: DOMRect = anchor.getBoundingClientRect();
    menu.style.left = `${(anchorBox.left - panelBox.left).toFixed(0)}px`;
    menu.style.bottom = `${(panelBox.bottom - anchorBox.top).toFixed(0)}px`;
    menu.classList.add('open');
  };

  const applyMutes = (): void => {
    for (const row of rows.values()) row.element.classList.toggle('muted', row.entry.kind === 'line' && !row.entry.own && options.mutes.has(row.entry.line.name));
  };

  mute.addEventListener('click', (): void => {
    if (target !== null) options.mutes.toggle(target.line.name);
    applyMutes();
    closeMenu();
  });
  reportItem.addEventListener('click', (): void => {
    menu.classList.add('reasons-open');
  });
  friend.addEventListener('click', (): void => {
    if (target !== null) options.befriend(target.line.name);
    closeMenu();
  });

  const nameField = (parent: HTMLElement): void => {
    const form: HTMLFormElement = make('form', 'chat-name-form', parent);
    const input: HTMLInputElement = make('input', 'chat-field chat-name-field', form);
    input.type = 'text';
    input.maxLength = CHAT_VIEW.nameChars;
    input.placeholder = CHAT_VIEW.namePlaceholder;
    input.autocomplete = 'off';
    const save: HTMLButtonElement = make('button', 'chat-reason', form);
    save.type = 'submit';
    save.textContent = 'Save';
    const stop = (event: KeyboardEvent): void => {
      event.stopPropagation();
      if (event.type === 'keydown' && event.code === CHAT_VIEW.closeKey) input.blur();
    };
    input.addEventListener('keydown', stop);
    input.addEventListener('keyup', stop);
    form.addEventListener('submit', (event: SubmitEvent): void => {
      event.preventDefault();
      const name: string = input.value.trim();
      if (name === '') return;
      input.blur();
      options.rename(name);
    });
  };

  const rowFor = (entry: ChatEntry): HTMLLIElement => {
    const element: HTMLLIElement = make('li', entry.kind === 'line' ? 'chat-row' : 'chat-row chat-note');
    const inner: HTMLDivElement = make('div', 'chat-row-inner', element);
    if (entry.kind === 'note') {
      make('span', 'chat-text', inner).textContent = entry.text;
      if (entry.note === 'name') nameField(inner);
      return element;
    }
    if (entry.own) make('span', 'chat-name own', inner).textContent = entry.line.name;
    else {
      const name: HTMLButtonElement = make('button', 'chat-name', inner);
      name.type = 'button';
      name.textContent = entry.line.name;
      name.addEventListener('click', (): void => {
        if (target?.key === entry.key && menu.classList.contains('open')) closeMenu();
        else openMenu(entry, name);
      });
    }
    make('span', 'chat-text', inner).textContent = entry.line.text;
    return element;
  };

  const stopKeys = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.type !== 'keydown') return;
    if (event.code === CHAT_VIEW.closeKey) {
      event.preventDefault();
      giveBack();
      return;
    }
    if (!CHAT_VIEW.enterKeys.some((key: string): boolean => key === event.code)) return;
    event.preventDefault();
    if (field.value.trim() !== '' && options.say(field.value)) field.value = '';
    giveBack();
  };
  field.addEventListener('keydown', stopKeys);
  field.addEventListener('keyup', stopKeys);
  field.addEventListener('focus', (): void => panel.classList.add('typing'));
  field.addEventListener('blur', (): void => panel.classList.remove('typing'));

  options.events.addEventListener(
    'keydown',
    (event: KeyboardEvent): void => {
      if (!open) return;
      if (event.code === CHAT_VIEW.closeKey && menu.classList.contains('open')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeMenu();
        return;
      }
      if (event.repeat || !CHAT_VIEW.enterKeys.some((key: string): boolean => key === event.code) || typingIn(event.target) || !options.canFocus()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      field.focus();
    },
    { capture: true },
  );
  options.events.addEventListener(
    'pointerdown',
    (event: PointerEvent): void => {
      if (menu.classList.contains('open') && !(event.target instanceof Node && menu.contains(event.target)) && !(event.target instanceof HTMLElement && event.target.classList.contains('chat-name'))) closeMenu();
    },
    { capture: true },
  );

  return {
    friendsSlot,
    show(next: boolean): void {
      if (next === open) return;
      open = next;
      panel.classList.toggle('open', next);
      if (!next) {
        giveBack();
        closeMenu();
      }
    },
    render(state: ChatState): void {
      const keys: ReadonlySet<string> = new Set<string>(state.entries.map((entry: ChatEntry): string => entry.key));
      for (const [key, row] of rows) {
        if (keys.has(key)) continue;
        row.element.remove();
        rows.delete(key);
      }
      for (const entry of state.entries) {
        if (rows.has(entry.key)) continue;
        const element: HTMLLIElement = rowFor(entry);
        rows.set(entry.key, { entry, element });
        list.append(element);
      }
      applyMutes();
    },
    hideReport(): void {
      reportItem.hidden = true;
    },
    hideFriend(): void {
      friend.hidden = true;
    },
  };
}
