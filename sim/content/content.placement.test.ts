import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import type { PropDef } from './prop-types.ts';
import type { Content } from './types.ts';
import type { ZoneDef, ZoneExit, ZoneProp } from './zone-types.ts';

const content: Content = loadContent();

const PLACEMENT = {
  standing: 0.3,
  cacheClear: 0.9,
  twinClear: 0.6,
  framingEdge: 0.1,
} as const;

interface Standing {
  readonly prop: ZoneProp;
  readonly def: PropDef;
}

function standing(zone: ZoneDef): Standing[] {
  return zone.props.flatMap((prop: ZoneProp): Standing[] => {
    const def: PropDef | undefined = content.props.get(prop.prop);
    return def === undefined || def.walkOn || def.height < PLACEMENT.standing ? [] : [{ prop, def }];
  });
}

function apart(a: ZoneProp, b: ZoneProp): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function where(zone: ZoneDef, placed: ZoneProp): string {
  return `${zone.id}: ${placed.prop} at ${String(placed.x)}, ${String(placed.z)}`;
}

function pairs(zone: ZoneDef, close: (a: Standing, b: Standing) => boolean): string[] {
  const found: string[] = [];
  const list: Standing[] = standing(zone);
  list.forEach((a: Standing, index: number): void => {
    for (const b of list.slice(index + 1)) if (close(a, b)) found.push(`${where(zone, a.prop)} and ${b.prop.prop} at ${String(b.prop.x)}, ${String(b.prop.z)}`);
  });
  return found;
}

function crowdsCache(a: Standing, b: Standing): boolean {
  return (a.def.cache !== null || b.def.cache !== null) && apart(a.prop, b.prop) < PLACEMENT.cacheClear;
}

function twinned(a: Standing, b: Standing): boolean {
  return a.prop.prop === b.prop.prop && apart(a.prop, b.prop) < PLACEMENT.twinClear;
}

void test('no cache shares its spot with another standing prop, so nothing grows out of it and breaking it leaves only its shards', (): void => {
  const found: string[] = [...content.zones.values()].flatMap((zone: ZoneDef): string[] => pairs(zone, crowdsCache));
  assert.deepEqual(found, []);
});

void test('no prop stands on the same spot as a copy of itself', (): void => {
  const found: string[] = [...content.zones.values()].flatMap((zone: ZoneDef): string[] => pairs(zone, twinned));
  assert.deepEqual(found, []);
});

void test('no standing prop stands inside a way out, where it would poke through the way marker', (): void => {
  const found: string[] = [...content.zones.values()].flatMap((zone: ZoneDef): string[] =>
    zone.exits.flatMap((exit: ZoneExit): string[] => standing(zone).filter((placed: Standing): boolean => Math.hypot(placed.prop.x - exit.x, placed.prop.z - exit.z) < exit.radius - PLACEMENT.framingEdge).map((placed: Standing): string => `${where(zone, placed.prop)} inside exit ${exit.id}`)),
  );
  assert.deepEqual(found, []);
});

function rock(x: number): ZoneProp {
  return { prop: 'cave_crystal', x, z: 40, y: 0, rotationDegrees: 0, when: [] };
}

void test('a cache with a rock on its spot is caught, and one a step away is not', (): void => {
  const zone: ZoneDef | undefined = content.zones.get('under_hall');
  assert.ok(zone !== undefined);
  const cache: ZoneProp = { prop: 'cache_jug', x: 40, z: 40, y: 0, rotationDegrees: 0, when: [] };
  const near: ZoneDef = { ...zone, props: [cache, rock(40.2)] };
  const clear: ZoneDef = { ...zone, props: [cache, rock(41.5)] };
  assert.equal(pairs(near, crowdsCache).length, 1);
  assert.equal(pairs(clear, crowdsCache).length, 0);
});
