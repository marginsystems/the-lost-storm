import type { Material, Object3D, Scene } from 'three';
import { Box3, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial, PointLight, Vector3 } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { MarkerKind } from '../../sim/content/marker-types.ts';
import type { Place, PlaceRef } from '../../sim/content/markers.ts';
import { markerDressing, samePlace, zonePlaces } from '../../sim/content/markers.ts';
import type { Content, ZoneDef, ZoneExit } from '../../sim/content/types.ts';
import { allHold } from '../../sim/world/conditions.ts';
import { exitShown } from '../../sim/world/exits.ts';
import { findExit } from '../../sim/world/zones.ts';
import type { World } from '../../sim/world/types.ts';
import type { Spring } from '../hud/character-spring.ts';
import { springTo, stepSpring } from '../hud/character-spring.ts';
import { renderBudget } from '../mobile/quality.ts';
import { loadModel } from './character-loader.ts';
import { CONTACT_SHADOW, contactShadow } from './contact-shadow.ts';
import { CAMERA } from './iso-camera.ts';
import type { PickColumn, PickRay } from './marker-pick.ts';
import { nearestColumn } from './marker-pick.ts';
import type { PlaceVeil } from './place-veil.ts';
import { createPlaceVeil } from './place-veil.ts';
import { propDressing, dressedProp } from './surfaces.ts';
import { floorUp } from './terrain-lift.ts';

export const PLACE_MARKERS = {
  glyphBase: 0x16181b,
  glyphRoughness: 0.85,
  crystalBase: 0x262c33,
  crystalRoughness: 0.26,
  crystalMetalness: 0.12,
  glow: 1.3,
  usedFor: 0.75,
  showDepth: 3.4,
  gone: 0.01,
  shown: 0.5,
  lightDecay: 1.8,
  bobRate: 1.7,
  stoneFallback: 0x8a8580,
} as const;

interface MarkerParts {
  readonly glows: readonly MeshStandardMaterial[];
  readonly focal: Object3D | null;
  readonly focalRest: number;
  readonly seal: Object3D | null;
  readonly sealRest: number;
  readonly veil: PlaceVeil | null;
}

interface MarkerView {
  readonly place: Place;
  readonly root: Group;
  readonly ground: number;
  readonly light: PointLight;
  readonly level: Spring;
  readonly rise: Spring;
  readonly shut: Spring;
  readonly shown: Spring;
  parts: MarkerParts | null;
  usedLeft: number;
  spin: number;
}

interface PlaceState {
  readonly shown: boolean;
  readonly open: boolean;
  readonly awake: boolean;
  readonly busy: boolean;
}

export interface PlaceMarkers {
  readonly ready: Promise<void>;
  update(dt: number, time: number, world: World): void;
  aim(ref: PlaceRef | null): void;
  use(ref: PlaceRef): void;
  pick(ray: PickRay): PlaceRef | null;
  dispose(): void;
}

function exitOf(world: World, ref: PlaceRef): ZoneExit | null {
  return ref.type === 'exit' ? findExit(world.zone, ref.exit) : null;
}

export function placeState(world: World, ref: PlaceRef): PlaceState {
  switch (ref.type) {
    case 'waypoint':
      return { shown: true, open: true, awake: world.waypoints.includes(world.zone.id), busy: false };
    case 'checkpoint':
      return { shown: true, open: true, awake: world.respawn.type === 'checkpoint' && world.respawn.checkpoint === ref.checkpoint, busy: false };
    case 'exit': {
      const exit: ZoneExit | null = exitOf(world, ref);
      if (exit === null) return { shown: false, open: false, awake: false, busy: false };
      const open: boolean = allHold(world, exit.requires);
      const intent = world.player.intent;
      return { shown: exitShown(world, exit), open, awake: open, busy: intent.type === 'travel' && intent.exit === exit.id };
    }
  }
  return { shown: false, open: false, awake: false, busy: false };
}

export function levelTarget(kind: MarkerKind, state: PlaceState, aimed: boolean, used: boolean): number {
  if (used || state.busy) return kind.levels.used;
  const rest: number = state.awake ? kind.levels.awake : kind.levels.dormant;
  return aimed ? rest + kind.levels.aimed - kind.levels.awake : rest;
}

export function facingYaw(place: Place): number {
  const towardCamera: number = (CAMERA.yawDegrees * Math.PI) / 180;
  return place.kind.facing === 'arrival' && place.facing !== null ? Math.atan2(place.facing.x, place.facing.z) : towardCamera;
}

