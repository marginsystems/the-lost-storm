import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Document, Node, Skin } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Fields } from '../sim/content/read.ts';
import { each, fields, numeric, text } from '../sim/content/read.ts';
import type { BodySurface, Contact, FitOptions, Influence, PreparedBody } from './fit-over.ts';
import { contactWith, elementsOf, fitOver, followSkin, meshNodes, prepareBody } from './fit-over.ts';

const NECK = {
  radius: 0.05,
  height: 0.1,
  sides: 24,
  rings: 6,
} as const;

const OPTIONS: FitOptions = { gap: 0.003, depth: 0.012, reach: 0.03, blend: 0.015, follow: 0.03 };

const SHIPPED = {
  plans: 'tools/universal-bodies.json',
  slack: 0.001,
  shallow: 0.004,
} as const;

interface Bend {
  readonly joint: string;
  readonly axis: readonly [number, number, number];
  readonly degrees: number;
}

const BENDS: readonly Bend[] = [
  { joint: 'neck_01', axis: [1, 0, 0], degrees: 15 },
  { joint: 'neck_01', axis: [1, 0, 0], degrees: -15 },
  { joint: 'neck_01', axis: [0, 1, 0], degrees: 25 },
  { joint: 'neck_01', axis: [0, 0, 1], degrees: 15 },
  { joint: 'Head', axis: [1, 0, 0], degrees: 20 },
];

function openNeck(): BodySurface {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring: number = 0; ring <= NECK.rings; ring += 1) {
    for (let side: number = 0; side < NECK.sides; side += 1) {
      const angle: number = (side / NECK.sides) * Math.PI * 2;
      positions.push(Math.cos(angle) * NECK.radius, (ring / NECK.rings) * NECK.height, Math.sin(angle) * NECK.radius);
    }
  }
  for (let ring: number = 0; ring < NECK.rings; ring += 1) {
    for (let side: number = 0; side < NECK.sides; side += 1) {
      const next: number = (side + 1) % NECK.sides;
      const low: number = ring * NECK.sides;
      const high: number = (ring + 1) * NECK.sides;
      indices.push(low + side, high + side, low + next, low + next, high + side, high + next);
    }
  }
  return { positions, indices, influences: [] };
}

function collar(radius: number, y: number): number[] {
  return Array.from({ length: NECK.sides }, (_value: unknown, side: number): number[] => {
    const angle: number = ((side + 0.5) / NECK.sides) * Math.PI * 2;
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  }).flat();
}

void test('cloth sunk just under the skin is lifted to the gap outside it, all the way round', (): void => {
  const neck: PreparedBody = prepareBody(openNeck());
  const sunk: number[] = collar(NECK.radius - 0.004, NECK.height / 2);
  const fitted: number[] = fitOver(sunk, [], neck, OPTIONS);
  const point: Vector3 = new Vector3();
  for (let index: number = 0; index < NECK.sides; index += 1) {
    const contact: Contact | null = contactWith(neck, point.fromArray(fitted, index * 3), OPTIONS.reach);
    assert.ok(contact !== null && contact.depth >= OPTIONS.gap - 1e-6, `side ${String(index)} sits at ${String(contact?.depth)} from the skin`);
  }
});

void test('cloth already clear of the skin stays where it was made', (): void => {
  const neck: PreparedBody = prepareBody(openNeck());
  const clear: number[] = collar(NECK.radius + 0.02, NECK.height / 2);
  assert.deepEqual(fitOver(clear, [], neck, OPTIONS), clear);
});

void test('cloth buried deeper than the fitting depth is hidden inside the body and is left alone', (): void => {
  const neck: PreparedBody = prepareBody(openNeck());
  const buried: number[] = collar(NECK.radius - OPTIONS.depth - 0.01, NECK.height / 2);
  assert.deepEqual(fitOver(buried, [], neck, OPTIONS), buried);
});

void test('cloth past the open edge of the skin is not pushed by the edge', (): void => {
  const neck: PreparedBody = prepareBody(openNeck());
  const below: number[] = collar(NECK.radius, -0.02);
  assert.deepEqual(fitOver(below, [], neck, OPTIONS), below);
});

