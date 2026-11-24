import type { AnimationClip, Material, Matrix4, Object3D, Texture, WebGLRenderTarget } from 'three';
import { ACESFilmicToneMapping, Box3, BufferAttribute, BufferGeometry, Color, InterleavedBufferAttribute, DirectionalLight, Group, Mesh, MeshStandardMaterial, OrthographicCamera, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Timers } from '../backend/backend.ts';
import { GPU } from '../gpu-release.ts';
import { wearKey } from '../../sim/wear.ts';
import type { Picture } from '../../sim/pictures.ts';
import type { PictureView } from '../../sim/content/types.ts';
import type { Look } from '../../sim/wear.ts';
import type { CharacterLibrary, LoadedAttachment, LoadedRig, LoadedWearable, RigInstance } from './character-loader.ts';
import { instantiateRig } from './character-loader.ts';
import type { Keepsake } from './keepsake.ts';
import { createKeepsake } from './keepsake.ts';
import { KEEPSAKE_MODELS } from './keepsake-models.ts';
import type { FramePacer } from './paced-work.ts';
import { browserPacer } from './paced-work.ts';
import { texturesOf, uploadPaced } from './warm-up.ts';
import { readPixelsLater, straightRows } from './pixel-readback.ts';
import { encodePng } from './png.ts';

export const THUMBNAIL = {
  size: 128,
  padding: 0.1,
  diagonal: -Math.PI / 4,
  turn: 0.45,
  aboveLie: Math.PI / 2 - 0.35,
  aboveRoll: Math.PI / 4,
  exposure: 1.1,
  environment: 0.55,
  environmentBlur: 0.04,
  distance: 20,
  keyColor: 0xfff0dc,
  keyIntensity: 3.4,
  keyX: -3,
  keyY: 4,
  keyZ: 5,
  fillColor: 0x8fb4ff,
  fillIntensity: 1.6,
  fillX: 4,
  fillY: -1.5,
  fillZ: 3,
  wornTurn: -0.5,
  wornTilt: 0.12,
  headTilt: 0.42,
  headTurn: 0.5,
  charmTilt: 0.18,
  charmTurn: -0.25,
  charmShare: 0.22,
  wideFrom: 2,
  sleeveLift: Math.PI / 2,
  sleeveHang: -Math.PI / 2,
  handShare: 0.24,
  trunkWide: 0.92,
  gloveFrom: 0.12,
  gloveRaise: Math.PI / 2,
  gloveTurn: 1.05,
  gloveLean: -0.32,
  gloveUnder: 0.2,
  skinMaterial: 'skin',
  gapMs: 0,
} as const;

export const PORTRAIT = {
  width: 480,
  height: 720,
  facing: -0.34,
  padding: 0.06,
} as const;

export const STUDIO_CANVAS = {
  width: Math.max(THUMBNAIL.size, PORTRAIT.width),
  height: Math.max(THUMBNAIL.size, PORTRAIT.height),
} as const;

export interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function viewportRegion(canvasHeight: number, width: number, height: number): Region {
  return { x: 0, y: canvasHeight - height, width, height };
}

export type ItemThumbnails = ReadonlyMap<string, string>;

export interface PortraitLook {
  readonly tint: string;
  readonly glow: string;
}

interface Shot {
  readonly name: string;
  readonly posed: Group;
  readonly frame: (model: Group) => Box3;
}

export function oneAtATime<T>(items: readonly T[], timers: Timers, ms: number, work: (item: T) => Promise<void>): Promise<void> {
  return items.reduce(
    (previous: Promise<void>, item: T): Promise<void> =>
      previous
        .then((): Promise<void> => new Promise<void>((resolve: () => void): void => {
          timers.after(ms, resolve);
        }))
        .then((): Promise<void> => work(item)),
    Promise.resolve(),
  );
}

async function encodePixels(pixels: Uint8Array, width: number, height: number): Promise<string | null> {
  try {
    return URL.createObjectURL(await encodePng(straightRows(pixels, width, height), width, height));
  } catch {
    return null;
  }
}

