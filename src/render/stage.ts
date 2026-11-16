import type { Camera, Object3D, Texture } from 'three';
import { Color, CustomToneMapping, DirectionalLight, Fog, HalfFloatType, HemisphereLight, PCFShadowMap, PerspectiveCamera, PointLight, Scene, ShaderChunk, SRGBColorSpace, Vector2, WebGLRenderer, WebGLRenderTarget } from 'three';
import type { ZoneAmbience } from '../../sim/content/types.ts';
import type { ZoneHeroLight } from '../../sim/content/road-types.ts';
import { DEFAULT_HERO_LIGHT } from '../../sim/content/parse-weather.ts';
import type { Spring } from '../hud/character-spring.ts';
import { springTo, stepSpring } from '../hud/character-spring.ts';
import type { SkyFlash } from './weather.ts';
import type { GraphicsPreset } from '../settings/settings.ts';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Pass } from 'three/addons/postprocessing/Pass.js';
import type { QualityTier } from '../mobile/quality.ts';
import { pixelRatioFor } from '../mobile/quality.ts';
import { postBufferTarget, scenePass } from './scene-pass.ts';
import { RIM_LIGHT } from './character-loader.ts';
import { aimCutaway } from './prop-cutaway.ts';
import { ditheredOutputPass } from './output-dither.ts';
import { GPU } from '../gpu-release.ts';
import { installDarkLightSkip } from './dark-lights.ts';
import type { GpuQueue } from './gpu-fence.ts';
import { createGpuQueue } from './gpu-fence.ts';

export const STAGE = {
  exposure: 1.22,
  flashBackground: 0x4a5f82,
  stormOffsetX: -16,
  stormOffsetY: 30,
  stormOffsetZ: 10,
  shadowSize: 2048,
  shadowExtent: 30,
  shadowFar: 90,
  heroColor: 0xe9e4dc,
  heroToward: 2.4,
  bloomStrength: 0.62,
  bloomRadius: 0.42,
  bloomThreshold: 1.05,
  shadowSoftness: 3.5,
  samples: 4,
  flashSky: 7,
  flashStorm: 6,
  flashExposure: 0.55,
  flashFogNear: 50,
  flashFogFar: 200,
  rimStrength: 0.4,
  rimMost: 0.18,
  rimFlash: 0.6,
  rimFalloff: 4,
  flashCool: 0xb3b6ff,
  flashWarm: 0xffe0c2,
  flashWarmth: 0.45,
  flashDip: 0.1,
  flashSheetSky: 0.6,
  flashSwing: 34,
} as const;

export const GRADE = {
  coolTint: [0.82, 0.9, 1.08],
  coolReach: 0.32,
  coolAmount: 0.55,
  floor: 0.0035,
  contrast: 1.06,
  pivot: 0.18,
} as const;

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

export function gradeShader(): string {
  const [r, g, b] = GRADE.coolTint;
  return [
    'vec3 CustomToneMapping( vec3 color ) {',
    '  vec3 mapped = ACESFilmicToneMapping( color );',
    '  float light = dot( mapped, vec3( 0.2126, 0.7152, 0.0722 ) );',
    `  float shade = 1.0 - smoothstep( 0.0, ${glsl(GRADE.coolReach)}, light );`,
    `  mapped = mix( mapped, mapped * vec3( ${glsl(r)}, ${glsl(g)}, ${glsl(b)} ), shade * ${glsl(GRADE.coolAmount)} );`,
    `  vec3 deeper = ${glsl(GRADE.pivot)} * pow( max( mapped, vec3( 0.0 ) ) / ${glsl(GRADE.pivot)}, vec3( ${glsl(GRADE.contrast)} ) );`,
    `  mapped = mix( mapped, min( deeper, mapped ), shade );`,
    `  return clamp( mapped + ${glsl(GRADE.floor)} * shade, 0.0, 1.0 );`,
    '}',
  ].join('\n');
}

const PASSTHROUGH: string = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
export function installGrade(): void {
  const chunk: string = ShaderChunk.tonemapping_pars_fragment;
  const grade: string = gradeShader();
  if (chunk.includes(grade)) return;
  if (!chunk.includes(PASSTHROUGH)) throw new Error('The tone-mapping chunk has no passthrough CustomToneMapping to replace; the grade cannot be installed');
  ShaderChunk.tonemapping_pars_fragment = chunk.replace(PASSTHROUGH, grade);
}

