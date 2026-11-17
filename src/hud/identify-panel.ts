import type { NpcDef } from '../../sim/content/types.ts';
import { itemName, rarityOf } from '../../sim/items.ts';
import type { ItemPlace } from '../../sim/world/service-types.ts';
import type { ItemInstance, World } from '../../sim/world/types.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, retrigger, setClass, setText } from './dom.ts';
import { iconSvg } from './icons.ts';
import type { IdentifyRow, IdentifyView, RevealLine } from './identify-view.ts';
import { IDENTIFY_TEXT, identifyView, justRevealed, revealLines } from './identify-view.ts';
import type { ItemCell } from './item-cell.ts';
import { createItemCell, showItem } from './item-cell.ts';
import { shownTitle } from './npc-title.ts';
import { promptText, use } from './prompts.ts';

interface Row {
  readonly uid: number;
  readonly element: HTMLDivElement;
  readonly view: ItemCell;
  readonly name: HTMLDivElement;
  readonly kind: HTMLDivElement;
  readonly lines: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly short: HTMLDivElement;
  spot: { readonly place: ItemPlace; readonly index: number } | null;
  revealed: boolean;
  leaving: boolean;
}

function writeIn(node: HTMLElement, text: string): number {
  node.textContent = '';
  const letters: string[] = Array.from(new Intl.Segmenter().segment(text), (part: Intl.SegmentData): string => part.segment);
  letters.forEach((letter: string, at: number): void => {
    const span: HTMLSpanElement = el('span', 'appraise-letter', node);
    span.textContent = letter;
    span.style.setProperty('--i', String(at));
  });
  return letters.length;
}

function showLines(node: HTMLElement, lines: readonly RevealLine[], after: number): void {
  node.textContent = '';
  lines.forEach((line: RevealLine, at: number): void => {
    const row: HTMLDivElement = label(line.best ? 'appraise-line best' : 'appraise-line', line.text, node);
    row.style.setProperty('--i', String(at));
    row.style.setProperty('--after', String(after));
  });
}

