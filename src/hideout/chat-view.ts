import type { ChatLine } from '../backend/live-protocol.ts';
import { LIVE_LIMITS } from '../backend/live-protocol.ts';
import type { ChatEntry, ChatState } from './chat.ts';
import { CHAT_WORDS, destination, readers } from './chat.ts';
import { CHAT_KEYS, takesEnter } from './chat-keys.ts';
import type { Mutes } from './mute.ts';

export const CHAT_VIEW = {
  placeholder: 'Press Enter to talk',
  typingPlaceholder: 'Type a message, or /dm name',
  namePlaceholder: 'Your name',
  nameChars: 32,
  closeKey: 'Escape',
  swapMs: 320,
} as const;

export interface Submitted {
  readonly clear: boolean;
  readonly keepOpen: boolean;
}

export interface ChatViewOptions {
  readonly root: HTMLElement;
  readonly events: Window;
  readonly mutes: Mutes;
  submit(text: string): Submitted;
  canFocus(): boolean;
  rename(name: string): void;
  pick(name: string, line: ChatLine | null, anchor: HTMLElement): void;
  general(): void;
}

export interface ChatView {
  readonly friendsSlot: HTMLElement;
  show(open: boolean): void;
  render(state: ChatState): void;
  focus(): void;
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

function onControl(target: EventTarget | null): boolean {
  return target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement;
}

export function swapText(holder: HTMLElement, text: string): void {
  const current: Element | null = holder.querySelector('.swap:not(.leaving)');
  if (current?.textContent === text) return;
  if (current instanceof HTMLElement) {
    current.classList.add('leaving');
    window.setTimeout((): void => current.remove(), CHAT_VIEW.swapMs);
  }
  make('span', 'swap', holder).textContent = text;
}

interface Row {
  readonly entry: ChatEntry;
  readonly element: HTMLLIElement;
}

export function createChatView(options: ChatViewOptions): ChatView {
  const panel: HTMLDivElement = make('div', 'hideout-chat', options.root);
  const head: HTMLDivElement = make('div', 'chat-head', panel);
  const channels: HTMLDivElement = make('div', 'chat-channels', head);
  const general: HTMLButtonElement = make('button', 'chat-channel chat-general active', channels);
  general.type = 'button';
  general.textContent = CHAT_WORDS.general;
  general.setAttribute('aria-label', 'Back to General');
  const whisperTab: HTMLDivElement = make('div', 'chat-channel-slot', channels);
  const whisperName: HTMLSpanElement = make('span', 'chat-channel chat-whisper-tab', whisperTab);
  const friendsSlot: HTMLDivElement = make('div', 'chat-slot', head);
  const readerLine: HTMLDivElement = make('div', 'chat-readers', panel);
  const list: HTMLOListElement = make('ol', 'chat-lines', panel);
  const inputRow: HTMLDivElement = make('div', 'chat-input', panel);
  const to: HTMLSpanElement = make('span', 'chat-to', inputRow);
  const field: HTMLInputElement = make('input', 'chat-field', inputRow);
  field.type = 'text';
  field.maxLength = LIVE_LIMITS.sayChars + LIVE_LIMITS.nameChars + 8;
  field.placeholder = CHAT_VIEW.placeholder;
  field.autocomplete = 'off';
  field.spellcheck = false;
  const rows: Map<string, Row> = new Map<string, Row>();
  let open: boolean = false;
  swapText(to, destination({ kind: 'general' }));
  swapText(readerLine, 'Everyone online reads this.');

  const giveBack = (): void => {
    field.blur();
  };

  const applyMutes = (): void => {
    for (const row of rows.values()) row.element.classList.toggle('muted', row.entry.kind === 'line' && !row.entry.own && options.mutes.has(row.entry.line.name));
  };

  general.addEventListener('click', (): void => {
    options.general();
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

  const nameButton = (parent: HTMLElement, name: string, line: ChatLine | null): void => {
    const button: HTMLButtonElement = make('button', 'chat-name', parent);
    button.type = 'button';
    button.textContent = name;
    button.addEventListener('click', (): void => {
      options.pick(name, line, button);
    });
  };

  const rowFor = (entry: ChatEntry): HTMLLIElement => {
    switch (entry.kind) {
      case 'note': {
        const element: HTMLLIElement = make('li', `chat-row chat-note ${entry.note}`);
        const inner: HTMLDivElement = make('div', 'chat-row-inner', element);
        make('span', 'chat-text', inner).textContent = entry.text;
        if (entry.note === 'name') nameField(inner);
        return element;
      }
      case 'whisper': {
        const element: HTMLLIElement = make('li', `chat-row chat-whisper ${entry.dir}`);
        const inner: HTMLDivElement = make('div', 'chat-row-inner', element);
        make('span', 'chat-dir', inner).textContent = entry.dir === 'from' ? 'From' : 'To';
        nameButton(inner, entry.with, entry.dir === 'from' ? entry.line : null);
        make('span', 'chat-text', inner).textContent = entry.line.text;
        return element;
      }
      case 'line': {
        const element: HTMLLIElement = make('li', 'chat-row');
        const inner: HTMLDivElement = make('div', 'chat-row-inner', element);
        if (entry.own) make('span', 'chat-name own', inner).textContent = entry.line.name;
        else nameButton(inner, entry.line.name, entry.line);
        make('span', 'chat-text', inner).textContent = entry.line.text;
        return element;
      }
    }
    return make('li', 'chat-row');
  };

  const send = (): void => {
    const result: Submitted = options.submit(field.value);
    if (result.clear) field.value = '';
    if (!result.keepOpen) giveBack();
  };

  const stopKeys = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.type !== 'keydown') return;
    if (event.code === CHAT_VIEW.closeKey) {
      event.preventDefault();
      giveBack();
      return;
    }
    if (!CHAT_KEYS.enter.some((key: string): boolean => key === event.code)) return;
    event.preventDefault();
    send();
  };
  field.addEventListener('keydown', stopKeys);
  field.addEventListener('keyup', stopKeys);
  field.addEventListener('focus', (): void => {
    panel.classList.add('typing');
    field.placeholder = CHAT_VIEW.typingPlaceholder;
  });
  field.addEventListener('blur', (): void => {
    panel.classList.remove('typing');
    field.placeholder = CHAT_VIEW.placeholder;
  });

  options.events.addEventListener(
    'keydown',
    (event: KeyboardEvent): void => {
      if (!takesEnter({ code: event.code, repeat: event.repeat, taken: event.defaultPrevented, typing: typingIn(event.target), onControl: onControl(event.target) }, { shown: open, canFocus: options.canFocus() })) return;
      event.stopPropagation();
      window.setTimeout((): void => {
        if (open && !event.defaultPrevented) field.focus();
      }, CHAT_KEYS.settleMs);
    },
    { capture: true },
  );
  return {
    friendsSlot,
    show(next: boolean): void {
      if (next === open) return;
      open = next;
      panel.classList.toggle('open', next);
      if (!next) giveBack();
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
      const whispering: boolean = state.target.kind === 'whisper';
      general.classList.toggle('active', !whispering);
      whisperTab.classList.toggle('shown', whispering);
      if (state.target.kind === 'whisper') swapText(whisperName, state.target.name);
      panel.classList.toggle('whispering', whispering);
      swapText(readerLine, readers(state));
      swapText(to, destination(state.target));
    },
    focus(): void {
      if (open) field.focus();
    },
  };
}
