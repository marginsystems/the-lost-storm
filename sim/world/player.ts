import { tailwindPace } from './tailwind.ts';
import type { RigDef, SkillDef, ZoneExit } from '../content/types.ts';
import { forceStrike } from './moments.ts';
import { spawnPackNear } from './monsters.ts';
import { chestOf, chestReach, chestSpot, openChest } from './moment-chest.ts';
import { cacheAt, cacheReach, openCache } from './caches.ts';
import type { Cache } from './caches.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { isWalkable, lineWalkable } from '../nav/grid.ts';
import { directPath, nearFace } from '../nav/path.ts';
import { blockerInReach, chasePath, chaseStalled, freshChase, walkPath } from './chase.ts';
import { pastBlocks, roundPast, stillRound } from './stick.ts';
import { allocateNode, arrangeInventory, chooseChange, dropFromInventory, equipFromInventory, refundNode, respecChart, slotSkill, unequip } from './character.ts';
import { findActor } from './combat.ts';
import { canDash, dashAim } from './dash.ts';
import { dodgesAtOnce, givesWayToDodge, isDodge } from './dodge.ts';
import type { Buffered, PressRank, Taken } from './press-buffer.ts';
import { bufferPress, takePress } from './press-buffer.ts';
import { respawnPlayer } from './death.ts';
import { leaveDuel } from './duel-zone.ts';
import { advanceDialogue, closeDialogue, DIALOGUE, replayDialogue, talkable } from './dialogue.ts';
import { pickUp } from './finds.ts';
import { useFlask } from './flasks.ts';
import type { Steering, SteerStep } from './movement.ts';
import { beingKnocked, faceToward, steerAlong, stepKnock, stepTimers } from './movement.ts';
import { allHold } from './conditions.ts';
import { blockedReason, isHeld, startSkill, steerAction, stepAction, stepPivot } from './skills.ts';
import { aimGlide, glide, glidesWith, stepMomentum } from './momentum.ts';
import type { ActionState, Actor, Command, GroundItem, MomentState, NoticeReason, NpcState, PlayerState, SkillCommand, World } from './types.ts';
import { handlePurse } from './purse.ts';
import { handleTrade, meetNpc, openStation, stationAt, stationReach } from './trade.ts';
import { setOut } from './run-table.ts';
import type { Station } from './trade.ts';
import { requestGlitch, setGlitchesEnabled } from './glitch.ts';
import { readPage } from './story.ts';
import { chooseGait } from '../gait.ts';
import type { GaitChoice } from '../gait.ts';
import { chooseHero, HERO, heroRig } from '../hero.ts';
import { stepWaypoints, teleport } from './waypoints.ts';
import { findExit, stepCheckpoints, travelThrough } from './zones.ts';
import { exitWaits } from './scene.ts';
import type { PortalEnd } from './portal-types.ts';
import { sameFloor } from './floors.ts';
import { goThrough, portalEndHere, stepChannel, useItem } from './portal.ts';
import { readyBenchHero } from './bench-hero.ts';
import { isPrimary } from './heroes.ts';

const PLAYER = {
  moveDeadZone: 0.7,
  faceDeadZone: 0.1,
  faceTurn: 0.35,
  resumeDistance: 1.4,
  repathInterval: 0.2,
  goldDelay: 0.45,
  stride: 2.5,
  firstStepFraction: 0.95,
  stuckStep: 1e-4,
  spawnAhead: 7,
} as const;

const HERO_COMMANDS: ReadonlySet<Command['type']> = new Set<Command['type']>(['flask', 'hold', 'steer', 'move', 'walk', 'stop', 'skill']);

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

function heroSteering(world: World): Steering {
  return { ...STEERING, maxTurnRate: world.content.player.walkTurnRate };
}

function setDestination(world: World, player: PlayerState, dest: Vec2): void {
  player.path = walkPath(world, player.pos, dest);
  player.repathTimer = PLAYER.repathInterval;
}

function heldAim(world: World, player: PlayerState, dest: Vec2): Vec2 {
  const walkable: boolean = isWalkable(world.grid, dest.x, dest.z);
  return walkable ? dest : (nearFace(world.grid, player.pos, dest) ?? dest);
}

interface HeldWay {
  readonly path: Vec2[] | null;
  readonly pressing: boolean;
}

