import type { Content, QuestDef, ZoneDef } from './content/types.ts';
import { isFields } from './content/read.ts';
import type { Fields } from './content/read.ts';
import type { SaveData } from './save.ts';
import type { World, WorldEvent } from './world/types.ts';

export const TALLY = {
  ceiling: 1_000_000_000_000,
} as const;

export interface Tally {
  bosses: number;
  deaths: number;
  biggestHit: number;
  goldLooted: number;
  played: number;
  moments: number;
  restraint: number;
  found: Record<string, number>;
}

export type TallySave = Readonly<Omit<Tally, 'found'>> & { readonly found: Readonly<Record<string, number>> };

export interface PlayerStats {
  readonly played: number;
  readonly kills: number;
  readonly bosses: number;
  readonly deaths: number;
  readonly level: number;
  readonly furthest: string;
  readonly goldLooted: number;
  readonly found: Readonly<Record<string, number>>;
  readonly biggestHit: number;
  readonly quests: number;
  readonly moments: number;
}

export type StatsSubject = Pick<SaveData, 'kills' | 'level' | 'zone' | 'visited' | 'quests' | 'tally'>;

export function emptyTally(): Tally {
  return { bosses: 0, deaths: 0, biggestHit: 0, goldLooted: 0, played: 0, moments: 0, restraint: 0, found: {} };
}

export function tallyToSave(tally: Tally): TallySave {
  return { ...tally, found: { ...tally.found } };
}

export function copyTally(tally: TallySave): Tally {
  return { ...tally, found: { ...tally.found } };
}

function amount(source: Fields, key: string): number {
  const value: unknown = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, TALLY.ceiling);
}

function whole(source: Fields, key: string): number {
  return Math.floor(amount(source, key));
}

function readFound(content: Content, value: unknown): Record<string, number> {
  const found: Record<string, number> = {};
  if (!isFields(value)) return found;
  for (const rarity of content.rarities) {
    const counted: number = whole(value, rarity.id);
    if (counted > 0) found[rarity.id] = counted;
  }
  return found;
}

export function readTally(content: Content, value: unknown): TallySave {
  if (!isFields(value)) return tallyToSave(emptyTally());
  return {
    bosses: whole(value, 'bosses'),
    deaths: whole(value, 'deaths'),
    biggestHit: whole(value, 'biggestHit'),
    goldLooted: whole(value, 'goldLooted'),
    played: amount(value, 'played'),
    moments: whole(value, 'moments'),
    restraint: whole(value, 'restraint'),
    found: readFound(content, value['found']),
  };
}

function countEvent(world: World, tally: Tally, event: WorldEvent): void {
  if (event.type === 'death' && event.actorId === world.player.id) tally.deaths += 1;
  else if (event.type === 'boss_defeated') tally.bosses += 1;
  else if (event.type === 'damage' && event.sourceId === world.player.id && event.targetTeam === 'monster') tally.biggestHit = Math.max(tally.biggestHit, Math.floor(event.amount));
  else if (event.type === 'pickup' && event.ground.content.kind === 'gold') tally.goldLooted += event.ground.content.amount;
  else if (event.type === 'moment_ended' && event.outcome === 'resolved') tally.moments += 1;
  else if (event.type === 'moment_ended' && event.outcome === 'played' && event.moment.chest === 'closed') tally.restraint += 1;
  else if (event.type === 'item_found') tally.found[event.rarity] = (tally.found[event.rarity] ?? 0) + 1;
}

export function stepTally(world: World, dt: number): void {
  const tally: Tally = world.player.tally;
  tally.played += dt;
  for (const event of world.events) countEvent(world, tally, event);
}

function isFurther(content: Content, zone: ZoneDef, best: ZoneDef): boolean {
  if (zone.level !== best.level) return zone.level > best.level;
  return best.id === content.world.opening && zone.id !== best.id;
}

export function furthestZone(content: Content, subject: Pick<SaveData, 'zone' | 'visited'>): string {
  let best: ZoneDef | null = null;
  for (const id of [subject.zone, ...subject.visited]) {
    const zone: ZoneDef | undefined = content.zones.get(id);
    if (zone !== undefined && (best === null || isFurther(content, zone, best))) best = zone;
  }
  return best === null ? content.world.start : best.id;
}

export function questsDone(content: Content, quests: Readonly<Record<string, number>>): number {
  return [...content.quests.values()].filter((quest: QuestDef): boolean => (quests[quest.id] ?? -1) >= quest.objectives.length).length;
}

export function playerStats(content: Content, subject: StatsSubject): PlayerStats {
  return {
    played: subject.tally.played,
    kills: subject.kills,
    bosses: subject.tally.bosses,
    deaths: subject.tally.deaths,
    level: subject.level,
    furthest: furthestZone(content, subject),
    goldLooted: subject.tally.goldLooted,
    found: { ...subject.tally.found },
    biggestHit: subject.tally.biggestHit,
    quests: questsDone(content, subject.quests),
    moments: subject.tally.moments,
  };
}
