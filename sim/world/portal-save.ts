import type { Fields } from '../content/read.ts';
import { isFields } from '../content/read.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { withheldZones } from '../content/withheld.ts';
import { keepLive, keptToSave, PORTAL_KEEP } from './portal-keep.ts';
import type { KeptGround, KeptMonster, KeptSaved, PortalSave, PortalState } from './portal-types.ts';
import type { GroundItem, ItemInstance, RespawnPoint, World } from './types.ts';
import { respawnExists } from './zones.ts';

export interface PortalReaders {
  readonly item: (value: unknown) => ItemInstance | null;
  readonly respawn: (value: unknown) => RespawnPoint;
}

export function portalToSave(world: World): PortalSave | null {
  const portal: PortalState | null = world.portal;
  const zone: ZoneDef | undefined = portal === null ? undefined : world.content.zones.get(portal.zone);
  if (portal === null || zone === undefined) return null;
  const here: boolean = world.zone.id === portal.zone;
  const kept: KeptSaved | null = here ? keptToSave(zone, keepLive(world)) : portal.kept === null ? null : portal.kept.type === 'saved' ? portal.kept : keptToSave(zone, portal.kept);
  return { zone: portal.zone, x: portal.pos.x, z: portal.pos.z, respawn: portal.respawn, reach: portal.reach, kept };
}

export function portalFromSave(save: PortalSave | null): PortalState | null {
  if (save === null) return null;
  return { zone: save.zone, pos: { x: save.x, z: save.z }, respawn: save.respawn, reach: save.reach, kept: save.kept };
}

function finite(source: Fields, key: string): number | null {
  const value: unknown = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function whole(value: unknown, below: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < below;
}

function indices(value: unknown, below: number): number[] {
  const list: readonly unknown[] = Array.isArray(value) ? value : [];
  return [...new Set<number>(list.filter((entry: unknown): entry is number => whole(entry, below)))];
}

function keptMonster(content: Content, value: unknown): KeptMonster | null {
  if (!isFields(value)) return null;
  const monster: unknown = value['monster'];
  const group: unknown = value['group'];
  const level: unknown = value['level'];
  const x: number | null = finite(value, 'x');
  const z: number | null = finite(value, 'z');
  const life: number | null = finite(value, 'life');
  if (typeof monster !== 'string' || !content.monsters.has(monster) || !whole(group, Number.MAX_SAFE_INTEGER) || !whole(level, Number.MAX_SAFE_INTEGER) || level < 1) return null;
  if (x === null || z === null || life === null || life <= 0) return null;
  return { monster, group, level, x, z, life };
}

function keptGround(value: unknown, readers: PortalReaders): KeptGround | null {
  if (!isFields(value)) return null;
  const x: number | null = finite(value, 'x');
  const z: number | null = finite(value, 'z');
  const content: unknown = value['content'];
  if (x === null || z === null || !isFields(content)) return null;
  const amount: unknown = content['amount'];
  if (content['kind'] === 'gold') return Number.isSafeInteger(amount) && typeof amount === 'number' && amount > 0 ? { x, z, content: { kind: 'gold', amount } } : null;
  const item: ItemInstance | null = content['kind'] === 'item' ? readers.item(content['item']) : null;
  const drop: GroundItem['content'] | null = item === null ? null : { kind: 'item', item };
  return drop === null ? null : { x, z, content: drop, ...(value['discarded'] === true ? { discarded: true } : {}) };
}

function present<T>(entry: T | null): entry is T {
  return entry !== null;
}

function readKept(content: Content, zone: ZoneDef, value: unknown, readers: PortalReaders): KeptSaved | null {
  if (!isFields(value)) return null;
  const monsters: readonly unknown[] = Array.isArray(value['monsters']) ? value['monsters'] : [];
  const ground: readonly unknown[] = Array.isArray(value['ground']) ? value['ground'] : [];
  return {
    type: 'saved',
    packs: indices(value['packs'], zone.packs.length),
    roused: indices(value['roused'], zone.packs.length),
    monsters: monsters
      .slice(0, PORTAL_KEEP.monsters)
      .map((entry: unknown): KeptMonster | null => keptMonster(content, entry))
      .filter(present),
    caches: indices(value['caches'], zone.props.length),
    ground: ground
      .slice(0, PORTAL_KEEP.ground)
      .map((entry: unknown): KeptGround | null => keptGround(entry, readers))
      .filter(present),
  };
}

export function readPortal(content: Content, value: unknown, readers: PortalReaders): PortalSave | null {
  if (!isFields(value)) return null;
  const zoneId: unknown = value['zone'];
  const zone: ZoneDef | undefined = typeof zoneId === 'string' && !withheldZones(content).has(zoneId) ? content.zones.get(zoneId) : undefined;
  const x: number | null = finite(value, 'x');
  const z: number | null = finite(value, 'z');
  const reach: number | null = finite(value, 'reach');
  if (zone === undefined || zone.kind === 'town' || x === null || z === null || reach === null || reach <= 0) return null;
  const respawn: RespawnPoint = readers.respawn(value['respawn']);
  return { zone: zone.id, x, z, respawn: respawnExists(zone, respawn) ? respawn : { type: 'start' }, reach, kept: readKept(content, zone, value['kept'], readers) };
}
