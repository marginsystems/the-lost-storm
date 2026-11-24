import assert from 'node:assert/strict';
import { test } from 'node:test';
import footprints from '../../data/footprints.json' with { type: 'json' };
import type { ReadonlyVec2 } from '../math.ts';
import { loadContent } from './content.ts';
import type { ModelFootprint, Outline } from './footprints.ts';
import { modelFootprints } from './footprints.ts';
import type { PropDef } from './prop-types.ts';
import type { Content } from './types.ts';
import type { ZoneDef, ZoneProp } from './zone-types.ts';

const content: Content = loadContent();
const measured: ReadonlyMap<string, ModelFootprint> = modelFootprints(footprints, 'footprints');

interface Placed {
  readonly what: string;
  readonly x: number;
  readonly z: number;
}

function walkedOn(prop: ZoneProp): PropDef | null {
  const def: PropDef | undefined = content.props.get(prop.prop);
  return def !== undefined && def.walkOn ? def : null;
}

function local(stair: ZoneProp, point: Placed): ReadonlyVec2 {
  const radians: number = (stair.rotationDegrees * Math.PI) / 180;
  const dx: number = point.x - stair.x;
  const dz: number = point.z - stair.z;
  return { x: dx * Math.cos(radians) - dz * Math.sin(radians), z: dx * Math.sin(radians) + dz * Math.cos(radians) };
}

function within(outline: Outline, scale: number, point: ReadonlyVec2): boolean {
  let crossings: number = 0;
  outline.forEach((corner: ReadonlyVec2, index: number): void => {
    const next: ReadonlyVec2 = outline[(index + 1) % outline.length] ?? corner;
    const a: ReadonlyVec2 = { x: corner.x * scale, z: corner.z * scale };
    const b: ReadonlyVec2 = { x: next.x * scale, z: next.z * scale };
    if (a.z > point.z !== b.z > point.z && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) crossings += 1;
  });
  return crossings % 2 === 1;
}

function onStair(stair: ZoneProp, def: PropDef, point: Placed): boolean {
  const model: ModelFootprint | undefined = measured.get(def.footprint);
  if (model === undefined) return false;
  const at: ReadonlyVec2 = local(stair, point);
  return model.outlines.some((outline: Outline): boolean => within(outline, def.scale, at));
}

function corners(prop: ZoneProp): Placed[] {
  const def: PropDef | undefined = content.props.get(prop.prop);
  const model: ModelFootprint | undefined = def === undefined ? undefined : measured.get(def.footprint);
  if (def === undefined || model === undefined) return [];
  const radians: number = (prop.rotationDegrees * Math.PI) / 180;
  const cos: number = Math.cos(radians);
  const sin: number = Math.sin(radians);
  return model.outlines.flat().map((corner: ReadonlyVec2): Placed => ({ what: prop.prop, x: prop.x + corner.x * def.scale * cos + corner.z * def.scale * sin, z: prop.z - corner.x * def.scale * sin + corner.z * def.scale * cos }));
}

function overlaps(stair: ZoneProp, def: PropDef, prop: ZoneProp): boolean {
  const own: PropDef | undefined = content.props.get(prop.prop);
  const placed: Placed = { what: prop.prop, x: prop.x, z: prop.z };
  if (onStair(stair, def, placed) || corners(prop).some((corner: Placed): boolean => onStair(stair, def, corner))) return true;
  return own !== undefined && corners(stair).some((corner: Placed): boolean => onStair(prop, own, corner));
}

function placedIn(zone: ZoneDef): Placed[] {
  const marks: Placed[] = [...zone.checkpoints.map((checkpoint): Placed => ({ what: `checkpoint ${checkpoint.id}`, x: checkpoint.x, z: checkpoint.z })), ...zone.exits.map((exit): Placed => ({ what: `exit ${exit.id}`, x: exit.x, z: exit.z }))];
  if (zone.waypoint !== null) marks.push({ what: 'waypoint', x: zone.waypoint.x, z: zone.waypoint.z });
  return marks;
}

void test('no checkpoint, waypoint, exit or prop stands inside a stair, where it would poke up through the steps', (): void => {
  const problems: string[] = [];
  for (const zone of content.zones.values()) {
    const stairs: ZoneProp[] = zone.props.filter((prop: ZoneProp): boolean => walkedOn(prop) !== null);
    for (const point of placedIn(zone)) {
      for (const stair of stairs) {
        const def: PropDef | null = walkedOn(stair);
        if (def !== null && onStair(stair, def, point)) problems.push(`${zone.id}: ${point.what} at ${point.x}, ${point.z} is inside ${stair.prop} at ${stair.x}, ${stair.z}`);
      }
    }
    for (const prop of zone.props.filter((placed: ZoneProp): boolean => walkedOn(placed) === null)) {
      for (const stair of stairs) {
        const def: PropDef | null = walkedOn(stair);
        if (def !== null && overlaps(stair, def, prop)) problems.push(`${zone.id}: ${prop.prop} at ${prop.x}, ${prop.z} reaches into ${stair.prop} at ${stair.x}, ${stair.z}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

void test('the stair check finds a point on the steps and passes one beside them', (): void => {
  const stair: ZoneProp = { prop: 'wide_stair', x: 10, z: 10, y: 0, rotationDegrees: 90, when: [] };
  const def: PropDef | null = walkedOn(stair);
  assert.ok(def !== null);
  assert.equal(onStair(stair, def, { what: 'on', x: 10.5, z: 11 }), true);
  assert.equal(onStair(stair, def, { what: 'beside', x: 10, z: 16 }), false);
});

void test('a prop whose centre is off the steps but whose footprint reaches onto them is caught', (): void => {
  const stair: ZoneProp = { prop: 'wide_stair', x: 10, z: 10, y: 0, rotationDegrees: 90, when: [] };
  const def: PropDef | null = walkedOn(stair);
  assert.ok(def !== null);
  const edge: Placed[] = corners(stair).toSorted((a: Placed, b: Placed): number => b.z - a.z);
  const far: Placed | undefined = edge[0];
  assert.ok(far !== undefined);
  const touching: ZoneProp = { prop: 'cave_chain_coil', x: far.x, z: far.z + 0.3, y: 0, rotationDegrees: 0, when: [] };
  const clear: ZoneProp = { prop: 'cave_chain_coil', x: far.x, z: far.z + 3, y: 0, rotationDegrees: 0, when: [] };
  assert.equal(onStair(stair, def, { what: 'centre', x: touching.x, z: touching.z }), false);
  assert.equal(overlaps(stair, def, touching), true);
  assert.equal(overlaps(stair, def, clear), false);
});
