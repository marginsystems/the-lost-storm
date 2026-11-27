import type { TradeGood } from '../../sim/content/trade-types.ts';
import type { NpcDef } from '../../sim/content/types.ts';
import { itemName, rarityOf } from '../../sim/items.ts';
import { shownTitle } from './npc-title.ts';
import { buyPrice, goodItem, sellPrice } from '../../sim/world/trade.ts';
import type { FlaskDef } from '../../sim/content/flasks.ts';
import { baseFlask, offerFor } from '../../sim/world/flask-tiers.ts';
import type { FlaskState, ItemInstance, VendorStock, World } from '../../sim/world/types.ts';
import type { FlaskOfferState, FlaskOfferView } from './flask-offer.ts';
import { flaskOfferView } from './flask-offer.ts';
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

interface FlaskRow {
  readonly id: string;
  readonly root: HTMLDivElement;
  readonly tier: HTMLSpanElement;
  readonly next: HTMLDivElement;
  readonly need: HTMLDivElement;
  readonly buy: HTMLButtonElement;
  readonly price: HTMLSpanElement;
}

function flaskRow(context: HudContext, parent: HTMLElement, base: FlaskDef): FlaskRow {
  const root: HTMLDivElement = el('div', `flask-offer ${base.resource}`, parent);
  const side: HTMLDivElement = el('div', 'fo-side', root);
  const head: HTMLDivElement = el('div', 'fo-head', side);
  label('fo-name', base.name, head);
  const tier: HTMLSpanElement = el('span', 'fo-tier', head);
  const next: HTMLDivElement = label('fo-next', '', side);
  const need: HTMLDivElement = label('fo-need', '', side);
  const buy: HTMLButtonElement = el('button', 'fo-buy', root);
  buy.type = 'button';
  el('span', 'gold-icon', buy).innerHTML = iconSvg('coin');
  const price: HTMLSpanElement = el('span', 'fo-price', buy);
  buy.addEventListener('click', (event: MouseEvent): void => {
    event.stopPropagation();
    const world: World = context.api.world;
    const flask: FlaskState | undefined = world.player.flasks.find((entry: FlaskState): boolean => entry.def.id === base.id);
    if (flask === undefined) return;
    if (offerFor(world.content, world.player, flask).kind !== 'ready') retrigger(buy, 'deny');
    context.api.send({ type: 'trade', action: { type: 'upgrade_flask', flask: base.id } });
  });
  return { id: base.id, root, tier, next, need, buy, price };
}

function showFlaskRow(row: FlaskRow, world: World): void {
  const flask: FlaskState | undefined = world.player.flasks.find((entry: FlaskState): boolean => entry.def.id === row.id);
  const base: FlaskDef | null = baseFlask(world.content, row.id);
  if (flask === undefined || base === null) return;
  const maximum: number = flask.def.resource === 'life' ? world.player.maxLife : world.player.stats.maxMana;
  const view: FlaskOfferView = flaskOfferView(base, offerFor(world.content, world.player, flask), maximum, world.player.gold);
  for (const state of FLASK_STATES) row.root.classList.toggle(state, state === view.state);
  setText(row.tier, view.tier, true);
  setText(row.next, view.next, true);
  setText(row.need, view.need, true);
  setText(row.price, view.price === null ? '' : String(view.price), true);
  row.buy.tabIndex = view.state === 'ready' || view.state === 'short' ? 0 : -1;
  row.buy.setAttribute('aria-label', view.price === null ? `${base.name} fully upgraded` : `Upgrade ${base.name} for ${view.price} gold`);
}

const FLASK_STATES: readonly FlaskOfferState[] = ['top', 'locked', 'short', 'ready'];

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
  label('panel-subtitle', 'Flasks', element);
  const flaskList: HTMLDivElement = el('div', 'flask-offers', element);
  const flaskRows: FlaskRow[] = context.api.world.content.flasks.map((base: FlaskDef): FlaskRow => flaskRow(context, flaskList, base));
  label('panel-subtitle', 'For sale', element);
  const goodsGrid: HTMLDivElement = el('div', 'inv-grid trade-goods', element);
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
    context.sale.toggle(saleCell.current.uid);
  });
  sellButton.addEventListener('click', (event: MouseEvent): void => {
    event.stopPropagation();
    const command = saleCommand(context.api.world, context.sale.uids());
    if (command === null) {
      retrigger(sellButton, 'deny');
      return;
    }
    context.sale.clear();
    context.api.send(command);
  });

  const send = (action: { readonly type: 'buy' | 'buy_back' | 'buy_good'; readonly index: number }): void => {
    context.api.send({ type: 'trade', action });
  };
  const content = context.api.world.content;
  const goods: readonly (ItemInstance | null)[] = content.trade.goods.map((_good: TradeGood, index: number): ItemInstance | null => goodItem(content, index));
  const goodCells: PricedCell[] = content.trade.goods.map((good: TradeGood, index: number): PricedCell => pricedCell(context, goodsGrid, 'buy', (): number => good.price, (): void => send({ type: 'buy_good', index })));
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
      for (const row of flaskRows) showFlaskRow(row, world);
      let changed: boolean = false;
      for (const [index, cell] of goodCells.entries()) {
        if (showPriced(context, cell, goods[index] ?? null, content.trade.goods[index]?.price ?? 0, coins)) changed = true;
      }
      for (const [index, cell] of stockCells.entries()) {
        const item: ItemInstance | null = stock?.stock[index] ?? null;
        if (showPriced(context, cell, item, item === null ? 0 : buyPrice(world.content, item), coins)) changed = true;
      }
      for (const [index, cell] of backCells.entries()) {
        const item: ItemInstance | null = stock?.buyback[index] ?? null;
        if (showPriced(context, cell, item, item === null ? 0 : sellPrice(world.content, item), coins)) changed = true;
      }
      const selected: ItemInstance[] = [];
      for (const uid of context.sale.uids()) {
        const item = offeredItem(world, uid);
        if (item === null) context.sale.toggle(uid);
        else selected.push(item);
      }
      const offered: ItemInstance | null = selected.at(-1) ?? null;
      if (showItem(context, saleCell, offered)) changed = true;
      const wasShown: boolean = sellButton.classList.contains('shown');
      sale.classList.toggle('offering', offered !== null);
      sellButton.classList.toggle('shown', offered !== null);
      if (offered === null) {
        setText(saleText, saleEmptyText(context.api.touch), true);
        saleText.style.removeProperty('--rarity');
      } else {
        setText(saleText, selected.length === 1 ? itemName(world.content, offered) : selected.length + ' items selected', true);
        saleText.style.setProperty('--rarity', rarityOf(world.content, offered).color);
        setText(sellButton, SALE_WORDS.button(selected.reduce((sum: number, item: ItemInstance): number => sum + sellPrice(world.content, item), 0)), wasShown);
      }
      if (changed) context.tooltip.hide();
    },
  };
}
