import { ACESFilmicToneMapping, Color, DirectionalLight, Fog, HalfFloatType, HemisphereLight, PCFShadowMap, PerspectiveCamera, PointLight, Scene, SRGBColorSpace, Vector2, WebGLRenderer, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export const STAGE = {
  maxPixelRatio: 1.5,
  background: 0x06090f,
  fogNear: 46,
  fogFar: 96,
  exposure: 1.08,
  skyColor: 0x6f8fbd,
  groundColor: 0x1b1612,
  skyIntensity: 0.85,
  stormColor: 0xa9c4f2,
  stormIntensity: 1.75,
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
  bloomStrength: 0.62,
  bloomRadius: 0.55,
  bloomThreshold: 0.82,
  samples: 4,
  flashSky: 2.6,
  flashStorm: 3.4,
} as const;

export interface Stage {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  follow(x: number, z: number): void;
  setFlash(amount: number): void;
  resize(): void;
  render(): void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer: WebGLRenderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, STAGE.maxPixelRatio));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = STAGE.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene: Scene = new Scene();
  const background: Color = new Color(STAGE.background);
  const flashBackground: Color = new Color(0x2a3a55);
  scene.background = background.clone();
  scene.fog = new Fog(STAGE.background, STAGE.fogNear, STAGE.fogFar);

  const camera: PerspectiveCamera = new PerspectiveCamera(30, 1, 1, 220);

  const sky: HemisphereLight = new HemisphereLight(STAGE.skyColor, STAGE.groundColor, STAGE.skyIntensity);
  scene.add(sky);

  const storm: DirectionalLight = new DirectionalLight(STAGE.stormColor, STAGE.stormIntensity);
  storm.castShadow = true;
  storm.shadow.mapSize.set(STAGE.shadowSize, STAGE.shadowSize);
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

  const size: Vector2 = new Vector2(1, 1);
  const target: WebGLRenderTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: STAGE.samples });
  const composer: EffectComposer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom: UnrealBloomPass = new UnrealBloomPass(size, STAGE.bloomStrength, STAGE.bloomRadius, STAGE.bloomThreshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const resize = (): void => {
    const width: number = canvas.clientWidth;
    const height: number = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, STAGE.maxPixelRatio));
    renderer.setSize(width, height, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();

  const texel: number = (STAGE.shadowExtent * 2) / STAGE.shadowSize;

  return {
    renderer,
    scene,
    camera,
    follow(x: number, z: number): void {
      const snappedX: number = Math.round(x / texel) * texel;
      const snappedZ: number = Math.round(z / texel) * texel;
      storm.target.position.set(snappedX, 0, snappedZ);
      storm.position.set(snappedX + STAGE.stormOffsetX, STAGE.stormOffsetY, snappedZ + STAGE.stormOffsetZ);
      hero.position.set(x, STAGE.heroHeight, z);
    },
    setFlash(amount: number): void {
      sky.intensity = STAGE.skyIntensity + STAGE.flashSky * amount;
      storm.intensity = STAGE.stormIntensity + STAGE.flashStorm * amount;
      if (scene.background instanceof Color) scene.background.copy(background).lerp(flashBackground, amount);
    },
    resize,
    render(): void {
      composer.render();
    },
  };
}
