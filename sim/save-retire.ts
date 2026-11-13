import { heroWears } from './content/item-rules.ts';
import type { Content } from './content/types.ts';
import { ITEM_SLOTS } from './content/types.ts';
import type { SaveData } from './save.ts';
import { sellPrice } from './world/trade.ts';
import type { Equipment, ItemInstance, VendorStock } from './world/types.ts';

export function heroCanWear(content: Content, item: ItemInstance): boolean {
  const base = content.itemBases.get(item.base);
  return base === undefined || heroWears(content, base);
}

class Refund {
  total: number = 0;

  private readonly content: Content;

  constructor(content: Content) {
    this.content = content;
  }

  keep(item: ItemInstance | null): ItemInstance | null {
    if (item === null || heroCanWear(this.content, item)) return item;
    this.total += sellPrice(this.content, item);
    return null;
  }
}

function present(item: ItemInstance | null): item is ItemInstance {
  return item !== null;
}

function vendor(content: Content, stock: VendorStock): VendorStock {
  const shelf: (ItemInstance | null)[] = stock.stock.map((item: ItemInstance | null): ItemInstance | null => (item === null || heroCanWear(content, item) ? item : null));
  const buyback: ItemInstance[] = stock.buyback.filter((item: ItemInstance): boolean => heroCanWear(content, item));
  const changed: boolean = shelf.some((item: ItemInstance | null, index: number): boolean => item !== stock.stock[index]) || buyback.length !== stock.buyback.length;
  return { stock: shelf, buyback, stale: stock.stale || changed };
}

export function retireUnworn(content: Content, save: SaveData): SaveData {
  const refund: Refund = new Refund(content);
  const equipped: Equipment = { ...save.equipped };
  for (const slot of ITEM_SLOTS) equipped[slot] = refund.keep(equipped[slot]);
  const inventory: (ItemInstance | null)[] = save.inventory.map((item: ItemInstance | null): ItemInstance | null => refund.keep(item));
  const stash: (ItemInstance | null)[] = save.stash.map((item: ItemInstance | null): ItemInstance | null => refund.keep(item));
  const spilled: ItemInstance[] = save.spilled.map((item: ItemInstance): ItemInstance | null => refund.keep(item)).filter(present);
  const vendors: Record<string, VendorStock> = {};
  for (const [id, stock] of Object.entries(save.vendors)) vendors[id] = vendor(content, stock);
  return { ...save, gold: save.gold + refund.total, equipped, inventory, stash, spilled, vendors };
}
