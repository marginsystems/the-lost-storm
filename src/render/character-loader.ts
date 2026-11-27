import type { BufferGeometry, IUniform, Material, Object3D, Quaternion } from 'three';
import { AnimationMixer, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PropertyBinding, SkinnedMesh } from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { boundSkins, disposeSkeletons, shareSkeletons } from './skeletons.ts';
import { poseOncePerTick } from '../three-kit/pose-once.ts';
import { quietBones } from '../three-kit/quiet-bones.ts';
import type { RigDef, RigSocket } from '../../sim/content/types.ts';
import { wearKey } from '../../sim/wear.ts';
import { CHARACTER_INSIDE } from './character-inside.ts';
import { fitToSkeleton, maskHidden, skinnedMeshes } from './wearables.ts';
import type { GhostUniforms, RigGlow } from './ghost-material.ts';
import { createRigGlow, FLASH, flashEdge, flashLift, makeGhost } from './ghost-material.ts';
import { fadeMaterials } from './body-swap.ts';
import { anyUnsettled, dropSettled, sameIds, settledPiece, springTo, WEAR_FADE } from './wear-spring.ts';
import type { Springy } from './wear-spring.ts';
import { plantHeld } from './held-plant.ts';
import { bindShade, seeThrough, shadedCopy, shadeHeld, SHADOW_BODY, SHADOW_LIGHT, SHADOW_UNIFORMS, shadowRim } from './shadow-shade.ts';
import type { MeshLooks, RestLooks } from './rest-looks.ts';
import { createMeshLooks, glowAtRest, isMesh, REST_GLOW, restLook } from './rest-looks.ts';
import type { CharacterLibrary, LoadedAttachment, LoadedRig, LoadedWearable, RigClipSet, StanceClipSet } from './character-library.ts';
import { RestingGroup } from '../three-kit/resting-group.ts';
import { markSeeThrough } from './see-through.ts';
import type { CasterCache, CasterPiece, CasterRange } from './shadow-caster.ts';
import { casterGeometry, castsTogether, createCasterCache, createShadowCaster, fitCaster } from './shadow-caster.ts';

export type { ActionClip, CharacterLibrary, Dresser, GaitClip, LoadedAttachment, LoadedRig, LoadedWearable, RigClipSet, StanceClipSet } from './character-library.ts';
export { forgetModel, hasWear, loadCharacters, loadKeptModel, loadModel, loadNeeds, loadRemainingCharacters, usePrivateClips } from './character-library.ts';

export interface RigLook {
  readonly tint: string;
  readonly glow: string;
  readonly ghost: GhostUniforms | null;
  readonly feather: boolean;
}

export interface RigInstance {
  readonly model: Object3D;
  readonly def: RigDef;
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly clips: RigClipSet;
  setGear(attachmentIds: readonly string[]): void;
  setPlanted(attachmentIds: readonly string[]): void;
  armed(): boolean;
  stance(): StanceClipSet | null;
  setWear(wearableIds: readonly string[], hiddenParts: readonly string[]): void;
  stepWear(dt: number): void;
  sharedLook(): boolean;
  setFlash(color: Color, amount: number): void;
  setHover(color: Color, amount: number): void;
  setOpacity(opacity: number): void;
  setFade(amount: number): void;
  setShade(color: Color, amount: number, see: boolean, wet: number): void;
  setRankRim(color: Color, amount: number): void;
  dispose(): void;
}

export const CHARACTER = {
  hoverBoost: 0.5,
  hoverPower: 3,
  glowBoost: 2.4,
  metalFrom: 0.5,
  matteRoughness: 0.86,
  rimPower: 6,
  skinMaterial: 'skin',
  featherFrom: 0.2,
  featherTo: 0.8,
  rankEdgeFrom: 0.64,
  rankEdgeTo: 0.78,
} as const;

