import type { ItemSlot, NpcDef, RarityDef } from '../../sim/content/types.ts';
import { ITEM_SLOTS } from '../../sim/content/types.ts';
import { itemName, rarityOf } from '../../sim/items.ts';
import { findLedger, itemAt } from '../../sim/world/purse.ts';
import type { ItemSpot } from '../../sim/world/purse.ts';
import type { ItemInstance, World } from '../../sim/world/types.ts';
import type { AuctionFlow, AuctionState } from '../auction/auction-flow.ts';
import type { AuctionTab, ShownItems } from '../auction/auction-model.ts';
import { AUCTION_TABS, choiceFilter, createShownItems, parseLevel, parsePrice, proceeds, saleLine, SORTS, TAB_NAMES, termsLine, timeLeft } from '../auction/auction-model.ts';
import type { AuctionRules, AuctionSort, Listing, Sale } from '../backend/auction-api.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, setText } from './dom.ts';
import type { Dropdown, DropdownChoice } from './dropdown.ts';
import { createDropdown } from './dropdown.ts';
import { iconSvg } from './icons.ts';
import type { ItemCell } from './item-cell.ts';
import { createItemCell, showItem } from './item-cell.ts';
import { shownTitle } from './npc-title.ts';
import { promptText, use } from './prompts.ts';

const AUCTION_PANEL = {
  anyLabel: 'Any',
  sortLabels: { price: 'Lowest price', newest: 'Newest' },
  emptyBrowse: 'Nothing is listed that fits.',
  emptyMine: 'You have nothing listed.',
  loading: 'Looking…',
  closedBody: 'Come back when the house is open.',
  buy: 'Buy',
  sure: 'Confirm',
  cancel: 'Cancel',
  list: 'List',
  collect: 'Collect',
  prev: 'Previous',
  next: 'Next',
  stash: 'From your stash',
  pickHint: 'Pick an item from your bags or stash to sell.',
  stashHint: 'pick to sell',
  noSeller: 'Someone',
  history: 'Closed sales',
} as const;

const SLOT_NAMES: Readonly<Record<ItemSlot, string>> = { weapon: 'Weapon', head: 'Head', chest: 'Chest', hands: 'Hands', legs: 'Legs', feet: 'Feet', charm: 'Charm' };

interface Row {
  readonly element: HTMLElement;
  readonly cell: ItemCell;
  readonly name: HTMLElement;
  readonly sub: HTMLElement;
  readonly price: HTMLElement;
  readonly act: HTMLButtonElement;
  listing: Listing;
}

interface SaleRow {
  readonly element: HTMLElement;
  readonly cell: ItemCell;
  readonly name: HTMLElement;
  readonly sub: HTMLElement;
  readonly price: HTMLElement;
  sale: Sale;
}

interface Leaving {
  readonly element: HTMLElement;
}

function leave(row: Leaving): void {
  row.element.classList.add('leaving');
  row.element.addEventListener('animationend', (): void => row.element.remove(), { once: true });
}

function picker(parent: HTMLElement, layer: HTMLElement, host: HTMLElement, name: string, choices: readonly DropdownChoice[], onChange: (value: string) => void): Dropdown {
  const holder: HTMLDivElement = el('div', 'auction-field', parent);
  label('auction-field-name', name, holder);
  return createDropdown(holder, { layer, host, name, choices, value: choices[0]?.value ?? '', onChange });
}

function numberField(parent: HTMLElement, name: string, hint: string): HTMLInputElement {
  const holder: HTMLLabelElement = el('label', 'auction-field', parent);
  label('auction-field-name', name, holder);
  const input: HTMLInputElement = el('input', 'auction-input narrow', holder);
  input.inputMode = 'numeric';
  input.placeholder = hint;
  input.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.code !== 'Escape') event.stopPropagation();
  });
  return input;
}

function actButton(parent: HTMLElement, ask: string, sure: string | null): HTMLButtonElement {
  const button: HTMLButtonElement = el('button', 'auction-act', parent);
  button.type = 'button';
  label('act-face act-ask', ask, button);
  if (sure !== null) label('act-face act-sure', sure, button);
  return button;
}

