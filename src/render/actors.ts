import type { Box3, Object3D, Scene } from 'three';
import { paceAt } from '../../sim/nav/grid.ts';
import { Color } from 'three';
import type { Content, MonsterDef, ZoneDef } from '../../sim/content/types.ts';
import { hiddenBodyParts, wornWearables } from '../../sim/wear.ts';
import { wakeProgress } from '../../sim/world/wake.ts';
import type { ActorState, Equipment, MomentState, MonsterState, NpcState, World, WorldEvent } from '../../sim/world/types.ts';
import type { ActorPose, ActorView } from './actor-view.ts';
import { ACTOR, createActorView } from './actor-view.ts';
import type { CharacterLibrary, LoadedRig, RigInstance } from './character-loader.ts';
import { hasWear, instantiateRig } from './character-loader.ts';
import { holdEquipped } from './hero-gear.ts';
import type { GhostUniforms } from './ghost-material.ts';
import { createGhostUniforms } from './ghost-material.ts';
import { momentOfEcho } from '../../sim/world/moments.ts';

export const ACTORS = {
  monsterFlash: 1,
  playerFlash: 0.85,
  defaultHeight: 2.2,
  npcAppearRate: 3.4,
  npcSettledWithin: 0.01,
  blockTime: 0.35,
  echoMix: 0.85,
  echoOpacity: 0.78,
  turnRim: 4,
  leaveTime: 1.2,
  pooledPerKind: 8,
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
}

export interface Actors {
  sync(dt: number, world: World, hoveredId: number | null): void;
  handle(events: readonly WorldEvent[], world: World): void;
  refreshWear(world: World): void;
  heightOf(actorId: number): number;
  boundsOf(actorId: number, out: Box3): boolean;
  hero(): Object3D;
  standIns(zone: ZoneDef): Object3D[];
}

const HIT_WHITE: Color = new Color(0xffffff);
const HIT_RED: Color = new Color(0xff2a1a);

function poseOf(actor: ActorState): ActorPose {
  return { pos: actor.pos, facing: actor.facing, moving: actor.moving, busy: actor.action !== null, deadTime: actor.deadTime };
}

function lookOf(def: MonsterDef): string {
  return `${def.id}|${def.rig}|${def.tint}|${def.color}|${def.scale}`;
}

function npcPose(npc: NpcState): ActorPose {
  return { pos: npc.pos, facing: npc.facing, moving: false, busy: false, deadTime: 0 };
}


function dress(content: Content, rig: RigInstance, clothes: readonly string[], equipped: Equipment | null): void {
  const worn: string[] = wornWearables(content, clothes, equipped);
  rig.setWear(worn, hiddenBodyParts(content, worn));
}

function echoLook(current: World, monster: MonsterState): EchoLook | null {
  const moment: MomentState | null = momentOfEcho(current, monster.id);
  if (moment === null) return null;
  const from: Color = new Color(moment.def.tint);
  return { ghost: createGhostUniforms(from, ACTORS.echoMix), from, to: new Color(current.content.moments.hostileTint) };
}

