import type { Material, Object3D, Scene } from 'three';
import { Mesh, MeshStandardMaterial } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Content, PropDef } from '../../sim/content/types.ts';
import { loadModel } from '../render/character-loader.ts';
import { groundHeight, rockHeight } from './lobby-ground.ts';
import { lookOf, withPropLook } from '../render/prop-surface.ts';
import type { PropLook } from '../render/prop-surface.ts';
import { dressedProp } from '../render/surfaces.ts';
import type { PropDressing } from '../render/surfaces.ts';

export interface LobbyRock {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly yawDegrees: number;
  readonly size: number;
}

export const LOBBY_SCENERY: { readonly wet: number; readonly stone: string; readonly shade: number; readonly rocks: readonly LobbyRock[] } = {
  wet: 0.12,
  stone: 'black_rock',
  shade: 0.6,
  rocks: [
    { prop: 'boulder_2', x: -3.6, z: -4.6, yawDegrees: 40, size: 0.9 },
    { prop: 'crag_low', x: -7.4, z: -9.5, yawDegrees: 110, size: 0.8 },
    { prop: 'boulder_3', x: 3.9, z: -5.4, yawDegrees: 200, size: 1 },
    { prop: 'crag_low', x: 8.2, z: -11, yawDegrees: 20, size: 0.9 },
    { prop: 'boulder_1', x: -6.8, z: -12.5, yawDegrees: 300, size: 1.2 },
    { prop: 'rock_4', x: 2, z: -2.8, yawDegrees: 75, size: 0.7 },
    { prop: 'rock_5', x: -2.3, z: -1.6, yawDegrees: 160, size: 0.5 },
  ],
};

export function rockDressing(rock: LobbyRock, rocks: readonly LobbyRock[]): PropDressing {
  return { wet: LOBBY_SCENERY.wet, ground: groundHeight(rock.x, rock.z, rocks) };
}

function dress(content: Content, material: Material, dressing: PropDressing): Material {
  const made: Material = dressedProp(content, { [material.name]: LOBBY_SCENERY.stone }, material, dressing);
  if (!(made instanceof MeshStandardMaterial)) return made;
  const look: PropLook | undefined = lookOf(made);
  const own: MeshStandardMaterial = look === undefined ? made.clone() : withPropLook(made.clone(), look);
  own.color.multiplyScalar(LOBBY_SCENERY.shade);
  return own;
}

function placed(content: Content, def: PropDef, gltf: GLTF, rock: LobbyRock): Object3D {
  const copy: Object3D = gltf.scene.clone(true);
  const dressing: PropDressing = rockDressing(rock, LOBBY_SCENERY.rocks);
  copy.traverse((node: Object3D): void => {
    if (!(node instanceof Mesh)) return;
    const material: unknown = node.material;
    if (material instanceof MeshStandardMaterial) node.material = dress(content, material, dressing);
    node.castShadow = true;
    node.receiveShadow = true;
  });
  copy.position.set(rock.x, rockHeight(rock, LOBBY_SCENERY.rocks), rock.z);
  copy.rotation.y = (rock.yawDegrees * Math.PI) / 180;
  copy.scale.setScalar(def.scale * rock.size);
  return copy;
}

export async function placeRocks(loader: GLTFLoader, content: Content, scene: Scene): Promise<void> {
  await Promise.all(
    LOBBY_SCENERY.rocks.map(async (rock: LobbyRock): Promise<void> => {
      const def: PropDef | undefined = content.props.get(rock.prop);
      if (def === undefined) return;
      const gltf: GLTF | null = await loadModel(loader, def.model).catch((): null => null);
      if (gltf !== null) scene.add(placed(content, def, gltf, rock));
    }),
  );
}
