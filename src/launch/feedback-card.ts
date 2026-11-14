import { el } from '../hud/dom.ts';
import { markOverlay } from '../hud/overlay-mark.ts';
import type { Rating } from './alpha.ts';
import { ALPHA } from './alpha.ts';
import type { OutboundLink } from './links.ts';
import type { Timers } from '../backend/backend.ts';
import { armed, EMPTY_PENDING, stepPending } from './feedback-pending.ts';
import type { Pending, PendingEvent, PendingPost, PendingStep } from './feedback-pending.ts';
import type { SendResult } from './launch-loop.ts';
import cardCss from './feedback.css?inline';

export type CardMode = 'end' | 'ask';

export interface CardHooks {
  readonly links: readonly OutboundLink[];
  readonly site: string;
  readonly send: ((rating: Rating, text: string) => Promise<SendResult>) | null;
  readonly timers: Timers;
}

export interface FeedbackCard {
  readonly isOpen: boolean;
  open(mode: CardMode, preset?: Rating): void;
  close(): void;
}

const COPY: Readonly<Record<CardMode, { readonly title: string; readonly line: string; readonly done: string }>> = {
  end: { title: 'End of the alpha', line: 'More is coming. How was it?', done: 'Keep playing' },
  ask: { title: 'Feedback', line: 'What do you think of the alpha so far?', done: 'Close' },
};

const NOTES: Readonly<Record<SendResult, string>> = {
  sent: '',
  queued: 'It sends when you are online.',
  rejected: 'It could not be sent, sorry.',
};

const THANKS_LINE: string = 'Thank you.';

const THUMB_PATH: string = 'M7 10v10M7 10l4-7c1.2 0 2 .9 2 2v3h5.2c1.1 0 1.9 1 1.7 2.1l-1.4 7.2c-.2.9-.9 1.7-1.9 1.7H7';
const SVG_NS = 'http://www.w3.org/2000/svg' as const;

export function thumbIcon(): SVGSVGElement {
  const svg: SVGSVGElement = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path: SVGPathElement = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', THUMB_PATH);
  svg.appendChild(path);
  return svg;
}

function thumb(parent: HTMLElement, rating: Rating): HTMLButtonElement {
  const button: HTMLButtonElement = el('button', `fb-thumb fb-${rating}`, parent);
  button.type = 'button';
  button.dataset['rating'] = rating;
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute('aria-label', rating === 'up' ? 'Thumbs up' : 'Thumbs down');
  button.appendChild(thumbIcon());
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

  const rate: HTMLDivElement = el('div', 'fb-rate', card);
  rate.setAttribute('role', 'group');
  rate.setAttribute('aria-label', 'Did you like it?');
  const up: HTMLButtonElement = thumb(rate, 'up');
  const down: HTMLButtonElement = thumb(rate, 'down');
  const stack: HTMLDivElement = el('div', 'fb-stack', card);

  const thanks: HTMLDivElement = el('div', 'fb-view fb-thanks', stack);
  const thanksLine: HTMLParagraphElement = el('p', 'fb-thanks-line', thanks);
  thanksLine.textContent = THANKS_LINE;
  const note: HTMLParagraphElement = el('p', 'fb-note', thanks);
  note.setAttribute('aria-live', 'polite');
  const follow: HTMLFormElement = el('form', 'fb-follow', thanks);
  follow.noValidate = true;
  const input: HTMLInputElement = el('input', 'fb-text', follow);
  input.type = 'text';
  input.maxLength = ALPHA.textChars;
  input.placeholder = 'Anything to add? (optional)';
  input.setAttribute('aria-label', 'Anything to add? (optional)');
  input.autocomplete = 'off';
  const sendButton: HTMLButtonElement = el('button', 'fb-send', follow);
  sendButton.type = 'submit';
  sendButton.textContent = 'Send';
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
  let pending: Pending = EMPTY_PENDING;
  let generation: number = 0;
  let cancelIdle: (() => void) | null = null;

  const showNote = (result: SendResult): void => {
    note.textContent = NOTES[result];
    card.classList.toggle('fb-noted', NOTES[result] !== '');
  };

  const post = (body: PendingPost): void => {
    const send: ((rating: Rating, text: string) => Promise<SendResult>) | null = hooks.send;
    if (send === null) return;
    const mine: number = generation;
    card.classList.add('fb-added');
    up.disabled = true;
    down.disabled = true;
    void send(body.rating, body.text).then((result: SendResult): SendResult => {
      if (mine === generation) showNote(result);
      return result;
    });
  };

  const dispatch = (event: PendingEvent): void => {
    const step: PendingStep = stepPending(pending, event);
    pending = step.pending;
    cancelIdle?.();
    cancelIdle = armed(pending) ? hooks.timers.after(ALPHA.quietMs, (): void => dispatch({ kind: 'idle' })) : null;
    if (step.post !== null) post(step.post);
  };

  const rated = (chosen: Rating): void => {
    if (hooks.send === null || pending.posted) return;
    dispatch({ kind: 'rate', rating: chosen });
    up.setAttribute('aria-pressed', String(chosen === 'up'));
    down.setAttribute('aria-pressed', String(chosen === 'down'));
    card.classList.add('fb-sent');
    card.dataset['step'] = 'thanks';
  };
  up.addEventListener('click', (): void => rated('up'));
  down.addEventListener('click', (): void => rated('down'));
  input.addEventListener('input', (): void => dispatch({ kind: 'type', text: input.value }));
  follow.addEventListener('submit', (event: SubmitEvent): void => {
    event.preventDefault();
    dispatch({ kind: 'submit' });
  });
  const hidePage = (): void => {
    if (document.hidden) dispatch({ kind: 'hide' });
  };
  document.addEventListener('visibilitychange', hidePage);
  window.addEventListener('pagehide', (): void => dispatch({ kind: 'hide' }));

  const reset = (): void => {
    generation += 1;
    pending = EMPTY_PENDING;
    cancelIdle?.();
    cancelIdle = null;
    up.setAttribute('aria-pressed', 'false');
    down.setAttribute('aria-pressed', 'false');
    up.disabled = false;
    down.disabled = false;
    input.value = '';
    note.textContent = '';
    card.dataset['step'] = hooks.send === null ? 'thanks' : 'ask';
    card.classList.remove('fb-sent', 'fb-noted', 'fb-added');
    copy.classList.remove('copied');
  };

  const api: FeedbackCard = {
    get isOpen(): boolean {
      return isOpen;
    },
    open(mode: CardMode, preset?: Rating): void {
      reset();
      title.textContent = COPY[mode].title;
      line.textContent = COPY[mode].line;
      done.textContent = COPY[mode].done;
      card.dataset['mode'] = mode;
      isOpen = true;
      card.classList.add('open');
      markOverlay(card, true);
      if (preset !== undefined) rated(preset);
    },
    close(): void {
      if (!isOpen) return;
      isOpen = false;
      dispatch({ kind: 'close' });
      card.classList.remove('open');
      markOverlay(card, false);
      if (document.activeElement instanceof HTMLElement && card.contains(document.activeElement)) document.activeElement.blur();
    },
  };

  card.addEventListener('transitionend', (event: TransitionEvent): void => {
    if (event.target === card && event.propertyName === 'opacity' && !isOpen) reset();
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
