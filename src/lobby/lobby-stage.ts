import type { AnimationClip, MeshStandardMaterial, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CircleGeometry, Color, DataTexture, Fog, HemisphereLight, LinearFilter, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, RGBAFormat, Scene, SpotLight, Vector2 } from 'three';
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
import { poseBones, settlePose, turnPose } from './lobby-pose.ts';
import type { PosedBone, PoseTurn } from './lobby-pose.ts';
import { placeRocks } from './lobby-scenery.ts';

export const LOBBY_STAGE = {
  background: 0x05070b,
  haze: 0x343c49,
  fogNear: 10,
  fogFar: 23,
  fov: 18,
  cameraHeight: 1.4,
  cameraDistance: 10.2,
  lookHeight: 0.98,
  near: 0.1,
  far: 40,
  facing: 0.32,
  sway: 0.05,
  swayRate: 0.21,
  drift: 0.07,
  driftRate: 0.067,
  skyColor: 0x5d6574,
  groundColor: 0x08090b,
  skyIntensity: 0.28,
  keyColor: 0xf3e6d4,
  keyIntensity: 3.4,
  keyAt: [1.9, 3.3, 4.6],
  keyAim: [0, 1.3, 0],
  keyAngle: 0.3,
  keyPenumbra: 0.9,
  shadowSize: 2048,
  shadowRadius: 5,
  shadowBias: -0.0004,
  shadowNormalBias: 0.02,
  shadowNear: 2,
  shadowFar: 12,
  rimColor: 0x7d93c4,
  rimIntensity: 1.2,
  rimAt: [-1.4, 2.2, -4.8],
  rimAim: [0, 1.6, 0],
  rimAngle: 0.3,
  rimPenumbra: 1,
  rimGlow: 0x000000,
  poolColor: 0xf3e6d4,
  poolIntensity: 4.5,
  poolAt: [0.4, 6, 1.2],
  poolAim: [0, 0, 0.15],
  poolAngle: 0.2,
  poolPenumbra: 1,
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
  backdropDepth: -16,
  backdropWidth: 80,
  backdropHeight: 26,
  backdropFloor: -2,
  hazeTop: 0.6,
  hazeSize: 128,
} as const;

export const LOBBY_POSE: readonly PoseTurn[] = [
  ['DEF-upper_arm.L', 0, 0, -12],
  ['DEF-upper_arm.R', 0, 0, 12],
  ['DEF-thigh.L', 0, 0, 5],
  ['DEF-thigh.R', 0, 0, -5],
];

