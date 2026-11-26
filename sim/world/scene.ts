import type { SceneDef } from '../content/scene-types.ts';
import type { SkillDef, ZoneExit, ZoneNpc } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { DEGREES_TO_RADIANS, directionOf, distance, facingOf, normalize } from '../math.ts';
import { nearestWalkable } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { heldIn } from './bubble.ts';
import { applyHit, kill } from './combat.ts';
import { allHold } from './conditions.ts';
import { npcAt } from './dialogue.ts';
import { echoMonsters, forceStrike, wakeMoment } from './moments.ts';
import type { Escort, SceneState } from './scene-state.ts';
import { setFlags } from './story.ts';
import type { MomentState, MonsterState, NpcState, Offence, World } from './types.ts';
import type { WardState } from './wards.ts';
import { findWard, lowerWard, raiseWard } from './wards.ts';

export const SCENE = {
  appear: 0.45,
  pause: 0.9,
  lead: 0.5,
  missAfter: 2.5,
  exitClear: 2.5,
  reach: 4,
  slack: 1.5,
  facingRest: 1e-3,
  watch: 2.5,
  beside: 3,
} as const;

function npcOf(world: World, scene: SceneState): NpcState | null {
  return world.npcs.find((npc: NpcState): boolean => npc.id === scene.npcId) ?? null;
}

function momentOf(world: World, scene: SceneState): MomentState | null {
  return world.moments.find((moment: MomentState): boolean => moment.id === scene.momentId) ?? null;
}

function exitOf(world: World, def: SceneDef): ZoneExit | null {
  return world.zone.exits.find((exit: ZoneExit): boolean => exit.id === def.lead.exit) ?? null;
}

function living(world: World, moment: MomentState | null): MonsterState[] {
  return moment === null ? [] : echoMonsters(world, moment).filter((monster: MonsterState): boolean => monster.alive);
}

function faceHero(world: World, npc: NpcState): void {
  const toward: Vec2 = { x: world.player.pos.x - npc.pos.x, z: world.player.pos.z - npc.pos.z };
  if (Math.hypot(toward.x, toward.z) > SCENE.facingRest) npc.facing = facingOf(toward);
}

function strikePoint(world: World, def: SceneDef, radius: number): Vec2 {
  const player = world.player;
  const ahead: number = player.gait * world.content.moments.telegraph * SCENE.lead;
  const facing: Vec2 = directionOf(player.facing);
  let point: Vec2 = { x: player.pos.x + facing.x * ahead, z: player.pos.z + facing.z * ahead };
  const exit: ZoneExit | null = exitOf(world, def);
  if (exit !== null) {
    const keep: number = radius + exit.radius + SCENE.exitClear;
    if (distance(point, exit) < keep) {
      const away: Vec2 = normalize({ x: point.x - exit.x, z: point.z - exit.z }, { x: player.pos.x - exit.x, z: player.pos.z - exit.z });
      point = { x: exit.x + away.x * keep, z: exit.z + away.z * keep };
    }
  }
  return nearestWalkable(world.grid, point, SCENE.reach) ?? { x: player.pos.x, z: player.pos.z };
}

function adopt(scene: SceneState, moment: MomentState): void {
  scene.momentId = moment.id;
  scene.phase = 'fight';
  scene.elapsed = 0;
  scene.missed = 0;
}

function fighting(world: World): MomentState | null {
  const held: MomentState | null = heldIn(world, world.player.pos);
  return held !== null && held.combat && living(world, held).length > 0 ? held : null;
}

function quietAround(world: World, landing: Vec2, radius: number): MomentState | null {
  const hero: Vec2 = world.player.pos;
  return world.moments.find((moment: MomentState): boolean => moment.combat && (moment.phase === 'mark' || moment.phase === 'dormant') && (distance(hero, moment.pos) <= moment.def.radius || distance(landing, moment.pos) < moment.def.radius + radius)) ?? null;
}

