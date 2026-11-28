import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import { terrainMap } from '../../sim/nav/terrain.ts';
import { prepareZone } from '../../sim/world/zones.ts';
import { heldBytes, heldZones, keepZones } from '../../sim/zone-cache.ts';
import { createTerrainSight } from './terrain-sight.ts';
import { cachedZones, neighbourZones } from './zone-assets.ts';

const PHONE_BUDGET = {
  megabyte: 1024 * 1024,
  heldBytes: 20 * 1024 * 1024,
} as const;

const content: Content = loadContent();

function enter(zone: ZoneDef, releaseOthers: boolean): readonly ZoneDef[] {
  prepareZone(content, zone);
  terrainMap(zone);
  createTerrainSight(zone);
  keepZones(zone, cachedZones(content, zone, releaseOthers, null));
  const near: readonly ZoneDef[] = neighbourZones(content, zone, null);
  for (const next of near) prepareZone(content, next);
  return near;
}

function overHeld(zone: ZoneDef, near: readonly ZoneDef[]): string[] {
  return [...heldZones()].filter(([, count]: [string, number]): boolean => count > 1 + near.length).map(([name, count]: [string, number]): string => `${zone.id}: ${name} holds ${count} zones, more than the zone and its ${near.length} neighbours`);
}

void test('walking every zone on a phone holds only the zone the hero stands in and the neighbours made ready, within the phone budget', (): void => {
  const over: string[] = [];
  for (const zone of content.zones.values()) {
    const near: readonly ZoneDef[] = enter(zone, true);
    over.push(...overHeld(zone, near));
    const bytes: number = [...heldBytes([content]).values()].reduce((sum: number, held: number): number => sum + held, 0);
    if (bytes > PHONE_BUDGET.heldBytes) over.push(`${zone.id}: zone caches hold ${(bytes / PHONE_BUDGET.megabyte).toFixed(1)} MB, over the ${PHONE_BUDGET.heldBytes / PHONE_BUDGET.megabyte} MB phone budget`);
  }
  keepZones(null, new Set<ZoneDef>());
  assert.deepEqual(over, []);
});

void test('walking every zone on a desktop holds no zone beyond the one the hero stands in and its neighbours', (): void => {
  const over: string[] = [];
  for (const zone of content.zones.values()) over.push(...overHeld(zone, enter(zone, false)));
  keepZones(null, new Set<ZoneDef>());
  assert.deepEqual(over, []);
});

void test('a zone left behind is let go by every zone cache, so leaving a level frees what it held', (): void => {
  const zones: readonly ZoneDef[] = [...content.zones.values()];
  const first: ZoneDef | undefined = zones[0];
  const last: ZoneDef | undefined = zones.at(-1);
  assert.ok(first !== undefined && last !== undefined);
  enter(first, true);
  keepZones(last, new Set<ZoneDef>());
  assert.deepEqual([...heldZones()].filter(([, count]: [string, number]): boolean => count > 0), []);
});
