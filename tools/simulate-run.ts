import type { Bot } from '../sim/bot.ts';
import { BOT, botFight, botPause, botPlay, botStep, botTravelTo, botWalkTo, createBot } from '../sim/bot.ts';
import { loadContent } from '../sim/content/content.ts';
import type { BookDef, PageDef } from '../sim/content/story-types.ts';
import type { Content, ZoneExit } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { distance } from '../sim/math.ts';
import type { Measurement, Meter } from '../sim/measure.ts';
import { createMeter, readMeter, sessionHeader } from '../sim/measure.ts';
import { isWalkable, lineWalkable, nearestWalkable } from '../sim/nav/grid.ts';
import { allHold } from '../sim/world/conditions.ts';
import { createWorld } from '../sim/world/create.ts';
import { fightZones, forceStrike, nearestFight } from '../sim/world/moments.ts';
import { readablePages } from '../sim/world/story.ts';
import type { GroundItem, ItemInstance, MomentState, World, WorldEvent } from '../sim/world/types.ts';
import type { BuildPolicy, Policies, SkillPolicy } from './simulate-policies.ts';
import { planFor } from './simulate-policies.ts';

export const RUN = {
  wakeLimit: 30,
  openingLimit: 400,
  stride: 6,
  pickupWait: 4,
  lootReach: 14,
  strikeGap: [9, 7, 11, 5],
  strikeAngles: 12,
  markWait: 6,
  fightWait: 120,
  levelMinutes: 120,
} as const;

export type Scenario = { readonly kind: 'slice' } | { readonly kind: 'farm'; readonly minutes: number } | { readonly kind: 'fight'; readonly moment: string; readonly repeats: number } | { readonly kind: 'level'; readonly level: number; readonly minutes: number };

export interface Job {
  readonly scenario: Scenario;
  readonly skill: string;
  readonly build: string;
  readonly seed: number;
}

export interface Recorder {
  meter: Meter | null;
  readonly out: Measurement[];
}

export const CONTENT: Content = loadContent();

export function scenarioName(scenario: Scenario): string {
  switch (scenario.kind) {
    case 'slice':
      return 'slice';
    case 'farm':
      return `farm ${scenario.minutes}m`;
    case 'fight':
      return `fight ${scenario.moment}`;
    case 'level':
      return `level ${scenario.level}`;
  }
  return 'unknown';
}

function record(bot: Bot, recorder: Recorder, events: readonly WorldEvent[]): void {
  if (recorder.meter === null) return;
  recorder.out.push(...readMeter(bot.world, recorder.meter, events));
}

function startRecording(world: World, recorder: Recorder, policies: Policies): void {
  recorder.meter = createMeter(world, policies.milestones);
  recorder.out.push(...readMeter(world, recorder.meter, [], true));
}

function carriedBooks(world: World): BookDef[] {
  return world.player.inventory.flatMap((item: ItemInstance | null): BookDef[] => {
    const book: string | null = item === null ? null : (world.content.itemBases.get(item.base)?.book ?? null);
    const def: BookDef | undefined = book === null ? undefined : world.content.books.get(book);
    return def === undefined ? [] : [def];
  });
}

function unreadPage(world: World): { readonly book: string; readonly page: string } | null {
  for (const book of carriedBooks(world)) {
    const page: PageDef | undefined = readablePages(world, book).find((entry: PageDef): boolean => Object.keys(entry.sets).some((key: string): boolean => world.flags[key] !== entry.sets[key]));
    if (page !== undefined) return { book: book.id, page: page.id };
  }
  return null;
}

function openExit(world: World): ZoneExit | null {
  return world.zone.exits.find((exit: ZoneExit): boolean => allHold(world, exit.requires)) ?? null;
}

function ahead(world: World): Vec2 {
  return { x: world.player.pos.x + world.heading.x * RUN.stride, z: world.player.pos.z + world.heading.z * RUN.stride };
}

export function playOpening(bot: Bot, policy: SkillPolicy): boolean {
  const world: World = bot.world;
  const start: string = world.zone.id;
  for (let waited: number = 0; world.wake !== null && waited < RUN.wakeLimit; waited += BOT.step) botStep(bot, []);
  const limit: number = world.time + RUN.openingLimit;
  let sinceOrder: number = BOT.idleRepeat;
  while (world.zone.id === start && world.time < limit) {
    sinceOrder += BOT.step;
    const find: GroundItem | undefined = world.ground.find((ground: GroundItem): boolean => ground.find !== null);
    const page = unreadPage(world);
    const exit: ZoneExit | null = openExit(world);
    if (page !== null) {
      botPause(bot, policy.readSeconds);
      botStep(bot, [{ type: 'read', book: page.book, page: page.page }]);
    } else if (sinceOrder < BOT.idleRepeat) {
      botStep(bot, []);
    } else {
      sinceOrder = 0;
      botStep(bot, [find !== undefined ? { type: 'pickup', groundId: find.id } : { type: 'move', held: true, dest: exit === null ? ahead(world) : { x: exit.x, z: exit.z } }]);
    }
  }
  return world.zone.id !== start;
}

