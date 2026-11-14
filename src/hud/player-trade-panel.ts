import type { ItemInstance } from '../../sim/world/types.ts';
import type { BagEntry, PlayerTrade } from '../player-trade/trade-flow.ts';
import type { ConfirmBlock, Incoming, OpenTrade, TradeCard, TradeNote, TradeState } from '../player-trade/trade-model.ts';
import { askingText, blockText, confirmBlock, secondsLeft, tradeCard } from '../player-trade/trade-model.ts';
import type { TradeItem, TradeSide } from '../player-trade/trade-protocol.ts';
import { TRADE_LIMITS } from '../player-trade/trade-protocol.ts';
import type { HudContext } from './context.ts';
import { el, label, retrigger, setText } from './dom.ts';
import { createCloseButton } from './close-button.ts';
import { iconSvg } from './icons.ts';
import type { ItemCell } from './item-cell.ts';
import { createItemCell, showItem } from './item-cell.ts';
import { markOverlay } from './overlay-mark.ts';
import { promptText, use } from './prompts.ts';

export const PLAYER_TRADE_PANEL = {
  firstUid: -1_000_000,
  bagColumns: 6,
} as const;

export interface PlayerTradePanel {
  readonly element: HTMLElement;
  readonly ask: HTMLElement;
  refresh(now: number): void;
}

export interface PlayerTradeMount {
  update(now: number): void;
}

interface SideView {
  readonly root: HTMLElement;
  readonly cells: readonly ItemCell[];
  readonly gold: HTMLElement;
  readonly mark: HTMLElement;
}

function sideView(context: HudContext, parent: HTMLElement, title: string, hint: string, goldNode: (holder: HTMLElement) => HTMLElement): SideView {
  const root: HTMLDivElement = el('div', 'swap-side', parent);
  const head: HTMLDivElement = el('div', 'swap-side-head', root);
  label('swap-side-title', title, head);
  const mark: HTMLDivElement = label('swap-mark', 'Confirmed', head);
  const grid: HTMLDivElement = el('div', 'inv-grid swap-grid', root);
  const cells: ItemCell[] = Array.from({ length: TRADE_LIMITS.items }, (): ItemCell => createItemCell(context, grid, (): string => hint));
  const holder: HTMLDivElement = el('div', 'swap-gold', root);
  el('span', 'gold-icon', holder).innerHTML = iconSvg('coin');
  return { root, cells, gold: goldNode(holder), mark };
}

function actButton(parent: HTMLElement, ask: string, sure: string): HTMLButtonElement {
  const button: HTMLButtonElement = el('button', 'auction-act', parent);
  button.type = 'button';
  label('act-face act-ask', ask, button);
  label('act-face act-sure', sure, button);
  return button;
}

