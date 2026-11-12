import type { Object3D, Scene } from 'three';
import { Camera, Group, Light, PointLight } from 'three';
import type { GlitchKind } from '../../sim/content/glitches.ts';
import type { ZoneAmbience, ZoneDef } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { isMist } from '../../sim/world/glitch.ts';
import type { Silhouette } from '../../sim/world/glitch-types.ts';
import type { Command, World, WorldEvent } from '../../sim/world/types.ts';
import { buildVoidView } from '../render/void-view.ts';
import type { ZoneView } from '../render/zone-view.ts';
import type { Ghost } from './ghost.ts';
import { createGhost } from './ghost.ts';
import type { GlitchSettings, GlitchSettingsStore } from './glitch-settings.ts';
import glitchCss from './glitch.css?inline';

export const GLITCH_VIEW = {
  whiteHold: 0.1,
  softSwap: 0.32,
  softPeak: 0.55,
  quietPeak: 0.8,
  stutterLag: 0.3,
  stutterMerge: 0.35,
  ghostTint: 0xdfe6ee,
  ghostOpacity: 0.4,
  shadeTint: 0xf2f4f6,
  shadeOpacity: 0.2,
  historySeconds: 1.2,
  mistClass: 'glitch-mist',
  softClass: 'soft',
} as const;

export interface GlitchViewDeps {
  readonly world: World;
  readonly scene: Scene;
  readonly app: HTMLElement;
  readonly mistZone: ZoneDef;
  readonly settings: GlitchSettingsStore;
  hero(): Object3D;
  send(command: Command): void;
  setAmbience(ambience: ZoneAmbience): void;
  silence(): void;
  resume(): void;
}

export interface GlitchView {
  handle(events: readonly WorldEvent[]): void;
  silences(events: readonly WorldEvent[]): boolean;
  update(now: number, dt: number, simDt: number): void;
  refresh(): void;
}

interface Sample {
  readonly time: number;
  readonly pos: Vec2;
  readonly facing: number;
}

type Phase = { readonly type: 'idle' } | { readonly type: 'entering'; left: number } | { readonly type: 'mist' } | { readonly type: 'leaving'; left: number };

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
  const white: HTMLDivElement = document.createElement('div');
  white.className = 'glitch-white';
  app.append(white);
  const own: Group = new Group();
  scene.add(own);
  const hidden: Set<Object3D> = new Set<Object3D>();
  const history: Sample[] = [];
  const shades: Ghost[] = [];
  let mist: ZoneView | null = null;
  let phase: Phase = { type: 'idle' };
  let soft: boolean = settings.get().reduceFlashes;
  let pendingShades: readonly Silhouette[] = [];
  let stutter: Stutter | null = null;
  let clock: number = 0;

  let asked: boolean | null = null;
  const apply = (next: GlitchSettings): void => {
    if (world.glitch.enabled === next.glitches) {
      asked = null;
      return;
    }
    if (asked === next.glitches) return;
    asked = next.glitches;
    deps.send({ type: 'glitch_setting', enabled: next.glitches });
  };
  apply(settings.get());
  settings.subscribe(apply);

  const setWhite = (opacity: number, eased: boolean): void => {
    white.classList.toggle(GLITCH_VIEW.softClass, eased);
    white.style.opacity = opacity.toFixed(3);
  };

  const kept = (object: Object3D): boolean => object === own || object === mist?.group || object === deps.hero() || (object instanceof Light && !(object instanceof PointLight)) || object instanceof Camera;

  const sweep = (): void => {
    for (const child of scene.children) {
      if (kept(child) || !child.visible) continue;
      child.visible = false;
      hidden.add(child);
    }
  };

  const placeShades = (): void => {
    for (const shade of pendingShades) {
      const ghost: Ghost = createGhost(deps.hero(), GLITCH_VIEW.shadeTint, GLITCH_VIEW.shadeOpacity);
      ghost.root.position.set(shade.x, world.zone.floorHeight, shade.z);
      ghost.root.rotation.y = shade.facing;
      own.add(ghost.root);
      shades.push(ghost);
    }
    pendingShades = [];
  };

  const showMist = (): void => {
    mist?.dispose();
    mist = buildVoidView({ ...deps.mistZone, floorHeight: world.zone.floorHeight });
    scene.add(mist.group);
    deps.setAmbience(deps.mistZone.ambience);
    document.body.classList.add(GLITCH_VIEW.mistClass);
    sweep();
    placeShades();
    phase = { type: 'mist' };
  };

  const hideMist = (): void => {
    mist?.dispose();
    mist = null;
    for (const object of hidden) object.visible = true;
    hidden.clear();
    for (const shade of shades) shade.dispose();
    shades.length = 0;
    deps.setAmbience(world.zone.ambience);
    document.body.classList.remove(GLITCH_VIEW.mistClass);
  };

  const enter = (kind: GlitchKind, silhouettes: readonly Silhouette[]): void => {
    soft = settings.get().reduceFlashes || kind === 'quiet_pass';
    pendingShades = silhouettes;
    if (soft) {
      setWhite(kind === 'quiet_pass' && !settings.get().reduceFlashes ? GLITCH_VIEW.quietPeak : GLITCH_VIEW.softPeak, true);
      phase = { type: 'entering', left: GLITCH_VIEW.softSwap };
      return;
    }
    setWhite(1, false);
    phase = { type: 'entering', left: GLITCH_VIEW.whiteHold };
  };

  const leave = (): void => {
    if (phase.type === 'entering') showMist();
    if (soft) {
      setWhite(GLITCH_VIEW.softPeak, true);
      phase = { type: 'leaving', left: GLITCH_VIEW.softSwap };
      return;
    }
    hideMist();
    setWhite(0, false);
    phase = { type: 'idle' };
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

  const stepPhase = (dt: number): void => {
    switch (phase.type) {
      case 'idle':
      case 'mist':
        return;
      case 'entering':
        phase.left -= dt;
        if (phase.left > 0) return;
        showMist();
        setWhite(0, soft);
        return;
      case 'leaving':
        phase.left -= dt;
        if (phase.left > 0) return;
        hideMist();
        setWhite(0, true);
        phase = { type: 'idle' };
        return;
    }
  };

  return {
    handle(events: readonly WorldEvent[]): void {
      for (const event of events) {
        if (event.type === 'silence') deps.silence();
        else if (event.type === 'glitch_start' && isMist(event.kind)) enter(event.kind, event.silhouettes);
        else if (event.type === 'glitch_start' && event.kind === 'stutter') startStutter(event.duration);
        else if (event.type === 'glitch_end' && isMist(event.kind)) {
          leave();
          deps.resume();
        }
      }
    },
    refresh(): void {
      asked = null;
      if (phase.type === 'idle') return;
      deps.silence();
      if (mist !== null) deps.setAmbience(deps.mistZone.ambience);
    },
    silences(events: readonly WorldEvent[]): boolean {
      return phase.type !== 'idle' || events.some((event: WorldEvent): boolean => event.type === 'silence');
    },
    update(now: number, dt: number, simDt: number): void {
      apply(settings.get());
      record(simDt);
      stepPhase(dt);
      stepStutter(simDt);
      if (mist !== null) {
        sweep();
        mist.update(now, dt, world);
      }
    },
  };
}
