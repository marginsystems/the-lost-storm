import type { AnimationClip, MeshStandardMaterial, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { AdditiveBlending, Box3, BufferAttribute, BufferGeometry, CircleGeometry, Color, DataTexture, Fog, LinearFilter, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, RGBAFormat, Scene, SkinnedMesh, Vector2 } from 'three';
import type { Object3D } from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Content, SurfaceDef } from '../../sim/content/types.ts';
import type { Look } from '../../sim/wear.ts';
import { heroBase, lookOf } from '../../sim/wear.ts';
import type { Equipment } from '../../sim/world/types.ts';
import { instantiateRig, RIM_LIGHT } from '../render/character-loader.ts';
import type { CharacterLibrary, LoadedRig, RigInstance } from '../render/character-loader.ts';
import { contactShadow } from '../render/contact-shadow.ts';
import { surfaceMaterial } from '../render/surfaces.ts';
import type { QualityName } from '../mobile/quality.ts';
import { createLobbyPipeline } from './lobby-render.ts';
import type { LobbyPipeline } from './lobby-render.ts';
import { placeRocks } from './lobby-scenery.ts';
import { createLobbyLights } from './lobby-lights.ts';
import type { LobbyLights } from './lobby-lights.ts';
import { createLobbyMist } from './lobby-mist.ts';
import { bodyRoles, boneNamed, createLobbyLife } from './lobby-life.ts';
import type { BodyRoles, LobbyLife } from './lobby-life.ts';
import type { LobbyMist } from './lobby-mist.ts';
import { createLobbyOrbit, grab, LOBBY_ORBIT, orbitBy, release, stepOrbit, zoomBy } from './lobby-orbit.ts';
import type { LobbyOrbit, OrbitView } from './lobby-orbit.ts';

export const LOBBY_STAGE = {
  background: 0x05070b,
  fogNear: 10,
  fogFar: 23,
  fov: 18,
  cameraHeight: 1.4,
  cameraDistance: 10.2,
  lookHeight: 0.98,
  near: 0.1,
  far: 40,
  facing: -0.34,
  rimGlow: 0x000000,
  groundSurface: 'black_rock',
  groundWet: 0.3,
  groundShade: 0.6,
  groundRelief: 0.8,
  groundRadius: 14,
  groundSegments: 72,
  groundEdge: 0.06,
  rainDrops: 520,
  rainWide: 9,
  rainDeep: 12,
  rainBack: 9,
  rainTop: 4.2,
  rainSpeed: 8.5,
  rainLength: 0.34,
  rainSlant: 0.08,
  rainColor: 0x9aa8c2,
  rainOpacity: 0.22,
  mistLayers: 4,
  mistWidth: 18,
  mistHeight: 2.6,
  mistColor: 0x7a879c,
  mistOpacity: 0.045,
  mistDrift: 0.12,
  mistFirstDepth: -1.6,
  mistDepthStep: -1.4,
  mistTextureSize: 64,
  rootId: 'lobby',
  zoomProperty: '--lobby-zoom',
  footSamples: 16,
  soleClearance: 0.002,
} as const;

export const LOBBY_ORBIT_UI: string = '.lobby-sheet, .lobby-ladder, .lobby-dock, #title, button, a, input, select, textarea, [role="dialog"]:not(#lobby)';

export const LOBBY_FRAMING = {
  wide: { across: 0.66, down: -0.01, zoom: 1.2 },
  tall: { across: 0.5, down: 0.2, zoom: 0.68 },
  tallBelow: 0.8,
} as const;

export interface Framing {
  readonly across: number;
  readonly down: number;
  readonly zoom: number;
}

export function lobbyFraming(width: number, height: number): Framing {
  if (width <= 0 || height <= 0) return LOBBY_FRAMING.wide;
  return width / height < LOBBY_FRAMING.tallBelow ? LOBBY_FRAMING.tall : LOBBY_FRAMING.wide;
}

export interface LobbyLook {
  readonly equipped: Equipment;
}

export interface LobbyStage {
  dress(look: LobbyLook): void;
  render(renderer: WebGLRenderer, dt: number, tier: QualityName, devicePixelRatio: number): void;
  warm(renderer: WebGLRenderer, tier: QualityName): Promise<void>;
}

interface RainLayer {
  readonly lines: LineSegments;
  readonly heights: Float32Array;
}

