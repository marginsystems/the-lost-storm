import { isFields } from '../content/read.ts';
import { distance } from '../math.ts';
import type { PathAct, PathEntry, PathLog, PathLogSave } from './glitch-types.ts';
import { PATH_ACTS } from './glitch-types.ts';
import type { World, WorldEvent } from './types.ts';

export const PATH_LOG = {
  version: 1,
  cap: 1200,
  stride: 3,
  precision: 10,
} as const;

export function emptyPathLog(): PathLog {
  return { entries: [], clock: 0 };
}

const NOTABLE: Readonly<Partial<Record<WorldEvent['type'], PathAct>>> = {
  zone_changed: 'zone',
  level_up: 'level',
  quest_completed: 'quest',
  glitch_start: 'glitch',
};

function actOf(event: WorldEvent): PathAct | null {
  if (event.type === 'death') return event.team === 'monster' ? 'kill' : 'death';
  return NOTABLE[event.type] ?? null;
}

export function compactPath(entries: readonly PathEntry[], cap: number): PathEntry[] {
  if (entries.length <= cap) return [...entries];
  const half: number = Math.floor(entries.length / 2);
  let keep: boolean = false;
  const thinned: PathEntry[] = entries.filter((entry: PathEntry, index: number): boolean => {
    if (index >= half || entry.act !== 'step') return true;
    keep = !keep;
    return keep;
  });
  let excess: number = thinned.length - cap;
  const stepsDropped: PathEntry[] = thinned.filter((entry: PathEntry): boolean => {
    if (excess <= 0 || entry.act !== 'step') return true;
    excess -= 1;
    return false;
  });
  return stepsDropped.length > cap ? stepsDropped.slice(stepsDropped.length - cap) : stepsDropped;
}

function push(world: World, entry: PathEntry): void {
  const log: PathLog = world.path;
  world.events.push({ type: 'path_marked', act: entry.act });
  log.entries.push(entry);
  if (log.entries.length > PATH_LOG.cap) log.entries = compactPath(log.entries, PATH_LOG.cap);
}

function round(value: number): number {
  return Math.round(value * PATH_LOG.precision) / PATH_LOG.precision;
}

function entryAt(world: World, act: PathAct): PathEntry {
  return { t: round(world.path.clock), zone: world.zone.id, x: round(world.player.pos.x), z: round(world.player.pos.z), act };
}

export function recordPath(world: World, dt: number): void {
  const log: PathLog = world.path;
  log.clock += dt;
  const acts: PathAct[] = world.events.map(actOf).filter((act: PathAct | null): act is PathAct => act !== null);
  for (const act of acts) push(world, entryAt(world, act));
  if (strayed(world)) push(world, entryAt(world, 'step'));
}

function strayed(world: World): boolean {
  const last: PathEntry | undefined = world.path.entries.at(-1);
  return last === undefined || last.zone !== world.zone.id || distance(last, world.player.pos) >= PATH_LOG.stride;
}

export function markStart(world: World): void {
  if (strayed(world)) world.path.entries.push(entryAt(world, 'step'));
}

export function pathToSave(log: PathLog): PathLogSave {
  const zones: string[] = [];
  const entries: number[][] = log.entries.map((entry: PathEntry): number[] => {
    let zone: number = zones.indexOf(entry.zone);
    if (zone < 0) {
      zone = zones.length;
      zones.push(entry.zone);
    }
    return [Math.round(entry.t * PATH_LOG.precision), zone, Math.round(entry.x * PATH_LOG.precision), Math.round(entry.z * PATH_LOG.precision), PATH_ACTS.indexOf(entry.act)];
  });
  return { version: PATH_LOG.version, zones, entries };
}

function readEntry(value: unknown, zones: readonly (string | null)[]): PathEntry | null {
  if (!Array.isArray(value)) return null;
  const list: readonly unknown[] = value;
  const [t, zone, x, z, act]: readonly unknown[] = list;
  if (typeof t !== 'number' || typeof zone !== 'number' || typeof x !== 'number' || typeof z !== 'number' || typeof act !== 'number') return null;
  if (!Number.isFinite(t) || !Number.isFinite(x) || !Number.isFinite(z) || t < 0) return null;
  const zoneId: string | null = zones[zone] ?? null;
  const actId: PathAct | undefined = PATH_ACTS[act];
  if (zoneId === null || actId === undefined) return null;
  return { t: t / PATH_LOG.precision, zone: zoneId, x: x / PATH_LOG.precision, z: z / PATH_LOG.precision, act: actId };
}

export function readPathLog(value: unknown, knownZones: ReadonlySet<string>): PathLog {
  if (!isFields(value) || value['version'] !== PATH_LOG.version) return emptyPathLog();
  const zones: unknown = value['zones'];
  const entries: unknown = value['entries'];
  if (!Array.isArray(zones) || !Array.isArray(entries)) return emptyPathLog();
  const zoneList: readonly unknown[] = zones;
  const entryList: readonly unknown[] = entries;
  const names: (string | null)[] = zoneList.map((zone: unknown): string | null => (typeof zone === 'string' && knownZones.has(zone) ? zone : null));
  const read: PathEntry[] = entryList.map((entry: unknown): PathEntry | null => readEntry(entry, names)).filter((entry: PathEntry | null): entry is PathEntry => entry !== null);
  const kept: PathEntry[] = compactPath(read, PATH_LOG.cap);
  return { entries: kept, clock: kept.at(-1)?.t ?? 0 };
}
