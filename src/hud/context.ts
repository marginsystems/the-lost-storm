import type { Tooltip } from './tooltip.ts';
import type { HudApi } from './hud-api.ts';
import type { SaleOffer } from './sale-offer.ts';

export interface HudContext {
  readonly api: HudApi;
  readonly tooltip: Tooltip;
  readonly sale: SaleOffer;
}

export interface PanelView {
  readonly element: HTMLElement;
  refresh(): void;
}