function mistTexture(): DataTexture {
  const size: number = LOBBY_STAGE.mistTextureSize;
  const data: Uint8Array = new Uint8Array(size * size * 4);
  for (let y: number = 0; y < size; y += 1) {
    for (let x: number = 0; x < size; x += 1) {
      const dx: number = ((x + 0.5) / size) * 2 - 1;
      const dy: number = ((y + 0.5) / size) * 2 - 1;
      const fall: number = Math.max(0, 1 - Math.hypot(dx, dy * 1.4));
      const value: number = Math.round(fall * fall * (3 - 2 * fall) * 255);
      const at: number = (y * size + x) * 4;
      data[at] = value;
      data[at + 1] = value;
      data[at + 2] = value;
      data[at + 3] = 255;
    }
  }
  const texture: DataTexture = new DataTexture(data, size, size, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function castShadows(root: Object3D): void {
  root.traverse((node: Object3D): void => {
    if (node instanceof Mesh && node.material instanceof MeshBasicMaterial) return;
    node.castShadow = true;
  });
}

function quietGround(shared: MeshStandardMaterial): MeshStandardMaterial {
  const material: MeshStandardMaterial = shared.clone();
  material.color.multiplyScalar(LOBBY_STAGE.groundShade);
  material.normalScale.multiplyScalar(LOBBY_STAGE.groundRelief);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void => {
    shared.onBeforeCompile(shader, renderer);
  };
  material.customProgramCacheKey = (): string => shared.customProgramCacheKey();
  return material;
}

function groundMesh(def: SurfaceDef | undefined): Mesh {
  const geometry: CircleGeometry = new CircleGeometry(LOBBY_STAGE.groundRadius, LOBBY_STAGE.groundSegments);
  geometry.rotateX(-Math.PI / 2);
  const positions: BufferAttribute | ReturnType<BufferGeometry['getAttribute']> = geometry.getAttribute('position');
  const colours: Float32Array = new Float32Array(positions.count * 3);
  for (let index: number = 0; index < positions.count; index += 1) {
    const reach: number = Math.hypot(positions.getX(index), positions.getZ(index)) / LOBBY_STAGE.groundRadius;
    const shade: number = LOBBY_STAGE.groundEdge + (1 - LOBBY_STAGE.groundEdge) * Math.max(0, 1 - reach * reach);
    colours.set([shade, shade, shade], index * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  const material: MeshBasicMaterial | MeshStandardMaterial = def === undefined ? new MeshBasicMaterial({ color: LOBBY_STAGE.background, vertexColors: true }) : quietGround(surfaceMaterial(def, 'ground', LOBBY_STAGE.groundWet));
  const mesh: Mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function rainLayer(random: () => number): RainLayer {
  const count: number = LOBBY_STAGE.rainDrops;
  const positions: Float32Array = new Float32Array(count * 6);
  const heights: Float32Array = new Float32Array(count);
  for (let drop: number = 0; drop < count; drop += 1) {
    const x: number = (random() - 0.5) * LOBBY_STAGE.rainWide;
    const z: number = random() * LOBBY_STAGE.rainDeep - LOBBY_STAGE.rainBack;
    heights[drop] = random() * LOBBY_STAGE.rainTop;
    positions.set([x, 0, z, x + LOBBY_STAGE.rainSlant, 0, z], drop * 6);
  }
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material: LineBasicMaterial = new LineBasicMaterial({ color: LOBBY_STAGE.rainColor, transparent: true, opacity: LOBBY_STAGE.rainOpacity, depthWrite: false });
  const lines: LineSegments = new LineSegments(geometry, material);
  lines.frustumCulled = false;
  return { lines, heights };
}

function stepRain(layer: RainLayer, dt: number): void {
  const attribute = layer.lines.geometry.getAttribute('position');
  if (!(attribute instanceof BufferAttribute)) return;
  const positions: Float32Array | ArrayLike<number> = attribute.array;
  if (!(positions instanceof Float32Array)) return;
  for (let drop: number = 0; drop < layer.heights.length; drop += 1) {
    let height: number = (layer.heights[drop] ?? 0) - LOBBY_STAGE.rainSpeed * dt;
    if (height < 0) height += LOBBY_STAGE.rainTop;
    layer.heights[drop] = height;
    positions[drop * 6 + 1] = height + LOBBY_STAGE.rainLength;
    positions[drop * 6 + 4] = height;
  }
  attribute.needsUpdate = true;
}

export function floorLift(lows: readonly number[], clearance: number): number {
  if (lows.length === 0) return 0;
  return clearance - Math.min(...lows);
}

function lowestPoint(root: Object3D): number {
  root.updateMatrixWorld(true);
  const box: Box3 = new Box3();
  let lowest: number = Number.POSITIVE_INFINITY;
  root.traverseVisible((node: Object3D): void => {
    if (!(node instanceof SkinnedMesh)) return;
    node.computeBoundingBox();
    box.copy(node.boundingBox).applyMatrix4(node.matrixWorld);
    lowest = Math.min(lowest, box.min.y);
  });
  return lowest;
}

function idleClip(rig: RigInstance, equipped: Equipment): AnimationClip {
  return equipped.weapon === null ? (rig.clips.unarmed?.idle ?? rig.clips.idle) : (rig.stance()?.idle ?? rig.clips.idle);
}

function fromStage(event: Event): boolean {
  return !(event.target instanceof Element && event.target.closest(LOBBY_ORBIT_UI) !== null);
}

function take(event: Event): void {
  event.stopImmediatePropagation();
}

export function createLobbyStage(content: Content, library: CharacterLibrary, loader: GLTFLoader, random: () => number = Math.random): LobbyStage {
  const scene: Scene = new Scene();
  scene.fog = new Fog(LOBBY_STAGE.background, LOBBY_STAGE.fogNear, LOBBY_STAGE.fogFar);
  const sky: LobbyMist = createLobbyMist();
  scene.background = sky.texture;
  const camera: PerspectiveCamera = new PerspectiveCamera(LOBBY_STAGE.fov, 1, LOBBY_STAGE.near, LOBBY_STAGE.far);
  camera.position.set(0, LOBBY_STAGE.cameraHeight, LOBBY_STAGE.cameraDistance);
  camera.lookAt(0, LOBBY_STAGE.lookHeight, 0);

  const lights: LobbyLights = createLobbyLights(scene);

  scene.add(groundMesh(content.surfaces.get(LOBBY_STAGE.groundSurface)));
  const rain: RainLayer = rainLayer(random);
  scene.add(rain.lines);

  const mistMaterial: MeshBasicMaterial = new MeshBasicMaterial({ color: LOBBY_STAGE.mistColor, alphaMap: mistTexture(), transparent: true, opacity: LOBBY_STAGE.mistOpacity, depthWrite: false, blending: AdditiveBlending });
  const mists: Mesh[] = [];
  for (let layer: number = 0; layer < LOBBY_STAGE.mistLayers; layer += 1) {
    const mist: Mesh = new Mesh(new PlaneGeometry(LOBBY_STAGE.mistWidth, LOBBY_STAGE.mistHeight), mistMaterial);
    mist.position.set((random() - 0.5) * LOBBY_STAGE.mistWidth * 0.5, LOBBY_STAGE.mistHeight * 0.3, LOBBY_STAGE.mistFirstDepth + LOBBY_STAGE.mistDepthStep * layer);
    scene.add(mist);
    mists.push(mist);
  }

  let hero: RigInstance | null = null;
  let heroKey: string = '';
  const rimGlow: Color = new Color(LOBBY_STAGE.rimGlow);
  const size: Vector2 = new Vector2();
  let pipeline: LobbyPipeline | null = null;
  let scenery: Promise<void> | null = null;
  let life: LobbyLife | null = null;
  let head: Object3D | null = null;
  const orbit: LobbyOrbit = createLobbyOrbit();
  let drawnAt: number = Number.NEGATIVE_INFINITY;
  let listening: boolean = false;
  const pointers: Map<number, { x: number; y: number; t: number }> = new Map<number, { x: number; y: number; t: number }>();
  const active = (): boolean => performance.now() - drawnAt < LOBBY_ORBIT.activeWithinMs;
  const spread = (): number => {
    const [first, second] = [...pointers.values()];
    return first === undefined || second === undefined ? 0 : Math.hypot(first.x - second.x, first.y - second.y);
  };
  const lift = (event: PointerEvent): void => {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size === 0) release(orbit);
    take(event);
  };
  const listen = (target: Window): void => {
    if (listening) return;
    listening = true;
    target.addEventListener('pointerdown', (event: PointerEvent): void => {
      if (!active() || !fromStage(event)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, t: event.timeStamp });
      if (pointers.size === 1) grab(orbit);
      take(event);
    }, { capture: true });
    target.addEventListener('pointermove', (event: PointerEvent): void => {
      const last: { x: number; y: number; t: number } | undefined = pointers.get(event.pointerId);
      if (last === undefined || !active()) return;
      const before: number = spread();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, t: event.timeStamp });
      if (pointers.size === 1) orbitBy(orbit, event.clientX - last.x, event.clientY - last.y, Math.max(0, (event.timeStamp - last.t) / 1000));
      else if (before > 0) zoomBy(orbit, (spread() - before) * LOBBY_ORBIT.zoomPerWheelPixel * 2);
      take(event);
    }, { capture: true });
    target.addEventListener('pointerup', lift, { capture: true });
    target.addEventListener('pointercancel', lift, { capture: true });
    target.addEventListener('wheel', (event: WheelEvent): void => {
      if (!active() || !fromStage(event)) return;
      zoomBy(orbit, -event.deltaY * LOBBY_ORBIT.zoomPerWheelPixel);
      take(event);
    }, { capture: true, passive: true });
  };

  const plantFeet = (rig: RigInstance, clip: AnimationClip): void => {
    const action = rig.mixer.clipAction(clip);
    rig.root.position.y = 0;
    const lows: number[] = [];
    for (let sample: number = 0; sample < LOBBY_STAGE.footSamples; sample += 1) {
      action.time = (clip.duration * sample) / LOBBY_STAGE.footSamples;
      rig.mixer.update(0);
      const low: number = lowestPoint(rig.root);
      if (Number.isFinite(low)) lows.push(low);
    }
    action.time = 0;
    rig.root.position.y = floorLift(lows, LOBBY_STAGE.soleClearance);
  };

  const build = (): RigInstance | null => {
    if (hero !== null) return hero;
    const loaded: LoadedRig | undefined = library.rigs.get(content.player.rig);
    if (loaded === undefined) return null;
    const made: RigInstance = instantiateRig(loaded, library, { tint: content.player.tint, glow: content.player.color, ghost: null, feather: true });
    made.root.rotation.y = LOBBY_STAGE.facing;
    castShadows(made.root);
    const roles: BodyRoles = bodyRoles(loaded.def.bodyParts);
    life = createLobbyLife(made.root, random(), roles);
    head = boneNamed(made.root, roles.head);
    scene.add(contactShadow());
    scene.add(made.root);
    hero = made;
    return made;
  };

  return {
    dress(look: LobbyLook): void {
      const rig: RigInstance | null = build();
      if (rig === null) return;
      const worn: Look = lookOf(content, content.player.rig, heroBase(content), look.equipped);
      const lookKey: string = `${worn.wearables.join('|')}#${worn.held.join('|')}#${library.wearables.size}`;
      if (lookKey === heroKey) return;
      heroKey = lookKey;
      rig.setWear(worn.wearables, worn.hidden);
      rig.setGear(worn.held);
      castShadows(rig.root);
      rig.mixer.stopAllAction();
      const clip: AnimationClip = idleClip(rig, look.equipped);
      rig.mixer.clipAction(clip).play();
      plantFeet(rig, clip);
    },
    render(renderer: WebGLRenderer, dt: number, tier: QualityName, devicePixelRatio: number): void {
      lights.step(dt);
      stepRain(rain, dt);
      mists.forEach((mist: Mesh, index: number): void => {
        mist.position.x += LOBBY_STAGE.mistDrift * dt * (index % 2 === 0 ? 1 : -1);
        if (Math.abs(mist.position.x) > LOBBY_STAGE.mistWidth * 0.5) mist.position.x = -mist.position.x * 0.9;
      });
      if (hero !== null) {
        hero.mixer.update(dt);
        life?.step(dt);
        hero.stepWear(dt);
        hero.root.rotation.y = LOBBY_STAGE.facing;
      }
      listen(window);
      drawnAt = performance.now();
      const view: OrbitView = stepOrbit(orbit, dt);
      camera.position.set(view.x, view.y, view.z);
      document.getElementById(LOBBY_STAGE.rootId)?.style.setProperty(LOBBY_STAGE.zoomProperty, view.zoom.toFixed(3));
      camera.lookAt(0, view.lookHeight, 0);
      renderer.getSize(size);
      if (size.x <= 0 || size.y <= 0) return;
      camera.aspect = size.x / size.y;
      const framing: Framing = lobbyFraming(size.x, size.y);
      camera.zoom = framing.zoom;
      camera.setViewOffset(size.x, size.y, (0.5 - framing.across) * size.x, framing.down * size.y, size.x, size.y);
      camera.updateProjectionMatrix();
      sky.draw(renderer, dt, size.x, size.y, devicePixelRatio, camera, head);
      RIM_LIGHT.value.copy(rimGlow);
      pipeline ??= createLobbyPipeline(renderer, scene, camera);
      pipeline.render(tier, devicePixelRatio);
    },
    async warm(renderer: WebGLRenderer, tier: QualityName): Promise<void> {
      build();
      scenery ??= placeRocks(loader, content, scene);
      await scenery;
      pipeline ??= createLobbyPipeline(renderer, scene, camera);
      await pipeline.compile(tier);
    },
  };
}
