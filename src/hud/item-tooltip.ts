import type { ArmourMaterial, Content, ItemBaseDef, ItemSlot, RarityDef } from '../../sim/content/types.ts';
import { compareItems } from '../../sim/item-compare.ts';
import type { StatDifference } from '../../sim/item-compare.ts';
import type { ItemLine } from '../../sim/items.ts';
import { baseOf, itemLines, itemName, rarityOf, slotOf } from '../../sim/items.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import { el, label } from './dom.ts';
import type { HudApi } from './hud-api.ts';
import { setPicture } from './item-picture.ts';

export const TOOLTIP_WORDS: { readonly unverified: string } = { unverified: 'Unverified' };

const SLOT_NAMES: Readonly<Record<ItemSlot, string>> = {
  weapon: 'Weapon',
  head: 'Headgear',
  chest: 'Body Armour',
  hands: 'Gloves',
  legs: 'Leggings',
  feet: 'Boots',
  charm: 'Charm',
};

const MATERIAL_NAMES: Readonly<Record<ArmourMaterial, string>> = {
  cloth: 'Cloth',
  leather: 'Leather',
  mail: 'Mail',
  plate: 'Plate',
};

function appendLines(parent: HTMLElement, content: Content, item: ItemInstance): void {
  const lines: ItemLine[] = itemLines(content, item);
  for (const line of lines) label(`tip-line ${line.source}`, line.text, parent);
}

function itemCard(api: HudApi, item: ItemInstance, equipped: ItemInstance | null, hint: string | null, className: string): HTMLElement {
  const content: Content = api.world.content;
  const root: HTMLDivElement = el('div', className, null);
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
  const material: ArmourMaterial | null = base?.material ?? null;
  const kind: string = slot === null ? '' : material === null ? SLOT_NAMES[slot] : `${MATERIAL_NAMES[material]} ${SLOT_NAMES[slot]}`;
  label('tip-sub', slot === null ? rarity.name : `${rarity.name} ${kind}`, heading);
  label('tip-sub', `Item level ${item.level}`, heading);
  if (api.unverified(item)) label('tip-sub tip-unverified', TOOLTIP_WORDS.unverified, heading);
  el('div', 'tip-sep', root);
  appendLines(root, content, item);
  if (equipped !== null) {
    const differences: StatDifference[] = compareItems(content, item, equipped);
    el('div', 'tip-sep', root);
    if (differences.length === 0) label('tip-sub', 'Same as equipped', root);
    for (const difference of differences) label(`tip-diff ${difference.better ? 'better' : 'worse'}`, difference.text, root);
  }
  if (hint !== null) label('tip-hint', hint, root);
  return root;
}

export function itemTooltip(api: HudApi, item: ItemInstance, equipped: ItemInstance | null, hint: string): HTMLElement {
  const pair: HTMLDivElement = el('div', 'tip-pair', null);
  pair.append(itemCard(api, item, equipped, hint, 'tip'));
  if (equipped !== null) {
    const side: HTMLElement = itemCard(api, equipped, null, null, 'tip tip-equipped');
    label('tip-sub', 'Equipped', side);
    pair.append(side);
  }
  return pair;
}
