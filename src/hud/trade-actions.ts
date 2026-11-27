import { bookOf } from '../../sim/content/story.ts';
import type { ServiceKind } from '../../sim/content/trade-types.ts';
import { identifyCost, isUnidentified } from '../../sim/identify.ts';
import { baseOf, isStoryItem } from '../../sim/items.ts';
import { buysBack, sellPrice } from '../../sim/world/trade.ts';
import type { Command, ItemInstance, World } from '../../sim/world/types.ts';
import { UNSELLABLE_HINT } from '../auction/auction-model.ts';
import type { Prompt } from './prompts.ts';
import { alternate, promptText, use } from './prompts.ts';

export type InventoryClick = 'click' | 'ctrl' | 'right';

export type BagAction =
  | { readonly kind: 'send'; readonly command: Command }
  | { readonly kind: 'offer'; readonly uid: number }
  | { readonly kind: 'pick' }
  | { readonly kind: 'deny' };

export const INVENTORY_HINTS: Readonly<Record<'equip' | 'stash' | 'read' | 'use', readonly Prompt[]>> = {
  equip: [use('equip'), alternate('drop')],
  use: [use('use'), alternate('drop')],
  stash: [use('stash')],
  read: [use('read')],
};

export const IDENTIFY_WORDS = {
  prompt: (price: number): string => `identify for ${price} gold`,
  unworn: 'drop',
} as const;

export const SALE_WORDS = {
  offer: (price: number): string => `offer for ${price} gold`,
  button: (price: number): string => `Sell · ${price} gold`,
  touchEmpty: 'Hold each bag item to select it for sale',
} as const;

export function saleEmptyText(touch: boolean): string {
  return touch ? SALE_WORDS.touchEmpty : 'Shift-click or right-click bag items to select them';
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
  return buysBack(world, item);
}

function usable(world: World, item: ItemInstance): boolean {
  return (baseOf(world.content, item)?.use ?? null) !== null;
}

export function bagAction(world: World, inventoryIndex: number, click: InventoryClick): BagAction {
  const item: ItemInstance | null = world.player.inventory[inventoryIndex] ?? null;
  if (item === null) return { kind: 'deny' };
  const story: boolean = isStoryItem(world.content, item);
  const kind: ServiceKind | null = serviceOf(world);
  if (kind === 'stash') return send({ type: 'trade', action: { type: 'stash', inventoryIndex } });
  if (kind === 'auction') return click === 'right' ? { kind: 'deny' } : { kind: 'pick' };
  if (kind === 'identify' && click !== 'right' && isUnidentified(item)) return send({ type: 'trade', action: { type: 'identify', place: 'bag', index: inventoryIndex } });
  if (click !== 'right') return send(usable(world, item) ? { type: 'use_item', inventoryIndex } : { type: 'equip', inventoryIndex });
  if (kind === 'vendor') return sellable(world, item) ? { kind: 'offer', uid: item.uid } : { kind: 'deny' };
  return story ? { kind: 'deny' } : send({ type: 'drop', inventoryIndex });
}

export function offeredItem(world: World, uid: number | null): ItemInstance | null {
  if (uid === null || serviceOf(world) !== 'vendor') return null;
  const item: ItemInstance | null = world.player.inventory.find((held: ItemInstance | null): boolean => held !== null && held.uid === uid) ?? null;
  return item === null || !sellable(world, item) ? null : item;
}

export function saleCommand(world: World, selected: readonly number[]): Command | null {
  const uids = selected.filter((uid: number): boolean => offeredItem(world, uid) !== null);
  return uids.length === 0 ? null : { type: 'trade', action: { type: 'sell_many', uids } };
}

function wearPrompts(world: World, item: ItemInstance): readonly Prompt[] {
  if (usable(world, item)) return INVENTORY_HINTS.use;
  return isUnidentified(item) ? [alternate(IDENTIFY_WORDS.unworn)] : INVENTORY_HINTS.equip;
}

function vendorPrompts(world: World, item: ItemInstance): readonly Prompt[] {
  const verbs: readonly Prompt[] = usable(world, item) ? [use('use')] : isUnidentified(item) ? [] : [use('equip')];
  return sellable(world, item) ? [...verbs, alternate(SALE_WORDS.offer(sellPrice(world.content, item)))] : verbs;
}

function identifyPrompts(world: World, item: ItemInstance): readonly Prompt[] {
  return isUnidentified(item) ? [use(IDENTIFY_WORDS.prompt(identifyCost(world.content, item)))] : wearPrompts(world, item);
}

const SERVICE_HINTS: Readonly<Record<ServiceKind, (world: World, item: ItemInstance) => readonly Prompt[]>> = {
  vendor: vendorPrompts,
  stash: (): readonly Prompt[] => INVENTORY_HINTS.stash,
  auction: (world: World, item: ItemInstance): readonly Prompt[] => (item.ledger === null || isStoryItem(world.content, item) || isUnidentified(item) ? [] : [use(AUCTION_PICK)]),
  identify: identifyPrompts,
  porter: wearPrompts,
  descent: (world: World, item: ItemInstance): readonly Prompt[] => (usable(world, item) ? INVENTORY_HINTS.use : isUnidentified(item) ? [] : INVENTORY_HINTS.equip),
};

function inventoryPrompts(world: World, item: ItemInstance): readonly Prompt[] {
  if (bookOf(world.content, baseOf(world.content, item)) !== null) return INVENTORY_HINTS.read;
  const kind: ServiceKind | null = serviceOf(world);
  if (kind === null) return wearPrompts(world, item);
  return SERVICE_HINTS[kind](world, item);
}

export function unsellable(world: World, item: ItemInstance, unverified: boolean): boolean {
  return unverified && !isStoryItem(world.content, item);
}

export function inventoryHint(world: World, item: ItemInstance, touch: boolean, unverified: boolean): string {
  if (serviceOf(world) === 'auction' && unsellable(world, item, unverified)) return UNSELLABLE_HINT;
  return promptText(touch, ...inventoryPrompts(world, item));
}
