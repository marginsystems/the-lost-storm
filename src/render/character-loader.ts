import type { AnimationAction, AnimationClip, Object3D } from 'three';
import { AnimationMixer, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { AnimationKey, RigDef } from '../../sim/content/types.ts';
import { ANIMATION_KEYS } from '../../sim/content/types.ts';

export interface LoadedRig {
  readonly def: RigDef;
  readonly template: Object3D;
  readonly clips: Readonly<Record<AnimationKey, AnimationClip>>;
}

interface TintedMaterial {
  readonly material: MeshStandardMaterial;
  readonly baseEmissive: Color;
  readonly baseIntensity: number;
}

export interface RigInstance {
  readonly def: RigDef;
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly actions: Readonly<Record<AnimationKey, AnimationAction>>;
  readonly durations: Readonly<Record<AnimationKey, number>>;
  setAttachment(key: string | null): void;
  setGlow(color: Color, amount: number): void;
  dispose(): void;
}

const DEGREES: number = Math.PI / 180;

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

function stripRootMotion(clip: AnimationClip, bone: string): AnimationClip {
  const copy: AnimationClip = clip.clone();
  for (const track of copy.tracks) {
    if (track.name !== `${bone}.position`) continue;
    const values = track.values;
    const startX: number = values[0] ?? 0;
    const startZ: number = values[2] ?? 0;
    for (let index: number = 0; index + 2 < values.length; index += 3) {
      values[index] = startX;
      values[index + 2] = startZ;
    }
  }
  return copy;
}

function pickClip(def: RigDef, key: AnimationKey, available: readonly AnimationClip[]): AnimationClip {
  const wanted: string = def.clips[key].clip;
  const found: AnimationClip | undefined = available.find((clip: AnimationClip): boolean => clip.name === wanted);
  if (found === undefined) {
    const names: string = available.map((clip: AnimationClip): string => clip.name).join(', ');
    throw new Error(`Rig "${def.id}" maps ${key} to clip "${wanted}", which is not in its files. Available clips: ${names}`);
  }
  return def.rootMotionBone === null ? found : stripRootMotion(found, def.rootMotionBone);
}

export async function loadRig(loader: GLTFLoader, def: RigDef): Promise<LoadedRig> {
  const main: GLTF = await loader.loadAsync(assetUrl(def.url));
  const extras: GLTF[] = await Promise.all(def.animationUrls.map((url: string): Promise<GLTF> => loader.loadAsync(assetUrl(url))));
  const available: AnimationClip[] = [...main.animations, ...extras.flatMap((extra: GLTF): AnimationClip[] => extra.animations)];
  const clip = (key: AnimationKey): AnimationClip => pickClip(def, key, available);
  return {
    def,
    template: main.scene,
    clips: { idle: clip('idle'), run: clip('run'), attack: clip('attack'), slam: clip('slam'), cast: clip('cast'), hit: clip('hit'), death: clip('death') },
  };
}

function tintable(object: Object3D, sink: TintedMaterial[]): void {
  if (!(object instanceof Mesh)) return;
  object.castShadow = true;
  object.receiveShadow = false;
  object.frustumCulled = false;
  const source: unknown = object.material;
  const list: readonly unknown[] = Array.isArray(source) ? source : [source];
  const cloned: MeshStandardMaterial[] = [];
  for (const entry of list) {
    if (!(entry instanceof MeshStandardMaterial)) continue;
    const material: MeshStandardMaterial = entry.clone();
    cloned.push(material);
    sink.push({ material, baseEmissive: material.emissive.clone(), baseIntensity: material.emissiveIntensity });
  }
  const first: MeshStandardMaterial | undefined = cloned[0];
  if (first !== undefined) object.material = cloned.length === 1 ? first : cloned;
}

export function instantiateRig(rig: LoadedRig): RigInstance {
  const def: RigDef = rig.def;
  const model: Object3D = cloneSkinned(rig.template);
  model.scale.setScalar(def.scale);
  model.rotation.y = def.yawOffsetDegrees * DEGREES;
  const root: Group = new Group();
  root.add(model);
  const tinted: TintedMaterial[] = [];
  model.traverse((object: Object3D): void => tintable(object, tinted));

  const attachmentNodes: Map<string, Object3D[]> = new Map<string, Object3D[]>();
  for (const [key, names] of Object.entries(def.attachments)) {
    const nodes: Object3D[] = [];
    for (const name of names) {
      const node: Object3D | undefined = model.getObjectByName(name);
      if (node !== undefined) nodes.push(node);
    }
    attachmentNodes.set(key, nodes);
  }
  for (const name of def.hiddenNodes) {
    const node: Object3D | undefined = model.getObjectByName(name);
    if (node !== undefined) node.visible = false;
  }

  const mixer: AnimationMixer = new AnimationMixer(model);
  const action = (key: AnimationKey): AnimationAction => mixer.clipAction(rig.clips[key]);
  const actions: Record<AnimationKey, AnimationAction> = { idle: action('idle'), run: action('run'), attack: action('attack'), slam: action('slam'), cast: action('cast'), hit: action('hit'), death: action('death') };
  const durations: Record<AnimationKey, number> = { idle: 0, run: 0, attack: 0, slam: 0, cast: 0, hit: 0, death: 0 };
  for (const key of ANIMATION_KEYS) durations[key] = rig.clips[key].duration;
  const glow: Color = new Color();

  return {
    def,
    root,
    mixer,
    actions,
    durations,
    setAttachment(key: string | null): void {
      for (const [name, nodes] of attachmentNodes) for (const node of nodes) node.visible = name === key;
    },
    setGlow(color: Color, amount: number): void {
      for (const entry of tinted) {
        glow.copy(entry.baseEmissive).lerp(color, Math.min(1, amount));
        entry.material.emissive.copy(glow);
        entry.material.emissiveIntensity = entry.baseIntensity + amount * 1.6;
      }
    },
    dispose(): void {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const entry of tinted) entry.material.dispose();
    },
  };
}
