import type { AnimationClip, IUniform, Object3D } from 'three';
import { AnimationMixer, BufferGeometry, Color, Group, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, PropertyBinding, SkinnedMesh } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { AttachmentDef, Content, RigActionClip, RigDef, RigGait, RigSocket, RigUnarmedClips, WearableDef } from '../../sim/content/types.ts';
import type { CharacterNeeds } from '../../sim/wear.ts';
import { clipUrl, rigClipNames } from '../../sim/content/clips.ts';
import { renderBudget } from '../mobile/quality.ts';
import { disposeMaterialTextures, shrinkModelTextures } from '../mobile/textures.ts';
import { fitToSkeleton, groupBodyParts, skinnedMeshes } from './wearables.ts';
import type { GhostUniforms, RigGlow } from './ghost-material.ts';
import { makeGhost } from './ghost-material.ts';
import { addBoxUvs } from './box-uv.ts';

export interface ActionClip {
  readonly clip: AnimationClip;
  readonly impactTime: number;
}

export interface GaitClip {
  readonly clip: AnimationClip;
  readonly groundSpeed: number;
}

export interface UnarmedClipSet {
  readonly idle: AnimationClip;
  readonly actions: ReadonlyMap<string, ActionClip>;
}

export interface RigClipSet {
  readonly idle: AnimationClip;
  readonly run: AnimationClip;
  readonly gaits: readonly GaitClip[];
  readonly hit: readonly AnimationClip[];
  readonly death: readonly AnimationClip[];
  readonly rise: AnimationClip | null;
  readonly actions: ReadonlyMap<string, ActionClip>;
  readonly unarmed: UnarmedClipSet | null;
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
  readonly ghost: GhostUniforms | null;
}

export interface RigInstance {
  readonly def: RigDef;
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly clips: RigClipSet;
  setGear(attachmentIds: readonly string[]): void;
  armed(): boolean;
  setWear(wearableIds: readonly string[], hiddenParts: readonly string[]): void;
  stepWear(dt: number): void;
  setFlash(color: Color, amount: number): void;
  setHover(color: Color, amount: number): void;
  setOpacity(opacity: number): void;
  dispose(): void;
}

export const CHARACTER = {
  flashBoost: 1.9,
  hoverBoost: 0.5,
  hoverPower: 3,
  glowBoost: 2.4,
  metalFrom: 0.5,
  matteRoughness: 0.86,
  rimPower: 6,
} as const;

export const CHARACTER_SHADE: string = [
  '#include <emissivemap_fragment>',
  'float edgeFacing = clamp( 1.0 - dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );',
  `totalEmissiveRadiance += uFlash + uRim * pow( edgeFacing, ${CHARACTER.rimPower.toFixed(2)} ) + uHover * pow( edgeFacing, ${CHARACTER.hoverPower.toFixed(2)} );`,
].join('\n');

export const WEAR_FADE = {
  stiffness: 240,
  damping: 31,
  settle: 0.004,
  longestStep: 1 / 30,
  overshoot: 1.2,
} as const;

interface HeldPiece {
  readonly holder: Group;
  readonly size: number;
  readonly materials: MeshStandardMaterial[];
  value: number;
  velocity: number;
  target: number;
}

interface Springy {
  value: number;
  velocity: number;
  target: number;
}

function springTo(piece: Springy, step: number, ceiling: number): boolean {
  if (piece.value === piece.target && piece.velocity === 0) return false;
  piece.velocity += (WEAR_FADE.stiffness * (piece.target - piece.value) - WEAR_FADE.damping * piece.velocity) * step;
  const next: number = Math.min(ceiling, Math.max(0, piece.value + piece.velocity * step));
  const settled: boolean = Math.abs(piece.target - next) < WEAR_FADE.settle && Math.abs(piece.velocity) < WEAR_FADE.settle * WEAR_FADE.stiffness;
  piece.value = settled ? piece.target : next;
  if (settled) piece.velocity = 0;
  return !settled;
}

interface WornPiece {
  readonly meshes: SkinnedMesh[];
  readonly materials: MeshStandardMaterial[];
  value: number;
  velocity: number;
  target: number;
}

export const RIM_LIGHT: IUniform<Color> = { value: new Color(0x000000) };

const DEGREES: number = Math.PI / 180;
const FLASH_KEY: string = 'storm-flash-rim';
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
  addBoxUvs(gltf.scene);
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
  const actionSet = (entries: Readonly<Record<string, RigActionClip>>): Map<string, ActionClip> => {
    const actions: Map<string, ActionClip> = new Map<string, ActionClip>();
    for (const [key, entry] of Object.entries(entries)) {
      const found: AnimationClip = clip(key, entry.clip);
      actions.set(key, { clip: found, impactTime: found.duration * entry.impactFraction });
    }
    return actions;
  };
  const actions: Map<string, ActionClip> = actionSet(def.clips.actions);
  const bare: RigUnarmedClips | null = def.clips.unarmed;
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
      gaits: def.gaits.map((gait: RigGait): GaitClip => ({ clip: clip('gait', gait.clip), groundSpeed: gait.groundSpeed })),
      hit: def.clips.hit.map((wanted: string): AnimationClip => clip('hit', wanted)),
      death: def.clips.death.map((wanted: string): AnimationClip => clip('death', wanted)),
      rise: def.clips.rise === null ? null : clip('rise', def.clips.rise),
      actions,
      unarmed: bare === null ? null : { idle: clip('unarmed.idle', bare.idle), actions: actionSet(bare.actions) },
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
  for (const moment of content.moments.defs.values()) for (const echo of moment.echoes) if (echo.look !== null) ids.add(echo.look.rig);
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

