import type { Object3D, Scene } from 'three';
import { Color, Group, Mesh, MeshStandardMaterial, OctahedronGeometry } from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { rarityOf } from '../../sim/items.ts';
import type { GroundItem, World } from '../../sim/world/types.ts';
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
} as const;

interface LootEntry {
  readonly group: Group;
  readonly spinner: Object3D | null;
  readonly beam: Mesh | null;
}

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

export async function createLootView(loader: GLTFLoader, scene: Scene): Promise<LootView> {
  const coins: Object3D = (await loadModel(loader, LOOT.coinModel)).scene;
  coins.traverse((object: Object3D): void => {
    if (object instanceof Mesh) object.castShadow = true;
  });
  const entries: Map<number, LootEntry> = new Map<number, LootEntry>();

  const build = (world: World, ground: GroundItem): LootEntry => {
    const group: Group = new Group();
    scene.add(group);
    if (ground.content.kind === 'gold') {
      const stack: Object3D = coins.clone();
      stack.scale.setScalar(LOOT.coinScale);
      group.add(stack);
      return { group, spinner: null, beam: null };
    }
    const color: Color = new Color(rarityOf(world.content, ground.content.item).color);
    const gem: Mesh = new Mesh(new OctahedronGeometry(LOOT.gemSize, 0), new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.25, metalness: 0.3 }));
    gem.castShadow = true;
    group.add(gem);
    const beam: Mesh = pillarMesh(glow(color, 2.2), LOOT.beamRadius, LOOT.beamHeight);
    beam.material = additive(glow(color, 2.2), LOOT.beamOpacity);
    group.add(beam);
    return { group, spinner: gem, beam };
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
        if (entry.spinner !== null) {
          entry.spinner.position.y = LOOT.gemHover + Math.sin(world.time * 3 + ground.id) * LOOT.gemBob;
          entry.spinner.rotation.y = world.time * LOOT.gemSpin + ground.id;
        }
        if (entry.beam !== null) entry.beam.visible = ground.age > LOOT.tossTime;
      }
      for (const [id, entry] of entries) {
        if (seen.has(id)) continue;
        disposeObject(entry.group);
        entries.delete(id);
      }
    },
  };
}
