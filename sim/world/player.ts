import type { SkillDef, ZoneExit } from '../content/types.ts';
import { forceStrike } from './moments.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { isWalkable, nearestWalkable } from '../nav/grid.ts';
import { directPath, findPath, nearFace } from '../nav/path.ts';
import { exitOnLine } from './exits.ts';
import { allocateNode, dropFromInventory, equipFromInventory, refundNode, respecChart, slotSkill, unequip } from './character.ts';
import { findActor } from './combat.ts';
import { canDash, dashAim } from './dash.ts';
import { respawnPlayer } from './death.ts';
import { advanceDialogue, closeDialogue, DIALOGUE, findNpc } from './dialogue.ts';
import { pickUp } from './finds.ts';
import { useFlask } from './flasks.ts';
import type { Steering, SteerStep } from './movement.ts';
import { beingKnocked, steerAlong, stepKnock, stepTimers } from './movement.ts';
import { allHold } from './conditions.ts';
import { blockedReason, startSkill, steerAction, stepAction } from './skills.ts';
import type { Actor, Command, GroundItem, NoticeReason, NpcState, PlayerState, SkillCommand, World } from './types.ts';
import { handleTrade, meetNpc, openStation, stationAt, stationReach } from './trade.ts';
import type { Station } from './trade.ts';
import { requestGlitch, setGlitchesEnabled, setOverlay } from './glitch.ts';
import { readPage } from './story.ts';
import { stepWaypoints, teleport } from './waypoints.ts';
import { findExit, stepCheckpoints, travelThrough } from './zones.ts';

const PLAYER = {
  heldExitSlack: 1.3,
  moveDeadZone: 0.7,
  resumeDistance: 1.4,
  repathInterval: 0.2,
  goldDelay: 0.45,
  stride: 2.5,
  firstStepFraction: 0.6,
  stuckStep: 1e-4,
} as const;

const STEERING: Steering = {
  maxTurnRate: 24,
  minTurnRate: 2,
  turnGain: 24,
  fullSpeedAngle: 0.35,
  sharpAngle: 0.9,
  sharpSpeed: 0,
  passRadius: 0.45,
  settleRadius: 0.3,
};

function setDestination(world: World, dest: Vec2): void {
  world.player.path = findPath(world.grid, world.player.pos, dest);
  world.player.repathTimer = PLAYER.repathInterval;
}

function heldAim(world: World, dest: Vec2): Vec2 {
  const player: PlayerState = world.player;
  const walkable: boolean = isWalkable(world.grid, dest.x, dest.z);
  const exit: ZoneExit | null = exitOnLine(world, walkable ? dest : player.pos, dest, PLAYER.heldExitSlack);
  if (exit !== null) return nearestWalkable(world.grid, exit, exit.radius) ?? dest;
  return walkable ? dest : (nearFace(world.grid, player.pos, dest) ?? dest);
}

function heldPath(world: World, dest: Vec2): Vec2[] | null {
  const player: PlayerState = world.player;
  const aim: Vec2 = heldAim(world, dest);
  const direct: Vec2[] | null = directPath(world.grid, player.pos, aim);
  if (direct !== null) return direct;
  if (player.repathTimer > 0) return player.path.length > 0 ? player.path : null;
  player.repathTimer = PLAYER.repathInterval;
  return findPath(world.grid, player.pos, aim);
}

function startMove(world: World, dest: Vec2, held: boolean): void {
  const player: PlayerState = world.player;
  const path: Vec2[] | null = held ? heldPath(world, dest) : findPath(world.grid, player.pos, dest);
  if (path === null) return;
  const goal: Vec2 = path.at(-1) ?? player.pos;
  const reach: number = distance(player.pos, goal);
  const standing: boolean = player.path.length === 0;
  const tooClose: boolean = reach < PLAYER.moveDeadZone || (held && standing && reach < PLAYER.resumeDistance);
  if (tooClose) {
    if (!held || reach < PLAYER.moveDeadZone) {
      player.intent = { type: 'idle' };
      player.path = [];
    }
    return;
  }
  player.intent = { type: 'move', dest };
  player.path = path;
  if (!held) player.repathTimer = PLAYER.repathInterval;
}

