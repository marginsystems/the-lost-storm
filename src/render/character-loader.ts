import type { AnimationAction, AnimationClip, IUniform, Object3D } from 'three';
import { AnimationMixer, Color, Group, Mesh, MeshStandardMaterial, PropertyBinding } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { AnimationKey, AttachmentDef, Content, RigDef, RigSocket } from '../../sim/content/types.ts';
import { ANIMATION_KEYS } from '../../sim/content/types.ts';

export interface LoadedRig {
  readonly def: RigDef;
  readonly template: Object3D;
  readonly clips: Readonly<Record<AnimationKey, AnimationClip>>;
}

export interface LoadedAttachment {
  readonly def: AttachmentDef;
  readonly template: Object3D;
}

export interface CharacterLibrary {
  readonly rigs: ReadonlyMap<string, LoadedRig>;
  readonly attachments: ReadonlyMap<string, LoadedAttachment>;
}

export interface RigLook {
  readonly tint: string;
  readonly glow: string;
}

export interface RigInstance {
  readonly def: RigDef;
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly actions: Readonly<Record<AnimationKey, AnimationAction>>;
  readonly durations: Readonly<Record<AnimationKey, number>>;
  setGear(attachmentIds: readonly string[]): void;
  setFlash(color: Color, amount: number): void;
  dispose(): void;
}

export const CHARACTER = {
  flashBoost: 1.9,
  glowBoost: 2.4,
} as const;

const DEGREES: number = Math.PI / 180;
const FLASH_KEY: string = 'storm-flash';
const pending: Map<string, Promise<GLTF>> = new Map<string, Promise<GLTF>>();

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

export function loadModel(loader: GLTFLoader, path: string): Promise<GLTF> {
  const cached: Promise<GLTF> | undefined = pending.get(path);
  if (cached !== undefined) return cached;
  const started: Promise<GLTF> = loader.loadAsync(assetUrl(path));
  pending.set(path, started);
  return started;
}

