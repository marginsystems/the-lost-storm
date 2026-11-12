import type { AnimationClip, WebGLRenderer } from 'three';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CircleGeometry, Color, DataTexture, DirectionalLight, DodecahedronGeometry, Fog, HemisphereLight, LinearFilter, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, RGBAFormat, Scene, Vector2 } from 'three';
import type { Content, SurfaceDef } from '../../sim/content/types.ts';
import type { Look } from '../../sim/wear.ts';
import { lookOf } from '../../sim/wear.ts';
import type { Equipment } from '../../sim/world/types.ts';
import { instantiateRig, RIM_LIGHT } from '../render/character-loader.ts';
import type { CharacterLibrary, LoadedRig, RigInstance } from '../render/character-loader.ts';
import { contactShadow } from '../render/contact-shadow.ts';
import { surfaceMaterial } from '../render/surfaces.ts';

export const LOBBY_STAGE = {
  background: 0x05070b,
  fogNear: 7,
  fogFar: 17,
  fov: 24,
  cameraHeight: 1.32,
  cameraDistance: 8.8,
  lookHeight: 0.95,
  near: 0.1,
  far: 40,
  facing: 0.32,
  sway: 0.05,
  swayRate: 0.21,
  drift: 0.07,
  driftRate: 0.067,
  skyColor: 0x7d8aa3,
  groundColor: 0x090a0d,
  skyIntensity: 0.55,
  keyColor: 0xf1e4d2,
  keyIntensity: 2.6,
  keyAt: [2.6, 3.8, 3.6],
  rimColor: 0x86a8ff,
  rimIntensity: 6.5,
  rimAt: [-2.2, 3.1, -4.6],
  rimGlow: 0x3a4f80,
  groundSurface: 'black_rock',
  groundWet: 0.35,
  groundRock: 'black_ledge',
  rocks: [
    [-3.4, -4.2, 1.3, 0.9],
    [-5.8, -7.5, 2.2, 1.4],
    [3.6, -5.2, 1.6, 1.1],
    [6.4, -9, 2.6, 1.8],
    [-1.2, -10.5, 2, 1.2],
    [1.9, -3.1, 0.55, 0.35],
  ],
  rockSquash: 0.62,
  groundRadius: 7.5,
  groundSegments: 56,
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
  mistLayers: 3,
  mistWidth: 11,
  mistHeight: 2.6,
  mistColor: 0x7a879c,
  mistOpacity: 0.09,
  mistDrift: 0.12,
  mistFirstDepth: -1.6,
  mistDepthStep: -1.4,
  mistTextureSize: 64,
} as const;