void test('a wide cloth triangle the skin pokes through is lifted although its corners are clear', (): void => {
  const neck: PreparedBody = prepareBody(openNeck());
  const reach: number = NECK.radius + 0.002;
  const face: number[] = [reach, 0.01, -0.04, reach, 0.09, 0, reach, 0.01, 0.04];
  const fitted: number[] = fitOver(face, [0, 1, 2], neck, OPTIONS);
  const middle: Vector3 = new Vector3();
  for (let corner: number = 0; corner < 3; corner += 1) middle.add(new Vector3(fitted[corner * 3] ?? 0, fitted[corner * 3 + 1] ?? 0, fitted[corner * 3 + 2] ?? 0).multiplyScalar(1 / 3));
  const contact: Contact | null = contactWith(neck, middle, OPTIONS.reach);
  assert.ok(contact !== null && contact.depth >= OPTIONS.gap - 1e-4, `the middle of the face sits at ${String(contact?.depth)}`);
});

function skinnedNeck(): BodySurface {
  const neck: BodySurface = openNeck();
  const influences: Influence[][] = Array.from({ length: neck.positions.length / 3 }, (): Influence[] => [{ joint: 'neck', weight: 1 }]);
  return { ...neck, influences };
}

void test('cloth hugging the skin moves with the skin, and cloth further off keeps its own joints', (): void => {
  const neck: PreparedBody = prepareBody(skinnedNeck());
  const own: Influence[][] = [[{ joint: 'spine', weight: 1 }], [{ joint: 'spine', weight: 1 }], [{ joint: 'spine', weight: 1 }]];
  const points: number[] = [NECK.radius + OPTIONS.gap, NECK.height / 2, 0, NECK.radius + OPTIONS.gap + OPTIONS.follow / 2, NECK.height / 2, 0, NECK.radius + OPTIONS.gap + OPTIONS.follow * 2, NECK.height / 2, 0];
  const described: string[][] = followSkin(points, own, neck, OPTIONS).map((influences: Influence[]): string[] =>
    influences.filter((influence: Influence): boolean => influence.weight >= 0.005).map((influence: Influence): string => `${influence.joint} ${influence.weight.toFixed(2)}`).toSorted(),
  );
  assert.deepEqual(described, [['neck 1.00'], ['neck 0.50', 'spine 0.50'], ['spine 1.00']]);
});

interface ShippedFit {
  readonly out: string;
  readonly body: string;
  readonly material: string;
  readonly options: FitOptions;
}

function shippedFits(): ShippedFit[] {
  const parsed: unknown = JSON.parse(readFileSync(SHIPPED.plans, 'utf8'));
  return each(parsed, 'plans', (entry: unknown, where: string): ShippedFit[] => {
    const plan: Fields = fields(entry, where);
    if (plan['over'] === undefined) return [];
    const over: Fields = fields(plan['over'], `${where}.over`);
    const options: FitOptions = { gap: numeric(over, 'gap', where), depth: numeric(over, 'depth', where), reach: numeric(over, 'reach', where), blend: numeric(over, 'blend', where), follow: numeric(over, 'follow', where) };
    return [{ out: text(plan, 'out', where), body: text(over, 'body', where), material: text(over, 'material', where), options }];
  }).flat();
}

