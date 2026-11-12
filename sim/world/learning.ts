import type { Condition } from '../content/condition-types.ts';
import { learnable, openOffer, placeLearned } from '../skill-book.ts';
import type { OpenOffer } from '../skill-book.ts';
import { refreshPlayer } from './character.ts';
import { allHold } from './conditions.ts';
import type { PlayerState, World } from './types.ts';

function learn(world: World, skill: string, chosen: boolean): void {
  const player: PlayerState = world.player;
  player.learned.push(skill);
  player.bar = placeLearned(world.content, player.bar, skill);
  const slot: number = player.bar.indexOf(skill);
  world.events.push({ type: 'skill_unlocked', skill, slot: slot < 0 ? null : slot, chosen });
}

export function pendingOffer(world: World): OpenOffer | null {
  const player: PlayerState = world.player;
  return openOffer(world.content, player.learned, player.offersTaken, player.level, (when: readonly Condition[]): boolean => allHold(world, when));
}

export function learnSkills(world: World): void {
  const player: PlayerState = world.player;
  const fresh: string[] = learnable(world.content, player.learned, player.level, (when: readonly Condition[]): boolean => allHold(world, when));
  if (fresh.length === 0) return;
  for (const skill of fresh) learn(world, skill, false);
  refreshPlayer(world);
}

export function chooseSkill(world: World, offerId: string, skill: string): void {
  const open: OpenOffer | null = pendingOffer(world);
  if (open === null || open.offer.id !== offerId || !open.choices.includes(skill)) return;
  world.player.offersTaken.push(offerId);
  learn(world, skill, true);
  refreshPlayer(world);
}
