import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { ShoreProp, VoidShore, ZoneVoid } from '../content/story-types.ts';
import type { Content, PropDef, ZoneDef } from '../content/types.ts';
import type { GapFinding, GapKind } from './zone-gaps.ts';
import { distanceField, zoneGaps } from './zone-gaps.ts';

const content: Content = loadContent();

interface KnownGap {
  readonly zone: string;
  readonly kind: GapKind;
  readonly x: number;
  readonly z: number;
  readonly name: string;
}

const NEAR: number = 1.5;

const KNOWN: readonly KnownGap[] = [
  { zone: 'hall_of_time', kind: 'pinch', x: 1, z: 2.4, name: 'sliver at the south-west corner' },
  { zone: 'hall_of_time', kind: 'pinch', x: 47.8, z: 5.1, name: 'sliver at the south-east barrier' },
  { zone: 'hall_of_time', kind: 'narrow', x: 36.6, z: 9.3, name: 'lane by the south-east barrier' },
  { zone: 'keepers_gate', kind: 'pinch', x: 16.9, z: 42.5, name: 'sliver at the north barrier' },
  { zone: 'keepers_gate', kind: 'pinch', x: 10.5, z: 42.9, name: 'second sliver at the north barrier' },
  { zone: 'keepers_gate', kind: 'narrow', x: 35.6, z: 30.8, name: 'lane by the east barrier' },
  { zone: 'under_hall', kind: 'perched', x: 80.9, z: 128.9, name: 'shards that seal the rim sliver above the stair to the under_t9 checkpoint' },
];

const WIDE_FOOTPRINTS: readonly string[] = [
  'boulder_2_wide',
  'campfire_wide',
  'castle_loose_blocks_wide',
  'cave_boulder_wide',
  'cave_crag_low_wide',
  'cave_embers_wide',
  'cave_fire_wide',
  'cave_rock_4_wide',
  'cave_rock_5_wide',
  'crag_a_wide',
  'crag_b_wide',
  'crag_low_wide',
  'crag_spire_wide',
  'edge_low_a_wide',
  'edge_low_b_wide',
  'fire_pit_wide',
  'post_lantern_lit_wide',
  'ridge_a_wide',
  'ridge_b_wide',
  'ridge_far_wide',
  'rock_2_wide',
  'rock_4_wide',
  'rock_5_wide',
];

function known(zone: string, found: GapFinding): boolean {
  return KNOWN.some((gap: KnownGap): boolean => gap.zone === zone && gap.kind === found.kind && Math.hypot(gap.x - found.x, gap.z - found.z) <= NEAR);
}

function describe(found: GapFinding): string {
  return `${found.kind}${found.prop === null ? '' : ` ${found.prop}`} at ${String(found.x)}, ${String(found.z)} (${String(found.length)} m long, ${String(found.area)} m²)`;
}

void test('no zone has a lane narrower than the hero can comfortably pass, a sliver he cannot enter, a sealed pocket, a collider no model accounts for or a prop perched up on a ledge above the floor around it', (): void => {
  for (const zone of content.zones.values()) {
    const unexpected: string[] = zoneGaps(content, zone.id).filter((found: GapFinding): boolean => !known(zone.id, found)).map(describe);
    assert.deepEqual(unexpected, [], `${zone.id} has gaps that read wrong`);
  }
});

void test('the only props whose collision is not fitted to their own model are the named wide-footprint ones', (): void => {
  const unfitted: string[] = [...content.props.values()].filter((prop: PropDef): boolean => prop.footprint !== prop.model).map((prop: PropDef): string => prop.id).toSorted();
  assert.deepEqual(unfitted, [...WIDE_FOOTPRINTS].toSorted());
});

function withShore(props: readonly ShoreProp[]): Content {
  const between: ZoneDef = must(content.zones.get('between'), 'between');
  const rules: ZoneVoid = must(between.void, 'void');
  const shore: VoidShore = must(rules.shore, 'shore');
  const zones: Map<string, ZoneDef> = new Map<string, ZoneDef>(content.zones);
  zones.set('between', { ...between, void: { ...rules, shore: { ...shore, props: [...shore.props, ...props] } } });
  return { ...content, zones };
}

function rock(x: number): ShoreProp {
  return { prop: 'crag_low', x, z: 55, rotationDegrees: 0, scale: 1 };
}

void test('two rocks a little more than a hero apart in open ground make a narrow lane, and pushed together they make none', (): void => {
  const apart: readonly GapFinding[] = zoneGaps(withShore([rock(-19.5), rock(-15)]), 'between');
  assert.ok(apart.some((found: GapFinding): boolean => found.kind === 'narrow' && Math.abs(found.x + 17.4) < 1 && Math.abs(found.z - 54.3) < 1), apart.map(describe).join('; '));
  const tight: readonly GapFinding[] = zoneGaps(withShore([rock(-19.5), rock(-16.5)]), 'between');
  assert.ok(tight.some((found: GapFinding): boolean => found.kind === 'pinch' && Math.abs(found.x + 18.3) < 1), tight.map(describe).join('; '));
  assert.deepEqual(zoneGaps(withShore([rock(-19.5), rock(-17)]), 'between').map(describe), []);
});

void test('the distance field measures straight-line distance to the nearest seed', (): void => {
  const seeds: Uint8Array = new Uint8Array(25);
  seeds[0] = 1;
  const far: Float64Array = distanceField(seeds, 5, 5);
  assert.equal(far[0], 0);
  assert.equal(far[4], 4);
  assert.ok(Math.abs((far[24] ?? 0) - Math.hypot(4, 4)) < 1e-9);
});