export function createActors(scene: Scene, library: CharacterLibrary, world: World): Actors {
  const content: Content = world.content;
  const playerRig: LoadedRig | undefined = library.rigs.get(content.player.rig);
  if (playerRig === undefined) throw new Error(`Player rig "${content.player.rig}" was not loaded`);
  const playerView: ActorView = createActorView(instantiateRig(playerRig, library, { tint: content.player.tint, glow: content.player.color, ghost: null }), 1, world.player.facing);
  holdEquipped(content, playerView.rig, world.player.equipped);
  dress(content, playerView.rig, content.player.wear, world.player.equipped);
  scene.add(playerView.rig.root);
  const monsters: Map<number, MonsterEntry> = new Map<number, MonsterEntry>();
  const npcs: Map<number, NpcEntry> = new Map<number, NpcEntry>();
  let npcZone: World['zone'] | null = null;

  const npcEntry = (npc: NpcState, arriving: boolean): NpcEntry | null => {
    const existing: NpcEntry | undefined = npcs.get(npc.id);
    if (existing !== undefined) return existing;
    const rig: LoadedRig | undefined = library.rigs.get(npc.def.rig);
    if (rig === undefined || !hasWear(library, wornWearables(content, npc.def.wear, null), npc.def.gear)) return null;
    const view: ActorView = createActorView(instantiateRig(rig, library, { tint: npc.def.tint, glow: npc.def.color, ghost: null }), npc.def.scale, npc.facing, ACTOR.friendlyHover);
    view.rig.setGear(npc.def.gear);
    dress(content, view.rig, npc.def.wear, null);
    scene.add(view.rig.root);
    const entry: NpcEntry = { view, pose: npcPose(npc), shown: arriving ? 0 : 1 };
    npcs.set(npc.id, entry);
    return entry;
  };

  const leaving: LeavingEcho[] = [];

  const pool: Map<string, ActorView[]> = new Map<string, ActorView[]>();

  const makeMonsterView = (def: MonsterDef, facing: number, echo: EchoLook | null): ActorView | null => {
    const rig: LoadedRig | undefined = library.rigs.get(def.rig);
    if (rig === undefined || !hasWear(library, wornWearables(content, def.wear, null), def.gear)) return null;
    const view: ActorView = createActorView(instantiateRig(rig, library, { tint: echo === null ? def.tint : '#ffffff', glow: echo === null ? def.color : '#ffffff', ghost: echo?.ghost ?? null }), def.scale, facing);
    view.rig.setGear(def.gear);
    dress(content, view.rig, def.wear, null);
    view.rig.setOpacity(ACTORS.echoOpacity);
    if (echo !== null) view.setShadowOpacity(ACTORS.echoOpacity);
    return view;
  };

  const monsterView = (def: MonsterDef, facing: number, echo: EchoLook | null): ActorView | null => {
    const pooled: ActorView | undefined = echo === null ? pool.get(lookOf(def))?.pop() : undefined;
    if (pooled === undefined) return makeMonsterView(def, facing, echo);
    pooled.face(facing);
    pooled.revive();
    return pooled;
  };

  const keep = (def: MonsterDef, view: ActorView): void => {
    view.rig.root.removeFromParent();
    const kept: ActorView[] = pool.get(lookOf(def)) ?? [];
    if (kept.length >= ACTORS.pooledPerKind) {
      view.dispose();
      return;
    }
    kept.push(view);
    pool.set(lookOf(def), kept);
  };

  const retire = (entry: MonsterEntry): void => {
    if (entry.echo === null) keep(entry.def, entry.view);
    else entry.view.dispose();
  };

  const entryFor = (current: World, monster: MonsterState): MonsterEntry | null => {
    const existing: MonsterEntry | undefined = monsters.get(monster.id);
    if (existing !== undefined) return existing;
    const echo: EchoLook | null = echoLook(current, monster);
    const view: ActorView | null = monsterView(monster.def, monster.facing, echo);
    if (view === null) return null;
    scene.add(view.rig.root);
    const entry: MonsterEntry = { def: monster.def, view, spawnTime: Math.max(monster.spawnTime, 1e-3), echo };
    monsters.set(monster.id, entry);
    if (!monster.alive) view.die();
    return entry;
  };

  const viewOf = (actorId: number): ActorView | null => {
    if (actorId === world.player.id) return playerView;
    return monsters.get(actorId)?.view ?? npcs.get(actorId)?.view ?? null;
  };

  return {
    hero(): Object3D {
      return playerView.rig.root;
    },
    standIns(zone: ZoneDef): Object3D[] {
      const defs: MonsterDef[] = [...new Set<string>(zone.packs.flatMap((pack): string[] => pack.members.map((member): string => member.monster)))].flatMap((id: string): MonsterDef[] => {
        const def: MonsterDef | undefined = content.monsters.get(id);
        return def === undefined ? [] : [def];
      });
      const wanted: Set<string> = new Set<string>(defs.map(lookOf));
      const unwanted: ActorView[] = [];
      for (const [look, views] of pool) {
        if (wanted.has(look)) continue;
        unwanted.push(...views);
        pool.delete(look);
      }
      const made: ActorView[] = [];
      for (const def of defs) {
        const view: ActorView | null = pool.get(lookOf(def))?.[0] ?? makeMonsterView(def, 0, null);
        if (view === null) continue;
        if (!(pool.get(lookOf(def))?.includes(view) ?? false)) keep(def, view);
        made.push(view);
      }
      for (const view of unwanted) view.dispose();
      return made.map((view: ActorView): Object3D => view.rig.root);
    },
    refreshWear(current: World): void {
      holdEquipped(content, playerView.rig, current.player.equipped);
      dress(content, playerView.rig, content.player.wear, current.player.equipped);
    },
    boundsOf(actorId: number, out: Box3): boolean {
      const view: ActorView | null = viewOf(actorId);
      if (view === null) return false;
      view.bounds(out);
      return !out.isEmpty();
    },
    heightOf(actorId: number): number {
      return viewOf(actorId)?.height ?? ACTORS.defaultHeight;
    },
    sync(dt: number, current: World, hoveredId: number | null): void {
      const floor: number = current.zone.floorHeight;
      holdEquipped(content, playerView.rig, current.player.equipped);
      playerView.lie(current.wake === null ? null : wakeProgress(current.wake));
      playerView.sync(dt, poseOf(current.player), { moveSpeed: current.player.stats.moveSpeed * paceAt(current.grid, current.player.pos.x, current.player.pos.z), rise: 1, floor, turnRate: ACTOR.turnRate });
      for (const monster of current.monsters) {
        const entry: MonsterEntry | null = entryFor(current, monster);
        if (entry === null) continue;
        const turning: number = 1 - monster.spawnTime / entry.spawnTime;
        if (entry.echo !== null) {
          entry.echo.ghost.tint.value.copy(entry.echo.from).lerp(entry.echo.to, turning);
          entry.echo.ghost.rim.value = 1 + (1 - turning) * ACTORS.turnRim;
        }
        entry.view.setHover(monster.id === hoveredId);
        entry.view.sync(dt, poseOf(monster), { moveSpeed: monster.def.moveSpeed * paceAt(current.grid, monster.pos.x, monster.pos.z), rise: entry.echo === null ? turning : 1, floor, turnRate: ACTOR.turnRate });
      }
      for (let index: number = leaving.length - 1; index >= 0; index -= 1) {
        const echo: LeavingEcho | undefined = leaving[index];
        if (echo === undefined) continue;
        echo.age += dt;
        echo.ghost.dissolve.value = Math.min(1, echo.age / ACTORS.leaveTime);
        echo.entry.view.rig.setOpacity(ACTORS.echoOpacity * (1 - echo.ghost.dissolve.value));
        echo.entry.view.setShadowOpacity(ACTORS.echoOpacity * (1 - echo.ghost.dissolve.value));
        if (echo.age < ACTORS.leaveTime) continue;
        echo.entry.view.dispose();
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
        entry.view.setHover(npc.id === hoveredId);
        entry.view.sync(dt, entry.pose, { moveSpeed: 0, rise: entry.shown, floor, turnRate: ACTOR.npcTurnRate });
      }
      for (const [id, entry] of npcs) {
        if (current.npcs.some((npc: NpcState): boolean => npc.id === id)) continue;
        entry.shown -= entry.shown * ease;
        if (!sameZone || entry.shown < ACTORS.npcSettledWithin) {
          entry.view.dispose();
          npcs.delete(id);
          continue;
        }
        entry.view.setHover(false);
        entry.view.sync(dt, entry.pose, { moveSpeed: 0, rise: entry.shown, floor, turnRate: ACTOR.npcTurnRate });
      }
    },
    handle(events: readonly WorldEvent[], current: World): void {
      const guarded: Set<number> = new Set<number>();
      for (const event of events) {
        switch (event.type) {
          case 'skill_start':
            viewOf(event.actorId)?.startAction(event.skill.animation, event.windup, event.recovery);
            break;
          case 'skill_interrupt':
            viewOf(event.actorId)?.interrupt();
            break;
          case 'damage': {
            const isPlayer: boolean = event.targetTeam === 'player';
            const stagger: boolean = isPlayer ? current.player.action === null && !current.player.moving : event.skill.stagger > 0;
            viewOf(event.targetId)?.hit(isPlayer ? HIT_RED : HIT_WHITE, isPlayer ? ACTORS.playerFlash : ACTORS.monsterFlash, stagger && !event.killed && !guarded.has(event.targetId));
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
            viewOf(event.actorId)?.die();
            break;
          case 'player_respawn':
            playerView.revive();
            break;
          case 'glitch_end':
            playerView.face(current.player.facing);
            break;
          case 'character_changed':
            holdEquipped(content, playerView.rig, current.player.equipped);
            dress(content, playerView.rig, content.player.wear, current.player.equipped);
            break;
          case 'monster_remove': {
            const entry: MonsterEntry | undefined = monsters.get(event.monsterId);
            if (entry !== undefined) {
              if (entry.echo === null) retire(entry);
              else leaving.push({ entry, ghost: entry.echo.ghost, age: 0 });
              monsters.delete(event.monsterId);
            }
            break;
          }
          case 'zone_changed':
            for (const entry of monsters.values()) retire(entry);
            monsters.clear();
            for (const echo of leaving.splice(0, leaving.length)) echo.entry.view.dispose();
            break;
          case 'skill_impact':
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
          case 'bark':
          case 'flask_used':
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
          case 'brand':
          case 'skill_unlocked':
          case 'xp':
          case 'level_up':
          case 'surge':
          case 'surge_cleared':
          case 'notice':
          case 'hero_step':
          case 'revive':
          case 'explored':
          case 'glitch_start':
          case 'glitch_word':
          case 'silence':
          case 'zone_edited':
          case 'moment_mark':
          case 'moment_strike':
          case 'moment_woke':
          case 'moment_ended':
          case 'moment_gone':
          case 'path_marked':
            break;
        }
      }
    },
  };
}