export function createIdentifyPanel(parent: HTMLElement, context: HudContext): PanelView {
  const element: HTMLDivElement = el('div', 'hud-panel right beside trade-panel appraise-panel', parent);
  element.dataset['tab'] = 'Identify';
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
  const list: HTMLDivElement = el('div', 'appraise-list', element);
  const empty: HTMLDivElement = label('appraise-empty', IDENTIFY_TEXT.empty, element);
  const foot: HTMLDivElement = el('div', 'appraise-foot', element);
  const allShort: HTMLDivElement = label('appraise-short', '', foot);
  const allButton: HTMLButtonElement = el('button', 'appraise-all', foot);
  allButton.type = 'button';
  allButton.addEventListener('click', (): void => {
    if (allButton.classList.contains('short')) retrigger(allButton, 'deny');
    context.tooltip.hide();
    context.api.send({ type: 'trade', action: { type: 'identify_all' } });
  });

  const rows: Map<number, Row> = new Map<number, Row>();
  let hidden: Set<number> = new Set<number>();

  const leave = (row: Row): void => {
    if (row.leaving) return;
    row.leaving = true;
    row.element.classList.add('leaving');
    row.element.addEventListener('animationend', (event: AnimationEvent): void => {
      if (event.target !== row.element) return;
      row.element.remove();
      rows.delete(row.uid);
    });
  };

  const makeRow = (item: ItemInstance): Row => {
    const box: HTMLDivElement = el('div', 'appraise-row', list);
    const view: ItemCell = createItemCell(context, box, (shown: ItemInstance): string => (rows.get(shown.uid)?.revealed === true ? '' : promptText(context.api.touch, use('identify'))));
    const text: HTMLDivElement = el('div', 'appraise-text', box);
    const name: HTMLDivElement = label('appraise-name', '', text);
    const kind: HTMLDivElement = label('appraise-kind', '', text);
    const lines: HTMLDivElement = el('div', 'appraise-lines', text);
    const act: HTMLDivElement = el('div', 'appraise-act', box);
    const button: HTMLButtonElement = el('button', 'appraise-buy', act);
    button.type = 'button';
    const short: HTMLDivElement = label('appraise-short', '', act);
    const row: Row = { uid: item.uid, element: box, view, name, kind, lines, button, short, spot: null, revealed: false, leaving: false };
    const identify = (): void => {
      if (row.spot === null || row.revealed) return;
      if (button.classList.contains('short')) retrigger(button, 'deny');
      context.tooltip.hide();
      context.api.send({ type: 'trade', action: { type: 'identify', place: row.spot.place, index: row.spot.index } });
    };
    button.addEventListener('click', identify);
    view.cell.addEventListener('click', identify);
    rows.set(item.uid, row);
    return row;
  };

  const reveal = (world: World, row: Row, item: ItemInstance): void => {
    row.revealed = true;
    row.spot = null;
    row.element.classList.add('revealed');
    retrigger(row.element, 'glow');
    showItem(context, row.view, item);
    const letters: number = writeIn(row.name, itemName(world.content, item));
    showLines(row.lines, revealLines(world.content, item), letters);
    setText(row.button, IDENTIFY_TEXT.done, true);
    setText(row.short, '', false);
    setClass(row.short, 'shown', false);
  };

  const showRow = (world: World, row: Row, entry: IdentifyRow): void => {
    row.spot = { place: entry.place, index: entry.index };
    showItem(context, row.view, entry.item);
    row.element.style.setProperty('--rarity', rarityOf(world.content, entry.item).color);
    setText(row.name, entry.name, false);
    setText(row.kind, entry.place === 'stash' ? `${entry.kind} · ${IDENTIFY_TEXT.stash}` : entry.kind, false);
    setText(row.button, IDENTIFY_TEXT.button(entry.cost), true);
    setClass(row.button, 'short', entry.short > 0);
    setText(row.short, entry.short > 0 ? IDENTIFY_TEXT.short(entry.short) : row.short.textContent, entry.short > 0);
    setClass(row.short, 'shown', entry.short > 0);
  };

  const reset = (): void => {
    for (const row of rows.values()) row.element.remove();
    rows.clear();
    hidden = new Set<number>();
  };

  return {
    element,
    refresh(): void {
      const world: World = context.api.world;
      if (!element.classList.contains('open')) reset();
      const owner: string | null = world.service?.kind === 'identify' ? world.service.owner : null;
      const npc: NpcDef | null = owner === null ? null : (world.content.npcs.get(owner) ?? null);
      if (npc !== null) {
        setText(title, npc.name, false);
        setText(role, shownTitle(npc), false);
      }
      const view: IdentifyView = identifyView(world);
      setText(gold, String(view.gold), true);
      for (const item of justRevealed(world, hidden)) {
        const row: Row | undefined = rows.get(item.uid);
        if (row !== undefined && !row.revealed) reveal(world, row, item);
      }
      const listed: Set<number> = new Set<number>();
      for (const entry of view.rows) {
        listed.add(entry.item.uid);
        showRow(world, rows.get(entry.item.uid) ?? makeRow(entry.item), entry);
      }
      const held: Set<number> = new Set<number>([...world.player.inventory, ...world.stash].flatMap((item: ItemInstance | null): number[] => (item === null ? [] : [item.uid])));
      for (const row of rows.values()) {
        if (listed.has(row.uid)) continue;
        if (!row.revealed || !held.has(row.uid)) leave(row);
      }
      hidden = listed;
      const any: boolean = view.rows.length > 0;
      setClass(empty, 'shown', rows.size === 0);
      setClass(foot, 'shown', any);
      setText(allButton, IDENTIFY_TEXT.all(view.total), any);
      setClass(allButton, 'short', view.allShort > 0);
      setText(allShort, view.allShort > 0 ? IDENTIFY_TEXT.short(view.allShort) : allShort.textContent, view.allShort > 0);
      setClass(allShort, 'shown', view.allShort > 0);
    },
  };
}