export function createPlayerTradePanel(parent: HTMLElement, context: HudContext, flow: PlayerTrade): PlayerTradePanel {
  const uids: Map<string, number> = new Map<string, number>();
  const instanceOf = (item: TradeItem): ItemInstance => {
    let uid: number | undefined = uids.get(item.id);
    if (uid === undefined) {
      uid = PLAYER_TRADE_PANEL.firstUid - uids.size;
      uids.set(item.id, uid);
    }
    return { uid, base: item.base, rarity: item.rarity, level: item.level, affixes: item.affixes, ledger: item.id };
  };
  const shown = (items: readonly TradeItem[]): readonly ItemInstance[] => items.filter((item: TradeItem): boolean => context.api.world.content.itemBases.has(item.base)).map(instanceOf);

  const element: HTMLDivElement = el('div', 'hud-panel left swap-panel', parent);
  element.addEventListener('contextmenu', (event: MouseEvent): void => {
    event.preventDefault();
  });
  const head: HTMLDivElement = el('div', 'trade-head', element);
  const title: HTMLDivElement = label('panel-title', 'Trade', head);
  const status: HTMLDivElement = label('trade-role swap-status', '', head);
  const line: HTMLDivElement = label('auction-line', '', element);
  const columns: HTMLDivElement = el('div', 'swap-columns', element);
  let goldInput: HTMLInputElement | null = null;
  const give: SideView = sideView(context, columns, 'You give', 'Take it back from your bag below', (holder: HTMLElement): HTMLElement => {
    const input: HTMLInputElement = el('input', 'auction-input swap-gold-input', holder);
    input.inputMode = 'numeric';
    input.placeholder = '0';
    input.setAttribute('aria-label', 'Gold you give');
    input.addEventListener('keydown', (event: KeyboardEvent): void => {
      if (event.code !== 'Escape') event.stopPropagation();
    });
    input.addEventListener('input', (): void => flow.setGold(input.value));
    goldInput = input;
    return input;
  });
  const get: SideView = sideView(context, columns, 'You get', 'What they give you', (holder: HTMLElement): HTMLElement => label('swap-gold-amount', '0', holder));
  const countdown: HTMLDivElement = el('div', 'swap-countdown', element);
  const fill: HTMLDivElement = el('div', 'swap-countdown-fill', countdown);
  const bagHead: HTMLDivElement = label('swap-bag-title', `Your bag: ${promptText(context.api.touch, use('offer an item'))}`, element);
  const bagGrid: HTMLDivElement = el('div', 'inv-grid swap-bag', element);
  const actions: HTMLDivElement = el('div', 'swap-actions', element);
  const reason: HTMLDivElement = label('swap-reason', '', actions);
  const confirm: HTMLButtonElement = actButton(actions, 'Confirm', 'Confirmed');
  const cancel: HTMLButtonElement = actButton(actions, 'Cancel', 'Cancel');
  confirm.addEventListener('click', (): void => flow.confirmOffer());
  cancel.addEventListener('click', (): void => flow.cancel());

  const bagCells: ItemCell[] = Array.from({ length: context.api.world.player.inventory.length }, (_: unknown, index: number): ItemCell => {
    const view: ItemCell = createItemCell(context, bagGrid, (): string => {
      const entry: BagEntry | undefined = bagEntries.find((each: BagEntry): boolean => each.index === index);
      if (entry === undefined) return '';
      if (entry.block === 'story') return 'Story items cannot be traded';
      if (entry.block === 'unverified') return 'Only items in the ledger can be traded';
      return promptText(context.api.touch, use(entry.offered ? 'take it back' : 'offer it'));
    });
    view.cell.addEventListener('click', (): void => {
      const entry: BagEntry | undefined = bagEntries.find((each: BagEntry): boolean => each.index === index);
      if (entry === undefined || entry.block !== null || entry.ledger === null) return;
      context.tooltip.hide();
      flow.toggle(entry.ledger);
    });
    return view;
  });
  let bagEntries: readonly BagEntry[] = [];

  const ask: HTMLDivElement = el('div', 'swap-ask', parent);
  const askText: HTMLDivElement = label('swap-ask-text', '', ask);
  const askRow: HTMLDivElement = el('div', 'swap-ask-row', ask);
  const askInner: HTMLDivElement = el('div', 'swap-ask-inner', askRow);
  const askTime: HTMLDivElement = el('div', 'swap-ask-time', askInner);
  const askFill: HTMLDivElement = el('div', 'swap-ask-fill', askTime);
  const askActions: HTMLDivElement = el('div', 'swap-actions', askInner);
  const accept: HTMLButtonElement = actButton(askActions, 'Accept', 'Accept');
  const decline: HTMLButtonElement = actButton(askActions, 'Decline', 'Decline');
  accept.addEventListener('click', (): void => flow.accept());
  decline.addEventListener('click', (): void => flow.decline());
  const waitRow: HTMLDivElement = el('div', 'swap-ask-row', ask);
  const waitActions: HTMLDivElement = el('div', 'swap-actions', el('div', 'swap-ask-inner', waitRow));
  const stopAsking: HTMLButtonElement = actButton(waitActions, 'Cancel', 'Cancel');
  stopAsking.addEventListener('click', (): void => flow.cancel());
  let askedAt: { readonly from: string; readonly at: number } | null = null;
  let seenNote: TradeNote | null = null;
  let noteAt: number = 0;

  let counting: { readonly ends: number; readonly at: number } | null = null;
  let lastTheirs: TradeSide | null = null;
  let lastChange: number | null = null;

  const showSide = (view: SideView, side: TradeSide): boolean => {
    const items: readonly ItemInstance[] = shown(side.items);
    let changed: boolean = false;
    for (const [index, cell] of view.cells.entries()) {
      if (showItem(context, cell, items[index] ?? null)) changed = true;
    }
    view.root.classList.toggle('confirmed', side.confirmed);
    return changed;
  };

  const showIncoming = (incoming: Incoming, now: number): void => {
    if (askedAt?.from !== incoming.from) askedAt = { from: incoming.from, at: now };
    setText(askText, `${incoming.name} wants to trade`, true);
    const total: number = Math.max(1, incoming.expiresAt - askedAt.at);
    askFill.style.transform = `scaleX(${String(Math.max(0, Math.min(1, (incoming.expiresAt - now) / total)))})`;
  };

  const showCard = (card: TradeCard, now: number): void => {
    ask.classList.toggle('shown', card.kind !== 'none');
    askRow.classList.toggle('shown', card.kind === 'incoming');
    waitRow.classList.toggle('shown', card.kind === 'asking');
    ask.dataset['tone'] = card.kind === 'note' ? card.note.tone : 'note';
    if (card.kind !== 'incoming') askedAt = null;
    switch (card.kind) {
      case 'none':
        return;
      case 'incoming':
        showIncoming(card.incoming, now);
        return;
      case 'asking':
        setText(askText, askingText(card.name), true);
        return;
      case 'note':
        setText(askText, card.note.text, true);
        return;
    }
  };

  const showOpen = (open: OpenTrade, now: number): void => {
    setText(title, `Trade with ${open.name}`, false);
    showSide(give, open.mine);
    if (showSide(get, open.theirs) || (lastTheirs !== null && lastTheirs.gold !== open.theirs.gold)) context.tooltip.hide();
    lastTheirs = open.theirs;
    if (open.changedAt !== null && open.changedAt !== lastChange) {
      lastChange = open.changedAt;
      retrigger(get.root, 'swap-changed');
    }
    setText(get.gold, String(open.theirs.gold), true);
    if (goldInput !== null && document.activeElement !== goldInput && goldInput.value !== flow.goldText()) goldInput.value = flow.goldText();
    const swapping: boolean = open.countdownEndsAt !== null;
    countdown.classList.toggle('running', swapping);
    if (open.countdownEndsAt === null) counting = null;
    else if (counting?.ends !== open.countdownEndsAt) counting = { ends: open.countdownEndsAt, at: now };
    fill.style.transform = `scaleX(${counting === null ? '1' : String(Math.max(0, Math.min(1, (counting.ends - now) / Math.max(1, counting.ends - counting.at))))})`;
    setText(status, open.countdownEndsAt === null ? '' : `Trading in ${String(secondsLeft(open.countdownEndsAt, now))}`, true);
    const free: number = flow.freeSlots();
    const block: ConfirmBlock = confirmBlock(open, free, now);
    confirm.disabled = block !== 'none' && block !== 'confirmed';
    confirm.classList.toggle('confirming', open.mine.confirmed);
    setText(reason, blockText(block, open, free) ?? '', false);
    reason.classList.toggle('shown', blockText(block, open, free) !== null);
    if (goldInput !== null) goldInput.disabled = swapping;
    element.classList.toggle('swapping', swapping);
  };

  const showBag = (): void => {
    bagEntries = flow.bag();
    const byIndex: Map<number, BagEntry> = new Map<number, BagEntry>(bagEntries.map((entry: BagEntry): [number, BagEntry] => [entry.index, entry]));
    for (const [index, view] of bagCells.entries()) {
      const entry: BagEntry | undefined = byIndex.get(index);
      showItem(context, view, entry?.item ?? null);
      view.cell.classList.toggle('swap-offered', entry?.offered === true);
      view.cell.classList.toggle('swap-blocked', entry !== undefined && entry.block !== null);
    }
  };

  return {
    element,
    ask,
    refresh(now: number): void {
      const state: TradeState = flow.state();
      if (state.note !== seenNote) {
        seenNote = state.note;
        noteAt = now;
      }
      showCard(tradeCard(state, now - noteAt), now);
      line.dataset['tone'] = state.note?.tone ?? 'note';
      setText(line, state.note?.text ?? '', false);
      line.classList.toggle('shown', state.note !== null && state.open !== null);
      if (state.open !== null) {
        showOpen(state.open, now);
        showBag();
      } else {
        lastTheirs = null;
        lastChange = null;
        counting = null;
      }
      bagHead.classList.toggle('shown', state.open !== null);
    },
  };
}

export function mountPlayerTrade(parent: HTMLElement, context: HudContext, flow: PlayerTrade, track: (element: HTMLElement) => void): PlayerTradeMount {
  const panel: PlayerTradePanel = createPlayerTradePanel(parent, context, flow);
  track(panel.element);
  track(panel.ask);
  createCloseButton(panel.element, 'Trade', (): void => flow.cancel());
  let open: boolean = false;
  window.addEventListener(
    'keydown',
    (event: KeyboardEvent): void => {
      if (!open || event.code !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      flow.cancel();
    },
    true,
  );
  return {
    update(now: number): void {
      const next: boolean = flow.state().open !== null;
      if (next !== open) {
        open = next;
        panel.element.classList.toggle('open', open);
        markOverlay(panel.element, open);
        if (!open) context.tooltip.hide();
      }
      panel.refresh(now);
    },
  };
}