function spring(value: number): Spring {
  return { value, velocity: 0, target: value };
}

function stoneColour(content: Content, kind: MarkerKind, zone: ZoneDef): Color {
  const surface: string | undefined = markerDressing(kind, zone)['stone'];
  const tint: string | undefined = surface === undefined ? undefined : content.surfaces.get(surface)?.tint;
  return new Color(tint ?? PLACE_MARKERS.stoneFallback);
}

function glowMaterial(name: string, colour: Color): MeshStandardMaterial {
  const crystal: boolean = name === 'crystal';
  const material: MeshStandardMaterial = new MeshStandardMaterial({ color: crystal ? PLACE_MARKERS.crystalBase : PLACE_MARKERS.glyphBase, roughness: crystal ? PLACE_MARKERS.crystalRoughness : PLACE_MARKERS.glyphRoughness, metalness: crystal ? PLACE_MARKERS.crystalMetalness : 0, emissive: colour, emissiveIntensity: 0, flatShading: crystal });
  material.name = name;
  return material;
}

function veilAspect(node: Object3D): number {
  const box: Box3 = new Box3();
  node.traverse((child: Object3D): void => {
    if (!(child instanceof Mesh) || !(child.geometry instanceof BufferGeometry)) return;
    child.geometry.computeBoundingBox();
    if (child.geometry.boundingBox !== null) box.union(child.geometry.boundingBox);
  });
  const size: Vector3 = box.getSize(new Vector3());
  const across: number = Math.max(size.x, size.z);
  return across <= 0 ? 1 : size.y / across;
}

