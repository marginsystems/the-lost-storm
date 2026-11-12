import type { Material, Object3D, WebGLRenderTarget } from 'three';
import { ACESFilmicToneMapping, Box3, Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, OrthographicCamera, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Timers } from '../backend/backend.ts';
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

function dressed(wearable: LoadedWearable, made: Material[]): Group {
  const turned: Group = new Group();
  turned.rotation.set(THUMBNAIL.wornTilt, THUMBNAIL.wornTurn, 0);
  for (const piece of wearable.pieces) {
    if (!(piece.material instanceof MeshStandardMaterial)) continue;
    const material: MeshStandardMaterial = piece.material.clone();
    material.color.multiply(new Color(wearable.def.tint));
    made.push(material);
    turned.add(new Mesh(piece.geometry, material));
  }
  const upright: Group = new Group();
  upright.add(turned);
  return upright;
}

function boundsOf(posed: Group): Box3 {
  posed.updateMatrixWorld(true);
  return new Box3().setFromObject(posed, true);
}

function oneSleeve(posed: Group): Box3 {
  const whole: Box3 = boundsOf(posed);
  const size: Vector3 = whole.getSize(new Vector3());
  if (size.x < size.y * THUMBNAIL.wideFrom) return whole;
  const half: Box3 = new Box3(new Vector3(whole.getCenter(new Vector3()).x, whole.min.y, whole.min.z), whole.max.clone());
  posed.rotation.z = -THUMBNAIL.diagonal;
  posed.updateMatrixWorld(true);
  return half.applyMatrix4(posed.matrixWorld);
}

export async function createItemThumbnails(library: CharacterLibrary, wearableIds: readonly string[], timers: Timers): Promise<ItemThumbnails> {
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

  const made: Material[] = [];
  const shots: Shot[] = [...library.attachments.values()].map((attachment): Shot => ({ name: attachment.def.id, posed: pose(attachment.template), frame: boundsOf }));
  for (const id of wearableIds) {
    const wearable: LoadedWearable | undefined = library.wearables.get(id);
    if (wearable !== undefined) shots.push({ name: wornImageKey(id), posed: dressed(wearable, made), frame: oneSleeve });
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
  for (const material of made) material.dispose();

  reflections.dispose();
  room.dispose();
  generator.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return images;
}
