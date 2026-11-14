import type { HudPanel } from './hud-api.ts';
import { panelPart, tagPart } from './hud-gate.ts';
import { el, label, setText } from './dom.ts';

export interface MenuButton {
  setActive(active: boolean): void;
  setBadge(count: number): void;
  setCalling(calling: boolean): void;
  setKey(key: string): void;
}

export function nextCalling(calling: boolean, before: number, now: number, open: boolean): boolean {
  if (now <= 0 || open) return false;
  return calling || now > before;
}

export function createMenuButton(parent: HTMLElement, panel: HudPanel, name: string, key: string, onClick: () => void, track: (element: HTMLElement) => void): MenuButton {
  const button: HTMLButtonElement = el('button', 'hud-menu-btn', parent);
  tagPart(button, panelPart(panel));
  button.type = 'button';
  button.setAttribute('aria-label', name);
  track(button);
  label('menu-name', name, button);
  const keyLabel: HTMLDivElement = label('menu-key', key, button);
  const badge: HTMLSpanElement = el('span', 'menu-badge', button);
  const badgeText: HTMLSpanElement = el('span', 'badge-pulse', badge);
  button.addEventListener('click', onClick);
  let active: boolean | null = null;
  let badged: boolean | null = null;
  let called: boolean = false;
  return {
    setCalling(next: boolean): void {
      if (next === called) return;
      called = next;
      button.classList.toggle('calling', next);
    },
    setKey(next: string): void {
      setText(keyLabel, next, true);
    },
    setActive(next: boolean): void {
      if (next === active) return;
      active = next;
      button.classList.toggle('open', next);
    },
    setBadge(count: number): void {
      const visible: boolean = count > 0;
      if (visible) setText(badgeText, String(count), true);
      if (visible !== badged) {
        badged = visible;
        badge.classList.toggle('visible', visible);
      }
    },
  };
}
