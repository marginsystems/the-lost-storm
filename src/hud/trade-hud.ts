import type { ServiceKind } from '../../sim/content/types.ts';
import type { HudContext, PanelView } from './context.ts';
import { createStashPanel } from './stash-panel.ts';
import { createVendorPanel } from './vendor-panel.ts';

const TRADE_HUD = {
  gap: 10,
  edge: 16,
} as const;

export interface InventoryControl {
  readonly element: HTMLElement;
  isOpen(): boolean;
  setOpen(open: boolean): void;
  besideOpen(): boolean;
  closeBeside(): void;
}

export interface TradeHud {
  update(): void;
  close(): boolean;
}

export function createTradeHud(root: HTMLElement, context: HudContext, track: (element: HTMLElement) => void, inventory: InventoryControl): TradeHud {
  const panels: Record<ServiceKind, PanelView> = {
    vendor: createVendorPanel(root, context),
    stash: createStashPanel(root, context),
  };
  for (const panel of Object.values(panels)) track(panel.element);
  let shown: ServiceKind | null = null;
  let openedInventory: boolean = false;
  let closing: boolean = false;

  const show = (next: ServiceKind | null): void => {
    if (shown !== null) panels[shown].element.classList.remove('open');
    if (next === null) {
      context.tooltip.hide();
      if (openedInventory && inventory.isOpen()) inventory.setOpen(false);
      openedInventory = false;
    } else {
      inventory.closeBeside();
      if (shown === null) {
        openedInventory = !inventory.isOpen();
        if (openedInventory) inventory.setOpen(true);
        else context.api.playUi('panel_open');
      }
      const view: PanelView = panels[next];
      view.element.style.right = `${TRADE_HUD.edge + inventory.element.offsetWidth + TRADE_HUD.gap}px`;
      view.refresh();
      view.element.classList.add('open');
    }
    shown = next;
  };

  const close = (): boolean => {
    if (context.api.world.service === null && shown === null) return false;
    context.api.send({ type: 'trade', action: { type: 'close' } });
    closing = true;
    show(null);
    return true;
  };

  return {
    update(): void {
      const next: ServiceKind | null = context.api.world.service?.kind ?? null;
      if (closing && next !== null) return;
      closing = false;
      if (next !== shown) show(next);
      if (shown === null) return;
      if (inventory.besideOpen()) close();
      else panels[shown].refresh();
    },
    close,
  };
}
