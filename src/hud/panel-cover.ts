import type { HudPanel } from './hud-api.ts';

export const HUD_PANELS: readonly HudPanel[] = ['inventory', 'character', 'tree', 'map'];

export type PanelCover = 'side' | 'full' | 'none';

export const PANEL_COVER: Readonly<Record<HudPanel, PanelCover>> = {
  inventory: 'side',
  character: 'side',
  tree: 'none',
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

export const SHEET_PARTNER: HudPanel = 'inventory';

export function closedBy(panel: HudPanel, open: Readonly<Record<HudPanel, boolean>>, sheets: boolean): HudPanel[] {
  const opening: PanelCover = PANEL_COVER[panel];
  const displaced = (other: HudPanel): boolean => opening === 'full' || PANEL_COVER[other] === 'full' || (sheets && panel !== SHEET_PARTNER && other !== SHEET_PARTNER);
  return HUD_PANELS.filter((other: HudPanel): boolean => other !== panel && open[other] && displaced(other));
}

export function applyCover(root: HTMLElement, cover: CoverState): void {
  root.classList.toggle(COVER_CLASS.side, cover.side);
  root.classList.toggle(COVER_CLASS.full, cover.full);
}

export function sheetOverflow(open: Readonly<Record<HudPanel, boolean>>, latest: HudPanel | null): HudPanel[] {
  const sheets: HudPanel[] = HUD_PANELS.filter((panel: HudPanel): boolean => open[panel] && panel !== SHEET_PARTNER);
  const kept: HudPanel | undefined = latest !== null && sheets.includes(latest) ? latest : sheets[0];
  return sheets.filter((panel: HudPanel): boolean => panel !== kept);
}
