import { grantPoints, learnSkills } from './learning.ts';
import { stepBosses } from './boss.ts';
import { stepDeath } from './death.ts';
import { stepAreas, timeScaleOf } from './areas.ts';
import { stepBurns } from './burn.ts';
import { stepHeat } from './heat.ts';
import { stepHazards } from './hazards.ts';
import { removeCorpses, stepMonster, stepSurge } from './monsters.ts';
import { stepPackReturns } from './pack-return.ts';
import { stepWaitingPacks } from './packs.ts';
import { stepExploration } from './exploration.ts';
import { stepFlasks } from './flasks.ts';
import { stepGlitch } from './glitch.ts';
import { recordPath } from './path-log.ts';
import { separateActors, settleGaits, strideOf } from './movement.ts';
import { handleCommand, stepPlayer } from './player.ts';
import { stepQuests } from './quests.ts';
import { flashHolds, stepFlash } from './flash.ts';
import { stepVoices } from './voices.ts';
import { stepEchoes, stepProjectiles } from './skills.ts';
import { stepTrade } from './trade.ts';
import type { ActorState, Command, MomentState, PlayerState, World, WorldEvent } from './types.ts';
import type { Vec2 } from '../math.ts';
import { bindEchoes, heldIn, holdHero } from './bubble.ts';
import { keepOut } from './leash.ts';
import { keepOutOfWards, stepWards } from './wards.ts';
import { holdBehindWalls } from './walls.ts';
import { stepVoid } from './void.ts';
import { stepMoments } from './moments.ts';
import type { LootFilter } from '../loot-filter.ts';
import { stepPorter } from './porter.ts';
import type { PorterSteering } from './porter.ts';
import { stepNpcs } from './npc-walk.ts';
import { stepScene } from './scene.ts';
import { easeLeaving } from './dialogue.ts';
import { stepDrifts, stepTriggers } from './terrain.ts';
import { acceptsCommand, hurryWake } from './wake.ts';
import { stepPowerState } from '../powers.ts';
import { stepStances } from '../stances.ts';
import { refreshHero } from './character.ts';
import { heroFor, isPrimary } from './heroes.ts';
import { stepTally } from '../tally.ts';
import { stepTailwind } from './tailwind.ts';
import { announceArming } from './arming.ts';
import { endChannels, stepChannelTrails } from './channels.ts';

export const MAX_STEP: number = 1 / 30;

interface StepContext {
  readonly now: number;
  readonly loot: LootFilter;
  readonly steerPorter?: PorterSteering;
}

export function stepWorld(world: World, commands: readonly Command[], dt: number, context?: StepContext): WorldEvent[] {
  world.now = Math.max(context?.now ?? 0, world.now + dt * 1000);
  if (context !== undefined) world.lootFilter = context.loot;
  world.events = [];
  announceArming(world);
  world.time += dt;
  stepDrifts(world);
  for (const command of commands) {
    const hero: PlayerState | null = heroFor(world, command);
    if (hero === null) continue;
    if (flashHolds(world, command)) continue;
    if (acceptsCommand(world, command)) handleCommand(world, hero, command);
    else if (isPrimary(world, hero)) hurryWake(world, command);
  }
  const start: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const bubble: MomentState | null = heldIn(world, start);
  const starts: Map<ActorState, Vec2> = new Map<ActorState, Vec2>();
  const strides: Map<ActorState, Vec2> = new Map<ActorState, Vec2>();
  for (const hero of world.heroes) {
    const from: Vec2 = { x: hero.pos.x, z: hero.pos.z };
    starts.set(hero, from);
    stepPlayer(world, hero, dt);
    strides.set(hero, strideOf(hero, from));
    stepFlasks(world, hero, dt);
    const faded: boolean = stepPowerState(hero.powers, dt);
    if (stepStances(world.content, hero) || faded) refreshHero(world, hero);
  }
  stepVoid(world, dt);
  stepExploration(world);
  for (const monster of world.monsters) {
    const from: Vec2 = { x: monster.pos.x, z: monster.pos.z };
    starts.set(monster, from);
    stepMonster(world, monster, dt * timeScaleOf(world, monster));
    strides.set(monster, strideOf(monster, from));
  }
  separateActors(world, dt, strides);
  stepProjectiles(world, dt);
  stepHazards(world, dt);
  stepEchoes(world, dt);
  stepAreas(world, dt);
  stepHeat(world);
  stepBurns(world, dt);
  bindEchoes(world, dt, starts);
  keepOut(world);
  keepOutOfWards(world);
  holdBehindWalls(world, starts);
  holdHero(world, start, bubble);
  settleGaits(starts, dt);
  stepDeath(world, dt);
  for (const ground of world.ground) ground.age += dt;
  removeCorpses(world);
  stepTailwind(world, dt);
  stepSurge(world, dt);
  stepPackReturns(world, dt);
  stepWaitingPacks(world);
  stepScene(world, dt);
  easeLeaving(world, dt);
  stepWards(world, dt);
  stepMoments(world, dt);
  stepPorter(world, context?.steerPorter);
  stepNpcs(world, dt);
  stepBosses(world);
  stepVoices(world);
  stepTriggers(world);
  stepQuests(world);
  stepFlash(world, dt);
  learnSkills(world);
  grantPoints(world);
  stepTrade(world);
  stepGlitch(world, dt);
  recordPath(world, dt);
  stepTally(world, dt);
  stepChannelTrails(world);
  endChannels(world);
  return world.events;
}
