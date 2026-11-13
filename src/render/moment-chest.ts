import type { Material, Object3D } from 'three';
import { BufferAttribute, BufferGeometry, Color, Group, Matrix4, Mesh, MeshStandardMaterial } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { ChestRules, MomentChest } from '../../sim/content/moment-types.ts';
import type { PropDef } from '../../sim/content/types.ts';
import type { ChestState } from '../../sim/world/types.ts';
import type { Spring } from '../hud/character-spring.ts';
import { springTo, stepSpring } from '../hud/character-spring.ts';
import type { Dresser } from './character-loader.ts';
import type { GhostUniforms, RigGlow } from './ghost-material.ts';
import { createGhostUniforms, makeGhost } from './ghost-material.ts';
import type { GroundLight } from './ground-light.ts';
import { createGroundLight, GROUND_LIGHT } from './ground-light.ts';

export const MOMENT_CHEST = {
  sink: 0.5,
  startScale: 0.6,
  glowRadius: 1.5,
  glowFill: 0.8,
  glowBand: 0.3,
  glowWidth: 0.5,
  glowWobble: 0.25,
  glowClosed: 0.35,
  glowPulse: 0.25,
  glowRate: 2.6,
  glowOpen: 0.9,
  glowFall: 1.4,
} as const;

const CHEST_GLOW: Color = new Color(0xffc45a);
const WHITE: Color = new Color(0xffffff);

export interface ChestView {
  readonly root: Group;
  readonly lid: Group;
  readonly ghost: GhostUniforms;
  readonly materials: MeshStandardMaterial[];
  readonly geometries: BufferGeometry[];
  readonly glow: GroundLight;
  readonly rise: Spring;
  readonly swing: Spring;
  readonly scale: number;
  opened: number;
}

export interface ChestMaking {
  readonly rules: ChestRules;
  readonly prop: PropDef;
  readonly model: GLTF;
  readonly dresser: Dresser;
  readonly flash: RigGlow;
}

export interface ChestMoment {
  readonly state: ChestState;
  readonly fade: number;
  readonly clock: number;
}

function sideOf(geometry: BufferGeometry, seam: number, above: boolean): BufferGeometry {
  const flat: BufferGeometry = geometry.index === null ? geometry : geometry.toNonIndexed();
  const raw: unknown = flat.getAttribute('position');
  const position: BufferAttribute | undefined = raw instanceof BufferAttribute ? raw : undefined;
  const kept: number[] = [];
  const count: number = position === undefined ? 0 : position.count;
  for (let corner: number = 0; corner + 2 < count; corner += 3) {
    const middle: number = position === undefined ? 0 : (position.getY(corner) + position.getY(corner + 1) + position.getY(corner + 2)) / 3;
    if (middle >= seam === above) kept.push(corner, corner + 1, corner + 2);
  }
  const part: BufferGeometry = new BufferGeometry();
  for (const name of Object.keys(flat.attributes)) {
    const source: unknown = flat.getAttribute(name);
    if (!(source instanceof BufferAttribute)) continue;
    const values: Float32Array = new Float32Array(kept.length * source.itemSize);
    kept.forEach((vertex: number, at: number): void => {
      for (let item: number = 0; item < source.itemSize; item += 1) values[at * source.itemSize + item] = source.getComponent(vertex, item);
    });
    part.setAttribute(name, new BufferAttribute(values, source.itemSize));
  }
  if (flat !== geometry) flat.dispose();
  return part;
}

