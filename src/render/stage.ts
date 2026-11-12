import { Color, CustomToneMapping, DirectionalLight, Fog, HalfFloatType, HemisphereLight, PCFShadowMap, PerspectiveCamera, PointLight, Scene, ShaderChunk, SRGBColorSpace, Vector2, WebGLRenderer, WebGLRenderTarget } from 'three';
import type { ZoneAmbience } from '../../sim/content/types.ts';
import type { GraphicsPreset } from '../settings/settings.ts';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { QualityTier } from '../mobile/quality.ts';
import { pixelRatioFor } from '../mobile/quality.ts';
import { RIM_LIGHT } from './character-loader.ts';

export const STAGE = {
  exposure: 1.22,
  flashBackground: 0x2a3a55,
  stormOffsetX: -16,
  stormOffsetY: 30,
  stormOffsetZ: 10,
  shadowSize: 2048,
  shadowExtent: 30,
  shadowFar: 90,
  heroColor: 0xcfe2ff,
  heroIntensity: 24,
  heroDistance: 21,
  heroHeight: 6,
  bloomStrength: 0.62,
  bloomRadius: 0.42,
  bloomThreshold: 1.05,
  shadowSoftness: 3.5,
  samples: 4,
  flashSky: 2.6,
  flashStorm: 3.4,
  rimStrength: 0.4,
  rimFlash: 1.6,
  rimFalloff: 4,
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
if (ShaderChunk.tonemapping_pars_fragment.includes(PASSTHROUGH)) ShaderChunk.tonemapping_pars_fragment = ShaderChunk.tonemapping_pars_fragment.replace(PASSTHROUGH, gradeShader());

export function rimFor(ambience: ZoneAmbience): Color {
  const background: Color = new Color(ambience.background);
  const darkness: number = 1 - Math.min(1, Math.max(0, background.r * 0.2126 + background.g * 0.7152 + background.b * 0.0722));
  return new Color(ambience.keyColor).multiplyScalar(ambience.keyIntensity * STAGE.rimStrength * Math.pow(darkness, STAGE.rimFalloff));
}

export interface Stage {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  setAmbience(ambience: ZoneAmbience): void;
  follow(x: number, z: number): void;
  setFlash(amount: number): void;
  applyGraphics(preset: GraphicsPreset): void;
  resize(): void;
  render(): void;
  applyQuality(tier: QualityTier): void;
}

export function createStage(canvas: HTMLCanvasElement, initial: QualityTier): Stage {
  let tier: QualityTier = initial;
  const renderer: WebGLRenderer = new WebGLRenderer({ canvas, antialias: tier.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatioFor(tier, window.devicePixelRatio, canvas.clientWidth, canvas.clientHeight));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = CustomToneMapping;
  renderer.toneMappingExposure = STAGE.exposure;
  renderer.shadowMap.enabled = tier.shadows;
  renderer.shadowMap.type = PCFShadowMap;

  const scene: Scene = new Scene();
  const background: Color = new Color(0x000000);
  const flashBackground: Color = new Color(STAGE.flashBackground);
  const shownBackground: Color = background.clone();
  const fog: Fog = new Fog(background, 1, 2);
  scene.background = shownBackground;
  scene.fog = fog;
  let pixelRatioCap: number = tier.maxPixelRatio;
  let preset: GraphicsPreset = { pixelRatioCap: tier.maxPixelRatio, shadows: true, shadowSize: STAGE.shadowSize, bloom: true, lights: tier.zoneLights, effectsDensity: 1 };
  let skyIntensity: number = 0;
  let keyIntensity: number = 0;
  const rimBase: Color = new Color(0x000000);

  const camera: PerspectiveCamera = new PerspectiveCamera(30, 1, 1, 220);

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

  const hero: PointLight = new PointLight(STAGE.heroColor, STAGE.heroIntensity, STAGE.heroDistance, 1.6);
  scene.add(hero);

  let composer: EffectComposer | null = null;

  const buildComposer = (): EffectComposer => {
    const target: WebGLRenderTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: Math.min(STAGE.samples, tier.msaaSamples) });
    const made: EffectComposer = new EffectComposer(renderer, target);
    made.addPass(new RenderPass(scene, camera));
    made.addPass(new UnrealBloomPass(new Vector2(1, 1), STAGE.bloomStrength, STAGE.bloomRadius, STAGE.bloomThreshold));
    made.addPass(new OutputPass());
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
    if (bloom && composer === null) composer = buildComposer();
    if (!bloom && composer !== null) {
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
      composer = null;
    }
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
      fog.near = ambience.fogNear;
      fog.far = ambience.fogFar;
      sky.color.set(ambience.skyColor);
      sky.groundColor.set(ambience.groundColor);
      storm.color.set(ambience.keyColor);
      skyIntensity = ambience.skyIntensity;
      keyIntensity = ambience.keyIntensity;
      sky.intensity = skyIntensity;
      storm.intensity = keyIntensity;
      rimBase.copy(rimFor(ambience));
      RIM_LIGHT.value.copy(rimBase);
    },
    follow(x: number, z: number): void {
      const snappedX: number = Math.round(x / texel) * texel;
      const snappedZ: number = Math.round(z / texel) * texel;
      storm.target.position.set(snappedX, 0, snappedZ);
      storm.position.set(snappedX + STAGE.stormOffsetX, STAGE.stormOffsetY, snappedZ + STAGE.stormOffsetZ);
      hero.position.set(x, STAGE.heroHeight, z);
    },
    setFlash(amount: number): void {
      sky.intensity = skyIntensity + STAGE.flashSky * amount;
      storm.intensity = keyIntensity + STAGE.flashStorm * amount;
      shownBackground.copy(background).lerp(flashBackground, amount);
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
    render(): void {
      if (composer === null) renderer.render(scene, camera);
      else composer.render();
    },
  };
}
