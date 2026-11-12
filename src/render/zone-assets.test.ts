import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef, ZoneExit } from '../../sim/content/types.ts';
import { momentSurfaces, neighbourZones, zoneModels, zoneProps, zoneSurfaces } from './zone-assets.ts';

const content: Content = loadContent();

function anyZone(): ZoneDef {
  const zone: ZoneDef | undefined = content.zones.values().next().value;
  if (zone === undefined) throw new Error('no zones');
  return zone;
}

void test('a zone lists its wall pieces and placed props, and the models they use', (): void => {
  const zone: ZoneDef = anyZone();
  const props: string[] = zoneProps(zone);
  if (zone.walls !== null) assert.ok(props.includes(zone.walls.low));
  for (const placed of zone.props) assert.ok(props.includes(placed.prop));
  const models: Set<string> = zoneModels(content, zone);
  for (const propId of props) {
    const model: string | undefined = content.props.get(propId)?.model;
    if (model !== undefined) assert.ok(models.has(model));
  }
});

void test('a zone keeps its floors, its outside, its props and every attachment surface', (): void => {
  for (const zone of content.zones.values()) {
    const kept: Set<string> = zoneSurfaces(content, zone);
    for (const id of Object.values(zone.floors)) assert.ok(kept.has(id));
    if (zone.outside !== null) assert.ok(kept.has(zone.outside.surface));
    for (const attachment of content.attachments.values()) for (const id of Object.values(attachment.surfaces)) assert.ok(kept.has(id));
    for (const id of kept) assert.ok(content.surfaces.has(id), `${zone.id} keeps unknown surface ${id}`);
  }
});

void test('the zones next to a zone are the ones its exits lead to, without itself', (): void => {
  for (const zone of content.zones.values()) {
    const near: readonly ZoneDef[] = neighbourZones(content, zone);
    const targets: Set<string> = new Set<string>(zone.exits.map((exit: ZoneExit): string => exit.to).filter((id: string): boolean => id !== zone.id));
    assert.deepEqual(new Set<string>(near.map((found: ZoneDef): string => found.id)), targets);
  }
});

void test('every moment ground and every surface its props are dressed in is kept through a zone release', (): void => {
  const kept: Set<string> = momentSurfaces(content);
  assert.ok(content.moments.defs.size > 0);
  for (const def of content.moments.defs.values()) {
    assert.ok(kept.has(def.ground), def.ground);
    for (const placed of def.props) for (const id of Object.values(content.props.get(placed.prop)?.surfaces ?? {})) assert.ok(kept.has(id), id);
  }
});
