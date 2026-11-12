import type { Fields } from './read.ts';
import { ContentError, fields, nonNegative, numeric, positive, share } from './read.ts';
import type { ZoneLightning, ZoneMistWall, ZoneWeather } from './road-types.ts';

export const DEFAULT_WEATHER: ZoneWeather = {
  lightning: { first: 7, min: 7, max: 16 },
  rain: 0,
  wet: 0,
  mistWall: null,
};

function lightning(value: unknown, where: string): ZoneLightning | null {
  if (value === null) return null;
  const source: Fields = fields(value, where);
  const min: number = positive(source, 'min', where);
  const max: number = positive(source, 'max', where);
  if (max < min) throw new ContentError(`${where}.max`, 'the longest wait between strikes cannot be shorter than the shortest');
  return { first: nonNegative(source, 'first', where), min, max };
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
