import type { HudFit } from './hud-fit.ts';
import { hudFit } from './hud-fit.ts';

export const FIT_VIEW = {
  touchClass: 'touch',
} as const;

function applyFit(root: HTMLElement, fit: HudFit | null): void {
  root.classList.toggle('fit', fit !== null);
  root.classList.toggle('fit-keys', fit?.labels === 'keys');
  root.classList.toggle('fit-stacked', fit?.stacked === true);
  root.classList.toggle('fit-sheets', fit?.sheets === true);
  root.classList.toggle('fit-tall', fit !== null && !fit.wide);
  root.style.setProperty('--hud-s', String(fit?.scale ?? 1));
  root.style.setProperty('--hud-cluster-h', `${fit?.clusterHeight ?? 0}px`);
  root.style.setProperty('--hud-lift', `${fit?.lift ?? 0}px`);
  if (fit === null) {
    root.style.removeProperty('--hud-cluster-h');
    root.style.removeProperty('--fit-minimap');
    root.style.removeProperty('--fit-quests');
    return;
  }
  root.style.setProperty('--fit-minimap', `${fit.minimap}px`);
  root.style.setProperty('--fit-quests', `${fit.quests}px`);
}

export interface FitWatch {
  onSheets(listener: () => void): void;
}

export function watchFit(root: HTMLElement): FitWatch {
  const listeners: (() => void)[] = [];
  let sheets: boolean = false;
  const update = (): void => {
    const touch: boolean = document.body.classList.contains(FIT_VIEW.touchClass);
    const fit: HudFit | null = touch ? null : hudFit(root.clientWidth, root.clientHeight);
    applyFit(root, fit);
    const next: boolean = fit?.sheets === true;
    if (next && !sheets) for (const listener of listeners) listener();
    sheets = next;
  };
  new ResizeObserver(update).observe(root);
  new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  update();
  return {
    onSheets(listener: () => void): void {
      listeners.push(listener);
      if (sheets) listener();
    },
  };
}
