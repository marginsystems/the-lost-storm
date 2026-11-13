import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Accessor, Document, Material, Mesh, Node, Primitive, Property, Scene, Skin, Texture } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { copyToDocument, dedup, prune } from '@gltf-transform/functions';
import { Color, Matrix3, Matrix4, Vector3 } from 'three';
import type { Fields } from '../sim/content/read.ts';
import { each, fields, numeric, text, textList } from '../sim/content/read.ts';

const ASSEMBLE = {
  influences: 4,
  corners: 3,
} as const;

const KEPT_SEMANTICS: ReadonlySet<string> = new Set<string>(['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']);

interface PartPlan {
  readonly from: string;
  readonly meshes: readonly string[] | null;
  readonly held: readonly string[];
  readonly share: number;
  readonly material: string | null;
}

interface MaterialPlan {
  readonly material: string;
  readonly name: string;
  readonly baseColor: string | null;
  readonly tint: string | null;
}

interface BodyPlan {
  readonly out: string;
  readonly skeleton: string;
  readonly keep: readonly string[];
  readonly parts: readonly PartPlan[];
  readonly materials: readonly MaterialPlan[];
  readonly names: ReadonlyMap<string, string>;
  readonly textureSize: number;
}

interface Target {
  readonly document: Document;
  readonly skin: Skin;
  readonly holder: Node | Scene;
  readonly jointOf: ReadonlyMap<string, number>;
  readonly binds: readonly Matrix4[];
}

function usage(): never {
  console.error('usage: node tools/assemble-body.ts <plan.json> <sources-folder> [<out.glb> ...]');
  process.exit(2);
}

function readPart(value: unknown, where: string): PartPlan {
  const source: Fields = fields(value, where);
  return {
    from: text(source, 'from', where),
    meshes: source['meshes'] === undefined ? null : textList(source, 'meshes', where),
    held: source['held'] === undefined ? [] : textList(source, 'held', where),
    share: source['share'] === undefined ? 0 : numeric(source, 'share', where),
    material: source['material'] === undefined ? null : text(source, 'material', where),
  };
}

function readNames(value: unknown, where: string): Map<string, string> {
  const names: Map<string, string> = new Map<string, string>();
  if (value === undefined) return names;
  const source: Fields = fields(value, where);
  for (const key of Object.keys(source)) names.set(key, text(source, key, where));
  return names;
}

function readMaterial(value: unknown, where: string): MaterialPlan {
  const source: Fields = fields(value, where);
  return {
    material: text(source, 'material', where),
    name: text(source, 'name', where),
    baseColor: source['baseColor'] === undefined ? null : text(source, 'baseColor', where),
    tint: source['tint'] === undefined ? null : text(source, 'tint', where),
  };
}

function readPlans(path: string): BodyPlan[] {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return each(parsed, 'plans', (entry: unknown, where: string): BodyPlan => {
    const source: Fields = fields(entry, where);
    return {
      out: text(source, 'out', where),
      skeleton: text(source, 'skeleton', where),
      keep: textList(source, 'keep', where),
      parts: source['parts'] === undefined ? [] : each(source['parts'], `${where}.parts`, readPart),
      materials: source['materials'] === undefined ? [] : each(source['materials'], `${where}.materials`, readMaterial),
      names: readNames(source['names'], `${where}.names`),
      textureSize: numeric(source, 'textureSize', where),
    };
  });
}

function matricesOf(accessor: Accessor | null, count: number): Matrix4[] {
  const matrices: Matrix4[] = [];
  const element: number[] = [];
  for (let index: number = 0; index < count; index += 1) {
    const matrix: Matrix4 = new Matrix4();
    if (accessor !== null) matrix.fromArray(accessor.getElement(index, element));
    matrices.push(matrix);
  }
  return matrices;
}

function skinOf(document: Document, path: string): Skin {
  const skin: Skin | undefined = document.getRoot().listSkins()[0];
  if (skin === undefined) throw new Error(`${path} has no skin`);
  return skin;
}

function meshNodes(document: Document): Node[] {
  return document
    .getRoot()
    .listNodes()
    .filter((node: Node): boolean => node.getMesh() !== null);
}