function coins(parent: HTMLElement, className: string): HTMLElement {
  const holder: HTMLDivElement = el('div', className, parent);
  el('span', 'gold-icon', holder).innerHTML = iconSvg('coin');
  return el('span', 'gold-text', holder);
}

function shown(node: HTMLElement, visible: boolean): void {
  node.classList.toggle('shown', visible);
}

export function createAuctionPanel(parent: HTMLElement, context: HudContext): PanelView {
  const flow: AuctionFlow | null = context.api.auction;
  const items: ShownItems = createShownItems();
  const element: HTMLDivElement = el('div', 'hud-panel right beside trade-panel auction-panel', parent);
  element.dataset['tab'] = 'Auction';
  element.addEventListener('contextmenu', (event: MouseEvent): void => {
    event.preventDefault();
  });
  const head: HTMLDivElement = el('div', 'trade-head', element);
  const naming: HTMLDivElement = el('div', 'trade-naming', head);
  const title: HTMLDivElement = label('panel-title', '', naming);
  const role: HTMLDivElement = label('trade-role', '', naming);
  const gold: HTMLElement = coins(head, 'trade-gold');

  const tabs: HTMLDivElement = el('div', 'auction-tabs', element);
  const mark: HTMLDivElement = el('div', 'auction-tab-mark', tabs);
  const tabButtons: Map<AuctionTab, HTMLButtonElement> = new Map<AuctionTab, HTMLButtonElement>();
  for (const tab of AUCTION_TABS) {
    const button: HTMLButtonElement = el('button', 'auction-tab', tabs);
    button.type = 'button';
    button.textContent = TAB_NAMES[tab];
    button.addEventListener('click', (): void => flow?.setTab(tab));
    tabButtons.set(tab, button);
  }
  const line: HTMLDivElement = el('div', 'auction-line', element);
  const views: HTMLDivElement = el('div', 'auction-views', element);
  const closed: HTMLDivElement = el('div', 'auction-view auction-closed', views);
  label('auction-empty', AUCTION_PANEL.closedBody, closed);

  const browseView: HTMLDivElement = el('div', 'auction-view', views);
  const filters: HTMLDivElement = el('div', 'auction-filters', browseView);
  const any: DropdownChoice = { value: '', label: AUCTION_PANEL.anyLabel };
  picker(filters, parent, element, 'Slot', [any, ...ITEM_SLOTS.map((each: ItemSlot): DropdownChoice => ({ value: each, label: SLOT_NAMES[each] }))], (value: string): void => {
    flow?.filter(choiceFilter('slot', value));
  });
  picker(filters, parent, element, 'Rarity', [any, ...context.api.world.content.rarities.map((each: RarityDef): DropdownChoice => ({ value: each.id, label: each.name }))], (value: string): void => {
    flow?.filter(choiceFilter('rarity', value));
  });
  const minLevel: HTMLInputElement = numberField(filters, 'Level', 'from');
  const maxLevel: HTMLInputElement = numberField(filters, '', 'to');
  const maxPrice: HTMLInputElement = numberField(filters, 'Price', 'up to');
  picker(filters, parent, element, 'Sort', SORTS.map((each: AuctionSort): DropdownChoice => ({ value: each, label: AUCTION_PANEL.sortLabels[each] })), (value: string): void => {
    flow?.filter(choiceFilter('sort', value));
  });
  const browseRows: HTMLDivElement = el('div', 'auction-rows', browseView);
  const browseEmpty: HTMLDivElement = label('auction-empty', '', browseView);
  const pager: HTMLDivElement = el('div', 'auction-pager', browseView);
  const prev: HTMLButtonElement = actButton(pager, AUCTION_PANEL.prev, null);
  const pageText: HTMLDivElement = label('auction-page', '', pager);
  const next: HTMLButtonElement = actButton(pager, AUCTION_PANEL.next, null);

  const sellView: HTMLDivElement = el('div', 'auction-view', views);
  const picked: HTMLDivElement = el('div', 'auction-picked', sellView);
  const pickedCell: ItemCell = createItemCell(context, picked, (): string => '');
  pickedCell.cell.classList.add('big');
  const pickedText: HTMLDivElement = el('div', 'auction-picked-text', picked);
  const pickedName: HTMLDivElement = label('auction-row-name', '', pickedText);
  const pickedSub: HTMLDivElement = label('auction-row-sub', '', pickedText);
  const pricing: HTMLDivElement = el('div', 'auction-pricing', sellView);
  const price: HTMLInputElement = numberField(pricing, 'Price', 'gold');
  const listButton: HTMLButtonElement = actButton(pricing, AUCTION_PANEL.list, null);
  const terms: HTMLDivElement = label('auction-terms', '', sellView);
  label('panel-subtitle', AUCTION_PANEL.stash, sellView);
  const stashGrid: HTMLDivElement = el('div', 'inv-grid stash-grid auction-stash', sellView);
  const stashCells: ItemCell[] = Array.from({ length: context.api.world.content.trade.stashSize }, (_: unknown, index: number): ItemCell => {
    const view: ItemCell = createItemCell(context, stashGrid, (item: ItemInstance): string => (item.ledger === null ? '' : promptText(context.api.touch, use(AUCTION_PANEL.stashHint))));
    view.cell.addEventListener('click', (): void => {
      if (view.current === null) return;
      context.tooltip.hide();
      flow?.pick({ place: 'stash', index });
    });
    return view;
  });

  const mineView: HTMLDivElement = el('div', 'auction-view', views);
  const waiting: HTMLDivElement = el('div', 'auction-waiting', mineView);
  const waitingText: HTMLDivElement = label('auction-waiting-text', '', waiting);
  const collect: HTMLButtonElement = actButton(waiting, AUCTION_PANEL.collect, null);
  const mineTitle: HTMLDivElement = label('panel-subtitle', '', mineView);
  const mineRows: HTMLDivElement = el('div', 'auction-rows', mineView);
  const mineEmpty: HTMLDivElement = label('auction-empty', AUCTION_PANEL.emptyMine, mineView);
  const history: HTMLDivElement = el('div', 'auction-history', mineView);
  label('panel-subtitle', AUCTION_PANEL.history, history);
  const historyRows: HTMLDivElement = el('div', 'auction-rows', history);

  const bodies: Readonly<Record<AuctionTab, HTMLElement>> = { browse: browseView, sell: sellView, mine: mineView };

  minLevel.addEventListener('change', (): void => flow?.filter({ minLevel: parseLevel(minLevel.value) }));
  maxLevel.addEventListener('change', (): void => flow?.filter({ maxLevel: parseLevel(maxLevel.value) }));
  maxPrice.addEventListener('change', (): void => flow?.filter({ maxPrice: parsePrice(maxPrice.value, null) }));
  prev.addEventListener('click', (): void => flow?.turn(-1));
  next.addEventListener('click', (): void => flow?.turn(1));
  price.addEventListener('input', (): void => flow?.setPrice(price.value));
  listButton.addEventListener('click', (): void => void flow?.list());
  collect.addEventListener('click', (): void => void flow?.collect());

  const makeRow = (holder: HTMLElement, listing: Listing, verb: string, sure: string | null, onAct: (row: Row) => void): Row => {
    const row: HTMLDivElement = el('div', 'auction-row', holder);
    const cell: ItemCell = createItemCell(context, row, (): string => '');
    const text: HTMLDivElement = el('div', 'auction-row-text', row);
    const name: HTMLDivElement = label('auction-row-name', '', text);
    const sub: HTMLDivElement = label('auction-row-sub', '', text);
    const cost: HTMLElement = coins(row, 'auction-row-price');
    const act: HTMLButtonElement = actButton(row, verb, sure);
    const view: Row = { element: row, cell, name, sub, price: cost, act, listing };
    act.addEventListener('click', (): void => onAct(view));
    return view;
  };

  const browseKept: Map<string, Row> = new Map<string, Row>();
  const mineKept: Map<string, Row> = new Map<string, Row>();
  const salesKept: Map<string, SaleRow> = new Map<string, SaleRow>();

  const makeSale = (sale: Sale): SaleRow => {
    const row: HTMLDivElement = el('div', 'auction-row sale', historyRows);
    const cell: ItemCell = createItemCell(context, row, (): string => '');
    const text: HTMLDivElement = el('div', 'auction-row-text', row);
    const name: HTMLDivElement = label('auction-row-name', '', text);
    const sub: HTMLDivElement = label('auction-row-sub', '', text);
    const cost: HTMLElement = coins(row, 'auction-row-price');
    return { element: row, cell, name, sub, price: cost, sale };
  };

  const renderSales = (state: AuctionState, world: World): void => {
    const sales: readonly Sale[] = state.history ?? [];
    const wanted: Set<string> = new Set<string>(sales.map((sale: Sale): string => sale.id));
    for (const [id, row] of salesKept) {
      if (wanted.has(id)) continue;
      salesKept.delete(id);
      leave(row);
    }
    for (const sale of sales) {
      const row: SaleRow = salesKept.get(sale.id) ?? makeSale(sale);
      row.sale = sale;
      salesKept.set(sale.id, row);
      historyRows.appendChild(row.element);
      const item: ItemInstance = items.shown(sale.item);
      showItem(context, row.cell, item);
      setText(row.name, itemName(world.content, item), false);
      row.name.style.setProperty('--rarity', rarityOf(world.content, item).color);
      setText(row.sub, saleLine(sale), true);
      setText(row.price, String(sale.price), true);
    }
    shown(history, sales.length > 0);
  };

  const sync = (holder: HTMLElement, kept: Map<string, Row>, listings: readonly Listing[], build: (listing: Listing) => Row): void => {
    const wanted: Set<string> = new Set<string>(listings.map((listing: Listing): string => listing.id));
    for (const [id, row] of kept) {
      if (wanted.has(id)) continue;
      kept.delete(id);
      leave(row);
    }
    for (const listing of listings) {
      const row: Row = kept.get(listing.id) ?? build(listing);
      row.listing = listing;
      kept.set(listing.id, row);
      holder.appendChild(row.element);
    }
  };

  const fill = (row: Row, world: World, sub: string): void => {
    const item: ItemInstance = items.shown(row.listing.item);
    showItem(context, row.cell, item);
    setText(row.name, itemName(world.content, item), false);
    row.name.style.setProperty('--rarity', rarityOf(world.content, item).color);
    setText(row.sub, sub, false);
    setText(row.price, String(row.listing.price), true);
  };

  const sellerOf = (listing: Listing): string => (listing.yours ? 'You' : (listing.seller ?? AUCTION_PANEL.noSeller));

  const renderBrowse = (state: AuctionState, world: World): void => {
    const listings: readonly Listing[] = state.page?.listings ?? [];
    sync(browseRows, browseKept, listings, (listing: Listing): Row =>
      makeRow(browseRows, listing, AUCTION_PANEL.buy, AUCTION_PANEL.sure, (row: Row): void => {
        if (flow === null || row.listing.yours) return;
        if (flow.state().confirm === row.listing.id) void flow.buy(row.listing.id);
        else flow.ask(row.listing.id);
      }),
    );
    for (const row of browseKept.values()) {
      fill(row, world, `Level ${row.listing.item.level} · ${sellerOf(row.listing)}`);
      row.act.classList.toggle('confirming', state.confirm === row.listing.id);
      row.act.classList.toggle('busy', state.work === 'buy' && state.confirm === null);
      row.act.disabled = row.listing.yours || state.work !== null;
      row.price.parentElement?.classList.toggle('short', row.listing.price > world.player.gold);
    }
    setText(browseEmpty, state.page === null || state.loading ? AUCTION_PANEL.loading : AUCTION_PANEL.emptyBrowse, false);
    shown(browseEmpty, listings.length === 0);
    setText(pageText, `Page ${state.filters.page}`, true);
    prev.disabled = state.filters.page <= 1;
    next.disabled = state.page?.more !== true;
    browseRows.classList.toggle('loading', state.loading);
  };

  const renderSell = (state: AuctionState, world: World, rules: AuctionRules | null): void => {
    const spot: ItemSpot | null = state.picked === null ? null : findLedger(world, state.picked);
    const item: ItemInstance | null = spot === null ? null : itemAt(world, spot);
    showItem(context, pickedCell, item);
    setText(pickedName, item === null ? AUCTION_PANEL.pickHint : itemName(world.content, item), true);
    pickedName.style.setProperty('--rarity', item === null ? 'var(--text-dim)' : rarityOf(world.content, item).color);
    const asked: number | null = parsePrice(state.price, rules);
    setText(pickedSub, item === null ? '' : asked === null ? `Level ${item.level}` : `Level ${item.level} · you get ${proceeds(asked, rules)} gold`, true);
    if (price.value !== state.price && document.activeElement !== price) price.value = state.price;
    listButton.disabled = item === null || state.work !== null;
    listButton.classList.toggle('busy', state.work === 'list');
    setText(terms, rules === null ? '' : termsLine(rules), false);
    let changed: boolean = false;
    for (const [index, view] of stashCells.entries()) {
      if (showItem(context, view, world.stash[index] ?? null)) changed = true;
      view.cell.classList.toggle('unpickable', view.current !== null && view.current.ledger === null);
      view.cell.classList.toggle('picked', view.current !== null && view.current.ledger !== null && view.current.ledger === state.picked);
    }
    if (changed) context.tooltip.hide();
  };

  const renderMine = (state: AuctionState, world: World, rules: AuctionRules | null): void => {
    const listings: readonly Listing[] = state.mine?.listings ?? [];
    sync(mineRows, mineKept, listings, (listing: Listing): Row =>
      makeRow(mineRows, listing, AUCTION_PANEL.cancel, null, (row: Row): void => {
        if (flow !== null) void flow.cancel(row.listing.id);
      }),
    );
    const now: number = Date.now();
    for (const row of mineKept.values()) {
      fill(row, world, timeLeft(row.listing.endsAt, now));
      row.act.disabled = state.work !== null;
      row.act.classList.toggle('busy', state.work === 'cancel');
    }
    shown(mineEmpty, listings.length === 0);
    setText(mineTitle, rules === null ? 'Your listings' : `Your listings ${listings.length} / ${rules.maxListings}`, true);
    const held = state.mine?.waiting ?? null;
    const count: number = held?.items.length ?? 0;
    const parts: string[] = [];
    if (held !== null && held.gold > 0) parts.push(`${held.gold} gold`);
    if (count > 0) parts.push(count === 1 ? '1 item' : `${count} items`);
    setText(waitingText, parts.length === 0 ? 'Nothing is waiting for you.' : `Waiting for you: ${parts.join(' and ')}`, true);
    collect.disabled = parts.length === 0 || state.work !== null;
    collect.classList.toggle('busy', state.work === 'collect');
    renderSales(state, world);
  };

  let seen: number = -1;
  let shownTab: AuctionTab | null = null;
  let wasClosed: boolean = false;

  const placeMark = (tab: AuctionTab): void => {
    const button: HTMLButtonElement | undefined = tabButtons.get(tab);
    if (button === undefined) return;
    mark.style.setProperty('--mark-x', `${button.offsetLeft}px`);
    mark.style.setProperty('--mark-w', `${button.offsetWidth}px`);
  };

  return {
    element,
    refresh(): void {
      const world: World = context.api.world;
      const owner: string | null = world.service?.kind === 'auction' ? world.service.owner : null;
      const npc: NpcDef | null = owner === null ? null : (world.content.npcs.get(owner) ?? null);
      if (npc !== null) {
        setText(title, npc.name, false);
        setText(role, shownTitle(npc), false);
      }
      setText(gold, String(world.player.gold), true);
      if (flow === null) return;
      const state: AuctionState = flow.state();
      const rules: AuctionRules | null = flow.rules();
      if (shownTab !== state.tab || wasClosed !== state.closed) {
        shownTab = state.tab;
        wasClosed = state.closed;
        for (const tab of AUCTION_TABS) {
          shown(bodies[tab], !state.closed && tab === state.tab);
          tabButtons.get(tab)?.classList.toggle('active', tab === state.tab);
        }
        shown(closed, state.closed);
        tabs.classList.toggle('closed', state.closed);
        placeMark(state.tab);
      }
      if (seen !== flow.revision()) {
        seen = flow.revision();
        const text: string = state.line?.text ?? '';
        if (text !== '') {
          line.dataset['tone'] = state.line?.tone ?? 'note';
          setText(line, text, true);
        }
        shown(line, text !== '');
        renderBrowse(state, world);
        renderMine(state, world, rules);
      }
      renderSell(state, world, rules);
      if (state.tab === 'mine') for (const row of mineKept.values()) setText(row.sub, timeLeft(row.listing.endsAt, Date.now()), false);
    },
  };
}
