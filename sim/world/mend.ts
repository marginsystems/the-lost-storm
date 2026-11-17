import type { Actor, World } from './types.ts';

export function mendActor(world: World, actor: Actor, amount: number): void {
  if (!actor.alive || amount <= 0) return;
  const before: number = actor.life;
  actor.life = Math.min(actor.maxLife, actor.life + amount);
  const gained: number = actor.life - before;
  if (gained > 0) world.events.push({ type: 'mend', actorId: actor.id, amount: gained });
}

function leechRate(world: World, actor: Actor): number {
  return actor.maxLife * world.content.world.recovery.leechCap;
}

function leechTaken(world: World, actor: Actor): number {
  return Math.max(0, actor.leech.taken - (world.time - actor.leech.at) * leechRate(world, actor));
}

export function leechRoom(world: World, actor: Actor): number {
  return Math.max(0, leechRate(world, actor) - leechTaken(world, actor));
}

export function leechActor(world: World, actor: Actor, amount: number): number {
  if (!actor.alive || amount <= 0) return 0;
  const taken: number = leechTaken(world, actor);
  const allowed: number = Math.min(amount, leechRoom(world, actor), actor.maxLife - actor.life);
  actor.leech.at = world.time;
  actor.leech.taken = taken + allowed;
  mendActor(world, actor, allowed);
  return allowed;
}