function fire(world: World, skill: SkillDef, aim: Vec2, slot: number): boolean {
  const player: PlayerState = world.player;
  const reason: NoticeReason | null = blockedReason(player, skill);
  if (reason !== null) {
    world.events.push({ type: 'notice', reason });
    return false;
  }
  closeDialogue(world, false);
  player.intent = { type: 'idle' };
  player.path = [];
  startSkill(world, player, skill, { x: aim.x - player.pos.x, z: aim.z - player.pos.z }, slot);
  return true;
}

function inEngageRange(player: PlayerState, target: Actor, skill: SkillDef): boolean {
  return distance(player.pos, target.pos) - target.radius <= skill.engageRange;
}

function useSkill(world: World, command: SkillCommand): void {
  const player: PlayerState = world.player;
  const skill: SkillDef | undefined = player.skills[command.slot] ?? undefined;
  if (skill === undefined) return;
  if (skill.delivery.type === 'dash') {
    if (canDash(player)) fire(world, skill, dashAim(player, command.aim, player.path), command.slot);
    return;
  }
  const target: Actor | null = command.targetId === null ? null : findActor(world, command.targetId);
  if (target === null || !target.alive) {
    fire(world, skill, command.aim, command.slot);
    return;
  }
  if (inEngageRange(player, target, skill)) {
    fire(world, skill, target.pos, command.slot);
    return;
  }
  const reason: NoticeReason | null = blockedReason(player, skill);
  if (reason !== null) {
    world.events.push({ type: 'notice', reason });
    return;
  }
  closeDialogue(world, false);
  player.intent = { type: 'attack', slot: command.slot, targetId: target.id };
  setDestination(world, target.pos);
}

function act(world: World, command: Command): void {
  const player: PlayerState = world.player;
  switch (command.type) {
    case 'move':
      startMove(world, command.dest, command.held);
      return;
    case 'stop':
      player.intent = { type: 'idle' };
      player.path = [];
      return;
    case 'pickup': {
      const ground: GroundItem | undefined = world.ground.find((entry: GroundItem): boolean => entry.id === command.groundId);
      if (ground === undefined) return;
      player.intent = { type: 'pickup', groundId: ground.id };
      setDestination(world, ground.pos);
      return;
    }
    case 'skill':
      useSkill(world, command);
      return;
    case 'travel': {
      const exit: ZoneExit | null = findExit(world.zone, command.exit);
      if (exit === null) return;
      if (!allHold(world, exit.requires)) {
        world.events.push({ type: 'exit_locked', exit: exit.id, hint: exit.lockedHint });
        return;
      }
      player.intent = { type: 'travel', exit: exit.id };
      setDestination(world, exit);
      return;
    }
    case 'talk': {
      const npc: NpcState | null = findNpc(world, command.npcId);
      if (npc === null) return;
      player.intent = { type: 'talk', npcId: npc.id };
      setDestination(world, npc.pos);
      return;
    }
    case 'teleport':
      teleport(world, command.zone);
      return;
    case 'use': {
      const station: Station | null = stationAt(world, command.prop);
      if (station === null) return;
      player.intent = { type: 'use', prop: station.index };
      setDestination(world, station.placed);
      return;
    }
    case 'flask':
    case 'slot':
    case 'hold':
    case 'steer':
    case 'trade':
    case 'read':
    case 'glitch':
    case 'glitch_setting':
    case 'overlay':
    case 'strike':
    case 'advance':
    case 'equip':
    case 'unequip':
    case 'drop':
    case 'allocate':
    case 'refund':
    case 'respec':
    case 'respawn':
      return;
  }
}

function cutsRecovery(player: PlayerState, command: Command | null): boolean {
  if (command?.type !== 'skill' || player.action?.phase !== 'recovery') return false;
  const skill: SkillDef | undefined = player.skills[command.slot] ?? undefined;
  return skill !== undefined && skill.delivery.type === 'dash' && canDash(player) && blockedReason(player, skill) === null;
}