function openTarget(document: Document, path: string, keep: readonly string[]): Target {
  const skin: Skin = skinOf(document, path);
  const joints: Node[] = skin.listJoints();
  const inverse: Matrix4[] = matricesOf(skin.getInverseBindMatrices(), joints.length);
  let holder: Node | Scene | null = null;
  const found: Set<string> = new Set<string>();
  for (const node of meshNodes(document)) {
    holder ??= node.getParentNode() ?? document.getRoot().listScenes()[0] ?? null;
    const name: string = node.getName();
    if (!keep.includes(name)) {
      node.dispose();
      continue;
    }
    found.add(name);
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      for (const semantic of primitive.listSemantics()) if (!KEPT_SEMANTICS.has(semantic)) primitive.setAttribute(semantic, null);
    }
  }
  const missing: string[] = keep.filter((name: string): boolean => !found.has(name));
  if (missing.length > 0) throw new Error(`${path} has no mesh named ${missing.join(', ')}`);
  for (const animation of document.getRoot().listAnimations()) animation.dispose();
  holder ??= document.getRoot().listScenes()[0] ?? null;
  if (holder === null) throw new Error(`${path} has no scene`);
  return {
    document,
    skin,
    holder,
    jointOf: new Map<string, number>(joints.map((joint: Node, index: number): [string, number] => [joint.getName(), index])),
    binds: inverse.map((matrix: Matrix4): Matrix4 => matrix.clone().invert()),
  };
}

function elementsOf(accessor: Accessor | null, width: number): number[] {
  const values: number[] = [];
  if (accessor === null) return values;
  const element: number[] = [];
  for (let index: number = 0; index < accessor.getCount(); index += 1) {
    accessor.getElement(index, element);
    for (let slot: number = 0; slot < width; slot += 1) values.push(element[slot] ?? 0);
  }
  return values;
}

interface Refit {
  readonly matrices: readonly Matrix4[];
  readonly joints: readonly number[];
}

function refitOf(target: Target, source: Skin, where: string): Refit {
  const joints: Node[] = source.listJoints();
  const inverse: Matrix4[] = matricesOf(source.getInverseBindMatrices(), joints.length);
  const matrices: Matrix4[] = [];
  const mapped: number[] = [];
  joints.forEach((joint: Node, index: number): void => {
    const to: number | undefined = target.jointOf.get(joint.getName());
    const bind: Matrix4 | undefined = to === undefined ? undefined : target.binds[to];
    const unbind: Matrix4 | undefined = inverse[index];
    if (to === undefined || bind === undefined || unbind === undefined) throw new Error(`${where}: joint "${joint.getName()}" is not in the target skeleton`);
    matrices.push(bind.clone().multiply(unbind));
    mapped.push(to);
  });
  return { matrices, joints: mapped };
}

interface Fitted {
  readonly positions: number[];
  readonly normals: number[];
  readonly joints: number[];
  readonly weights: number[];
}

function fitVertices(primitive: Primitive, refit: Refit): Fitted {
  const positions: number[] = elementsOf(primitive.getAttribute('POSITION'), 3);
  const normals: number[] = elementsOf(primitive.getAttribute('NORMAL'), 3);
  const joints: number[] = elementsOf(primitive.getAttribute('JOINTS_0'), ASSEMBLE.influences);
  const weights: number[] = elementsOf(primitive.getAttribute('WEIGHTS_0'), ASSEMBLE.influences);
  const count: number = positions.length / 3;
  const point: Vector3 = new Vector3();
  const moved: Vector3 = new Vector3();
  const normal: Vector3 = new Vector3();
  const turned: Vector3 = new Vector3();
  const linear: Matrix3 = new Matrix3();
  const outJoints: number[] = [];
  for (let vertex: number = 0; vertex < count; vertex += 1) {
    const at: Vector3 = new Vector3(0, 0, 0);
    const facing: Vector3 = new Vector3(0, 0, 0);
    let total: number = 0;
    for (let slot: number = 0; slot < ASSEMBLE.influences; slot += 1) {
      const weight: number = weights[vertex * ASSEMBLE.influences + slot] ?? 0;
      const joint: number = joints[vertex * ASSEMBLE.influences + slot] ?? 0;
      outJoints.push(weight > 0 ? (refit.joints[joint] ?? 0) : 0);
      const matrix: Matrix4 | undefined = refit.matrices[joint];
      if (weight <= 0 || matrix === undefined) continue;
      total += weight;
      point.set(positions[vertex * 3] ?? 0, positions[vertex * 3 + 1] ?? 0, positions[vertex * 3 + 2] ?? 0);
      at.addScaledVector(moved.copy(point).applyMatrix4(matrix), weight);
      normal.set(normals[vertex * 3] ?? 0, normals[vertex * 3 + 1] ?? 0, normals[vertex * 3 + 2] ?? 0);
      facing.addScaledVector(turned.copy(normal).applyMatrix3(linear.setFromMatrix4(matrix)), weight);
    }
    if (total > 0) at.multiplyScalar(1 / total);
    facing.normalize();
    at.toArray(positions, vertex * 3);
    facing.toArray(normals, vertex * 3);
  }
  return { positions, normals, joints: outJoints, weights };
}

