import { el } from '../hud/dom.ts';
import type { Rating } from './alpha.ts';
import { ALPHA } from './alpha.ts';
import type { OutboundLink } from './links.ts';
import type { SendResult } from './launch-loop.ts';
import cardCss from './feedback.css?inline';

export type CardMode = 'end' | 'ask';

export interface CardHooks {
  readonly links: readonly OutboundLink[];
  readonly site: string;
  readonly send: ((rating: Rating, text: string) => Promise<SendResult>) | null;
}

export interface FeedbackCard {
  readonly isOpen: boolean;
  open(mode: CardMode): void;
  close(): void;
}

const COPY: Readonly<Record<CardMode, { readonly title: string; readonly line: string; readonly done: string }>> = {
  end: { title: 'End of the alpha', line: 'More is coming.', done: 'Keep playing' },
  ask: { title: 'Feedback', line: 'What do you think of the alpha so far?', done: 'Close' },
};

const THANKS: Readonly<Record<SendResult, string>> = {
  sent: 'Thank you. It reached us.',
  queued: 'Thank you. It will be sent when the connection is back.',
  rejected: 'Thank you. It could not be sent, sorry.',
};

const THUMB_PATH: string = 'M7 10v10M7 10l4-7c1.2 0 2 .9 2 2v3h5.2c1.1 0 1.9 1 1.7 2.1l-1.4 7.2c-.2.9-.9 1.7-1.9 1.7H7';
const SVG_NS = 'http://www.w3.org/2000/svg' as const;

function thumb(parent: HTMLElement, rating: Rating): HTMLButtonElement {
  const button: HTMLButtonElement = el('button', `fb-thumb fb-${rating}`, parent);
  button.type = 'button';
  button.dataset['rating'] = rating;
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', rating === 'up' ? 'Thumbs up' : 'Thumbs down');
  const svg: SVGSVGElement = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path: SVGPathElement = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', THUMB_PATH);
  svg.appendChild(path);
  button.appendChild(svg);
  return button;
}

function stopTyping(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement) event.stopPropagation();
}

function keepKeysInside(root: HTMLElement): void {
  const stop: (event: KeyboardEvent) => void = stopTyping;
  root.addEventListener('keydown', stop);
  root.addEventListener('keyup', stop);
}

const STYLE_ID: string = 'fb-style';

function addStyle(): void {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style: HTMLStyleElement = el('style', '', document.head);
  style.id = STYLE_ID;
  style.textContent = cardCss;
}

export function createFeedbackCard(root: HTMLElement, name: string, hooks: CardHooks): FeedbackCard {
  addStyle();
  const card: HTMLElement = el('section', 'fb', root);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-labelledby', `fb-title-${name}`);
  card.dataset['step'] = hooks.send === null ? 'thanks' : 'ask';
  if (hooks.send === null) card.classList.add('fb-links-only');
  const close: HTMLButtonElement = el('button', 'fb-close', card);
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  const title: HTMLHeadingElement = el('h2', 'fb-title', card);
  title.id = `fb-title-${name}`;
  const line: HTMLParagraphElement = el('p', 'fb-line', card);
  const stack: HTMLDivElement = el('div', 'fb-stack', card);

  const ask: HTMLFormElement = el('form', 'fb-view fb-ask', stack);
  ask.noValidate = true;
  const rate: HTMLDivElement = el('div', 'fb-rate', ask);
  rate.setAttribute('role', 'group');
  rate.setAttribute('aria-label', 'Did you like it?');
  const up: HTMLButtonElement = thumb(rate, 'up');
  const down: HTMLButtonElement = thumb(rate, 'down');
  const input: HTMLInputElement = el('input', 'fb-text', ask);
  input.type = 'text';
  input.maxLength = ALPHA.textChars;
  input.placeholder = 'Anything to tell us? (optional)';
  input.setAttribute('aria-label', 'Anything to tell us? (optional)');
  input.autocomplete = 'off';
  const sendButton: HTMLButtonElement = el('button', 'fb-send', ask);
  sendButton.type = 'submit';
  sendButton.textContent = 'Send';
  sendButton.disabled = true;

  const thanks: HTMLDivElement = el('div', 'fb-view fb-thanks', stack);
  const thanksLine: HTMLParagraphElement = el('p', 'fb-thanks-line', thanks);
  thanksLine.setAttribute('aria-live', 'polite');
  const row: HTMLParagraphElement = el('p', 'fb-links', thanks);
  for (const link of hooks.links) {
    const anchor: HTMLAnchorElement = el('a', `fb-link fb-link-${link.id}`, row);
    anchor.href = link.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.textContent = link.id === 'discord' ? 'Join the Discord' : link.label;
  }
  const copy: HTMLButtonElement = el('button', 'fb-copy', row);
  copy.type = 'button';
  el('span', 'fb-copy-idle', copy).textContent = 'Copy link';
  const copied: HTMLSpanElement = el('span', 'fb-copy-done', copy);
  copied.textContent = 'Copied';
  copied.setAttribute('aria-hidden', 'true');
  const copyLink = async (): Promise<void> => {
    await navigator.clipboard.writeText(hooks.site);
    copy.classList.add('copied');
  };
  copy.addEventListener('click', (): void => {
    copyLink().catch((): void => undefined);
  });
  const done: HTMLButtonElement = el('button', 'fb-done', thanks);
  done.type = 'button';
  keepKeysInside(card);

  let isOpen: boolean = false;
  let rating: Rating | null = null;
  let sending: boolean = false;

  const pick = (next: Rating): void => {
    rating = next;
    up.setAttribute('aria-pressed', String(next === 'up'));
    down.setAttribute('aria-pressed', String(next === 'down'));
    sendButton.disabled = sending;
  };
  up.addEventListener('click', (): void => pick('up'));
  down.addEventListener('click', (): void => pick('down'));

  const reset = (): void => {
    rating = null;
    up.setAttribute('aria-pressed', 'false');
    down.setAttribute('aria-pressed', 'false');
    input.value = '';
    sendButton.disabled = true;
    card.dataset['step'] = hooks.send === null ? 'thanks' : 'ask';
    copy.classList.remove('copied');
  };

  const api: FeedbackCard = {
    get isOpen(): boolean {
      return isOpen;
    },
    open(mode: CardMode): void {
      if (!sending) reset();
      title.textContent = COPY[mode].title;
      line.textContent = COPY[mode].line;
      done.textContent = COPY[mode].done;
      card.dataset['mode'] = mode;
      isOpen = true;
      card.classList.add('open');
    },
    close(): void {
      if (!isOpen) return;
      isOpen = false;
      card.classList.remove('open');
      if (document.activeElement instanceof HTMLElement && card.contains(document.activeElement)) document.activeElement.blur();
    },
  };

  const deliver = async (send: (rating: Rating, text: string) => Promise<SendResult>, chosen: Rating): Promise<void> => {
    const result: SendResult = await send(chosen, input.value);
    sending = false;
    thanksLine.textContent = THANKS[result];
    card.dataset['step'] = 'thanks';
  };

  ask.addEventListener('submit', (event: SubmitEvent): void => {
    event.preventDefault();
    if (rating === null || sending || hooks.send === null) return;
    sending = true;
    sendButton.disabled = true;
    void deliver(hooks.send, rating);
  });
  close.addEventListener('click', (): void => api.close());
  done.addEventListener('click', (): void => api.close());
  card.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.code !== 'Escape') return;
    event.stopPropagation();
    api.close();
  });
  return api;
}
