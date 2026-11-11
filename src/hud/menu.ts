import { el, label, setText } from './dom.ts';

export interface MenuButton {
  setActive(active: boolean): void;
  setBadge(count: number): void;
}

export function createMenuButton(parent: HTMLElement, name: string, key: string, onClick: () => void, track: (element: HTMLElement) => void): MenuButton {
  const button: HTMLButtonElement = el('button', 'hud-menu-btn', parent);
  button.type = 'button';
  track(button);
  label('menu-name', name, button);
  label('menu-key', `[${key}]`, button);
  const badge: HTMLSpanElement = el('span', 'menu-badge', button);
  const badgeText: HTMLSpanElement = el('span', 'badge-pulse', badge);
  button.addEventListener('click', onClick);
  let active: boolean | null = null;
  let badged: boolean | null = null;
  return {
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
