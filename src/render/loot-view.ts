import type { Object3D, Scene } from 'three';
import type { BufferGeometry } from 'three';
import { AdditiveBlending, Box3, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry, PlaneGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AttachmentDef, Content, ItemBaseDef, RarityDef, RigDef } from '../../sim/content/types.ts';
import { baseOf, rarityOf } from '../../sim/items.ts';
import type { GroundItem, ItemInstance, World } from '../../sim/world/types.ts';
import type { CharacterLibrary, LoadedAttachment } from './character-loader.ts';
import { loadKeptModel } from './character-loader.ts';
import { disposeObject, glow } from './effect-shapes.ts';
import type { Keepsake } from './keepsake.ts';
import { createKeepsake } from './keepsake.ts';

export const LOOT = {
  coinModel: 'models/world/coins.glb',
  coinScale: 0.85,
  tossTime: 0.42,
  tossHeight: 2.6,
  bounceTime: 0.3,
  bounceHeight: 0.35,
  gemSize: 0.3,
  gemHover: 0.75,
  gemBob: 0.12,
  gemSpin: 2.4,
  beamWidth: 0.34,
  beamFromRank: 2,
  beamGlow: 2.2,
  beamRenderOrder: 7,
  beamHeight: 7,
  beamOpacity: 0.5,
  weaponTumbleTurns: 2,
  floorClearance: 0.02,
} as const;

const HALF_TURN: number = Math.PI / 2;
const FULL_TURN: number = Math.PI * 2;

interface GoldEntry {
  readonly kind: 'gold';
  readonly group: Group;
}

interface GemEntry {
  readonly kind: 'gem';
  readonly group: Group;
  readonly gem: Mesh;
  readonly beam: Mesh | null;
}

interface WeaponEntry {
  readonly kind: 'weapon';
  readonly group: Group;
  readonly pivot: Group;
  readonly yaw: number;
  readonly beam: Mesh | null;
}

interface KeepsakeEntry {
  readonly kind: 'keepsake';
  readonly group: Group;
  readonly keepsake: Keepsake;
}

type LootEntry = GoldEntry | GemEntry | WeaponEntry | KeepsakeEntry;

export interface LootView {
  sync(world: World): void;
}

function crossedBeam(): BufferGeometry {
  const planes: BufferGeometry[] = [0, HALF_TURN].map((yaw: number): BufferGeometry => {
    const plane: PlaneGeometry = new PlaneGeometry(LOOT.beamWidth, LOOT.beamHeight);
    plane.rotateY(yaw);
    plane.translate(0, LOOT.beamHeight / 2, 0);
    const fade: number[] = [];
    const heights: Float32BufferAttribute = new Float32BufferAttribute(plane.getAttribute('position').array, 3);
    for (let index: number = 0; index < heights.count; index += 1) {
      const level: number = 1 - heights.getY(index) / LOOT.beamHeight;
      fade.push(level, level, level);
    }
    plane.setAttribute('color', new Float32BufferAttribute(fade, 3));
    return plane;
  });
  return mergeGeometries(planes);
}

function tossOffset(age: number): number {
  if (age < LOOT.tossTime) {
    const t: number = age / LOOT.tossTime;
    return 4 * LOOT.tossHeight * t * (1 - t);
  }
  const bounce: number = (age - LOOT.tossTime) / LOOT.bounceTime;
  if (bounce >= 1) return 0;
  return 4 * LOOT.bounceHeight * bounce * (1 - bounce);
}

function heldScale(content: Content, attachment: AttachmentDef): number {
  const rig: RigDef | undefined = content.rigs.get(content.player.rig);
  if (rig === undefined) return 1;
  return rig.scale * (rig.sockets[attachment.socket]?.scale ?? 1);
}

function lyingModel(attachment: LoadedAttachment, scale: number, floor: number): Group {
  const model: Object3D = attachment.template.clone(true);
  const flat: Group = new Group();
  flat.add(model);
  const size: Vector3 = new Box3().setFromObject(model).getSize(new Vector3());
  model.rotation.y = size.x < size.z ? HALF_TURN : 0;
  flat.rotation.x = HALF_TURN;
  const lifted: Group = new Group();
  lifted.add(flat);
  lifted.scale.setScalar(scale);
  lifted.updateMatrixWorld(true);
  const bounds: Box3 = new Box3().setFromObject(lifted);
  const centre: Vector3 = bounds.getCenter(new Vector3());
  lifted.position.set(-centre.x, floor + LOOT.floorClearance - bounds.min.y, -centre.z);
  return lifted;
}

