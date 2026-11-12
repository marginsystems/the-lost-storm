import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Object3D } from 'three';
import { PointLight, Scene } from 'three';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { LightBudget, LightSlots } from './light-slots.ts';
import { createLightSlots, fillersFor, lightsIn, LIGHT_SLOTS, markerLightCount, zoneLightCount } from './light-slots.ts';

const content: Content = loadContent();
const zones: readonly ZoneDef[] = [...content.zones.values()];
const BUDGETS: readonly LightBudget[] = [
  { zone: 6, markers: true },
  { zone: 4, markers: true },
  { zone: 3, markers: false },
  { zone: 2, markers: false },
];

function shownPointLights(scene: Scene): number {
  let count: number = 0;
  scene.traverseVisible((object: Object3D): void => {
    if (object instanceof PointLight) count += 1;
  });
  return count;
}

void test('with fillers every zone holds the same number of point lights, so no lit shader relinks on a zone change', (): void => {
  assert.ok(zones.length >= 2);
  for (const budget of BUDGETS) {
    const totals: Set<number> = new Set<number>(zones.map((zone: ZoneDef): number => lightsIn(zone, budget) + fillersFor(zone, zones, budget)));
    assert.equal(totals.size, 1, JSON.stringify(budget));
  }
});

void test('a void zone holds only its fire light, and a built zone its full pool whatever its lit props', (): void => {
  for (const zone of zones) assert.equal(zoneLightCount(zone, BUDGETS[0] ?? { zone: 6, markers: true }), zone.kind === 'void' ? LIGHT_SLOTS.voidLights : 6);
});

void test('marker lights count every exit outside the void, every checkpoint and the waypoint, and none when markers are unlit', (): void => {
  for (const zone of zones) {
    const exits: number = zone.kind === 'void' ? 0 : zone.exits.length;
    assert.equal(markerLightCount(zone, { zone: 6, markers: true }), exits + zone.checkpoints.length + (zone.waypoint === null ? 0 : 1));
    assert.equal(markerLightCount(zone, { zone: 6, markers: false }), 0);
  }
});

void test('filling shows exactly the asked number of dark lights and hides the rest', (): void => {
  const scene: Scene = new Scene();
  const slots: LightSlots = createLightSlots(scene);
  slots.fill(5);
  assert.equal(shownPointLights(scene), 5);
  slots.fill(2);
  assert.equal(shownPointLights(scene), 2);
  assert.equal(slots.lit, 2);
  scene.traverse((object: Object3D): void => {
    if (object instanceof PointLight) assert.equal(object.intensity, 0);
  });
});
