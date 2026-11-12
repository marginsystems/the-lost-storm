import type { ServiceKind } from '../../sim/content/trade-types.ts';
import type { HudContext, PanelView } from './context.ts';
import { markOverlay } from './overlay-mark.ts';
import type { OverlayManager } from './overlays.ts';
import { createStashPanel } from './stash-panel.ts';
import { createVendorPanel } from './vendor-panel.ts';

const TRADE_HUD = {
  gap: 10,
  edge: 16,
} as const;

export interface TradeHud {
  readonly panels: readonly PanelView[];
  update(): void;
}

export function createTradeHud(root: HTMLElement, context: HudContext, track: (element: HTMLElement) => void, overlays: OverlayManager, inventory: HTMLElement): TradeHud {
  const panels: Record<ServiceKind, PanelView> = {
    vendor: createVendorPanel(root, context),
    stash: createStashPanel(root, context),
  };
  for (const panel of Object.values(panels)) track(panel.element);
  let kind: ServiceKind = 'vendor';
  let openedInventory: boolean = false;
  let closing: boolean = false;

  const place = (next: ServiceKind): void => {
    if (next !== kind) {
      panels[kind].element.classList.remove('open');
      markOverlay(panels[kind].element, false);
    }
    kind = next;
    const view: PanelView = panels[kind];
    view.element.style.setProperty('--beside-right', `${TRADE_HUD.edge + inventory.offsetWidth + TRADE_HUD.gap}px`);
    view.refresh();
  };

  overlays.register('trade', {
    get element(): HTMLElement {
      return panels[kind].element;
    },
    show(): void {
      place(kind);
      panels[kind].element.classList.add('open');
      markOverlay(panels[kind].element, true);
    },
    hide(): void {
      panels[kind].element.classList.remove('open');
      markOverlay(panels[kind].element, false);
      context.tooltip.hide();
      if (context.api.world.service !== null) {
        closing = true;
        context.api.send({ type: 'trade', action: { type: 'close' } });
      }
      if (openedInventory) overlays.send({ type: 'close', id: 'inventory' });
      openedInventory = false;
    },
  });

  return {
    panels: Object.values(panels),
    update(): void {
      const next: ServiceKind | null = context.api.world.service?.kind ?? null;
      if (next === null) {
        closing = false;
        if (overlays.shown('trade')) overlays.send({ type: 'close', id: 'trade' });
        return;
      }
      if (closing) return;
      if (!overlays.shown('trade')) {
        kind = next;
        openedInventory = !overlays.shown('inventory');
        if (overlays.send({ type: 'open', id: 'trade' }) === 'refused') {
          openedInventory = false;
          closing = true;
          context.api.send({ type: 'trade', action: { type: 'close' } });
        }
        return;
      }
      if (next !== kind) {
        place(next);
        panels[kind].element.classList.add('open');
        markOverlay(panels[kind].element, true);
      } else {
        panels[kind].refresh();
      }
    },
  };
}
