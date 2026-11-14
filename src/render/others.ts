import type { Scene } from 'three';
import { Color, Vector2 } from 'three';
import type { Content } from '../../sim/content/types.ts';
import { heroRig } from '../../sim/hero.ts';
import type { CharacterNeeds, Look } from '../../sim/wear.ts';
import { frameOf, heroBase, lookOf, wearKey, wornBasesOf } from '../../sim/wear.ts';
import type { LiveEvent } from '../backend/live.ts';
import type { LiveMove, LivePlayer, Worn } from '../backend/live-protocol.ts';
import type { ActorPose, ActorView } from './actor-view.ts';
import { ACTOR, createActorView } from './actor-view.ts';
import type { CharacterLibrary, LoadedRig } from './character-loader.ts';
import { hasWear, instantiateRig } from './character-loader.ts';
import type { GhostUniforms } from './ghost-material.ts';
import { createGhostUniforms } from './ghost-material.ts';
import type { IsoCamera } from './iso-camera.ts';
import type { Track, TrackPose, TrackSample } from './other-track.ts';
import { createTrack, fadeToward, placeTrack, poseAt, pushSample, TRACK } from './other-track.ts';
import type { Sight } from './sight.ts';
import { SEES_ALL } from './sight.ts';

export const OTHERS = {
  labelLift: 0.45,
  hiddenBelow: 0.01,
  labelClass: 'player-label',
  leavingClass: 'leaving',
  litClass: 'lit',
  leaveMs: 400,
  pickWidth: 0.42,
  pickMinWidth: 18,
  pickPadding: 4,
  pickableFrom: 0.5,
} as const;

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScreenAnchor {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

export interface OtherTarget {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
}

interface PickBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  depth: number;
}

export type LoadNeeds = (needs: CharacterNeeds) => Promise<void>;

export interface OthersOptions {
  readonly scene: Scene;
  readonly library: CharacterLibrary;
  readonly content: Content;
  readonly feather: boolean;
  readonly camera: IsoCamera;
  readonly labels: HTMLElement;
  readonly load: LoadNeeds;
  readonly clock: () => number;
  readonly sight?: Sight;
}

export interface Others {
  handle(event: LiveEvent): void;
  update(dt: number, floor: number): void;
  clear(): void;
  count(): number;
  playerAt(point: ScreenPoint): string | null;
  light(id: string | null): void;
  target(id: string): OtherTarget | null;
  anchorOf(id: string): ScreenAnchor | null;
  groundOf(id: string): { readonly x: number; readonly z: number } | null;
}

interface Fade {
  value: number;
  target: number;
}

interface Figure {
  readonly view: ActorView;
  readonly ghost: GhostUniforms;
  readonly key: string;
  readonly presence: Fade;
}

interface Other {
  readonly id: string;
  readonly track: Track;
  readonly label: HTMLDivElement;
  name: HTMLElement;
  username: string | null;
  readonly shown: Fade;
  readonly box: PickBox;
  pickable: boolean;
  readonly anchor: Vector2;
  feet: number;
  ground: { readonly x: number; readonly z: number } | null;
  readonly old: Figure[];
  hero: string | null;
  worn: Worn;
  here: boolean;
  figure: Figure | null;
}

interface Dressed {
  readonly rig: string;
  readonly look: Look;
  readonly key: string;
}

const WHITE: Color = new Color(0xffffff);

function dressedFor(content: Content, hero: string | null, worn: Worn): Dressed {
  const rig: string = heroRig(content, hero);
  const look: Look = lookOf(content, rig, heroBase(content, rig), wornBasesOf(worn));
  return { rig, look, key: `${rig}#${look.wearables.join('|')}#${look.held.join('|')}` };
}

function needsOf(content: Content, dressed: Dressed): CharacterNeeds {
  const frame: string = frameOf(content, dressed.rig);
  return { rigs: new Set<string>([dressed.rig]), wearables: new Set<string>(dressed.look.wearables.map((id: string): string => wearKey(frame, id))), attachments: new Set<string>(dressed.look.held) };
}

function poseFrom(pose: TrackPose): ActorPose {
  return { pos: { x: pose.x, z: pose.z }, facing: pose.facing, motion: pose.speed >= TRACK.walkFrom ? 'stride' : 'still', gait: pose.speed, knockTime: 0, busy: false, deadTime: 0 };
}

