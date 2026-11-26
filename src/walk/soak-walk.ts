import type { Condition } from '../../sim/content/condition-types.ts';
import type { Content, ZoneDef, ZoneExit } from '../../sim/content/types.ts';
import { open } from './body-walk.ts';
import type { WalkDeps, WalkStep } from './body-walk.ts';

export const SOAK_WALK = {
  start: 'hall_of_time',
  dwellMs: 3000,
  arriveWithinMs: 45_000,
  pollMs: 250,
} as const;

export interface SoakRoute {
  readonly steps: readonly WalkStep[];
  readonly zones: readonly string[];
  readonly problems: readonly string[];
}

export interface SoakLap {
  readonly ok: boolean;
  readonly visits: number;
  readonly problems: readonly string[];
}

function backExit(content: Content, from: string, to: string): ZoneExit | undefined {
  return content.zones.get(to)?.exits.find((exit: ZoneExit): boolean => exit.to === from);
}

export function soakRoute(content: Content, start: string = SOAK_WALK.start): SoakRoute {
  const first: ZoneDef | undefined = content.zones.get(start);
  if (first === undefined) return { steps: [], zones: [], problems: [`there is no zone ${start} to start the soak from`] };
  const seen: Set<string> = new Set<string>([start]);
  const steps: WalkStep[] = [];
  const visit = (zone: ZoneDef): void => {
    for (const exit of zone.exits) {
      const next: ZoneDef | undefined = content.zones.get(exit.to);
      const back: ZoneExit | undefined = backExit(content, zone.id, exit.to);
      if (next === undefined || back === undefined || seen.has(next.id)) continue;
      seen.add(next.id);
      steps.push({ from: zone.id, exit });
      visit(next);
      steps.push({ from: next.id, exit: back });
    }
  };
  visit(first);
  const unreached: string[] = [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.flash === null && !seen.has(zone.id)).map((zone: ZoneDef): string => zone.id);
  return { steps, zones: [...seen], problems: unreached.map((id: string): string => `the soak never reaches ${id}: no way there and back from ${start}`) };
}

export function pathTo(content: Content, from: string, to: string): readonly WalkStep[] | null {
  const came: Map<string, WalkStep> = new Map<string, WalkStep>();
  const queue: string[] = [from];
  const seen: Set<string> = new Set<string>([from]);
  for (let at: number = 0; at < queue.length; at += 1) {
    const here: string | undefined = queue[at];
    if (here === undefined || here === to) break;
    for (const exit of content.zones.get(here)?.exits ?? []) {
      if (seen.has(exit.to) || !content.zones.has(exit.to)) continue;
      seen.add(exit.to);
      came.set(exit.to, { from: here, exit });
      queue.push(exit.to);
    }
  }
  if (!seen.has(to)) return null;
  const path: WalkStep[] = [];
  for (let step: WalkStep | undefined = came.get(to); step !== undefined; step = came.get(step.from)) path.unshift(step);
  return path;
}

async function rest(deps: WalkDeps, ms: number): Promise<void> {
  if (ms <= 0) return;
  await deps.sleep(SOAK_WALK.pollMs);
  if (deps.world.player.alive) deps.world.player.life = deps.world.player.maxLife;
  await rest(deps, ms - SOAK_WALK.pollMs);
}

function travel(deps: WalkDeps, step: WalkStep): void {
  const live: ZoneExit = deps.world.zone.exits.find((exit: ZoneExit): boolean => exit.id === step.exit.id) ?? step.exit;
  deps.world.player.pos.x = live.x;
  deps.world.player.pos.z = live.z;
  deps.send({ type: 'travel', exit: step.exit.id });
}

async function arrive(deps: WalkDeps, step: WalkStep, waited: number = 0): Promise<boolean> {
  if (deps.world.zone.id === step.exit.to) return true;
  if (waited >= SOAK_WALK.arriveWithinMs) return false;
  if (deps.world.zone.id === step.from) travel(deps, step);
  await rest(deps, SOAK_WALK.pollMs);
  return arrive(deps, step, waited + SOAK_WALK.pollMs);
}

async function take(deps: WalkDeps, step: WalkStep): Promise<string | null> {
  const { world } = deps;
  if (world.zone.id !== step.from) return `the soak expected to be in ${step.from} but is in ${world.zone.id}`;
  const shut: Condition[] = step.exit.requires.filter((condition: Condition): boolean => !open(world, condition));
  if (shut.length > 0) return `exit ${step.exit.id} in ${step.from} stays shut: ${shut.map((condition: Condition): string => condition.type).join(', ')}`;
  world.player.life = world.player.maxLife;
  if (!(await arrive(deps, step))) return `travel through ${step.exit.id} never reached ${step.exit.to}`;
  await rest(deps, SOAK_WALK.dwellMs);
  return null;
}

interface Walked {
  readonly visits: number;
  readonly stopped: string | null;
}

async function takeAll(deps: WalkDeps, steps: readonly WalkStep[], visits: number): Promise<Walked> {
  const [step, ...later] = steps;
  if (step === undefined) return { visits, stopped: null };
  const stopped: string | null = await take(deps, step);
  if (stopped !== null) return { visits, stopped };
  return takeAll(deps, later, visits + 1);
}

export async function soakLap(deps: WalkDeps, start: string = SOAK_WALK.start): Promise<SoakLap> {
  const content: Content = deps.world.content;
  const route: SoakRoute = soakRoute(content, start);
  const lead: readonly WalkStep[] | null = pathTo(content, deps.world.zone.id, start);
  if (lead === null) return { ok: false, visits: 0, problems: [...route.problems, `no way from ${deps.world.zone.id} to ${start}`] };
  const walked: Walked = await takeAll(deps, [...lead, ...route.steps], 0);
  if (walked.stopped !== null) return { ok: false, visits: walked.visits, problems: [...route.problems, walked.stopped] };
  return { ok: route.problems.length === 0, visits: walked.visits, problems: route.problems };
}
