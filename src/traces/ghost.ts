import type { Material, Object3D, Scene } from 'three';
import { Mesh, MeshStandardMaterial } from 'three';
import type { Content } from '../../sim/content/types.ts';
import { hiddenBodyParts, wornWearables } from '../../sim/wear.ts';
import type { ActorView } from '../render/actor-view.ts';
import { createActorView } from '../render/actor-view.ts';
import type { CharacterLibrary, LoadedRig } from '../render/character-loader.ts';
import { instantiateRig } from '../render/character-loader.ts';
import type { ReplayPose } from './mist.ts';

export const GHOST = {
  look: { tint: '#8d96a0', glow: '#8d96a0' },
  opacity: 0.38,
  turnRate: 6,
  floor: 0,
} as const;

export interface Ghost {
  readonly height: number;
  sync(dt: number, pose: ReplayPose, fade: number, floor: number): void;
  dispose(): void;
}

function materialsOf(object: Object3D): readonly MeshStandardMaterial[] {
  if (!(object instanceof Mesh)) return [];
  const worn: unknown = object.material;
  const list: readonly unknown[] = Array.isArray(worn) ? worn : [worn];
  return list.filter((material: unknown): material is MeshStandardMaterial => material instanceof MeshStandardMaterial);
}

function ghostly(root: Object3D): readonly MeshStandardMaterial[] {
  const found: MeshStandardMaterial[] = [];
  root.traverse((object: Object3D): void => {
    object.castShadow = false;
    object.receiveShadow = false;
    for (const material of materialsOf(object)) {
      material.transparent = true;
      material.depthWrite = false;
      material.opacity = 0;
      found.push(material);
    }
  });
  return found;
}

export function createGhost(scene: Scene, library: CharacterLibrary, content: Content): Ghost | null {
  const rig: LoadedRig | undefined = library.rigs.get(content.player.rig);
  if (rig === undefined) return null;
  const view: ActorView = createActorView(instantiateRig(rig, library, GHOST.look), 1, 0);
  const worn: string[] = wornWearables(content, content.player.wear, null);
  view.rig.setWear(worn, hiddenBodyParts(content, worn));
  const materials: readonly Material[] = ghostly(view.rig.root);
  scene.add(view.rig.root);
  return {
    height: view.height,
    sync(dt: number, pose: ReplayPose, fade: number, floor: number): void {
      for (const material of materials) material.opacity = GHOST.opacity * fade;
      view.rig.root.visible = fade > 0;
      view.sync(dt, { pos: pose.pos, facing: pose.facing, moving: pose.moving, busy: false, deadTime: 0 }, { moveSpeed: pose.speed, rise: 1, floor, turnRate: GHOST.turnRate });
    },
    dispose(): void {
      view.dispose();
    },
  };
}