export function createOthers(options: OthersOptions): Others {
  const { content, library, scene, camera } = options;
  const sight: Sight = options.sight ?? SEES_ALL;
  const others: Map<string, Other> = new Map<string, Other>();
  const loading: Set<string> = new Set<string>();
  const failed: Set<string> = new Set<string>();
  const point: Vector2 = new Vector2();
  const foot: Vector2 = new Vector2();
  let lit: string | null = null;

  const makeFigure = (other: Other, dressed: Dressed, facing: number): Figure | null => {
    const loaded: LoadedRig | undefined = library.rigs.get(dressed.rig);
    if (loaded === undefined || !hasWear(library, loaded.def.frame, dressed.look.wearables, dressed.look.held)) return null;
    const ghost: GhostUniforms = createGhostUniforms(WHITE, 0);
    ghost.rim.value = 0;
    ghost.dissolve.value = 1;
    const view: ActorView = createActorView(instantiateRig(loaded, library, { tint: content.player.tint, glow: content.player.color, ghost, feather: options.feather }), 1, facing, ACTOR.friendlyHover);
    view.rig.setGear(dressed.look.held);
    view.rig.setWear(dressed.look.wearables, dressed.look.hidden);
    view.setShadowOpacity(0);
    scene.add(view.rig.root);
    const presence: Fade = { value: 0, target: other.here ? 1 : 0 };
    return { view, ghost, key: dressed.key, presence };
  };

  const request = (dressed: Dressed): void => {
    if (loading.has(dressed.key) || failed.has(dressed.key)) return;
    loading.add(dressed.key);
    const fetch = async (): Promise<void> => {
      try {
        await options.load(needsOf(content, dressed));
      } catch {
        failed.add(dressed.key);
      }
      loading.delete(dressed.key);
    };
    void fetch();
  };

  const redress = (other: Other, facing: number): void => {
    const dressed: Dressed = dressedFor(content, other.hero, other.worn);
    if (other.figure?.key === dressed.key) return;
    const made: Figure | null = makeFigure(other, dressed, facing);
    if (made === null) {
      request(dressed);
      return;
    }
    if (other.figure !== null) {
      other.figure.presence.target = 0;
      other.old.push(other.figure);
    }
    other.figure = made;
  };

  const rename = (other: Other, name: string): void => {
    if (other.name.textContent === name) return;
    const old: HTMLElement = other.name;
    const fresh: HTMLElement = document.createElement('b');
    fresh.textContent = name;
    old.after(fresh);
    old.classList.add(OTHERS.leavingClass);
    window.setTimeout((): void => old.remove(), OTHERS.leaveMs);
    other.name = fresh;
  };

  const arrive = (player: LivePlayer): void => {
    const sample: TrackSample = { at: options.clock(), x: player.x, z: player.z, facing: player.facing };
    const known: Other | undefined = others.get(player.id);
    if (known !== undefined) {
      known.here = true;
      known.hero = player.hero;
      known.worn = player.worn;
      known.username = player.username;
      rename(known, player.name);
      known.shown.target = 1;
      if (known.figure !== null) known.figure.presence.target = 1;
      return;
    }
    const label: HTMLDivElement = document.createElement('div');
    label.className = OTHERS.labelClass;
    const inner: HTMLSpanElement = document.createElement('span');
    const name: HTMLElement = document.createElement('b');
    name.textContent = player.name;
    inner.append(name);
    label.append(inner);
    label.style.opacity = '0';
    options.labels.append(label);
    others.set(player.id, { id: player.id, track: createTrack(sample), label, name, username: player.username, shown: { value: 0, target: 1 }, box: { minX: 0, minY: 0, maxX: 0, maxY: 0, depth: 0 }, pickable: false, anchor: new Vector2(), feet: 0, ground: null, old: [], hero: player.hero, worn: player.worn, here: true, figure: null });
  };

  const depart = (other: Other): void => {
    other.here = false;
    other.pickable = false;
    other.shown.target = 0;
    if (other.figure !== null) other.figure.presence.target = 0;
  };

  const move = (step: LiveMove, at: number): void => {
    const other: Other | undefined = others.get(step.id);
    if (other !== undefined && other.here) pushSample(other.track, { at, x: step.x, z: step.z, facing: step.facing });
  };

  const shownTarget = (id: string): Other | null => {
    const other: Other | undefined = others.get(id);
    return other === undefined || !other.here ? null : other;
  };

  const forget = (other: Other): void => {
    if (lit === other.id) lit = null;
    other.figure?.view.dispose();
    for (const figure of other.old.splice(0, other.old.length)) figure.view.dispose();
    other.label.remove();
    others.delete(other.id);
  };

  return {
    handle(event: LiveEvent): void {
      switch (event.type) {
        case 'present': {
          const ids: ReadonlySet<string> = new Set<string>(event.players.map((player: LivePlayer): string => player.id));
          for (const other of others.values()) if (!ids.has(other.id)) depart(other);
          for (const player of event.players) {
            arrive(player);
            const other: Other | undefined = others.get(player.id);
            if (other !== undefined) placeTrack(other.track, { at: options.clock(), x: player.x, z: player.z, facing: player.facing });
          }
          return;
        }
        case 'joined': {
          arrive(event.player);
          const other: Other | undefined = others.get(event.player.id);
          if (other !== undefined) placeTrack(other.track, { at: options.clock(), x: event.player.x, z: event.player.z, facing: event.player.facing });
          return;
        }
        case 'left': {
          const other: Other | undefined = others.get(event.id);
          if (other !== undefined) depart(other);
          return;
        }
        case 'look': {
          const other: Other | undefined = others.get(event.id);
          if (other === undefined) return;
          other.hero = event.hero;
          other.worn = event.worn;
          if (event.name !== null) rename(other, event.name);
          return;
        }
        case 'moves':
          for (const step of event.moves) move(step, event.at);
          return;
        case 'gone':
          for (const other of others.values()) depart(other);
          return;
        case 'said':
        case 'refused':
        case 'friends':
          return;
      }
    },
    update(dt: number, floor: number): void {
      sight.refresh();
      const at: number = options.clock() - TRACK.delayMs;
      const show = (figure: Figure, pose: TrackPose): number => {
        figure.presence.value = fadeToward(figure.presence.value, figure.presence.target, dt);
        const presence: number = figure.presence.value;
        figure.ghost.dissolve.value = 1 - presence;
        figure.view.setShadowOpacity(presence);
        figure.view.rig.root.visible = presence > OTHERS.hiddenBelow;
        figure.view.sync(dt, poseFrom(pose), { rise: 1, floor, turnRate: ACTOR.npcTurnRate, seen: sight.sees(pose.x, floor + figure.view.height / 2, pose.z, figure.view.height) });
        return presence;
      };
      for (const other of others.values()) {
        const pose: TrackPose | null = poseAt(other.track, at);
        if (pose === null) continue;
        if (other.here) redress(other, pose.facing);
        other.shown.value = fadeToward(other.shown.value, other.shown.target, dt);
        for (let index: number = other.old.length - 1; index >= 0; index -= 1) {
          const figure: Figure | undefined = other.old[index];
          if (figure === undefined || show(figure, pose) > OTHERS.hiddenBelow) continue;
          figure.view.dispose();
          other.old.splice(index, 1);
        }
        const figure: Figure | null = other.figure;
        const presence: number = figure === null ? 0 : show(figure, pose);
        other.ground = { x: pose.x, z: pose.z };
        const shown: number = Math.min(other.shown.value, presence);
        other.pickable = false;
        if (figure !== null) {
          camera.project(pose.x, floor + figure.view.height + OTHERS.labelLift, pose.z, point);
          other.label.style.transform = `translate3d(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px, 0)`;
          other.anchor.copy(point);
          const head: boolean = camera.project(pose.x, floor + figure.view.height, pose.z, point);
          const feet: boolean = camera.project(pose.x, floor, pose.z, foot);
          if (head && feet && other.here && shown >= OTHERS.pickableFrom) {
            const half: number = Math.max(OTHERS.pickMinWidth, Math.abs(foot.y - point.y) * OTHERS.pickWidth) / 2;
            other.box.minX = foot.x - half - OTHERS.pickPadding;
            other.box.maxX = foot.x + half + OTHERS.pickPadding;
            other.box.minY = Math.min(point.y, foot.y) - OTHERS.pickPadding;
            other.box.maxY = Math.max(point.y, foot.y) + OTHERS.pickPadding;
            other.box.depth = -foot.y;
            other.feet = foot.y;
            other.pickable = true;
          }
        }
        other.label.style.opacity = shown.toFixed(3);
        if (!other.here && other.shown.value <= OTHERS.hiddenBelow && presence <= OTHERS.hiddenBelow) forget(other);
      }
    },
    clear(): void {
      for (const other of others.values()) forget(other);
    },
    count(): number {
      return [...others.values()].filter((other: Other): boolean => other.here).length;
    },
    playerAt(at: ScreenPoint): string | null {
      let best: Other | null = null;
      for (const other of others.values()) {
        if (!other.pickable || at.x < other.box.minX || at.x > other.box.maxX || at.y < other.box.minY || at.y > other.box.maxY) continue;
        if (best === null || other.box.depth < best.box.depth) best = other;
      }
      return best?.id ?? null;
    },
    light(id: string | null): void {
      if (id === lit) return;
      if (lit !== null) others.get(lit)?.label.classList.remove(OTHERS.litClass);
      lit = id;
      if (id !== null) others.get(id)?.label.classList.add(OTHERS.litClass);
    },
    target(id: string): OtherTarget | null {
      const other: Other | null = shownTarget(id);
      return other === null ? null : { id: other.id, name: other.name.textContent, username: other.username };
    },
    anchorOf(id: string): ScreenAnchor | null {
      const other: Other | null = shownTarget(id);
      return other === null || other.figure === null ? null : { x: other.anchor.x, top: other.anchor.y, bottom: Math.max(other.anchor.y, other.feet) };
    },
    groundOf(id: string): { readonly x: number; readonly z: number } | null {
      return shownTarget(id)?.ground ?? null;
    },
  };
}
