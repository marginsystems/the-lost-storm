import type { Object3D, WebGLRenderTarget } from 'three';
import { ACESFilmicToneMapping, Box3, DirectionalLight, Group, OrthographicCamera, PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CharacterLibrary } from './character-loader.ts';

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
} as const;

export type ItemThumbnails = ReadonlyMap<string, string>;

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

export function createItemThumbnails(library: CharacterLibrary): ItemThumbnails {
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
  for (const attachment of library.attachments.values()) {
    const posed: Group = pose(attachment.template);
    scene.add(posed);
    posed.updateMatrixWorld(true);
    const bounds: Box3 = new Box3().setFromObject(posed, true);
    posed.position.sub(bounds.getCenter(new Vector3()));
    const size: Vector3 = bounds.getSize(new Vector3());
    const half: number = (Math.max(size.x, size.y) / 2) * (1 + THUMBNAIL.padding);
    camera.left = -half;
    camera.right = half;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    images.set(attachment.def.id, renderer.domElement.toDataURL('image/png'));
    posed.removeFromParent();
  }

  reflections.dispose();
  room.dispose();
  generator.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return images;
}