export function handleCommand(world: World, command: Command): void {
  const player: PlayerState = world.player;
  switch (command.type) {
    case 'equip':
      equipFromInventory(world, command.inventoryIndex);
      return;
    case 'unequip':
      unequip(world, command.slot);
      return;
    case 'drop':
      dropFromInventory(world, command.inventoryIndex);
      return;
    case 'allocate':
      allocateNode(world, command.node);
      return;
    case 'refund':
      refundNode(world, command.node);
      return;
    case 'respec':
      respecChart(world);
      return;
    case 'advance':
      advanceDialogue(world);
      return;
    case 'respawn':
      respawnPlayer(world, command.choice);
      return;
    case 'flask':
      useFlask(world, command.slot);
      return;
    case 'trade':
      handleTrade(world, command.action);
      return;
    case 'read':
      readPage(world, command.book, command.page);
      return;
    case 'glitch':
      requestGlitch(world, command.kind, 'debug');
      return;
    case 'glitch_setting':
      setGlitchesEnabled(world, command.enabled);
      return;
    case 'overlay':
      setOverlay(world, command.open);
      return;
    case 'strike':
      forceStrike(world, command.at, command.moment);
      return;
    case 'slot':
      slotSkill(world, command.slot, command.skill);
      return;
    case 'hold':
      player.held = command.down ? [...player.held.filter((slot: number): boolean => slot !== command.slot), command.slot] : player.held.filter((slot: number): boolean => slot !== command.slot);
      return;
    case 'steer':
      if (player.alive) steerAction(world, player, command.aim);
      return;
    case 'use':
    case 'move':
    case 'stop':
    case 'pickup':
    case 'skill':
    case 'travel':
    case 'talk':
    case 'teleport':
      if (!player.alive) return;
      if (command.type !== 'skill') closeDialogue(world, false);
      if (cutsRecovery(player, command)) player.action = null;
      if (player.action !== null) {
        player.queued = command;
        return;
      }
      act(world, command);
      return;
  }
}

function pursue(world: World, dest: Vec2, dt: number): void {
  const player: PlayerState = world.player;
  player.repathTimer -= dt;
  if (player.repathTimer <= 0) setDestination(world, dest);
}

function stepIntent(world: World, dt: number): void {
  const player: PlayerState = world.player;
  const intent = player.intent;
  switch (intent.type) {
    case 'idle':
      player.repathTimer -= dt;
      return;
    case 'move':
      player.repathTimer -= dt;
      if (player.path.length === 0) player.intent = { type: 'idle' };
      return;
    case 'attack': {
      const target: Actor | null = findActor(world, intent.targetId);
      const skill: SkillDef | undefined = player.skills[intent.slot] ?? undefined;
      if (target === null || !target.alive || skill === undefined) {
        player.intent = { type: 'idle' };
        player.path = [];
        return;
      }
      if (inEngageRange(player, target, skill)) {
        if (!fire(world, skill, target.pos, intent.slot)) {
          player.intent = { type: 'idle' };
          player.path = [];
        }
        return;
      }
      pursue(world, target.pos, dt);
      return;
    }
    case 'pickup': {
      const ground: GroundItem | undefined = world.ground.find((entry: GroundItem): boolean => entry.id === intent.groundId);
      if (ground === undefined) {
        player.intent = { type: 'idle' };
        return;
      }
      if (distance(player.pos, ground.pos) <= world.content.player.pickupRadius) {
        player.intent = { type: 'idle' };
        player.path = [];
        pickUp(world, ground);
        return;
      }
      pursue(world, ground.pos, dt);
      return;
    }
    case 'travel': {
      const exit: ZoneExit | null = findExit(world.zone, intent.exit);
      if (exit === null) {
        player.intent = { type: 'idle' };
        player.path = [];
        return;
      }
      if (!allHold(world, exit.requires)) {
        player.intent = { type: 'idle' };
        player.path = [];
        return;
      }
      if (distance(player.pos, exit) <= exit.radius) {
        travelThrough(world, exit);
        return;
      }
      pursue(world, exit, dt);
      return;
    }
    case 'talk': {
      const npc: NpcState | null = findNpc(world, intent.npcId);
      if (npc === null) {
        player.intent = { type: 'idle' };
        player.path = [];
        return;
      }
      if (distance(player.pos, npc.pos) <= DIALOGUE.reach) {
        player.intent = { type: 'idle' };
        player.path = [];
        meetNpc(world, npc);
        return;
      }
      pursue(world, npc.pos, dt);
      return;
    }
    case 'use': {
      const station: Station | null = stationAt(world, intent.prop);
      if (station === null) {
        player.intent = { type: 'idle' };
        player.path = [];
        return;
      }
      if (distance(player.pos, station.placed) <= stationReach(world, station)) {
        player.intent = { type: 'idle' };
        player.path = [];
        openStation(world, station);
        return;
      }
      pursue(world, station.placed, dt);
      return;
    }
  }
}

