import type { Object3D, Scene } from 'three';
import { Group } from 'three';
import type { Vec2 } from '../../sim/math.ts';
import type { ZoneFlash } from '../../sim/content/story-types.ts';
import type { Command, World, WorldEvent } from '../../sim/world/types.ts';
import type { TearPass } from '../render/tear-pass.ts';
import type { TearLook } from './tear-look.ts';
import { CALM_LOOK, hudTear, portalTear, seamTear } from './tear-look.ts';
import type { HudTearView } from './hud-tear.ts';
import { createHudTear } from './hud-tear.ts';
import type { Ghost } from './ghost.ts';
import { createGhost } from './ghost.ts';
import type { GlitchSettings, GlitchSettingsStore, SettingRequest, SettingStep } from './glitch-settings.ts';
import { settingStep, tearIsGentle } from './glitch-settings.ts';
import glitchCss from './glitch.css?inline';

export const GLITCH_VIEW = {
  stutterLag: 0.3,
  stutterMerge: 0.35,
  ghostTint: 0xdfe6ee,
  ghostOpacity: 0.4,
  historySeconds: 1.2,
  portalFade: 0.9,
  seamFade: 1.4,
  whiteVar: '--tear-white',
  whiteHostId: 'vignette',
} as const;

export interface GlitchViewDeps {
  readonly world: World;
  readonly scene: Scene;
  readonly app: HTMLElement;
  readonly settings: GlitchSettingsStore;
  readonly tearPass: TearPass;
  reducedMotion(): boolean;
  hero(): Object3D;
  send(command: Command): void;
}

export interface GlitchView {
  handle(events: readonly WorldEvent[]): void;
  update(now: number, dt: number, simDt: number): void;
  refresh(): void;
}

interface Sample {
  readonly time: number;
  readonly pos: Vec2;
  readonly facing: number;
}

interface TearFade {
  readonly look: TearLook;
  readonly span: number;
  left: number;
}

interface Stutter {
  readonly ghost: Ghost;
  readonly duration: number;
  elapsed: number;
}

export function createGlitchView(deps: GlitchViewDeps): GlitchView {
  const { world, scene, app, settings } = deps;
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = glitchCss;
  app.append(style);
  const whiteHost: HTMLElement | null = document.getElementById(GLITCH_VIEW.whiteHostId);
  const own: Group = new Group();
  scene.add(own);
  const history: Sample[] = [];
  let stutter: Stutter | null = null;
  let clock: number = 0;
  let fade: TearFade | null = null;
  let rising: boolean = false;
  const tear: HudTearView = createHudTear(app);

  let asked: SettingRequest | null = null;
  const apply = (next: GlitchSettings): void => {
    const step: SettingStep = settingStep(world.glitch.enabled, next.glitches, asked, world.time);
    asked = step.asked;
    if (step.send) deps.send({ type: 'glitch_setting', enabled: next.glitches });
  };
  apply(settings.get());
  settings.subscribe(apply);

  const showFade = (dt: number, now: number): void => {
    if (fade === null) return;
    fade.left -= dt;
    const share: number = Math.max(0, fade.left / fade.span);
    const look: TearLook = { ...fade.look, split: fade.look.split * share, slip: fade.look.slip * share, density: fade.look.density, blocks: fade.look.blocks * share, tear: fade.look.tear * share, white: fade.look.white * share };
    deps.tearPass.show(look, now);
    tear.show(hudTear(look), now);
    whiteHost?.style.setProperty(GLITCH_VIEW.whiteVar, look.white.toFixed(3));
    if (fade.left <= 0) {
      fade = null;
      deps.tearPass.show(CALM_LOOK, now);
      tear.calm();
    }
  };

  const gentle = (): boolean => tearIsGentle(settings.get(), deps.reducedMotion());

  const showLook = (look: TearLook, now: number): void => {
    deps.tearPass.show(look, now);
    tear.show(hudTear(look), now);
    whiteHost?.style.setProperty(GLITCH_VIEW.whiteVar, look.white.toFixed(3));
  };

  const seamShare = (): number => {
    const rules: ZoneFlash | null = world.zone.flash;
    const left: number | null = world.flash.seamLeft;
    return rules === null || left === null ? 1 : 1 - left / rules.seam;
  };

  const showRise = (now: number): void => {
    if (rising) showLook(seamTear(gentle(), seamShare()), now);
  };

  const tearThrough = (): void => {
    if (!rising) return;
    rising = false;
    fade = { look: seamTear(gentle(), 1), span: GLITCH_VIEW.seamFade, left: GLITCH_VIEW.seamFade };
  };

  const startStutter = (duration: number): void => {
    stutter?.ghost.dispose();
    const ghost: Ghost = createGhost(deps.hero(), GLITCH_VIEW.ghostTint, GLITCH_VIEW.ghostOpacity);
    own.add(ghost.root);
    stutter = { ghost, duration, elapsed: 0 };
  };

  const sampleAt = (time: number): Sample | null => {
    let found: Sample | null = null;
    for (const sample of history) {
      if (sample.time > time) break;
      found = sample;
    }
    return found ?? history[0] ?? null;
  };

  const stepStutter = (simDt: number): void => {
    if (stutter === null) return;
    stutter.elapsed += simDt;
    const left: number = stutter.duration - stutter.elapsed;
    if (left <= 0) {
      stutter.ghost.dispose();
      stutter = null;
      return;
    }
    const merge: number = Math.min(1, left / GLITCH_VIEW.stutterMerge);
    const eased: number = merge * merge * (3 - 2 * merge);
    const sample: Sample | null = sampleAt(clock - GLITCH_VIEW.stutterLag * eased);
    if (sample === null) return;
    stutter.ghost.copyPose();
    stutter.ghost.root.position.set(sample.pos.x, world.zone.floorHeight, sample.pos.z);
    stutter.ghost.root.rotation.y = sample.facing;
    stutter.ghost.root.scale.copy(deps.hero().scale);
    stutter.ghost.setOpacity(GLITCH_VIEW.ghostOpacity * eased);
  };

  const record = (simDt: number): void => {
    clock += simDt;
    if (simDt <= 0) return;
    history.push({ time: clock, pos: { x: world.player.pos.x, z: world.player.pos.z }, facing: deps.hero().rotation.y });
    while (history.length > 0 && (history[0]?.time ?? clock) < clock - GLITCH_VIEW.historySeconds) history.shift();
  };

  return {
    handle(events: readonly WorldEvent[]): void {
      for (const event of events) {
        if (event.type === 'glitch_start' && event.kind === 'stutter') startStutter(event.duration);
        else if (event.type === 'portal' && event.stage === 'entered' && world.glitch.active === null) fade = { look: portalTear(gentle()), span: GLITCH_VIEW.portalFade, left: GLITCH_VIEW.portalFade };
        else if (event.type === 'flash_seam') {
          fade = null;
          rising = true;
        } else if (event.type === 'zone_changed') tearThrough();
      }
    },
    refresh(): void {
      asked = null;
    },
    update(now: number, dt: number, simDt: number): void {
      apply(settings.get());
      record(simDt);
      stepStutter(simDt);
      showRise(now);
      showFade(dt, now);
    },
  };
}
