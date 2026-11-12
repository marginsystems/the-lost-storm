import type { ObjectiveDef, PathObjective, QuestDef, SkillDef, ZoneDef, ZoneExit } from './content/types.ts';
import type { ReadonlyVec2, Vec2 } from './math.ts';
import { DEGREES_TO_RADIANS, distance, dot, normalize, rotate } from './math.ts';
import { isWalkable, lineWalkable } from './nav/grid.ts';
import { allHold, questState } from './world/conditions.ts';
import { objectivePaths } from './content/road.ts';
import { currentObjective } from './world/quests.ts';
import { SKILLS } from './world/skills.ts';
import { choicesOpen } from './world/death.ts';
import { stepWorld } from './world/step.ts';
import type { Command, HazardState, MonsterState, NpcState, World, WorldEvent } from './world/types.ts';

export const BOT = {
  step: 1 / 30,
  walkLimit: 90,
  talkLimit: 60,
  fightLimit: 300,
  questLimit: 900,
  arrive: 0.6,
  threat: 9,
  novaCrowd: 2,
  novaReach: 4,
  boltGap: 5,
  idleRepeat: 0.4,
  maxLines: 60,
  dodgeMargin: 0.6,
  dodgeAngles: 16,
  dodgeReach: [2.5, 4, 6, 8, 11],
} as const;

export interface BotReport {
  readonly completed: readonly string[];
  readonly stuck: string | null;
  readonly seconds: number;
  readonly deaths: number;
}

export interface BotHabits {
  readonly dodges: boolean;
  readonly reaction: number;
}

export const CAREFUL: BotHabits = { dodges: true, reaction: 0 };

export type BotWatch = (events: readonly WorldEvent[]) => void;

export interface Bot {
  readonly world: World;
  readonly events: WorldEvent[];
  readonly habits: BotHabits;
  readonly watch: BotWatch | null;
  deaths: number;
}

export function createBot(world: World, habits: BotHabits = CAREFUL, watch: BotWatch | null = null): Bot {
  return { world, events: [], habits, watch, deaths: 0 };
}

function tick(bot: Bot, commands: readonly Command[]): WorldEvent[] {
  const events: WorldEvent[] = stepWorld(bot.world, choicesOpen(bot.world) ? [...commands, { type: 'respawn', choice: 'checkpoint' }] : commands, BOT.step);
  for (const event of events) {
    if (event.type === 'death' && event.team === 'player') bot.deaths += 1;
  }
  bot.events.push(...events);
  bot.watch?.(events);
  return events;
}

function free(world: World): boolean {
  return world.player.alive && world.player.action === null && world.player.queued === null;
}

function threats(world: World): MonsterState[] {
  return world.monsters.filter((monster: MonsterState): boolean => monster.alive && (monster.aggro || distance(monster.pos, world.player.pos) <= BOT.threat));
}

function nearest(world: World, monsters: readonly MonsterState[]): MonsterState | null {
  let best: MonsterState | null = null;
  let bestGap: number = Infinity;
  for (const monster of monsters) {
    const gap: number = distance(monster.pos, world.player.pos);
    if (gap < bestGap) {
      bestGap = gap;
      best = monster;
    }
  }
  return best;
}

function ready(world: World, slot: number): SkillDef | null {
  const skill: SkillDef | undefined = world.player.skills[slot];
  if (skill === undefined) return null;
  return (world.player.cooldowns[skill.id] ?? 0) <= 0 && world.player.mana >= skill.manaCost ? skill : null;
}

function attack(world: World, target: MonsterState, crowd: readonly MonsterState[]): Command {
  const gap: number = distance(target.pos, world.player.pos);
  const close: number = crowd.filter((monster: MonsterState): boolean => distance(monster.pos, world.player.pos) <= BOT.novaReach).length;
  if (close >= BOT.novaCrowd && ready(world, 1) !== null) return { type: 'skill', slot: 1, aim: target.pos, targetId: null };
  if (gap > BOT.boltGap && ready(world, 2) !== null) return { type: 'skill', slot: 2, aim: target.pos, targetId: null };
  return { type: 'skill', slot: 0, aim: target.pos, targetId: target.id };
}

