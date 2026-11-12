import type { AnimationClip, IUniform, Object3D } from 'three';
import { AnimationMixer, BufferGeometry, Color, Group, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, PropertyBinding, SkinnedMesh } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { AttachmentDef, Content, RigDef, RigSocket, WearableDef } from '../../sim/content/types.ts';
import type { CharacterNeeds } from '../../sim/wear.ts';
import { clipUrl, rigClipNames } from '../../sim/content/clips.ts';
import { renderBudget } from '../mobile/quality.ts';
import { disposeMaterialTextures, shrinkModelTextures } from '../mobile/textures.ts';
import { fitToSkeleton, groupBodyParts, skinnedMeshes } from './wearables.ts';

export interface ActionClip {
  readonly clip: AnimationClip;
  readonly impactTime: number;
}

export interface RigClipSet {
  readonly idle: AnimationClip;
  readonly run: AnimationClip;
  readonly hit: readonly AnimationClip[];
  readonly death: readonly AnimationClip[];
  readonly rise: AnimationClip | null;
  readonly actions: ReadonlyMap<string, ActionClip>;
}

export interface LoadedRig {
  readonly def: RigDef;
  readonly template: Object3D;
  readonly clips: RigClipSet;
  readonly bodyParts: readonly string[];
  readonly fitted: Map<string, readonly BufferGeometry[]>;
}

export interface LoadedAttachment {
  readonly def: AttachmentDef;
  readonly template: Object3D;
}

export interface LoadedWearable {
  readonly def: WearableDef;
  readonly pieces: readonly SkinnedMesh[];
}

export interface CharacterLibrary {
  readonly rigs: Map<string, LoadedRig>;
  readonly attachments: Map<string, LoadedAttachment>;
  readonly wearables: Map<string, LoadedWearable>;
}

export interface RigLook {
  readonly tint: string;
  readonly glow: string;
}

export interface RigInstance {
  readonly def: RigDef;
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly clips: RigClipSet;
  setGear(attachmentIds: readonly string[]): void;
  setWear(wearableIds: readonly string[], hiddenParts: readonly string[]): void;
  setFlash(color: Color, amount: number): void;
  dispose(): void;
}

export const CHARACTER = {
  flashBoost: 1.9,
  glowBoost: 2.4,
  metalFrom: 0.5,
  matteRoughness: 1,
} as const;

const DEGREES: number = Math.PI / 180;
const FLASH_KEY: string = 'storm-flash';
const WHITE: string = '#ffffff';
const UNSEEN: Material = new MeshBasicMaterial({ visible: false });
const pending: Map<string, Promise<GLTF>> = new Map<string, Promise<GLTF>>();

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

export function loadModel(loader: GLTFLoader, path: string): Promise<GLTF> {
  const cached: Promise<GLTF> | undefined = pending.get(path);
  if (cached !== undefined) return cached;
  const started: Promise<GLTF> = loader.loadAsync(assetUrl(path)).then(shrinkModel);
  pending.set(path, started);
  started.catch((): void => {
    pending.delete(path);
  });
  return started;
}

function shrinkModel(gltf: GLTF): GLTF {
  shrinkModelTextures(gltf.scene, renderBudget().maxModelTextureSize);
  return gltf;
}

const kept: Set<string> = new Set<string>();

export function loadKeptModel(loader: GLTFLoader, path: string): Promise<GLTF> {
  kept.add(path);
  return loadModel(loader, path);
}

export function forgetModel(path: string): void {
  if (kept.has(path)) return;
  const cached: Promise<GLTF> | undefined = pending.get(path);
  if (cached === undefined) return;
  pending.delete(path);
  cached.then(disposeModel, ignoreFailure);
}

function ignoreFailure(): undefined {
  return undefined;
}

function disposeModel(gltf: GLTF): undefined {
  gltf.scene.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    const geometry: unknown = object.geometry;
    if (geometry instanceof BufferGeometry) geometry.dispose();
    const materials: unknown = object.material;
    for (const material of Array.isArray(materials) ? materials : [materials]) {
      if (!(material instanceof Material)) continue;
      disposeMaterialTextures(material);
      material.dispose();
    }
  });
  return undefined;
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

