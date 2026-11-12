import { learnable, placeLearned } from '../skill-book.ts';
import { refreshPlayer } from './character.ts';
import { allHold } from './conditions.ts';
import type { PlayerState, World } from './types.ts';

export function learnSkills(world: World): void {
  const player: PlayerState = world.player;
  const fresh: string[] = learnable(world.content, player.learned, player.level, (when): boolean => allHold(world, when));
  if (fresh.length === 0) return;
  for (const skill of fresh) {
    player.learned.push(skill);
    player.bar = placeLearned(world.content, player.bar, skill);
    const slot: number = player.bar.indexOf(skill);
    world.events.push({ type: 'skill_unlocked', skill, slot: slot < 0 ? null : slot });
  }
  refreshPlayer(world);
}