installGrade();
installDarkLightSkip();

export function rimFor(ambience: ZoneAmbience): Color {
  const background: Color = new Color(ambience.background);
  const darkness: number = 1 - Math.min(1, Math.max(0, background.r * 0.2126 + background.g * 0.7152 + background.b * 0.0722));
  return new Color(ambience.keyColor).multiplyScalar(Math.min(STAGE.rimMost, ambience.keyIntensity * STAGE.rimStrength * Math.pow(darkness, STAGE.rimFalloff)));
}

export interface Stage {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  setAmbience(ambience: ZoneAmbience): void;
  setHeroLight(light: ZoneHeroLight): void;
  follow(x: number, z: number, floor: number, dt: number): void;
  setFlash(light: SkyFlash): void;
  applyGraphics(preset: GraphicsPreset): void;
  resize(): void;
  render(): void;
  gpuQueued(): number;
  applyQuality(tier: QualityTier): void;
  compileAsync(target: Object3D, viewer: Camera): Promise<Object3D>;
  drawOnce(target: Object3D, viewer: Camera): void;
  initTexture(texture: Texture): void;
  setFinish(pass: Pass | null): void;
  setSeam(pass: Pass | null): void;
}

export function createStage(canvas: HTMLCanvasElement, initial: QualityTier): Stage {
  let tier: QualityTier = initial;
  const renderer: WebGLRenderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  GPU.hold((): void => renderer.forceContextLoss());
  renderer.setPixelRatio(pixelRatioFor(tier, window.devicePixelRatio, canvas.clientWidth, canvas.clientHeight));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = CustomToneMapping;
  renderer.toneMappingExposure = STAGE.exposure;
  renderer.shadowMap.enabled = tier.shadows;
  renderer.shadowMap.type = PCFShadowMap;

  const context: WebGLRenderingContext | WebGL2RenderingContext = renderer.getContext();
  const gpu: GpuQueue = createGpuQueue(context instanceof WebGL2RenderingContext ? context : null);
  const scene: Scene = new Scene();
  const background: Color = new Color(0x000000);
  const flashBackground: Color = new Color(STAGE.flashBackground);
  const flashCool: Color = new Color(STAGE.flashCool);
  const flashWarm: Color = new Color(STAGE.flashWarm);
  const keyColor: Color = new Color(0xffffff);
  const skyColor: Color = new Color(0xffffff);
  const flashTint: Color = new Color(0xffffff);
  let swing: number = 0;
  let swingX: number = 0;
  let swingZ: number = 0;

  const placeStorm = (): void => {
    storm.position.set(storm.target.position.x + STAGE.stormOffsetX + (swingX - STAGE.stormOffsetX) * swing, storm.target.position.y + STAGE.stormOffsetY, storm.target.position.z + STAGE.stormOffsetZ + (swingZ - STAGE.stormOffsetZ) * swing);
  };
  const shownBackground: Color = background.clone();
  const fog: Fog = new Fog(background, 1, 2);
  scene.background = shownBackground;
  scene.fog = fog;
  let pixelRatioCap: number = tier.maxPixelRatio;
  let preset: GraphicsPreset = { pixelRatioCap: tier.maxPixelRatio, shadows: true, shadowSize: STAGE.shadowSize, bloom: true, lights: tier.zoneLights, effectsDensity: 1 };
  let skyIntensity: number = 0;
  let keyIntensity: number = 0;
  let fogNear: number = 1;
  let fogFar: number = 2;
  const rimBase: Color = new Color(0x000000);

  const camera: PerspectiveCamera = new PerspectiveCamera(30, 1, 1, 220);
  const heroAt: Vector2 = new Vector2();
  let heroFloor: number = 0;
  const drawing: Vector2 = new Vector2();
  let drawnAt: number | null = null;

  const sky: HemisphereLight = new HemisphereLight(0xffffff, 0x000000, 0);
  scene.add(sky);

  const storm: DirectionalLight = new DirectionalLight(0xffffff, 0);
  storm.castShadow = tier.shadows;
  storm.shadow.camera.left = -STAGE.shadowExtent;
  storm.shadow.camera.right = STAGE.shadowExtent;
  storm.shadow.camera.top = STAGE.shadowExtent;
  storm.shadow.camera.bottom = -STAGE.shadowExtent;
  storm.shadow.camera.near = 1;
  storm.shadow.camera.far = STAGE.shadowFar;
  storm.shadow.bias = -0.0006;
  storm.shadow.normalBias = 0.04;
  storm.shadow.radius = STAGE.shadowSoftness;
  scene.add(storm);
  scene.add(storm.target);

  const heroStrength: Spring = { value: DEFAULT_HERO_LIGHT.strength, velocity: 0, target: DEFAULT_HERO_LIGHT.strength };
  const heroRadius: Spring = { value: DEFAULT_HERO_LIGHT.radius, velocity: 0, target: DEFAULT_HERO_LIGHT.radius };
  const heroHeight: Spring = { value: DEFAULT_HERO_LIGHT.height, velocity: 0, target: DEFAULT_HERO_LIGHT.height };
  const heroFalloff: Spring = { value: DEFAULT_HERO_LIGHT.falloff, velocity: 0, target: DEFAULT_HERO_LIGHT.falloff };
  const hero: PointLight = new PointLight(STAGE.heroColor, heroStrength.value, heroRadius.value, heroFalloff.value);
  scene.add(hero);

  const msaaSamples = (): number => Math.min(STAGE.samples, tier.msaaSamples);
  const primer: WebGLRenderTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: msaaSamples() });
  let composer: EffectComposer | null = null;
  let finish: Pass | null = null;
  let builtBloom: boolean = false;
  let builtFinish: Pass | null = null;
  let seam: Pass | null = null;
  let builtSeam: Pass | null = null;

  const buildComposer = (): EffectComposer => {
    const samples: number = msaaSamples();
    const made: EffectComposer = new EffectComposer(renderer, postBufferTarget(false));
    made.addPass(scenePass(scene, camera, samples, builtBloom).pass);
    if (builtBloom) made.addPass(new UnrealBloomPass(new Vector2(1, 1), STAGE.bloomStrength, STAGE.bloomRadius, STAGE.bloomThreshold));
    if (builtFinish !== null) made.addPass(builtFinish);
    made.addPass(ditheredOutputPass());
    if (builtSeam !== null) made.addPass(builtSeam);
    return made;
  };

  const resize = (): void => {
    const width: number = canvas.clientWidth;
    const height: number = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setPixelRatio(Math.min(pixelRatioCap, pixelRatioFor(tier, window.devicePixelRatio, width, height)));
    renderer.setSize(width, height, false);
    composer?.setPixelRatio(renderer.getPixelRatio());
    composer?.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  let texel: number = (STAGE.shadowExtent * 2) / STAGE.shadowSize;

  const apply = (): void => {
    const shadows: boolean = tier.shadows && preset.shadows;
    const bloom: boolean = tier.bloom && preset.bloom;
    const shadowSize: number = Math.min(tier.shadowSize, preset.shadowSize);
    pixelRatioCap = preset.pixelRatioCap;
    renderer.shadowMap.enabled = shadows;
    storm.castShadow = shadows;
    if (storm.shadow.mapSize.x !== shadowSize) {
      storm.shadow.map?.dispose();
      storm.shadow.map = null;
      storm.shadow.mapSize.set(shadowSize, shadowSize);
    }
    texel = (STAGE.shadowExtent * 2) / shadowSize;
    if (composer !== null && (bloom !== builtBloom || finish !== builtFinish || seam !== builtSeam)) {
      for (const pass of composer.passes) if (pass !== builtFinish && pass !== builtSeam) pass.dispose();
      composer.dispose();
      composer = null;
    }
    builtBloom = bloom;
    builtFinish = finish;
    builtSeam = seam;
    composer ??= buildComposer();
    resize();
  };
  apply();

  return {
    renderer,
    scene,
    camera,
    setAmbience(ambience: ZoneAmbience): void {
      background.set(ambience.background);
      shownBackground.copy(background);
      fog.color.copy(background);
      fogNear = ambience.fogNear;
      fogFar = ambience.fogFar;
      fog.near = fogNear;
      fog.far = fogFar;
      sky.color.set(ambience.skyColor);
      sky.groundColor.set(ambience.groundColor);
      storm.color.set(ambience.keyColor);
      keyColor.copy(storm.color);
      skyColor.copy(sky.color);
      skyIntensity = ambience.skyIntensity;
      keyIntensity = ambience.keyIntensity;
      sky.intensity = skyIntensity;
      storm.intensity = keyIntensity;
      rimBase.copy(rimFor(ambience));
      RIM_LIGHT.value.copy(rimBase);
    },
    setHeroLight(light: ZoneHeroLight): void {
      springTo(heroStrength, light.strength);
      springTo(heroRadius, light.radius);
      springTo(heroHeight, light.height);
      springTo(heroFalloff, light.falloff);
    },
    follow(x: number, z: number, floor: number, dt: number): void {
      const snappedX: number = Math.round(x / texel) * texel;
      const snappedZ: number = Math.round(z / texel) * texel;
      storm.target.position.set(snappedX, floor, snappedZ);
      placeStorm();
      stepSpring(heroStrength, dt);
      stepSpring(heroRadius, dt);
      stepSpring(heroHeight, dt);
      stepSpring(heroFalloff, dt);
      hero.decay = Math.max(0, heroFalloff.value);
      hero.intensity = Math.max(0, heroStrength.value);
      hero.distance = Math.max(0, heroRadius.value);
      hero.position.set(x + STAGE.heroToward * Math.SQRT1_2, floor + heroHeight.value, z + STAGE.heroToward * Math.SQRT1_2);
      heroAt.set(x, z);
      heroFloor = floor;
    },
    setFlash(light: SkyFlash): void {
      const amount: number = light.amount;
      const aimed: number = amount * (1 - light.sheet);
      flashTint.copy(flashWarm).lerp(flashCool, light.cool);
      sky.color.copy(skyColor).lerp(flashTint, Math.min(1, amount));
      storm.color.copy(keyColor).lerp(flashTint, Math.min(1, aimed) * (light.cool + (1 - light.cool) * STAGE.flashWarmth));
      sky.intensity = skyIntensity + STAGE.flashSky * amount * (1 - (1 - STAGE.flashSheetSky) * light.sheet);
      storm.intensity = keyIntensity + STAGE.flashStorm * aimed;
      swing = Math.min(1, aimed * 2);
      swingX = light.dirX * STAGE.flashSwing;
      swingZ = light.dirZ * STAGE.flashSwing;
      placeStorm();
      shownBackground.copy(background).lerp(flashBackground, amount);
      fog.near = fogNear + (Math.max(fogNear, STAGE.flashFogNear) - fogNear) * amount;
      fog.far = fogFar + (Math.max(fogFar, STAGE.flashFogFar) - fogFar) * amount;
      renderer.toneMappingExposure = STAGE.exposure * (1 + STAGE.flashExposure * amount - STAGE.flashDip * light.dip);
      RIM_LIGHT.value.copy(rimBase).multiplyScalar(1 + STAGE.rimFlash * amount);
    },
    applyGraphics(next: GraphicsPreset): void {
      preset = next;
      apply();
    },
    resize,
    applyQuality(next: QualityTier): void {
      tier = next;
      apply();
    },
    setFinish(pass: Pass | null): void {
      if (pass === finish) return;
      finish = pass;
      apply();
    },
    setSeam(pass: Pass | null): void {
      if (pass === seam) return;
      seam = pass;
      apply();
    },
    render(): void {
      renderer.getDrawingBufferSize(drawing);
      const now: number = performance.now();
      aimCutaway(camera, { x: heroAt.x, z: heroAt.y, floor: heroFloor }, drawing.x, drawing.y, drawnAt === null ? 0 : (now - drawnAt) / 1000);
      drawnAt = now;
      if (composer === null) renderer.render(scene, camera);
      else composer.render();
      gpu.mark();
    },
    gpuQueued(): number {
      return gpu.waiting();
    },
    compileAsync(target: Object3D, viewer: Camera): Promise<Object3D> {
      const previous: WebGLRenderTarget | null = renderer.getRenderTarget();
      renderer.setRenderTarget(composer === null ? null : composer.readBuffer);
      try {
        return renderer.compileAsync(target, viewer, scene);
      } finally {
        renderer.setRenderTarget(previous);
      }
    },
    drawOnce(target: Object3D, viewer: Camera): void {
      const previous: WebGLRenderTarget | null = renderer.getRenderTarget();
      if (primer.samples !== msaaSamples()) {
        primer.dispose();
        primer.samples = msaaSamples();
      }
      renderer.setRenderTarget(primer);
      try {
        renderer.render(target, viewer);
      } finally {
        renderer.setRenderTarget(previous);
      }
      gpu.mark();
    },
    initTexture(texture: Texture): void {
      renderer.initTexture(texture);
    },
  };
}
