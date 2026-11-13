import type { ServiceKind, StockRarity } from '../content/trade-types.ts';
import type { Content, LineDef, PropDef, TalkDef, ZoneProp } from '../content/types.ts';
import { generateItem, isStoryItem } from '../items.ts';
import type { Vec2 } from '../math.ts';
import { distance, facingOf } from '../math.ts';
import { pickWeighted } from '../rng.ts';
import { allHold } from './conditions.ts';
import { hasNews, nextTalk, openDialogue } from './dialogue.ts';
import type { ItemInstance, NoticeReason, NpcState, PlayerState, TradeAction, VendorStock, World } from './types.ts';

export const TRADE = {
  leaveSlack: 1.5,
} as const;

export interface Station {
  readonly index: number;
  readonly placed: ZoneProp;
  readonly def: PropDef;
  readonly service: ServiceKind;
}

export function itemValue(content: Content, item: ItemInstance): number {
  const price = content.trade.price;
  const rarity: number = price.rarity[item.rarity] ?? 1;
  const level: number = 1 + price.perLevel * (item.level - 1);
  const affixes: number = 1 + price.perAffix * item.affixes.length;
  return Math.max(1, Math.round(price.base * rarity * level * affixes));
}

export function buyPrice(content: Content, item: ItemInstance): number {
  return itemValue(content, item);
}

export function sellPrice(content: Content, item: ItemInstance): number {
  return Math.max(1, Math.floor(itemValue(content, item) * content.trade.price.sellRatio));
}

export function emptyStash(content: Content): (ItemInstance | null)[] {
  return Array.from({ length: content.trade.stashSize }, (): ItemInstance | null => null);
}

export function stationAt(world: World, index: number): Station | null {
  const placed: ZoneProp | undefined = world.zone.props[index];
  if (placed === undefined) return null;
  const def: PropDef | undefined = world.content.props.get(placed.prop);
  if (def === undefined || def.service === null || !allHold(world, placed.when)) return null;
  return { index, placed, def, service: def.service };
}

export function stationNear(world: World, point: Vec2): Station | null {
  for (let index: number = 0; index < world.zone.props.length; index += 1) {
    const station: Station | null = stationAt(world, index);
    if (station !== null && distance(point, station.placed) <= station.def.blockRadius + world.content.player.radius) return station;
  }
  return null;
}

export function stationReach(world: World, station: Station): number {
  return world.content.trade.reach + station.def.blockRadius;
}

function rollStock(world: World): (ItemInstance | null)[] {
  const content: Content = world.content;
  const stock: (ItemInstance | null)[] = [];
  for (let index: number = 0; index < content.trade.stockSize; index += 1) {
    const rarity: StockRarity | null = pickWeighted(world.rng, content.trade.stockRarities);
    const item: ItemInstance | null = rarity === null ? null : generateItem(content, world.rng, world.nextItemUid, world.player.level, null, rarity.rarity);
    if (item !== null) world.nextItemUid += 1;
    stock.push(item);
  }
  return stock;
}

export function vendorStock(world: World, owner: string): VendorStock {
  const existing: VendorStock | undefined = world.vendors[owner];
  const vendor: VendorStock = existing ?? { stock: [], buyback: [], stale: true };
  if (vendor.stale) {
    vendor.stock = rollStock(world);
    vendor.stale = false;
  }
  world.vendors[owner] = vendor;
  return vendor;
}

function open(world: World, kind: ServiceKind, owner: string, anchor: Vec2): void {
  world.service = { kind, owner, anchor: { x: anchor.x, z: anchor.z } };
  if (kind === 'vendor') vendorStock(world, owner);
}

function greet(world: World, npc: NpcState): void {
  const talk: TalkDef | null = nextTalk(world, npc.def);
  const lineId: string | undefined = talk === null ? undefined : talk.lines[world.rng.int(0, talk.lines.length - 1)];
  const line: LineDef | undefined = lineId === undefined ? undefined : world.content.lines.get(lineId);
  if (line !== undefined) world.events.push({ type: 'bark', speaker: npc.def.id, line });
}

