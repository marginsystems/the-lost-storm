import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute, Material } from 'three';
import { Color, Mesh, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import type { Delivery } from '../../sim/content/types.ts';
import { loadContent } from '../../sim/content/content.ts';
import { bandMesh, discMesh, groundArcs, lightningLine, markerMesh, pillarMesh, programKeepers, projectileMesh, scorchMesh, shockwaveMesh, skyBolt, slashMesh, telegraphFor } from './effect-shapes.ts';
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

function variantOf(mesh: Mesh): string {
  const material: Material | Material[] = mesh.material;
  assert.ok(!Array.isArray(material));
  const colour: BufferAttribute | InterleavedBufferAttribute | undefined = mesh.geometry.hasAttribute('color') ? mesh.geometry.getAttribute('color') : undefined;
  const shader: string = material instanceof ShaderMaterial ? `${material.vertexShader}${material.fragmentShader}` : '';
  const opaque: boolean = !material.transparent && material.blending === NormalBlending;
  return [material.type, shader, material.side, opaque, material.vertexColors, colour?.itemSize ?? 0, mesh.geometry.hasAttribute('normal')].join('|');
}

function partsOf(object: Mesh | { readonly fills: readonly Mesh[]; readonly edges: readonly Mesh[] }): Mesh[] {
  return object instanceof Mesh ? [object] : [...object.fills, ...object.edges];
}

void test('every effect shape draws with a shader a keeper holds, so freeing the last one never relinks mid-fight', (): void => {
  const red: Color = new Color(1, 0, 0);
  const shapes: Mesh[] = [
    ...partsOf(projectileMesh('orb', red)),
    ...partsOf(projectileMesh('bolt', red)),
    ...deliveries().flatMap((delivery: Delivery): Mesh[] => partsOf(telegraphFor(delivery, red))),
    discMesh(red, 2, 0.5),
    bandMesh(red, 1, 2, 0.5),
    skyBolt(red),
    groundArcs(red, 2),
    lightningLine(new Vector3(0, 0, 0), new Vector3(3, 0, 0), red, 0.2, 0.3),
    pillarMesh(red, 1, 2),
    slashMesh(1, 2, red).mesh,
    shockwaveMesh(red, 0.5, 0).mesh,
    markerMesh(red).mesh,
    scorchMesh(red).mesh,
  ];
  const held: Set<string> = new Set<string>(programKeepers(red).map(variantOf));
  for (const shape of shapes) assert.ok(held.has(variantOf(shape)), `no keeper holds ${variantOf(shape).slice(0, 80)}`);
});

void test('a blade swing draws a thin streak along its reach with a hot leading edge that tapers behind, never a filled wedge', (): void => {
  const { material } = slashMesh(1, 2, new Color(0xffffff));
  assert.ok(material instanceof ShaderMaterial);
  const shader: string = material.fragmentShader;
  assert.match(shader, /exp\(-off \* off \*/);
  assert.match(shader, /mix\(0\.25, 1\.0, behind\)/);
  assert.match(shader, /float hot = smoothstep\(head - /);
});