function roundWay(world: World, player: PlayerState, dest: Vec2): Vec2[] | null {
  if (lineWalkable(world.grid, player.pos, dest)) return null;
  const openings: Vec2[] = pastBlocks(world.grid, player.pos, dest);
  if (openings.length === 0) return null;
  const going: boolean = player.intent.type === 'move' && player.path.length > 0;
  if (going && (stillRound(player.path, openings) || player.repathTimer > 0)) return player.path;
  if (player.repathTimer > 0) return null;
  player.repathTimer = PLAYER.repathInterval;
  return roundPast(world.grid, player.pos, openings);
}

function heldWay(world: World, player: PlayerState, dest: Vec2, around: boolean): HeldWay {
  const round: Vec2[] | null = around ? roundWay(world, player, dest) : null;
  if (round !== null) return { path: round, pressing: false };
  const pressing: boolean = !isWalkable(world.grid, dest.x, dest.z);
  const aim: Vec2 = heldAim(world, player, dest);
  const direct: Vec2[] | null = directPath(world.grid, player.pos, aim);
  if (direct !== null) return { path: direct, pressing };
  if (player.repathTimer > 0) return { path: player.path.length > 0 ? player.path : null, pressing };
  player.repathTimer = PLAYER.repathInterval;
  return { path: walkPath(world, player.pos, aim), pressing };
}

function startMove(world: World, player: PlayerState, dest: Vec2, held: boolean, around: boolean): void {
  const way: HeldWay = held || around ? heldWay(world, player, dest, around) : { path: walkPath(world, player.pos, dest), pressing: false };
  const path: Vec2[] | null = way.path;
  if (path === null) return;
  const goal: Vec2 = path.at(-1) ?? player.pos;
  const reach: number = distance(player.pos, goal);
  const standing: boolean = player.path.length === 0;
  const pressing: boolean = way.pressing;
  const deadZone: number = pressing ? PLAYER.faceDeadZone : PLAYER.moveDeadZone;
  const tooClose: boolean = reach < deadZone || (held && !pressing && standing && reach < PLAYER.resumeDistance);
  if (tooClose) {
    if (pressing) faceToward(player, { x: dest.x - player.pos.x, z: dest.z - player.pos.z }, PLAYER.faceTurn);
    if (!held || reach < deadZone) {
      player.intent = { type: 'idle' };
      player.path = [];
    }
    return;
  }
  player.intent = { type: 'move', dest };
  player.path = path;
  if (!held && !around) player.repathTimer = PLAYER.repathInterval;
}

function fire(world: World, player: PlayerState, skill: SkillDef, aim: Vec2, slot: number): boolean {
  const reason: NoticeReason | null = blockedReason(player, skill);
  if (reason !== null) {
    world.events.push({ type: 'notice', reason });
    return false;
  }
  if (isPrimary(world, player)) closeDialogue(world, false);
  player.intent = { type: 'idle' };
  player.path = [];
  startSkill(world, player, skill, { x: aim.x - player.pos.x, z: aim.z - player.pos.z }, slot);
  return true;
}

function inEngageRange(world: World, player: PlayerState, target: Actor, skill: SkillDef): boolean {
  return distance(player.pos, target.pos) - target.radius <= skill.engageRange && sameFloor(world, player.pos, target.pos);
}

function useSkill(world: World, player: PlayerState, command: SkillCommand): void {
  const skill: SkillDef | undefined = player.skills[command.slot] ?? undefined;
  if (skill === undefined) {
    const clicked: Actor | null = command.targetId === null ? null : findActor(world, command.targetId);
    if (clicked !== null && clicked.alive) startMove(world, player, clicked.pos, false, false);
    return;
  }
  if (skill.delivery.type === 'dash') {
    if (canDash(player)) fire(world, player, skill, dashAim(player, command.aim, player.path), command.slot);
    return;
  }
  const target: Actor | null = command.targetId === null ? null : findActor(world, command.targetId);
  if (target === null || !target.alive || glidesWith(skill.press)) {
    fire(world, player, skill, target?.alive === true ? target.pos : command.aim, command.slot);
    return;
  }
  if (inEngageRange(world, player, target, skill)) {
    fire(world, player, skill, target.pos, command.slot);
    return;
  }
  const reason: NoticeReason | null = blockedReason(player, skill);
  if (reason !== null) {
    world.events.push({ type: 'notice', reason });
    return;
  }
  if (isPrimary(world, player)) closeDialogue(world, false);
  if (player.intent.type !== 'attack') player.chase = freshChase(player.pos);
  player.intent = { type: 'attack', slot: command.slot, targetId: target.id };
  chaseTarget(world, player, target);
}

function chaseTarget(world: World, player: PlayerState, target: Actor): void {
  player.path = chasePath(world, player, target);
  player.repathTimer = PLAYER.repathInterval;
}