function bring(world: World, scene: SceneState): void {
  const radius: number = world.content.moments.defs.get(scene.def.moment)?.radius ?? 0;
  const landing: Vec2 = strikePoint(world, scene.def, radius);
  const held: MomentState | null = fighting(world) ?? quietAround(world, landing, radius);
  if (held !== null) {
    adopt(scene, held);
    return;
  }
  if (atTheDoor(world, scene)) {
    arrive(world, scene, null);
    return;
  }
  const struck: MomentState | null = forceStrike(world, landing, scene.def.moment);
  if (struck !== null) adopt(scene, struck);
}

function arrivalPoint(world: World, scene: SceneState, moment: MomentState | null): Vec2 {
  const exit: ZoneExit | null = exitOf(world, scene.def);
  const hero: Vec2 = world.player.pos;
  if (moment === null) {
    const back: Vec2 = normalize({ x: hero.x - (exit?.x ?? hero.x), z: hero.z - (exit?.z ?? hero.z) }, { x: -1, z: 0 });
    return { x: hero.x + back.x * SCENE.beside, z: hero.z + back.z * SCENE.beside };
  }
  const exitward: Vec2 = normalize({ x: (exit?.x ?? hero.x) - moment.pos.x, z: (exit?.z ?? hero.z) - moment.pos.z }, { x: 1, z: 0 });
  const outward: Vec2 = normalize({ x: hero.x - moment.pos.x, z: hero.z - moment.pos.z }, exitward);
  return { x: hero.x + outward.x * scene.def.arrive, z: hero.z + outward.z * scene.def.arrive };
}

function arrive(world: World, scene: SceneState, moment: MomentState | null): void {
  const aim: Vec2 = arrivalPoint(world, scene, moment);
  const pos: Vec2 = nearestWalkable(world.grid, aim, SCENE.reach) ?? aim;
  const facing: number = facingOf({ x: (moment?.pos.x ?? world.player.pos.x) - pos.x, z: (moment?.pos.z ?? world.player.pos.z) - pos.z });
  const placement: ZoneNpc = { npc: scene.def.npc, x: pos.x, z: pos.z, facingDegrees: facing / DEGREES_TO_RADIANS, when: [], leave: 0 };
  const npc: NpcState | null = npcAt(world, placement);
  if (npc === null) {
    world.scene = null;
    return;
  }
  world.npcs = [...world.npcs, npc];
  scene.placement = placement;
  scene.npcId = npc.id;
  scene.momentId = moment?.id ?? null;
  scene.phase = 'strike';
  scene.elapsed = 0;
}

function atTheDoor(world: World, scene: SceneState): boolean {
  const exit: ZoneExit | null = exitOf(world, scene.def);
  return exit !== null && distance(world.player.pos, exit) <= exit.radius + SCENE.watch;
}

function fight(world: World, scene: SceneState, dt: number): void {
  const held: MomentState | null = fighting(world);
  if (held !== null && held.id !== scene.momentId) adopt(scene, held);
  const moment: MomentState | null = momentOf(world, scene);
  if (moment === null) {
    scene.phase = 'bring';
    return;
  }
  switch (moment.phase) {
    case 'mark':
      if (atTheDoor(world, scene)) arrive(world, scene, null);
      return;
    case 'fading':
      if (moment.outcome === 'resolved') arrive(world, scene, moment);
      else scene.phase = 'bring';
      return;
    case 'dormant':
      if (distance(world.player.pos, moment.pos) < moment.def.radius) {
        wakeMoment(world, moment, true);
        return;
      }
      scene.missed += dt;
      if (atTheDoor(world, scene)) arrive(world, scene, null);
      else if (scene.missed >= SCENE.missAfter) scene.phase = 'bring';
      return;
    case 'awake': {
      scene.elapsed += dt;
      const out: boolean = distance(world.player.pos, moment.pos) > moment.def.radius;
      if (out || scene.elapsed >= scene.def.fight || living(world, moment).length === 0) arrive(world, scene, moment);
      return;
    }
  }
}

function offenceOf(npc: NpcState, blow: number): Offence {
  return { sourceId: npc.id, team: 'player', faction: npc.def.faction, damageMin: blow, damageMax: blow, damagePercent: 0, critChance: 0, critMultiplier: 1 };
}

