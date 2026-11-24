import { standHeight } from '../../sim/nav/climb.ts';
import type { Sight } from './sight.ts';
import { drawnBy, SEES_ALL } from './sight.ts';
import type { Box3, Object3D, Scene } from 'three';
import { isTimeHeld, knockTime } from '../../sim/world/movement.ts';
import { Color } from 'three';
import type { Content, EmpowerLook, MonsterDef, ZoneDef } from '../../sim/content/types.ts';
import type { CostLimit, FramePacer } from './paced-work.ts';
import { browserPacer, PACED_WORK, workPaced } from './paced-work.ts';
import type { Look } from '../../sim/wear.ts';
import { HERO, heroRig } from '../../sim/hero.ts';
import { heroBase, lookOf, wearKey, wornWearables } from '../../sim/wear.ts';
import { wakeStage } from '../../sim/world/wake.ts';
import { wakePose } from './wake-pose.ts';
import type { ActorState, Equipment, MomentState, MonsterState, NpcState, PlayerState, World, WorldEvent } from '../../sim/world/types.ts';
import type { ActorPose, ActorView, SyncOptions } from './actor-view.ts';
import { ACTOR, createActorView } from './actor-view.ts';
import type { HeroViews } from './hero-views.ts';
import { createHeroViews } from './hero-views.ts';
import type { CharacterLibrary, LoadedRig, RigInstance } from './character-loader.ts';
import { hasWear, instantiateRig } from './character-loader.ts';
import { holdEquipped } from './hero-gear.ts';
import type { GhostUniforms } from './ghost-material.ts';
import { createGhostUniforms } from './ghost-material.ts';
import { echoFade, momentOfEcho } from '../../sim/world/moments.ts';
import { unisonOf } from '../../sim/world/unison.ts';
import type { HeroPush } from '../../sim/world/hero-push.ts';
import { HERO_PUSH, pushOnHero, reelAnimation } from '../../sim/world/hero-push.ts';
import type { ParticleSystem } from './particles.ts';
import type { SpinPose, SpinView } from './spin-view.ts';
import { createSpinView } from './spin-view.ts';
import { spinStyleFrom } from './spin-style.ts';
import type { ActorGuard } from './actor-guard.ts';
import { createActorGuard, readyToInspect, setOffView } from './actor-guard.ts';
import { warnInConsole } from '../backend/console-log.ts';
import type { BodyChoice } from './body-choice.ts';
import { bodyArrived, chooseBody } from './body-choice.ts';
import type { ShadeMotion } from './shadow-shade.ts';
import { shadowOf, stepShade, veilOf } from './shadow-shade.ts';
import type { Soaking } from './soak-look.ts';
import { SOAK_COLOR, SOAK_LOOK, soakDried, soakedFor, stepSoak } from './soak-look.ts';
import type { CountLook, CountShade } from './count-look.ts';
import { countShadeOf, createCountLook } from './count-look.ts';
import { createPresenceLook } from './presence-look.ts';
import type { PresenceLook } from './presence-look.ts';
import type { RankRim, RankLookView } from './rank-look.ts';
import { createRankLook } from './rank-look.ts';
import type { VfxShadow } from '../../sim/content/vfx-types.ts';
import type { BodySwap, SwapMix } from './body-swap.ts';
import { startSwap, stepSwap } from './body-swap.ts';
import { crustBody } from './body-crust.ts';
import { sharesLook } from './rest-looks.ts';
import type { ZoneBody } from './zone-bodies.ts';
import { monsterKey, zoneBodies } from './zone-bodies.ts';
import type { StrikeHolds } from './strike-holds.ts';
import { strikeHolds } from './strike-holds.ts';
import { raiseBodies } from './body-raise.ts';

export const ACTORS = {
  monsterFlash: 1,
  burnFlash: 0.35,
  playerFlash: 0.4,
  defaultHeight: 2.2,
  npcAppearRate: 3.4,
  npcSettledWithin: 0.01,
  blockTime: 0.35,
  reelTime: 0.85,
  echoMix: 0.85,
  echoOpacity: 0.78,
  turnRim: 4,
  leaveTime: 1.2,
  pooledPerKind: 8,
  sparesPerFrame: 1,
  wearWait: 4,
} as const;

interface EchoLook {
  readonly ghost: GhostUniforms;
  readonly from: Color;
  readonly to: Color;
}

