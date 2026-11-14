import type { AnimationClip, MeshStandardMaterial, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { AdditiveBlending, Box3, Color, DataTexture, Fog, LinearFilter, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, RGBAFormat, Scene, SkinnedMesh, Vector2, Vector3 } from 'three';
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
import { groundGeometry, valueNoise } from './lobby-ground.ts';
import { LOBBY_SCENERY, placeRocks } from './lobby-scenery.ts';
import { createLobbyShaft } from './lobby-shaft.ts';
import type { LobbyShaft } from './lobby-shaft.ts';
import { createLobbyLights } from './lobby-lights.ts';
import type { LobbyLights } from './lobby-lights.ts';
import { createLobbyMist } from './lobby-mist.ts';
import { bodyRoles, createLobbyLife } from './lobby-life.ts';
import type { BodyRoles, LobbyLife } from './lobby-life.ts';
import type { LobbyMist } from './lobby-mist.ts';
import { createLobbyOrbit, grab, LOBBY_ORBIT, orbitBy, release, stepOrbit, stepSpring, zoomBy } from './lobby-orbit.ts';
import type { LobbyOrbit, OrbitView, Spring } from './lobby-orbit.ts';

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
  groundWet: 0.12,
  groundShade: 0.6,
  groundRelief: 0.85,
  groundRadius: 14,
  groundSegments: 72,
  groundEdge: 0.06,
  mistDepths: [2.4, 0.9, -1.2, -2.6, -4.2, -6.2, -8.6, -11],
  mistWidth: 16,
  mistHeight: 2.2,
  mistLift: 0.32,
  mistColor: 0x8394b0,
  mistOpacity: 0.11,
  mistNearOpacity: 0.05,
  mistDrift: 0.1,
  mistTextureWide: 128,
  mistTextureTall: 48,
  mistWisps: 5.5,
  mistWispRise: 2.2,
  rootId: 'lobby',
  zoomProperty: '--lobby-zoom',
  footSamples: 16,
  soleClearance: 0.002,
  swapSpring: { freq: 1.8, damping: 1 },
  swapAt: 0.985,
  swapClear: 0.004,
  coverColor: 0x070a10,
  coverWide: 2.8,
  coverTall: 4.1,
  coverAhead: 1.2,
  coverHeight: 1.05,
  coverPlateau: 0.6,
  coverTextureSize: 64,
  coverOrder: 20,
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
  readonly rig: string;
}

export function coverShare(radius: number, plateau: number): number {
  const fall: number = Math.min(1, Math.max(0, (1 - radius) / (1 - plateau)));
  return fall * fall * (3 - 2 * fall);
}

export interface LobbyStage {
  dress(look: LobbyLook): void;
  render(renderer: WebGLRenderer, dt: number, tier: QualityName, devicePixelRatio: number): void;
  warm(renderer: WebGLRenderer, tier: QualityName): Promise<void>;
}