function pickClip(def: RigDef, key: string, wanted: string, available: readonly AnimationClip[]): AnimationClip {
  const found: AnimationClip | undefined = available.find((clip: AnimationClip): boolean => clip.name === wanted);
  if (found === undefined) {
    const names: string = available.map((clip: AnimationClip): string => clip.name).join(', ');
    throw new Error(`Rig "${def.id}" maps ${key} to clip "${wanted}", which is not in its files. Available clips: ${names}`);
  }
  return def.rootMotionBone === null ? found : stripRootMotion(found, def.rootMotionBone);
}

async function loadRig(loader: GLTFLoader, def: RigDef): Promise<LoadedRig> {
  const main: GLTF = await loadKeptModel(loader, def.url);
  const extras: GLTF[] = await Promise.all(rigClipNames(def).map((clip: string): Promise<GLTF> => loadKeptModel(loader, clipUrl(def, clip))));
  const available: AnimationClip[] = [...main.animations, ...extras.flatMap((extra: GLTF): AnimationClip[] => extra.animations)];
  const clip = (key: string, wanted: string): AnimationClip => pickClip(def, key, wanted, available);
  const actions: Map<string, ActionClip> = new Map<string, ActionClip>();
  for (const [key, entry] of Object.entries(def.clips.actions)) {
    const found: AnimationClip = clip(key, entry.clip);
    actions.set(key, { clip: found, impactTime: found.duration * entry.impactFraction });
  }
  const template: Object3D = cloneSkinned(main.scene);
  const bodyParts: string[] = skinnedMeshes(template).reduce((names: string[], mesh: SkinnedMesh): string[] => {
    const grouped: string[] = groupBodyParts(mesh, def.bodyParts);
    return grouped.length > 0 ? grouped : names;
  }, []);
  return {
    def,
    template,
    clips: {
      idle: clip('idle', def.clips.idle),
      run: clip('run', def.clips.run),
      hit: def.clips.hit.map((wanted: string): AnimationClip => clip('hit', wanted)),
      death: def.clips.death.map((wanted: string): AnimationClip => clip('death', wanted)),
      rise: def.clips.rise === null ? null : clip('rise', def.clips.rise),
      actions,
    },
    bodyParts,
    fitted: new Map<string, readonly BufferGeometry[]>(),
  };
}

async function loadWearable(loader: GLTFLoader, def: WearableDef): Promise<LoadedWearable> {
  const model: GLTF = await loadKeptModel(loader, def.model);
  const pieces: SkinnedMesh[] = skinnedMeshes(model.scene);
  if (pieces.length === 0) throw new Error(`Wearable "${def.id}" has no skinned mesh in ${def.model}`);
  return { def, pieces };
}

export type Dresser = (dress: Readonly<Record<string, string>>, material: Material) => Material;

async function loadAttachment(loader: GLTFLoader, dresser: Dresser, def: AttachmentDef): Promise<LoadedAttachment> {
  const model: GLTF = await loadKeptModel(loader, def.model);
  model.scene.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    const worn: unknown = object.material;
    if (worn instanceof MeshStandardMaterial) object.material = dresser(def.surfaces, worn);
  });
  return { def, template: model.scene };
}

function usedRigs(content: Content): Set<string> {
  const ids: Set<string> = new Set<string>([content.player.rig]);
  for (const monster of content.monsters.values()) ids.add(monster.rig);
  for (const npc of content.npcs.values()) ids.add(npc.rig);
  return ids;
}

function rigDefs(content: Content, ids: Iterable<string>): RigDef[] {
  const rigs: RigDef[] = [];
  for (const id of ids) {
    const rig: RigDef | undefined = content.rigs.get(id);
    if (rig !== undefined) rigs.push(rig);
  }
  return rigs;
}

function attachmentDefs(content: Content, ids: Iterable<string>): AttachmentDef[] {
  const defs: AttachmentDef[] = [];
  for (const id of ids) {
    const def: AttachmentDef | undefined = content.attachments.get(id);
    if (def !== undefined) defs.push(def);
  }
  return defs;
}

