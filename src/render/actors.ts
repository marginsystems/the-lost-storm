import type { Box3, Scene } from 'three';
import { Color } from 'three';
import type { Content } from '../../sim/content/types.ts';
import { hiddenBodyParts, wornWearables } from '../../sim/wear.ts';
import type { ActorState, Equipment, MonsterState, NpcState, PlayerState, World, WorldEvent } from '../../sim/world/types.ts';
import type { ActorPose, ActorView } from './actor-view.ts';
import { ACTOR, createActorView } from './actor-view.ts';
import type { CharacterLibrary, LoadedRig, RigInstance } from './character-loader.ts';
import { instantiateRig } from './character-loader.ts';

export const ACTORS = {
  monsterFlash: 1,
  playerFlash: 0.85,
  defaultHeight: 2.2,
  npcAppearRate: 3.4,
  npcSettledWithin: 0.01,
} as const;

interface MonsterEntry {
  readonly view: ActorView;
  readonly spawnTime: number;
}

interface NpcEntry {
  readonly view: ActorView;
  pose: ActorPose;
  shown: number;
}

export interface Actors {
  sync(dt: number, world: World, hoveredId: number | null): void;
  handle(events: readonly WorldEvent[], world: World): void;
  heightOf(actorId: number): number;
  boundsOf(actorId: number, out: Box3): boolean;
}

const HIT_WHITE: Color = new Color(0xffffff);
const HIT_RED: Color = new Color(0xff2a1a);

function poseOf(actor: ActorState): ActorPose {
  return { pos: actor.pos, facing: actor.facing, moving: actor.moving, busy: actor.action !== null, deadTime: actor.deadTime };
}

function npcPose(npc: NpcState): ActorPose {
  return { pos: npc.pos, facing: npc.facing, moving: false, busy: false, deadTime: 0 };
}

function playerGear(content: Content, player: PlayerState): string[] {
  const weapon = player.equipped.weapon;
  const held: string | null = weapon === null ? content.player.unarmedVisual : (content.itemBases.get(weapon.base)?.visual ?? content.player.unarmedVisual);
  return held === null ? [...content.player.gear] : [...content.player.gear, held];
}

function dress(content: Content, rig: RigInstance, clothes: readonly string[], equipped: Equipment | null): void {
  const worn: string[] = wornWearables(content, clothes, equipped);
  rig.setWear(worn, hiddenBodyParts(content, worn));
}

export function createActors(scene: Scene, library: CharacterLibrary, world: World): Actors {
  const content: Content = world.content;
  const playerRig: LoadedRig | undefined = library.rigs.get(content.player.rig);
  if (playerRig === undefined) throw new Error(`Player rig "${content.player.rig}" was not loaded`);
  const playerView: ActorView = createActorView(instantiateRig(playerRig, library, { tint: content.player.tint, glow: content.player.color }), 1, world.player.facing);
  playerView.rig.setGear(playerGear(content, world.player));
  dress(content, playerView.rig, content.player.wear, world.player.equipped);
  scene.add(playerView.rig.root);
  const monsters: Map<number, MonsterEntry> = new Map<number, MonsterEntry>();
  const npcs: Map<number, NpcEntry> = new Map<number, NpcEntry>();
  let npcZone: World['zone'] | null = null;

  const npcEntry = (npc: NpcState, arriving: boolean): NpcEntry | null => {
    const existing: NpcEntry | undefined = npcs.get(npc.id);
    if (existing !== undefined) return existing;
    const rig: LoadedRig | undefined = library.rigs.get(npc.def.rig);
    if (rig === undefined) return null;
    const view: ActorView = createActorView(instantiateRig(rig, library, { tint: npc.def.tint, glow: npc.def.color }), npc.def.scale, npc.facing, ACTOR.friendlyHover);
    view.rig.setGear(npc.def.gear);
    dress(content, view.rig, npc.def.wear, null);
    scene.add(view.rig.root);
    const entry: NpcEntry = { view, pose: npcPose(npc), shown: arriving ? 0 : 1 };
    npcs.set(npc.id, entry);
    return entry;
  };

  const entryFor = (monster: MonsterState): MonsterEntry | null => {
    const existing: MonsterEntry | undefined = monsters.get(monster.id);
    if (existing !== undefined) return existing;
    const rig: LoadedRig | undefined = library.rigs.get(monster.def.rig);
    if (rig === undefined) return null;
    const view: ActorView = createActorView(instantiateRig(rig, library, { tint: monster.def.tint, glow: monster.def.color }), monster.def.scale, monster.facing);
    view.rig.setGear(monster.def.gear);
    dress(content, view.rig, monster.def.wear, null);
    scene.add(view.rig.root);
    const entry: MonsterEntry = { view, spawnTime: Math.max(monster.spawnTime, 1e-3) };
    monsters.set(monster.id, entry);
    if (!monster.alive) view.die();
    return entry;
  };

  const viewOf = (actorId: number): ActorView | null => {
    if (actorId === world.player.id) return playerView;
    return monsters.get(actorId)?.view ?? npcs.get(actorId)?.view ?? null;
  };

  return {
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
      playerView.sync(dt, poseOf(current.player), { moveSpeed: current.player.stats.moveSpeed, rise: 1, floor, turnRate: ACTOR.turnRate });
      for (const monster of current.monsters) {
        const entry: MonsterEntry | null = entryFor(monster);
        if (entry === null) continue;
        entry.view.setHover(monster.id === hoveredId);
        entry.view.sync(dt, poseOf(monster), { moveSpeed: monster.def.moveSpeed, rise: 1 - monster.spawnTime / entry.spawnTime, floor, turnRate: ACTOR.turnRate });
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
            viewOf(event.targetId)?.hit(isPlayer ? HIT_RED : HIT_WHITE, isPlayer ? ACTORS.playerFlash : ACTORS.monsterFlash, stagger && !event.killed);
            break;
          }
          case 'death':
            viewOf(event.actorId)?.die();
            break;
          case 'player_respawn':
            playerView.revive();
            break;
          case 'character_changed':
            playerView.rig.setGear(playerGear(content, current.player));
            dress(content, playerView.rig, content.player.wear, current.player.equipped);
            break;
          case 'monster_remove': {
            const entry: MonsterEntry | undefined = monsters.get(event.monsterId);
            if (entry !== undefined) {
              entry.view.dispose();
              monsters.delete(event.monsterId);
            }
            break;
          }
          case 'zone_changed':
            for (const entry of monsters.values()) entry.view.dispose();
            monsters.clear();
            break;
          case 'skill_impact':
          case 'checkpoint':
          case 'dialogue_line':
          case 'dialogue_closed':
          case 'quest_started':
          case 'quest_advanced':
          case 'quest_completed':
          case 'waypoint_unlocked':
          case 'exit_locked':
          case 'boss_phase':
          case 'bark':
          case 'flask_used':
          case 'projectile_spawn':
          case 'projectile_end':
          case 'monster_spawn':
          case 'aggro':
          case 'drop':
          case 'pickup':
          case 'xp':
          case 'level_up':
          case 'surge':
          case 'surge_cleared':
          case 'notice':
          case 'hero_step':
          case 'explored':
            break;
        }
      }
    },
  };
}
