import type { Camera, IUniform, Material, Object3D, Texture, ToneMapping, WebGLRenderer } from 'three';
import { ACESFilmicToneMapping, AgXToneMapping, BufferAttribute, BufferGeometry, CineonToneMapping, Color, ColorManagement, CustomToneMapping, HalfFloatType, LinearToneMapping, Mesh, MeshStandardMaterial, NeutralToneMapping, OrthographicCamera, ReinhardToneMapping, Scene, ShaderMaterial, SRGBTransfer, Vector2, VSMShadowMap, WebGLRenderTarget } from 'three';
import type { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { QualityName } from '../mobile/quality.ts';
import { ditheredOutputPass } from '../render/output-dither.ts';
import { shadowLights, withShadowStandIns } from '../render/shadow-warm.ts';
import type { ShadowLights } from '../render/shadow-warm.ts';
import { unsorted, warmUp } from '../render/warm-up.ts';
import type { ShaderCompiler } from '../render/warm-up.ts';

export interface LobbyBloom {
  readonly strength: number;
  readonly radius: number;
  readonly threshold: number;
}

export interface LobbyRenderTier {
  readonly pixelRatio: number;
  readonly samples: number;
  readonly anisotropy: number;
  readonly bloom: LobbyBloom | null;
}

export const LOBBY_RENDER: { readonly tiers: Readonly<Record<QualityName, LobbyRenderTier>> } = {
  tiers: {
    desktop: { pixelRatio: 2, samples: 4, anisotropy: 8, bloom: { strength: 0.42, radius: 0.72, threshold: 0.78 } },
    mobile: { pixelRatio: 1.5, samples: 4, anisotropy: 4, bloom: null },
  },
};

export function lobbyPixelRatio(name: QualityName, devicePixelRatio: number, canvasPixelRatio: number): number {
  return Math.min(LOBBY_RENDER.tiers[name].pixelRatio, devicePixelRatio > 0 ? devicePixelRatio : 1, canvasPixelRatio > 0 ? canvasPixelRatio : 1);
}

export interface LobbyPipeline {
  render(name: QualityName, devicePixelRatio: number): void;
  compile(name: QualityName): Promise<void>;
  compileInto(root: Object3D): Promise<void>;
  warm(name: QualityName, devicePixelRatio: number, standIns: readonly Object3D[]): Promise<void>;
  release(): void;
}

const BACKDROP_VERTEX: string = 'varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = vec4( position.xy, 0.0, 1.0 );\n}';
const BACKDROP_FRAGMENT: string = 'uniform sampler2D tMap;\nvarying vec2 vUv;\nvoid main() {\n  gl_FragColor = texture2D( tMap, vUv );\n}';

export function backdropMaterial(backdrop: Texture): ShaderMaterial {
  return new ShaderMaterial({ vertexShader: BACKDROP_VERTEX, fragmentShader: BACKDROP_FRAGMENT, uniforms: { tMap: { value: backdrop } }, depthTest: false, depthWrite: false, toneMapped: false });
}

const TONE_DEFINES: ReadonlyMap<ToneMapping, string> = new Map<ToneMapping, string>([
  [LinearToneMapping, 'LINEAR_TONE_MAPPING'],
  [ReinhardToneMapping, 'REINHARD_TONE_MAPPING'],
  [CineonToneMapping, 'CINEON_TONE_MAPPING'],
  [ACESFilmicToneMapping, 'ACES_FILMIC_TONE_MAPPING'],
  [AgXToneMapping, 'AGX_TONE_MAPPING'],
  [NeutralToneMapping, 'NEUTRAL_TONE_MAPPING'],
  [CustomToneMapping, 'CUSTOM_TONE_MAPPING'],
]);

export function outputDefines(outputColorSpace: string, toneMapping: ToneMapping): Record<string, string> {
  const defines: Record<string, string> = {};
  if (ColorManagement.getTransfer(outputColorSpace) === SRGBTransfer) defines['SRGB_TRANSFER'] = '';
  const tone: string | undefined = TONE_DEFINES.get(toneMapping);
  if (tone !== undefined) defines[tone] = '';
  return defines;
}

const QUAD_CAMERA: OrthographicCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

function quadGeometry(): BufferGeometry {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, 3, 0, -1, -1, 0, 3, -1, 0]), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 2, 0, 0, 2, 0]), 2));
  return geometry;
}

