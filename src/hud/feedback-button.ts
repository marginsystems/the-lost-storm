import { el } from './dom.ts';

const BUBBLE: string =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8.2L7 20v-3.5H4.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z"/></svg>';

export function createFeedbackButton(parent: HTMLElement, track: (element: HTMLElement) => void, onClick: () => void): HTMLButtonElement {
  const button: HTMLButtonElement = el('button', 'hud-menu-btn hud-feedback-btn', parent);
  button.type = 'button';
  button.setAttribute('aria-label', 'Send feedback');
  button.innerHTML = BUBBLE;
  track(button);
  button.addEventListener('click', onClick);
  return button;
}
