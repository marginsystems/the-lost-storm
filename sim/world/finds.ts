import type { ZoneVoid } from '../content/story-types.ts';
import { distance } from '../math.ts';
import type { Vec2 } from '../math.ts';
import { addToInventory } from './character.ts';
import { removeGround } from './ground.ts';
import type { GroundItem, PlayerState, World } from './types.ts';

export function pickUp(world: World, ground: GroundItem): void {
  const player: PlayerState = world.player;
  if (ground.content.kind === 'gold') {
    player.gold += ground.content.amount;
  } else if (!addToInventory(player, ground.content.item)) {
    world.events.push({ type: 'notice', reason: 'inventory_full' });
    return;
  }
  removeGround(world, ground.id);
  world.events.push({ type: 'pickup', ground });
  if (ground.content.kind === 'item') world.events.push({ type: 'character_changed' });
}

function nearestFind(world: World, at: Vec2, within: number): GroundItem | null {
  let best: GroundItem | null = null;
  let bestAway: number = within;
  for (const ground of world.ground) {
    if (ground.find === null) continue;
    const away: number = distance(ground.pos, at);
    if (away <= bestAway) {
      best = ground;
      bestAway = away;
    }
  }
  return best;
}

export function aimedFind(world: World, dest: Vec2): GroundItem | null {
  const rules: ZoneVoid | null = world.zone.void;
  return rules === null ? null : nearestFind(world, dest, rules.finds.aim);
}

export function walkOnFinds(world: World): void {
  const rules: ZoneVoid | null = world.zone.void;
  if (rules === null || !world.player.alive || world.wake !== null) return;
  const underfoot: GroundItem | null = nearestFind(world, world.player.pos, rules.finds.reach);
  if (underfoot !== null) pickUp(world, underfoot);
}
