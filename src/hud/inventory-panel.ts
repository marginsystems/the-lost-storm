import { bookOf } from '../../sim/content/story.ts';
import type { ItemBaseDef, ItemSlot } from '../../sim/content/types.ts';
import { ITEM_SLOTS } from '../../sim/content/types.ts';
import { baseOf, rarityOf, slotOf } from '../../sim/items.ts';
import type { ItemInstance, PlayerState } from '../../sim/world/types.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, retrigger } from './dom.ts';
import { setPicture } from './item-picture.ts';
import { itemTooltip } from './item-tooltip.ts';
import { attachTooltip } from './tooltip.ts';
import { promptText, use } from './prompts.ts';
import { inventoryCommand, inventoryHint } from './trade-actions.ts';

const INVENTORY = {
  hintEquipped: 'unequip',
} as const;

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
    if (item === null && view.current === null) return false;
    const image: string | null = item === null ? null : context.api.itemImage(item);
    if (item !== null && view.current !== null && item.uid === view.current.uid && image === view.image) {
      view.current = item;
      return false;
    }
    view.current = item;
    view.image = image;
    if (item === null) {
      view.item.classList.remove('filled');
      return true;
    }
    const base: ItemBaseDef | null = baseOf(context.api.world.content, item);
    setPicture(view.item, image, base === null ? '' : base.icon);
    view.item.style.setProperty('--rarity', rarityOf(context.api.world.content, item).color);
    view.item.classList.add('filled');
    retrigger(view.item, 'pop');
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
  for (let index: number = 0; index < context.api.world.content.player.inventorySize; index += 1) {
    const view: CellView = buildCell(grid, 'cell');
    inventoryCells.push(view);
    attachTooltip(context.tooltip, view.cell, (): HTMLElement | null => {
      const item: ItemInstance | null = view.current;
      if (item === null) return null;
      const content = context.api.world.content;
      const slot: ItemSlot | null = slotOf(content, item);
      const equipped: ItemInstance | null = slot === null ? null : context.api.world.player.equipped[slot];
      return itemTooltip(context.api, item, equipped, inventoryHint(context.api.world, item, context.api.touch));
    });
    view.cell.addEventListener('click', (event: MouseEvent): void => {
      if (view.current === null) return;
      context.tooltip.hide();
      if (bookOf(context.api.world.content, baseOf(context.api.world.content, view.current)) !== null) {
        context.api.readBook(view.current);
        return;
      }
      context.api.send(inventoryCommand(context.api.world, index, event.ctrlKey || event.metaKey ? 'ctrl' : 'click'));
    });
    view.cell.addEventListener('contextmenu', (): void => {
      if (view.current === null) return;
      context.tooltip.hide();
      context.api.send(inventoryCommand(context.api.world, index, 'right'));
    });
  }

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
      if (changed) context.tooltip.hide();
    },
  };
}
