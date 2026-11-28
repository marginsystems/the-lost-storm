import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import type { World } from '../../sim/world/types.ts';
import { worldIn } from '../../test/support.ts';
import { cachedZones, keptZonesOf, nearZonesOf, neighbourZones } from './zone-assets.ts';

const content: Content = loadContent();

function flashZones(): ZoneDef[] {
  const found: ZoneDef[] = [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.flash !== null);
  assert.ok(found.length > 0, 'the shipped world has a flash');
  return found;
}

function ids(zones: Iterable<ZoneDef>): Set<string> {
  return new Set<string>([...zones].map((zone: ZoneDef): string => zone.id));
}

void test('a flash makes the zone it ends in ready while it plays, since it has no exit to lead there', (): void => {
  for (const zone of flashZones()) {
    const into: string = zone.flash?.into ?? '';
    assert.ok(ids(neighbourZones(content, zone, null)).has(into), `${zone.id} prepares ${into}`);
    assert.ok(ids(cachedZones(content, zone, false, null)).has(into), `${zone.id} keeps ${into}`);
  }
});

void test('a flash waiting to start makes its zone ready in the zone it starts from, and only while it waits', (): void => {
  for (const zone of flashZones()) {
    const from: ZoneDef | undefined = content.zones.get(zone.flash?.from ?? '');
    assert.ok(from !== undefined, `${zone.id} starts from a known zone`);
    assert.ok(ids(neighbourZones(content, from, zone)).has(zone.id), `${from.id} prepares ${zone.id} while it waits`);
    assert.ok(ids(cachedZones(content, from, false, zone)).has(zone.id), `${from.id} keeps ${zone.id} while it waits`);
    assert.ok(!ids(neighbourZones(content, from, null)).has(zone.id), `${from.id} leaves ${zone.id} alone when no flash waits`);
  }
});

void test('a tier that lets other zones go keeps nothing for a waiting flash either', (): void => {
  for (const zone of flashZones()) {
    const from: ZoneDef | undefined = content.zones.get(zone.flash?.from ?? '');
    assert.ok(from !== undefined);
    assert.equal(cachedZones(content, from, true, zone).size, 0);
  }
});

void test('a hero back in the Hideout with Act I done makes the flash ready, and a hero before that does not', (): void => {
  const world: World = worldIn(content, 'hideout', 7);
  assert.ok(!ids(nearZonesOf(world)).has('next_moment'));
  world.flags['reeve_freed'] = 'freed';
  world.player.level = 30;
  assert.ok(ids(nearZonesOf(world)).has('next_moment'));
  assert.ok(ids(keptZonesOf(world, false)).has('next_moment'));
  world.flags['next_count'] = 'flashed';
  assert.ok(!ids(nearZonesOf(world)).has('next_moment'));
});

void test('a hero inside the flash makes the In-Between ready before the flash ends', (): void => {
  const world: World = worldIn(content, 'next_moment', 7);
  assert.ok(ids(nearZonesOf(world)).has('between'));
  assert.ok(ids(keptZonesOf(world, false)).has('between'));
});