function pose(template: Object3D, view: PictureView): Group {
  const model: Object3D = template.clone(true);
  const turned: Group = new Group();
  const diagonal: Group = new Group();
  switch (view) {
    case 'side':
      turned.rotation.y = THUMBNAIL.turn;
      diagonal.rotation.z = THUMBNAIL.diagonal;
      break;
    case 'above':
      turned.rotation.x = THUMBNAIL.aboveLie;
      diagonal.rotation.z = THUMBNAIL.aboveRoll;
      break;
  }
  turned.add(model);
  diagonal.add(turned);
  return diagonal;
}

function side(geometry: BufferGeometry): { readonly from: number; readonly inner: number; readonly outer: number } | null {
  const positions: unknown = geometry.getAttribute('position');
  if (!(positions instanceof BufferAttribute) && !(positions instanceof InterleavedBufferAttribute)) return null;
  let least: number = Infinity;
  let most: number = -Infinity;
  for (let index: number = 0; index < positions.count; index += 1) {
    least = Math.min(least, positions.getX(index));
    most = Math.max(most, positions.getX(index));
  }
  if (most <= least) return null;
  const from: number = (least + most) / 2 + ((most - least) / 2) * THUMBNAIL.gloveFrom;
  let inner: number = most;
  for (let index: number = 0; index < positions.count; index += 1) {
    const x: number = positions.getX(index);
    if (x >= from) inner = Math.min(inner, x);
  }
  return { from, inner, outer: most };
}

export function beyond(geometry: BufferGeometry, cut: number): BufferGeometry {
  const flat: BufferGeometry = geometry.index === null ? geometry.clone() : geometry.toNonIndexed();
  const positions: unknown = flat.getAttribute('position');
  const kept: BufferGeometry = new BufferGeometry();
  if (!(positions instanceof BufferAttribute)) {
    flat.dispose();
    return kept;
  }
  const corners: number[] = [];
  for (let corner: number = 0; corner + 2 < positions.count; corner += 3) {
    if (positions.getX(corner) >= cut && positions.getX(corner + 1) >= cut && positions.getX(corner + 2) >= cut) corners.push(corner, corner + 1, corner + 2);
  }
  for (const name of ['position', 'normal', 'uv']) {
    const source: unknown = flat.getAttribute(name);
    if (!(source instanceof BufferAttribute)) continue;
    const values: Float32Array = new Float32Array(corners.length * source.itemSize);
    corners.forEach((corner: number, index: number): void => {
      for (let part: number = 0; part < source.itemSize; part += 1) values[index * source.itemSize + part] = source.getComponent(corner, part);
    });
    kept.setAttribute(name, new BufferAttribute(values, source.itemSize));
  }
  flat.dispose();
  return kept;
}

interface Made {
  readonly materials: Material[];
  readonly geometries: BufferGeometry[];
}

function tinted(source: MeshStandardMaterial, tint: string, made: Made): MeshStandardMaterial {
  const material: MeshStandardMaterial = source.clone();
  material.color.multiply(new Color(tint));
  made.materials.push(material);
  return material;
}

function dressed(wearable: LoadedWearable, skinTint: string, made: Made): Group {
  const glove: boolean = wearable.def.region === 'hands';
  const turned: Group = new Group();
  if (glove) turned.rotation.set(0, 0, THUMBNAIL.gloveRaise);
  else if (wearable.def.region === 'head') turned.rotation.set(THUMBNAIL.headTilt, THUMBNAIL.headTurn, 0);
  else if (wearable.def.region === 'neck') turned.rotation.set(THUMBNAIL.charmTilt, THUMBNAIL.charmTurn, 0);
  else turned.rotation.set(THUMBNAIL.wornTilt, THUMBNAIL.wornTurn, 0);
  let cuff: { readonly from: number; readonly inner: number; readonly outer: number } | null = null;
  for (const piece of wearable.pieces) {
    if (!(piece.material instanceof MeshStandardMaterial)) continue;
    cuff ??= side(piece.geometry);
    turned.add(new Mesh(piece.geometry, tinted(piece.material, wearable.def.tint, made)));
  }
  if (cuff !== null) {
    const cut: number = cuff.outer - (cuff.outer - cuff.inner) * THUMBNAIL.gloveUnder;
    for (const piece of wearable.iconWith) {
      if (!(piece.material instanceof MeshStandardMaterial)) continue;
      const hand: BufferGeometry = beyond(piece.geometry, cut);
      made.geometries.push(hand);
      turned.add(new Mesh(hand, tinted(piece.material, piece.material.name === THUMBNAIL.skinMaterial ? skinTint : wearable.def.tint, made)));
    }
  }
  const upright: Group = new Group();
  if (glove) upright.rotation.set(0, THUMBNAIL.gloveTurn, THUMBNAIL.gloveLean, 'ZYX');
  upright.add(turned);
  return upright;
}

