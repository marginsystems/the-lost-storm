import { el, label } from '../hud/dom.ts';
import { thumbIcon } from './feedback-card.ts';
import type { Rating } from './alpha.ts';
import { ASK_PROMPT } from './ask-prompt.ts';
import askCss from './ask.css?inline';

export const ASK_VIEW = {
  styleId: 'ask-styles',
  on: 'on',
  off: 'off',
} as const;

export interface AskHooks {
  rate(rating: Rating): void;
  later(): void;
}

export interface AskView {
  setShown(shown: boolean): void;
}

function ensureStyles(): void {
  if (document.getElementById(ASK_VIEW.styleId) !== null) return;
  const style: HTMLStyleElement = el('style', '', document.head);
  style.id = ASK_VIEW.styleId;
  style.textContent = askCss;
}

function thumb(parent: HTMLElement, rating: Rating, hooks: AskHooks): void {
  const button: HTMLButtonElement = el('button', `ask-thumb ask-${rating}`, parent);
  button.type = 'button';
  button.setAttribute('aria-label', rating === 'up' ? 'Thumbs up' : 'Thumbs down');
  button.appendChild(thumbIcon());
  button.addEventListener('click', (): void => hooks.rate(rating));
}

export function createAskView(hud: HTMLElement, hooks: AskHooks): AskView {
  ensureStyles();
  const root: HTMLDivElement = el('div', 'ask-line', hud);
  root.setAttribute('role', 'status');
  root.dataset['shown'] = ASK_VIEW.off;
  root.inert = true;
  label('ask-text', ASK_PROMPT.line, root);
  const row: HTMLDivElement = el('div', 'ask-row', root);
  thumb(row, 'up', hooks);
  thumb(row, 'down', hooks);
  const later: HTMLButtonElement = el('button', 'ask-later', row);
  later.type = 'button';
  later.textContent = ASK_PROMPT.later;
  later.addEventListener('click', (): void => hooks.later());
  return {
    setShown(shown: boolean): void {
      const next: string = shown ? ASK_VIEW.on : ASK_VIEW.off;
      if (root.dataset['shown'] === next) return;
      root.dataset['shown'] = next;
      root.inert = !shown;
    },
  };
}
