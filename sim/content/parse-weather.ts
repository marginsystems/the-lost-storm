import type { Fields } from './read.ts';
import { ContentError, fields, nonNegative, numeric, positive, share } from './read.ts';
import type { LightningCluster, LightningKinds, ZoneLightning, ZoneMistWall, ZoneWeather } from './road-types.ts';

export const LIGHTNING_CLUSTER: LightningCluster = { chance: 0.4, most: 3, min: 1.4, max: 3.2 };

export const LIGHTNING_KINDS: LightningKinds = { sheet: 4, near: 3, fork: 1 };

export const STRIKE_SPACING: number = 1.4;

export const DEFAULT_WEATHER: ZoneWeather = {
  lightning: { first: 7, min: 7, max: 16, cluster: LIGHTNING_CLUSTER, kinds: LIGHTNING_KINDS },
  rain: 0,
  wet: 0,
  mistWall: null,
};

function cluster(value: unknown, where: string): LightningCluster {
  if (value === undefined) return LIGHTNING_CLUSTER;
  const source: Fields = fields(value, where);
  const min: number = positive(source, 'min', where);
  const max: number = positive(source, 'max', where);
  if (min < STRIKE_SPACING) throw new ContentError(`${where}.min`, `strikes in a cluster must be at least ${STRIKE_SPACING} seconds apart`);
  if (max < min) throw new ContentError(`${where}.max`, 'the longest gap in a cluster cannot be shorter than the shortest');
  return { chance: share(source, 'chance', where), most: positive(source, 'most', where), min, max };
}

function kinds(value: unknown, where: string): LightningKinds {
  if (value === undefined) return LIGHTNING_KINDS;
  const source: Fields = fields(value, where);
  const read: LightningKinds = { sheet: nonNegative(source, 'sheet', where), near: nonNegative(source, 'near', where), fork: nonNegative(source, 'fork', where) };
  if (read.sheet + read.near + read.fork <= 0) throw new ContentError(where, 'at least one kind of lightning needs a weight');
  return read;
}

function lightning(value: unknown, where: string): ZoneLightning | null {
  if (value === null) return null;
  const source: Fields = fields(value, where);
  const min: number = positive(source, 'min', where);
  const max: number = positive(source, 'max', where);
  if (max < min) throw new ContentError(`${where}.max`, 'the longest wait between strikes cannot be shorter than the shortest');
  return { first: nonNegative(source, 'first', where), min, max, cluster: cluster(source['cluster'], `${where}.cluster`), kinds: kinds(source['kinds'], `${where}.kinds`) };
}

function spot(value: unknown, where: string): { readonly x: number; readonly z: number } {
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), z: numeric(source, 'z', where) };
}

function mistWall(value: unknown, where: string): ZoneMistWall | null {
  if (value === null) return null;
  const source: Fields = fields(value, where);
  return { from: spot(source['from'], `${where}.from`), to: spot(source['to'], `${where}.to`), height: positive(source, 'height', where) };
}

export function zoneWeather(value: unknown, where: string): ZoneWeather {
  if (value === undefined) return DEFAULT_WEATHER;
  const source: Fields = fields(value, where);
  return {
    lightning: lightning(source['lightning'], `${where}.lightning`),
    rain: share(source, 'rain', where),
    wet: share(source, 'wet', where),
    mistWall: mistWall(source['mistWall'], `${where}.mistWall`),
  };
}
