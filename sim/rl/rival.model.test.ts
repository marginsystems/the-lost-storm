import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef, ZoneDuel } from '../content/types.ts';
import { must, zoneOf } from '../../test/support.ts';
import { RING, ringContent, ringWorld } from '../../test/rival-support.ts';
import { wearDuelKit } from '../world/duel-gear.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, World, WorldEvent } from '../world/types.ts';
import { createPolicyNet } from './policy-net.ts';
import { readPolicyFile } from './policy-file.ts';
import type { RivalDuel, RivalPilot } from './rival.ts';
import { netPilot, RIVAL, rivalCommands, rivalHeard, rivalOf, startRivalDuel } from './rival.ts';

const SHIPPED: string = 'public/models/rl/duel-pilot.bin';
const FRAME: number = 1 / 30;
const CONTENT: Content = ringContent(loadContent());
const PRESSES = { level: 20, firstSeed: 9001, seeds: 6, seconds: 15, atLeast: 3 } as const;

function provingRules(content: Content): Content {
  const ring: ZoneDef = zoneOf(content, RING.id);
  const proving: ZoneDuel = must(zoneOf(content, 'proving_ground').duel, 'proving ground duel');
  const duel: ZoneDuel = { ...must(ring.duel, 'ring duel'), gear: proving.gear, heroDamage: proving.heroDamage };
  return { ...content, zones: new Map<string, ZoneDef>([...content.zones, [RING.id, { ...ring, duel }]]) };
}

function hurtsStandingHero(content: Content, pilot: RivalPilot, seed: number): boolean {
  const world: World = ringWorld(content, seed, PRESSES.level);
  wearDuelKit(world);
  world.player.life = world.player.maxLife;
  const duel: RivalDuel = must(startRivalDuel(world, seed), 'duel');
  for (let time: number = 0; time < RIVAL.startIn + PRESSES.seconds && duel.outcome === 'fighting'; time += FRAME) {
    const events: WorldEvent[] = stepWorld(world, rivalCommands(duel, world, pilot, FRAME), FRAME);
    rivalHeard(duel, world, events);
  }
  return world.player.life < world.player.maxLife;
}

void test('the shipped model drives the rival: it closes on the player or strikes within a few seconds', (): void => {
  const pilot: RivalPilot = netPilot(createPolicyNet(readPolicyFile(new Uint8Array(readFileSync(SHIPPED)))));
  const world: World = ringWorld(CONTENT, 21, 12);
  const duel: RivalDuel = must(startRivalDuel(world, 21), 'duel');
  const gap = (): number => {
    const hero = must(rivalOf(duel, world), 'rival');
    return Math.hypot(hero.pos.x - world.player.pos.x, hero.pos.z - world.player.pos.z);
  };
  const before: number = gap();
  const sent: Command[] = [];
  for (let time: number = 0; time < RIVAL.startIn + 4 && duel.outcome === 'fighting'; time += FRAME) {
    const commands: Command[] = rivalCommands(duel, world, pilot, FRAME);
    sent.push(...commands);
    const events: WorldEvent[] = stepWorld(world, commands, FRAME);
    rivalHeard(duel, world, events);
  }
  assert.ok(sent.length > 0);
  assert.ok(gap() < before || sent.some((command: Command): boolean => command.type === 'skill') || world.player.life < world.player.maxLife, 'the rival neither closed in nor struck');
});

void test('the shipped model presses a standing hero under the Proving Ground rules', (): void => {
  const pilot: RivalPilot = netPilot(createPolicyNet(readPolicyFile(new Uint8Array(readFileSync(SHIPPED)))));
  const content: Content = provingRules(CONTENT);
  const seeds: number[] = Array.from({ length: PRESSES.seeds }, (_unused: unknown, index: number): number => PRESSES.firstSeed + index);
  const hurt: number = seeds.filter((seed: number): boolean => hurtsStandingHero(content, pilot, seed)).length;
  assert.ok(hurt >= PRESSES.atLeast, `the rival hurt a standing hero in only ${hurt} of ${PRESSES.seeds} duels`);
});
