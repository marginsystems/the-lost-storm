import { distance } from '../math.ts';
import { bark } from './boss.ts';
import { allHold } from './conditions.ts';
import type { World } from './types.ts';

export function stepVoices(world: World): void {
  if (!world.player.alive) return;
  for (const voice of world.zone.voices) {
    if (world.heard.includes(voice.id) || distance(world.player.pos, voice) > voice.radius || !allHold(world, voice.when)) continue;
    world.heard.push(voice.id);
    bark(world, voice.lines);
  }
}
