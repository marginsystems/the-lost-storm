import type { Camera, Object3D } from 'three';
import { BufferGeometry, Light, Line, Material, Mesh, Points, Scene, Sprite, Texture } from 'three';
import { warnInConsole } from '../backend/console-log.ts';
import type { Timers } from '../backend/backend.ts';
import type { CostLimit, FramePacer } from './paced-work.ts';
import { browserPacer, framesOf, PACED_WORK, workPaced } from './paced-work.ts';

export const WARM_UP = {
  zoneWaitMs: 2500,
  textureBytesPerFrame: 12 * 1024 * 1024,
  drawCostPerFrame: 4 * 1024 * 1024,
  drawFixedCost: 128 * 1024,
  bytesPerTexel: 4,
  mipmapShare: 4 / 3,
  unknownTextureBytes: 1024 * 1024,
} as const;

export interface ShaderCompiler {
  compileAsync(target: Object3D, viewer: Camera): Promise<Object3D>;
  drawOnce(target: Object3D, viewer: Camera): void;
  initTexture(texture: Texture): void;
}

export interface Sortable {
  sortObjects: boolean;
}

export function unsorted(target: Sortable, draw: () => void): void {
  const sorted: boolean = target.sortObjects;
  target.sortObjects = false;
  try {
    draw();
  } finally {
    target.sortObjects = sorted;
  }
}

export interface WarmSurvey {
  readonly textures: readonly Texture[];
  readonly drawables: readonly Object3D[];
  readonly lights: readonly Light[];
}

const warmedTextures: WeakMap<Texture, number> = new WeakMap<Texture, number>();
const warmedGeometries: WeakSet<BufferGeometry> = new WeakSet<BufferGeometry>();
const warmedDrawables: WeakSet<Object3D> = new WeakSet<Object3D>();
const compiledDrawables: WeakMap<Object3D, Promise<Object3D>> = new WeakMap<Object3D, Promise<Object3D>>();

function isMaterial(value: unknown): value is Material {
  return value instanceof Material;
}

function isTexture(value: unknown): value is Texture {
  return value instanceof Texture;
}

function materialsOf(object: Object3D): readonly Material[] {
  if (!(object instanceof Mesh || object instanceof Points || object instanceof Line || object instanceof Sprite)) return [];
  const held: unknown = object.material;
  const list: readonly unknown[] = Array.isArray(held) ? held : [held];
  return list.filter(isMaterial);
}

function geometryOf(object: Object3D): BufferGeometry | null {
  if (!(object instanceof Mesh || object instanceof Points || object instanceof Line || object instanceof Sprite)) return null;
  const geometry: unknown = object.geometry;
  return geometry instanceof BufferGeometry ? geometry : null;
}