function strikeBlocker(world: World, player: PlayerState, target: Actor, skill: SkillDef, slot: number): boolean {
  const blocker: Actor | null = blockerInReach(world, player, target, skill);
  if (blocker === null || !fire(world, player, skill, blocker.pos, slot)) return false;
  player.intent = { type: 'attack', slot, targetId: target.id };
  player.chase = freshChase(player.pos);
  return true;
}

function act(world: World, player: PlayerState, command: Command): void {
  if (player.pivot !== null && (command.type === 'move' || command.type === 'walk') && command.held) return;
  player.pivot = null;
  switch (command.type) {
    case 'move':
      startMove(world, player, command.dest, command.held, false);
      return;
    case 'walk':
      startMove(world, player, command.dest, command.held, true);
      return;
    case 'stop':
      player.intent = { type: 'idle' };
      player.path = [];
      return;
    case 'pickup': {
      const ground: GroundItem | undefined = world.ground.find((entry: GroundItem): boolean => entry.id === command.groundId);
      if (ground === undefined) return;
      player.intent = { type: 'pickup', groundId: ground.id };
      setDestination(world, player, ground.pos);
      return;
    }
    case 'skill':
      useSkill(world, player, command);
      return;
    case 'travel': {
      const exit: ZoneExit | null = findExit(world.zone, command.exit);
      if (exit === null) return;
      if (!allHold(world, exit.requires)) {
        world.events.push({ type: 'exit_locked', exit: exit.id, hint: exit.lockedHint });
        return;
      }
      player.intent = { type: 'travel', exit: exit.id };
      setDestination(world, player, exit);
      return;
    }
    case 'talk': {
      const npc: NpcState | null = talkable(world, command.npcId);
      if (npc === null) return;
      player.intent = { type: 'talk', npcId: npc.id };
      setDestination(world, player, npc.pos);
      return;
    }
    case 'teleport':
      teleport(world, command.zone);
      return;
    case 'enter_portal': {
      const end: PortalEnd | null = portalEndHere(world);
      if (end === null) return;
      player.intent = { type: 'portal' };
      setDestination(world, player, end.pos);
      return;
    }
    case 'use': {
      const station: Station | null = stationAt(world, command.prop);
      const cache: Cache | null = station === null ? cacheAt(world, command.prop) : null;
      const placed: Vec2 | null = station?.placed ?? cache?.placed ?? null;
      if (placed === null) return;
      player.intent = { type: 'use', prop: command.prop };
      setDestination(world, player, placed);
      return;
    }
    case 'open': {
      const moment: MomentState | null = chestOf(world, command.momentId);
      const spot: Vec2 | null = moment === null ? null : chestSpot(moment);
      if (moment === null || spot === null) return;
      player.intent = { type: 'open', momentId: moment.id };
      setDestination(world, player, spot);
      return;
    }
    case 'flask':
    case 'slot':
    case 'hold':
    case 'steer':
    case 'trade':
    case 'purse':
    case 'read':
    case 'glitch':
    case 'glitch_setting':
    case 'strike':
    case 'spawn':
    case 'bench':
    case 'advance':
    case 'replay':
    case 'equip':
    case 'hero':
    case 'unequip':
    case 'drop':
    case 'arrange':
    case 'allocate':
    case 'refund':
    case 'respec':
    case 'choose_change':
    case 'respawn':
    case 'leave_duel':
    case 'use_item':
    case 'set_out':
      return;
  }
}

function cutByDodge(player: PlayerState, command: Command | null): boolean {
  const action: ActionState | null = player.action;
  if (command?.type !== 'skill' || action === null || !givesWayToDodge(action, isHeld(player, action))) return false;
  const skill: SkillDef | undefined = player.skills[command.slot] ?? undefined;
  return skill !== undefined && dodgesAtOnce(skill, command.targetId !== null) && canDash(player) && blockedReason(player, skill) === null;
}