export const CHARACTER_SHADE: string = [
  '#include <emissivemap_fragment>',
  'float edgeFacing = clamp( 1.0 - dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );',
  ...SHADOW_BODY,
  `totalEmissiveRadiance += ${flashEdge('edgeFacing', 'diffuseColor.rgb')} + uRim * pow( edgeFacing, ${CHARACTER.rimPower.toFixed(2)} ) + uHover * pow( edgeFacing, ${CHARACTER.hoverPower.toFixed(2)} ) + ${shadowRim('edgeFacing')} + uRankRim * smoothstep( ${CHARACTER.rankEdgeFrom.toFixed(2)}, ${CHARACTER.rankEdgeTo.toFixed(2)}, edgeFacing );`,
].join('\n');

export const CHARACTER_FEATHER: string = `diffuseColor.a = smoothstep( ${CHARACTER.featherFrom.toFixed(2)}, ${CHARACTER.featherTo.toFixed(2)}, diffuseColor.a );\nif ( diffuseColor.a <= 0.0 ) discard;`;

interface HeldPiece {
  readonly holder: Group;
  readonly id: string;
  readonly rest: Quaternion;
  readonly size: number;
  readonly materials: MeshStandardMaterial[];
  value: number;
  velocity: number;
  target: number;
}

interface WornPiece {
  readonly meshes: SkinnedMesh[];
  readonly materials: MeshStandardMaterial[];
  value: number;
  velocity: number;
  target: number;
}

export const RIM_LIGHT: IUniform<Color> = { value: new Color(0x000000) };
export const WAKE_LAMPS: IUniform<number> = { value: 0 };
const LAMP_HOLD: string = '#include <opaque_fragment>';

const DEGREES: number = Math.PI / 180;
const FLASH_KEY: string = 'storm-flash-rim';
const WHITE: string = '#ffffff';
const UNSEEN: Material = new MeshBasicMaterial({ visible: false });

function recolourEmissiveMap(material: MeshStandardMaterial, glow: string): void {
  if (material.emissiveMap === null) return;
  material.emissive.set(glow);
  material.emissiveIntensity = CHARACTER.glowBoost;
}

function flashOne(entry: MeshStandardMaterial, look: RigLook, glow: RigGlow, wakeLamps: number, skinTint: string): MeshStandardMaterial {
  const material: MeshStandardMaterial = entry.clone();
  material.color.multiply(new Color(entry.name === CHARACTER.skinMaterial ? skinTint : look.tint));
  material.alphaToCoverage = look.feather && material.alphaTest > 0;
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
      shader.uniforms['uFlashLift'] = glow.lift;
      shader.uniforms['uHover'] = glow.hover;
      bindShade(shader.uniforms, glow);
      shader.uniforms['uRim'] = RIM_LIGHT;
      shader.uniforms['uRankRim'] = glow.rankRim;
      shader.uniforms['uWakeLamps'] = WAKE_LAMPS;
      shader.uniforms['uLampShare'] = { value: wakeLamps };
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `uniform vec3 uFlash;\nuniform float uFlashLift;\nuniform vec3 uHover;\n${SHADOW_UNIFORMS}\nuniform vec3 uRim;\nuniform vec3 uRankRim;\nuniform float uWakeLamps;\nuniform float uLampShare;\nvoid main() {`)
        .replace(LAMP_HOLD, `outgoingLight *= mix( 1.0, uLampShare, uWakeLamps );\n${LAMP_HOLD}`)
        .replace('#include <lights_fragment_end>', `${CHARACTER_INSIDE}\n${SHADOW_LIGHT}`)
        .replace('#include <emissivemap_fragment>', CHARACTER_SHADE)
        .replace('#include <alphatest_fragment>', material.alphaToCoverage ? CHARACTER_FEATHER : '#include <alphatest_fragment>');
    };
    const programKey: string = material.alphaToCoverage ? `${FLASH_KEY}-feather` : FLASH_KEY;
    material.customProgramCacheKey = (): string => programKey;
    markSeeThrough(material);
  } else {
    makeGhost(material, glow, look.ghost);
  }
  return material;
}