function flashing(source: unknown, look: RigLook, glow: RigGlow): MeshStandardMaterial[] {
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
    if (look.ghost === null) {
      material.onBeforeCompile = (shader): void => {
        shader.uniforms['uFlash'] = glow.flash;
        shader.uniforms['uHover'] = glow.hover;
        shader.uniforms['uRim'] = RIM_LIGHT;
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', 'uniform vec3 uFlash;\nuniform vec3 uHover;\nuniform vec3 uRim;\nvoid main() {')
          .replace('#include <emissivemap_fragment>', CHARACTER_SHADE);
      };
      material.customProgramCacheKey = (): string => FLASH_KEY;
    } else {
      makeGhost(material, glow, look.ghost);
    }
    cloned.push(material);
  }
  return cloned;
}

function dress(object: Object3D, look: RigLook, glow: RigGlow, sink: MeshStandardMaterial[]): void {
  if (!(object instanceof Mesh)) return;
  object.castShadow = true;
  object.receiveShadow = false;
  object.frustumCulled = false;
  const cloned: MeshStandardMaterial[] = flashing(object.material, look, glow);
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
  const glow: RigGlow = { flash: { value: new Color(0, 0, 0) }, hover: { value: new Color(0, 0, 0) } };
  const materials: MeshStandardMaterial[] = [];
  model.traverse((object: Object3D): void => dress(object, look, glow, materials));
  for (const name of def.hiddenNodes) {
    const node: Object3D | undefined = findNode(model, name);
    if (node !== undefined) node.visible = false;
  }

  const mixer: AnimationMixer = new AnimationMixer(model);
  const held: Map<string, HeldPiece> = new Map<string, HeldPiece>();
  const lettingGo: HeldPiece[] = [];
  let heldKey: string = '';
  let gearDressed: boolean = false;
  const bodies: BodyMesh[] = skinnedMeshes(model).flatMap((mesh: SkinnedMesh): BodyMesh[] => (Array.isArray(mesh.material) ? [] : [{ mesh, skin: mesh.material }]));
  const anchor: SkinnedMesh | undefined = bodies[0]?.mesh;
  const worn: Map<string, WornPiece> = new Map<string, WornPiece>();
  const leaving: WornPiece[] = [];
  let shownParts: readonly string[] = [];
  let finalParts: readonly string[] = [];
  const wornMaterials = (): MeshStandardMaterial[] => [...worn.values(), ...leaving].flatMap((piece: WornPiece): MeshStandardMaterial[] => piece.materials);
  const hide = (parts: readonly string[]): void => {
    shownParts = parts;
    for (const body of bodies) {
      body.mesh.material = parts.length === 0 ? body.skin : [body.skin, ...rig.bodyParts.map((part: string): Material => (parts.includes(part) ? UNSEEN : body.skin))];
    }
  };
  const fade = (piece: WornPiece, value: number): void => {
    piece.value = value;
    for (const material of piece.materials) {
      const see: boolean = value < 1 || look.ghost !== null;
      if (material.transparent !== see) {
        material.transparent = see;
        material.needsUpdate = true;
      }
      if (look.ghost === null) material.opacity = value;
    }
  };
  const drop = (piece: WornPiece): void => {
    for (const mesh of piece.meshes) mesh.removeFromParent();
    for (const material of piece.materials) material.dispose();
  };
  const build = (id: string, skinAnchor: SkinnedMesh): WornPiece | null => {
    const wearable: LoadedWearable | undefined = library.wearables.get(id);
    if (wearable === undefined) return null;
    const piece: WornPiece = { meshes: [], materials: [], value: 1, velocity: 0, target: 1 };
    const geometries: readonly BufferGeometry[] = fittedPieces(rig, wearable, skinAnchor);
    wearable.pieces.forEach((source: SkinnedMesh, index: number): void => {
      const geometry: BufferGeometry | undefined = geometries[index];
      const cloned: MeshStandardMaterial[] = flashing(source.material, { tint: wearable.def.tint, glow: WHITE, ghost: look.ghost }, glow);
      const first: MeshStandardMaterial | undefined = cloned[0];
      if (geometry === undefined || first === undefined) return;
      const mesh: SkinnedMesh = new SkinnedMesh(geometry, cloned.length === 1 ? first : cloned);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.position.copy(skinAnchor.position);
      mesh.quaternion.copy(skinAnchor.quaternion);
      mesh.scale.copy(skinAnchor.scale);
      mesh.bind(skinAnchor.skeleton, skinAnchor.bindMatrix);
      (skinAnchor.parent ?? model).add(mesh);
      piece.meshes.push(mesh);
      piece.materials.push(...cloned);
    });
    return piece;
  };
  const heldMaterials = (): MeshStandardMaterial[] => [...held.values(), ...lettingGo].flatMap((piece: HeldPiece): MeshStandardMaterial[] => piece.materials);
  const release = (piece: HeldPiece): void => {
    piece.holder.removeFromParent();
    for (const material of piece.materials) material.dispose();
  };
  let wornKey: string = '';

  return {
    def,
    root,
    mixer,
    clips: rig.clips,
    setGear(attachmentIds: readonly string[]): void {
      const key: string = attachmentIds.join('|');
      if (key === heldKey) return;
      heldKey = attachmentIds.every((id: string): boolean => library.attachments.has(id)) ? key : '';
      const instant: boolean = !gearDressed || look.ghost !== null;
      gearDressed = true;
      for (const [id, piece] of held) {
        if (attachmentIds.includes(id)) continue;
        held.delete(id);
        if (instant) release(piece);
        else {
          piece.target = 0;
          lettingGo.push(piece);
        }
      }
      for (const id of attachmentIds) {
        if (held.has(id)) continue;
        const attachment: LoadedAttachment | undefined = library.attachments.get(id);
        const socket: RigSocket | undefined = attachment === undefined ? undefined : def.sockets[attachment.def.socket];
        const bone: Object3D | undefined = socket === undefined ? undefined : findNode(model, socket.bone);
        if (attachment === undefined || socket === undefined || bone === undefined) continue;
        const holder: Group = new Group();
        holder.position.set(socket.position[0], socket.position[1], socket.position[2]);
        holder.rotation.set(socket.rotationDegrees[0] * DEGREES, socket.rotationDegrees[1] * DEGREES, socket.rotationDegrees[2] * DEGREES);
        const piece: HeldPiece = { holder, size: socket.scale, materials: [], value: instant ? 1 : 0, velocity: 0, target: 1 };
        holder.scale.setScalar(socket.scale * piece.value);
        const copy: Object3D = attachment.template.clone(true);
        if (look.ghost !== null) copy.traverse((object: Object3D): void => dress(object, look, glow, piece.materials));
        holder.add(copy);
        bone.add(holder);
        held.set(id, piece);
      }
    },
    armed(): boolean {
      return held.size > 0;
    },
    setWear(wearableIds: readonly string[], hiddenParts: readonly string[]): void {
      const key: string = `${wearableIds.join('|')}#${hiddenParts.join('|')}#${library.wearables.size}`;
      if (key === wornKey || anchor === undefined) return;
      const instant: boolean = wornKey === '' || look.ghost !== null;
      wornKey = key;
      for (const [id, piece] of worn) {
        if (wearableIds.includes(id)) continue;
        worn.delete(id);
        if (instant) drop(piece);
        else {
          piece.target = 0;
          leaving.push(piece);
        }
      }
      for (const id of wearableIds) {
        if (worn.has(id)) continue;
        const piece: WornPiece | null = build(id, anchor);
        if (piece === null) continue;
        worn.set(id, piece);
        if (!instant) fade(piece, 0);
        else fade(piece, 1);
      }
      finalParts = [...hiddenParts];
      hide(instant ? finalParts : shownParts.filter((part: string): boolean => hiddenParts.includes(part)));
    },
    stepWear(dt: number): void {
      const step: number = Math.min(dt, WEAR_FADE.longestStep);
      let moving: boolean = false;
      for (const piece of [...worn.values(), ...leaving]) {
        if (piece.value === piece.target && piece.velocity === 0) continue;
        if (springTo(piece, step, 1)) moving = true;
        fade(piece, piece.value);
      }
      for (const piece of [...held.values(), ...lettingGo]) {
        if (piece.value === piece.target && piece.velocity === 0) continue;
        springTo(piece, step, WEAR_FADE.overshoot);
        piece.holder.scale.setScalar(piece.size * piece.value);
      }
      for (const piece of lettingGo.filter((candidate: HeldPiece): boolean => candidate.value === 0 && candidate.velocity === 0)) {
        release(piece);
        lettingGo.splice(lettingGo.indexOf(piece), 1);
      }
      for (const piece of leaving.filter((candidate: WornPiece): boolean => candidate.value === 0 && candidate.velocity === 0)) {
        drop(piece);
        leaving.splice(leaving.indexOf(piece), 1);
      }
      if (!moving && shownParts.join('|') !== finalParts.join('|')) hide(finalParts);
    },
    setFlash(color: Color, amount: number): void {
      glow.flash.value.copy(color).multiplyScalar(amount * CHARACTER.flashBoost);
    },
    setHover(color: Color, amount: number): void {
      glow.hover.value.copy(color).multiplyScalar(amount * CHARACTER.hoverBoost);
    },
    setOpacity(opacity: number): void {
      if (look.ghost === null) return;
      for (const material of [...materials, ...wornMaterials(), ...heldMaterials()]) material.opacity = opacity;
    },
    dispose(): void {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const material of [...materials, ...wornMaterials(), ...heldMaterials()]) material.dispose();
    },
  };
}