function boundsOf(posed: Group): Box3 {
  posed.updateMatrixWorld(true);
  return new Box3().setFromObject(posed, true);
}

function outerPoints(posed: Group, from: number): Vector3[] {
  const points: Vector3[] = [];
  posed.updateMatrixWorld(true);
  posed.traverse((node: Object3D): void => {
    if (!(node instanceof Mesh)) return;
    const geometry: unknown = node.geometry;
    if (!(geometry instanceof BufferGeometry)) return;
    const positions: unknown = geometry.getAttribute('position');
    if (!(positions instanceof BufferAttribute) && !(positions instanceof InterleavedBufferAttribute)) return;
    for (let index: number = 0; index < positions.count; index += 1) {
      const point: Vector3 = new Vector3().fromBufferAttribute(positions, index).applyMatrix4(node.matrixWorld);
      if (point.x >= from) points.push(point);
    }
  });
  return points;
}

function oneSleeve(posed: Group): Box3 {
  const whole: Box3 = boundsOf(posed);
  const size: Vector3 = whole.getSize(new Vector3());
  if (size.x < size.y * THUMBNAIL.wideFrom) return whole;
  const points: Vector3[] = outerPoints(posed, whole.max.x - (whole.max.x - whole.getCenter(new Vector3()).x) * THUMBNAIL.handShare);
  if (points.length === 0) return whole;
  const before: Matrix4 = posed.matrixWorld.clone().invert();
  posed.rotation.set(THUMBNAIL.sleeveLift, 0, THUMBNAIL.sleeveHang, 'ZYX');
  posed.updateMatrixWorld(true);
  const turn: Matrix4 = posed.matrixWorld.clone().multiply(before);
  return new Box3().setFromPoints(points.map((point: Vector3): Vector3 => point.applyMatrix4(turn)));
}

export function trunk(posed: Group): Box3 {
  const whole: Box3 = boundsOf(posed);
  const size: Vector3 = whole.getSize(new Vector3());
  if (size.x < size.y * THUMBNAIL.wideFrom) return whole;
  const middle: number = whole.getCenter(new Vector3()).x;
  const half: number = (size.y * THUMBNAIL.trunkWide) / 2;
  return new Box3(new Vector3(middle - half, whole.min.y, whole.min.z), new Vector3(middle + half, whole.max.y, whole.max.z));
}

function eachVertex(posed: Group, visit: (local: Vector3, placed: Matrix4) => void): void {
  const point: Vector3 = new Vector3();
  posed.traverse((node: Object3D): void => {
    if (!(node instanceof Mesh)) return;
    const geometry: unknown = node.geometry;
    if (!(geometry instanceof BufferGeometry)) return;
    const positions: unknown = geometry.getAttribute('position');
    if (!(positions instanceof BufferAttribute) && !(positions instanceof InterleavedBufferAttribute)) return;
    for (let index: number = 0; index < positions.count; index += 1) visit(point.fromBufferAttribute(positions, index), node.matrixWorld);
  });
}

