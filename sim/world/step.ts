import { stepBosses } from './boss.ts';
import { stepDeath } from './death.ts';
import { stepHazards } from './hazards.ts';
import { removeCorpses, stepMonster, stepSurge } from './monsters.ts';
import { stepExploration } from './exploration.ts';
import { stepFlasks } from './flasks.ts';
import { separateActors } from './movement.ts';
import { handleCommand, stepPlayer } from './player.ts';
import { stepQuests } from './quests.ts';
import { stepVoices } from './voices.ts';
import { stepProjectiles } from './skills.ts';
import { stepTrade } from './trade.ts';
import type { Command, World, WorldEvent } from './types.ts';

export const MAX_STEP: number = 1 / 30;

export function stepWorld(world: World, commands: readonly Command[], dt: number): WorldEvent[] {
  world.events = [];
  world.time += dt;
  for (const command of commands) handleCommand(world, command);
  stepPlayer(world, dt);
  stepFlasks(world, dt);
  stepExploration(world);
  for (const monster of world.monsters) stepMonster(world, monster, dt);
  separateActors(world);
  stepProjectiles(world, dt);
  stepHazards(world, dt);
  stepDeath(world, dt);
  for (const ground of world.ground) ground.age += dt;
  removeCorpses(world);
  stepSurge(world, dt);
  stepBosses(world);
  stepVoices(world);
  stepQuests(world);
  stepTrade(world);
  return world.events;
}
