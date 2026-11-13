import { el, label, retrigger, setText } from '../hud/dom.ts';
import { EMPTY_KEY, STRIP_TEXT } from './character-strip-model.ts';
import type { CardView } from './character-strip-model.ts';
import { NAME_RULES } from './lobby-model.ts';

export const STRIP = {
  litClass: 'lit',
  openClass: 'open',
  enteringClass: 'entering',
  shownClass: 'shown',
  heldClass: 'held',
} as const;

export interface StripActions {
  pick(key: string): void;
  create(name: string): Promise<string | null>;
  suggest(): string | null;
}

export interface CharacterStrip {
  readonly root: HTMLElement;
  render(cards: readonly CardView[]): void;
  setBusy(busy: boolean): void;
  close(): void;
}

interface CardParts {
  readonly button: HTMLButtonElement;
  readonly name: HTMLSpanElement;
  readonly detail: HTMLSpanElement;
  readonly note: HTMLSpanElement;
}

function button(parent: HTMLElement, className: string, text: string, onClick: () => void): HTMLButtonElement {
  const made: HTMLButtonElement = el('button', className, parent);
  made.type = 'button';
  made.textContent = text;
  made.addEventListener('click', onClick);
  return made;
}

function cardParts(made: HTMLButtonElement): CardParts {
  return {
    button: made,
    name: el('span', 'strip-name', made),
    detail: el('span', 'strip-detail', made),
    note: el('span', 'strip-note', made),
  };
}

export function createCharacterStrip(parent: HTMLElement, actions: StripActions): CharacterStrip {
  const root: HTMLElement = el('nav', 'lobby-strip', parent);
  root.setAttribute('aria-label', STRIP_TEXT.heading);
  const list: HTMLDivElement = el('div', 'strip-list', root);
  const cards: Map<string, CardParts> = new Map<string, CardParts>();
  let busy: boolean = false;
  let creating: boolean = false;

  const fresh: HTMLDivElement = el('div', 'strip-new', null);
  const freshCard: CardParts = cardParts(button(fresh, 'strip-card strip-empty', '', (): void => {
    if (busy || fresh.classList.contains(STRIP.heldClass)) return;
    if (fresh.classList.contains(STRIP.openClass)) close();
    else open();
  }));
  const form: HTMLFormElement = el('form', 'strip-form', fresh);
  form.noValidate = true;
  form.inert = true;
  const formInner: HTMLDivElement = el('div', 'strip-form-inner', form);
  const field: HTMLInputElement = el('input', 'strip-field', formInner);
  field.type = 'text';
  field.maxLength = NAME_RULES.max;
  field.placeholder = STRIP_TEXT.placeholder;
  field.autocomplete = 'off';
  field.spellcheck = false;
  field.setAttribute('aria-label', STRIP_TEXT.placeholder);
  const error: HTMLDivElement = label('strip-error', '', formInner);
  error.setAttribute('aria-live', 'polite');
  const row: HTMLDivElement = el('div', 'strip-form-row', formInner);
  const submit: HTMLButtonElement = el('button', 'lobby-link strip-create', row);
  submit.type = 'submit';
  submit.textContent = STRIP_TEXT.create;
  const choose: HTMLButtonElement = button(row, 'lobby-link', STRIP_TEXT.choose, (): void => {
    const picked: string | null = actions.suggest();
    if (picked === null) return;
    field.value = picked;
    retrigger(field, 'tick');
    showError(null);
    field.focus();
  });
  const cancel: HTMLButtonElement = button(row, 'lobby-link', STRIP_TEXT.cancel, (): void => close());

  const showError = (text: string | null): void => {
    if (text !== null) setText(error, text, false);
    error.classList.toggle(STRIP.shownClass, text !== null);
  };

  function open(): void {
    fresh.classList.add(STRIP.openClass);
    form.inert = false;
    freshCard.button.setAttribute('aria-expanded', 'true');
    showError(null);
    field.focus({ preventScroll: true });
  }

  function close(): void {
    if (!fresh.classList.contains(STRIP.openClass)) return;
    fresh.classList.remove(STRIP.openClass);
    form.inert = true;
    freshCard.button.setAttribute('aria-expanded', 'false');
    showError(null);
  }

  const send = async (): Promise<void> => {
    creating = true;
    submit.disabled = true;
    const problem: string | null = await actions.create(field.value);
    creating = false;
    submit.disabled = busy;
    showError(problem);
    if (problem !== null) field.focus();
  };
  form.addEventListener('submit', (event: SubmitEvent): void => {
    event.preventDefault();
    if (!busy && !creating) void send();
  });
  field.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
    freshCard.button.focus();
  });
  field.addEventListener('input', (): void => showError(null));

  const fill = (parts: CardParts, card: CardView): void => {
    setText(parts.name, card.name, false);
    setText(parts.detail, card.detail, true);
    setText(parts.note, card.note ?? '', false);
    parts.note.classList.toggle(STRIP.shownClass, card.note !== null);
  };

  return {
    root,
    render(next: readonly CardView[]): void {
      const keep: Set<string> = new Set<string>(next.filter((card: CardView): boolean => card.kind === 'character').map((card: CardView): string => card.key));
      for (const [key, parts] of cards) {
        if (keep.has(key)) continue;
        cards.delete(key);
        parts.button.remove();
      }
      for (const card of next) {
        switch (card.kind) {
          case 'character': {
            const known: CardParts | undefined = cards.get(card.key);
            const parts: CardParts =
              known ??
              cardParts(
                button(list, `strip-card ${STRIP.enteringClass}`, '', (): void => {
                  if (!busy && !parts.button.classList.contains(STRIP.litClass)) actions.pick(card.key);
                }),
              );
            cards.set(card.key, parts);
            fill(parts, card);
            parts.button.classList.toggle(STRIP.litClass, card.active);
            parts.button.setAttribute('aria-current', String(card.active));
            list.append(parts.button);
            break;
          }
          case 'empty':
            fill(freshCard, card);
            fresh.classList.toggle(STRIP.heldClass, !card.open);
            freshCard.button.setAttribute('aria-disabled', String(!card.open));
            if (!card.open) close();
            list.append(fresh);
            break;
        }
      }
      if (!next.some((card: CardView): boolean => card.key === EMPTY_KEY)) {
        close();
        fresh.remove();
      }
      list.getBoundingClientRect();
      for (const parts of cards.values()) parts.button.classList.remove(STRIP.enteringClass);
    },
    setBusy(next: boolean): void {
      busy = next;
      root.classList.toggle('busy', next);
      for (const control of [submit, choose, cancel]) control.disabled = next || (control === submit && creating);
      field.disabled = next;
    },
    close,
  };
}
