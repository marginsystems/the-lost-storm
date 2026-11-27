import { placeLearned, readBar } from '../skill-book.ts';
import type { PlayerState, World } from './types.ts';

export function learn(world: World, skill: string): void {
  const player: PlayerState = world.player;
  if (player.learned.includes(skill)) return;
  player.learned.push(skill);
  player.bar = placeLearned(world.content, player.bar, skill);
  const slot: number = player.bar.indexOf(skill);
  world.events.push({ type: 'skill_unlocked', skill, slot: slot < 0 ? null : slot });
}

export function forget(world: World, skill: string): void {
  const player: PlayerState = world.player;
  player.learned = player.learned.filter((known: string): boolean => known !== skill);
  const before = player.bar;
  player.bar = readBar(world.content, before, player.learned);
  for (const previous of before.slice(player.bar.length)) {
    if (previous !== null && player.learned.includes(previous)) player.bar = placeLearned(world.content, player.bar, previous);
  }
}
