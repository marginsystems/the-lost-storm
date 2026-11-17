import type { AnimationClip, Object3D, SkinnedMesh } from 'three';
import { BufferGeometry, Material, Mesh, MeshStandardMaterial, PropertyBinding } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { AttachmentDef, Content, HeroDef, RigActionClip, RigDef, RigGait, RigStanceClips, WearableDef } from '../../sim/content/types.ts';
import type { CharacterNeeds } from '../../sim/wear.ts';
import { wearFrames, wearKey, wearModel } from '../../sim/wear.ts';
import { clipUrl, rigClipNames } from '../../sim/content/clips.ts';
import { renderBudget } from '../mobile/quality.ts';
import { disposeMaterialTextures, shrinkModelTextures } from '../mobile/textures.ts';
import { groupBodies, skinnedMeshes } from './wearables.ts';
import type { BodyGroupings } from './wearables.ts';
import { createBrowserTimers } from '../browser-timers.ts';
import { STALL, withStallLimit } from './stall-limit.ts';
import { addBoxUvs } from './box-uv.ts';
import { assetUrl } from './asset-url.ts';
import { fitClip } from './clip-fit.ts';
import { dressPiece } from './dress-piece.ts';
import { mergeRigidAlike, mergeSkinnedAlike } from './merge-alike.ts';
import type { KeepLoadingDeps, NamedLoad } from './keep-loading.ts';
import { loadAllKeepTrying } from './keep-loading.ts';

export interface ActionClip {
  readonly clip: AnimationClip;
  readonly impactTime: number;
}

export interface GaitClip {
  readonly clip: AnimationClip;
  readonly groundSpeed: number;
}

export interface StanceClipSet {
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
  readonly unarmed: StanceClipSet | null;
  readonly stances: ReadonlyMap<string, StanceClipSet>;
}

export interface LoadedRig {
  readonly def: RigDef;
  readonly template: Object3D;
  readonly clips: RigClipSet;
  readonly bodyParts: readonly string[];
  readonly bodyMasks: ReadonlyMap<string, readonly number[]>;
  readonly fitted: Map<string, readonly BufferGeometry[]>;
}

export interface LoadedAttachment {
  readonly def: AttachmentDef;
  readonly template: Object3D;
}

export interface LoadedWearable {
  readonly def: WearableDef;
  readonly frame: string;
  readonly model: string;
  readonly pieces: readonly SkinnedMesh[];
  readonly drawn: readonly SkinnedMesh[];
  readonly iconWith: readonly SkinnedMesh[];
}

export interface CharacterLibrary {
  readonly rigs: Map<string, LoadedRig>;
  readonly attachments: Map<string, LoadedAttachment>;
  readonly wearables: Map<string, LoadedWearable>;
}

const pending: Map<string, Promise<GLTF>> = new Map<string, Promise<GLTF>>();

export function loadModel(loader: GLTFLoader, path: string): Promise<GLTF> {
  const cached: Promise<GLTF> | undefined = pending.get(path);
  if (cached !== undefined) return cached;
  const started: Promise<GLTF> = withStallLimit((progress: () => void): Promise<GLTF> => loader.loadAsync(assetUrl(path), progress), createBrowserTimers(), STALL.limitMs, path).then(shrinkModel);
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
  const available: AnimationClip[] = [...main.animations, ...extras.flatMap((extra: GLTF): AnimationClip[] => extra.animations.map((found: AnimationClip): AnimationClip => fitClip(found, extra.scene, main.scene)))];
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
  const bare: RigStanceClips | null = def.clips.unarmed;
  const template: Object3D = cloneSkinned(main.scene);
  const grouping: BodyGroupings = groupBodies(skinnedMeshes(template), def.bodyParts);
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
      stances: new Map<string, StanceClipSet>(Object.entries(def.clips.stances).map(([name, stance]: [string, RigStanceClips]): [string, StanceClipSet] => [name, { idle: clip(`stances.${name}.idle`, stance.idle), actions: actionSet(stance.actions) }])),
    },
    bodyParts: grouping.names,
    bodyMasks: grouping.masks,
    fitted: new Map<string, readonly BufferGeometry[]>(),
  };
}

function isPiece(mesh: SkinnedMesh, names: ReadonlySet<string>): boolean {
  return names.size === 0 || names.has(mesh.name) || names.has(mesh.parent?.name ?? '');
}

async function loadWearable(loader: GLTFLoader, dresser: Dresser, def: WearableDef, frame: string): Promise<LoadedWearable> {
  const path: string = wearModel(def, frame);
  const model: GLTF = await loadKeptModel(loader, path);
  const names: Set<string> = new Set<string>(def.pieces.map((name: string): string => PropertyBinding.sanitizeNodeName(name)));
  const pieces: SkinnedMesh[] = skinnedMeshes(model.scene).filter((mesh: SkinnedMesh): boolean => isPiece(mesh, names)).map((mesh: SkinnedMesh): SkinnedMesh => dressPiece(mesh, dresser, def.surfaces));
  if (pieces.length === 0) throw new Error(`Wearable "${def.id}" has no skinned mesh in ${path}`);
  const beside: Set<string> = new Set<string>(def.iconWith.map((name: string): string => PropertyBinding.sanitizeNodeName(name)));
  const iconWith: SkinnedMesh[] = beside.size === 0 ? [] : skinnedMeshes(model.scene).filter((mesh: SkinnedMesh): boolean => isPiece(mesh, beside));
  return { def, frame, model: path, pieces, drawn: mergeSkinnedAlike(pieces), iconWith };
}

interface FramedWearable {
  readonly def: WearableDef;
  readonly frame: string;
}