function dressModel(model: GLTF, content: Content, zone: ZoneDef, kind: MarkerKind, root: Group): MarkerParts {
  const scene: Object3D = model.scene.clone(true);
  const colour: Color = new Color(kind.color);
  const glows: MeshStandardMaterial[] = [];
  const dress: Readonly<Record<string, string>> = markerDressing(kind, zone);
  const veilNode: Object3D | null = kind.veil === null ? null : (scene.getObjectByName(kind.veil.node) ?? null);
  const veil: PlaceVeil | null = kind.veil === null || veilNode === null ? null : createPlaceVeil(kind.veil, veilAspect(veilNode), stoneColour(content, kind, zone));
  const veiled: Set<Object3D> = new Set<Object3D>();
  if (veil !== null && veilNode !== null) {
    veilNode.traverse((child: Object3D): void => {
      if (!(child instanceof Mesh)) return;
      child.material = veil.material;
      child.castShadow = false;
      child.receiveShadow = false;
      veiled.add(child);
    });
  }
  scene.traverse((child: Object3D): void => {
    if (!(child instanceof Mesh) || veiled.has(child)) return;
    const source: unknown = child.material;
    if (!(source instanceof MeshStandardMaterial)) return;
    if (kind.glow.includes(source.name)) {
      const glow: MeshStandardMaterial = glowMaterial(source.name, colour);
      glows.push(glow);
      child.material = glow;
      child.castShadow = true;
      return;
    }
    const worn: Material = dressedProp(content, dress, source, propDressing(zone));
    child.material = worn;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  root.add(scene);
  const focal: Object3D | null = kind.focal === null ? null : (scene.getObjectByName(kind.focal.node) ?? null);
  const seal: Object3D | null = kind.seal === null ? null : (scene.getObjectByName(kind.seal.node) ?? null);
  return { glows, focal, focalRest: focal?.position.y ?? 0, seal, sealRest: seal?.position.y ?? 0, veil };
}

function poseParts(view: MarkerView, parts: MarkerParts, dt: number, time: number): void {
  const kind: MarkerKind = view.place.kind;
  const level: number = Math.max(0, view.level.value);
  for (const glow of parts.glows) glow.emissiveIntensity = level * PLACE_MARKERS.glow;
  if (parts.focal !== null && kind.focal !== null) {
    const rise: number = Math.min(1, Math.max(0, view.rise.value));
    view.spin += dt * kind.focal.spin * rise * Math.max(1, level);
    parts.focal.rotation.y = view.spin;
    parts.focal.position.y = parts.focalRest + kind.focal.lift * view.rise.value + kind.focal.bob * rise * Math.sin(time * PLACE_MARKERS.bobRate + view.root.position.x);
  }
  if (parts.seal !== null && kind.seal !== null) {
    const shut: number = Math.min(1, Math.max(0, view.shut.value));
    parts.seal.position.y = parts.sealRest - kind.seal.sink * (1 - view.shut.value);
    parts.seal.visible = shut > PLACE_MARKERS.gone;
  }
  if (parts.veil !== null) {
    parts.veil.uniforms.uStrength.value = level * Math.max(0, 1 - view.shut.value);
    parts.veil.uniforms.uTime.value = time;
  }
}

export function createPlaceMarkers(scene: Scene, loader: GLTFLoader, content: Content, zone: ZoneDef, world: World): PlaceMarkers {
  const group: Group = new Group();
  const lights: boolean = renderBudget().markerLights;
  let aimed: PlaceRef | null = null;
  const views: MarkerView[] = zonePlaces(content, zone).map((place: Place): MarkerView => {
    const state: PlaceState = placeState(world, place.ref);
    const root: Group = new Group();
    const ground: number = floorUp(place.x, 0, place.z);
    root.position.set(place.x, ground, place.z);
    root.rotation.y = facingYaw(place);
    if (place.kind.shadow > 0) {
      const shadow: Mesh = contactShadow();
      shadow.scale.setScalar(place.kind.shadow / CONTACT_SHADOW.radius);
      root.add(shadow);
    }
    const light: PointLight = new PointLight(new Color(place.kind.color), 0, place.kind.light.distance, PLACE_MARKERS.lightDecay);
    light.position.set(0, place.kind.light.height, 0);
    if (lights) root.add(light);
    group.add(root);
    const level: number = levelTarget(place.kind, state, false, false);
    return { place, root, ground, light, level: spring(level), rise: spring(state.awake ? 1 : 0), shut: spring(state.open ? 0 : 1), shown: spring(state.shown ? 1 : 0), parts: null, usedLeft: 0, spin: place.x * 0.37 + place.z * 0.61 };
  });
  scene.add(group);
  let disposed: boolean = false;
  const ready: Promise<void> = Promise.all(
    views.map(async (view: MarkerView): Promise<void> => {
      const model: GLTF = await loadModel(loader, view.place.kind.model);
      if (disposed) return;
      view.parts = dressModel(model, content, zone, view.place.kind, view.root);
      poseParts(view, view.parts, 0, 0);
    }),
  ).then((): void => undefined);

  return {
    ready,
    update(dt: number, time: number, current: World): void {
      for (const view of views) {
        const state: PlaceState = placeState(current, view.place.ref);
        view.usedLeft = Math.max(0, view.usedLeft - dt);
        springTo(view.level, levelTarget(view.place.kind, state, samePlace(aimed, view.place.ref), view.usedLeft > 0));
        springTo(view.rise, state.awake ? 1 : 0);
        springTo(view.shut, state.open ? 0 : 1);
        springTo(view.shown, state.shown ? 1 : 0);
        stepSpring(view.level, dt);
        stepSpring(view.rise, dt);
        stepSpring(view.shut, dt);
        stepSpring(view.shown, dt);
        const shown: number = Math.min(1, Math.max(0, view.shown.value));
        view.root.visible = shown > PLACE_MARKERS.gone;
        view.root.position.y = view.ground - PLACE_MARKERS.showDepth * (1 - view.shown.value);
        view.light.intensity = view.place.kind.light.intensity * Math.max(0, view.level.value) * shown;
        if (view.parts !== null) poseParts(view, view.parts, dt, time);
      }
    },
    aim(ref: PlaceRef | null): void {
      aimed = ref;
    },
    use(ref: PlaceRef): void {
      for (const view of views) if (samePlace(view.place.ref, ref)) view.usedLeft = PLACE_MARKERS.usedFor;
    },
    pick(ray: PickRay): PlaceRef | null {
      const columns: (readonly [PlaceRef, PickColumn])[] = [];
      for (const view of views) {
        if (view.place.ref.type === 'checkpoint' || view.shown.value < PLACE_MARKERS.shown) continue;
        columns.push([view.place.ref, { x: view.place.x, y: view.ground, z: view.place.z, radius: view.place.kind.pick.radius, height: view.place.kind.pick.height }]);
      }
      return nearestColumn(ray, columns);
    },
    dispose(): void {
      disposed = true;
      group.removeFromParent();
      for (const view of views) {
        view.light.dispose();
        for (const glow of view.parts?.glows ?? []) glow.dispose();
        view.parts?.veil?.material.dispose();
      }
    },
  };
}
