import type { PropCache, PropLid, PropSeat } from './prop-types.ts';
import type { Fields } from './read.ts';
import { ContentError, fields, nonNegative, nullableText, numeric, positive, share } from './read.ts';

export function propCache(value: unknown, where: string): PropCache | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  const goldMin: number = nonNegative(source, 'goldMin', where);
  const goldMax: number = nonNegative(source, 'goldMax', where);
  if (goldMax < goldMin) throw new ContentError(`${where}.goldMax`, 'goldMax cannot be below goldMin');
  return {
    goldMin,
    goldMax,
    itemChance: share(source, 'itemChance', where),
    opened: source['opened'] === undefined ? null : nullableText(source, 'opened', where),
  };
}

export function propLid(value: unknown, where: string): PropLid | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  return { seam: positive(source, 'seam', where), hinge: numeric(source, 'hinge', where), degrees: positive(source, 'degrees', where) };
}

export function propSeat(value: unknown, where: string): PropSeat | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), z: numeric(source, 'z', where), facingDegrees: numeric(source, 'facingDegrees', where) };
}