const QUAD_GEOMETRY: BufferGeometry = quadGeometry();

export function quadScene(materials: readonly Material[]): Scene {
  const scene: Scene = new Scene();
  for (const material of materials) {
    const mesh: Mesh = new Mesh(QUAD_GEOMETRY, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  return scene;
}

function compileWith(renderer: WebGLRenderer, target: WebGLRenderTarget | null, work: () => Promise<unknown>): Promise<void> {
  const previous: WebGLRenderTarget | null = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  let started: Promise<unknown>;
  try {
    started = work();
  } finally {
    renderer.setRenderTarget(previous);
  }
  return started.then((): void => undefined);
}

export function bloomMaterials(pass: UnrealBloomPass): readonly ShaderMaterial[] {
  return [pass.materialHighPassFilter, ...pass.separableBlurMaterials, pass.compositeMaterial];
}

function sharpen(material: unknown, anisotropy: number): void {
  const list: readonly unknown[] = Array.isArray(material) ? material : [material];
  for (const item of list) {
    if (!(item instanceof MeshStandardMaterial)) continue;
    const maps: (Texture | null)[] = [item.map, item.normalMap, item.roughnessMap, item.aoMap, item.metalnessMap];
    for (const map of maps) {
      if (map === null || map.anisotropy >= anisotropy) continue;
      map.anisotropy = anisotropy;
      map.needsUpdate = true;
    }
  }
}

export function sharpenTextures(root: Object3D, anisotropy: number): void {
  root.traverse((node: Object3D): void => {
    if (!(node instanceof Mesh)) return;
    const material: unknown = node.material;
    sharpen(material, anisotropy);
  });
}

const BLOOM_BLUR: { readonly across: Vector2; readonly down: Vector2 } = { across: new Vector2(1, 0), down: new Vector2(0, 1) };

const SCENE_READ: string = 'gl_FragColor = texture2D( tDiffuse, vUv );';

export function bloomOutputFragment(fragment: string): string {
  if (!fragment.includes(SCENE_READ)) throw new Error('The output shader has no scene read to add the bloom to');
  return fragment.replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\nuniform sampler2D tBloom;').replace(SCENE_READ, 'gl_FragColor = texture2D( tDiffuse, vUv ) + texture2D( tBloom, vUv );');
}

function uniformOf(material: ShaderMaterial, name: string): IUniform {
  const found: IUniform | undefined = material.uniforms[name];
  if (found === undefined) throw new Error(`The ${material.type} has no ${name} uniform`);
  return found;
}

interface Bloomed {
  readonly pass: UnrealBloomPass;
  readonly quad: FullScreenQuad;
  readonly bloom: IUniform;
}

function bloomOutput(output: OutputPass, bloom: LobbyBloom): Bloomed {
  output.material.fragmentShader = bloomOutputFragment(output.material.fragmentShader);
  const uniform: IUniform = { value: null };
  output.material.uniforms['tBloom'] = uniform;
  return { pass: new UnrealBloomPass(new Vector2(1, 1), bloom.strength, bloom.radius, bloom.threshold), quad: new FullScreenQuad(), bloom: uniform };
}

const keptClear: Color = new Color();

function drawQuad(renderer: WebGLRenderer, quad: FullScreenQuad, material: ShaderMaterial, target: WebGLRenderTarget): void {
  quad.material = material;
  renderer.setRenderTarget(target);
  renderer.clear();
  quad.render(renderer);
}

export function drawBloom(renderer: WebGLRenderer, bloomed: Bloomed, source: Texture): Texture {
  const pass: UnrealBloomPass = bloomed.pass;
  renderer.getClearColor(keptClear);
  const keptAlpha: number = renderer.getClearAlpha();
  const keptAuto: boolean = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setClearColor(pass.clearColor, 0);
  uniformOf(pass.materialHighPassFilter, 'tDiffuse').value = source;
  uniformOf(pass.materialHighPassFilter, 'luminosityThreshold').value = pass.threshold;
  drawQuad(renderer, bloomed.quad, pass.materialHighPassFilter, pass.renderTargetBright);
  let input: WebGLRenderTarget = pass.renderTargetBright;
  for (let mip: number = 0; mip < pass.nMips; mip += 1) {
    const blur: ShaderMaterial | undefined = pass.separableBlurMaterials[mip];
    const across: WebGLRenderTarget | undefined = pass.renderTargetsHorizontal[mip];
    const down: WebGLRenderTarget | undefined = pass.renderTargetsVertical[mip];
    if (blur === undefined || across === undefined || down === undefined) break;
    uniformOf(blur, 'colorTexture').value = input.texture;
    uniformOf(blur, 'direction').value = BLOOM_BLUR.across;
    drawQuad(renderer, bloomed.quad, blur, across);
    uniformOf(blur, 'colorTexture').value = across.texture;
    uniformOf(blur, 'direction').value = BLOOM_BLUR.down;
    drawQuad(renderer, bloomed.quad, blur, down);
    input = down;
  }
  uniformOf(pass.compositeMaterial, 'bloomStrength').value = pass.strength;
  uniformOf(pass.compositeMaterial, 'bloomRadius').value = pass.radius;
  uniformOf(pass.compositeMaterial, 'bloomTintColors').value = pass.bloomTintColors;
  const result: WebGLRenderTarget | undefined = pass.renderTargetsHorizontal[0];
  if (result === undefined) throw new Error('The bloom has no mip to composite into');
  drawQuad(renderer, bloomed.quad, pass.compositeMaterial, result);
  renderer.setClearColor(keptClear, keptAlpha);
  renderer.autoClear = keptAuto;
  return result.texture;
}

interface Built {
  readonly target: WebGLRenderTarget;
  readonly output: OutputPass;
  readonly bloomed: Bloomed | null;
  readonly samples: number;
  readonly bloom: LobbyBloom | null;
}

function build(samples: number, bloom: LobbyBloom | null): Built {
  const output: OutputPass = ditheredOutputPass();
  output.renderToScreen = true;
  return { target: new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples }), output, bloomed: bloom === null ? null : bloomOutput(output, bloom), samples, bloom };
}