export function oneGlove(posed: Group): Box3 {
  posed.updateMatrixWorld(true);
  const modelled: Box3 = new Box3();
  eachVertex(posed, (local: Vector3): void => {
    modelled.expandByPoint(local);
  });
  if (modelled.isEmpty()) return boundsOf(posed);
  const from: number = modelled.getCenter(new Vector3()).x + (modelled.max.x - modelled.min.x) * 0.5 * THUMBNAIL.gloveFrom;
  const box: Box3 = new Box3();
  eachVertex(posed, (local: Vector3, placed: Matrix4): void => {
    if (local.x >= from) box.expandByPoint(local.applyMatrix4(placed));
  });
  return box.isEmpty() ? boundsOf(posed) : box;
}

export function hanging(posed: Group): Box3 {
  const whole: Box3 = boundsOf(posed);
  const below: number = whole.min.y + (whole.max.y - whole.min.y) * THUMBNAIL.charmShare;
  const box: Box3 = new Box3();
  eachVertex(posed, (local: Vector3, placed: Matrix4): void => {
    const point: Vector3 = local.clone().applyMatrix4(placed);
    if (point.y <= below) box.expandByPoint(point);
  });
  return box.isEmpty() ? whole : box;
}

function framing(wearable: LoadedWearable): (posed: Group) => Box3 {
  let frame: (posed: Group) => Box3 = oneSleeve;
  switch (wearable.def.region) {
    case 'hands':
      frame = oneGlove;
      break;
    case 'chest':
      frame = trunk;
      break;
    case 'hair':
    case 'head':
      frame = boundsOf;
      break;
    case 'neck':
      frame = hanging;
      break;
    case 'shoulders':
    case 'arms':
    case 'legs':
    case 'feet':
      break;
  }
  return frame;
}

const BOOK_SHOT = {
  lie: 0.72,
  turn: -0.55,
  roll: -0.22,
} as const;

function bookPose(keepsake: Keepsake): Group {
  const upright: Group = new Group();
  upright.rotation.set(Math.PI / 2 - BOOK_SHOT.lie, 0, 0);
  upright.add(keepsake.group);
  const turned: Group = new Group();
  turned.rotation.y = BOOK_SHOT.turn;
  turned.add(upright);
  const rolled: Group = new Group();
  rolled.rotation.z = BOOK_SHOT.roll;
  rolled.add(turned);
  return rolled;
}

export interface Turntable {
  draw(angle: number, target: HTMLCanvasElement): boolean;
  dispose(): void;
}

export interface ThumbnailStudio {
  paint(frame: string, pictures: readonly Picture[]): Promise<ItemThumbnails>;
  turntable(rig: LoadedRig, look: Look, colours: PortraitLook): Promise<Turntable | null>;
  warm(): void;
  dispose(): void;
}

function standingIdle(rig: RigInstance): AnimationClip {
  if (rig.armed()) return rig.stance()?.idle ?? rig.clips.idle;
  return rig.clips.unarmed?.idle ?? rig.clips.idle;
}

function fit(camera: OrthographicCamera, size: Vector3, width: number, height: number, padding: number): void {
  const aspect: number = width / height;
  const halfHeight: number = Math.max(size.y / 2, size.x / 2 / aspect) * (1 + padding);
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

export function turnWidth(size: Vector3): number {
  return Math.hypot(size.x, size.z);
}

interface Studio {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: OrthographicCamera;
  readonly environment: Texture;
  readonly uploaded: WeakMap<Texture, number>;
  readonly close: () => void;
}

function framed(renderer: WebGLRenderer, width: number, height: number): Region {
  const canvas: HTMLCanvasElement = renderer.domElement;
  if (canvas.width !== STUDIO_CANVAS.width || canvas.height !== STUDIO_CANVAS.height) renderer.setSize(STUDIO_CANVAS.width, STUDIO_CANVAS.height, false);
  renderer.setViewport(0, 0, width, height);
  return viewportRegion(canvas.height, width, height);
}

function copyRegion(source: HTMLCanvasElement, region: Region, target: HTMLCanvasElement): boolean {
  if (target.width !== region.width || target.height !== region.height) {
    target.width = region.width;
    target.height = region.height;
  }
  const context: CanvasRenderingContext2D | null = target.getContext('2d');
  if (context === null) return false;
  context.clearRect(0, 0, region.width, region.height);
  context.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
  return true;
}

function litScene(environment: Texture): Scene {
  const scene: Scene = new Scene();
  scene.environment = environment;
  scene.environmentIntensity = THUMBNAIL.environment;
  const key: DirectionalLight = new DirectionalLight(THUMBNAIL.keyColor, THUMBNAIL.keyIntensity);
  key.position.set(THUMBNAIL.keyX, THUMBNAIL.keyY, THUMBNAIL.keyZ);
  const fill: DirectionalLight = new DirectionalLight(THUMBNAIL.fillColor, THUMBNAIL.fillIntensity);
  fill.position.set(THUMBNAIL.fillX, THUMBNAIL.fillY, THUMBNAIL.fillZ);
  scene.add(key, fill);
  return scene;
}

function studioCamera(): OrthographicCamera {
  const camera: OrthographicCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, THUMBNAIL.distance * 2);
  camera.position.set(0, 0, THUMBNAIL.distance);
  return camera;
}