export function handleCommand(world: World, player: PlayerState, command: Command): void {
  if (!isPrimary(world, player) && !HERO_COMMANDS.has(command.type)) return;
  switch (command.type) {
    case 'equip':
      equipFromInventory(world, command.inventoryIndex);
      return;
    case 'hero':
      chooseHero(world, command.hero);
      return;
    case 'unequip':
      unequip(world, command.slot);
      return;
    case 'drop':
      dropFromInventory(world, command.inventoryIndex);
      return;
    case 'arrange':
      arrangeInventory(world, command.from, command.to);
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
    case 'choose_change':
      chooseChange(world, command.skill, command.becomes);
      return;
    case 'advance':
      advanceDialogue(world);
      return;
    case 'replay':
      replayDialogue(world);
      return;
    case 'respawn':
      respawnPlayer(world, command.choice);
      return;
    case 'leave_duel':
      leaveDuel(world);
      return;
    case 'use_item':
      useItem(world, command.inventoryIndex);
      return;
    case 'set_out':
      setOut(world, command.setup);
      return;
    case 'flask':
      useFlask(world, player, command.slot);
      return;
    case 'trade':
      handleTrade(world, command.action);
      return;
    case 'purse':
      handlePurse(world, command);
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
    case 'strike':
      forceStrike(world, command.at, command.moment);
      return;
    case 'bench':
      readyBenchHero(world, command.hero);
      return;
    case 'spawn':
      spawnPackNear(world, command.monster, command.count, { x: player.pos.x + Math.sin(player.facing) * PLAYER.spawnAhead, z: player.pos.z + Math.cos(player.facing) * PLAYER.spawnAhead });
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
    case 'open':
    case 'move':
    case 'walk':
    case 'stop':
    case 'pickup':
    case 'skill':
    case 'travel':
    case 'talk':
    case 'teleport':
    case 'enter_portal':
      if (!player.alive) return;
      if (command.type !== 'skill' && isPrimary(world, player)) closeDialogue(world, false);
      if ((command.type === 'move' || command.type === 'walk') && aimGlide(player, command.dest)) return;
      if (cutByDodge(player, command)) player.action = null;
      if (player.action !== null) {
        player.buffered = bufferPress(player.buffered, pressOf(world, player, command));
        return;
      }
      act(world, player, command);
      return;
  }
}

function rankOf(player: PlayerState, command: Command): PressRank {
  if (command.type !== 'skill') return 'move';
  const skill: SkillDef | null = player.skills[command.slot] ?? null;
  return skill !== null && isDodge(skill) ? 'dodge' : 'skill';
}

function pressOf(world: World, player: PlayerState, command: Command): Buffered {
  return { command, rank: rankOf(player, command), at: world.time };
}

function canTake(player: PlayerState, command: Command): boolean {
  if (command.type !== 'skill') return true;
  const skill: SkillDef | null = player.skills[command.slot] ?? null;
  if (skill === null) return true;
  return blockedReason(player, skill) === null && (!isDodge(skill) || canDash(player));
}

function pursue(world: World, player: PlayerState, dest: Vec2, dt: number): void {
  player.repathTimer -= dt;
  if (player.repathTimer <= 0) setDestination(world, player, dest);
}

function stepIntent(world: World, player: PlayerState, dt: number): void {
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
      if (inEngageRange(world, player, target, skill)) {
        if (!fire(world, player, skill, target.pos, intent.slot)) {
          player.intent = { type: 'idle' };
          player.path = [];
        }
        return;
      }
      if (chaseStalled(player, dt)) {
        player.chase = freshChase(player.pos);
        if (strikeBlocker(world, player, target, skill, intent.slot)) return;
        player.repathTimer = 0;
      }
      player.repathTimer -= dt;
      if (player.repathTimer <= 0) chaseTarget(world, player, target);
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
      pursue(world, player, ground.pos, dt);
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
        if (exitWaits(world, exit.id)) {
          player.moving = false;
          player.intent = { type: 'idle' };
          player.path = [];
        } else travelThrough(world, exit);
        return;
      }
      pursue(world, player, exit, dt);
      return;
    }
    case 'talk': {
      const npc: NpcState | null = talkable(world, intent.npcId);
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
      pursue(world, player, npc.pos, dt);
      return;
    }
    case 'use':
      useProp(world, player, intent.prop, dt);
      return;
    case 'portal_channel':
      stepChannel(world, intent, dt);
      return;
    case 'portal': {
      const end: PortalEnd | null = portalEndHere(world);
      if (end === null) {
        player.intent = { type: 'idle' };
        player.path = [];
        return;
      }
      if (distance(player.pos, end.pos) <= end.reach) {
        player.intent = { type: 'idle' };
        player.path = [];
        goThrough(world, end);
        return;
      }
      pursue(world, player, end.pos, dt);
      return;
    }
    case 'open': {
      const moment: MomentState | null = chestOf(world, intent.momentId);
      const spot: Vec2 | null = moment === null ? null : chestSpot(moment);
      if (moment === null || spot === null) {
        player.intent = { type: 'idle' };
        player.path = [];
        return;
      }
      if (distance(player.pos, spot) <= chestReach(world)) {
        player.intent = { type: 'idle' };
        player.path = [];
        openChest(world, moment);
        return;
      }
      pursue(world, player, spot, dt);
      return;
    }
  }
}

