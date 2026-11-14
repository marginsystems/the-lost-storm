import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BufferAttribute, InterleavedBufferAttribute, Material } from 'three';
import { Color, Mesh, NormalBlending, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import type { Delivery } from '../../sim/content/types.ts';
import { loadContent } from '../../sim/content/content.ts';
import { groundArcs, lightningLine, pillarMesh, programKeepers, projectileMesh, scorchMesh, skyBolt, slashMesh, telegraphFor } from './effect-shapes.ts';
import type { Telegraph } from './effect-shapes.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, GROUND_LIGHT_FRAGMENT } from './ground-light.ts';

function deliveries(): Delivery[] {
  const seen: Map<Delivery['type'], Delivery> = new Map<Delivery['type'], Delivery>();
  for (const skill of loadContent().skills.values()) if (!seen.has(skill.delivery.type)) seen.set(skill.delivery.type, skill.delivery);
  return [...seen.values()];
}

void test('every telegraph is light drawn by the ground-light shader on one plane, never a shape with an edge', (): void => {
  const shapes: Delivery[] = deliveries();
  assert.ok(shapes.length >= 4);
  for (const delivery of shapes) {
    for (const light of telegraphFor(delivery, new Color(1, 0, 0)).lights) {
      assert.ok(light.mesh.geometry instanceof PlaneGeometry, `${delivery.type} draws on a plane`);
      assert.equal(light.mesh.material.fragmentShader, GROUND_LIGHT_FRAGMENT);
    }
  }
});

void test('a telegraph fills its area with feathered light and draws no band, so no ring shows at any frame', (): void => {
  for (const delivery of deliveries()) {
    for (const light of telegraphFor(delivery, new Color(1, 0, 0)).lights) {
      assert.equal(light.mesh.material.uniforms['uBand']?.value, 0, `${delivery.type} draws no band`);
      assert.equal(light.mesh.material.uniforms['uFront']?.value, 1, `${delivery.type} covers its whole area`);
    }
  }
});

function variantOf(mesh: Mesh): string {
  const material: Material | Material[] = mesh.material;
  assert.ok(!Array.isArray(material));
  const colour: BufferAttribute | InterleavedBufferAttribute | undefined = mesh.geometry.hasAttribute('color') ? mesh.geometry.getAttribute('color') : undefined;
  const shader: string = material instanceof ShaderMaterial ? `${material.vertexShader}${material.fragmentShader}` : '';
  const opaque: boolean = !material.transparent && material.blending === NormalBlending;
  return [material.type, shader, material.side, opaque, material.vertexColors, colour?.itemSize ?? 0, mesh.geometry.hasAttribute('normal')].join('|');
}

function partsOf(object: Mesh | Telegraph): Mesh[] {
  return object instanceof Mesh ? [object] : object.lights.map((light: GroundLight): Mesh => light.mesh);
}

void test('every effect shape draws with a shader a keeper holds, so freeing the last one never relinks mid-fight', (): void => {
  const red: Color = new Color(1, 0, 0);
  const shapes: Mesh[] = [
    ...partsOf(projectileMesh('orb', red)),
    ...partsOf(projectileMesh('bolt', red)),
    ...deliveries().flatMap((delivery: Delivery): Mesh[] => partsOf(telegraphFor(delivery, red))),
    skyBolt(red),
    groundArcs(red, 2),
    lightningLine(new Vector3(0, 0, 0), new Vector3(3, 0, 0), red, 0.2, 0.3),
    pillarMesh(red, 1, 2),
    slashMesh(1, 2, red).mesh,
    createGroundLight(red, { kind: 'lane', halfWidth: 1, start: 0.5, length: 3 }, { fill: 0.4, band: 1, width: 0.3, wobble: 0.1 }, 'shade').mesh,
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
