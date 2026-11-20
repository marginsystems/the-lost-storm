import { ITEM_SLOTS } from '../content/types.ts';
import { refillHero } from '../world/bench-hero.ts';
import { allocateNode, refreshPlayer } from '../world/character.ts';
import { stepWorld } from '../world/step.ts';
import type { PlayerState, World } from '../world/types.ts';
import type { Build } from './build.ts';
import { BUILD, buildBar } from './build.ts';
import { RL } from './contract.ts';
import type { DuelKit, KitPiece } from './kit.ts';

export function readyBuild(world: World, build: Build, kit: DuelKit, seed: number): void {
  stepWorld(world, [{ type: 'bench', hero: { seed, level: BUILD.level, weapon: null, bar: buildBar(world.content, build) } }], RL.tick);
  const player: PlayerState = world.player;
  for (const id of build.route) allocateNode(world, id);
  for (const slot of ITEM_SLOTS) player.equipped[slot] = null;
  const pieces: readonly KitPiece[] = [{ slot: 'weapon', base: build.weapon }, ...kit.armour];
  for (const piece of pieces) {
    player.equipped[piece.slot] = { uid: world.nextItemUid, base: piece.base, rarity: kit.rarity, level: BUILD.level, affixes: [], ledger: null };
    world.nextItemUid += 1;
  }
  if (build.hero !== null) player.hero = build.hero;
  player.skillPoints = 0;
  refreshPlayer(world);
  refillHero(world);
}
