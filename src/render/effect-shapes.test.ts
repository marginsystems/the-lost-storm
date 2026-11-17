import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BufferAttribute, InterleavedBufferAttribute, Material } from 'three';
import { BoxGeometry, Color, IcosahedronGeometry, Mesh, MeshBasicMaterial, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import type { Delivery } from '../../sim/content/types.ts';
import { loadContent } from '../../sim/content/content.ts';
import { disposeObject, groundArcs, lightningLine, neverCulled, pillarMesh, programKeepers, projectileMesh, rekey, scorchMesh, showKeepers, skyBolt, slashMesh, SHAPES, spotLook, telegraphFor, telegraphLook } from './effect-shapes.ts';
import type { Telegraph } from './effect-shapes.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, GROUND_LIGHT_FRAGMENT } from './ground-light.ts';

function deliveries(): Delivery[] {
  const seen: Map<Delivery['type'], Delivery> = new Map<Delivery['type'], Delivery>();
  for (const skill of loadContent().skills.values()) if (!seen.has(skill.delivery.type)) seen.set(skill.delivery.type, skill.delivery);
  return [...seen.values()];
}

void test('every telegraph is light drawn by the ground-light shader as one decal on the ground, never a shape with an edge', (): void => {
  const shapes: Delivery[] = deliveries();
  assert.ok(shapes.length >= 4);
  for (const delivery of shapes) {
    for (const light of telegraphFor(delivery, new Color(1, 0, 0), 0).lights) {
      assert.ok(light.mesh.geometry instanceof BoxGeometry, `${delivery.type} draws as a ground decal`);
      assert.equal(light.mesh.material.fragmentShader, GROUND_LIGHT_FRAGMENT);
    }
  }
});

void test('a telegraph fills its area with feathered light and draws no band, so no ring shows at any frame', (): void => {
  for (const delivery of deliveries()) {
    for (const light of telegraphFor(delivery, new Color(1, 0, 0), 0).lights) {
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
    ...deliveries().flatMap((delivery: Delivery): Mesh[] => partsOf(telegraphFor(delivery, red, 0))),
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

void test('a leap that shows its path lays a feathered lane from where it springs to where it strikes, as wide as its strike', (): void => {
  const strike: Delivery = { type: 'arc', reach: 2, arcDegrees: 60 };
  assert.equal(telegraphFor(strike, new Color(1, 0, 0), 0).lights.length, 1);
  const shown: Telegraph = telegraphFor(strike, new Color(1, 0, 0), 4);
  assert.equal(shown.lights.length, 2);
  const lane = shown.lights[0];
  assert.ok(lane !== undefined);
  assert.equal(lane.mesh.material.fragmentShader, GROUND_LIGHT_FRAGMENT);
  assert.equal(lane.mesh.material.uniforms['uLane']?.value, 1);
  assert.equal(lane.mesh.material.uniforms['uLaneStart']?.value, -4);
  assert.equal(lane.mesh.material.uniforms['uLaneSpan']?.value, 4);
  assert.ok(Math.abs(Number(lane.mesh.material.uniforms['uRadius']?.value) - 1) < 1e-9);
  assert.ok(lane.mesh.scale.x / 2 > 4, 'the plane reaches back to where the leap began');
});

void test('a small round telegraph is lit solid to its middle, and a wide one keeps its hollow centre', (): void => {
  assert.equal(spotLook(0.8).hollow, 0);
  assert.equal(spotLook(SHAPES.spotOpen).hollow, telegraphLook(SHAPES.spotOpen).hollow);
  const between: number = spotLook((SHAPES.spotSolid + SHAPES.spotOpen) / 2).hollow ?? 0;
  assert.ok(between > 0 && between < SHAPES.telegraphHollow);
});

function disposals(target: { addEventListener(type: 'dispose', listener: () => void): void }): { count: number } {
  const seen: { count: number } = { count: 0 };
  target.addEventListener('dispose', (): void => {
    seen.count += 1;
  });
  return seen;
}

void test('ending an effect frees its own geometry and materials but never the shared decal box or orb spheres the next one draws with', (): void => {
  const red: Color = new Color(1, 0, 0);
  const ring: GroundLight = createGroundLight(red, { kind: 'round', radius: 2, inner: 0, arc: Math.PI * 2 }, { fill: 0.2, band: 1, width: 0.3, wobble: 0.1 });
  const orb = projectileMesh('orb', red);
  const bolt = projectileMesh('bolt', red);
  const halo: unknown = orb.children[0];
  assert.ok(halo instanceof Mesh);
  const haloGeometry: unknown = halo.geometry;
  const haloMaterial: unknown = halo.material;
  assert.ok(haloGeometry instanceof IcosahedronGeometry);
  assert.ok(haloMaterial instanceof ShaderMaterial);
  const scorch = scorchMesh(red);
  const slash = slashMesh(1, 2, red);
  assert.equal(orb.geometry, bolt.geometry, 'every shot core draws one sphere');
  assert.equal(scorch.mesh.geometry, scorchMesh(red).mesh.geometry, 'every scorch draws one box');
  const shared = [ring.mesh.geometry, orb.geometry, haloGeometry, scorch.mesh.geometry].map(disposals);
  const own = disposals(slash.mesh.geometry);
  const materials = [ring.mesh.material, orb.material, haloMaterial, scorch.material, slash.material].map(disposals);
  for (const object of [ring.mesh, orb, bolt, scorch.mesh, slash.mesh]) disposeObject(object);
  assert.deepEqual(shared.map((seen: { count: number }): number => seen.count), [0, 0, 0, 0]);
  assert.equal(own.count, 1);
  assert.deepEqual(materials.map((seen: { count: number }): number => seen.count), [1, 1, 1, 1, 1]);
});

void test('a blade swing hands back the very uniforms its shader reads, so it is moved without replacing them', (): void => {
  const slash = slashMesh(1, 2, new Color(1, 0, 0));
  assert.equal(slash.material.uniforms['uProgress'], slash.progress);
  assert.equal(slash.material.uniforms['uOpacity'], slash.opacity);
});

void test('the keepers are shown for the one render that warms a zone and hidden again, and one already showing is left as it was', (): void => {
  const keepers: Mesh[] = programKeepers(new Color(1, 1, 1));
  const [first, ...rest] = keepers;
  assert.ok(first !== undefined);
  for (const keeper of rest) keeper.visible = false;
  const hide: () => void = showKeepers(keepers);
  assert.equal(keepers.every((keeper: Mesh): boolean => keeper.visible), true);
  hide();
  assert.equal(first.visible, true);
  assert.equal(rest.some((keeper: Mesh): boolean => keeper.visible), false);
});

void test('a keeper and every part under it is drawn wherever the camera looks, so its halo compiles with its core', (): void => {
  const orb: Mesh = projectileMesh('orb', new Color(1, 1, 1));
  neverCulled(orb);
  let parts: number = 0;
  let culled: number = 0;
  orb.traverse((part): void => {
    parts += 1;
    if (part.frustumCulled) culled += 1;
  });
  assert.ok(parts > 1);
  assert.equal(culled, 0);
});

function versionsUnder(roots: readonly Mesh[]): number[] {
  const found: number[] = [];
  for (const root of roots) {
    root.traverse((part): void => {
      if (!(part instanceof Mesh)) return;
      const held: unknown = part.material;
      for (const material of Array.isArray(held) ? held : [held]) if (material instanceof ShaderMaterial || material instanceof MeshBasicMaterial) found.push(material.version);
    });
  }
  return found;
}

void test('showing the keepers asks every material under them for a fresh program, since an unlit material never asks by itself when the lights change', (): void => {
  const keepers: Mesh[] = programKeepers(new Color(1, 1, 1));
  const before: number[] = versionsUnder(keepers);
  assert.ok(before.length > keepers.length);
  showKeepers(keepers)();
  assert.deepEqual(versionsUnder(keepers), before.map((version: number): number => version + 1));
  const orb: Mesh = projectileMesh('orb', new Color(1, 1, 1));
  const fresh: number[] = versionsUnder([orb]);
  rekey(orb);
  assert.deepEqual(versionsUnder([orb]), fresh.map((version: number): number => version + 1));
});
