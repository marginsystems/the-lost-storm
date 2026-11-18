import type { Content } from '../content/types.ts';
import type { Bot } from '../bot.ts';
import { botFight, CAREFUL, createBot } from '../bot.ts';
import type { BotPlan } from '../bot-plan.ts';
import { STAND_WEIGHTS } from '../bot-plan.ts';
import type { Vec2 } from '../math.ts';
import type { Command, Intent, World, WorldEvent } from '../world/types.ts';
import { actionOf } from './act.ts';
import type { Arena, ArenaOptions, ArenaOutcome } from './arena.ts';
import { afterTick, arenaObservation, arenaRunning, createArena } from './arena.ts';
import type { Action } from './contract.ts';
import { RL } from './contract.ts';
import type { Observation } from './observe.ts';
import { REWARD } from './reward.ts';

export const DEMO = {
  flaskAt: 0.5,
  manaFlaskAt: 0.2,
} as const;

export interface Demonstration {
  readonly obs: Float32Array;
  readonly mask: Uint8Array;
  readonly action: Action;
}

export interface DemoEpisode {
  readonly samples: readonly Demonstration[];
  readonly outcome: ArenaOutcome;
  readonly total: number;
  readonly waves: number;
}

export function arenaPlan(world: World): BotPlan {
  return {
    name: 'arena',
    flaskAt: DEMO.flaskAt,
    manaFlaskAt: DEMO.manaFlaskAt,
    rolls: true,
    loot: false,
    lineSeconds: 0,
    readSeconds: 0,
    paths: [],
    skills: world.player.bar.filter((skill: string | null): skill is string => skill !== null),
    route: [],
    weights: STAND_WEIGHTS,
    focus: null,
    style: 'stand',
    keepGap: 0,
    weapons: 'any',
    avoid: [],
  };
}

function oneTick(bot: Bot): void {
  let ticked: boolean = false;
  botFight(bot, (): boolean => {
    if (ticked) return true;
    ticked = true;
    return false;
  }, null);
}

export function demonstrate(content: Content, options: ArenaOptions): DemoEpisode {
  const arena: Arena = createArena(content, options);
  const world: World = arena.world;
  const heard: Command[] = [];
  let listening: boolean = false;
  const bot: Bot = createBot(world, CAREFUL, (events: readonly WorldEvent[]): void => void afterTick(arena, events), arenaPlan(world));
  bot.orders = (commands: readonly Command[]): void => {
    if (listening) heard.push(...commands);
  };
  const samples: Demonstration[] = [];
  while (arenaRunning(arena)) {
    const seen: Observation = arenaObservation(arena);
    const from: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
    const before: Intent = world.player.intent;
    heard.length = 0;
    arena.total -= REWARD.step;
    for (let tick: number = 0; tick < RL.ticksPerDecision && arenaRunning(arena); tick += 1) {
      listening = tick === 0;
      oneTick(bot);
    }
    listening = false;
    samples.push({ obs: seen.obs, mask: seen.mask, action: actionOf(world, heard, seen.view, from, before) });
    arena.decisions += 1;
  }
  return { samples, outcome: arena.outcome, total: arena.total, waves: arena.tally.waves };
}
