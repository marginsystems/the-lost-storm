import type { Object3D } from 'three';
import type { Condition } from '../../sim/content/condition-types.ts';
import type { Content, ZoneDef, ZoneExit } from '../../sim/content/types.ts';
import { BOSS_DEFEATED } from '../../sim/world/boss.ts';
import { holds } from '../../sim/world/conditions.ts';
import type { Command, MonsterState, World } from '../../sim/world/types.ts';
import { drawable } from '../render/actor-guard.ts';

export const BODY_WALK = {
  route: [
    { from: 'between', exit: 'into_the_hall' },
    { from: 'hall_of_time', exit: 'east' },
    { from: 'hideout', exit: 'west' },
    { from: 'hall_of_time', exit: 'gate' },
    { from: 'keepers_gate', exit: 'under' },
  ],
  arriveWithinMs: 30000,
  looks: [2500, 9000],
  pollMs: 250,
  near: 0.8,
  flagValue: 'yes',
} as const;

export interface WalkStep {
  readonly from: string;
  readonly exit: ZoneExit;
}

export interface BodyLook {
  readonly zone: string;
  readonly afterMs: number;
  readonly live: number;
  readonly missing: readonly string[];
}

export interface WalkReport {
  readonly ok: boolean;
  readonly looks: readonly BodyLook[];
  readonly problems: readonly string[];
}

export interface WalkDeps {
  readonly world: World;
  readonly scene: Object3D;
  readonly send: (command: Command) => void;
  readonly sleep: (ms: number) => Promise<void>;
}

export function walkRoute(content: Content): { readonly steps: readonly WalkStep[]; readonly problems: readonly string[] } {
  const steps: WalkStep[] = [];
  const problems: string[] = [];
  for (const { from, exit } of BODY_WALK.route) {
    const zone: ZoneDef | undefined = content.zones.get(from);
    const found: ZoneExit | undefined = zone?.exits.find((candidate: ZoneExit): boolean => candidate.id === exit);
    if (found === undefined) problems.push(`zone ${from} has no exit ${exit}`);
    else steps.push({ from, exit: found });
  }
  steps.forEach((step: WalkStep, index: number): void => {
    const next: WalkStep | undefined = steps[index + 1];
    if (next !== undefined && step.exit.to !== next.from) problems.push(`exit ${step.exit.id} leads to ${step.exit.to}, but the walk goes on from ${next.from}`);
  });
  return { steps, problems };
}

export function open(world: World, condition: Condition): boolean {
  if (holds(world, condition)) return true;
  switch (condition.type) {
    case 'flag':
      if (!condition.not) world.flags[condition.flag] = condition.is ?? BODY_WALK.flagValue;
      break;
    case 'level':
      if (!condition.not) world.player.level = Math.max(world.player.level, condition.atLeast);
      break;
    case 'defeated': {
      const flag: string | undefined = world.content.monsters.get(condition.monster)?.boss?.firstKill?.flag;
      if (!condition.not && flag !== undefined) world.flags[flag] = BOSS_DEFEATED;
      break;
    }
    case 'quest':
    case 'objective':
    case 'shore':
    case 'hero':
    case 'visited':
    case 'restraint':
      break;
  }
  return holds(world, condition);
}

export function missingBodies(monsters: readonly MonsterState[], roots: readonly Object3D[]): string[] {
  const shown: Object3D[] = roots.filter((root: Object3D): boolean => drawable(root));
  return monsters
    .filter((monster: MonsterState): boolean => monster.alive && !shown.some((root: Object3D): boolean => Math.hypot(root.position.x - monster.pos.x, root.position.z - monster.pos.z) < BODY_WALK.near))
    .map((monster: MonsterState): string => `${monster.def.id}#${monster.id}`);
}

function look(world: World, scene: Object3D, afterMs: number): BodyLook {
  return { zone: world.zone.id, afterMs, live: world.monsters.filter((monster: MonsterState): boolean => monster.alive).length, missing: missingBodies(world.monsters, scene.children) };
}

async function rest(deps: WalkDeps, ms: number): Promise<void> {
  if (ms <= 0) return;
  await deps.sleep(Math.min(BODY_WALK.pollMs, ms));
  if (deps.world.player.alive) deps.world.player.life = deps.world.player.maxLife;
  await rest(deps, ms - BODY_WALK.pollMs);
}

async function looksIn(deps: WalkDeps, into: BodyLook[], from: number = 0, waited: number = 0): Promise<void> {
  const at: number | undefined = BODY_WALK.looks[from];
  if (at === undefined) return;
  await rest(deps, at - waited);
  into.push(look(deps.world, deps.scene, at));
  await looksIn(deps, into, from + 1, at);
}

async function arrive(deps: WalkDeps, zone: string, waited: number = 0): Promise<boolean> {
  if (deps.world.zone.id === zone) return true;
  if (waited >= BODY_WALK.arriveWithinMs) return false;
  await rest(deps, BODY_WALK.pollMs);
  return arrive(deps, zone, waited + BODY_WALK.pollMs);
}

async function walkFrom(deps: WalkDeps, steps: readonly WalkStep[], looks: BodyLook[]): Promise<string | null> {
  const [step, ...later] = steps;
  if (step === undefined) return null;
  const { world } = deps;
  if (world.zone.id !== step.from) return `the walk expected to be in ${step.from} but is in ${world.zone.id}`;
  const shut: Condition[] = step.exit.requires.filter((condition: Condition): boolean => !open(world, condition));
  if (shut.length > 0) return `exit ${step.exit.id} in ${step.from} stays shut: ${shut.map((condition: Condition): string => condition.type).join(', ')}`;
  world.player.life = world.player.maxLife;
  world.player.pos.x = step.exit.x;
  world.player.pos.z = step.exit.z;
  deps.send({ type: 'travel', exit: step.exit.id });
  if (!(await arrive(deps, step.exit.to))) return `travel through ${step.exit.id} never reached ${step.exit.to}`;
  await looksIn(deps, looks);
  return walkFrom(deps, later, looks);
}

export async function walkBodies(deps: WalkDeps): Promise<WalkReport> {
  const route = walkRoute(deps.world.content);
  const looks: BodyLook[] = [];
  await looksIn(deps, looks);
  const stopped: string | null = await walkFrom(deps, route.steps, looks);
  const blind: string[] = looks.filter((entry: BodyLook): boolean => entry.missing.length > 0).map((entry: BodyLook): string => `${entry.zone} after ${entry.afterMs} ms: ${entry.missing.length} of ${entry.live} live monsters have no body (${entry.missing.join(', ')})`);
  const problems: string[] = [...route.problems, ...(stopped === null ? [] : [stopped]), ...blind];
  return { ok: problems.length === 0, looks, problems };
}