function stripRootMotion(clip: AnimationClip, bone: string): AnimationClip {
  const copy: AnimationClip = clip.clone();
  const track: string = `${PropertyBinding.sanitizeNodeName(bone)}.position`;
  for (const candidate of copy.tracks) {
    if (candidate.name !== track) continue;
    const values = candidate.values;
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

async function loadRig(loader: GLTFLoader, def: RigDef): Promise<LoadedRig> {
  const main: GLTF = await loadModel(loader, def.url);
  const extras: GLTF[] = await Promise.all(def.animationUrls.map((url: string): Promise<GLTF> => loadModel(loader, url)));
  const available: AnimationClip[] = [...main.animations, ...extras.flatMap((extra: GLTF): AnimationClip[] => extra.animations)];
  const clip = (key: AnimationKey): AnimationClip => pickClip(def, key, available);
  return {
    def,
    template: main.scene,
    clips: { idle: clip('idle'), run: clip('run'), attack: clip('attack'), slam: clip('slam'), cast: clip('cast'), hit: clip('hit'), death: clip('death') },
  };
}

async function loadAttachment(loader: GLTFLoader, def: AttachmentDef): Promise<LoadedAttachment> {
  const model: GLTF = await loadModel(loader, def.model);
  model.scene.traverse((object: Object3D): void => {
    if (object instanceof Mesh) object.castShadow = true;
  });
  return { def, template: model.scene };
}

function usedRigs(content: Content): RigDef[] {
  const ids: Set<string> = new Set<string>([content.player.rig]);
  for (const monster of content.monsters.values()) ids.add(monster.rig);
  const rigs: RigDef[] = [];
  for (const id of ids) {
    const rig: RigDef | undefined = content.rigs.get(id);
    if (rig !== undefined) rigs.push(rig);
  }
  return rigs;
}

export async function loadCharacters(loader: GLTFLoader, content: Content): Promise<CharacterLibrary> {
  const [rigs, attachments]: [LoadedRig[], LoadedAttachment[]] = await Promise.all([
    Promise.all(usedRigs(content).map((def: RigDef): Promise<LoadedRig> => loadRig(loader, def))),
    Promise.all([...content.attachments.values()].map((def: AttachmentDef): Promise<LoadedAttachment> => loadAttachment(loader, def))),
  ]);
  return {
    rigs: new Map<string, LoadedRig>(rigs.map((rig: LoadedRig): [string, LoadedRig] => [rig.def.id, rig])),
    attachments: new Map<string, LoadedAttachment>(attachments.map((held: LoadedAttachment): [string, LoadedAttachment] => [held.def.id, held])),
  };
}

function recolourEmissiveMap(material: MeshStandardMaterial, glow: string): void {
  if (material.emissiveMap === null) return;
  material.emissive.set(glow);
  material.emissiveIntensity = CHARACTER.glowBoost;
}

function dress(object: Object3D, look: RigLook, flash: IUniform<Color>, sink: MeshStandardMaterial[]): void {
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
    material.color.multiply(new Color(look.tint));
    recolourEmissiveMap(material, look.glow);
    material.onBeforeCompile = (shader): void => {
      shader.uniforms['uFlash'] = flash;
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform vec3 uFlash;\nvoid main() {').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uFlash;');
    };
    material.customProgramCacheKey = (): string => FLASH_KEY;
    cloned.push(material);
    sink.push(material);
  }
  const first: MeshStandardMaterial | undefined = cloned[0];
  if (first !== undefined) object.material = cloned.length === 1 ? first : cloned;
}

function findNode(model: Object3D, name: string): Object3D | undefined {
  return model.getObjectByName(PropertyBinding.sanitizeNodeName(name)) ?? model.getObjectByName(name);
}

export function instantiateRig(rig: LoadedRig, library: CharacterLibrary, look: RigLook): RigInstance {
  const def: RigDef = rig.def;
  const model: Object3D = cloneSkinned(rig.template);
  model.scale.setScalar(def.scale);
  model.rotation.y = def.yawOffsetDegrees * DEGREES;
  const root: Group = new Group();
  root.add(model);
  const flash: IUniform<Color> = { value: new Color(0, 0, 0) };
  const materials: MeshStandardMaterial[] = [];
  model.traverse((object: Object3D): void => dress(object, look, flash, materials));
  for (const name of def.hiddenNodes) {
    const node: Object3D | undefined = findNode(model, name);
    if (node !== undefined) node.visible = false;
  }

  const mixer: AnimationMixer = new AnimationMixer(model);
  const action = (key: AnimationKey): AnimationAction => mixer.clipAction(rig.clips[key]);
  const actions: Record<AnimationKey, AnimationAction> = { idle: action('idle'), run: action('run'), attack: action('attack'), slam: action('slam'), cast: action('cast'), hit: action('hit'), death: action('death') };
  const durations: Record<AnimationKey, number> = { idle: 0, run: 0, attack: 0, slam: 0, cast: 0, hit: 0, death: 0 };
  for (const key of ANIMATION_KEYS) durations[key] = rig.clips[key].duration;
  const held: Group[] = [];
  let heldKey: string = '';

  return {
    def,
    root,
    mixer,
    actions,
    durations,
    setGear(attachmentIds: readonly string[]): void {
      const key: string = attachmentIds.join('|');
      if (key === heldKey) return;
      heldKey = key;
      for (const holder of held.splice(0, held.length)) holder.removeFromParent();
      for (const id of attachmentIds) {
        const attachment: LoadedAttachment | undefined = library.attachments.get(id);
        const socket: RigSocket | undefined = attachment === undefined ? undefined : def.sockets[attachment.def.socket];
        const bone: Object3D | undefined = socket === undefined ? undefined : findNode(model, socket.bone);
        if (attachment === undefined || socket === undefined || bone === undefined) continue;
        const holder: Group = new Group();
        holder.position.set(socket.position[0], socket.position[1], socket.position[2]);
        holder.rotation.set(socket.rotationDegrees[0] * DEGREES, socket.rotationDegrees[1] * DEGREES, socket.rotationDegrees[2] * DEGREES);
        holder.scale.setScalar(socket.scale);
        holder.add(attachment.template.clone(true));
        bone.add(holder);
        held.push(holder);
      }
    },
    setFlash(color: Color, amount: number): void {
      flash.value.copy(color).multiplyScalar(amount * CHARACTER.flashBoost);
    },
    dispose(): void {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const material of materials) material.dispose();
    },
  };
}
