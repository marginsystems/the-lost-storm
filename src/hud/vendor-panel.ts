import type { NpcDef } from '../../sim/content/types.ts';
import { buyPrice, sellPrice } from '../../sim/world/trade.ts';
import type { ItemInstance, VendorStock, World } from '../../sim/world/types.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, setText } from './dom.ts';
import { iconSvg } from './icons.ts';
import type { ItemCell } from './item-cell.ts';
import { createItemCell, showItem } from './item-cell.ts';

interface PricedCell {
  readonly view: ItemCell;
  readonly price: HTMLElement;
}

function pricedCell(context: HudContext, parent: HTMLElement, verb: string, priceOf: (item: ItemInstance) => number, onClick: () => void): PricedCell {
  const view: ItemCell = createItemCell(context, parent, (item: ItemInstance): string => `Click to ${verb} for ${priceOf(item)} gold`);
  const price: HTMLDivElement = el('div', 'cell-price', view.cell);
  view.cell.addEventListener('click', (): void => {
    if (view.current === null) return;
    context.tooltip.hide();
    onClick();
  });
  return { view, price };
}

function showPriced(context: HudContext, cell: PricedCell, item: ItemInstance | null, price: number, gold: number): boolean {
  const changed: boolean = showItem(context, cell.view, item);
  setText(cell.price, item === null ? '' : String(price), changed);
  cell.price.classList.toggle('short', item !== null && price > gold);
  return changed;
}

export function createVendorPanel(parent: HTMLElement, context: HudContext): PanelView {
  const element: HTMLDivElement = el('div', 'hud-panel right beside trade-panel', parent);
  element.addEventListener('contextmenu', (event: MouseEvent): void => {
    event.preventDefault();
  });
  const head: HTMLDivElement = el('div', 'trade-head', element);
  const naming: HTMLDivElement = el('div', 'trade-naming', head);
  const title: HTMLDivElement = label('panel-title', '', naming);
  const role: HTMLDivElement = label('trade-role', '', naming);
  const purse: HTMLDivElement = el('div', 'trade-gold', head);
  el('span', 'gold-icon', purse).innerHTML = iconSvg('coin');
  const gold: HTMLSpanElement = el('span', 'gold-text', purse);
  const stockGrid: HTMLDivElement = el('div', 'inv-grid', element);
  label('panel-subtitle', 'Buy back', element);
  const backGrid: HTMLDivElement = el('div', 'inv-grid', element);

  const send = (action: { readonly type: 'buy' | 'buy_back'; readonly index: number }): void => {
    context.api.send({ type: 'trade', action });
  };
  const content = context.api.world.content;
  const stockCells: PricedCell[] = Array.from({ length: content.trade.stockSize }, (_: unknown, index: number): PricedCell =>
    pricedCell(context, stockGrid, 'buy', (item: ItemInstance): number => buyPrice(content, item), (): void => send({ type: 'buy', index })),
  );
  const backCells: PricedCell[] = Array.from({ length: content.trade.buybackSize }, (_: unknown, index: number): PricedCell =>
    pricedCell(context, backGrid, 'buy back', (item: ItemInstance): number => sellPrice(content, item), (): void => send({ type: 'buy_back', index })),
  );

  return {
    element,
    refresh(): void {
      const world: World = context.api.world;
      const owner: string | null = world.service?.kind === 'vendor' ? world.service.owner : null;
      const npc: NpcDef | null = owner === null ? null : (world.content.npcs.get(owner) ?? null);
      const stock: VendorStock | null = owner === null ? null : (world.vendors[owner] ?? null);
      if (npc !== null) {
        setText(title, npc.name, false);
        setText(role, npc.title, false);
      }
      const coins: number = world.player.gold;
      setText(gold, String(coins), true);
      let changed: boolean = false;
      for (const [index, cell] of stockCells.entries()) {
        const item: ItemInstance | null = stock?.stock[index] ?? null;
        if (showPriced(context, cell, item, item === null ? 0 : buyPrice(world.content, item), coins)) changed = true;
      }
      for (const [index, cell] of backCells.entries()) {
        const item: ItemInstance | null = stock?.buyback[index] ?? null;
        if (showPriced(context, cell, item, item === null ? 0 : sellPrice(world.content, item), coins)) changed = true;
      }
      if (changed) context.tooltip.hide();
    },
  };
}