function keptTriangles(indices: readonly number[], fitted: Fitted, held: ReadonlySet<number>, share: number): number[] {
  if (held.size === 0) return [...indices];
  const owned = (vertex: number): number => {
    let total: number = 0;
    for (let slot: number = 0; slot < ASSEMBLE.influences; slot += 1) {
      if (held.has(fitted.joints[vertex * ASSEMBLE.influences + slot] ?? -1)) total += fitted.weights[vertex * ASSEMBLE.influences + slot] ?? 0;
    }
    return total;
  };
  const kept: number[] = [];
  for (let corner: number = 0; corner + 2 < indices.length; corner += ASSEMBLE.corners) {
    const triangle: number[] = [indices[corner] ?? 0, indices[corner + 1] ?? 0, indices[corner + 2] ?? 0];
    if (triangle.every((vertex: number): boolean => owned(vertex) >= share)) kept.push(...triangle);
  }
  return kept;
}

function addPrimitive(target: Target, primitive: Primitive, fitted: Fitted, held: ReadonlySet<number>, share: number, material: Material | null): Primitive | null {
  const uvs: number[] = elementsOf(primitive.getAttribute('TEXCOORD_0'), 2);
  const count: number = fitted.positions.length / 3;
  const sourceIndices: Accessor | null = primitive.getIndices();
  const indices: number[] = sourceIndices === null ? Array.from({ length: count }, (_value: unknown, index: number): number => index) : elementsOf(sourceIndices, 1);
  const kept: number[] = keptTriangles(indices, fitted, held, share);
  if (kept.length === 0) return null;
  const slotOf: Map<number, number> = new Map<number, number>();
  for (const vertex of kept) if (!slotOf.has(vertex)) slotOf.set(vertex, slotOf.size);
  const pick = (values: readonly number[], width: number): number[] => {
    const out: number[] = Array.from({ length: slotOf.size * width }, (): number => 0);
    for (const [vertex, slot] of slotOf) for (let part: number = 0; part < width; part += 1) out[slot * width + part] = values[vertex * width + part] ?? 0;
    return out;
  };
  const document: Document = target.document;
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  const made: Primitive = document
    .createPrimitive()
    .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(new Float32Array(pick(fitted.positions, 3))).setBuffer(buffer))
    .setAttribute('NORMAL', document.createAccessor().setType('VEC3').setArray(new Float32Array(pick(fitted.normals, 3))).setBuffer(buffer))
    .setAttribute('JOINTS_0', document.createAccessor().setType('VEC4').setArray(new Uint16Array(pick(fitted.joints, ASSEMBLE.influences))).setBuffer(buffer))
    .setAttribute('WEIGHTS_0', document.createAccessor().setType('VEC4').setArray(new Float32Array(pick(fitted.weights, ASSEMBLE.influences))).setBuffer(buffer))
    .setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint32Array(kept.map((vertex: number): number => slotOf.get(vertex) ?? 0))).setBuffer(buffer));
  if (uvs.length > 0) made.setAttribute('TEXCOORD_0', document.createAccessor().setType('VEC2').setArray(new Float32Array(pick(uvs, 2))).setBuffer(buffer));
  if (material !== null) made.setMaterial(material);
  return made;
}

function namedMaterial(document: Document, name: string, where: string): Material {
  const found: Material | undefined = document
    .getRoot()
    .listMaterials()
    .find((material: Material): boolean => material.getName() === name);
  if (found === undefined) throw new Error(`${where}: the target has no material named "${name}"`);
  return found;
}

function addPart(target: Target, part: PartPlan, source: Document, path: string): string[] {
  const refit: Refit = refitOf(target, skinOf(source, path), path);
  const copied: Map<Material, Material> = new Map<Material, Material>();
  const materialFor = (worn: Material | null): Material | null => {
    if (part.material !== null) return namedMaterial(target.document, part.material, path);
    if (worn === null) return null;
    const known: Material | undefined = copied.get(worn);
    if (known !== undefined) return known;
    const made: Property | undefined = copyToDocument(target.document, source, [worn]).get(worn);
    const material: Material | null = made === undefined ? null : target.document.getRoot().listMaterials().find((candidate: Material): boolean => candidate === made) ?? null;
    if (material !== null) copied.set(worn, material);
    return material;
  };
  const held: Set<number> = new Set<number>();
  for (const name of part.held) {
    const joint: number | undefined = target.jointOf.get(name);
    if (joint === undefined) throw new Error(`${path}: the target skeleton has no joint named "${name}"`);
    held.add(joint);
  }
  const added: string[] = [];
  const wanted: Set<string> = new Set<string>(part.meshes ?? []);
  for (const node of meshNodes(source)) {
    const mesh: Mesh | null = node.getMesh();
    const name: string = node.getName();
    if (mesh === null || (part.meshes !== null && !wanted.has(name))) continue;
    wanted.delete(name);
    const made: Mesh = target.document.createMesh(name);
    for (const primitive of mesh.listPrimitives()) {
      const built: Primitive | null = addPrimitive(target, primitive, fitVertices(primitive, refit), held, part.share, materialFor(primitive.getMaterial()));
      if (built !== null) made.addPrimitive(built);
    }
    if (made.listPrimitives().length === 0) continue;
    target.holder.addChild(target.document.createNode(name).setMesh(made).setSkin(target.skin));
    added.push(name);
  }
  if (wanted.size > 0) throw new Error(`${path} has no mesh named ${[...wanted].join(', ')}`);
  return added;
}