function cut(world: World, npc: NpcState, skill: SkillDef, foes: readonly MonsterState[]): void {
  const direction: Vec2 = directionOf(npc.facing);
  let hits: number = 0;
  for (const foe of foes) {
    if (!foe.alive) continue;
    const toward: Vec2 = normalize({ x: foe.pos.x - npc.pos.x, z: foe.pos.z - npc.pos.z }, direction);
    const blow: number = skill.damage.weaponPercent > 0 ? foe.life / skill.damage.weaponPercent : foe.life;
    if (applyHit(world, offenceOf(npc, blow), foe, skill, toward)) hits += 1;
    if (foe.life > 0) kill(world, foe, toward);
  }
  world.events.push({ type: 'skill_impact', actorId: npc.id, team: 'player', skill, origin: { x: npc.pos.x, z: npc.pos.z }, direction, hits, echo: false });
}

function strike(world: World, scene: SceneState, dt: number): void {
  const npc: NpcState | null = npcOf(world, scene);
  const skill: SkillDef | undefined = world.content.skills.get(scene.def.strike);
  if (npc === null || skill === undefined) {
    ward(world, scene);
    return;
  }
  const before: number = scene.elapsed;
  scene.elapsed += dt;
  const swing: number = SCENE.appear;
  const lands: number = swing + skill.windup;
  const moment: MomentState | null = momentOf(world, scene);
  const foes: MonsterState[] = living(world, moment);
  if (before < swing && scene.elapsed >= swing && moment !== null && foes.length > 0) {
    const toward: Vec2 = normalize({ x: moment.pos.x - npc.pos.x, z: moment.pos.z - npc.pos.z }, directionOf(npc.facing));
    npc.facing = facingOf(toward);
    world.events.push({ type: 'skill_start', actorId: npc.id, skill, direction: toward, windup: skill.windup, recovery: skill.recovery });
  }
  if (before < lands && scene.elapsed >= lands) cut(world, npc, skill, foes);
  if (scene.elapsed < lands + skill.recovery + SCENE.pause) return;
  ward(world, scene);
}

function wardCentre(world: World, npc: NpcState): Vec2 {
  const hero: Vec2 = world.player.pos;
  const middle: Vec2 = { x: (hero.x + npc.pos.x) / 2, z: (hero.z + npc.pos.z) / 2 };
  return nearestWalkable(world.grid, middle, SCENE.reach) ?? middle;
}

function ward(world: World, scene: SceneState): void {
  const npc: NpcState | null = npcOf(world, scene);
  scene.phase = 'ward';
  scene.elapsed = 0;
  if (npc === null) return;
  scene.wardId = raiseWard(world, scene.def.ward, npc, wardCentre(world, npc)).id;
  setFlags(world, scene.def.owes);
  world.events.push({ type: 'scene_ward', scene: scene.def.id, npcId: npc.id, wardId: scene.wardId });
}

function heard(world: World, scene: SceneState): boolean {
  return world.heard.includes(scene.def.talk);
}

function talkingWith(world: World, npc: NpcState): boolean {
  return world.dialogue?.npcId === npc.id;
}

function walkedAway(world: World, scene: SceneState, raised: WardState | null): boolean {
  const centre: Vec2 = raised?.pos ?? world.player.pos;
  return distance(world.player.pos, centre) > scene.def.ward.radius + scene.def.ward.leave;
}

function sheltering(world: World, scene: SceneState): void {
  const npc: NpcState | null = npcOf(world, scene);
  if (npc === null) {
    dropScene(world);
    return;
  }
  const raised: WardState | null = findWard(world, scene.wardId);
  const talking: boolean = talkingWith(world, npc);
  if (!talking) faceHero(world, npc);
  const away: boolean = walkedAway(world, scene, raised);
  const standing: boolean = raised !== null && raised.lowering === null;
  if (!heard(world, scene) && !away && (standing || talking)) return;
  if (talking && !away) return;
  if (raised !== null) lowerWard(raised);
  if (heard(world, scene)) setFlags(world, scene.def.sets);
  scene.phase = 'lead';
  npc.route = findPath(world.grid, npc.pos, scene.def.lead);
  world.events.push({ type: 'scene_lead', scene: scene.def.id, npcId: npc.id });
}

