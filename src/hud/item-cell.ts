import type { ItemBaseDef, ItemSlot } from '../../sim/content/types.ts';
import { baseOf, rarityOf, slotOf } from '../../sim/items.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import type { HudContext } from './context.ts';
import { el, retrigger } from './dom.ts';
import { setPicture } from './item-picture.ts';
import { itemTooltip } from './item-tooltip.ts';
import { attachTooltip } from './tooltip.ts';

export interface ItemCell {
  readonly cell: HTMLElement;
  readonly item: HTMLElement;
  current: ItemInstance | null;
  image: string | null;
}

export function createItemCell(context: HudContext, parent: HTMLElement, hint: (item: ItemInstance) => string): ItemCell {
  const cell: HTMLDivElement = el('div', 'cell', parent);
  const item: HTMLDivElement = el('div', 'cell-item', cell);
  const view: ItemCell = { cell, item, current: null, image: null };
  attachTooltip(context.tooltip, cell, (): HTMLElement | null => {
    const shown: ItemInstance | null = view.current;
    if (shown === null) return null;
    const slot: ItemSlot | null = slotOf(context.api.world.content, shown);
    const equipped: ItemInstance | null = slot === null ? null : context.api.world.player.equipped[slot];
    return itemTooltip(context.api, shown, equipped, hint(shown));
  });
  return view;
}

export function showItem(context: HudContext, view: ItemCell, item: ItemInstance | null): boolean {
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
}
