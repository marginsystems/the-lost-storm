import type { SkillDef, ZoneExit } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { findPath } from '../nav/path.ts';
import { addToInventory, allocateNode, dropFromInventory, equipFromInventory, unequip } from './character.ts';
import { findActor } from './combat.ts';
import { advanceDialogue, closeDialogue, DIALOGUE, findNpc, openDialogue } from './dialogue.ts';
import { removeGround } from './ground.ts';
import { followPath, stepKnock, stepTimers } from './movement.ts';
import { allHold } from './conditions.ts';
import { clearHazards } from './hazards.ts';
import { blockedReason, clearProjectiles, startSkill, stepAction } from './skills.ts';
import type { Actor, Command, GroundItem, NoticeReason, NpcState, PlayerState, SkillCommand, World } from './types.ts';
import { stepWaypoints, teleport } from './waypoints.ts';
import { findExit, placePlayer, stepCheckpoints, travelThrough } from './zones.ts';

const PLAYER = {
  moveDeadZone: 0.7,
  resumeDistance: 1.4,
  repathInterval: 0.2,
  goldDelay: 0.45,
  stride: 2.5,
  firstStepFraction: 0.6,
  turnRate: 16,
  stuckStep: 1e-4,
} as const;

function setDestination(world: World, dest: Vec2): void {
  world.player.path = findPath(world.grid, world.player.pos, dest);
  world.player.repathTimer = PLAYER.repathInterval;
}

function startMove(world: World, dest: Vec2, held: boolean): void {
  const player: PlayerState = world.player;
  const path: Vec2[] = findPath(world.grid, player.pos, dest);
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
  player.repathTimer = PLAYER.repathInterval;
}

function fire(world: World, skill: SkillDef, aim: Vec2): boolean {
  const player: PlayerState = world.player;
  const reason: NoticeReason | null = blockedReason(player, skill);
  if (reason !== null) {
    world.events.push({ type: 'notice', reason });
    return false;
  }
  closeDialogue(world, false);
  player.intent = { type: 'idle' };
  player.path = [];
  startSkill(world, player, skill, { x: aim.x - player.pos.x, z: aim.z - player.pos.z });
  return true;
}

function inEngageRange(player: PlayerState, target: Actor, skill: SkillDef): boolean {
  return distance(player.pos, target.pos) - target.radius <= skill.engageRange;
}

function useSkill(world: World, command: SkillCommand): void {
  const player: PlayerState = world.player;
  const skill: SkillDef | undefined = player.skills[command.slot];
  if (skill === undefined) return;
  const target: Actor | null = command.targetId === null ? null : findActor(world, command.targetId);
  if (target === null || !target.alive) {
    fire(world, skill, command.aim);
    return;
  }
  if (inEngageRange(player, target, skill)) {
    fire(world, skill, target.pos);
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
    case 'advance':
    case 'equip':
    case 'unequip':
    case 'drop':
    case 'allocate':
      return;
  }
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
    case 'advance':
      advanceDialogue(world);
      return;
    case 'move':
    case 'stop':
    case 'pickup':
    case 'skill':
    case 'travel':
    case 'talk':
    case 'teleport':
      if (!player.alive) return;
      if (command.type !== 'skill') closeDialogue(world, false);
      if (player.action !== null) {
        player.queued = command;
        return;
      }
      act(world, command);
      return;
  }
}

function pickUp(world: World, ground: GroundItem): void {
  const player: PlayerState = world.player;
  if (ground.content.kind === 'gold') {
    player.gold += ground.content.amount;
  } else if (!addToInventory(player, ground.content.item)) {
    world.events.push({ type: 'notice', reason: 'inventory_full' });
    return;
  }
  removeGround(world, ground.id);
  world.events.push({ type: 'pickup', ground });
  if (ground.content.kind === 'item') world.events.push({ type: 'character_changed' });
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
      return;
    case 'move':
      if (player.path.length === 0) player.intent = { type: 'idle' };
      return;
    case 'attack': {
      const target: Actor | null = findActor(world, intent.targetId);
      const skill: SkillDef | undefined = player.skills[intent.slot];
      if (target === null || !target.alive || skill === undefined) {
        player.intent = { type: 'idle' };
        player.path = [];
        return;
      }
      if (inEngageRange(player, target, skill)) {
        if (!fire(world, skill, target.pos)) {
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
        openDialogue(world, npc);
        return;
      }
      pursue(world, npc.pos, dt);
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

function respawn(world: World): void {
  const player: PlayerState = world.player;
  player.alive = true;
  player.life = player.maxLife;
  player.mana = player.stats.maxMana;
  player.cooldowns = {};
  player.combo = null;
  player.root = 0;
  placePlayer(world);
  clearProjectiles(world);
  clearHazards(world);
  for (const monster of world.monsters) {
    if (!monster.alive) continue;
    monster.aggro = false;
    monster.life = monster.maxLife;
    monster.pos = { x: monster.home.x, z: monster.home.z };
    monster.knock = { x: 0, z: 0 };
    monster.action = null;
    monster.path = [];
    monster.stance = 'approach';
    monster.blindTime = 0;
    monster.stuckTime = 0;
    monster.restTime = 0;
    monster.lastPos = { x: monster.pos.x, z: monster.pos.z };
    monster.lastTravel = 0;
    monster.stagger = 0;
    monster.phase = 0;
    monster.nextSkill = null;
  }
  world.events.push({ type: 'player_respawn' });
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
  if (!player.alive) {
    player.deadTime += dt;
    player.respawnTimer -= dt;
    stepKnock(world.grid, player, dt);
    if (player.respawnTimer <= 0) respawn(world);
    return;
  }
  player.life = Math.min(player.maxLife, player.life + player.stats.lifeRegen * dt);
  player.mana = Math.min(player.stats.maxMana, player.mana + player.stats.manaRegen * dt);
  stepTimers(player, dt);
  stepKnock(world.grid, player, dt);
  stepAction(world, player, dt);
  player.moving = false;
  const startX: number = player.pos.x;
  const startZ: number = player.pos.z;
  if (player.action === null && player.queued !== null) {
    const queued: Command = player.queued;
    player.queued = null;
    act(world, queued);
  }
  if (player.action === null) {
    stepIntent(world, dt);
    if (!isBusy(player) && player.root <= 0 && player.path.length > 0) {
      const moved: number = followPath(world.grid, player, player.path, player.stats.moveSpeed * dt, PLAYER.turnRate * dt);
      player.moving = moved > PLAYER.stuckStep;
      if (!player.moving) {
        player.path = [];
        player.repathTimer = PLAYER.repathInterval;
      } else if (player.path.length === 0) player.repathTimer = 0;
    }
  }
  if (player.moving) emitSteps(world, player, Math.hypot(player.pos.x - startX, player.pos.z - startZ));
  else player.strideTravel = PLAYER.stride * PLAYER.firstStepFraction;
  collectGold(world);
  stepCheckpoints(world);
  stepWaypoints(world);
}