function lags(world: World, scene: SceneState, npc: NpcState, ahead: number): boolean {
  if (!scene.def.lead.waits) return false;
  const waiting: boolean = npc.pace === 0;
  return distance(npc.pos, world.player.pos) > (waiting ? ahead - SCENE.slack : ahead);
}

function lead(world: World, scene: SceneState): void {
  const npc: NpcState | null = npcOf(world, scene);
  if (npc === null) return;
  const def = scene.def.lead;
  const hero: Vec2 = world.player.pos;
  const ahead: boolean = distance(hero, def) < distance(npc.pos, def);
  const behind: boolean = lags(world, scene, npc, def.ahead);
  const exit: ZoneExit | null = exitOf(world, scene.def);
  if (npc.route.length === 0 && def.through !== null && exit !== null && !behind) {
    npc.route = findPath(world.grid, npc.pos, exit);
    scene.phase = 'through';
    scene.elapsed = 0;
    npc.pace = def.walk;
    return;
  }
  npc.pace = npc.route.length === 0 ? 0 : ahead ? def.run : behind ? 0 : def.walk;
  if (npc.pace === 0) faceHero(world, npc);
}

function through(world: World, scene: SceneState, dt: number): void {
  const npc: NpcState | null = npcOf(world, scene);
  const exit: ZoneExit | null = exitOf(world, scene.def);
  const fade: number | null = scene.def.lead.through;
  if (npc === null || exit === null || fade === null) {
    dropScene(world);
    return;
  }
  const passing: boolean = scene.elapsed > 0 || distance(npc.pos, exit) <= exit.radius || npc.route.length === 0;
  if (!passing) {
    npc.pace = lags(world, scene, npc, scene.def.lead.ahead) ? 0 : scene.def.lead.walk;
    if (npc.pace === 0) faceHero(world, npc);
    return;
  }
  npc.pace = scene.def.lead.walk;
  scene.elapsed += dt;
  npc.fade = Math.max(0, 1 - scene.elapsed / fade);
  if (npc.fade <= 0) dropScene(world);
}

function begin(world: World): void {
  if (!world.player.alive) return;
  const def: SceneDef | undefined = world.zone.scenes.find((entry: SceneDef): boolean => distance(world.player.pos, entry) <= entry.radius && allHold(world, entry.when));
  if (def === undefined) return;
  world.scene = { def, phase: 'bring', momentId: null, elapsed: 0, missed: 0, wardId: null, npcId: null, placement: null };
}

export function dropScene(world: World): void {
  const scene: SceneState | null = world.scene;
  world.scene = null;
  if (scene === null || scene.npcId === null) return;
  world.npcs = world.npcs.filter((npc: NpcState): boolean => npc.id !== scene.npcId);
}

export function stepScene(world: World, dt: number): void {
  if (world.scene === null) begin(world);
  const scene: SceneState | null = world.scene;
  if (scene === null) return;
  if (!world.player.alive) {
    dropScene(world);
    return;
  }
  switch (scene.phase) {
    case 'bring':
      if (distance(world.player.pos, scene.def) > scene.def.radius) world.scene = null;
      else bring(world, scene);
      return;
    case 'fight':
      fight(world, scene, dt);
      return;
    case 'strike':
      strike(world, scene, dt);
      return;
    case 'ward':
      sheltering(world, scene);
      return;
    case 'lead':
      lead(world, scene);
      return;
    case 'through':
      through(world, scene, dt);
      return;
  }
}

export function exitWaits(world: World, exitId: string): boolean {
  const scene: SceneState | null = world.scene;
  return scene !== null && scene.def.lead.exit === exitId && (scene.phase === 'bring' || scene.phase === 'fight' || scene.phase === 'strike');
}

export function leavingWith(world: World, exitId: string): Escort | null {
  const scene: SceneState | null = world.scene;
  if (scene === null || scene.npcId === null || scene.def.lead.exit !== exitId) return null;
  if (scene.phase !== 'ward' && scene.phase !== 'lead' && scene.phase !== 'through') return null;
  return { npc: scene.def.npc, pace: scene.def.lead.walk };
}
