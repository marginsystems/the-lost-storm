import type { Command, World } from '../../sim/world/types.ts';
import type { Hud } from '../hud/hud-api.ts';
import type { Input } from '../input.ts';
import type { IsoCamera } from '../render/iso-camera.ts';
import { CAMERA } from '../render/iso-camera.ts';
import { restoreSurfaceTextures } from '../render/surfaces.ts';
import type { Stage } from '../render/stage.ts';
import type { ContextWatch } from '../hud/context-notice.ts';
import { watchContext } from '../hud/context-notice.ts';
import { enterLandscapeFullscreen, holdPageStill, readDeviceFacts } from './page.ts';
import type { DeviceFacts, Quality, QualityTier } from './quality.ts';
import { chooseQuality, configureRenderBudget, createQuality } from './quality.ts';
import { prefersTouch } from './touch-map.ts';
import type { TouchControls } from './touch-ui.ts';
import { createTouchControls } from './touch-ui.ts';

export interface MobileBoot {
  readonly quality: Quality;
  readonly touch: boolean;
}

export interface MobileSetup {
  readonly canvas: HTMLCanvasElement;
  readonly hudRoot: HTMLElement;
  readonly world: World;
  readonly input: Input;
  readonly hud: Hud;
  readonly camera: IsoCamera;
  readonly stage: Stage;
  openMenu(): void;
}

export interface Mobile {
  readonly lost: boolean;
  fault(): void;
  collect(dt: number): Command[];
  update(): void;
}

export function bootMobile(): MobileBoot {
  const facts: DeviceFacts = readDeviceFacts();
  const quality: Quality = createQuality(chooseQuality(facts));
  configureRenderBudget(quality.tier);
  quality.subscribe(configureRenderBudget);
  const touch: boolean = prefersTouch(facts.search, facts.coarsePointer, facts.shortSide, facts.longSide);
  if (touch) holdPageStill();
  return { quality, touch };
}

export function startMobile(boot: MobileBoot, setup: MobileSetup): Mobile {
  const { canvas, stage } = setup;
  boot.quality.subscribe((tier: QualityTier): void => stage.applyQuality(tier));
  const context: ContextWatch = watchContext(canvas, canvas.parentElement ?? setup.hudRoot, (): boolean => stage.renderer.getContext().isContextLost(), (): void => {
    stage.resize();
    restoreSurfaceTextures();
  });
  const controls: TouchControls | null = boot.touch
    ? createTouchControls({
        canvas,
        hudRoot: setup.hudRoot,
        world: setup.world,
        input: setup.input,
        hud: setup.hud,
        yaw: (CAMERA.yawDegrees * Math.PI) / 180,
        zoomStep: CAMERA.zoomStep,
        zoomBy: (wheelDelta: number): void => setup.camera.zoomBy(wheelDelta),
        openMenu: (): void => setup.openMenu(),
      })
    : null;
  if (boot.touch) document.getElementById('title-enter')?.addEventListener('click', enterLandscapeFullscreen);
  return {
    get lost(): boolean {
      return context.lost;
    },
    fault(): void {
      context.fault();
    },
    collect(dt: number): Command[] {
      return controls === null ? [] : controls.collect(dt);
    },
    update(): void {
      controls?.update();
    },
  };
}
