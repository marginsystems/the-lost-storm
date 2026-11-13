import { bookOf } from '../../sim/content/story.ts';
import type { ServiceKind } from '../../sim/content/trade-types.ts';
import { baseOf, isStoryItem } from '../../sim/items.ts';
import { sellPrice } from '../../sim/world/trade.ts';
import type { Command, ItemInstance, World } from '../../sim/world/types.ts';
import type { Prompt } from './prompts.ts';
import { alternate, promptText, use } from './prompts.ts';

export type InventoryClick = 'click' | 'ctrl' | 'right';

export const INVENTORY_HINTS: Readonly<Record<'equip' | 'stash' | 'read', readonly Prompt[]>> = {
  equip: [use('equip'), alternate('drop')],
  stash: [use('stash')],
  read: [use('read')],
};

function serviceOf(world: World): ServiceKind | null {
  return world.service === null ? null : world.service.kind;
}

type InventoryAction = 'sell' | 'stash' | 'pick';

const INVENTORY_ACTIONS: Readonly<Record<ServiceKind, InventoryAction>> = { vendor: 'sell', stash: 'stash', auction: 'pick' };

const AUCTION_PICK: string = 'pick to sell';

const SERVICE_HINTS: Readonly<Record<ServiceKind, (world: World, item: ItemInstance) => readonly Prompt[]>> = {
  vendor: (world: World, item: ItemInstance): readonly Prompt[] => [use(`sell for ${sellPrice(world.content, item)} gold`)],
  stash: (): readonly Prompt[] => INVENTORY_HINTS.stash,
  auction: (world: World, item: ItemInstance): readonly Prompt[] => (item.ledger === null || isStoryItem(world.content, item) ? [] : [use(AUCTION_PICK)]),
};

export function picksForSale(world: World): boolean {
  const kind: ServiceKind | null = serviceOf(world);
  return kind !== null && INVENTORY_ACTIONS[kind] === 'pick';
}

export function inventoryCommand(world: World, inventoryIndex: number, click: InventoryClick): Command | null {
  const item: ItemInstance | null = world.player.inventory[inventoryIndex] ?? null;
  const story: boolean = item !== null && isStoryItem(world.content, item);
  const kind: ServiceKind | null = serviceOf(world);
  if (kind === null) {
    if (click !== 'right') return { type: 'equip', inventoryIndex };
    return story ? null : { type: 'drop', inventoryIndex };
  }
  const action: InventoryAction = INVENTORY_ACTIONS[kind];
  if (action === 'pick') return null;
  return story && action === 'sell' ? null : { type: 'trade', action: { type: action, inventoryIndex } };
}

function inventoryPrompts(world: World, item: ItemInstance): readonly Prompt[] {
  if (bookOf(world.content, baseOf(world.content, item)) !== null) return INVENTORY_HINTS.read;
  const kind: ServiceKind | null = serviceOf(world);
  return kind === null ? INVENTORY_HINTS.equip : SERVICE_HINTS[kind](world, item);
}

export function inventoryHint(world: World, item: ItemInstance, touch: boolean): string {
  return promptText(touch, ...inventoryPrompts(world, item));
}