export async function createLootView(loader: GLTFLoader, scene: Scene, library: CharacterLibrary): Promise<LootView> {
  const coins: Object3D = (await loadKeptModel(loader, LOOT.coinModel)).scene;
  coins.traverse((object: Object3D): void => {
    if (object instanceof Mesh) object.castShadow = true;
  });
  const entries: Map<number, LootEntry> = new Map<number, LootEntry>();

  const beamGeometry: BufferGeometry = crossedBeam();
  const beamMaterials: Map<number, MeshBasicMaterial> = new Map<number, MeshBasicMaterial>();

  const buildBeam = (world: World, group: Group, item: ItemInstance, color: Color): Mesh | null => {
    const rank: number = world.content.rarities.findIndex((rarity: RarityDef): boolean => rarity.id === item.rarity);
    if (rank < LOOT.beamFromRank) return null;
    const key: number = color.getHex();
    let material: MeshBasicMaterial | undefined = beamMaterials.get(key);
    if (material === undefined) {
      material = new MeshBasicMaterial({ color: glow(color, LOOT.beamGlow), vertexColors: true, transparent: true, opacity: LOOT.beamOpacity, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
      beamMaterials.set(key, material);
    }
    const beam: Mesh = new Mesh(beamGeometry, material);
    beam.renderOrder = LOOT.beamRenderOrder;
    group.add(beam);
    return beam;
  };

  const attachmentFor = (world: World, ground: GroundItem): LoadedAttachment | undefined => {
    if (ground.content.kind !== 'item') return undefined;
    const base: ItemBaseDef | null = baseOf(world.content, ground.content.item);
    return base === null || base.visual === null ? undefined : library.attachments.get(base.visual);
  };

  const build = (world: World, ground: GroundItem): LootEntry => {
    const group: Group = new Group();
    scene.add(group);
    if (ground.content.kind === 'gold') {
      const stack: Object3D = coins.clone();
      stack.scale.setScalar(LOOT.coinScale);
      group.add(stack);
      return { kind: 'gold', group };
    }
    if (ground.find !== null) {
      const keepsake: Keepsake = createKeepsake();
      group.add(keepsake.group);
      return { kind: 'keepsake', group, keepsake };
    }
    const color: Color = new Color(rarityOf(world.content, ground.content.item).color);
    const attachment: LoadedAttachment | undefined = attachmentFor(world, ground);
    if (attachment !== undefined) {
      const pivot: Group = new Group();
      pivot.rotation.order = 'YXZ';
      pivot.add(lyingModel(attachment, heldScale(world.content, attachment.def), world.zone.floorHeight));
      group.add(pivot);
      return { kind: 'weapon', group, pivot, yaw: Math.random() * FULL_TURN, beam: buildBeam(world, group, ground.content.item, color) };
    }
    const gem: Mesh = new Mesh(new OctahedronGeometry(LOOT.gemSize, 0), new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.25, metalness: 0.3 }));
    gem.castShadow = true;
    group.add(gem);
    return { kind: 'gem', group, gem, beam: buildBeam(world, group, ground.content.item, color) };
  };

  const release = (entry: LootEntry): void => {
    switch (entry.kind) {
      case 'gold':
        disposeObject(entry.group);
        break;
      case 'gem':
        entry.gem.geometry.dispose();
        if (Array.isArray(entry.gem.material)) for (const material of entry.gem.material) material.dispose();
        else entry.gem.material.dispose();
        entry.group.removeFromParent();
        break;
      case 'weapon':
        entry.group.removeFromParent();
        break;
      case 'keepsake':
        entry.keepsake.dispose();
        entry.group.removeFromParent();
        break;
    }
  };

  return {
    sync(world: World): void {
      const seen: Set<number> = new Set<number>();
      for (const ground of world.ground) {
        seen.add(ground.id);
        let entry: LootEntry | undefined = entries.get(ground.id);
        if (entry === undefined) {
          entry = build(world, ground);
          entries.set(ground.id, entry);
        }
        const t: number = Math.min(1, ground.age / LOOT.tossTime);
        const x: number = ground.from.x + (ground.pos.x - ground.from.x) * t;
        const z: number = ground.from.z + (ground.pos.z - ground.from.z) * t;
        entry.group.position.set(x, tossOffset(ground.age), z);
        const landed: boolean = ground.age > LOOT.tossTime;
        switch (entry.kind) {
          case 'gold':
          case 'keepsake':
            break;
          case 'gem':
            entry.gem.position.y = LOOT.gemHover + Math.sin(world.time * 3 + ground.id) * LOOT.gemBob;
            entry.gem.rotation.y = world.time * LOOT.gemSpin + ground.id;
            if (entry.beam !== null) entry.beam.visible = landed;
            break;
          case 'weapon': {
            const remaining: number = (1 - t) * (1 - t);
            entry.pivot.rotation.y = entry.yaw;
            entry.pivot.rotation.x = remaining * LOOT.weaponTumbleTurns * FULL_TURN;
            if (entry.beam !== null) entry.beam.visible = landed;
            break;
          }
        }
      }
      for (const [id, entry] of entries) {
        if (seen.has(id)) continue;
        release(entry);
        entries.delete(id);
      }
    },
  };
}
