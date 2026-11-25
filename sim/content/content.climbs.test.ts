import assert from 'node:assert/strict';
import { test } from 'node:test';
import { climbOn, zoneClimbs } from '../nav/climb.ts';
import type { PlacedClimb } from '../nav/climb.ts';
import { heightAt } from '../nav/terrain.ts';
import { loadContent } from './content.ts';
import type { PropDef } from './prop-types.ts';
import type { Content } from './types.ts';
import type { ZoneDef, ZoneProp } from './zone-types.ts';

const content: Content = loadContent();

const LANDING = {
  level: 0.05,
} as const;

function top(placed: PlacedClimb): number {
  return placed.base + placed.climb.steps * placed.climb.rise * placed.scale;
}

function onLanding(zone: ZoneDef, placed: PlacedClimb, prop: ZoneProp): boolean {
  const def: PropDef | undefined = content.props.get(prop.prop);
  if (def === undefined || def.cache === null) return false;
  const stands: number | null = climbOn(placed, prop.x, prop.z);
  const drawn: number = heightAt(zone, prop.x, prop.z) + prop.y;
  return stands !== null && Math.abs(stands - top(placed)) < LANDING.level && Math.abs(drawn - top(placed)) < LANDING.level;
}

function bareClimbs(zone: ZoneDef): string[] {
  return zoneClimbs(zone, content.props)
    .filter((placed: PlacedClimb): boolean => !zone.props.some((prop: ZoneProp): boolean => onLanding(zone, placed, prop)))
    .map((placed: PlacedClimb): string => `${zone.id}: the climb at ${String(placed.x)}, ${String(placed.z)} ends at a wall with nothing on its top step`);
}

void test('every staircase the hero climbs holds loot on its top step, so a stair never leads nowhere', (): void => {
  const found: string[] = [...content.zones.values()].flatMap((zone: ZoneDef): string[] => bareClimbs(zone));
  assert.deepEqual(found, []);
});

void test('a climb with its loot taken away, or the loot set on the floor below, is caught', (): void => {
  const zone: ZoneDef | undefined = content.zones.get('ledger_hall');
  assert.ok(zone !== undefined);
  const placed: PlacedClimb | undefined = zoneClimbs(zone, content.props)[0];
  assert.ok(placed !== undefined);
  const landing: ZoneProp | undefined = zone.props.find((prop: ZoneProp): boolean => onLanding(zone, placed, prop));
  assert.ok(landing !== undefined);
  const without: ZoneDef = { ...zone, props: zone.props.filter((prop: ZoneProp): boolean => prop !== landing) };
  const dropped: ZoneDef = { ...without, props: [...without.props, { prop: landing.prop, x: landing.x, z: landing.z, y: 0, rotationDegrees: landing.rotationDegrees, when: landing.when }] };
  assert.equal(bareClimbs(without).length, 1);
  assert.equal(bareClimbs(dropped).length, 1);
});
