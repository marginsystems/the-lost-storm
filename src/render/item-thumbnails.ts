import type { Material, Object3D, WebGLRenderTarget } from 'three';
import { ACESFilmicToneMapping, Box3, Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, OrthographicCamera, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
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
} as const;

export type ItemThumbnails = ReadonlyMap<string, string>;

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

export function createItemThumbnails(library: CharacterLibrary, wearableIds: readonly string[]): ItemThumbnails {
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

  const images: Map<string, string> = new Map<string, string>();
  const shoot = (name: string, posed: Group, frame: (model: Group) => Box3): void => {
    scene.add(posed);
    const bounds: Box3 = frame(posed);
    posed.position.sub(bounds.getCenter(new Vector3()));
    const size: Vector3 = bounds.getSize(new Vector3());
    const half: number = (Math.max(size.x, size.y) / 2) * (1 + THUMBNAIL.padding);
    camera.left = -half;
    camera.right = half;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    images.set(name, renderer.domElement.toDataURL('image/png'));
    posed.removeFromParent();
  };
  for (const attachment of library.attachments.values()) shoot(attachment.def.id, pose(attachment.template), boundsOf);
  const made: Material[] = [];
  for (const id of wearableIds) {
    const wearable: LoadedWearable | undefined = library.wearables.get(id);
    if (wearable !== undefined) shoot(wornImageKey(id), dressed(wearable, made), oneSleeve);
  }
  for (const material of made) material.dispose();

  reflections.dispose();
  room.dispose();
  generator.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return images;
}