function threatened(world: World, monster: MonsterState, pos: ReadonlyVec2, reaction: number): boolean {
  const action = monster.action;
  if (!monster.alive || action === null || action.phase !== 'windup' || action.windup - action.timeLeft < reaction) return false;
  const reach: number = world.player.radius + BOT.dodgeMargin;
  const origin: ReadonlyVec2 = action.skill.leap === null ? monster.pos : (action.target ?? monster.pos);
  const offset: Vec2 = { x: pos.x - origin.x, z: pos.z - origin.z };
  const gap: number = Math.hypot(offset.x, offset.z);
  const delivery = action.skill.delivery;
  let inside: boolean;
  switch (delivery.type) {
    case 'nova':
      inside = gap <= delivery.radius + reach;
      break;
    case 'arc': {
      const spread: number = Math.cos(Math.min(Math.PI, (delivery.arcDegrees / 2) * DEGREES_TO_RADIANS + BOT.dodgeMargin / Math.max(1, gap)));
      inside = gap <= delivery.reach + reach && (gap <= reach || dot(normalize(offset, action.direction), action.direction) >= spread);
      break;
    }
    case 'mark': {
      const mark: ReadonlyVec2 = action.target ?? monster.pos;
      inside = Math.hypot(pos.x - mark.x, pos.z - mark.z) <= delivery.radius + reach;
      break;
    }
    case 'projectile': {
      const count: number = Math.max(1, Math.round(delivery.count));
      inside = false;
      for (let index: number = 0; index < count; index += 1) {
        const lane: Vec2 = rotate(action.direction, count === 1 ? 0 : (index - (count - 1) / 2) * delivery.spreadDegrees * DEGREES_TO_RADIANS);
        const along: number = dot(offset, lane);
        const across: number = Math.abs(offset.x * lane.z - offset.z * lane.x);
        if (along >= 0 && along <= delivery.range + SKILLS.projectileOrigin + delivery.radius + reach && across <= delivery.radius + reach) inside = true;
      }
      break;
    }
    case 'field': {
      const centre: ReadonlyVec2 = delivery.anchor === 'caster' ? monster.pos : (action.target ?? monster.pos);
      inside = delivery.pulse > 0 && Math.hypot(pos.x - centre.x, pos.z - centre.z) <= delivery.radius + reach;
      break;
    }
    case 'beam': {
      const along: number = dot(offset, action.direction);
      inside = along >= 0 && along <= delivery.range + reach && Math.abs(offset.x * action.direction.z - offset.z * action.direction.x) <= delivery.width / 2 + reach;
      break;
    }
    case 'chain':
      inside = gap <= delivery.range + reach;
      break;
    case 'blink':
    case 'dash':
      inside = false;
      break;
  }
  return inside;
}

export function botInDanger(world: World, pos: ReadonlyVec2, reaction: number = 0): boolean {
  const reach: number = world.player.radius + BOT.dodgeMargin;
  if (world.hazards.some((hazard: HazardState): boolean => hazard.team === 'monster' && Math.hypot(pos.x - hazard.pos.x, pos.z - hazard.pos.z) <= hazard.radius + reach)) return true;
  return world.monsters.some((monster: MonsterState): boolean => threatened(world, monster, pos, reaction));
}

function refuge(world: World): Vec2 | null {
  const from: Vec2 = world.player.pos;
  for (const reach of BOT.dodgeReach) {
    for (let step: number = 0; step < BOT.dodgeAngles; step += 1) {
      const angle: number = (step / BOT.dodgeAngles) * Math.PI * 2;
      const spot: Vec2 = { x: from.x + Math.cos(angle) * reach, z: from.z + Math.sin(angle) * reach };
      if (isWalkable(world.grid, spot.x, spot.z) && lineWalkable(world.grid, from, spot) && !botInDanger(world, spot)) return spot;
    }
  }
  return null;
}