function wearableDefs(content: Content, ids: Iterable<string>): WearableDef[] {
  const defs: WearableDef[] = [];
  for (const id of ids) {
    const def: WearableDef | undefined = content.wearables.get(id);
    if (def !== undefined) defs.push(def);
  }
  return defs;
}

export async function loadCharacters(loader: GLTFLoader, content: Content, dresser: Dresser, needs: CharacterNeeds): Promise<CharacterLibrary> {
  const [rigs, attachments, wearables]: [LoadedRig[], LoadedAttachment[], LoadedWearable[]] = await Promise.all([
    Promise.all(rigDefs(content, needs.rigs).map((def: RigDef): Promise<LoadedRig> => loadRig(loader, def))),
    Promise.all(attachmentDefs(content, needs.attachments).map((def: AttachmentDef): Promise<LoadedAttachment> => loadAttachment(loader, dresser, def))),
    Promise.all(wearableDefs(content, needs.wearables).map((def: WearableDef): Promise<LoadedWearable> => loadWearable(loader, def))),
  ]);
  return {
    rigs: new Map<string, LoadedRig>(rigs.map((rig: LoadedRig): [string, LoadedRig] => [rig.def.id, rig])),
    attachments: new Map<string, LoadedAttachment>(attachments.map((held: LoadedAttachment): [string, LoadedAttachment] => [held.def.id, held])),
    wearables: new Map<string, LoadedWearable>(wearables.map((worn: LoadedWearable): [string, LoadedWearable] => [worn.def.id, worn])),
  };
}

export async function loadRemainingCharacters(loader: GLTFLoader, content: Content, dresser: Dresser, library: CharacterLibrary): Promise<void> {
  const heldIds: string[] = [...content.attachments.keys()].filter((id: string): boolean => !library.attachments.has(id));
  const rigIds: string[] = [...usedRigs(content)].filter((id: string): boolean => !library.rigs.has(id));
  const wearIds: string[] = [...content.wearables.keys()].filter((id: string): boolean => !library.wearables.has(id));
  await Promise.all([
    ...rigDefs(content, rigIds).map(async (def: RigDef): Promise<void> => {
      library.rigs.set(def.id, await loadRig(loader, def));
    }),
    ...wearableDefs(content, wearIds).map(async (def: WearableDef): Promise<void> => {
      library.wearables.set(def.id, await loadWearable(loader, def));
    }),
    ...attachmentDefs(content, heldIds).map(async (def: AttachmentDef): Promise<void> => {
      library.attachments.set(def.id, await loadAttachment(loader, dresser, def));
    }),
  ]);
}

export function hasWear(library: CharacterLibrary, wearableIds: readonly string[], gear: readonly string[]): boolean {
  return wearableIds.every((id: string): boolean => library.wearables.has(id)) && gear.every((id: string): boolean => library.attachments.has(id));
}

function recolourEmissiveMap(material: MeshStandardMaterial, glow: string): void {
  if (material.emissiveMap === null) return;
  material.emissive.set(glow);
  material.emissiveIntensity = CHARACTER.glowBoost;
}

function flashing(source: unknown, look: RigLook, flash: IUniform<Color>): MeshStandardMaterial[] {
  const list: readonly unknown[] = Array.isArray(source) ? source : [source];
  const cloned: MeshStandardMaterial[] = [];
  for (const entry of list) {
    if (!(entry instanceof MeshStandardMaterial)) continue;
    const material: MeshStandardMaterial = entry.clone();
    material.color.multiply(new Color(look.tint));
    if (material.metalness < CHARACTER.metalFrom) {
      material.roughness = Math.max(material.roughness, CHARACTER.matteRoughness);
      material.roughnessMap = null;
      material.metalness = 0;
      material.metalnessMap = null;
    }
    recolourEmissiveMap(material, look.glow);
    material.onBeforeCompile = (shader): void => {
      shader.uniforms['uFlash'] = flash;
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform vec3 uFlash;\nvoid main() {').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uFlash;');
    };
    material.customProgramCacheKey = (): string => FLASH_KEY;
    cloned.push(material);
  }
  return cloned;
}