function flashing(source: unknown, look: RigLook, glow: RigGlow, wakeLamps: number, skinTint: string, rests: RestLooks | null): MeshStandardMaterial[] {
  const list: readonly unknown[] = Array.isArray(source) ? source : [source];
  const cloned: MeshStandardMaterial[] = [];
  for (const entry of list) {
    if (!(entry instanceof MeshStandardMaterial)) continue;
    const material: MeshStandardMaterial = flashOne(entry, look, glow, wakeLamps, skinTint);
    if (rests !== null && look.ghost === null) rests.set(material, restLook(entry, `flash|${look.tint}|${look.glow}|${skinTint}|${look.feather}|${wakeLamps}`, (): MeshStandardMaterial => flashOne(entry, look, REST_GLOW, wakeLamps, skinTint)));
    cloned.push(material);
  }
  return cloned;
}

export function skinOf(tint: string, skin: string): string {
  return `#${new Color(tint).multiply(new Color(skin)).getHexString()}`;
}

function dress(object: Object3D, look: RigLook, glow: RigGlow, sink: MeshStandardMaterial[], skinTint: string, rests: RestLooks | null): void {
  if (!(object instanceof Mesh)) return;
  object.castShadow = true;
  object.receiveShadow = false;
  object.frustumCulled = false;
  const cloned: MeshStandardMaterial[] = flashing(object.material, look, glow, 1, skinTint, rests);
  sink.push(...cloned);
  const first: MeshStandardMaterial | undefined = cloned[0];
  if (first !== undefined) object.material = cloned.length === 1 ? first : cloned;
}

interface BodyMesh {
  readonly mesh: SkinnedMesh;
  readonly skin: Material;
}

function fittedPieces(rig: LoadedRig, worn: LoadedWearable, anchor: SkinnedMesh): readonly BufferGeometry[] {
  const cached: readonly BufferGeometry[] | undefined = rig.fitted.get(worn.def.id);
  if (cached !== undefined) return cached;
  const made: BufferGeometry[] = worn.drawn.map((piece: SkinnedMesh): BufferGeometry => fitToSkeleton(piece, anchor.skeleton, `Wearable "${worn.def.id}" on rig "${rig.def.id}"`));
  rig.fitted.set(worn.def.id, made);
  return made;
}

export function findNode(model: Object3D, name: string): Object3D | undefined {
  return model.getObjectByName(PropertyBinding.sanitizeNodeName(name)) ?? model.getObjectByName(name);
}

export type RigShadows = 'pieces' | 'together';

function shownWithin(object: Object3D, top: Object3D): boolean {
  for (let node: Object3D | null = object; node !== null && node !== top; node = node.parent) if (!node.visible) return false;
  return true;
}

const casters: WeakMap<LoadedRig, CasterCache> = new WeakMap<LoadedRig, CasterCache>();

function castersOf(rig: LoadedRig): CasterCache {
  const found: CasterCache = casters.get(rig) ?? createCasterCache();
  casters.set(rig, found);
  return found;
}