function fightStep(bot: Bot, prefer: string | null): boolean {
  const world: World = bot.world;
  const hostile: MonsterState[] = threats(world);
  const wanted: MonsterState[] = prefer === null ? [] : world.monsters.filter((monster: MonsterState): boolean => monster.alive && monster.def.id === prefer);
  const target: MonsterState | null = nearest(world, hostile.length > 0 ? hostile : wanted);
  if (target === null) return false;
  if (bot.habits.dodges && world.player.alive && botInDanger(world, world.player.pos, bot.habits.reaction)) {
    const spot: Vec2 | null = world.player.intent.type === 'move' && !botInDanger(world, world.player.intent.dest) ? null : refuge(world);
    tick(bot, free(world) && spot !== null ? [{ type: 'move', held: false, dest: spot }] : []);
    return true;
  }
  tick(bot, free(world) ? [attack(world, target, hostile)] : []);
  return true;
}

export function botFight(bot: Bot, done: () => boolean, prefer: string | null): boolean {
  const steps: number = Math.round(BOT.fightLimit / BOT.step);
  for (let step: number = 0; step < steps; step += 1) {
    if (done()) return true;
    if (!fightStep(bot, prefer)) tick(bot, []);
    if (prefer === null && threats(bot.world).length === 0 && bot.world.player.alive) return done();
  }
  return done();
}

export function botWalkTo(bot: Bot, zone: string, point: Vec2, radius: number): boolean {
  const world: World = bot.world;
  const steps: number = Math.round(BOT.walkLimit / BOT.step);
  let sinceOrder: number = BOT.idleRepeat;
  for (let step: number = 0; step < steps; step += 1) {
    if (world.zone.id !== zone) return false;
    if (world.player.alive && distance(world.player.pos, point) <= radius) return true;
    if (threats(world).length > 0) {
      fightStep(bot, null);
      sinceOrder = BOT.idleRepeat;
      continue;
    }
    sinceOrder += BOT.step;
    const order: boolean = free(world) && (sinceOrder >= BOT.idleRepeat || world.player.intent.type === 'idle');
    if (order) sinceOrder = 0;
    tick(bot, order ? [{ type: 'move', held: false, dest: point }] : []);
  }
  return false;
}

function passable(world: World, exit: ZoneExit): boolean {
  return allHold(world, exit.requires);
}

export function botRoute(world: World, target: string): ZoneExit[] | null {
  const routes: Map<string, ZoneExit[]> = new Map<string, ZoneExit[]>([[world.zone.id, []]]);
  const queue: string[] = [world.zone.id];
  while (queue.length > 0) {
    const here: string | undefined = queue.shift();
    const zone: ZoneDef | undefined = here === undefined ? undefined : world.content.zones.get(here);
    const route: ZoneExit[] | undefined = here === undefined ? undefined : routes.get(here);
    if (zone === undefined || route === undefined) continue;
    if (zone.id === target) return route;
    for (const exit of zone.exits) {
      if (routes.has(exit.to) || !passable(world, exit)) continue;
      routes.set(exit.to, [...route, exit]);
      queue.push(exit.to);
    }
  }
  return null;
}

function through(bot: Bot, exit: ZoneExit): boolean {
  const world: World = bot.world;
  const from: string = world.zone.id;
  if (!botWalkTo(bot, from, exit, exit.radius + BOT.threat)) return false;
  const steps: number = Math.round(BOT.walkLimit / BOT.step);
  let sinceOrder: number = BOT.idleRepeat;
  for (let step: number = 0; step < steps; step += 1) {
    if (world.zone.id === exit.to) return true;
    if (world.zone.id !== from) return false;
    sinceOrder += BOT.step;
    const order: boolean = free(world) && (sinceOrder >= BOT.idleRepeat || world.player.intent.type !== 'travel');
    if (order) sinceOrder = 0;
    tick(bot, order ? [{ type: 'travel', exit: exit.id }] : []);
  }
  return false;
}

