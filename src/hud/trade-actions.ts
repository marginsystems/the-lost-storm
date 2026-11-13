import { bookOf } from '../../sim/content/story.ts';
import type { ServiceKind } from '../../sim/content/trade-types.ts';
import { baseOf, isStoryItem } from '../../sim/items.ts';
import { sellPrice } from '../../sim/world/trade.ts';
import type { Command, ItemInstance, World } from '../../sim/world/types.ts';
import type { Prompt } from './prompts.ts';
import { alternate, promptText, use } from './prompts.ts';

export type InventoryClick = 'click' | 'ctrl' | 'right';

export type BagAction =
  | { readonly kind: 'send'; readonly command: Command }
  | { readonly kind: 'offer'; readonly uid: number }
  | { readonly kind: 'pick' }
  | { readonly kind: 'deny' };

export const INVENTORY_HINTS: Readonly<Record<'equip' | 'stash' | 'read', readonly Prompt[]>> = {
  equip: [use('equip'), alternate('drop')],
  stash: [use('stash')],
  read: [use('read')],
};

export const SALE_WORDS = {
  offer: (price: number): string => `offer for ${price} gold`,
  button: (price: number): string => `Sell · ${price} gold`,
  offerFromBag: 'offer an item from your bag',
  touchEmpty: 'Hold an item in your bag to offer it',
} as const;

export function saleEmptyText(touch: boolean): string {
  return touch ? SALE_WORDS.touchEmpty : promptText(false, alternate(SALE_WORDS.offerFromBag));
}

const AUCTION_PICK: string = 'pick to sell';

function serviceOf(world: World): ServiceKind | null {
  return world.service === null ? null : world.service.kind;
}

function send(command: Command): BagAction {
  return { kind: 'send', command };
}

export function picksForSale(world: World): boolean {
  return serviceOf(world) === 'auction';
}

function sellable(world: World, item: ItemInstance): boolean {
  return !isStoryItem(world.content, item);
}

export function bagAction(world: World, inventoryIndex: number, click: InventoryClick): BagAction {
  const item: ItemInstance | null = world.player.inventory[inventoryIndex] ?? null;
  if (item === null) return { kind: 'deny' };
  const story: boolean = isStoryItem(world.content, item);
  const kind: ServiceKind | null = serviceOf(world);
  if (kind === 'stash') return send({ type: 'trade', action: { type: 'stash', inventoryIndex } });
  if (kind === 'auction') return click === 'right' ? { kind: 'deny' } : { kind: 'pick' };
  if (click !== 'right') return send({ type: 'equip', inventoryIndex });
  if (kind === 'vendor') return sellable(world, item) ? { kind: 'offer', uid: item.uid } : { kind: 'deny' };
  return story ? { kind: 'deny' } : send({ type: 'drop', inventoryIndex });
}

export function offeredItem(world: World, uid: number | null): ItemInstance | null {
  if (uid === null || serviceOf(world) !== 'vendor') return null;
  const item: ItemInstance | null = world.player.inventory.find((held: ItemInstance | null): boolean => held !== null && held.uid === uid) ?? null;
  return item === null || !sellable(world, item) ? null : item;
}

export function saleCommand(world: World, uid: number | null): Command | null {
  const item: ItemInstance | null = offeredItem(world, uid);
  if (item === null) return null;
  return { type: 'trade', action: { type: 'sell', inventoryIndex: world.player.inventory.indexOf(item) } };
}

function vendorPrompts(world: World, item: ItemInstance): readonly Prompt[] {
  return sellable(world, item) ? [use('equip'), alternate(SALE_WORDS.offer(sellPrice(world.content, item)))] : [use('equip')];
}

const SERVICE_HINTS: Readonly<Record<ServiceKind, (world: World, item: ItemInstance) => readonly Prompt[]>> = {
  vendor: vendorPrompts,
  stash: (): readonly Prompt[] => INVENTORY_HINTS.stash,
  auction: (world: World, item: ItemInstance): readonly Prompt[] => (item.ledger === null || isStoryItem(world.content, item) ? [] : [use(AUCTION_PICK)]),
};

function inventoryPrompts(world: World, item: ItemInstance): readonly Prompt[] {
  if (bookOf(world.content, baseOf(world.content, item)) !== null) return INVENTORY_HINTS.read;
  const kind: ServiceKind | null = serviceOf(world);
  return kind === null ? INVENTORY_HINTS.equip : SERVICE_HINTS[kind](world, item);
}

export function inventoryHint(world: World, item: ItemInstance, touch: boolean): string {
  return promptText(touch, ...inventoryPrompts(world, item));
}
