import type { ZoneFlash } from '../content/story-types.ts';
import type { ZoneDef } from '../content/types.ts';
import { distance } from '../math.ts';
import { allHold } from './conditions.ts';
import type { FlashState } from './flash-types.ts';
import { setFlags } from './story.ts';
import type { Command, World } from './types.ts';
import { enterZone } from './zones.ts';

const HELD: ReadonlySet<Command['type']> = new Set<Command['type']>(['skill', 'strike', 'flask', 'travel', 'teleport', 'use', 'hold']);

export function flashHolds(world: World, command: Command): boolean {
  return world.zone.flash !== null && HELD.has(command.type);
}

function calm(world: World): boolean {
  return world.player.alive && world.death === null && world.dialogue === null && world.service === null && world.scene === null && world.wake === null;
}

export function waitingFlash(world: World): ZoneDef | null {
  for (const zone of world.content.zones.values()) {
    const rules: ZoneFlash | null = zone.flash;
    if (rules !== null && rules.from === world.zone.id && allHold(world, rules.when)) return zone;
  }
  return null;
}

function travel(world: World, zone: ZoneDef): void {
  const from: string = world.zone.id;
  enterZone(world, zone, { type: 'start' });
  world.events.push({ type: 'zone_changed', from, to: zone.id });
}

function reset(state: FlashState): void {
  state.waited = 0;
  state.elapsed = 0;
  state.seamLeft = null;
}

function atThreshold(world: World, rules: ZoneFlash): boolean {
  return rules.threshold !== null && distance(world.player.pos, rules.threshold) <= rules.threshold.radius;
}

function play(world: World, rules: ZoneFlash, dt: number): void {
  const state: FlashState = world.flash;
  state.elapsed += dt;
  if (state.seamLeft === null) {
    if (state.elapsed < rules.seconds - rules.seam && !atThreshold(world, rules)) return;
    state.seamLeft = rules.seam;
    world.events.push({ type: 'flash_seam', zone: world.zone.id, seconds: rules.seam });
    return;
  }
  state.seamLeft -= dt;
  if (state.seamLeft > 0) return;
  const into: ZoneDef | undefined = world.content.zones.get(rules.into);
  if (into === undefined) return;
  reset(state);
  setFlags(world, rules.sets);
  travel(world, into);
}

export function stepFlash(world: World, dt: number): void {
  const here: ZoneFlash | null = world.zone.flash;
  if (here !== null) {
    play(world, here, dt);
    return;
  }
  const state: FlashState = world.flash;
  state.elapsed = 0;
  state.seamLeft = null;
  const next: ZoneDef | null = waitingFlash(world);
  if (next === null || next.flash === null || !calm(world)) {
    state.waited = 0;
    return;
  }
  state.waited += dt;
  if (state.waited < next.flash.calm) return;
  reset(state);
  travel(world, next);
}
