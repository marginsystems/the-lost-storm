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

export function aimedItem(world: World, at: Vec2): GroundItem | null {
  let best: GroundItem | null = null;
  let bestAway: number = world.content.player.pickupAim;
  for (const ground of world.ground) {
    const away: number = distance(ground.pos, at);
    if (away <= bestAway) {
      best = ground;
      bestAway = away;
    }
  }
  return best;
}