function collectGold(world: World): void {
  const player: PlayerState = world.player;
  for (const ground of world.ground) {
    if (ground.content.kind !== 'gold' || ground.age < PLAYER.goldDelay) continue;
    if (distance(player.pos, ground.pos) <= world.content.player.goldMagnetRadius) pickUp(world, ground);
  }
}

function walkIntoExit(world: World): void {
  const player: PlayerState = world.player;
  for (const exit of world.zone.exits) {
    if (distance(player.pos, exit) > exit.radius) continue;
    if (!allHold(world, exit.requires)) continue;
    player.intent = { type: 'idle' };
    player.path = [];
    travelThrough(world, exit);
    return;
  }
}

function isBusy(player: PlayerState): boolean {
  return player.action !== null;
}

function emitSteps(world: World, player: PlayerState, travelled: number): void {
  player.strideTravel += travelled;
  while (player.strideTravel >= PLAYER.stride) {
    player.strideTravel -= PLAYER.stride;
    world.events.push({ type: 'hero_step', pos: { x: player.pos.x, z: player.pos.z } });
  }
}

export function stepPlayer(world: World, dt: number): void {
  const player: PlayerState = world.player;
  player.motion = 'still';
  if (!player.alive) {
    player.walked = { x: 0, z: 0 };
    player.deadTime += dt;
    stepKnock(world.grid, player, dt);
    return;
  }
  player.life = Math.min(player.maxLife, player.life + player.stats.lifeRegen * dt);
  player.mana = Math.min(player.stats.maxMana, player.mana + player.stats.manaRegen * dt);
  stepTimers(player, dt);
  stepKnock(world.grid, player, dt);
  stepAction(world, player, dt * player.tempo);
  player.moving = false;
  const startX: number = player.pos.x;
  const startZ: number = player.pos.z;
  if (cutsRecovery(player, player.queued)) player.action = null;
  if (player.action === null && player.queued !== null) {
    const queued: Command = player.queued;
    player.queued = null;
    act(world, queued);
  }
  if (player.action === null) {
    stepIntent(world, dt);
    if (!isBusy(player) && !beingKnocked(player) && player.root <= 0 && player.tempo > 0 && player.path.length > 0) {
      const step: SteerStep = steerAlong(world.grid, player, player.path, player.stats.moveSpeed * player.tempo * dt, dt, STEERING);
      const stuck: boolean = step.tried > PLAYER.stuckStep && step.moved <= PLAYER.stuckStep;
      player.moving = !stuck && (player.path.length > 0 || step.moved > PLAYER.stuckStep);
      if (stuck) {
        player.path = [];
        player.repathTimer = PLAYER.repathInterval;
      } else if (player.path.length === 0) player.repathTimer = 0;
    }
  }
  player.walked = player.moving ? { x: player.pos.x - startX, z: player.pos.z - startZ } : { x: 0, z: 0 };
  if (player.moving) emitSteps(world, player, Math.hypot(player.pos.x - startX, player.pos.z - startZ));
  else player.strideTravel = PLAYER.stride * PLAYER.firstStepFraction;
  collectGold(world);
  if (player.moving) walkIntoExit(world);
  stepCheckpoints(world);
  stepWaypoints(world);
}
