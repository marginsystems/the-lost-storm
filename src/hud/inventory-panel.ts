import { bookOf } from '../../sim/content/story.ts';
import type { ItemBaseDef, ItemSlot } from '../../sim/content/types.ts';
import { ITEM_SLOTS } from '../../sim/content/types.ts';
import { baseOf, isStoryItem, rarityOf, slotOf } from '../../sim/items.ts';
import { countOf } from '../../sim/stacks.ts';
import type { ItemInstance, PlayerState } from '../../sim/world/types.ts';
import { attachBagDrag } from './bag-drag.ts';
import type { BagDragHandle } from './bag-drag.ts';
import { setCount } from './cell-count.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, replay, retrigger } from './dom.ts';
import { setPlate } from './item-art/plate.ts';
import { arrivalOrder, setPicture } from './item-picture.ts';
import { itemTooltip } from './item-tooltip.ts';
import { attachTooltip } from './tooltip.ts';
import { promptText, use } from './prompts.ts';
import type { BagAction } from './trade-actions.ts';
import { bagAction, inventoryHint } from './trade-actions.ts';

const INVENTORY = {
  hintEquipped: 'unequip',
  dropAsk: 'Drop?',
  dropConfirmMs: 2600,
  holdMs: 480,
  holdSlop: 10,
} as const;

interface Hold {
  readonly pointer: number;
  readonly x: number;
  readonly y: number;
  readonly timer: number;
}

const SLOT_TITLES: Readonly<Record<ItemSlot, string>> = {
  weapon: 'Weapon',
  head: 'Head',
  chest: 'Chest',
  hands: 'Hands',
  legs: 'Legs',
  feet: 'Feet',
  charm: 'Charm',
};

interface CellView {
  readonly cell: HTMLElement;
  readonly item: HTMLElement;
  current: ItemInstance | null;
  image: string | null;
}

function buildCell(cellParent: HTMLElement, className: string): CellView {
  const cell: HTMLDivElement = el('div', className, cellParent);
  const item: HTMLDivElement = el('div', 'cell-item', cell);
  return { cell, item, current: null, image: null };
}