export type Dresser = (dress: Readonly<Record<string, string>>, material: Material) => Material;

async function loadAttachment(loader: GLTFLoader, dresser: Dresser, def: AttachmentDef): Promise<LoadedAttachment> {
  const model: GLTF = await loadKeptModel(loader, def.model);
  model.scene.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    object.castShadow = true;
    if (object.material instanceof MeshStandardMaterial) object.material = dresser(def.surfaces, object.material);
  });
  return { def, template: mergeRigidAlike(model.scene) };
}

function usedRigs(content: Content): Set<string> {
  const ids: Set<string> = new Set<string>(content.player.heroes.map((hero: HeroDef): string => hero.rig));
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

function framedWearables(content: Content, keys: Iterable<string>): FramedWearable[] {
  const wanted: Set<string> = new Set<string>(keys);
  const found: FramedWearable[] = [];
  for (const frame of wearFrames(content)) {
    for (const def of content.wearables.values()) if (wanted.has(wearKey(frame, def.id))) found.push({ def, frame });
  }
  return found;
}

function everyWearable(content: Content): FramedWearable[] {
  return wearFrames(content).flatMap((frame: string): FramedWearable[] => [...content.wearables.values()].map((def: WearableDef): FramedWearable => ({ def, frame })));
}

export async function loadCharacters(loader: GLTFLoader, content: Content, dresser: Dresser, needs: CharacterNeeds): Promise<CharacterLibrary> {
  const [rigs, attachments, wearables]: [LoadedRig[], LoadedAttachment[], LoadedWearable[]] = await Promise.all([
    Promise.all(rigDefs(content, needs.rigs).map((def: RigDef): Promise<LoadedRig> => loadRig(loader, def))),
    Promise.all(attachmentDefs(content, needs.attachments).map((def: AttachmentDef): Promise<LoadedAttachment> => loadAttachment(loader, dresser, def))),
    Promise.all(framedWearables(content, needs.wearables).map((worn: FramedWearable): Promise<LoadedWearable> => loadWearable(loader, dresser, worn.def, worn.frame))),
  ]);
  return {
    rigs: new Map<string, LoadedRig>(rigs.map((rig: LoadedRig): [string, LoadedRig] => [rig.def.id, rig])),
    attachments: new Map<string, LoadedAttachment>(attachments.map((held: LoadedAttachment): [string, LoadedAttachment] => [held.def.id, held])),
    wearables: new Map<string, LoadedWearable>(wearables.map((worn: LoadedWearable): [string, LoadedWearable] => [wearKey(worn.frame, worn.def.id), worn])),
  };
}

export async function loadNeeds(loader: GLTFLoader, content: Content, dresser: Dresser, library: CharacterLibrary, needs: CharacterNeeds): Promise<void> {
  const rigIds: string[] = [...needs.rigs].filter((id: string): boolean => !library.rigs.has(id));
  const heldIds: string[] = [...needs.attachments].filter((id: string): boolean => !library.attachments.has(id));
  const unworn: FramedWearable[] = framedWearables(content, needs.wearables).filter((worn: FramedWearable): boolean => !library.wearables.has(wearKey(worn.frame, worn.def.id)));
  await Promise.all([
    ...rigDefs(content, rigIds).map(async (def: RigDef): Promise<void> => {
      library.rigs.set(def.id, await loadRig(loader, def));
    }),
    ...unworn.map(async (worn: FramedWearable): Promise<void> => {
      library.wearables.set(wearKey(worn.frame, worn.def.id), await loadWearable(loader, dresser, worn.def, worn.frame));
    }),
    ...attachmentDefs(content, heldIds).map(async (def: AttachmentDef): Promise<void> => {
      library.attachments.set(def.id, await loadAttachment(loader, dresser, def));
    }),
  ]);
}

export function remainingLoads(loader: GLTFLoader, content: Content, dresser: Dresser, library: CharacterLibrary): NamedLoad[] {
  const heldIds: string[] = [...content.attachments.keys()].filter((id: string): boolean => !library.attachments.has(id));
  const rigIds: string[] = [...usedRigs(content)].filter((id: string): boolean => !library.rigs.has(id));
  const unworn: FramedWearable[] = everyWearable(content).filter((worn: FramedWearable): boolean => !library.wearables.has(wearKey(worn.frame, worn.def.id)));
  return [
    ...rigDefs(content, rigIds).map((def: RigDef): NamedLoad => ({ what: `Rig ${def.id}`, load: async (): Promise<void> => void library.rigs.set(def.id, await loadRig(loader, def)) })),
    ...unworn.map((worn: FramedWearable): NamedLoad => ({ what: `Wearable ${worn.def.id} on ${worn.frame}`, load: async (): Promise<void> => void library.wearables.set(wearKey(worn.frame, worn.def.id), await loadWearable(loader, dresser, worn.def, worn.frame)) })),
    ...attachmentDefs(content, heldIds).map((def: AttachmentDef): NamedLoad => ({ what: `Attachment ${def.id}`, load: async (): Promise<void> => void library.attachments.set(def.id, await loadAttachment(loader, dresser, def)) })),
  ];
}

export function loadRemainingCharacters(loader: GLTFLoader, content: Content, dresser: Dresser, library: CharacterLibrary, deps: KeepLoadingDeps): Promise<void> {
  return loadAllKeepTrying(remainingLoads(loader, content, dresser, library), deps);
}

export function hasWear(library: CharacterLibrary, frame: string, wearableIds: readonly string[], gear: readonly string[]): boolean {
  return wearableIds.every((id: string): boolean => library.wearables.has(wearKey(frame, id))) && gear.every((id: string): boolean => library.attachments.has(id));
}
