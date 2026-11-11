import type { Object3D, Scene } from 'three';
import { Box3, Color, Group, Mesh, MeshStandardMaterial, OctahedronGeometry, Vector3 } from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AttachmentDef, Content, ItemBaseDef, RigDef } from '../../sim/content/types.ts';
import { baseOf, rarityOf } from '../../sim/items.ts';
import type { GroundItem, World } from '../../sim/world/types.ts';
import type { CharacterLibrary, LoadedAttachment } from './character-loader.ts';
import { loadModel } from './character-loader.ts';
import { additive, disposeObject, glow, pillarMesh } from './effect-shapes.ts';

export const LOOT = {
  coinModel: 'models/arena/coin_stack_small.glb',
  coinScale: 0.85,
  tossTime: 0.42,
  tossHeight: 2.6,
  bounceTime: 0.3,
  bounceHeight: 0.35,
  gemSize: 0.3,
  gemHover: 0.75,
  gemBob: 0.12,
  gemSpin: 2.4,
  beamRadius: 0.07,
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
  readonly beam: Mesh;
}

interface WeaponEntry {
  readonly kind: 'weapon';
  readonly group: Group;
  readonly pivot: Group;
  readonly yaw: number;
  readonly beam: Mesh;
}

type LootEntry = GoldEntry | GemEntry | WeaponEntry;

export interface LootView {
  sync(world: World): void;
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
  const coins: Object3D = (await loadModel(loader, LOOT.coinModel)).scene;
  coins.traverse((object: Object3D): void => {
    if (object instanceof Mesh) object.castShadow = true;
  });
  const entries: Map<number, LootEntry> = new Map<number, LootEntry>();

  const buildBeam = (group: Group, color: Color): Mesh => {
    const beam: Mesh = pillarMesh(glow(color, 2.2), LOOT.beamRadius, LOOT.beamHeight);
    beam.material = additive(glow(color, 2.2), LOOT.beamOpacity);
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
    const color: Color = new Color(rarityOf(world.content, ground.content.item).color);
    const attachment: LoadedAttachment | undefined = attachmentFor(world, ground);
    if (attachment !== undefined) {
      const pivot: Group = new Group();
      pivot.rotation.order = 'YXZ';
      pivot.add(lyingModel(attachment, heldScale(world.content, attachment.def), world.zone.floorHeight));
      group.add(pivot);
      return { kind: 'weapon', group, pivot, yaw: Math.random() * FULL_TURN, beam: buildBeam(group, color) };
    }
    const gem: Mesh = new Mesh(new OctahedronGeometry(LOOT.gemSize, 0), new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.25, metalness: 0.3 }));
    gem.castShadow = true;
    group.add(gem);
    return { kind: 'gem', group, gem, beam: buildBeam(group, color) };
  };

  const release = (entry: LootEntry): void => {
    switch (entry.kind) {
      case 'gold':
      case 'gem':
        disposeObject(entry.group);
        break;
      case 'weapon':
        disposeObject(entry.beam);
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
            break;
          case 'gem':
            entry.gem.position.y = LOOT.gemHover + Math.sin(world.time * 3 + ground.id) * LOOT.gemBob;
            entry.gem.rotation.y = world.time * LOOT.gemSpin + ground.id;
            entry.beam.visible = landed;
            break;
          case 'weapon': {
            const remaining: number = (1 - t) * (1 - t);
            entry.pivot.rotation.y = entry.yaw;
            entry.pivot.rotation.x = remaining * LOOT.weaponTumbleTurns * FULL_TURN;
            entry.beam.visible = landed;
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