function isGeometry(value: unknown): value is BufferGeometry {
  return value instanceof BufferGeometry;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function buildChest(making: ChestMaking, holder: Group, chest: MomentChest): ChestView {
  const { rules, prop, model } = making;
  const ghost: GhostUniforms = createGhostUniforms(WHITE, 0);
  ghost.rim.value = 0;
  ghost.dissolve.value = 1;
  const root: Group = new Group();
  const lid: Group = new Group();
  lid.position.set(0, rules.lid.seam, rules.lid.hinge);
  root.add(lid);
  const materials: MeshStandardMaterial[] = [];
  const geometries: BufferGeometry[] = [];
  const toLid: Matrix4 = new Matrix4().makeTranslation(0, -rules.lid.seam, -rules.lid.hinge);
  model.scene.updateMatrixWorld(true);
  model.scene.traverse((child: Object3D): void => {
    if (!(child instanceof Mesh)) return;
    const shape: unknown = child.geometry;
    if (!isGeometry(shape)) return;
    const source: unknown = child.material;
    if (!(source instanceof MeshStandardMaterial)) return;
    const dressed: Material = making.dresser(prop.surfaces, source);
    const material: MeshStandardMaterial = dressed instanceof MeshStandardMaterial ? dressed.clone() : source.clone();
    makeGhost(material, making.flash, ghost);
    materials.push(material);
    const placed: BufferGeometry = shape.clone().applyMatrix4(child.matrixWorld);
    const base: BufferGeometry = sideOf(placed, rules.lid.seam, false);
    const top: BufferGeometry = sideOf(placed, rules.lid.seam, true).applyMatrix4(toLid);
    placed.dispose();
    for (const [geometry, parent] of [[base, root], [top, lid]] as const) {
      geometry.computeBoundingSphere();
      geometries.push(geometry);
      const mesh: Mesh = new Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  });
  const glow: GroundLight = createGroundLight(CHEST_GLOW, { kind: 'round', radius: MOMENT_CHEST.glowRadius, inner: 0, arc: Math.PI * 2 }, { fill: MOMENT_CHEST.glowFill, band: MOMENT_CHEST.glowBand, width: MOMENT_CHEST.glowWidth, wobble: MOMENT_CHEST.glowWobble });
  glow.mesh.position.set(chest.x, GROUND_LIGHT.height, chest.z);
  root.position.set(chest.x, -MOMENT_CHEST.sink, chest.z);
  root.rotation.y = (chest.rotationDegrees * Math.PI) / 180;
  root.scale.setScalar(prop.scale * MOMENT_CHEST.startScale);
  holder.add(root, glow.mesh);
  return { root, lid, ghost, materials, geometries, glow, rise: { value: 0, velocity: 0, target: 1 }, swing: { value: 0, velocity: 0, target: 0 }, scale: prop.scale, opened: 0 };
}

export function stepChest(view: ChestView, rules: ChestRules, moment: ChestMoment, dt: number): void {
  const open: boolean = moment.state === 'opening' || moment.state === 'opened';
  springTo(view.swing, open ? 1 : 0);
  stepSpring(view.rise, dt);
  stepSpring(view.swing, dt);
  if (open) view.opened += dt;
  const rise: number = view.rise.value;
  view.root.position.y = (rise - 1) * MOMENT_CHEST.sink;
  view.root.scale.setScalar(view.scale * (MOMENT_CHEST.startScale + (1 - MOMENT_CHEST.startScale) * rise));
  view.lid.rotation.x = (rules.lid.hinge < 0 ? -1 : 1) * view.swing.value * ((rules.lid.degrees * Math.PI) / 180);
  view.ghost.dissolve.value = Math.max(moment.fade, 1 - clamp01(rise));
  const pulse: number = MOMENT_CHEST.glowClosed + MOMENT_CHEST.glowPulse * Math.sin(moment.clock * MOMENT_CHEST.glowRate);
  const burst: number = MOMENT_CHEST.glowOpen * Math.exp(-view.opened * MOMENT_CHEST.glowFall);
  view.glow.pose((open ? burst : pulse) * clamp01(rise) * (1 - moment.fade), moment.clock);
}

export function disposeChest(view: ChestView): void {
  for (const material of view.materials) material.dispose();
  for (const geometry of view.geometries) geometry.dispose();
  view.glow.dispose();
  view.root.removeFromParent();
}
