import type { Tooltip } from './tooltip.ts';
import type { HudApi } from './hud-api.ts';

export interface HudContext {
  readonly api: HudApi;
  readonly tooltip: Tooltip;
}

export interface PanelView {
  readonly element: HTMLElement;
  refresh(): void;
}
