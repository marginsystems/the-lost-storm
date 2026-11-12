import type { HudPanel } from './hud-api.ts';

export const HUD_PANELS: readonly HudPanel[] = ['inventory', 'character', 'tree', 'map'];

export type PanelCover = 'side' | 'full' | 'none';

export const PANEL_COVER: Readonly<Record<HudPanel, PanelCover>> = {
  inventory: 'side',
  character: 'side',
  tree: 'full',
  map: 'full',
};

export const COVER_CLASS: Readonly<Record<Exclude<PanelCover, 'none'>, string>> = {
  side: 'hud-covered-side',
  full: 'hud-covered-full',
};

export interface CoverState {
  readonly side: boolean;
  readonly full: boolean;
}

export function coverOf(open: Readonly<Record<HudPanel, boolean>>): CoverState {
  const covers: ReadonlySet<PanelCover> = new Set<PanelCover>(HUD_PANELS.filter((panel: HudPanel): boolean => open[panel]).map((panel: HudPanel): PanelCover => PANEL_COVER[panel]));
  return { side: covers.has('side'), full: covers.has('full') };
}

export function applyCover(root: HTMLElement, cover: CoverState): void {
  root.classList.toggle(COVER_CLASS.side, cover.side);
  root.classList.toggle(COVER_CLASS.full, cover.full);
}