function useProp(world: World, player: PlayerState, index: number, dt: number): void {
  const station: Station | null = stationAt(world, index);
  const cache: Cache | null = station === null ? cacheAt(world, index) : null;
  const placed: Vec2 | null = station?.placed ?? cache?.placed ?? null;
  const reach: number = station !== null ? stationReach(world, station) : cache !== null ? cacheReach(world, cache) : 0;
  if (placed !== null && distance(player.pos, placed) > reach) {
    pursue(world, player, placed, dt);
    return;
  }
  player.intent = { type: 'idle' };
  player.path = [];
  if (station !== null) openStation(world, station);
  if (cache !== null) openCache(world, cache);
}

function collectGold(world: World, player: PlayerState): void {
  for (const ground of world.ground) {
    if (ground.content.kind !== 'gold' || ground.age < PLAYER.goldDelay) continue;
    if (distance(player.pos, ground.pos) <= world.content.player.goldMagnetRadius) pickUp(world, ground);
  }
}

function isBusy(player: PlayerState): boolean {
  return player.action !== null;
}

export interface StepStride {
  readonly gait: number;
  readonly metres: number | null;
}

export function stepStride(rig: RigDef | undefined, speed: number, held: number): StepStride {
  if (rig === undefined || rig.gaits.length === 0) return { gait: held, metres: PLAYER.stride };
  const choice: GaitChoice | null = chooseGait(rig.gaits, HERO.size, speed, held);
  if (choice === null) return { gait: held, metres: null };
  const stride: number | null = rig.gaits[choice.index]?.stride ?? null;
  return { gait: choice.index, metres: stride === null ? PLAYER.stride : stride * HERO.size };
}

function emitSteps(world: World, player: PlayerState, travelled: number): void {
  const stride: StepStride = stepStride(world.content.rigs.get(heroRig(world.content, player.hero)), player.gait, player.strideGait);
  if (stride.gait !== player.strideGait || stride.metres === null) player.stridePhase = PLAYER.firstStepFraction;
  player.strideGait = stride.gait;
  if (stride.metres === null) return;
  player.stridePhase += travelled / stride.metres;
  while (player.stridePhase >= 1) {
    player.stridePhase -= 1;
    world.events.push({ type: 'hero_step', pos: { x: player.pos.x, z: player.pos.z } });
  }
}

export function stepPlayer(world: World, player: PlayerState, dt: number): void {
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
  stepMomentum(player, dt);
  stepKnock(world.grid, player, dt);
  stepAction(world, player, dt * player.tempo);
  stepPivot(world, player, dt * player.tempo);
  player.moving = false;
  const startX: number = player.pos.x;
  const startZ: number = player.pos.z;
  if (cutByDodge(player, player.buffered.dodge?.command ?? null)) player.action = null;
  if (player.action === null) {
    const taken: Taken = takePress(player.buffered, world.time, (command: Command): boolean => canTake(player, command));
    player.buffered = taken.rest;
    if (taken.press !== null) act(world, player, taken.press.command);
  }
  if (player.action === null) {
    stepIntent(world, player, dt);
    if (!isBusy(player) && !beingKnocked(player) && player.root <= 0 && player.tempo > 0 && player.path.length > 0) {
      const step: SteerStep = steerAlong(world.grid, player, player.path, player.stats.moveSpeed * tailwindPace(world) * player.tempo * dt, dt, heroSteering(world));
      const stuck: boolean = step.tried > PLAYER.stuckStep && step.moved <= PLAYER.stuckStep;
      player.moving = !stuck && (player.path.length > 0 || step.moved > PLAYER.stuckStep);
      if (stuck) {
        player.path = [];
        player.repathTimer = PLAYER.repathInterval;
      } else if (player.path.length === 0) player.repathTimer = 0;
    }
  } else if (glide(world.grid, player, dt, world.content.player.turnRate, tailwindPace(world))) player.moving = true;
  player.walked = player.moving ? { x: player.pos.x - startX, z: player.pos.z - startZ } : { x: 0, z: 0 };
  if (player.moving) emitSteps(world, player, Math.hypot(player.pos.x - startX, player.pos.z - startZ));
  else player.stridePhase = PLAYER.firstStepFraction;
  if (!isPrimary(world, player)) return;
  collectGold(world, player);
  stepCheckpoints(world);
  stepWaypoints(world);
}
