import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { ZoneProp } from '../content/zone-types.ts';
import type { GapFinding } from './zone-gaps.ts';
import { zoneGaps } from './zone-gaps.ts';

const content: Content = loadContent();

function lantern(x: number, z: number, y: number = 0): ZoneProp {
  return { prop: 'cave_lantern', x, z, y, rotationDegrees: 0, when: [] };
}

void test('a lantern up on the rock rim above the floor is perched, and one on the floor below it is not', (): void => {
  const zone: ZoneDef = must(content.zones.get('under_hall_3'), 'under_hall_3');
  const zones: Map<string, ZoneDef> = new Map<string, ZoneDef>(content.zones);
  zones.set(zone.id, { ...zone, props: [...zone.props, lantern(106.7, 14.25), lantern(104, 18.5)] });
  const perched: GapFinding[] = zoneGaps({ ...content, zones }, zone.id).filter((found: GapFinding): boolean => found.kind === 'perched');
  assert.deepEqual(
    perched.map((found: GapFinding): string => `${found.prop ?? ''} ${String(found.x)}, ${String(found.z)}`),
    ['cave_lantern 106.7, 14.3'],
  );
});

void test('a lantern on the rim sunk by one rise stands level with the floor and is not perched', (): void => {
  const zone: ZoneDef = must(content.zones.get('under_hall_3'), 'under_hall_3');
  const rise: number = must(zone.terrain, 'terrain').rise;
  const zones: Map<string, ZoneDef> = new Map<string, ZoneDef>(content.zones);
  zones.set(zone.id, { ...zone, props: [...zone.props, lantern(106.7, 14.25, -rise)] });
  const perched: GapFinding[] = zoneGaps({ ...content, zones }, zone.id).filter((found: GapFinding): boolean => found.kind === 'perched');
  assert.deepEqual(perched, []);
});