function coverTexture(): DataTexture {
  const size: number = LOBBY_STAGE.coverTextureSize;
  const data: Uint8Array = new Uint8Array(size * size * 4);
  for (let y: number = 0; y < size; y += 1) {
    for (let x: number = 0; x < size; x += 1) {
      const value: number = Math.round(coverShare(Math.hypot(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1), LOBBY_STAGE.coverPlateau) * 255);
      data.fill(value, (y * size + x) * 4, (y * size + x) * 4 + 3);
      data[(y * size + x) * 4 + 3] = 255;
    }
  }
  const texture: DataTexture = new DataTexture(data, size, size, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function coverMesh(): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const material: MeshBasicMaterial = new MeshBasicMaterial({ color: LOBBY_STAGE.coverColor, alphaMap: coverTexture(), transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false });
  const mesh: Mesh<PlaneGeometry, MeshBasicMaterial> = new Mesh(new PlaneGeometry(LOBBY_STAGE.coverWide, LOBBY_STAGE.coverTall), material);
  mesh.renderOrder = LOBBY_STAGE.coverOrder;
  mesh.visible = false;
  return mesh;
}

export function mistShare(across: number, up: number, wisp: number): number {
  const side: number = Math.max(0, 1 - Math.abs(across * 2 - 1) ** 2.4);
  const low: number = Math.max(0, 1 - up) ** 1.6 * Math.min(1, up * 9);
  const body: number = Math.min(1, Math.max(0, (wisp - 0.32) / 0.5));
  return side * low * body * body * (3 - 2 * body);
}

function mistTexture(): DataTexture {
  const wide: number = LOBBY_STAGE.mistTextureWide;
  const tall: number = LOBBY_STAGE.mistTextureTall;
  const data: Uint8Array = new Uint8Array(wide * tall * 4);
  for (let y: number = 0; y < tall; y += 1) {
    for (let x: number = 0; x < wide; x += 1) {
      const across: number = (x + 0.5) / wide;
      const up: number = (y + 0.5) / tall;
      const wisp: number = 0.6 * valueNoise(across * LOBBY_STAGE.mistWisps, up * LOBBY_STAGE.mistWispRise) + 0.4 * valueNoise(across * LOBBY_STAGE.mistWisps * 2.3 + 9, up * LOBBY_STAGE.mistWispRise * 2.1 + 4);
      const value: number = Math.round(mistShare(across, up, wisp) * 255);
      const at: number = (y * wide + x) * 4;
      data.fill(value, at, at + 3);
      data[at + 3] = 255;
    }
  }
  const texture: DataTexture = new DataTexture(data, wide, tall, RGBAFormat);
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
  const material: MeshBasicMaterial | MeshStandardMaterial = def === undefined ? new MeshBasicMaterial({ color: LOBBY_STAGE.background, vertexColors: true }) : quietGround(surfaceMaterial(def, 'ground', LOBBY_STAGE.groundWet));
  const mesh: Mesh = new Mesh(groundGeometry(LOBBY_SCENERY.rocks), material);
  mesh.receiveShadow = true;
  return mesh;
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

export type IdleSource = Pick<RigInstance, 'clips' | 'armed' | 'stance'>;

export function lobbyIdle(rig: IdleSource, weaponEquipped: boolean): AnimationClip {
  if (!weaponEquipped) return rig.clips.unarmed?.idle ?? rig.clips.idle;
  return rig.armed() ? (rig.stance()?.idle ?? rig.clips.idle) : rig.clips.idle;
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
  const shaft: LobbyShaft = createLobbyShaft();
  scene.add(shaft.mesh);

  scene.add(groundMesh(content.surfaces.get(LOBBY_STAGE.groundSurface)));

  const mistAlpha: DataTexture = mistTexture();
  const mists: Mesh<PlaneGeometry, MeshBasicMaterial>[] = LOBBY_STAGE.mistDepths.map((depth: number, layer: number): Mesh<PlaneGeometry, MeshBasicMaterial> => {
    const material: MeshBasicMaterial = new MeshBasicMaterial({ color: LOBBY_STAGE.mistColor, alphaMap: mistAlpha, transparent: true, opacity: depth > 0 ? LOBBY_STAGE.mistNearOpacity : LOBBY_STAGE.mistOpacity, depthWrite: false, blending: AdditiveBlending, fog: false });
    const mist: Mesh<PlaneGeometry, MeshBasicMaterial> = new Mesh(new PlaneGeometry(LOBBY_STAGE.mistWidth, LOBBY_STAGE.mistHeight), material);
    mist.position.set((random() - 0.5) * LOBBY_STAGE.mistWidth * 0.5, LOBBY_STAGE.mistHeight * 0.5 - LOBBY_STAGE.mistLift, depth);
    mist.scale.x = layer % 2 === 0 ? 1 : -1;
    scene.add(mist);
    return mist;
  });

  let hero: RigInstance | null = null;
  let heroKey: string = '';
  const rimGlow: Color = new Color(LOBBY_STAGE.rimGlow);
  const size: Vector2 = new Vector2();
  const toCamera: Vector3 = new Vector3();
  let pipeline: LobbyPipeline | null = null;
  let scenery: Promise<void> | null = null;
  let life: LobbyLife | null = null;
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

  const cover: Mesh<PlaneGeometry, MeshBasicMaterial> = coverMesh();
  scene.add(cover);
  const veil: Spring = { x: 0, v: 0 };
  let veiling: boolean = false;
  let wanted: LobbyLook | null = null;
  let shadowLaid: boolean = false;

  const stand = (rigId: string): RigInstance | null => {
    const loaded: LoadedRig | undefined = library.rigs.get(rigId);
    if (loaded === undefined) return null;
    if (hero !== null) {
      hero.root.removeFromParent();
      hero.dispose();
    }
    const made: RigInstance = instantiateRig(loaded, library, { tint: content.player.tint, glow: content.player.color, ghost: null, feather: true });
    made.root.rotation.y = LOBBY_STAGE.facing;
    castShadows(made.root);
    const roles: BodyRoles = bodyRoles(loaded.def.bodyParts);
    life = createLobbyLife(made.root, random(), roles);
    if (!shadowLaid) scene.add(contactShadow());
    shadowLaid = true;
    scene.add(made.root);
    hero = made;
    heroKey = '';
    return made;
  };

  const wear = (rig: RigInstance, look: LobbyLook): void => {
    const worn: Look = lookOf(content, look.rig, heroBase(content, look.rig), look.equipped);
    const lookKey: string = `${look.rig}#${worn.wearables.join('|')}#${worn.held.join('|')}#${library.wearables.size}`;
    if (lookKey === heroKey) return;
    heroKey = lookKey;
    rig.setWear(worn.wearables, worn.hidden);
    rig.setGear(worn.held);
    castShadows(rig.root);
    rig.mixer.stopAllAction();
    const clip: AnimationClip = lobbyIdle(rig, look.equipped.weapon !== null);
    rig.mixer.clipAction(clip).play();
    plantFeet(rig, clip);
  };

  const dress = (look: LobbyLook): void => {
    wanted = look;
    if (hero === null) {
      const made: RigInstance | null = stand(look.rig);
      if (made !== null) wear(made, look);
      return;
    }
    if (hero.def.id !== look.rig) {
      veiling = library.rigs.has(look.rig);
      return;
    }
    veiling = false;
    wear(hero, look);
  };

  const stepVeil = (dt: number): void => {
    const covered: number = Math.min(1, Math.max(0, stepSpring(veil, veiling ? 1 : 0, LOBBY_STAGE.swapSpring.freq, LOBBY_STAGE.swapSpring.damping, dt)));
    if (veiling && covered >= LOBBY_STAGE.swapAt && wanted !== null) {
      const made: RigInstance | null = stand(wanted.rig);
      if (made !== null) wear(made, wanted);
      veiling = false;
    }
    cover.visible = covered > LOBBY_STAGE.swapClear;
    cover.material.opacity = covered;
    cover.quaternion.copy(camera.quaternion);
    cover.position.set(0, LOBBY_STAGE.coverHeight, 0).addScaledVector(toCamera.copy(camera.position).setY(LOBBY_STAGE.coverHeight).normalize(), LOBBY_STAGE.coverAhead);
  };

  return {
    dress,
    render(renderer: WebGLRenderer, dt: number, tier: QualityName, devicePixelRatio: number): void {
      lights.step(dt);
      mists.forEach((mist: Mesh<PlaneGeometry, MeshBasicMaterial>, index: number): void => {
        mist.position.x += LOBBY_STAGE.mistDrift * dt * (index % 2 === 0 ? 1 : -1) * (1 + index * 0.12);
        if (Math.abs(mist.position.x) > LOBBY_STAGE.mistWidth * 0.5) mist.position.x = -mist.position.x * 0.9;
        mist.rotation.y = Math.atan2(camera.position.x - mist.position.x, camera.position.z - mist.position.z);
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
      stepVeil(dt);
      document.getElementById(LOBBY_STAGE.rootId)?.style.setProperty(LOBBY_STAGE.zoomProperty, view.zoom.toFixed(3));
      camera.lookAt(0, view.lookHeight, 0);
      renderer.getSize(size);
      if (size.x <= 0 || size.y <= 0) return;
      camera.aspect = size.x / size.y;
      const framing: Framing = lobbyFraming(size.x, size.y);
      camera.zoom = framing.zoom;
      camera.setViewOffset(size.x, size.y, (0.5 - framing.across) * size.x, framing.down * size.y, size.x, size.y);
      camera.updateProjectionMatrix();
      shaft.step(dt, camera);
      sky.draw(renderer, dt, size.x, size.y, devicePixelRatio);
      RIM_LIGHT.value.copy(rimGlow);
      pipeline ??= createLobbyPipeline(renderer, scene, camera);
      pipeline.render(tier, devicePixelRatio);
    },
    async warm(renderer: WebGLRenderer, tier: QualityName): Promise<void> {
      if (hero === null && wanted !== null) dress(wanted);
      scenery ??= placeRocks(loader, content, scene);
      await scenery;
      pipeline ??= createLobbyPipeline(renderer, scene, camera);
      await pipeline.compile(tier);
    },
  };
}
