import type { Material, Matrix4, Object3D, WebGLRenderTarget } from 'three';
import { ACESFilmicToneMapping, Box3, BufferAttribute, BufferGeometry, Color, InterleavedBufferAttribute, DirectionalLight, Group, Mesh, MeshStandardMaterial, OrthographicCamera, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Timers } from '../backend/backend.ts';
import { wearKey } from '../../sim/wear.ts';
import type { CharacterLibrary, LoadedWearable } from './character-loader.ts';

export const THUMBNAIL = {
  size: 128,
  padding: 0.1,
  diagonal: -Math.PI / 4,
  turn: 0.45,
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

export type ItemThumbnails = ReadonlyMap<string, string>;

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

function encode(canvas: HTMLCanvasElement): Promise<string | null> {
  return new Promise<string | null>((resolve: (url: string | null) => void): void => {
    canvas.toBlob((blob: Blob | null): void => {
      resolve(blob === null ? null : URL.createObjectURL(blob));
    }, 'image/png');
  });
}

export function wornImageKey(wearableId: string): string {
  return `worn:${wearableId}`;
}

function pose(template: Object3D): Group {
  const model: Object3D = template.clone(true);
  const turned: Group = new Group();
  turned.rotation.y = THUMBNAIL.turn;
  turned.add(model);
  const diagonal: Group = new Group();
  diagonal.rotation.z = THUMBNAIL.diagonal;
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

function framing(wearable: LoadedWearable): (posed: Group) => Box3 {
  let frame: (posed: Group) => Box3 = oneSleeve;
  switch (wearable.def.region) {
    case 'hands':
      frame = oneGlove;
      break;
    case 'chest':
      frame = trunk;
      break;
    case 'head':
    case 'shoulders':
    case 'arms':
    case 'legs':
    case 'feet':
      break;
  }
  return frame;
}

export async function createItemThumbnails(library: CharacterLibrary, frame: string, wearableIds: readonly string[], skinTint: string, timers: Timers): Promise<ItemThumbnails> {
  const renderer: WebGLRenderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(THUMBNAIL.size, THUMBNAIL.size, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = THUMBNAIL.exposure;

  const scene: Scene = new Scene();
  const generator: PMREMGenerator = new PMREMGenerator(renderer);
  const room: RoomEnvironment = new RoomEnvironment();
  const reflections: WebGLRenderTarget = generator.fromScene(room, THUMBNAIL.environmentBlur);
  scene.environment = reflections.texture;
  scene.environmentIntensity = THUMBNAIL.environment;
  const key: DirectionalLight = new DirectionalLight(THUMBNAIL.keyColor, THUMBNAIL.keyIntensity);
  key.position.set(THUMBNAIL.keyX, THUMBNAIL.keyY, THUMBNAIL.keyZ);
  const fill: DirectionalLight = new DirectionalLight(THUMBNAIL.fillColor, THUMBNAIL.fillIntensity);
  fill.position.set(THUMBNAIL.fillX, THUMBNAIL.fillY, THUMBNAIL.fillZ);
  scene.add(key, fill);

  const camera: OrthographicCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, THUMBNAIL.distance * 2);
  camera.position.set(0, 0, THUMBNAIL.distance);

  const made: Made = { materials: [], geometries: [] };
  const shots: Shot[] = [...library.attachments.values()].map((attachment): Shot => ({ name: attachment.def.id, posed: pose(attachment.template), frame: boundsOf }));
  for (const id of wearableIds) {
    const wearable: LoadedWearable | undefined = library.wearables.get(wearKey(frame, id));
    if (wearable !== undefined) shots.push({ name: wornImageKey(id), posed: dressed(wearable, skinTint, made), frame: framing(wearable) });
  }

  for (const shot of shots) scene.add(shot.posed);
  await renderer.compileAsync(scene, camera).catch((): Object3D => scene);
  for (const shot of shots) shot.posed.removeFromParent();

  const images: Map<string, string> = new Map<string, string>();
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
    renderer.render(scene, camera);
    const encoded: Promise<string | null> = encode(renderer.domElement);
    posed.removeFromParent();
    const url: string | null = await encoded;
    if (url !== null) images.set(shot.name, url);
  });
  for (const material of made.materials) material.dispose();
  for (const geometry of made.geometries) geometry.dispose();

  reflections.dispose();
  room.dispose();
  generator.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return images;
}
