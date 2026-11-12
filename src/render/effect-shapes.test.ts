import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute } from 'three';
import { Color } from 'three';
import type { Delivery } from '../../sim/content/types.ts';
import { loadContent } from '../../sim/content/content.ts';
import { telegraphFor } from './effect-shapes.ts';
import type { TelegraphPart } from './effect-shapes.ts';

interface Spot {
  readonly x: number;
  readonly z: number;
  readonly alpha: number;
}

function spots(geometry: BufferGeometry): Spot[] {
  const position: BufferAttribute | InterleavedBufferAttribute = geometry.getAttribute('position');
  assert.ok(geometry.hasAttribute('color'), 'a telegraph part carries a per-vertex alpha');
  const colour: BufferAttribute | InterleavedBufferAttribute = geometry.getAttribute('color');
  assert.equal(colour.itemSize, 4);
  const found: Spot[] = [];
  for (let index: number = 0; index < position.count; index += 1) found.push({ x: position.getX(index), z: position.getZ(index), alpha: colour.getW(index) });
  return found;
}

function deliveries(): Delivery[] {
  const seen: Map<Delivery['type'], Delivery> = new Map<Delivery['type'], Delivery>();
  for (const skill of loadContent().skills.values()) if (!seen.has(skill.delivery.type)) seen.set(skill.delivery.type, skill.delivery);
  return [...seen.values()];
}

void test('every telegraph shape fades to nothing at its outer edge and its sides, so no hard line is drawn', (): void => {
  const shapes: Delivery[] = deliveries();
  assert.ok(shapes.length >= 4);
  for (const delivery of shapes) {
    const parts: readonly TelegraphPart[] = [...telegraphFor(delivery, new Color(1, 0, 0)).fills, ...telegraphFor(delivery, new Color(1, 0, 0)).edges];
    for (const part of parts) {
      const all: Spot[] = spots(part.geometry);
      const far: number = Math.max(...all.map((spot: Spot): number => Math.hypot(spot.x, spot.z)));
      const outer: Spot[] = all.filter((spot: Spot): boolean => Math.hypot(spot.x, spot.z) > far - 1e-4);
      for (const spot of outer) assert.ok(Math.abs(spot.alpha) < 1e-6, `${delivery.type} ends in a hard edge`);
      const wide: number = Math.max(...all.map((spot: Spot): number => Math.abs(spot.x)));
      if (delivery.type === 'projectile' || delivery.type === 'dash' || delivery.type === 'beam') {
        for (const spot of all.filter((candidate: Spot): boolean => Math.abs(candidate.x) > wide - 1e-4)) assert.ok(Math.abs(spot.alpha) < 1e-6, `${delivery.type} lane has a hard side`);
      }
      assert.ok(all.some((spot: Spot): boolean => spot.alpha > 0.99), `${delivery.type} still shows its body`);
    }
  }
});

void test('an arc telegraph fades out along both of its straight sides', (): void => {
  const arc: Delivery | undefined = deliveries().find((delivery: Delivery): boolean => delivery.type === 'arc');
  assert.ok(arc !== undefined && arc.type === 'arc');
  const fill: TelegraphPart | undefined = telegraphFor(arc, new Color(1, 0, 0)).fills[0];
  assert.ok(fill !== undefined);
  const all: Spot[] = spots(fill.geometry);
  const half: number = (arc.arcDegrees * Math.PI) / 360;
  const sides: Spot[] = all.filter((spot: Spot): boolean => Math.hypot(spot.x, spot.z) > 1e-3 && Math.abs(Math.abs(Math.atan2(spot.x, spot.z)) - half) < 1e-4);
  assert.ok(sides.length > 0);
  for (const spot of sides) assert.ok(Math.abs(spot.alpha) < 1e-6);
});