interface MonsterEntry {
  readonly def: MonsterDef;
  readonly view: ActorView;
  readonly spawnTime: number;
  readonly echo: EchoLook | null;
  readonly partial: boolean;
  readonly standIn: boolean;
  checked: boolean;
  swap: BodySwap<ActorView> | null;
}

interface LeavingEcho {
  readonly entry: MonsterEntry;
  readonly ghost: GhostUniforms;
  age: number;
}

interface NpcEntry {
  readonly view: ActorView;
  pose: ActorPose;
  shown: number;
  fade: number;
}

function easedFade(amount: number): number {
  const clamped: number = Math.min(1, Math.max(0, amount));
  return clamped * clamped * (3 - 2 * clamped);
}

export interface Actors {
  sync(dt: number, world: World, hoveredId: number | null): void;
  handle(events: readonly WorldEvent[], world: World): void;
  refreshWear(world: World): void;
  heightOf(actorId: number): number;
  headRiseOf(actorId: number, dt: number): number;
  boundsOf(actorId: number, out: Box3): boolean;
  hero(): Object3D;
  standIns(zone: ZoneDef): Object3D[];
  raise(world: World): Promise<void>;
}

const HIT_WHITE: Color = new Color(0xffffff);
const HIT_BURN: Color = new Color(0xff8a3a);
const HIT_RED: Color = new Color(0xff6040);

function standDown(view: ActorView): void {
  view.rig.setGear([]);
  view.standDown();
}

function stillPose(actor: ActorState): ActorPose {
  return { pos: actor.pos, facing: actor.facing, motion: 'still', gait: 0, knockTime: 0, busy: false, held: false, beat: null, deadTime: 0 };
}

function poseOf(actor: ActorState, beat: number | null): ActorPose {
  return { pos: actor.pos, facing: actor.facing, motion: actor.motion, gait: actor.gait, knockTime: knockTime(actor), busy: actor.action !== null, held: isTimeHeld(actor), beat, deadTime: actor.deadTime };
}

function npcPose(npc: NpcState): ActorPose {
  return { pos: npc.pos, facing: npc.facing, motion: npc.motion, gait: npc.gait, knockTime: 0, busy: false, held: false, beat: null, deadTime: 0 };
}


function dress(content: Content, rigId: string, rig: RigInstance, clothes: readonly string[], equipped: Equipment | null): void {
  const look: Look = lookOf(content, rigId, clothes, equipped);
  rig.setWear(look.wearables, look.hidden);
}

function showBody(view: ActorView, echo: EchoLook | null, amount: number): void {
  view.rig.setFade(amount);
  view.rig.setOpacity(ACTORS.echoOpacity * amount);
  view.setShadowOpacity(echo === null ? amount : ACTORS.echoOpacity * amount);
}

function fadeEcho(view: ActorView, ghost: GhostUniforms, fade: number): void {
  ghost.dissolve.value = fade;
  view.rig.setOpacity(ACTORS.echoOpacity * (1 - fade));
  view.setShadowOpacity(ACTORS.echoOpacity * (1 - fade));
}

function echoLook(current: World, monster: MonsterState): EchoLook | null {
  const moment: MomentState | null = momentOfEcho(current, monster.id);
  if (moment === null) return null;
  const from: Color = new Color(moment.def.tint);
  const to: Color = new Color(current.content.moments.hostileTint);
  return { ghost: createGhostUniforms(from, ACTORS.echoMix), from, to };
}

