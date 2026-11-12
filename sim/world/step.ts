import { grantPoints, learnSkills } from './learning.ts';
import { stepBosses } from './boss.ts';
import { stepDeath } from './death.ts';
import { stepAreas, timeScaleOf } from './areas.ts';
import { stepHazards } from './hazards.ts';
import { removeCorpses, stepMonster, stepSurge } from './monsters.ts';
import { stepExploration } from './exploration.ts';
import { stepFlasks } from './flasks.ts';
import { heldCommands, stepGlitch } from './glitch.ts';
import { recordPath } from './path-log.ts';
import { separateActors } from './movement.ts';
import { handleCommand, stepPlayer } from './player.ts';
import { stepQuests } from './quests.ts';
import { stepVoices } from './voices.ts';
import { stepEchoes, stepProjectiles } from './skills.ts';
import { stepTrade } from './trade.ts';
import type { Command, MomentState, World, WorldEvent } from './types.ts';
import type { Vec2 } from '../math.ts';
import { bindEchoes, heldIn, holdHero } from './bubble.ts';
import { stepVoid } from './void.ts';
import { stepMoments } from './moments.ts';
import { stepDrifts, stepTriggers } from './terrain.ts';
import { acceptsCommand, hurryWake } from './wake.ts';

export const MAX_STEP: number = 1 / 30;

export function stepWorld(world: World, commands: readonly Command[], dt: number): WorldEvent[] {
  world.events = [];
  world.time += dt;
  stepDrifts(world);
  for (const command of heldCommands(world, commands)) {
    if (acceptsCommand(world, command)) handleCommand(world, command);
    else hurryWake(world, command);
  }
  const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const bubble: MomentState | null = heldIn(world, start);
  stepPlayer(world, dt);
  stepFlasks(world, dt);
  stepVoid(world, dt);
  stepExploration(world);
  for (const monster of world.monsters) stepMonster(world, monster, dt * timeScaleOf(world, monster));
  separateActors(world);
  stepProjectiles(world, dt);
  stepHazards(world, dt);
  stepEchoes(world, dt);
  stepAreas(world, dt);
  bindEchoes(world);
  holdHero(world, start, bubble);
  stepDeath(world, dt);
  for (const ground of world.ground) ground.age += dt;
  removeCorpses(world);
  stepSurge(world, dt);
  stepMoments(world, dt);
  stepBosses(world);
  stepVoices(world);
  stepTriggers(world);
  stepQuests(world);
  learnSkills(world);
  grantPoints(world);
  stepTrade(world);
  stepGlitch(world, dt);
  recordPath(world, dt);
  return world.events;
}
