import type { Object3D, Scene } from 'three';
import { Box3, Color, Group, Mesh, MeshStandardMaterial, OctahedronGeometry, Vector3 } from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AttachmentDef, Content, ItemBaseDef, RarityDef, RigDef } from '../../sim/content/types.ts';
import { baseOf, rarityOf } from '../../sim/items.ts';
import type { GroundItem, ItemInstance, World } from '../../sim/world/types.ts';
import type { CharacterLibrary, LoadedAttachment } from './character-loader.ts';
import { loadKeptModel } from './character-loader.ts';
import type { Keepsake } from './keepsake.ts';
import { createKeepsake } from './keepsake.ts';
import type { Shaft, ShaftKit } from './loot-shaft.ts';
import { createShaftKit, driftSeconds } from './loot-shaft.ts';
import type { FloorPoint } from './shaft-motion.ts';
import { crowdShares, settle } from './shaft-motion.ts';

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
  shaftFromRank: 2,
  shaftSeedStep: 0.137,
  longestFrame: 0.1,
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
  readonly shaft: Shaft | null;
}

interface WeaponEntry {
  readonly kind: 'weapon';
  readonly group: Group;
  readonly pivot: Group;
  readonly yaw: number;
  readonly shaft: Shaft | null;
}

interface KeepsakeEntry {
  readonly kind: 'keepsake';
  readonly group: Group;
  readonly keepsake: Keepsake;
}

type LootEntry = GoldEntry | GemEntry | WeaponEntry | KeepsakeEntry;

export interface LootView {
  sync(world: World): void;
  standIns(): Object3D[];
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

  const kit: ShaftKit = createShaftKit(driftSeconds());
  const fading: Shaft[] = [];
  let lastTime: number | null = null;
  let lastZone: string | null = null;
  const gemGeometry: OctahedronGeometry = new OctahedronGeometry(LOOT.gemSize, 0);
  const gemMaterials: Map<number, MeshStandardMaterial> = new Map<number, MeshStandardMaterial>();

  const gemMaterial = (color: Color): MeshStandardMaterial => {
    const key: number = color.getHex();
    const cached: MeshStandardMaterial | undefined = gemMaterials.get(key);
    if (cached !== undefined) return cached;
    const made: MeshStandardMaterial = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.25, metalness: 0.3 });
    gemMaterials.set(key, made);
    return made;
  };

  const buildShaft = (world: World, ground: GroundItem, item: ItemInstance, color: Color): Shaft | null => {
    const rank: number = world.content.rarities.findIndex((rarity: RarityDef): boolean => rarity.id === item.rarity);
    if (rank < LOOT.shaftFromRank) return null;
    const shaft: Shaft = kit.create(color, rank - LOOT.shaftFromRank, (ground.id * LOOT.shaftSeedStep) % 1);
    shaft.group.position.set(ground.pos.x, world.zone.floorHeight, ground.pos.z);
    scene.add(shaft.group);
    return shaft;
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
      return { kind: 'weapon', group, pivot, yaw: Math.random() * FULL_TURN, shaft: buildShaft(world, ground, ground.content.item, color) };
    }
    const gem: Mesh = new Mesh(gemGeometry, gemMaterial(color));
    gem.castShadow = true;
    group.add(gem);
    return { kind: 'gem', group, gem, shaft: buildShaft(world, ground, ground.content.item, color) };
  };

  const release = (entry: LootEntry): void => {
    switch (entry.kind) {
      case 'gold':
        entry.group.removeFromParent();
        break;
      case 'gem':
      case 'weapon':
        if (entry.shaft !== null) fading.push(entry.shaft);
        entry.group.removeFromParent();
        break;
      case 'keepsake':
        entry.keepsake.dispose();
        entry.group.removeFromParent();
        break;
    }
  };

  return {
    standIns(): Object3D[] {
      return [coins.clone(), kit.standIn()];
    },
    sync(world: World): void {
      const dt: number = lastTime === null ? 0 : Math.min(LOOT.longestFrame, Math.max(0, world.time - lastTime));
      lastTime = world.time;
      if (lastZone !== world.zone.id) {
        for (const shaft of fading.splice(0)) kit.dispose(shaft);
        lastZone = world.zone.id;
      }
      const lit: Shaft[] = [];
      const seen: Set<number> = new Set<number>();
      for (const ground of world.ground) {
        seen.add(ground.id);
        let entry: LootEntry | undefined = entries.get(ground.id);
        if (entry?.kind === 'gem' && attachmentFor(world, ground) !== undefined) {
          release(entry);
          entry = undefined;
        }
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
            if (entry.shaft !== null) {
              entry.shaft.presence = settle(entry.shaft.presence, landed ? 1 : 0, dt);
              lit.push(entry.shaft);
            }
            break;
          case 'weapon': {
            const remaining: number = (1 - t) * (1 - t);
            entry.pivot.rotation.y = entry.yaw;
            entry.pivot.rotation.x = remaining * LOOT.weaponTumbleTurns * FULL_TURN;
            if (entry.shaft !== null) {
              entry.shaft.presence = settle(entry.shaft.presence, landed ? 1 : 0, dt);
              lit.push(entry.shaft);
            }
            break;
          }
        }
      }
      for (const [id, entry] of entries) {
        if (seen.has(id)) continue;
        release(entry);
        entries.delete(id);
      }
      for (const shaft of fading) shaft.presence = settle(shaft.presence, 0, dt);
      const all: Shaft[] = [...lit, ...fading];
      const shares: number[] = crowdShares(all.map((shaft: Shaft): FloorPoint => ({ x: shaft.group.position.x, z: shaft.group.position.z })));
      all.forEach((shaft: Shaft, index: number): void => kit.update(shaft, shares[index] ?? 1, world.time));
      for (let index: number = fading.length - 1; index >= 0; index -= 1) {
        const shaft: Shaft | undefined = fading[index];
        if (shaft === undefined || shaft.presence.value > 0) continue;
        kit.dispose(shaft);
        fading.splice(index, 1);
      }
    },
  };
}