function openStudio(): Studio {
  const renderer: WebGLRenderer = new WebGLRenderer({ alpha: true, antialias: true });
  const letGo: () => void = GPU.hold((): void => renderer.forceContextLoss());
  renderer.setPixelRatio(1);
  renderer.setSize(STUDIO_CANVAS.width, STUDIO_CANVAS.height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = THUMBNAIL.exposure;

  const generator: PMREMGenerator = new PMREMGenerator(renderer);
  const room: RoomEnvironment = new RoomEnvironment();
  const reflections: WebGLRenderTarget = generator.fromScene(room, THUMBNAIL.environmentBlur);
  return {
    renderer,
    scene: litScene(reflections.texture),
    camera: studioCamera(),
    environment: reflections.texture,
    uploaded: new WeakMap<Texture, number>(),
    close: (): void => {
      reflections.dispose();
      room.dispose();
      generator.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      letGo();
    },
  };
}

export function createThumbnailStudio(library: CharacterLibrary, skinTint: string, timers: Timers, pacer: FramePacer = browserPacer()): ThumbnailStudio {
  let studio: Studio | null = null;
  let closed: boolean = false;
  let line: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
    const next: Promise<T> = line.then(work);
    line = next.catch((): null => null);
    return next;
  };
  const shotFor = (frame: string, picture: Picture, made: Made, keepsakes: Keepsake[]): Shot | null => {
    const { source } = picture;
    let shot: Shot | null = null;
    switch (source.kind) {
      case 'held': {
        const attachment: LoadedAttachment | undefined = library.attachments.get(source.attachment);
        if (attachment !== undefined) shot = { name: picture.key, posed: pose(attachment.template, attachment.def.view), frame: boundsOf };
        break;
      }
      case 'worn': {
        const wearable: LoadedWearable | undefined = library.wearables.get(wearKey(frame, source.piece));
        if (wearable !== undefined) shot = { name: picture.key, posed: dressed(wearable, skinTint, made), frame: framing(wearable) };
        break;
      }
      case 'book': {
        const keepsake: Keepsake = createKeepsake();
        keepsakes.push(keepsake);
        shot = { name: picture.key, posed: bookPose(keepsake), frame: boundsOf };
        break;
      }
      case 'keepsake': {
        const build: (() => Keepsake) | undefined = KEEPSAKE_MODELS.get(source.model);
        if (build === undefined) break;
        const keepsake: Keepsake = build();
        keepsakes.push(keepsake);
        shot = { name: picture.key, posed: keepsake.group, frame: boundsOf };
        break;
      }
      case 'none':
        break;
    }
    return shot;
  };
  const mount = async (rig: LoadedRig, look: Look, colours: PortraitLook): Promise<Turntable | null> => {
    if (closed) return null;
    studio ??= openStudio();
    const stage: Scene = litScene(studio.environment);
    const camera: OrthographicCamera = studioCamera();
    const made: RigInstance = instantiateRig(rig, library, { tint: colours.tint, glow: colours.glow, ghost: null, feather: false });
    made.setWear(look.wearables, look.hidden);
    made.setGear(look.held);
    made.mixer.clipAction(standingIdle(made)).play();
    made.mixer.update(0);
    const spin: Group = new Group();
    spin.add(made.root);
    stage.add(spin);
    spin.updateMatrixWorld(true);
    const bounds: Box3 = new Box3().setFromObject(made.root, true);
    made.root.position.sub(bounds.getCenter(new Vector3()));
    const size: Vector3 = bounds.getSize(new Vector3());
    fit(camera, new Vector3(turnWidth(size), size.y, size.z), PORTRAIT.width, PORTRAIT.height, PORTRAIT.padding);
    const open: Studio = studio;
    await open.renderer.compileAsync(stage, camera).catch((): Object3D => stage);
    await uploadPaced(open.renderer, texturesOf(stage), open.uploaded, pacer);
    let gone: boolean = false;
    return {
      draw(angle: number, target: HTMLCanvasElement): boolean {
        if (gone || studio === null) return false;
        const { renderer } = studio;
        spin.rotation.y = PORTRAIT.facing + angle;
        const region: Region = framed(renderer, PORTRAIT.width, PORTRAIT.height);
        renderer.render(stage, camera);
        return copyRegion(renderer.domElement, region, target);
      },
      dispose(): void {
        if (gone) return;
        gone = true;
        spin.removeFromParent();
        made.dispose();
      },
    };
  };
  const paint = async (frame: string, pictures: readonly Picture[]): Promise<ItemThumbnails> => {
    const images: Map<string, string> = new Map<string, string>();
    if (closed || pictures.length === 0) return images;
    studio ??= openStudio();
    const { renderer, scene, camera, uploaded } = studio;
    const made: Made = { materials: [], geometries: [] };
    const keepsakes: Keepsake[] = [];
    const shots: Shot[] = [];
    for (const picture of pictures) {
      const shot: Shot | null = shotFor(frame, picture, made, keepsakes);
      if (shot !== null) shots.push(shot);
    }

    for (const shot of shots) scene.add(shot.posed);
    await renderer.compileAsync(scene, camera).catch((): Object3D => scene);
    const textures: Texture[] = texturesOf(scene);
    for (const shot of shots) shot.posed.removeFromParent();
    await uploadPaced(renderer, textures, uploaded, pacer);

    await oneAtATime(shots, timers, THUMBNAIL.gapMs, async (shot: Shot): Promise<void> => {
      const { posed } = shot;
      scene.add(posed);
      const bounds: Box3 = shot.frame(posed);
      posed.position.sub(bounds.getCenter(new Vector3()));
      const size: Vector3 = bounds.getSize(new Vector3());
      const half: number = (Math.max(size.x, size.y) / 2) * (1 + THUMBNAIL.padding);
      camera.left = -half;
      camera.right = half;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
      framed(renderer, THUMBNAIL.size, THUMBNAIL.size);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      const gl: WebGLRenderingContext | WebGL2RenderingContext = renderer.getContext();
      const read: Promise<Uint8Array | null> = gl instanceof WebGL2RenderingContext ? readPixelsLater(gl, { x: 0, y: 0, width: THUMBNAIL.size, height: THUMBNAIL.size }, pacer) : Promise.resolve(null);
      posed.removeFromParent();
      const pixels: Uint8Array | null = await read;
      const url: string | null = pixels === null ? null : await encodePixels(pixels, THUMBNAIL.size, THUMBNAIL.size);
      if (url !== null) images.set(shot.name, url);
    });
    for (const material of made.materials) material.dispose();
    for (const geometry of made.geometries) geometry.dispose();
    for (const keepsake of keepsakes) keepsake.dispose();
    return images;
  };
  return {
    paint(frame: string, pictures: readonly Picture[]): Promise<ItemThumbnails> {
      return inTurn((): Promise<ItemThumbnails> => paint(frame, pictures));
    },
    turntable(rig: LoadedRig, look: Look, colours: PortraitLook): Promise<Turntable | null> {
      return inTurn((): Promise<Turntable | null> => mount(rig, look, colours));
    },
    warm(): void {
      if (!closed) studio ??= openStudio();
    },
    dispose(): void {
      closed = true;
      studio?.close();
      studio = null;
    },
  };
}