export function botTravelTo(bot: Bot, target: string): boolean {
  for (let hop: number = 0; hop <= bot.world.content.zones.size; hop += 1) {
    if (bot.world.zone.id === target) return true;
    const next: ZoneExit | undefined = botRoute(bot.world, target)?.[0];
    if (next === undefined || !through(bot, next)) return false;
  }
  return bot.world.zone.id === target;
}

function talking(world: World): boolean {
  return world.dialogue !== null;
}

export function botTalk(bot: Bot, npcId: string): boolean {
  const world: World = bot.world;
  const npc: NpcState | undefined = world.npcs.find((candidate: NpcState): boolean => candidate.def.id === npcId);
  if (npc === undefined) return false;
  const steps: number = Math.round(BOT.talkLimit / BOT.step);
  let sinceOrder: number = BOT.idleRepeat;
  for (let step: number = 0; step < steps && !talking(world); step += 1) {
    sinceOrder += BOT.step;
    const order: boolean = free(world) && (sinceOrder >= BOT.idleRepeat || world.player.intent.type !== 'talk');
    if (order) sinceOrder = 0;
    tick(bot, order ? [{ type: 'talk', npcId: npc.id }] : []);
  }
  if (!talking(world)) return false;
  for (let line: number = 0; line < BOT.maxLines && talking(world); line += 1) tick(bot, [{ type: 'advance' }]);
  return !talking(world);
}

function zoneOfNpc(world: World, npcId: string): string | null {
  if (world.npcs.some((npc: NpcState): boolean => npc.def.id === npcId)) return world.zone.id;
  for (const zone of world.content.zones.values()) {
    if (zone.npcs.some((placed): boolean => placed.npc === npcId && allHold(world, placed.when))) return zone.id;
  }
  return null;
}

function zoneOfMonster(world: World, monsterId: string): string | null {
  for (const zone of world.content.zones.values()) {
    if (zone.packs.some((pack): boolean => pack.members.some((member): boolean => member.monster === monsterId))) return zone.id;
  }
  return null;
}

export function botObjective(bot: Bot, quest: QuestDef, goal: ObjectiveDef): boolean {
  const world: World = bot.world;
  const objective: PathObjective | undefined = objectivePaths(goal).find((path: PathObjective): boolean => allHold(world, path.when));
  if (objective === undefined) return false;
  const done = (): boolean => currentObjective(world, quest)?.id !== goal.id;
  let finished: boolean;
  switch (objective.type) {
    case 'talk': {
      const zone: string | null = zoneOfNpc(world, objective.npc);
      finished = zone !== null && botTravelTo(bot, zone) && botTalk(bot, objective.npc) && done();
      break;
    }
    case 'reach':
      finished = botTravelTo(bot, objective.zone) && botWalkTo(bot, objective.zone, objective, Math.max(BOT.arrive, objective.radius * 0.5)) && done();
      break;
    case 'defeat': {
      const zone: string | null = zoneOfMonster(world, objective.monster);
      finished = zone !== null && botTravelTo(bot, zone) && botFight(bot, done, objective.monster);
      break;
    }
  }
  return finished;
}

export function botPlay(bot: Bot): BotReport {
  const world: World = bot.world;
  const limit: number = world.time + BOT.questLimit * world.content.quests.size;
  let stuck: string | null = null;
  while (stuck === null && world.time < limit) {
    const quest: QuestDef | undefined = [...world.content.quests.values()].find((candidate: QuestDef): boolean => questState(world, candidate.id) === 'active');
    if (quest === undefined) break;
    const objective: ObjectiveDef | null = currentObjective(world, quest);
    if (objective === null) break;
    if (!botObjective(bot, quest, objective)) stuck = `${quest.id}.${objective.id}`;
  }
  const completed: string[] = [...world.content.quests.values()].filter((quest: QuestDef): boolean => questState(world, quest.id) === 'done').map((quest: QuestDef): string => quest.id);
  return { completed, stuck, seconds: world.time, deaths: bot.deaths };
}
