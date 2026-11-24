import { createWorld } from './create.ts';
import type { WorldOptions } from './create.ts';
import type { PlayerState, World } from './types.ts';

export function adoptWorld(into: World, options: WorldOptions): void {
  const from: World = createWorld(into.content, { ...options, firstId: into.nextId });
  const player: PlayerState = into.player;
  Object.assign(player, from.player);
  into.heroes.splice(0, into.heroes.length, ...from.heroes.map((hero: PlayerState): PlayerState => (hero === from.player ? player : hero)));
  Object.assign(into, { ...from, player, heroes: into.heroes, exploredRevision: into.exploredRevision + from.exploredRevision + 1 });
}
