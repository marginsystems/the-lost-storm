import type { ReadonlyVec2 } from '../math.ts';
import type { PropDef } from './prop-types.ts';
import type { Fields } from './read.ts';
import { ContentError, fields, items, numeric } from './read.ts';

export const SOLID = {
  knee: 0.4,
  least: 0.15,
} as const;

export type Outline = readonly ReadonlyVec2[];

export interface ModelFootprint {
  readonly height: number;
  readonly outlines: readonly Outline[];
}

function corner(value: unknown, where: string): ReadonlyVec2 {
  const pair: readonly unknown[] = items(value, where);
  const [x, z] = pair;
  if (pair.length !== 2 || typeof x !== 'number' || typeof z !== 'number') throw new ContentError(where, 'expected an [x, z] pair of numbers');
  return { x, z };
}

export function outlineArea(outline: readonly ReadonlyVec2[]): number {
  let twice: number = 0;
  outline.forEach((point: ReadonlyVec2, index: number): void => {
    const next: ReadonlyVec2 = outline[(index + 1) % outline.length] ?? point;
    twice += point.x * next.z - next.x * point.z;
  });
  return Math.abs(twice) / 2;
}

export function modelFootprints(value: unknown, where: string): ReadonlyMap<string, ModelFootprint> {
  const source: Fields = fields(value, where);
  const made: Map<string, ModelFootprint> = new Map<string, ModelFootprint>();
  for (const model of Object.keys(source)) {
    const entry: Fields = fields(source[model], `${where}.${model}`);
    const outlines: Outline[] = items(entry['outlines'], `${where}.${model}.outlines`).map((listed: unknown, piece: number): Outline => {
      const outline: ReadonlyVec2[] = items(listed, `${where}.${model}.outlines[${piece}]`).map((point: unknown, index: number): ReadonlyVec2 => corner(point, `${where}.${model}.outlines[${piece}][${index}]`));
      if (outline.length < 3) throw new ContentError(`${where}.${model}.outlines[${piece}]`, 'an outline needs at least three corners');
      return outline;
    });
    if (outlines.length === 0) throw new ContentError(`${where}.${model}.outlines`, 'a footprint needs at least one outline');
    made.set(model, { height: numeric(entry, 'height', `${where}.${model}`), outlines });
  }
  return made;
}

export function footprintArea(model: ModelFootprint): number {
  return model.outlines.reduce((sum: number, outline: Outline): number => sum + outlineArea(outline), 0);
}

export function solidByShape(scale: number, model: ModelFootprint): boolean {
  return model.height * scale >= SOLID.knee && footprintArea(model) * scale * scale >= SOLID.least;
}

export function withFootprints(props: ReadonlyMap<string, PropDef>, footprints: ReadonlyMap<string, ModelFootprint>): Map<string, PropDef> {
  const made: Map<string, PropDef> = new Map<string, PropDef>();
  for (const [id, prop] of props) {
    const model: ModelFootprint | undefined = footprints.get(prop.model);
    const solid: boolean = model !== undefined && (prop.solid ?? solidByShape(prop.scale, model));
    const outlines: readonly Outline[] = model === undefined || !solid ? [] : model.outlines.map((outline: Outline): Outline => outline.map((point: ReadonlyVec2): ReadonlyVec2 => ({ x: point.x * prop.scale, z: point.z * prop.scale })));
    made.set(id, { ...prop, footprints: outlines, height: model === undefined ? 0 : model.height * prop.scale });
  }
  return made;
}