export const LOBBY_FRAMING = {
  wide: { across: 0.5, down: 0, zoom: 1 },
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

function hazeTexture(): DataTexture {
  const size: number = LOBBY_STAGE.hazeSize;
  const data: Uint8Array = new Uint8Array(size * 4);
  for (let row: number = 0; row < size; row += 1) {
    const rise: number = Math.min(1, (row + 0.5) / size / LOBBY_STAGE.hazeTop);
    const value: number = Math.round((1 - rise * rise * (3 - 2 * rise)) * 255);
    data.set([value, value, value, 255], row * 4);
  }
  const texture: DataTexture = new DataTexture(data, 1, size, RGBAFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function backdrop(): Mesh {
  const material: MeshBasicMaterial = new MeshBasicMaterial({ color: LOBBY_STAGE.haze, alphaMap: hazeTexture(), transparent: true, depthWrite: false, fog: false });
  const mesh: Mesh = new Mesh(new PlaneGeometry(LOBBY_STAGE.backdropWidth, LOBBY_STAGE.backdropHeight), material);
  mesh.position.set(0, LOBBY_STAGE.backdropFloor + LOBBY_STAGE.backdropHeight / 2, LOBBY_STAGE.backdropDepth);
  mesh.renderOrder = -1;
  return mesh;
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

function idleClip(rig: RigInstance, equipped: Equipment): AnimationClip {
  return equipped.weapon === null ? (rig.clips.unarmed?.idle ?? rig.clips.idle) : rig.clips.idle;
}

export function createLobbyStage(content: Content, library: CharacterLibrary, loader: GLTFLoader, random: () => number = Math.random): LobbyStage {
  const scene: Scene = new Scene();
  scene.background = new Color(LOBBY_STAGE.background);
  scene.fog = new Fog(LOBBY_STAGE.haze, LOBBY_STAGE.fogNear, LOBBY_STAGE.fogFar);
  scene.add(backdrop());
  const camera: PerspectiveCamera = new PerspectiveCamera(LOBBY_STAGE.fov, 1, LOBBY_STAGE.near, LOBBY_STAGE.far);
  camera.position.set(0, LOBBY_STAGE.cameraHeight, LOBBY_STAGE.cameraDistance);
  camera.lookAt(0, LOBBY_STAGE.lookHeight, 0);

  scene.add(new HemisphereLight(LOBBY_STAGE.skyColor, LOBBY_STAGE.groundColor, LOBBY_STAGE.skyIntensity));
  const key: SpotLight = new SpotLight(LOBBY_STAGE.keyColor, LOBBY_STAGE.keyIntensity, 0, LOBBY_STAGE.keyAngle, LOBBY_STAGE.keyPenumbra, 0);
  key.position.set(LOBBY_STAGE.keyAt[0], LOBBY_STAGE.keyAt[1], LOBBY_STAGE.keyAt[2]);
  key.target.position.set(LOBBY_STAGE.keyAim[0], LOBBY_STAGE.keyAim[1], LOBBY_STAGE.keyAim[2]);
  key.castShadow = true;
  key.shadow.mapSize.set(LOBBY_STAGE.shadowSize, LOBBY_STAGE.shadowSize);
  key.shadow.radius = LOBBY_STAGE.shadowRadius;
  key.shadow.bias = LOBBY_STAGE.shadowBias;
  key.shadow.normalBias = LOBBY_STAGE.shadowNormalBias;
  key.shadow.camera.near = LOBBY_STAGE.shadowNear;
  key.shadow.camera.far = LOBBY_STAGE.shadowFar;
  scene.add(key);
  scene.add(key.target);
  const rim: SpotLight = new SpotLight(LOBBY_STAGE.rimColor, LOBBY_STAGE.rimIntensity, 0, LOBBY_STAGE.rimAngle, LOBBY_STAGE.rimPenumbra, 0);
  rim.position.set(LOBBY_STAGE.rimAt[0], LOBBY_STAGE.rimAt[1], LOBBY_STAGE.rimAt[2]);
  rim.target.position.set(LOBBY_STAGE.rimAim[0], LOBBY_STAGE.rimAim[1], LOBBY_STAGE.rimAim[2]);
  scene.add(rim);
  scene.add(rim.target);
  const pool: SpotLight = new SpotLight(LOBBY_STAGE.poolColor, LOBBY_STAGE.poolIntensity, 0, LOBBY_STAGE.poolAngle, LOBBY_STAGE.poolPenumbra, 0);
  pool.position.set(LOBBY_STAGE.poolAt[0], LOBBY_STAGE.poolAt[1], LOBBY_STAGE.poolAt[2]);
  pool.target.position.set(LOBBY_STAGE.poolAim[0], LOBBY_STAGE.poolAim[1], LOBBY_STAGE.poolAim[2]);
  scene.add(pool);
  scene.add(pool.target);

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
  let time: number = 0;
  const rimGlow: Color = new Color(LOBBY_STAGE.rimGlow);
  const size: Vector2 = new Vector2();
  let pipeline: LobbyPipeline | null = null;
  let scenery: Promise<void> | null = null;
  let posed: readonly PosedBone[] = [];

  const build = (): RigInstance | null => {
    if (hero !== null) return hero;
    const loaded: LoadedRig | undefined = library.rigs.get(content.player.rig);
    if (loaded === undefined) return null;
    const made: RigInstance = instantiateRig(loaded, library, { tint: content.player.tint, glow: content.player.color, ghost: null, feather: true });
    made.root.rotation.y = LOBBY_STAGE.facing;
    castShadows(made.root);
    posed = poseBones(made.root, LOBBY_POSE);
    made.root.add(contactShadow());
    scene.add(made.root);
    hero = made;
    return made;
  };

  return {
    dress(look: LobbyLook): void {
      const rig: RigInstance | null = build();
      if (rig === null) return;
      const worn: Look = lookOf(content, heroBase(content), look.equipped);
      const lookKey: string = `${worn.wearables.join('|')}#${worn.held.join('|')}#${library.wearables.size}`;
      if (lookKey === heroKey) return;
      heroKey = lookKey;
      rig.setWear(worn.wearables, worn.hidden);
      rig.setGear(worn.held);
      castShadows(rig.root);
      rig.mixer.stopAllAction();
      rig.mixer.clipAction(idleClip(rig, look.equipped)).play();
    },
    render(renderer: WebGLRenderer, dt: number, tier: QualityName, devicePixelRatio: number): void {
      time += dt;
      stepRain(rain, dt);
      mists.forEach((mist: Mesh, index: number): void => {
        mist.position.x += LOBBY_STAGE.mistDrift * dt * (index % 2 === 0 ? 1 : -1);
        if (Math.abs(mist.position.x) > LOBBY_STAGE.mistWidth * 0.5) mist.position.x = -mist.position.x * 0.9;
      });
      if (hero !== null) {
        settlePose(posed);
        hero.mixer.update(dt);
        hero.relaxHands();
        turnPose(posed);
        hero.stepWear(dt);
        hero.root.rotation.y = LOBBY_STAGE.facing + Math.sin(time * LOBBY_STAGE.swayRate) * LOBBY_STAGE.sway + Math.sin(time * LOBBY_STAGE.driftRate) * LOBBY_STAGE.drift;
      }
      renderer.getSize(size);
      if (size.x <= 0 || size.y <= 0) return;
      camera.aspect = size.x / size.y;
      const framing: Framing = lobbyFraming(size.x, size.y);
      camera.zoom = framing.zoom;
      camera.setViewOffset(size.x, size.y, (0.5 - framing.across) * size.x, framing.down * size.y, size.x, size.y);
      camera.updateProjectionMatrix();
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
