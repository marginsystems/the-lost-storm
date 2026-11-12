import { ACESFilmicToneMapping, Color, DirectionalLight, Fog, HalfFloatType, HemisphereLight, PCFShadowMap, PerspectiveCamera, PointLight, Scene, SRGBColorSpace, Vector2, WebGLRenderer, WebGLRenderTarget } from 'three';
import type { ZoneAmbience } from '../../sim/content/types.ts';
import type { GraphicsPreset } from '../settings/settings.ts';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { QualityTier } from '../mobile/quality.ts';
import { pixelRatioFor } from '../mobile/quality.ts';

export const STAGE = {
  exposure: 1.22,
  flashBackground: 0x4a5f82,
  stormOffsetX: -16,
  stormOffsetY: 30,
  stormOffsetZ: 10,
  shadowSize: 2048,
  shadowExtent: 30,
  shadowFar: 90,
  heroColor: 0xcfe2ff,
  heroIntensity: 9,
  heroDistance: 13,
  heroHeight: 4.2,
  bloomStrength: 0.48,
  bloomRadius: 0.55,
  bloomThreshold: 0.82,
  samples: 4,
  flashSky: 7,
  flashStorm: 6,
  flashExposure: 0.55,
  flashFogNear: 50,
  flashFogFar: 200,
} as const;

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
  renderer.toneMapping = ACESFilmicToneMapping;
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
  let fogNear: number = 1;
  let fogFar: number = 2;

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
      fogNear = ambience.fogNear;
      fogFar = ambience.fogFar;
      fog.near = fogNear;
      fog.far = fogFar;
      sky.color.set(ambience.skyColor);
      sky.groundColor.set(ambience.groundColor);
      storm.color.set(ambience.keyColor);
      skyIntensity = ambience.skyIntensity;
      keyIntensity = ambience.keyIntensity;
      sky.intensity = skyIntensity;
      storm.intensity = keyIntensity;
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
      fog.near = fogNear + (Math.max(fogNear, STAGE.flashFogNear) - fogNear) * amount;
      fog.far = fogFar + (Math.max(fogFar, STAGE.flashFogFar) - fogFar) * amount;
      renderer.toneMappingExposure = STAGE.exposure * (1 + STAGE.flashExposure * amount);
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