function lootAround(bot: Bot, at: Vec2): void {
  const world: World = bot.world;
  const zone: string = world.zone.id;
  botWalkTo(bot, zone, at, 1);
  const wanted: GroundItem[] = world.ground.filter((ground: GroundItem): boolean => ground.content.kind === 'item' && ground.find === null && !bot.discarded.has(ground.content.item.uid) && distance(ground.pos, at) <= RUN.lootReach);
  for (const ground of wanted) {
    if (!world.player.inventory.includes(null)) return;
    for (let waited: number = 0; waited < RUN.pickupWait && world.ground.includes(ground) && world.player.alive && world.zone.id === zone; waited += BOT.step) {
      botStep(bot, world.player.intent.type === 'pickup' ? [] : [{ type: 'pickup', groundId: ground.id }]);
    }
  }
}

function fightMoment(bot: Bot, moment: MomentState, until: number, loot: boolean): void {
  const world: World = bot.world;
  const zone: string = world.zone.id;
  const before: number = world.time;
  if (moment.phase === 'dormant' && botWalkTo(bot, zone, moment.pos, Math.max(BOT.arrive, moment.def.radius * 0.4)) && world.time === before) botStep(bot, []);
  const limit: number = Math.min(until, world.time + RUN.fightWait);
  while (moment.phase === 'awake' && world.time < limit && world.zone.id === zone) botFight(bot, (): boolean => moment.phase !== 'awake' || world.time >= limit, null);
  if (loot && moment.outcome === 'resolved' && world.zone.id === zone && world.player.alive) lootAround(bot, moment.pos);
}

function home(world: World): string | null {
  return fightZones(world.content)[0] ?? null;
}

export function farm(bot: Bot, until: number, loot: boolean, stop: () => boolean): boolean {
  const world: World = bot.world;
  const zone: string | null = home(world);
  if (zone === null) return false;
  while (world.time < until && !stop()) {
    if (world.zone.id !== zone && !botTravelTo(bot, zone)) return false;
    const moment: MomentState | null = nearestFight(world);
    if (moment === null || moment.phase === 'mark' || moment.phase === 'fading') botFight(bot, (): boolean => false, null);
    else fightMoment(bot, moment, until, loot);
  }
  return true;
}

function strikeSpot(world: World): Vec2 | null {
  const from: Vec2 = world.player.pos;
  for (const gap of RUN.strikeGap) {
    for (let step: number = 0; step < RUN.strikeAngles; step += 1) {
      const angle: number = (step / RUN.strikeAngles) * Math.PI * 2;
      const spot: Vec2 = { x: from.x + Math.cos(angle) * gap, z: from.z + Math.sin(angle) * gap };
      if (isWalkable(world.grid, spot.x, spot.z) && lineWalkable(world.grid, from, spot)) return nearestWalkable(world.grid, spot, 1);
    }
  }
  return null;
}

export function fightRepeatedly(bot: Bot, momentId: string, repeats: number, loot: boolean): number {
  const world: World = bot.world;
  const zone: string | null = home(world);
  let fought: number = 0;
  for (let round: number = 0; round < repeats; round += 1) {
    if (zone === null || (world.zone.id !== zone && !botTravelTo(bot, zone))) return fought;
    const spot: Vec2 | null = strikeSpot(world);
    const moment: MomentState | null = spot === null ? null : forceStrike(world, spot, momentId);
    if (moment === null) return fought;
    for (let waited: number = 0; moment.phase === 'mark' && waited < RUN.markWait; waited += BOT.step) botStep(bot, []);
    fightMoment(bot, moment, world.time + RUN.fightWait, loot);
    if (moment.outcome === 'resolved' || moment.outcome === 'expired') fought += 1;
  }
  return fought;
}

export function runJob(job: Job, policies: Policies): Measurement[] {
  const skill: SkillPolicy | undefined = policies.skills.get(job.skill);
  const build: BuildPolicy | undefined = policies.builds.get(job.build);
  if (skill === undefined || build === undefined) throw new Error(`no policy ${job.skill}/${job.build}`);
  const world: World = createWorld(CONTENT, { seed: job.seed, save: null, opening: true });
  const recorder: Recorder = { meter: null, out: [sessionHeader('sim', scenarioName(job.scenario), `${job.skill}/${job.build}`, job.seed)] };
  const bot: Bot = createBot(world, skill.habits, (events: readonly WorldEvent[]): void => record(bot, recorder, events), planFor(skill, build));
  const scenario: Scenario = job.scenario;
  const fromStart: boolean = scenario.kind === 'slice' || scenario.kind === 'level';
  if (fromStart) startRecording(world, recorder, policies);
  const opened: boolean = playOpening(bot, skill);
  const played = opened ? botPlay(bot) : null;
  let reason: string = !opened ? 'stuck in the opening' : played !== null && played.stuck !== null ? `stuck at ${played.stuck}` : 'done';
  if (!fromStart) startRecording(world, recorder, policies);
  const meter: Meter | null = recorder.meter;
  switch (scenario.kind) {
    case 'slice':
      break;
    case 'farm':
      if (opened && !farm(bot, world.time + scenario.minutes * 60, skill.loot, (): boolean => false)) reason = 'could not reach the Hall';
      break;
    case 'fight':
      if (opened) reason = fightRepeatedly(bot, scenario.moment, scenario.repeats, skill.loot) < scenario.repeats ? 'the moment did not wake into a fight' : reason;
      break;
    case 'level':
      if (opened && !farm(bot, (meter?.origin ?? 0) + scenario.minutes * 60, skill.loot, (): boolean => world.player.level >= scenario.level)) reason = 'could not reach the Hall';
      break;
  }
  recorder.out.push({ kind: 'end', t: Math.round((world.time - (meter?.origin ?? 0)) * 100) / 100, reason });
  return recorder.out;
}