export function createActors(scene: Scene, library: CharacterLibrary, world: World, feather: boolean, sight: Sight = SEES_ALL, particles: ParticleSystem | null = null, pacer: FramePacer = browserPacer()): Actors {
  const content: Content = world.content;
  const spin: SpinView = createSpinView(scene, particles, spinStyleFrom(window.location.search));
  const heroView = (loaded: LoadedRig, hero: PlayerState): ActorView => {
    const view: ActorView = createActorView(instantiateRig(loaded, library, { tint: content.player.tint, glow: content.player.color, ghost: null, feather }, 'together'), HERO.size, hero.facing);
    holdEquipped(content, view.rig, hero.equipped);
    dress(content, loaded.def.id, view.rig, heroBase(content, loaded.def.id), hero.equipped);
    scene.add(view.rig.root);
    return view;
  };
  const playerRig: LoadedRig | undefined = library.rigs.get(heroRig(content, world.player.hero));
  if (playerRig === undefined) throw new Error(`Player rig "${heroRig(content, world.player.hero)}" was not loaded`);
  let playerView: ActorView = heroView(playerRig, world.player);
  const rivals: HeroViews<ActorView> = createHeroViews((hero: PlayerState): ActorView | null => {
    const loaded: LoadedRig | undefined = library.rigs.get(heroRig(content, hero.hero));
    return loaded === undefined ? null : heroView(loaded, hero);
  });
  rivals.each(world, (): void => undefined);
  const shade: ShadeMotion = { value: 0, speed: 0 };
  const shadeColor: Color = new Color();
  const soaks: Map<number, Soaking> = new Map<number, Soaking>();
  const strikes: StrikeHolds = strikeHolds();
  const countLook: CountLook = createCountLook(scene);
  const presenceLook: PresenceLook = createPresenceLook(scene);
  const rankLook: RankLookView = createRankLook();
  const countShades: Map<number, { readonly motion: ShadeMotion; color: Color }> = new Map<number, { readonly motion: ShadeMotion; color: Color }>();
  const standChosen = (current: World): void => {
    const wanted: string = heroRig(content, current.player.hero);
    if (playerView.rig.def.id === wanted) return;
    const loaded: LoadedRig | undefined = library.rigs.get(wanted);
    if (loaded === undefined) return;
    playerView.dispose();
    playerView = heroView(loaded, current.player);
  };
  const dressHero = (current: World): void => {
    standChosen(current);
    holdEquipped(content, playerView.rig, current.player.equipped);
    dress(content, playerView.rig.def.id, playerView.rig, heroBase(content, playerView.rig.def.id), current.player.equipped);
    rivals.each(current, (hero: PlayerState, view: ActorView): void => {
      holdEquipped(content, view.rig, hero.equipped);
      dress(content, view.rig.def.id, view.rig, heroBase(content, view.rig.def.id), hero.equipped);
    });
  };
  const librarySize = (): number => library.rigs.size + library.wearables.size + library.attachments.size;
  let dressedWith: number = librarySize();
  const monsters: Map<number, MonsterEntry> = new Map<number, MonsterEntry>();
  const npcs: Map<number, NpcEntry> = new Map<number, NpcEntry>();
  let npcZone: World['zone'] | null = null;

  const npcEntry = (npc: NpcState, arriving: boolean): NpcEntry | null => {
    const existing: NpcEntry | undefined = npcs.get(npc.id);
    if (existing !== undefined) return existing;
    const rig: LoadedRig | undefined = library.rigs.get(npc.def.rig);
    if (rig === undefined || !hasWear(library, rig.def.frame, wornWearables(content, npc.def.rig, npc.def.wear, null), npc.def.gear)) return null;
    const view: ActorView = createActorView(instantiateRig(rig, library, { tint: npc.def.tint, glow: npc.def.color, ghost: null, feather }, 'together', true), npc.def.scale, npc.facing, ACTOR.friendlyHover);
    view.rig.setGear(npc.def.gear);
    dress(content, npc.def.rig, view.rig, npc.def.wear, null);
    scene.add(view.rig.root);
    const entry: NpcEntry = { view, pose: npcPose(npc), shown: arriving ? 0 : 1, fade: 1 };
    npcs.set(npc.id, entry);
    return entry;
  };

  const leaving: LeavingEcho[] = [];

  const pool: Map<string, ActorView[]> = new Map<string, ActorView[]>();
  let bodies: ReadonlyMap<string, ZoneBody> = new Map<string, ZoneBody>();
  let spareRound: number = 0;
  let sparesDue: readonly ZoneBody[] | null = null;
  let raiseRound: number = 0;

  const guard: ActorGuard = createActorGuard(warnInConsole);
  const waiting: Map<number, number> = new Map<number, number>();

  const lateRigs: Set<string> = new Set<string>();
  const warnLate = (rig: string, label: string): void => {
    if (lateRigs.has(rig)) return;
    lateRigs.add(rig);
    warnInConsole(`Rig ${rig} has not loaded; ${label} and every other monster on it are drawn with a stand-in body until it does`);
  };

  const makeMonsterView = (def: MonsterDef, facing: number, echo: EchoLook | null, partial: boolean = false, rig: LoadedRig | undefined = library.rigs.get(def.rig)): ActorView | null => {
    if (rig === undefined || (!partial && !hasWear(library, rig.def.frame, wornWearables(content, def.rig, def.wear, null), def.gear))) return null;
    const view: ActorView = createActorView(instantiateRig(rig, library, { tint: echo === null ? def.tint : '#ffffff', glow: echo === null ? def.color : '#ffffff', ghost: echo?.ghost ?? null, feather }, 'together', sharesLook(def, echo !== null)), def.scale, facing);
    if (echo === null && def.crust !== null) crustBody(view.rig.root, def.crust, def.color);
    view.rig.setGear(partial ? def.gear.filter((id: string): boolean => library.attachments.has(id)) : def.gear);
    dress(content, def.rig, view.rig, partial ? def.wear.filter((id: string): boolean => library.wearables.has(wearKey(rig.def.frame, id))) : def.wear, null);
    view.rig.setOpacity(ACTORS.echoOpacity);
    if (echo !== null) view.setShadowOpacity(ACTORS.echoOpacity);
    view.prime();
    return view;
  };

  const monsterView = (def: MonsterDef, facing: number, echo: EchoLook | null, partial: boolean): ActorView | null => {
    if (partial) return makeMonsterView(def, facing, echo, true);
    const pooled: ActorView | undefined = echo === null ? pool.get(monsterKey(def))?.pop() : undefined;
    if (pooled === undefined) return makeMonsterView(def, facing, echo);
    pooled.face(facing);
    pooled.revive();
    return pooled;
  };

  const keep = (def: MonsterDef, view: ActorView): void => {
    view.detach();
    view.rig.setRankRim(HIT_WHITE, 0);
    const kept: ActorView[] = pool.get(monsterKey(def)) ?? [];
    if (kept.length >= Math.max(ACTORS.pooledPerKind, bodies.get(monsterKey(def))?.spares ?? 0)) {
      view.dispose();
      return;
    }
    kept.push(view);
    pool.set(monsterKey(def), kept);
  };

  const retire = (entry: MonsterEntry): void => {
    if (entry.swap !== null) {
      entry.swap.old.dispose();
      entry.swap = null;
      showBody(entry.view, entry.echo, 1);
    }
    if (entry.echo === null && !entry.partial && !entry.standIn) keep(entry.def, entry.view);
    else entry.view.dispose();
  };

  const unloaded = (def: MonsterDef, frame: string): string[] => [
    ...wornWearables(content, def.rig, def.wear, null).filter((id: string): boolean => !library.wearables.has(wearKey(frame, id))),
    ...def.gear.filter((id: string): boolean => !library.attachments.has(id)),
  ];

  const entryFor = (current: World, monster: MonsterState): MonsterEntry | null => {
    const existing: MonsterEntry | undefined = monsters.get(monster.id);
    if (existing !== undefined) return existing;
    const choice: BodyChoice<LoadedRig> = chooseBody(library.rigs, monster.def.rig, content.rigs.get(monster.def.rig)?.frame ?? null, playerView.rig.def.id);
    if (choice.kind === 'none') return null;
    const standIn: boolean = choice.kind === 'stand_in';
    const missing: string[] = unloaded(monster.def, choice.rig.def.frame);
    const since: number = waiting.get(monster.id) ?? current.time;
    waiting.set(monster.id, since);
    if (!standIn && missing.length > 0 && current.time - since < ACTORS.wearWait) return null;
    waiting.delete(monster.id);
    const partial: boolean = standIn || missing.length > 0;
    if (standIn) warnLate(monster.def.rig, `${monster.def.id} (#${monster.id})`);
    else if (partial) guard.missing(monster.id, monster.def.id, missing.join(', '));
    const echo: EchoLook | null = echoLook(current, monster);
    const view: ActorView | null = standIn ? makeMonsterView(monster.def, monster.facing, echo, true, choice.rig) : monsterView(monster.def, monster.facing, echo, partial);
    if (view === null) return null;
    scene.add(view.rig.root);
    const entry: MonsterEntry = { def: monster.def, view, spawnTime: Math.max(monster.spawnTime, 1e-3), echo, partial, standIn, checked: false, swap: null };
    monsters.set(monster.id, entry);
    if (monster.yielded) standDown(view);
    else if (!monster.alive) view.die();
    return entry;
  };

  const rebuilt = (monster: MonsterState, entry: MonsterEntry): MonsterEntry => {
    if ((!entry.standIn && !entry.partial) || entry.swap !== null) return entry;
    const own: LoadedRig | undefined = library.rigs.get(monster.def.rig);
    if (own === undefined || !monster.alive) return entry;
    const missing: string[] = unloaded(monster.def, own.def.frame);
    if (!bodyArrived(entry, true, missing)) return entry;
    const view: ActorView | null = makeMonsterView(monster.def, monster.facing, entry.echo, missing.length > 0, own);
    if (view === null) return entry;
    showBody(view, entry.echo, 0);
    scene.add(view.rig.root);
    const next: MonsterEntry = { ...entry, view, partial: missing.length > 0, standIn: false, checked: false, swap: startSwap(entry.view) };
    monsters.set(monster.id, next);
    return next;
  };

  const short = (body: ZoneBody): boolean => (pool.get(monsterKey(body.def))?.length ?? 0) < body.spares;
  const spareLimit: CostLimit<ZoneBody> = { perFrame: ACTORS.sparesPerFrame, cost: (body: ZoneBody): number => (short(body) ? 1 : 0) };
  const buildSpares = (due: readonly ZoneBody[], round: number): void => {
    const jobs: ZoneBody[] = due.flatMap((body: ZoneBody): ZoneBody[] => Array.from({ length: body.spares }, (): ZoneBody => body));
    const work = (body: ZoneBody): void => {
      if (round !== spareRound || !short(body)) return;
      const view: ActorView | null = makeMonsterView(body.def, 0, null);
      if (view !== null) keep(body.def, view);
    };
    pacer
      .next()
      .then((): Promise<void> => workPaced(jobs, work, pacer, PACED_WORK.frameBudgetMs, spareLimit))
      .catch((error: unknown): void => {
        warnInConsole(`Building spare monster bodies failed: ${String(error)}`);
      });
  };

  const viewOf = (actorId: number): ActorView | null => {
    if (actorId === world.player.id) return playerView;
    return rivals.view(actorId) ?? monsters.get(actorId)?.view ?? npcs.get(actorId)?.view ?? null;
  };
  const fell = (actorId: number, current: World): void => {
    const fallen: MonsterState | undefined = current.monsters.find((candidate: MonsterState): boolean => candidate.id === actorId);
    const view: ActorView | null = viewOf(actorId);
    if (fallen?.yielded === true && view !== null) standDown(view);
    else view?.die();
    monsters.get(actorId)?.swap?.old.die();
  };

  return {
    hero(): Object3D {
      return playerView.rig.root;
    },
    standIns(zone: ZoneDef): Object3D[] {
      bodies = zoneBodies(content, zone);
      spareRound += 1;
      sparesDue = [...bodies.values()];
      const defs: MonsterDef[] = sparesDue.map((body: ZoneBody): MonsterDef => body.def);
      const unwanted: ActorView[] = [];
      for (const [look, views] of pool) {
        if (bodies.has(look)) continue;
        unwanted.push(...views);
        pool.delete(look);
      }
      const made: ActorView[] = [];
      for (const def of defs) {
        const view: ActorView | null = pool.get(monsterKey(def))?.[0] ?? makeMonsterView(def, 0, null);
        if (view === null) continue;
        if (!(pool.get(monsterKey(def))?.includes(view) ?? false)) keep(def, view);
        made.push(view);
      }
      for (const view of unwanted) view.dispose();
      return made.map((view: ActorView): Object3D => view.rig.root);
    },
    raise(current: World): Promise<void> {
      const round: number = raiseRound;
      return raiseBodies(current, { body: (monster: MonsterState): Object3D | null => entryFor(current, monster)?.view.rig.root ?? null, pacer, live: (): boolean => round === raiseRound });
    },
    refreshWear(current: World): void {
      dressHero(current);
    },
    boundsOf(actorId: number, out: Box3): boolean {
      const view: ActorView | null = viewOf(actorId);
      if (view === null || !view.rig.root.visible) return false;
      view.bounds(out);
      return !out.isEmpty();
    },
    heightOf(actorId: number): number {
      return viewOf(actorId)?.height ?? ACTORS.defaultHeight;
    },
    headRiseOf(actorId: number, dt: number): number {
      return viewOf(actorId)?.headRise(dt) ?? ACTORS.defaultHeight;
    },
    sync(dt: number, current: World, hoveredId: number | null): void {
      if (sparesDue !== null) {
        buildSpares(sparesDue, spareRound);
        sparesDue = null;
      }
      const floorAt = (x: number, z: number): number => standHeight(current.zone, current.content.props, x, z);
      for (const id of strikes.step(dt)) fell(id, current);
      sight.refresh();
      const seen = (view: ActorView, x: number, floor: number, z: number): boolean => sight.sees(x, floor + view.height / 2, z, view.height);
      const draw = (view: ActorView, x: number, floor: number, z: number): void => {
        setOffView(view.rig.root, !drawnBy(sight, x, floor, z, view.height));
      };
      standChosen(current);
      countLook.update(dt, current);
      presenceLook.update(dt, current);
      rankLook.update(dt, current);
      if (librarySize() !== dressedWith) {
        dressedWith = librarySize();
        dressHero(current);
      }
      holdEquipped(content, playerView.rig, current.player.equipped);
      playerView.wake(current.wake === null ? null : wakePose(wakeStage(current.wake.plan, current.wake.elapsed), current.wake.elapsed));
      const spun: SpinPose = spin.step(dt, current.time, current.player);
      playerView.spin(spun);
      playerView.setEdge(current.zone.heroLight.rim);
      const shadow: VfxShadow | null = shadowOf(current.player);
      const veil: EmpowerLook | null = veilOf(current.player.powers);
      if (shadow !== null) shadeColor.set(shadow.color);
      else if (veil !== null) shadeColor.set(veil.color);
      stepShade(shade, Math.max(shadow?.strength ?? 0, veil?.shade ?? 0), dt);
      playerView.rig.setShade(shadeColor, shade.value, true, 0);
      playerView.sync(dt * strikes.rate(current.player.id), poseOf(current.player, null), { rise: 1, floor: floorAt(current.player.pos.x, current.player.pos.z), turnRate: ACTOR.turnRate, seen: true });
      rivals.each(current, (hero: PlayerState, view: ActorView): void => {
        holdEquipped(content, view.rig, hero.equipped);
        const floor: number = floorAt(hero.pos.x, hero.pos.z);
        draw(view, hero.pos.x, floor, hero.pos.z);
        view.setHover(hero.id === hoveredId);
        view.sync(dt * strikes.rate(hero.id), poseOf(hero, null), { rise: 1, floor, turnRate: ACTOR.turnRate, seen: seen(view, hero.pos.x, floor, hero.pos.z) });
      });
      rivals.sweep(current);
      for (const monster of current.monsters) {
        const found: MonsterEntry | null = entryFor(current, monster);
        if (found === null) continue;
        const entry: MonsterEntry = rebuilt(monster, found);
        const turning: number = 1 - monster.spawnTime / entry.spawnTime;
        if (entry.echo !== null) {
          entry.echo.ghost.tint.value.copy(entry.echo.from).lerp(entry.echo.to, turning);
          entry.echo.ghost.rim.value = 1 + (1 - turning) * ACTORS.turnRim;
          const fade: number = echoFade(current, monster.id);
          if (fade > 0) fadeEcho(entry.view, entry.echo.ghost, fade);
        }
        const soaking: Soaking | undefined = soaks.get(monster.id);
        if (soaking !== undefined) {
          const wetness: number = stepSoak(soaking, dt);
          entry.view.rig.setShade(SOAK_COLOR, wetness * SOAK_LOOK.tint, false, wetness);
        }
        if (soaking !== undefined && soakDried(soaking)) soaks.delete(monster.id);
        const wanted: CountShade | null = countShadeOf(current, monster);
        const counted = countShades.get(monster.id) ?? (wanted === null ? undefined : { motion: { value: 0, speed: 0 }, color: wanted.color });
        if (counted !== undefined) {
          if (wanted !== null) counted.color = wanted.color;
          stepShade(counted.motion, wanted?.mix ?? 0, dt);
          if (soaking === undefined) entry.view.rig.setShade(counted.color, counted.motion.value, false, 0);
          if (wanted === null && counted.motion.value === 0) countShades.delete(monster.id);
          else countShades.set(monster.id, counted);
        }
        const ranked: RankRim | null = entry.echo === null ? rankLook.rimOf(monster.id) : null;
        if (ranked !== null) entry.view.rig.setRankRim(ranked.color, ranked.amount);
        entry.view.setHover(monster.id === hoveredId);
        const floor: number = floorAt(monster.pos.x, monster.pos.z);
        draw(entry.view, monster.pos.x, floor, monster.pos.z);
        if (monster.alive) guard.keep(monster.id, entry.view.rig.root, scene, monster.def.id);
        const pose: ActorPose = monster.yielded ? stillPose(monster) : poseOf(monster, unisonOf(current, monster) === null ? null : current.time);
        const placed: SyncOptions = { rise: entry.echo === null ? turning : 1, floor, turnRate: ACTOR.turnRate, seen: seen(entry.view, monster.pos.x, floor, monster.pos.z) };
        const held: number = dt * strikes.rate(monster.id);
        entry.view.sync(held, pose, placed);
        if (entry.swap !== null) {
          const mix: SwapMix = stepSwap(entry.swap, dt);
          const shown: number = 1 - (entry.echo === null ? 0 : echoFade(current, monster.id));
          showBody(entry.view, entry.echo, mix.incoming * shown);
          showBody(entry.swap.old, entry.echo, mix.outgoing * shown);
          entry.swap.old.sync(held, pose, placed);
          if (mix.done) {
            entry.swap.old.dispose();
            entry.swap = null;
          }
        }
        if (!entry.checked && readyToInspect({ checked: entry.checked, alive: monster.alive, swapping: entry.swap !== null, fadingOut: entry.echo !== null && echoFade(current, monster.id) !== 0 })) {
          entry.checked = true;
          if (!guard.inspect(monster.id, entry.view.rig.root, monster.def.id)) {
            entry.view.rig.setGear([]);
            entry.view.rig.setWear([], []);
          }
        }
      }
      for (let index: number = leaving.length - 1; index >= 0; index -= 1) {
        const echo: LeavingEcho | undefined = leaving[index];
        if (echo === undefined) continue;
        echo.age += dt;
        fadeEcho(echo.entry.view, echo.ghost, Math.min(1, echo.age / ACTORS.leaveTime));
        if (echo.entry.swap !== null) fadeEcho(echo.entry.swap.old, echo.ghost, Math.min(1, echo.age / ACTORS.leaveTime));
        if (echo.age < ACTORS.leaveTime) continue;
        retire(echo.entry);
        leaving.splice(index, 1);
      }
      const sameZone: boolean = npcZone === current.zone;
      npcZone = current.zone;
      const ease: number = 1 - Math.exp(-ACTORS.npcAppearRate * dt);
      for (const npc of current.npcs) {
        const entry: NpcEntry | null = npcEntry(npc, sameZone);
        if (entry === null) continue;
        entry.pose = npcPose(npc);
        entry.shown += (1 - entry.shown) * ease;
        if (1 - entry.shown < ACTORS.npcSettledWithin) entry.shown = 1;
        if (npc.fade !== entry.fade) {
          entry.fade = npc.fade;
          entry.view.rig.setFade(easedFade(npc.fade));
          entry.view.setShadowOpacity(easedFade(npc.fade));
        }
        entry.view.setHover(npc.id === hoveredId);
        const floor: number = floorAt(entry.pose.pos.x, entry.pose.pos.z);
        draw(entry.view, entry.pose.pos.x, floor, entry.pose.pos.z);
        entry.view.sync(dt, entry.pose, { rise: entry.shown, floor, turnRate: ACTOR.npcTurnRate, seen: seen(entry.view, entry.pose.pos.x, floor, entry.pose.pos.z) });
      }
      for (const [id, entry] of npcs) {
        if (current.npcs.some((npc: NpcState): boolean => npc.id === id)) continue;
        entry.shown -= entry.shown * ease;
        if (!sameZone || entry.shown < ACTORS.npcSettledWithin || entry.fade < 1) {
          entry.view.dispose();
          npcs.delete(id);
          continue;
        }
        entry.view.setHover(false);
        const floor: number = floorAt(entry.pose.pos.x, entry.pose.pos.z);
        draw(entry.view, entry.pose.pos.x, floor, entry.pose.pos.z);
        entry.view.sync(dt, entry.pose, { rise: entry.shown, floor, turnRate: ACTOR.npcTurnRate, seen: seen(entry.view, entry.pose.pos.x, floor, entry.pose.pos.z) });
      }
    },
    handle(events: readonly WorldEvent[], current: World): void {
      const guarded: Set<number> = new Set<number>();
      countLook.handle(events);
      strikes.handle(events, current);
      for (const event of events) {
        switch (event.type) {
          case 'skill_start':
            viewOf(event.actorId)?.startAction(event.skill.animation, event.windup, event.recovery);
            break;
          case 'skill_interrupt':
            viewOf(event.actorId)?.interrupt();
            break;
          case 'soak':
            soakedFor(soaks, event.targetId, event.duration);
            break;
          case 'stun':
          case 'mend':
          case 'heal':
            break;
          case 'damage': {
            const isPlayer: boolean = event.targetId === current.player.id;
            const pushed: HeroPush | null = event.targetId === current.player.id && !event.burn && !event.shoveGraced && !event.killed && current.player.action === null ? pushOnHero(current.player, event.skill.knockback, event.direction) : null;
            const stagger: boolean = isPlayer ? current.player.action === null && (!current.player.moving || (pushed !== null && pushed.reaction !== 'none')) : event.skill.stagger > 0;
            const struck: HeroPush | null = stagger ? pushed : null;
            const reeled: boolean = struck?.reaction === 'reel' && struck.side !== null && (playerView.startAction(reelAnimation(struck.side), 0, ACTORS.reelTime) || playerView.startAction(HERO_PUSH.reelAnimation, 0, ACTORS.reelTime));
            if (event.burn) viewOf(event.targetId)?.hit(HIT_BURN, ACTORS.burnFlash, false);
            else viewOf(event.targetId)?.hit(isPlayer ? HIT_RED : HIT_WHITE, isPlayer ? ACTORS.playerFlash : ACTORS.monsterFlash, stagger && !reeled && !event.killed && !guarded.has(event.targetId));
            break;
          }
          case 'guarded': {
            const monster: MonsterState | undefined = current.monsters.find((candidate: MonsterState): boolean => candidate.id === event.monsterId);
            const midSwing: boolean = monster?.action?.phase === 'windup';
            const played: boolean = !midSwing && (viewOf(event.monsterId)?.startAction(event.broken ? 'guard_break' : 'block', 0, event.broken ? (monster?.stagger ?? ACTORS.blockTime) : ACTORS.blockTime) ?? false);
            if (played || !event.broken) guarded.add(event.monsterId);
            break;
          }
          case 'death':
            if (event.team === 'player') fell(event.actorId, current);
            break;
          case 'unison_look':
            for (const id of event.monsterIds) viewOf(id)?.glance(event.turn);
            break;
          case 'unison_flinch':
            for (const id of event.monsterIds) viewOf(id)?.flinch(event.time);
            break;
          case 'player_respawn':
            playerView.revive();
            break;
          case 'character_changed':
            dressHero(current);
            break;
          case 'monster_remove': {
            const entry: MonsterEntry | undefined = monsters.get(event.monsterId);
            guard.forget(event.monsterId);
            strikes.forget(event.monsterId);
            waiting.delete(event.monsterId);
            if (entry !== undefined) {
              if (entry.echo === null) retire(entry);
              else leaving.push({ entry, ghost: entry.echo.ghost, age: entry.echo.ghost.dissolve.value * ACTORS.leaveTime });
              monsters.delete(event.monsterId);
            }
            break;
          }
          case 'zone_changed':
            spareRound += 1;
            raiseRound += 1;
            sparesDue = null;
            spin.clear();
            strikes.clear();
            waiting.clear();
            for (const entry of monsters.values()) retire(entry);
            monsters.clear();
            for (const echo of leaving.splice(0, leaving.length)) retire(echo.entry);
            break;
          case 'skill_impact':
          case 'channel_end':
          case 'hazard':
          case 'checkpoint':
          case 'dialogue_line':
          case 'dialogue_closed':
          case 'quest_started':
          case 'quest_advanced':
          case 'act_ended':
          case 'triggered':
          case 'quest_completed':
          case 'waypoint_unlocked':
          case 'exit_locked':
          case 'boss_phase':
          case 'boss_defeated':
          case 'bark':
          case 'scene_lead':
          case 'scene_ward':
          case 'flask_used':
          case 'boss_held':
          case 'count_broken':
          case 'piece_unsealed':
          case 'flask_upgraded':
          case 'flasks_refilled':
          case 'projectile_spawn':
          case 'projectile_end':
          case 'monster_spawn':
          case 'aggro':
          case 'drop':
          case 'pickup':
          case 'area':
          case 'chain':
          case 'beam':
          case 'blink':
          case 'burn':
          case 'brand':
          case 'tailwind_rise':
          case 'tailwind_end':
          case 'skill_unlocked':
          case 'chart_point':
          case 'xp':
          case 'level_up':
          case 'surge':
          case 'surge_cleared':
          case 'armed':
          case 'notice':
          case 'portal':
          case 'hero_step':
          case 'wake':
          case 'encounter_nearing':
          case 'encounter_shown':
          case 'revive':
          case 'explored':
          case 'glitch_start':
          case 'glitch_end':
          case 'glitch_word':
          case 'moment_mark':
          case 'moment_strike':
          case 'moment_woke':
          case 'moment_ended':
          case 'item_found':
          case 'item_identified':
          case 'moment_gone':
          case 'moment_chest':
          case 'chest_opened':
          case 'cache_opened':
          case 'run_set':
          case 'run_ended':
          case 'path_marked':
            break;
        }
      }
    },
  };
}
