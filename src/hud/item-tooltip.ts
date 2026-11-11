import type { Content, ItemSlot, RarityDef } from '../../sim/content/types.ts';
import type { ItemLine } from '../../sim/items.ts';
import { itemLines, itemName, rarityOf, slotOf } from '../../sim/items.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import { el, label } from './dom.ts';

const SLOT_NAMES: Readonly<Record<ItemSlot, string>> = {
  weapon: 'Weapon',
  armour: 'Armour',
  charm: 'Charm',
};

function appendLines(parent: HTMLElement, content: Content, item: ItemInstance): void {
  const lines: ItemLine[] = itemLines(content, item);
  for (const line of lines) label(`tip-line ${line.source}`, line.text, parent);
}

export function itemTooltip(content: Content, item: ItemInstance, equipped: ItemInstance | null, hint: string): HTMLElement {
  const root: HTMLDivElement = el('div', 'tip', null);
  const rarity: RarityDef = rarityOf(content, item);
  const slot: ItemSlot | null = slotOf(content, item);
  const title: HTMLDivElement = label('tip-title', itemName(content, item), root);
  title.style.color = rarity.color;
  label('tip-sub', slot === null ? rarity.name : `${rarity.name} ${SLOT_NAMES[slot]}`, root);
  label('tip-sub', `Item level ${item.level}`, root);
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