export function createInventoryPanel(parent: HTMLElement, context: HudContext): PanelView {
  const element: HTMLDivElement = el('div', 'hud-panel right inventory-panel', parent);
  element.addEventListener('contextmenu', (event: MouseEvent): void => {
    event.preventDefault();
  });
  label('panel-title', 'Inventory', element);

  const equipRow: HTMLDivElement = el('div', 'equip-row', element);
  const grid: HTMLDivElement = el('div', 'inv-grid', element);

  const setItem = (view: CellView, item: ItemInstance | null): boolean => {
    setCount(view.cell, item === null ? 0 : countOf(item));
    if (item === null && view.current === null) return false;
    const image: string | null = item === null ? null : context.api.itemImage(item);
    if (item !== null && view.current !== null && item.uid === view.current.uid && image === view.image) {
      view.current = item;
      return false;
    }
    const arriving: boolean = item !== null && view.current !== null && item.uid === view.current.uid && view.image === null && image !== null;
    view.current = item;
    view.image = image;
    if (item === null) {
      view.item.classList.remove('filled');
      return true;
    }
    const base: ItemBaseDef | null = baseOf(context.api.world.content, item);
    setPicture(view.item, image, base, arriving ? arrivalOrder(item.uid) : null);
    setPlate(view.item, rarityOf(context.api.world.content, item));
    view.item.classList.add('filled');
    if (!arriving) replay(view.item, 'pop');
    return true;
  };

  const equipCells: Map<ItemSlot, CellView> = new Map<ItemSlot, CellView>();
  for (const slot of ITEM_SLOTS) {
    const holder: HTMLDivElement = el('div', 'equip', equipRow);
    holder.style.gridArea = slot;
    const view: CellView = buildCell(holder, 'cell big');
    label('equip-name', SLOT_TITLES[slot], holder);
    equipCells.set(slot, view);
    attachTooltip(context.tooltip, view.cell, (): HTMLElement | null =>
      view.current === null ? null : itemTooltip(context.api, view.current, null, promptText(context.api.touch, use(INVENTORY.hintEquipped))),
    );
    view.cell.addEventListener('click', (): void => {
      if (view.current === null) return;
      context.tooltip.hide();
      context.api.send({ type: 'unequip', slot });
    });
  }

  const inventoryCells: CellView[] = [];
  const inventoryPlaces: HTMLElement[] = [];
  let armed: { readonly index: number; readonly uid: number; readonly timer: number } | null = null;
  const disarm = (): void => {
    if (armed === null) return;
    window.clearTimeout(armed.timer);
    inventoryCells[armed.index]?.cell.classList.remove('arming');
    armed = null;
  };
  const arm = (index: number, view: CellView, item: ItemInstance): void => {
    disarm();
    view.cell.classList.add('arming');
    armed = { index, uid: item.uid, timer: window.setTimeout(disarm, INVENTORY.dropConfirmMs) };
  };
  const act = (index: number, view: CellView, action: BagAction): void => {
    switch (action.kind) {
      case 'send':
        context.api.send(action.command);
        return;
      case 'offer':
        context.sale.set(context.sale.uid() === action.uid ? null : action.uid);
        return;
      case 'pick':
        if (context.api.auction === null) retrigger(view.cell, 'deny');
        else context.api.auction.pick({ place: 'bag', index });
        return;
      case 'deny':
        retrigger(view.cell, 'deny');
        return;
    }
  };
  for (let index: number = 0; index < context.api.world.content.player.inventorySize; index += 1) {
    const view: CellView = buildCell(grid, 'cell');
    label('cell-drop', INVENTORY.dropAsk, view.cell);
    inventoryCells.push(view);
    inventoryPlaces.push(view.cell);
    attachTooltip(context.tooltip, view.cell, (): HTMLElement | null => {
      const item: ItemInstance | null = view.current;
      if (item === null) return null;
      const content = context.api.world.content;
      const slot: ItemSlot | null = slotOf(content, item);
      const equipped: ItemInstance | null = slot === null ? null : context.api.world.player.equipped[slot];
      return itemTooltip(context.api, item, equipped, inventoryHint(context.api.world, item, context.api.touch, context.api.unverified(item)));
    });
    const drag: BagDragHandle = attachBagDrag({
      root: parent,
      panel: element,
      cell: view.cell,
      item: view.item,
      places: inventoryPlaces,
      canDrag: (): boolean => view.current !== null,
      canLeave: (): boolean => view.current !== null && !isStoryItem(context.api.world.content, view.current),
      started: (): void => {
        disarm();
        context.tooltip.hide();
      },
      dropped: (): void => {
        if (view.current !== null) context.api.send({ type: 'drop', inventoryIndex: index });
      },
      moved: (to: number): void => {
        if (view.current !== null) context.api.send({ type: 'arrange', from: index, to });
      },
    });
    let hold: Hold | null = null;
    let held: boolean = false;
    const release = (): void => {
      if (hold === null) return;
      window.clearTimeout(hold.timer);
      hold = null;
    };
    view.cell.addEventListener('pointerdown', (event: PointerEvent): void => {
      release();
      held = false;
      if (event.pointerType !== 'touch' || view.current === null) return;
      const timer: number = window.setTimeout((): void => {
        hold = null;
        const action: BagAction = bagAction(context.api.world, index, 'right');
        if (action.kind !== 'offer') return;
        held = true;
        context.tooltip.hide();
        act(index, view, action);
      }, INVENTORY.holdMs);
      hold = { pointer: event.pointerId, x: event.clientX, y: event.clientY, timer };
    });
    view.cell.addEventListener('pointermove', (event: PointerEvent): void => {
      if (hold !== null && hold.pointer === event.pointerId && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > INVENTORY.holdSlop) release();
    });
    view.cell.addEventListener('pointerup', release);
    view.cell.addEventListener('pointercancel', release);
    view.cell.addEventListener('click', (event: MouseEvent): void => {
      disarm();
      if (drag.consumeClick()) return;
      if (held) {
        held = false;
        return;
      }
      if (view.current === null) return;
      context.tooltip.hide();
      if (bookOf(context.api.world.content, baseOf(context.api.world.content, view.current)) !== null) {
        context.api.readBook(view.current);
        return;
      }
      act(index, view, bagAction(context.api.world, index, event.ctrlKey || event.metaKey ? 'ctrl' : 'click'));
    });
    view.cell.addEventListener('contextmenu', (): void => {
      const item: ItemInstance | null = view.current;
      if (item === null || held) return;
      context.tooltip.hide();
      const action: BagAction = bagAction(context.api.world, index, 'right');
      if (action.kind === 'send' && action.command.type === 'drop' && (armed === null || armed.index !== index || armed.uid !== item.uid)) {
        arm(index, view, item);
        return;
      }
      disarm();
      act(index, view, action);
    });
  }

  const markOffered = (uid: number | null): void => {
    for (const view of inventoryCells) view.cell.classList.toggle('offered', uid !== null && view.current !== null && view.current.uid === uid);
  };
  context.sale.watch(markOffered);

  return {
    element,
    refresh(): void {
      const player: PlayerState = context.api.world.player;
      let changed: boolean = false;
      for (const slot of ITEM_SLOTS) {
        const view: CellView | undefined = equipCells.get(slot);
        if (view !== undefined && setItem(view, player.equipped[slot])) changed = true;
      }
      inventoryCells.forEach((view: CellView, index: number): void => {
        if (setItem(view, player.inventory[index] ?? null)) changed = true;
      });
      markOffered(context.sale.uid());
      if (armed !== null && (player.inventory[armed.index]?.uid !== armed.uid || !element.classList.contains('open'))) disarm();
      if (changed) context.tooltip.hide();
    },
  };
}