function freeTargets(built: Built): void {
  built.target.dispose();
  const pass: UnrealBloomPass | undefined = built.bloomed?.pass;
  if (pass === undefined) return;
  pass.renderTargetBright.dispose();
  for (const target of [...pass.renderTargetsHorizontal, ...pass.renderTargetsVertical]) target.dispose();
}

function free(built: Built | null): void {
  if (built === null) return;
  built.target.dispose();
  built.output.dispose();
  built.bloomed?.pass.dispose();
  built.bloomed?.quad.dispose();
}

export function createLobbyPipeline(renderer: WebGLRenderer, scene: Scene, camera: Camera, backdrop: Texture): LobbyPipeline {
  let built: Built | null = null;
  let sharpened: number = 0;
  let ratio: number = 0;
  const size: Vector2 = new Vector2();
  const drawn: Vector2 = new Vector2();
  const sky: ShaderMaterial = backdropMaterial(backdrop);
  const skyQuad: FullScreenQuad = new FullScreenQuad(sky);

  const ready = (samples: number, bloom: LobbyBloom | null): Built => {
    if (built !== null && built.samples === samples && built.bloom === bloom) return built;
    free(built);
    drawn.set(0, 0);
    built = build(samples, bloom);
    return built;
  };

  const tierBuilt = (name: QualityName): Built => ready(LOBBY_RENDER.tiers[name].samples, LOBBY_RENDER.tiers[name].bloom);

  const anisotropyFor = (name: QualityName): number => Math.min(LOBBY_RENDER.tiers[name].anisotropy, renderer.capabilities.getMaxAnisotropy());

  const sharpenFor = (name: QualityName): void => {
    const limit: number = anisotropyFor(name);
    if (sharpened === limit) return;
    sharpenTextures(scene, limit);
    sharpened = limit;
  };

  const fit = (name: QualityName, devicePixelRatio: number, active: Built): boolean => {
    const next: number = lobbyPixelRatio(name, devicePixelRatio, renderer.getPixelRatio());
    renderer.getSize(size);
    if (size.x <= 0 || size.y <= 0) return false;
    if (drawn.x !== size.x || drawn.y !== size.y || ratio !== next) {
      active.target.setSize(size.x * next, size.y * next);
      active.bloomed?.pass.setSize(size.x * next, size.y * next);
      drawn.copy(size);
      ratio = next;
    }
    return true;
  };

  const compileInto = (root: Object3D): Promise<void> => {
    const active: Built | null = built;
    if (active === null) return Promise.resolve();
    const casting: ShadowLights = renderer.shadowMap.enabled ? shadowLights(root instanceof Scene ? root : scene) : { depth: false, distance: false };
    const variance: boolean = renderer.shadowMap.type === VSMShadowMap;
    return compileWith(renderer, active.target, (): Promise<unknown> =>
      Promise.all([
        renderer.compileAsync(root, camera, root instanceof Scene ? root : scene),
        ...(casting.depth ? [withShadowStandIns(root, false, variance, (): Promise<Object3D> => renderer.compileAsync(root, camera, root instanceof Scene ? root : scene))] : []),
        ...(casting.distance ? [withShadowStandIns(root, true, variance, (): Promise<Object3D> => renderer.compileAsync(root, camera, root instanceof Scene ? root : scene))] : []),
      ]),
    );
  };

  const compiler: ShaderCompiler = {
    compileAsync(target: Object3D): Promise<Object3D> {
      return compileInto(target).then((): Object3D => target);
    },
    drawOnce(target: Object3D, viewer: Camera): void {
      const active: Built | null = built;
      if (active === null) return;
      const previous: WebGLRenderTarget | null = renderer.getRenderTarget();
      renderer.setRenderTarget(active.target);
      try {
        unsorted(renderer, (): void => renderer.render(target, viewer));
      } finally {
        renderer.setRenderTarget(previous);
      }
    },
    initTexture(texture: Texture): void {
      renderer.initTexture(texture);
    },
  };

  const compile = (name: QualityName): Promise<void> => {
    const active: Built = tierBuilt(name);
    active.output.material.defines = outputDefines(renderer.outputColorSpace, renderer.toneMapping);
    const passes: readonly Material[] = [sky, ...(active.bloomed === null ? [] : bloomMaterials(active.bloomed.pass))];
    return Promise.all([
      compileInto(scene),
      compileWith(renderer, active.target, (): Promise<Object3D> => renderer.compileAsync(quadScene(passes), QUAD_CAMERA)),
      compileWith(renderer, null, (): Promise<Object3D> => renderer.compileAsync(quadScene([active.output.material]), QUAD_CAMERA)),
    ]).then((): void => undefined);
  };

  return {
    release(): void {
      if (built !== null) freeTargets(built);
      drawn.set(0, 0);
    },
    compile,
    compileInto,
    async warm(name: QualityName, devicePixelRatio: number, standIns: readonly Object3D[]): Promise<void> {
      sharpenFor(name);
      for (const root of standIns) sharpenTextures(root, anisotropyFor(name));
      fit(name, devicePixelRatio, tierBuilt(name));
      await compile(name);
      await warmUp(compiler, scene, camera, standIns);
    },
    render(name: QualityName, devicePixelRatio: number): void {
      const tier: LobbyRenderTier = LOBBY_RENDER.tiers[name];
      sharpenFor(name);
      const active: Built = ready(tier.samples, tier.bloom);
      if (!fit(name, devicePixelRatio, active)) return;
      const previous: WebGLRenderTarget | null = renderer.getRenderTarget();
      const keptAuto: boolean = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(active.target);
      renderer.clear();
      skyQuad.render(renderer);
      renderer.render(scene, camera);
      renderer.autoClear = keptAuto;
      if (active.bloomed !== null) active.bloomed.bloom.value = drawBloom(renderer, active.bloomed, active.target.texture);
      active.output.render(renderer, active.target, active.target, 0, false);
      renderer.setRenderTarget(previous);
    },
  };
}
