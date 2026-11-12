import type { Object3D, Scene } from 'three';
import { Group, Mesh } from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ItemBaseDef } from '../../sim/content/types.ts';
import { baseOf } from '../../sim/items.ts';
import type { GroundItem, World } from '../../sim/world/types.ts';
import type { CharacterLibrary } from './character-loader.ts';
import { CONTACT_SHADOW, contactShadow } from './contact-shadow.ts';
import type { GroundTemplate } from './ground-models.ts';
import { groundTemplate } from './ground-models.ts';
import { loadKeptModel } from './character-loader.ts';
import type { Keepsake } from './keepsake.ts';
import { createKeepsake } from './keepsake.ts';
import type { LootLight, LootLights } from './loot-lights.ts';
import { createLootLights } from './loot-lights.ts';
import type { MarkerChoice } from './loot-marker.ts';
import { markerFor } from './loot-marker.ts';

export const LOOT = {
  coinModel: 'models/world/coins.glb',
  coinScale: 0.85,
  tossTime: 0.42,
  tossHeight: 2.6,
  bounceTime: 0.3,
  bounceHeight: 0.35,
  lightSeedStep: 0.137,
  longestFrame: 0.1,
  tumbleTurns: 2,
  yawSeedStep: 0.618034,
  shadowFallScale: 0.5,
} as const;

const FULL_TURN: number = Math.PI * 2;
const DEGREES: number = Math.PI / 180;

interface GoldEntry {
  readonly kind: 'gold';
  readonly group: Group;
}

interface ModelEntry {
  readonly kind: 'model';
  readonly group: Group;
  readonly pivot: Group;
  readonly shadow: Mesh;
  readonly footprint: number;
  readonly yaw: number;
  readonly waiting: boolean;
  readonly light: LootLight | null;
}

interface KeepsakeEntry {
  readonly kind: 'keepsake';
  readonly group: Group;
  readonly keepsake: Keepsake;
  readonly light: LootLight | null;
}

type LootEntry = GoldEntry | ModelEntry | KeepsakeEntry;

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

function baseFor(world: World, ground: GroundItem): ItemBaseDef | null {
  return ground.content.kind === 'item' ? baseOf(world.content, ground.content.item) : null;
}

function seededYaw(id: number, jitterDegrees: number): number {
  const unit: number = (id * LOOT.yawSeedStep) % 1;
  return (unit * 2 - 1) * jitterDegrees * DEGREES;
}

export async function createLootView(loader: GLTFLoader, scene: Scene, library: CharacterLibrary): Promise<LootView> {
  const coins: Object3D = (await loadKeptModel(loader, LOOT.coinModel)).scene;
  coins.traverse((object: Object3D): void => {
    if (object instanceof Mesh) object.castShadow = true;
  });
  const entries: Map<number, LootEntry> = new Map<number, LootEntry>();

  const lights: LootLights = createLootLights();
  scene.add(...lights.meshes);
  let lastTime: number | null = null;
  let lastZone: string | null = null;
  const templates: Map<string, GroundTemplate> = new Map<string, GroundTemplate>();

  const templateFor = (world: World, base: ItemBaseDef): GroundTemplate => {
    const cached: GroundTemplate | undefined = templates.get(base.id);
    if (cached !== undefined && !cached.waiting) return cached;
    const made: GroundTemplate = groundTemplate(world.content, library, base);
    if (cached === undefined || !made.waiting) templates.set(base.id, made);
    return cached !== undefined && made.waiting ? cached : made;
  };

  const lightFor = (world: World, ground: GroundItem): LootLight | null => {
    const marker: MarkerChoice = markerFor(world.content, world.zone, ground);
    const seed: number = (ground.id * LOOT.lightSeedStep) % 1;
    if (marker.kind === 'none') return null;
    return marker.kind === 'shaft' ? lights.add('shaft', marker.color, marker.step, seed) : lights.add('bolt', '', 0, seed);
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
    const base: ItemBaseDef | null = baseFor(world, ground);
    if (ground.find !== null && (base === null || base.ground.model === 'bundle' || base.ground.model === 'pouch')) {
      const keepsake: Keepsake = createKeepsake();
      group.add(keepsake.group);
      return { kind: 'keepsake', group, keepsake, light: lightFor(world, ground) };
    }
    const shadow: Mesh = contactShadow();
    shadow.position.y += world.zone.floorHeight;
    group.add(shadow);
    const pivot: Group = new Group();
    pivot.rotation.order = 'YXZ';
    pivot.position.y = world.zone.floorHeight;
    group.add(pivot);
    if (base === null) return { kind: 'model', group, pivot, shadow, footprint: 1, yaw: 0, waiting: false, light: lightFor(world, ground) };
    const template: GroundTemplate = templateFor(world, base);
    pivot.add(template.model.clone(true));
    return { kind: 'model', group, pivot, shadow, footprint: template.footprint, yaw: seededYaw(ground.id, base.ground.yawJitter), waiting: template.waiting, light: lightFor(world, ground) };
  };

  const release = (entry: LootEntry): void => {
    switch (entry.kind) {
      case 'gold':
        entry.group.removeFromParent();
        break;
      case 'model':
        entry.light?.release();
        entry.group.removeFromParent();
        break;
      case 'keepsake':
        entry.light?.release();
        entry.keepsake.dispose();
        entry.group.removeFromParent();
        break;
    }
  };

  return {
    standIns(): Object3D[] {
      return [coins.clone(), ...lights.standIns()];
    },
    sync(world: World): void {
      const dt: number = lastTime === null ? 0 : Math.min(LOOT.longestFrame, Math.max(0, world.time - lastTime));
      lastTime = world.time;
      if (lastZone !== world.zone.id) {
        lights.clear();
        lastZone = world.zone.id;
      }
      const seen: Set<number> = new Set<number>();
      for (const ground of world.ground) {
        seen.add(ground.id);
        let entry: LootEntry | undefined = entries.get(ground.id);
        if (entry?.kind === 'model' && entry.waiting) {
          const base: ItemBaseDef | null = baseFor(world, ground);
          if (base !== null && !templateFor(world, base).waiting) {
            release(entry);
            entry = undefined;
          }
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
        if (entry.kind !== 'gold' && entry.light !== null) {
          entry.light.place(ground.pos.x, world.zone.floorHeight, ground.pos.z);
          entry.light.show(landed);
        }
        switch (entry.kind) {
          case 'gold':
          case 'keepsake':
            break;
          case 'model': {
            const remaining: number = (1 - t) * (1 - t);
            const height: number = entry.group.position.y;
            entry.pivot.rotation.y = entry.yaw;
            entry.pivot.rotation.x = remaining * LOOT.tumbleTurns * FULL_TURN;
            entry.shadow.position.y = world.zone.floorHeight - height + CONTACT_SHADOW.lift;
            entry.shadow.scale.setScalar(entry.footprint / (1 + height * LOOT.shadowFallScale));
            break;
          }
        }
      }
      for (const [id, entry] of entries) {
        if (seen.has(id)) continue;
        release(entry);
        entries.delete(id);
      }
      lights.update(world.time, dt);
    },
  };
}
