import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import { cachedZones, neighbourZones } from './zone-assets.ts';

const content: Content = loadContent();

void test('a tier that lets other zones go keeps no zone work cached, since it builds a zone again only after leaving it', (): void => {
  for (const zone of content.zones.values()) assert.equal(cachedZones(content, zone, true, null).size, 0);
});

void test('a tier that keeps other zones keeps the zone it stands in and the zones its exits lead to, and no farther zone', (): void => {
  for (const zone of content.zones.values()) {
    const kept: Set<ZoneDef> = cachedZones(content, zone, false, null);
    assert.ok(kept.has(zone));
    for (const near of neighbourZones(content, zone, null)) assert.ok(kept.has(near), `${zone.id} keeps ${near.id}`);
    assert.equal(kept.size, 1 + neighbourZones(content, zone, null).length);
    assert.ok(kept.size < content.zones.size, zone.id);
  }
});