export const LOBBY_FRAMING = {
  wide: { across: 0.5, down: 0, zoom: 1 },
  tall: { across: 0.5, down: 0.2, zoom: 0.78 },
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
  render(renderer: WebGLRenderer, dt: number): void;
  warm(renderer: WebGLRenderer): Promise<void>;
  enter(): void;
  leave(): void;
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
  const material: MeshBasicMaterial | ReturnType<typeof surfaceMaterial> = def === undefined ? new MeshBasicMaterial({ color: LOBBY_STAGE.background, vertexColors: true }) : surfaceMaterial(def, 'ground', LOBBY_STAGE.groundWet);
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

export function createLobbyStage(content: Content, library: CharacterLibrary, random: () => number = Math.random): LobbyStage {
  const scene: Scene = new Scene();
  scene.background = new Color(LOBBY_STAGE.background);
  scene.fog = new Fog(LOBBY_STAGE.background, LOBBY_STAGE.fogNear, LOBBY_STAGE.fogFar);
  const camera: PerspectiveCamera = new PerspectiveCamera(LOBBY_STAGE.fov, 1, LOBBY_STAGE.near, LOBBY_STAGE.far);
  camera.position.set(0, LOBBY_STAGE.cameraHeight, LOBBY_STAGE.cameraDistance);
  camera.lookAt(0, LOBBY_STAGE.lookHeight, 0);

  scene.add(new HemisphereLight(LOBBY_STAGE.skyColor, LOBBY_STAGE.groundColor, LOBBY_STAGE.skyIntensity));
  const key: DirectionalLight = new DirectionalLight(LOBBY_STAGE.keyColor, LOBBY_STAGE.keyIntensity);
  key.position.set(LOBBY_STAGE.keyAt[0], LOBBY_STAGE.keyAt[1], LOBBY_STAGE.keyAt[2]);
  scene.add(key);
  const rim: DirectionalLight = new DirectionalLight(LOBBY_STAGE.rimColor, LOBBY_STAGE.rimIntensity);
  rim.position.set(LOBBY_STAGE.rimAt[0], LOBBY_STAGE.rimAt[1], LOBBY_STAGE.rimAt[2]);
  scene.add(rim);

  scene.add(groundMesh(content.surfaces.get(LOBBY_STAGE.groundSurface)));
  const rockDef: SurfaceDef | undefined = content.surfaces.get(LOBBY_STAGE.groundRock);
  const rockMaterial: MeshBasicMaterial | ReturnType<typeof surfaceMaterial> = rockDef === undefined ? new MeshBasicMaterial({ color: LOBBY_STAGE.background }) : surfaceMaterial(rockDef, 'solid', LOBBY_STAGE.groundWet);
  for (const [x, z, size, height] of LOBBY_STAGE.rocks) {
    const rock: Mesh = new Mesh(new DodecahedronGeometry(size, 0), rockMaterial);
    rock.position.set(x, height * LOBBY_STAGE.rockSquash * 0.4, z);
    rock.scale.set(1, (height / size) * LOBBY_STAGE.rockSquash, 1);
    rock.rotation.set(random(), random() * Math.PI, random() * 0.4);
    scene.add(rock);
  }
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
  const savedRim: Color = new Color();
  const rimGlow: Color = new Color(LOBBY_STAGE.rimGlow);
  const size: Vector2 = new Vector2();

  const build = (): RigInstance | null => {
    if (hero !== null) return hero;
    const loaded: LoadedRig | undefined = library.rigs.get(content.player.rig);
    if (loaded === undefined) return null;
    const made: RigInstance = instantiateRig(loaded, library, { tint: content.player.tint, glow: content.player.color, ghost: null });
    made.root.rotation.y = LOBBY_STAGE.facing;
    made.root.add(contactShadow());
    scene.add(made.root);
    hero = made;
    return made;
  };

  return {
    dress(look: LobbyLook): void {
      const rig: RigInstance | null = build();
      if (rig === null) return;
      const worn: Look = lookOf(content, [], look.equipped);
      const lookKey: string = `${worn.wearables.join('|')}#${worn.held.join('|')}#${library.wearables.size}`;
      if (lookKey === heroKey) return;
      heroKey = lookKey;
      rig.setWear(worn.wearables, worn.hidden);
      rig.setGear(worn.held);
      rig.mixer.stopAllAction();
      rig.mixer.clipAction(idleClip(rig, look.equipped)).play();
    },
    render(renderer: WebGLRenderer, dt: number): void {
      time += dt;
      stepRain(rain, dt);
      mists.forEach((mist: Mesh, index: number): void => {
        mist.position.x += LOBBY_STAGE.mistDrift * dt * (index % 2 === 0 ? 1 : -1);
        if (Math.abs(mist.position.x) > LOBBY_STAGE.mistWidth * 0.5) mist.position.x = -mist.position.x * 0.9;
      });
      if (hero !== null) {
        hero.mixer.update(dt);
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
      renderer.render(scene, camera);
    },
    warm(renderer: WebGLRenderer): Promise<void> {
      build();
      return renderer.compileAsync(scene, camera).then((): void => undefined);
    },
    enter(): void {
      savedRim.copy(RIM_LIGHT.value);
      RIM_LIGHT.value.copy(rimGlow);
    },
    leave(): void {
      RIM_LIGHT.value.copy(savedRim);
    },
  };
}
