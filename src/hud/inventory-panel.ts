import type { ItemBaseDef, ItemSlot } from '../../sim/content/types.ts';
import { ITEM_SLOTS } from '../../sim/content/types.ts';
import { baseOf, rarityOf, slotOf } from '../../sim/items.ts';
import { armourReduction, damagePerSecond } from '../../sim/stats.ts';
import type { ItemInstance, PlayerState } from '../../sim/world/types.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, retrigger, setText } from './dom.ts';
import { setPicture } from './item-picture.ts';
import { itemTooltip } from './item-tooltip.ts';
import { attachTooltip } from './tooltip.ts';

const INVENTORY = {
  hintInventory: 'Click to equip · Right click to drop',
  hintEquipped: 'Click to unequip',
} as const;

const SLOT_TITLES: Readonly<Record<ItemSlot, string>> = {
  weapon: 'Weapon',
  armour: 'Armour',
  charm: 'Charm',
};

interface CellView {
  readonly cell: HTMLElement;
  readonly item: HTMLElement;
  current: ItemInstance | null;
}

interface SheetRow {
  readonly name: string;
  read(player: PlayerState): string;
}

const percent = (ratio: number, digits: number): string => `${(ratio * 100).toFixed(digits)}%`;

const SHEET_ROWS: readonly SheetRow[] = [
  { name: 'Level', read: (player: PlayerState): string => String(player.level) },
  {
    name: 'Damage',
    read: (player: PlayerState): string => {
      const scale: number = 1 + player.stats.damagePercent;
      return `${Math.round(player.stats.damageMin * scale)}–${Math.round(player.stats.damageMax * scale)}`;
    },
  },
  {
    name: 'Damage per second',
    read: (player: PlayerState): string => {
      const skill = player.skills[0];
      return skill === undefined ? '0' : damagePerSecond(player.stats, skill).toFixed(1);
    },
  },
  { name: 'Life', read: (player: PlayerState): string => String(Math.round(player.maxLife)) },
  { name: 'Mana', read: (player: PlayerState): string => String(Math.round(player.stats.maxMana)) },
  {
    name: 'Armour',
    read: (player: PlayerState): string => `${Math.round(player.stats.armour)} (${percent(armourReduction(player.stats.armour), 0)})`,
  },
  { name: 'Attack speed', read: (player: PlayerState): string => percent(player.stats.attackSpeed, 0) },
  { name: 'Critical chance', read: (player: PlayerState): string => percent(player.stats.critChance, 1) },
  { name: 'Move speed', read: (player: PlayerState): string => player.stats.moveSpeed.toFixed(1) },
  { name: 'Gold found', read: (player: PlayerState): string => percent(player.stats.goldFind, 0) },
];

function buildCell(cellParent: HTMLElement, className: string): CellView {
  const cell: HTMLDivElement = el('div', className, cellParent);
  const item: HTMLDivElement = el('div', 'cell-item', cell);
  return { cell, item, current: null };
}

export function createInventoryPanel(parent: HTMLElement, context: HudContext): PanelView {
  const element: HTMLDivElement = el('div', 'hud-panel right', parent);
  element.addEventListener('contextmenu', (event: MouseEvent): void => {
    event.preventDefault();
  });
  label('panel-title', 'Inventory', element);

  const equipRow: HTMLDivElement = el('div', 'equip-row', element);
  const grid: HTMLDivElement = el('div', 'inv-grid', element);
  label('panel-subtitle', 'Character', element);
  const sheet: HTMLDivElement = el('div', 'sheet', element);

  const setItem = (view: CellView, item: ItemInstance | null): boolean => {
    if (item === null && view.current === null) return false;
    if (item !== null && view.current !== null && item.uid === view.current.uid) {
      view.current = item;
      return false;
    }
    view.current = item;
    if (item === null) {
      view.item.classList.remove('filled');
      return true;
    }
    const base: ItemBaseDef | null = baseOf(context.api.world.content, item);
    setPicture(view.item, context.api.itemImage(item), base === null ? '' : base.icon);
    view.item.style.setProperty('--rarity', rarityOf(context.api.world.content, item).color);
    view.item.classList.add('filled');
    retrigger(view.item, 'pop');
    return true;
  };

  const equipCells: Map<ItemSlot, CellView> = new Map<ItemSlot, CellView>();
  for (const slot of ITEM_SLOTS) {
    const holder: HTMLDivElement = el('div', 'equip', equipRow);
    const view: CellView = buildCell(holder, 'cell big');
    label('equip-name', SLOT_TITLES[slot], holder);
    equipCells.set(slot, view);
    attachTooltip(context.tooltip, view.cell, (): HTMLElement | null =>
      view.current === null ? null : itemTooltip(context.api, view.current, null, INVENTORY.hintEquipped),
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
      return itemTooltip(context.api, item, equipped, INVENTORY.hintInventory);
    });
    view.cell.addEventListener('click', (): void => {
      if (view.current === null) return;
      context.tooltip.hide();
      context.api.send({ type: 'equip', inventoryIndex: index });
    });
    view.cell.addEventListener('contextmenu', (): void => {
      if (view.current === null) return;
      context.tooltip.hide();
      context.api.send({ type: 'drop', inventoryIndex: index });
    });
  }

  const sheetValues: HTMLElement[] = SHEET_ROWS.map((row: SheetRow): HTMLElement => {
    const line: HTMLDivElement = el('div', 'sheet-row', sheet);
    label('sheet-name', row.name, line);
    return el('div', 'sheet-value', line);
  });

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
      SHEET_ROWS.forEach((row: SheetRow, index: number): void => {
        const value: HTMLElement | undefined = sheetValues[index];
        if (value !== undefined) setText(value, row.read(player), true);
      });
    },
  };
}
