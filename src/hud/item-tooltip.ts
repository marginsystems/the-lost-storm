import type { Content, ItemBaseDef, ItemSlot, RarityDef } from '../../sim/content/types.ts';
import type { ItemLine } from '../../sim/items.ts';
import { baseOf, itemLines, itemName, rarityOf, slotOf } from '../../sim/items.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import { el, label } from './dom.ts';
import type { HudApi } from './hud-api.ts';
import { setPicture } from './item-picture.ts';

const SLOT_NAMES: Readonly<Record<ItemSlot, string>> = {
  weapon: 'Weapon',
  head: 'Headgear',
  chest: 'Body Armour',
  hands: 'Gloves',
  legs: 'Leggings',
  feet: 'Boots',
  charm: 'Charm',
};

function appendLines(parent: HTMLElement, content: Content, item: ItemInstance): void {
  const lines: ItemLine[] = itemLines(content, item);
  for (const line of lines) label(`tip-line ${line.source}`, line.text, parent);
}

export function itemTooltip(api: HudApi, item: ItemInstance, equipped: ItemInstance | null, hint: string): HTMLElement {
  const content: Content = api.world.content;
  const root: HTMLDivElement = el('div', 'tip', null);
  const rarity: RarityDef = rarityOf(content, item);
  const slot: ItemSlot | null = slotOf(content, item);
  const base: ItemBaseDef | null = baseOf(content, item);
  const head: HTMLDivElement = el('div', 'tip-head', root);
  const picture: HTMLDivElement = el('div', 'tip-picture', head);
  picture.style.setProperty('--rarity', rarity.color);
  setPicture(picture, api.itemImage(item), base === null ? '' : base.icon);
  const heading: HTMLDivElement = el('div', 'tip-heading', head);
  const title: HTMLDivElement = label('tip-title', itemName(content, item), heading);
  title.style.color = rarity.color;
  label('tip-sub', slot === null ? rarity.name : `${rarity.name} ${SLOT_NAMES[slot]}`, heading);
  label('tip-sub', `Item level ${item.level}`, heading);
  el('div', 'tip-sep', root);
  appendLines(root, content, item);
  if (equipped !== null) {
    el('div', 'tip-sep', root);
    label('tip-sub', 'Currently equipped', root);
    const name: HTMLDivElement = label('tip-name', itemName(content, equipped), root);
    name.style.color = rarityOf(content, equipped).color;
    appendLines(root, content, equipped);
  }
  label('tip-hint', hint, root);
  return root;
}