export function instantiateRig(rig: LoadedRig, library: CharacterLibrary, look: RigLook, shadows: RigShadows = 'pieces', share: boolean = false): RigInstance {
  const def: RigDef = rig.def;
  boundSkins(rig.template);
  const model: Object3D = cloneSkinned(rig.template);
  shareSkeletons(model);
  quietBones(model);
  if (shadows === 'together') poseOncePerTick(model);
  model.scale.setScalar(def.scale);
  model.rotation.y = def.yawOffsetDegrees * DEGREES;
  const root: Group = new RestingGroup();
  root.add(model);
  const glow: RigGlow = createRigGlow();
  let faded: number = 1;
  let shadeSees: boolean = false;
  const materials: MeshStandardMaterial[] = [];
  const skinTint: string = skinOf(look.tint, def.skin);
  const rests: RestLooks | null = share && look.ghost === null ? new Map<Material, Material>() : null;
  const looks: MeshLooks = createMeshLooks(rests ?? new Map<Material, Material>());
  const keepMeshes = (branch: Object3D): void => {
    branch.traverse((object: Object3D): void => {
      if (isMesh(object)) looks.keep(object);
    });
  };
  const forgetMeshes = (branch: Object3D): void => {
    branch.traverse((object: Object3D): void => {
      if (isMesh(object)) looks.forget(object);
    });
  };
  const shadeSharing = (copy: Object3D, sink: MeshStandardMaterial[]): void => {
    const sources: Map<Mesh, MeshStandardMaterial> = new Map<Mesh, MeshStandardMaterial>();
    copy.traverse((object: Object3D): void => {
      if (isMesh(object) && object.material instanceof MeshStandardMaterial) sources.set(object, object.material);
    });
    shadeHeld(copy, glow, sink);
    if (rests === null) return;
    for (const [mesh, source] of sources) {
      if (mesh.material instanceof MeshStandardMaterial) rests.set(mesh.material, restLook(source, 'held', (): MeshStandardMaterial => shadedCopy(source, REST_GLOW)));
      looks.keep(mesh);
    }
  };
  model.traverse((object: Object3D): void => dress(object, look, glow, materials, skinTint, rests));
  if (rests !== null) keepMeshes(model);
  for (const name of def.hiddenNodes) {
    const node: Object3D | undefined = findNode(model, name);
    if (node !== undefined) node.visible = false;
  }

  const mixer: AnimationMixer = new AnimationMixer(model);
  const held: Map<string, HeldPiece> = new Map<string, HeldPiece>();
  const lettingGo: HeldPiece[] = [];
  const planting: Springy = { value: 0, velocity: 0, target: 0 };
  let heldIds: readonly string[] | null = null;
  let gearDressed: boolean = false;
  let plantedBefore: boolean = false;
  let plantedIds: readonly string[] = [];
  const bodies: BodyMesh[] = skinnedMeshes(model).flatMap((mesh: SkinnedMesh): BodyMesh[] => (Array.isArray(mesh.material) ? [] : [{ mesh, skin: mesh.material }]));
  const anchor: SkinnedMesh | undefined = bodies[0]?.mesh;
  const caster: SkinnedMesh | null = shadows === 'together' && anchor !== undefined ? createShadowCaster(anchor) : null;
  let castKey: string | null = null;
  if (caster !== null && anchor !== undefined) (anchor.parent ?? model).add(caster);
  const worn: Map<string, WornPiece> = new Map<string, WornPiece>();
  const leaving: WornPiece[] = [];
  let shownParts: readonly string[] = [];
  let finalParts: readonly string[] = [];
  let partsPending: boolean = false;
  let wearMoving: boolean = false;
  let dressedCache: MeshStandardMaterial[] | null = null;
  const shownRanges = (body: BodyMesh): readonly CasterRange[] | null => {
    const masks: readonly number[] | undefined = rig.bodyMasks.get(body.mesh.name);
    if (shownParts.length === 0 || masks === undefined) return null;
    return body.mesh.geometry.groups.filter((_group: CasterRange, at: number): boolean => !maskHidden(masks[at] ?? 0, rig.bodyParts, shownParts));
  };
  const castTogether = (): void => {
    if (caster === null || anchor === undefined) return;
    const key: string = `${[...worn.keys()].join('|')}#${shownParts.join('|')}`;
    if (key === castKey) return;
    const before: string | null = castKey;
    castKey = key;
    const cast: BodyMesh[] = bodies.filter((body: BodyMesh): boolean => castsTogether(body.mesh.geometry) && shownWithin(body.mesh, model));
    for (const body of cast) body.mesh.castShadow = false;
    const pieces: CasterPiece[] = cast.map((body: BodyMesh): CasterPiece => ({ geometry: body.mesh.geometry, bindMatrix: body.mesh.bindMatrix, ranges: shownRanges(body) }));
    for (const piece of worn.values()) {
      for (const mesh of piece.meshes) {
        if (!castsTogether(mesh.geometry)) continue;
        mesh.castShadow = false;
        pieces.push({ geometry: mesh.geometry, bindMatrix: mesh.bindMatrix, ranges: null });
      }
    }
    fitCaster(caster, castersOf(rig).take(key, (): BufferGeometry => casterGeometry(pieces, anchor.bindMatrix)));
    if (before !== null) castersOf(rig).leave(before);
  };
  const hide = (parts: readonly string[]): void => {
    shownParts = parts;
    partsPending = shownParts.join('|') !== finalParts.join('|');
    for (const body of bodies) {
      const masks: readonly number[] | undefined = rig.bodyMasks.get(body.mesh.name);
      body.mesh.material = parts.length === 0 || masks === undefined ? body.skin : masks.map((mask: number): Material => (maskHidden(mask, rig.bodyParts, parts) ? UNSEEN : body.skin));
      if (rests !== null) looks.keep(body.mesh);
    }
    castTogether();
  };
  const fade = (piece: WornPiece, value: number): void => {
    piece.value = value;
    seeThrough(piece.materials, value < 1 || look.ghost !== null || shadeSees);
    if (look.ghost === null) for (const material of piece.materials) material.opacity = value;
  };
  const drop = (piece: WornPiece): void => {
    for (const mesh of piece.meshes) {
      looks.forget(mesh);
      mesh.removeFromParent();
    }
    for (const material of piece.materials) material.dispose();
  };
  const build = (id: string, skinAnchor: SkinnedMesh): WornPiece | null => {
    const wearable: LoadedWearable | undefined = library.wearables.get(wearKey(def.frame, id));
    if (wearable === undefined) return null;
    const piece: WornPiece = { meshes: [], materials: [], value: 1, velocity: 0, target: 1 };
    const fitted: readonly BufferGeometry[] = fittedPieces(rig, wearable, skinAnchor);
    wearable.drawn.forEach((source: SkinnedMesh, index: number): void => {
      const geometry: BufferGeometry | undefined = fitted[index];
      const cloned: MeshStandardMaterial[] = flashing(source.material, { tint: wearable.def.tint, glow: WHITE, ghost: look.ghost, feather: look.feather }, glow, wearable.def.wakeLamps, skinTint, rests);
      const first: MeshStandardMaterial | undefined = cloned[0];
      if (geometry === undefined || first === undefined) return;
      const mesh: SkinnedMesh = new SkinnedMesh(geometry, cloned.length === 1 ? first : cloned);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.position.copy(skinAnchor.position);
      mesh.quaternion.copy(skinAnchor.quaternion);
      mesh.scale.copy(skinAnchor.scale);
      mesh.bind(skinAnchor.skeleton, skinAnchor.bindMatrix);
      mesh.boundingSphere = skinAnchor.boundingSphere.clone();
      (skinAnchor.parent ?? model).add(mesh);
      if (rests !== null) looks.keep(mesh);
      piece.meshes.push(mesh);
      piece.materials.push(...cloned);
    });
    return piece;
  };
  const dressed = (): readonly MeshStandardMaterial[] => {
    if (dressedCache !== null) return dressedCache;
    const all: MeshStandardMaterial[] = [...materials];
    for (const piece of worn.values()) all.push(...piece.materials);
    for (const piece of leaving) all.push(...piece.materials);
    for (const piece of held.values()) all.push(...piece.materials);
    for (const piece of lettingGo) all.push(...piece.materials);
    dressedCache = all;
    return all;
  };
  const release = (piece: HeldPiece): void => {
    forgetMeshes(piece.holder);
    piece.holder.removeFromParent();
    for (const material of piece.materials) material.dispose();
  };
  const stepWornPiece = (piece: WornPiece, step: number): boolean => {
    if (settledPiece(piece)) return false;
    const moved: boolean = springTo(piece, step, 1);
    fade(piece, piece.value);
    return moved;
  };
  const stepHeldPiece = (piece: HeldPiece, step: number): void => {
    if (settledPiece(piece)) return;
    springTo(piece, step, WEAR_FADE.overshoot);
    piece.holder.scale.setScalar(piece.size * piece.value);
  };
  const stepPlanting = (dt: number): void => {
    const moving: boolean = springTo(planting, Math.min(dt, WEAR_FADE.longestStep), 1);
    if (!moving && planting.value === 0 && !plantedBefore) return;
    plantedBefore = planting.value > 0;
    for (const piece of held.values()) if (plantedIds.includes(piece.id)) plantHeld(piece.holder, piece.rest, planting.value);
  };
  const stepWearing = (dt: number): void => {
    if (!wearMoving && !partsPending) return;
    const step: number = Math.min(dt, WEAR_FADE.longestStep);
    let moving: boolean = false;
    for (const piece of worn.values()) if (stepWornPiece(piece, step)) moving = true;
    for (const piece of leaving) if (stepWornPiece(piece, step)) moving = true;
    for (const piece of held.values()) stepHeldPiece(piece, step);
    for (const piece of lettingGo) stepHeldPiece(piece, step);
    const released: boolean = dropSettled(lettingGo, release);
    if (dropSettled(leaving, drop) || released) dressedCache = null;
    wearMoving = lettingGo.length > 0 || leaving.length > 0 || anyUnsettled(worn.values()) || anyUnsettled(held.values());
    if (!moving && partsPending) hide(finalParts);
  };
  let wornKey: string = '';
  castTogether();

  return {
    def,
    root,
    model,
    mixer,
    clips: rig.clips,
    setGear(attachmentIds: readonly string[]): void {
      if (heldIds === null ? attachmentIds.length === 0 : sameIds(heldIds, attachmentIds)) return;
      heldIds = attachmentIds.every((id: string): boolean => library.attachments.has(id)) ? [...attachmentIds] : null;
      dressedCache = null;
      wearMoving = true;
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
        const piece: HeldPiece = { holder, id, rest: holder.quaternion.clone(), size: socket.scale, materials: [], value: instant ? 1 : 0, velocity: 0, target: 1 };
        holder.scale.setScalar(socket.scale * piece.value);
        const copy: Object3D = attachment.template.clone(true);
        if (look.ghost !== null) copy.traverse((object: Object3D): void => dress(object, look, glow, piece.materials, skinTint, null));
        else shadeSharing(copy, piece.materials);
        holder.add(copy);
        bone.add(holder);
        held.set(id, piece);
      }
    },
    armed(): boolean {
      return held.size > 0;
    },
    stance(): StanceClipSet | null {
      if (held.size === 0) return rig.clips.unarmed;
      for (const id of held.keys()) {
        const named: string | null = library.attachments.get(id)?.def.stance ?? null;
        const found: StanceClipSet | undefined = named === null ? undefined : rig.clips.stances.get(named);
        if (found !== undefined) return found;
      }
      return null;
    },
    setWear(wearableIds: readonly string[], hiddenParts: readonly string[]): void {
      const key: string = `${wearableIds.join('|')}#${hiddenParts.join('|')}#${library.wearables.size}`;
      if (key === wornKey || anchor === undefined) return;
      const instant: boolean = wornKey === '' || look.ghost !== null;
      wornKey = key;
      dressedCache = null;
      wearMoving = true;
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
    setPlanted(attachmentIds: readonly string[]): void {
      if (attachmentIds.length > 0) plantedIds = attachmentIds;
      planting.target = attachmentIds.length > 0 ? 1 : 0;
    },
    stepWear(dt: number): void {
      stepWearing(dt);
      stepPlanting(dt);
      if (rests !== null) looks.settle(glowAtRest(glow) && faded === 1 && !shadeSees && !wearMoving && !partsPending);
    },
    sharedLook(): boolean {
      return looks.resting();
    },
    setFlash(color: Color, amount: number): void {
      glow.flash.value.copy(color).multiplyScalar(amount * FLASH.boost);
      glow.lift.value = flashLift(amount);
    },
    setHover(color: Color, amount: number): void {
      glow.hover.value.copy(color).multiplyScalar(amount * CHARACTER.hoverBoost);
    },
    setOpacity(opacity: number): void {
      if (look.ghost === null) return;
      for (const material of dressed()) material.opacity = opacity;
    },
    setFade(amount: number): void {
      if (look.ghost !== null) return;
      faded = amount;
      seeThrough(dressed(), faded < 1 || shadeSees);
      fadeMaterials(dressed(), amount);
    },
    setShade(color: Color, amount: number, see: boolean, wet: number): void {
      if (look.ghost !== null) return;
      glow.shadeWet.value = wet;
      shadeSees = see && amount > 0;
      glow.shade.value.copy(color);
      glow.shadeMix.value = amount;
      seeThrough(dressed(), faded < 1 || (see && amount > 0));
    },
    setRankRim(color: Color, amount: number): void {
      glow.rankRim.value.copy(color).multiplyScalar(amount);
    },
    dispose(): void {
      if (castKey !== null) castersOf(rig).leave(castKey);
      castKey = null;
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const material of dressed()) material.dispose();
      disposeSkeletons(model);
    },
  };
}
