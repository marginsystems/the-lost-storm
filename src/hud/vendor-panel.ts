import type { NpcDef } from '../../sim/content/types.ts';
import { itemName, rarityOf } from '../../sim/items.ts';
import { shownTitle } from './npc-title.ts';
import { buyPrice, sellPrice } from '../../sim/world/trade.ts';
import type { Command, ItemInstance, VendorStock, World } from '../../sim/world/types.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, retrigger, setText } from './dom.ts';
import { iconSvg } from './icons.ts';
import type { ItemCell } from './item-cell.ts';
import { createItemCell, showItem } from './item-cell.ts';
import { promptText, use } from './prompts.ts';
import { offeredItem, SALE_WORDS, saleCommand, saleEmptyText } from './trade-actions.ts';

const SALE_HINT: string = 'take back';

interface PricedCell {
  readonly view: ItemCell;
  readonly price: HTMLElement;
}

function pricedCell(context: HudContext, parent: HTMLElement, verb: string, priceOf: (item: ItemInstance) => number, onClick: () => void): PricedCell {
  const view: ItemCell = createItemCell(context, parent, (item: ItemInstance): string => promptText(context.api.touch, use(`${verb} for ${priceOf(item)} gold`)));
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
  element.dataset['tab'] = 'Shop';
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
  label('panel-subtitle', 'Sell', element);
  const sale: HTMLDivElement = el('div', 'trade-sale', element);
  const saleCell: ItemCell = createItemCell(context, sale, (): string => promptText(context.api.touch, use(SALE_HINT)));
  const saleSide: HTMLDivElement = el('div', 'trade-sale-side', sale);
  const saleText: HTMLDivElement = label('trade-sale-text', '', saleSide);
  const sellButton: HTMLButtonElement = el('button', 'trade-sell', saleSide);
  sellButton.type = 'button';
  saleCell.cell.addEventListener('click', (): void => {
    if (saleCell.current === null) return;
    context.tooltip.hide();
    context.sale.set(null);
  });
  sellButton.addEventListener('click', (event: MouseEvent): void => {
    event.stopPropagation();
    const command: Command | null = saleCommand(context.api.world, context.sale.uid());
    if (command === null) {
      retrigger(sellButton, 'deny');
      return;
    }
    context.sale.set(null);
    context.api.send(command);
  });

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
        setText(role, shownTitle(npc), false);
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
      const offered: ItemInstance | null = offeredItem(world, context.sale.uid());
      if (offered === null) context.sale.set(null);
      if (showItem(context, saleCell, offered)) changed = true;
      const wasShown: boolean = sellButton.classList.contains('shown');
      sale.classList.toggle('offering', offered !== null);
      sellButton.classList.toggle('shown', offered !== null);
      if (offered === null) {
        setText(saleText, saleEmptyText(context.api.touch), true);
        saleText.style.removeProperty('--rarity');
      } else {
        setText(saleText, itemName(world.content, offered), true);
        saleText.style.setProperty('--rarity', rarityOf(world.content, offered).color);
        setText(sellButton, SALE_WORDS.button(sellPrice(world.content, offered)), wasShown);
      }
      if (changed) context.tooltip.hide();
    },
  };
}
