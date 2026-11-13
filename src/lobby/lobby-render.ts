import type { Camera, Object3D, Scene, Texture, WebGLRenderer } from 'three';
import { HalfFloatType, Mesh, MeshStandardMaterial, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { QualityName } from '../mobile/quality.ts';
import { ditheredOutputPass } from '../render/output-dither.ts';

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

export function lobbyPixelRatio(name: QualityName, devicePixelRatio: number): number {
  return Math.min(LOBBY_RENDER.tiers[name].pixelRatio, devicePixelRatio > 0 ? devicePixelRatio : 1);
}

export interface LobbyPipeline {
  render(name: QualityName, devicePixelRatio: number): void;
  compile(name: QualityName): Promise<void>;
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

export function createLobbyPipeline(renderer: WebGLRenderer, scene: Scene, camera: Camera): LobbyPipeline {
  let composer: EffectComposer | null = null;
  let builtSamples: number = -1;
  let builtBloom: LobbyBloom | null = null;
  let sharpened: number = 0;
  let ratio: number = 0;
  const size: Vector2 = new Vector2();
  const drawn: Vector2 = new Vector2();

  const build = (samples: number, bloom: LobbyBloom | null): EffectComposer => {
    composer?.dispose();
    const made: EffectComposer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples }));
    made.addPass(new RenderPass(scene, camera));
    if (bloom !== null) made.addPass(new UnrealBloomPass(new Vector2(1, 1), bloom.strength, bloom.radius, bloom.threshold));
    made.addPass(ditheredOutputPass());
    builtSamples = samples;
    builtBloom = bloom;
    drawn.set(0, 0);
    return made;
  };

  const ready = (samples: number, bloom: LobbyBloom | null): EffectComposer => {
    const active: EffectComposer = composer !== null && builtSamples === samples && builtBloom === bloom ? composer : build(samples, bloom);
    composer = active;
    return active;
  };

  return {
    compile(name: QualityName): Promise<void> {
      const active: EffectComposer = ready(LOBBY_RENDER.tiers[name].samples, LOBBY_RENDER.tiers[name].bloom);
      const previous: WebGLRenderTarget | null = renderer.getRenderTarget();
      renderer.setRenderTarget(active.readBuffer);
      try {
        return renderer.compileAsync(scene, camera).then((): void => undefined);
      } finally {
        renderer.setRenderTarget(previous);
      }
    },
    render(name: QualityName, devicePixelRatio: number): void {
      const tier: LobbyRenderTier = LOBBY_RENDER.tiers[name];
      const limit: number = Math.min(tier.anisotropy, renderer.capabilities.getMaxAnisotropy());
      if (sharpened !== limit) {
        sharpenTextures(scene, limit);
        sharpened = limit;
      }
      const active: EffectComposer = ready(tier.samples, tier.bloom);
      const next: number = lobbyPixelRatio(name, devicePixelRatio);
      if (renderer.getPixelRatio() !== next) renderer.setPixelRatio(next);
      renderer.getSize(size);
      if (size.x <= 0 || size.y <= 0) return;
      if (drawn.x !== size.x || drawn.y !== size.y || ratio !== next) {
        active.setPixelRatio(next);
        active.setSize(size.x, size.y);
        drawn.copy(size);
        ratio = next;
      }
      active.render();
    },
  };
}