export function meetNpc(world: World, npc: NpcState): void {
  const service: ServiceKind | null = npc.def.service;
  if (service === null || hasNews(world, npc.def)) {
    openDialogue(world, npc);
    return;
  }
  const toward: Vec2 = { x: world.player.pos.x - npc.pos.x, z: world.player.pos.z - npc.pos.z };
  if (Math.hypot(toward.x, toward.z) > 1e-3) world.player.facing = facingOf({ x: -toward.x, z: -toward.z });
  greet(world, npc);
  open(world, service, npc.def.id, npc.pos);
}

export function openStation(world: World, station: Station): void {
  open(world, station.service, station.def.id, station.placed);
}

export function closeService(world: World): void {
  world.service = null;
}

function notice(world: World, reason: NoticeReason): void {
  world.events.push({ type: 'notice', reason });
}

function changed(world: World): void {
  world.events.push({ type: 'character_changed' });
}

function receive(world: World, item: ItemInstance): boolean {
  const free: number = world.player.inventory.indexOf(null);
  if (free < 0) {
    notice(world, 'inventory_full');
    return false;
  }
  world.player.inventory[free] = item;
  return true;
}

function pay(world: World, price: number): boolean {
  if (world.player.gold < price) {
    notice(world, 'no_gold');
    return false;
  }
  return true;
}

function buy(world: World, vendor: VendorStock, index: number): void {
  const item: ItemInstance | null = vendor.stock[index] ?? null;
  if (item === null) return;
  const price: number = buyPrice(world.content, item);
  if (!pay(world, price) || !receive(world, item)) return;
  world.player.gold -= price;
  vendor.stock[index] = null;
  changed(world);
}

function sell(world: World, vendor: VendorStock, inventoryIndex: number): void {
  const player: PlayerState = world.player;
  const item: ItemInstance | null = player.inventory[inventoryIndex] ?? null;
  if (item === null || isStoryItem(world.content, item)) return;
  player.inventory[inventoryIndex] = null;
  player.gold += sellPrice(world.content, item);
  vendor.buyback = [item, ...vendor.buyback].slice(0, world.content.trade.buybackSize);
  changed(world);
}

function buyBack(world: World, vendor: VendorStock, index: number): void {
  const item: ItemInstance | undefined = vendor.buyback[index];
  if (item === undefined) return;
  const price: number = sellPrice(world.content, item);
  if (!pay(world, price) || !receive(world, item)) return;
  world.player.gold -= price;
  vendor.buyback = vendor.buyback.filter((_: ItemInstance, at: number): boolean => at !== index);
  changed(world);
}

function stash(world: World, inventoryIndex: number): void {
  const player: PlayerState = world.player;
  const item: ItemInstance | null = player.inventory[inventoryIndex] ?? null;
  if (item === null) return;
  const free: number = world.stash.indexOf(null);
  if (free < 0) {
    notice(world, 'stash_full');
    return;
  }
  world.stash[free] = item;
  player.inventory[inventoryIndex] = null;
  changed(world);
}

function unstash(world: World, index: number): void {
  const item: ItemInstance | null = world.stash[index] ?? null;
  if (item === null || !receive(world, item)) return;
  world.stash[index] = null;
  changed(world);
}

export function handleTrade(world: World, action: TradeAction): void {
  const service = world.service;
  if (action.type === 'close' || service === null || !world.player.alive) {
    closeService(world);
    return;
  }
  const vendor: VendorStock | null = service.kind === 'vendor' ? vendorStock(world, service.owner) : null;
  switch (action.type) {
    case 'buy':
      if (vendor !== null) buy(world, vendor, action.index);
      return;
    case 'sell':
      if (vendor !== null) sell(world, vendor, action.inventoryIndex);
      return;
    case 'buy_back':
      if (vendor !== null) buyBack(world, vendor, action.index);
      return;
    case 'stash':
      if (service.kind === 'stash') stash(world, action.inventoryIndex);
      return;
    case 'unstash':
      if (service.kind === 'stash') unstash(world, action.index);
      return;
  }
}

export function stepTrade(world: World): void {
  if (world.tradeZone !== world.zone.id) {
    world.tradeZone = world.zone.id;
    for (const vendor of Object.values(world.vendors)) vendor.stale = true;
    closeService(world);
    return;
  }
  const service = world.service;
  if (service === null) return;
  const away: boolean = distance(world.player.pos, service.anchor) > world.content.trade.reach + TRADE.leaveSlack;
  if (away || !world.player.alive || world.dialogue !== null) closeService(world);
}