async function reader(): Promise<NodeIO> {
  await MeshoptDecoder.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

function blended(matrices: readonly Matrix4[], joints: readonly number[], weights: readonly number[], vertex: number): Matrix4 {
  const sum: number[] = Array.from({ length: 16 }, (): number => 0);
  for (let slot: number = 0; slot < 4; slot += 1) {
    const weight: number = weights[vertex * 4 + slot] ?? 0;
    const matrix: Matrix4 | undefined = matrices[joints[vertex * 4 + slot] ?? 0];
    if (weight === 0 || matrix === undefined) continue;
    matrix.elements.forEach((value: number, cell: number): void => {
      sum[cell] = (sum[cell] ?? 0) + value * weight;
    });
  }
  return new Matrix4().fromArray(sum);
}

function restSurface(document: Document, material: string | null): BodySurface {
  const positions: number[] = [];
  const indices: number[] = [];
  const point: Vector3 = new Vector3();
  for (const node of meshNodes(document)) {
    const skin: Skin | null = node.getSkin();
    const inverse: number[] = elementsOf(skin?.getInverseBindMatrices() ?? null, 16);
    const matrices: Matrix4[] = (skin?.listJoints() ?? []).map((joint: Node, index: number): Matrix4 => new Matrix4().fromArray(joint.getWorldMatrix()).multiply(new Matrix4().fromArray(inverse, index * 16)));
    const still: Matrix4 = new Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      if (material !== null && primitive.getMaterial()?.getName() !== material) continue;
      const local: number[] = elementsOf(primitive.getAttribute('POSITION'), 3);
      const joints: number[] = elementsOf(primitive.getAttribute('JOINTS_0'), 4);
      const weights: number[] = elementsOf(primitive.getAttribute('WEIGHTS_0'), 4);
      const offset: number = positions.length / 3;
      for (let vertex: number = 0; vertex * 3 < local.length; vertex += 1) {
        const placed: Matrix4 = matrices.length === 0 ? still : blended(matrices, joints, weights, vertex);
        point.fromArray(local, vertex * 3).applyMatrix4(placed);
        positions.push(point.x, point.y, point.z);
      }
      const sourceIndices: number[] = elementsOf(primitive.getIndices(), 1);
      indices.push(...sourceIndices.map((index: number): number => index + offset));
    }
  }
  return { positions, indices, influences: [] };
}

function sunkPoints(cloth: BodySurface, body: PreparedBody, options: FitOptions): string[] {
  const sunk: string[] = [];
  const point: Vector3 = new Vector3();
  for (let index: number = 0; index * 3 < cloth.positions.length; index += 1) {
    point.fromArray(cloth.positions, index * 3);
    const contact: Contact | null = contactWith(body, point, options.reach);
    if (contact === null || contact.depth < -SHIPPED.shallow || contact.depth >= options.gap - SHIPPED.slack) continue;
    sunk.push(`(${point.toArray().map((value: number): string => value.toFixed(3)).join(', ')}) at ${(contact.depth * 1000).toFixed(1)} mm`);
  }
  return sunk;
}

function bent(document: Document, bend: Bend | null): Document {
  const joint: Node | undefined = bend === null ? undefined : document.getRoot().listNodes().find((node: Node): boolean => node.getName() === bend.joint);
  if (bend === null || joint === undefined) return document;
  const turn: Quaternion = new Quaternion().setFromAxisAngle(new Vector3(...bend.axis), (bend.degrees * Math.PI) / 180);
  const [x, y, z, w]: [number, number, number, number] = new Quaternion().fromArray(joint.getRotation()).multiply(turn).toArray();
  joint.setRotation([x, y, z, w]);
  return document;
}

async function sunkIn(io: NodeIO, fit: ShippedFit, bend: Bend | null): Promise<string> {
  const [bodyFile, clothFile]: [Document, Document] = await Promise.all([io.read(fit.body), io.read(fit.out)]);
  const sunk: string[] = sunkPoints(restSurface(bent(clothFile, bend), null), prepareBody(restSurface(bent(bodyFile, bend), fit.material)), fit.options);
  const pose: string = bend === null ? 'the rest pose' : `${bend.joint} turned ${String(bend.degrees)} degrees about (${bend.axis.join(', ')})`;
  return sunk.length === 0 ? '' : `${fit.out} in ${pose}: ${String(sunk.length)} points sit in the skin of ${fit.body}, first ${sunk.slice(0, 3).join('; ')}`;
}

void test('every outfit fitted over a body clears its skin at rest and while the neck and head turn', async (): Promise<void> => {
  const io: NodeIO = await reader();
  const fits: ShippedFit[] = shippedFits();
  assert.ok(fits.length > 0, 'no outfit is fitted over a body');
  const poses: (Bend | null)[] = [null, ...BENDS];
  const found: string[] = await Promise.all(fits.flatMap((fit: ShippedFit): Promise<string>[] => poses.map((bend: Bend | null): Promise<string> => sunkIn(io, fit, bend))));
  assert.deepEqual(found.filter((line: string): boolean => line !== ''), []);
});