function texturesIn(value: unknown, into: Set<Texture>): void {
  if (isTexture(value)) {
    into.add(value);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const held: unknown = Reflect.get(value, 'value');
  if (isTexture(held)) into.add(held);
}

function materialTextures(material: Material, into: Set<Texture>): void {
  for (const value of Object.values(material)) texturesIn(value, into);
  const uniforms: unknown = Reflect.get(material, 'uniforms');
  if (uniforms !== null && typeof uniforms === 'object') for (const uniform of Object.values(uniforms)) texturesIn(uniform, into);
}

function hasImage(texture: Texture): boolean {
  if (texture.isRenderTargetTexture) return false;
  const image: unknown = texture.image;
  return image !== null && image !== undefined;
}

function uploadable(texture: Texture): boolean {
  return warmedTextures.get(texture) !== texture.version && hasImage(texture);
}

export function texturesOf(root: Object3D): Texture[] {
  const textures: Set<Texture> = new Set<Texture>();
  root.traverseVisible((object: Object3D): void => {
    for (const material of materialsOf(object)) materialTextures(material, textures);
  });
  return [...textures].filter(hasImage);
}

interface Walked {
  readonly object: Object3D;
  readonly shown: boolean;
  readonly lit: boolean;
}

export async function survey(scene: Scene, standIns: readonly Object3D[], camera: Camera, pacer: FramePacer, budgetMs: number = PACED_WORK.frameBudgetMs): Promise<WarmSurvey> {
  const textures: Set<Texture> = new Set<Texture>();
  const read: Set<Material> = new Set<Material>();
  const drawables: Object3D[] = [];
  const lights: Light[] = [];
  const loose: Walked[] = standIns.filter((standIn: Object3D): boolean => standIn.parent === null).map((standIn: Object3D): Walked => ({ object: standIn, shown: true, lit: false }));
  const pending: Walked[] = [...loose.toReversed(), { object: scene, shown: true, lit: true }];
  const visit = ({ object, shown: above, lit }: Walked): void => {
    const shown: boolean = above && object.visible;
    for (let index: number = object.children.length - 1; index >= 0; index -= 1) {
      const child: Object3D | undefined = object.children[index];
      if (child !== undefined) pending.push({ object: child, shown, lit });
    }
    if (object instanceof Light) {
      if (lit && shown) lights.push(object);
      return;
    }
    const materials: readonly Material[] = materialsOf(object);
    if (materials.length === 0 || !object.layers.test(camera.layers)) return;
    drawables.push(object);
    for (const material of materials) {
      if (read.has(material)) continue;
      read.add(material);
      materialTextures(material, textures);
    }
  };
  const walk = async (): Promise<void> => {
    const started: number = pacer.now();
    for (let next: Walked | undefined = pending.pop(); next !== undefined; next = pending.pop()) {
      visit(next);
      if (pacer.now() - started >= budgetMs) break;
    }
    if (pending.length === 0) return;
    await pacer.next();
    await walk();
  };
  await walk();
  return { textures: [...textures].filter(hasImage), drawables, lights };
}

function dimension(image: unknown, key: string): number {
  if (image === null || typeof image !== 'object') return 0;
  const value: unknown = Reflect.get(image, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function textureBytes(texture: Texture): number {
  const image: unknown = texture.image;
  const data: unknown = image !== null && typeof image === 'object' ? Reflect.get(image, 'data') : null;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  const texels: number = dimension(image, 'width') * dimension(image, 'height');
  if (texels === 0) return WARM_UP.unknownTextureBytes;
  return texels * WARM_UP.bytesPerTexel * (texture.generateMipmaps ? WARM_UP.mipmapShare : 1);
}

export function drawCost(object: Object3D): number {
  const geometry: BufferGeometry | null = geometryOf(object);
  if (geometry === null || warmedGeometries.has(geometry)) return WARM_UP.drawFixedCost;
  let bytes: number = geometry.index === null ? 0 : geometry.index.array.byteLength;
  for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength;
  return WARM_UP.drawFixedCost + bytes;
}

const TEXTURE_LIMIT: CostLimit<Texture> = { perFrame: WARM_UP.textureBytesPerFrame, cost: textureBytes };
export interface TextureUploader {
  initTexture(texture: Texture): void;
}

export function uploadPaced(uploader: TextureUploader, textures: readonly Texture[], uploaded: WeakMap<Texture, number>, pacer: FramePacer): Promise<void> {
  const fresh: Texture[] = textures.filter((texture: Texture): boolean => uploaded.get(texture) !== texture.version);
  return workPaced(
    fresh,
    (texture: Texture): void => {
      uploader.initTexture(texture);
      uploaded.set(texture, texture.version);
    },
    pacer,
    PACED_WORK.frameBudgetMs,
    TEXTURE_LIMIT,
  );
}

const DRAW_LIMIT: CostLimit<Object3D> = { perFrame: WARM_UP.drawCostPerFrame, cost: drawCost };

interface SliceStage {
  readonly scene: Scene;
  readonly standIns: readonly Object3D[];
  readonly lights: readonly Light[];
  readonly proxy: Scene;
}

interface Borrowed {
  readonly object: Object3D;
  readonly visible: boolean;
  readonly frustumCulled: boolean;
}

function sliceStage(scene: Scene, standIns: readonly Object3D[], lights: readonly Light[]): SliceStage {
  for (const light of lights) light.updateWorldMatrix(true, false);
  const proxy: Scene = new Scene();
  proxy.matrixWorldAutoUpdate = false;
  proxy.fog = scene.fog;
  proxy.background = scene.background;
  proxy.environment = scene.environment;
  proxy.environmentIntensity = scene.environmentIntensity;
  proxy.environmentRotation.copy(scene.environmentRotation);
  return { scene, standIns, lights, proxy };
}

function rootOf(object: Object3D): Object3D {
  let current: Object3D = object;
  while (current.parent !== null) current = current.parent;
  return current;
}

function attached(stage: SliceStage, object: Object3D): boolean {
  const root: Object3D = rootOf(object);
  return root === stage.scene || stage.standIns.includes(root);
}

function heldByAnother(object: Object3D, own: ReadonlySet<Object3D>): boolean {
  for (let holder: Object3D | null = object.parent; holder !== null; holder = holder.parent) {
    if (own.has(holder)) return true;
    if (!holder.visible) return false;
  }
  return false;
}

function borrow(object: Object3D, visible: boolean, frustumCulled: boolean, into: Borrowed[]): void {
  into.push({ object, visible: object.visible, frustumCulled: object.frustumCulled });
  object.visible = visible;
  object.frustumCulled = frustumCulled;
}

function inSlice<T>(stage: SliceStage, drawn: readonly Object3D[], work: (proxy: Scene) => T): T {
  const own: Set<Object3D> = new Set<Object3D>(drawn);
  const borrowed: Borrowed[] = [];
  for (const object of drawn) {
    borrow(object, true, false, borrowed);
    object.traverse((inner: Object3D): void => {
      if (inner === object || own.has(inner) || !inner.visible || materialsOf(inner).length === 0) return;
      borrow(inner, false, inner.frustumCulled, borrowed);
    });
    object.updateWorldMatrix(true, false);
  }
  stage.proxy.children = [...stage.lights.filter((light: Light): boolean => attached(stage, light)), ...drawn.filter((object: Object3D): boolean => !heldByAnother(object, own))];
  try {
    return work(stage.proxy);
  } finally {
    stage.proxy.children = [];
    for (const { object, visible, frustumCulled } of borrowed.toReversed()) {
      object.visible = visible;
      object.frustumCulled = frustumCulled;
    }
  }
}

function drawSlice(compiler: ShaderCompiler, stage: SliceStage, camera: Camera, slice: readonly Object3D[]): void {
  const drawn: Object3D[] = slice.filter((object: Object3D): boolean => attached(stage, object));
  if (drawn.length === 0) return;
  inSlice(stage, drawn, (proxy: Scene): void => compiler.drawOnce(proxy, camera));
  for (const object of drawn) {
    warmedDrawables.add(object);
    const geometry: BufferGeometry | null = geometryOf(object);
    if (geometry !== null) warmedGeometries.add(geometry);
  }
}

function alone<T>(object: Object3D, work: () => T): T {
  const children: Object3D[] = object.children;
  object.children = [];
  try {
    return work();
  } finally {
    object.children = children;
  }
}

function compileOne(compiler: ShaderCompiler, stage: SliceStage, camera: Camera, object: Object3D): Promise<Object3D> | null {
  if (!attached(stage, object)) return null;
  try {
    return inSlice(stage, [object], (proxy: Scene): Promise<Object3D> => alone(object, (): Promise<Object3D> => compiler.compileAsync(proxy, camera)));
  } catch {
    return null;
  }
}

async function compilePaced(compiler: ShaderCompiler, stage: SliceStage, camera: Camera, drawables: readonly Object3D[], pacer: FramePacer): Promise<void> {
  const compiling: Promise<Object3D>[] = [];
  const fresh: Object3D[] = [];
  for (const object of drawables) {
    const started: Promise<Object3D> | undefined = compiledDrawables.get(object);
    if (started === undefined) fresh.push(object);
    else compiling.push(started);
  }
  await workPaced(
    fresh,
    (object: Object3D): void => {
      const started: Promise<Object3D> | null = compileOne(compiler, stage, camera, object);
      if (started === null) return;
      compiling.push(started);
      compiledDrawables.set(object, started);
    },
    pacer,
  );
  await Promise.allSettled(compiling);
}

async function drawPaced(compiler: ShaderCompiler, stage: SliceStage, camera: Camera, found: WarmSurvey, pacer: FramePacer): Promise<void> {
  await workPaced(
    found.textures.filter(uploadable),
    (texture: Texture): void => {
      compiler.initTexture(texture);
      warmedTextures.set(texture, texture.version);
    },
    pacer,
    PACED_WORK.frameBudgetMs,
    TEXTURE_LIMIT,
  );
  await pacer.next();
  const fresh: readonly Object3D[] = found.drawables.filter((object: Object3D): boolean => !warmedDrawables.has(object));
  await workPaced(framesOf(fresh, DRAW_LIMIT), (slice: readonly Object3D[]): void => drawSlice(compiler, stage, camera, slice), pacer, 0);
}

async function warmPaced(compiler: ShaderCompiler, scene: Scene, camera: Camera, standIns: readonly Object3D[], pacer: FramePacer): Promise<void> {
  const found: WarmSurvey = await survey(scene, standIns, camera, pacer);
  const stage: SliceStage = sliceStage(scene, standIns, found.lights);
  await compilePaced(compiler, stage, camera, found.drawables, pacer);
  await drawPaced(compiler, stage, camera, found, pacer);
}

export function warmUp(compiler: ShaderCompiler, scene: Scene, camera: Camera, standIns: readonly Object3D[], later: Promise<void> | null = null, pacer: FramePacer = browserPacer()): Promise<void> {
  if (later !== null) void later.then((): Promise<void> => warmUp(compiler, scene, camera, standIns, null, pacer));
  return warmPaced(compiler, scene, camera, standIns, pacer).catch((error: unknown): void => {
    warnInConsole(`Warming the scene in slices failed: ${String(error)}`);
  });
}

export function warmUpWithin(compiler: ShaderCompiler, scene: Scene, camera: Camera, standIns: readonly Object3D[], timers: Timers, ms: number, later: Promise<void> | null = null, pacer: FramePacer = browserPacer()): Promise<void> {
  const cancels: (() => void)[] = [];
  const waited: Promise<void> = new Promise<void>((resolve: () => void): void => {
    cancels.push(timers.after(ms, resolve));
  });
  const warmed: Promise<void> = warmUp(compiler, scene, camera, standIns, later, pacer).finally((): void => {
    for (const cancel of cancels) cancel();
  });
  return Promise.race([warmed, waited]);
}
