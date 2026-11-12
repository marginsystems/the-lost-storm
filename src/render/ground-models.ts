import type { BufferGeometry, Object3D } from 'three';
import { Box3, BufferAttribute, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import type { Content, GroundKeep, GroundLook, ItemBaseDef, RigDef } from '../../sim/content/types.ts';
import type { CharacterLibrary, LoadedAttachment, LoadedWearable } from './character-loader.ts';

export const GROUND_MODEL = {
  floorClearance: 0.02,
  matteFrom: 0.4,
  matteRoughness: 0.85,
  pouchRadius: 0.22,
  pouchSquash: 0.72,
  pouchNeckRadius: 0.07,
  pouchNeckHeight: 0.12,
  bundleRadius: 0.3,
  bundleSquash: 0.38,
  pouchColor: '#7a5a3c',
  bundleColor: '#9a8e78',
  segments: 14,
  shadowPerMetre: 1.5,
  shadowMin: 0.6,
} as const;

const DEGREES: number = Math.PI / 180;
const HALF_TURN: number = Math.PI / 2;

export interface GroundTemplate {
  readonly model: Object3D;
  readonly footprint: number;
  readonly waiting: boolean;
}

function rigScale(content: Content): number {
  const rig: RigDef | undefined = content.rigs.get(content.player.rig);
  return rig === undefined ? 1 : rig.scale;
}

function heldScale(content: Content, attachment: LoadedAttachment): number {
  const rig: RigDef | undefined = content.rigs.get(content.player.rig);
  if (rig === undefined) return 1;
  return rig.scale * (rig.sockets[attachment.def.socket]?.scale ?? 1);
}

function keptHalf(geometry: BufferGeometry, keep: GroundKeep): BufferGeometry {
  if (keep === 'all') return geometry;
  const position = geometry.getAttribute('position');
  const source: ArrayLike<number> | null = geometry.index === null ? null : geometry.index.array;
  const count: number = source === null ? position.count : source.length;
  const kept: number[] = [];
  for (let at: number = 0; at + 2 < count; at += 3) {
    const corners: number[] = [0, 1, 2].map((offset: number): number => (source === null ? at + offset : (source[at + offset] ?? 0)));
    const centre: number = corners.reduce((sum: number, corner: number): number => sum + position.getX(corner), 0) / 3;
    if (centre > 0) kept.push(...corners);
  }
  const half: BufferGeometry = geometry.clone();
  half.setIndex(new BufferAttribute(new Uint32Array(kept), 1));
  return half;
}

function matte(source: unknown, tint: string): MeshStandardMaterial | null {
  if (!(source instanceof MeshStandardMaterial)) return null;
  const material: MeshStandardMaterial = source.clone();
  material.color.multiply(new Color(tint));
  if (material.metalness < GROUND_MODEL.matteFrom) {
    material.roughness = Math.max(material.roughness, GROUND_MODEL.matteRoughness);
    material.metalness = 0;
    material.metalnessMap = null;
  }
  return material;
}

function wornModel(worn: LoadedWearable, keep: GroundKeep): Group {
  const group: Group = new Group();
  for (const piece of worn.pieces) {
    const material: MeshStandardMaterial | null = matte(piece.material, worn.def.tint);
    if (material === null) continue;
    piece.updateWorldMatrix(true, false);
    const geometry: BufferGeometry = keptHalf(piece.geometry, keep);
    const mesh: Mesh = new Mesh(geometry, material);
    mesh.applyMatrix4(piece.matrixWorld);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

function heldModel(attachment: LoadedAttachment): Group {
  const model: Object3D = attachment.template.clone(true);
  const flat: Group = new Group();
  flat.add(model);
  const size: Vector3 = new Box3().setFromObject(model).getSize(new Vector3());
  model.rotation.y = size.x < size.z ? HALF_TURN : 0;
  flat.rotation.x = HALF_TURN;
  return flat;
}

function genericModel(kind: 'pouch' | 'bundle'): Group {
  const group: Group = new Group();
  if (kind === 'pouch') {
    const leather: MeshStandardMaterial = new MeshStandardMaterial({ color: new Color(GROUND_MODEL.pouchColor), roughness: GROUND_MODEL.matteRoughness });
    const body: Mesh = new Mesh(new SphereGeometry(GROUND_MODEL.pouchRadius, GROUND_MODEL.segments, GROUND_MODEL.segments), leather);
    body.scale.y = GROUND_MODEL.pouchSquash;
    const neck: Mesh = new Mesh(new CylinderGeometry(GROUND_MODEL.pouchNeckRadius, GROUND_MODEL.pouchNeckRadius * 1.6, GROUND_MODEL.pouchNeckHeight, GROUND_MODEL.segments), leather);
    neck.position.y = GROUND_MODEL.pouchRadius * GROUND_MODEL.pouchSquash;
    group.add(body, neck);
  } else {
    const cloth: MeshStandardMaterial = new MeshStandardMaterial({ color: new Color(GROUND_MODEL.bundleColor), roughness: GROUND_MODEL.matteRoughness });
    const body: Mesh = new Mesh(new SphereGeometry(GROUND_MODEL.bundleRadius, GROUND_MODEL.segments, GROUND_MODEL.segments), cloth);
    body.scale.set(1.2, GROUND_MODEL.bundleSquash, 0.85);
    group.add(body);
  }
  group.traverse((object: Object3D): void => {
    if (object instanceof Mesh) object.castShadow = true;
  });
  return group;
}

function settled(inner: Object3D, look: GroundLook, scale: number, waiting: boolean): GroundTemplate {
  const posed: Group = new Group();
  posed.add(inner);
  posed.rotation.set(look.pitch * DEGREES, 0, look.roll * DEGREES);
  const sized: Group = new Group();
  sized.add(posed);
  sized.scale.setScalar(scale * look.scale);
  sized.updateMatrixWorld(true);
  const bounds: Box3 = new Box3().setFromObject(sized);
  const centre: Vector3 = bounds.getCenter(new Vector3());
  const size: Vector3 = bounds.getSize(new Vector3());
  sized.position.set(-centre.x, GROUND_MODEL.floorClearance - bounds.min.y, -centre.z);
  const model: Group = new Group();
  model.add(sized);
  return { model, footprint: Math.max(GROUND_MODEL.shadowMin, Math.max(size.x, size.z) * GROUND_MODEL.shadowPerMetre * 0.5), waiting };
}

export function groundTemplate(content: Content, library: CharacterLibrary, base: ItemBaseDef): GroundTemplate {
  const look: GroundLook = base.ground;
  switch (look.model) {
    case 'held': {
      const attachment: LoadedAttachment | undefined = base.visual === null ? undefined : library.attachments.get(base.visual);
      if (attachment !== undefined) return settled(heldModel(attachment), look, heldScale(content, attachment), false);
      break;
    }
    case 'worn': {
      const worn: LoadedWearable | undefined = base.wear.map((id: string): LoadedWearable | undefined => library.wearables.get(id)).find((entry: LoadedWearable | undefined): boolean => entry !== undefined);
      if (worn !== undefined) return settled(wornModel(worn, look.keep), look, rigScale(content), false);
      break;
    }
    case 'pouch':
    case 'bundle':
      return settled(genericModel(look.model), look, 1, false);
  }
  return settled(genericModel(base.slot === 'charm' ? 'pouch' : 'bundle'), { ...look, pitch: 0, roll: 0, scale: 1 }, 1, true);
}