function shrinkTextures(document: Document, size: number): void {
  const folder: string = mkdtempSync(join(tmpdir(), 'assemble-body-'));
  document
    .getRoot()
    .listTextures()
    .forEach((texture: Texture, index: number): void => {
      const image: Uint8Array | null = texture.getImage();
      const dimensions: readonly number[] | null = texture.getSize();
      if (image === null || dimensions === null || Math.max(...dimensions) <= size) return;
      const source: string = join(folder, `${index}-in.${texture.getMimeType() === 'image/png' ? 'png' : 'jpg'}`);
      const shrunk: string = join(folder, `${index}-out.${texture.getMimeType() === 'image/png' ? 'png' : 'jpg'}`);
      writeFileSync(source, image);
      execFileSync('sips', ['-Z', String(size), source, '--out', shrunk], { stdio: 'ignore' });
      texture.setImage(new Uint8Array(readFileSync(shrunk)));
    });
}

function dressMaterials(document: Document, plans: readonly MaterialPlan[], root: string, where: string): void {
  for (const plan of plans) {
    const material: Material | undefined = document
      .getRoot()
      .listMaterials()
      .find((candidate: Material): boolean => candidate.getName() === plan.material);
    if (material === undefined) continue;
    material.setName(plan.name);
    if (plan.tint !== null) {
      const tint: Color = new Color(plan.tint);
      material.setBaseColorFactor([tint.r, tint.g, tint.b, 1]);
    }
    if (plan.baseColor === null) continue;
    const path: string = join(root, plan.baseColor);
    const texture: Texture = document
      .createTexture(plan.name)
      .setImage(new Uint8Array(readFileSync(path)))
      .setMimeType(path.endsWith('.png') ? 'image/png' : 'image/jpeg');
    material.setBaseColorTexture(texture);
  }
  const named: Set<string> = new Set<string>(plans.map((plan: MaterialPlan): string => plan.name));
  const left: string[] = plans.filter((plan: MaterialPlan): boolean => !document.getRoot().listMaterials().some((material: Material): boolean => material.getName() === plan.name)).map((plan: MaterialPlan): string => plan.material);
  if (named.size > 0 && left.length === plans.length) throw new Error(`${where} has none of the materials ${left.join(', ')}`);
}

function renameMeshes(document: Document, names: ReadonlyMap<string, string>): void {
  for (const node of meshNodes(document)) {
    const name: string = names.get(node.getName()) ?? node.getName();
    node.setName(name);
    node.getMesh()?.setName(name);
  }
}

async function assemble(io: NodeIO, plan: BodyPlan, root: string): Promise<void> {
  const path: string = join(root, plan.skeleton);
  const target: Target = openTarget(await io.read(path), path, plan.keep);
  const added: string[] = [...plan.keep];
  const sources: Document[] = await Promise.all(plan.parts.map((part: PartPlan): Promise<Document> => io.read(join(root, part.from))));
  plan.parts.forEach((part: PartPlan, index: number): void => {
    const source: Document | undefined = sources[index];
    if (source !== undefined) added.push(...addPart(target, part, source, join(root, part.from)));
  });
  renameMeshes(target.document, plan.names);
  dressMaterials(target.document, plan.materials, root, plan.out);
  await target.document.transform(prune({ keepLeaves: true }), dedup());
  shrinkTextures(target.document, plan.textureSize);
  mkdirSync(dirname(plan.out), { recursive: true });
  await io.write(plan.out, target.document);
  console.log(`${plan.out}: ${added.join(', ')}`);
}

async function main(): Promise<void> {
  const [planPath, root, ...only] = process.argv.slice(2);
  if (planPath === undefined || root === undefined) usage();
  const io: NodeIO = new NodeIO();
  const plans: BodyPlan[] = readPlans(planPath).filter((plan: BodyPlan): boolean => only.length === 0 || only.includes(plan.out));
  await Promise.all(plans.map((plan: BodyPlan): Promise<void> => assemble(io, plan, root)));
}

await main();