function dress(object: Object3D, look: RigLook, flash: IUniform<Color>, sink: MeshStandardMaterial[]): void {
  if (!(object instanceof Mesh)) return;
  object.castShadow = true;
  object.receiveShadow = false;
  object.frustumCulled = false;
  const cloned: MeshStandardMaterial[] = flashing(object.material, look, flash);
  sink.push(...cloned);
  const first: MeshStandardMaterial | undefined = cloned[0];
  if (first !== undefined) object.material = cloned.length === 1 ? first : cloned;
}

interface BodyMesh {
  readonly mesh: SkinnedMesh;
  readonly skin: Material;
}

function fittedPieces(rig: LoadedRig, worn: LoadedWearable, anchor: SkinnedMesh): readonly BufferGeometry[] {
  const cached: readonly BufferGeometry[] | undefined = rig.fitted.get(worn.def.model);
  if (cached !== undefined) return cached;
  const made: BufferGeometry[] = worn.pieces.map((piece: SkinnedMesh): BufferGeometry => fitToSkeleton(piece, anchor.skeleton, `Wearable "${worn.def.id}" on rig "${rig.def.id}"`));
  rig.fitted.set(worn.def.model, made);
  return made;
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
  const held: Group[] = [];
  let heldKey: string = '';
  const bodies: BodyMesh[] = skinnedMeshes(model).flatMap((mesh: SkinnedMesh): BodyMesh[] => (Array.isArray(mesh.material) ? [] : [{ mesh, skin: mesh.material }]));
  const anchor: SkinnedMesh | undefined = bodies[0]?.mesh;
  const worn: SkinnedMesh[] = [];
  const wornMaterials: MeshStandardMaterial[] = [];
  let wornKey: string = '';

  return {
    def,
    root,
    mixer,
    clips: rig.clips,
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
    setWear(wearableIds: readonly string[], hiddenParts: readonly string[]): void {
      const key: string = `${wearableIds.join('|')}#${hiddenParts.join('|')}#${library.wearables.size}`;
      if (key === wornKey || anchor === undefined) return;
      wornKey = key;
      for (const piece of worn.splice(0, worn.length)) piece.removeFromParent();
      for (const material of wornMaterials.splice(0, wornMaterials.length)) material.dispose();
      for (const id of wearableIds) {
        const wearable: LoadedWearable | undefined = library.wearables.get(id);
        if (wearable === undefined) continue;
        const geometries: readonly BufferGeometry[] = fittedPieces(rig, wearable, anchor);
        wearable.pieces.forEach((piece: SkinnedMesh, index: number): void => {
          const geometry: BufferGeometry | undefined = geometries[index];
          const cloned: MeshStandardMaterial[] = flashing(piece.material, { tint: wearable.def.tint, glow: WHITE }, flash);
          const first: MeshStandardMaterial | undefined = cloned[0];
          if (geometry === undefined || first === undefined) return;
          const mesh: SkinnedMesh = new SkinnedMesh(geometry, cloned.length === 1 ? first : cloned);
          mesh.castShadow = true;
          mesh.frustumCulled = false;
          mesh.position.copy(anchor.position);
          mesh.quaternion.copy(anchor.quaternion);
          mesh.scale.copy(anchor.scale);
          mesh.bind(anchor.skeleton, anchor.bindMatrix);
          (anchor.parent ?? model).add(mesh);
          worn.push(mesh);
          wornMaterials.push(...cloned);
        });
      }
      for (const body of bodies) {
        body.mesh.material = hiddenParts.length === 0 ? body.skin : [body.skin, ...rig.bodyParts.map((part: string): Material => (hiddenParts.includes(part) ? UNSEEN : body.skin))];
      }
    },
    setFlash(color: Color, amount: number): void {
      flash.value.copy(color).multiplyScalar(amount * CHARACTER.flashBoost);
    },
    dispose(): void {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const material of [...materials, ...wornMaterials]) material.dispose();
    },
  };
}
