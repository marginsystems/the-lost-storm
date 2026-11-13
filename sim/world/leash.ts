import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import type { Actor, MomentFigure, MomentState, MonsterState, World } from './types.ts';

export const LEASH = {
  wait: 3,
  shellGap: 0.4,
  homeReach: 0.6,
  crowdReach: 3,
  rest: 1e-6,
} as const;

function echoOf(moment: MomentState, monster: MonsterState): boolean {
  return moment.figures.some((figure: MomentFigure): boolean => figure.monsterId === monster.id);
}

function outside(moment: MomentState, monster: MonsterState): boolean {
  return moment.phase === 'awake' && !echoOf(moment, monster);
}

export function shutOut(world: World, monster: MonsterState, at: Vec2): MomentState | null {
  return world.moments.find((moment: MomentState): boolean => outside(moment, monster) && distance(at, moment.pos) < moment.def.radius) ?? null;
}

function away(from: Vec2, to: Vec2): Vec2 {
  const dx: number = from.x - to.x;
  const dz: number = from.z - to.z;
  const reach: number = Math.hypot(dx, dz);
  return reach < LEASH.rest ? { x: 1, z: 0 } : { x: dx / reach, z: dz / reach };
}

export function shellPoint(moment: MomentState, monster: MonsterState): Vec2 {
  const out: Vec2 = away(monster.pos, moment.pos);
  const reach: number = moment.def.radius + monster.radius + LEASH.shellGap;
  return { x: moment.pos.x + out.x * reach, z: moment.pos.z + out.z * reach };
}

export function keepOut(world: World): void {
  for (const monster of world.monsters) {
    if (!monster.alive) continue;
    for (const moment of world.moments) {
      if (!outside(moment, monster)) continue;
      const shell: number = moment.def.radius + monster.radius;
      if (distance(monster.pos, moment.pos) >= shell) continue;
      const out: Vec2 = away(monster.pos, moment.pos);
      monster.pos.x = moment.pos.x + out.x * shell;
      monster.pos.z = moment.pos.z + out.z * shell;
      const inward: number = -(monster.knock.x * out.x + monster.knock.z * out.z);
      if (inward <= 0) continue;
      monster.knock.x += out.x * inward;
      monster.knock.z += out.z * inward;
    }
  }
}

function settledBody(actor: Actor): boolean {
  return actor.kind === 'player' ? actor.life > 0 : actor.alive && !actor.returning;
}

export function homeReached(world: World, monster: MonsterState): boolean {
  const gap: number = distance(monster.pos, monster.home);
  if (gap <= LEASH.homeReach) return true;
  if (gap > LEASH.crowdReach) return false;
  return [world.player, ...world.monsters].some((body: Actor): boolean => body !== monster && settledBody(body) && distance(body.pos, monster.home) < gap && distance(body.pos, monster.pos) <= body.radius + monster.radius + LEASH.homeReach);
}
