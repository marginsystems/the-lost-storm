import type { Scene } from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Content } from '../../sim/content/types.ts';
import type { CharacterNeeds } from '../../sim/wear.ts';
import type { World } from '../../sim/world/types.ts';
import { createBrowserLive } from '../backend/browser.ts';
import type { Live, LiveEvent } from '../backend/live.ts';
import type { CharacterLibrary, Dresser } from '../render/character-loader.ts';
import { loadNeeds } from '../render/character-loader.ts';
import type { IsoCamera } from '../render/iso-camera.ts';
import type { Others } from '../render/others.ts';
import { createOthers } from '../render/others.ts';
import type { Sight } from '../render/sight.ts';

export interface HideoutParts {
  readonly scene: Scene;
  readonly library: CharacterLibrary;
  readonly content: Content;
  readonly feather: boolean;
  readonly camera: IsoCamera;
  readonly labels: HTMLElement;
  readonly loader: GLTFLoader;
  readonly dresser: Dresser;
  readonly sight: Sight;
}

export interface Hideout {
  frame(dt: number, playing: boolean, world: World, presenting: boolean): void;
}

export function startHideout(rawUrl: string | undefined, parts: HideoutParts): Hideout | null {
  const live: Live | null = createBrowserLive(rawUrl);
  if (live === null) return null;
  const others: Others = createOthers({
    scene: parts.scene,
    library: parts.library,
    content: parts.content,
    feather: parts.feather,
    camera: parts.camera,
    labels: parts.labels,
    load: (needs: CharacterNeeds): Promise<void> => loadNeeds(parts.loader, parts.content, parts.dresser, parts.library, needs),
    clock: (): number => performance.now(),
    sight: parts.sight,
  });
  live.subscribe((event: LiveEvent): void => others.handle(event));
  let drawn: World['zone'] | null = null;
  return {
    frame(dt: number, playing: boolean, world: World, presenting: boolean): void {
      live.update({ zone: playing ? world.zone.id : null, x: world.player.pos.x, z: world.player.pos.z, facing: world.player.facing });
      if (!presenting) return;
      if (drawn !== world.zone) others.clear();
      drawn = world.zone;
      others.update(dt, world.zone.floorHeight);
    },
  };
}
