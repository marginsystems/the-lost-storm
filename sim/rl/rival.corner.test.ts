import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef, ZoneDef, ZoneDuel } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable, lineOfSight, lineWalkable } from '../nav/grid.ts';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { RING, ringContent, ringWorld } from '../../test/rival-support.ts';
import { wearDuelKit } from '../world/duel-gear.ts';
import { blockedReason } from '../world/skills.ts';
import { stepWorld } from '../world/step.ts';
import type { Command, PlayerState, World, WorldEvent } from '../world/types.ts';
import { createPolicyNet } from './policy-net.ts';
import { readPolicyFile } from './policy-file.ts';
import type { RivalDuel, RivalPilot } from './rival.ts';
import { netPilot, RIVAL, rivalCommands, rivalHeard, rivalOf, startRivalDuel } from './rival.ts';

const SHIPPED: string = 'public/models/rl/duel-pilot.bin';
const FRAME: number = 1 / 30;
const ESCAPE = { zone: 'proving_ground', level: 20, seconds: 12, away: 3, bar: ['cleave', null, 'storm_bolt', null, null, 'dodge_roll'] } as const;
const SHOOT: RivalPilot = () => ({ move: 0, skill: 1, target: 0, use: 0 });
const BOLT_SLOT: number = ESCAPE.bar.indexOf('storm_bolt');
const LOW = { level: 5, firstSeed: 9001, seeds: 6, seconds: 15, atLeast: 3 } as const;

interface Corner {
  readonly name: string;
  readonly seed: number;
  readonly rival: Vec2;
  readonly caster: Vec2;
}

const CORNERS: readonly Corner[] = [
  { name: 'the south-east step, where the audit pinned the rival', seed: 31, rival: { x: 26.4, z: 30.4 }, caster: { x: 21, z: 23 } },
  { name: 'the north-west step', seed: 32, rival: { x: 9.6, z: 5.6 }, caster: { x: 11.5, z: 12.5 } },
  { name: 'the north-east step', seed: 33, rival: { x: 26.4, z: 5.6 }, caster: { x: 21, z: 12 } },
  { name: 'the south-west step', seed: 34, rival: { x: 10.4, z: 29.4 }, caster: { x: 16, z: 23 } },
  { name: 'the east shoulder', seed: 35, rival: { x: 30.4, z: 9.6 }, caster: { x: 24, z: 15 } },
  { name: 'the south-east shoulder', seed: 36, rival: { x: 29.4, z: 25.4 }, caster: { x: 24, z: 20 } },
  { name: 'the upper west shoulder', seed: 37, rival: { x: 4.5, z: 13.5 }, caster: { x: 10, z: 17 } },
  { name: 'the lower west shoulder', seed: 38, rival: { x: 5.5, z: 26.4 }, caster: { x: 11, z: 21 } },
];

function pilotOf(): RivalPilot {
  return netPilot(createPolicyNet(readPolicyFile(new Uint8Array(readFileSync(SHIPPED)))));
}

function casterWorld(content: Content, corner: Corner): World {
  const world: World = worldIn(content, ESCAPE.zone, corner.seed);
  stepWorld(world, [{ type: 'bench', hero: { seed: corner.seed, level: ESCAPE.level, weapon: 'warden_broadsword', bar: [...ESCAPE.bar] } }], FRAME);
  wearDuelKit(world);
  world.player.pos = { x: corner.caster.x, z: corner.caster.z };
  world.events = [];
  return world;
}

function boltAt(world: World, target: PlayerState): Command[] {
  const caster: PlayerState = world.player;
  caster.life = caster.maxLife;
  caster.mana = caster.stats.maxMana;
  const bolt: SkillDef | null = caster.skills[BOLT_SLOT] ?? null;
  if (bolt === null || caster.action !== null || blockedReason(caster, bolt) !== null) return [];
  return [{ type: 'skill', slot: BOLT_SLOT, aim: { x: target.pos.x, z: target.pos.z }, targetId: target.id }];
}

function escapes(content: Content, pilot: RivalPilot, corner: Corner): number {
  const world: World = casterWorld(content, corner);
  const duel: RivalDuel = must(startRivalDuel(world, corner.seed), 'duel');
  const rival: PlayerState = must(rivalOf(duel, world), 'rival');
  rival.pos = { x: corner.rival.x, z: corner.rival.z };
  duel.start = world.time;
  let farthest: number = 0;
  for (let time: number = 0; time < ESCAPE.seconds && duel.outcome === 'fighting'; time += FRAME) {
    const commands: Command[] = [...boltAt(world, rival), ...rivalCommands(duel, world, pilot, FRAME)];
    const events: WorldEvent[] = stepWorld(world, commands, FRAME);
    rivalHeard(duel, world, events);
    farthest = Math.max(farthest, Math.hypot(rival.pos.x - corner.rival.x, rival.pos.z - corner.rival.z));
    if (farthest > ESCAPE.away) return farthest;
  }
  return farthest;
}

void test('every held-out corner is a walkable spot with open ground between the caster and the rival', (): void => {
  const content: Content = loadContent();
  for (const corner of CORNERS) {
    const world: World = casterWorld(content, corner);
    assert.ok(isWalkable(world.grid, corner.rival.x, corner.rival.z), `${corner.name}: the rival's spot is walkable`);
    assert.ok(isWalkable(world.grid, corner.caster.x, corner.caster.z), `${corner.name}: the caster's spot is walkable`);
    assert.ok(lineWalkable(world.grid, corner.rival, corner.caster), `${corner.name}: the rival can walk straight at the caster`);
  }
});

void test('the shipped model leaves every held-out Proving Ground corner while a hero casts Storm Bolt at it on cooldown', (): void => {
  const content: Content = loadContent();
  const pilot: RivalPilot = pilotOf();
  const stuck: string[] = CORNERS.flatMap((corner: Corner): string[] => {
    const farthest: number = escapes(content, pilot, corner);
    return farthest > ESCAPE.away ? [] : [`${corner.name} (${farthest.toFixed(2)} m)`];
  });
  assert.deepEqual(stuck, [], `the rival stayed within ${ESCAPE.away} m of these corners for ${ESCAPE.seconds} s`);
});

function provingRing(content: Content): Content {
  const ring: ZoneDef = zoneOf(content, RING.id);
  const proving: ZoneDuel = must(zoneOf(content, ESCAPE.zone).duel, 'proving ground duel');
  const duel: ZoneDuel = { ...must(ring.duel, 'ring duel'), gear: proving.gear, heroDamage: proving.heroDamage };
  return { ...content, zones: new Map<string, ZoneDef>([...content.zones, [RING.id, { ...ring, duel }]]) };
}

function hurtsAtLowLevel(content: Content, pilot: RivalPilot, seed: number): boolean {
  const world: World = ringWorld(content, seed, LOW.level);
  wearDuelKit(world);
  world.player.life = world.player.maxLife;
  const duel: RivalDuel = must(startRivalDuel(world, seed), 'duel');
  for (let time: number = 0; time < RIVAL.startIn + LOW.seconds && duel.outcome === 'fighting'; time += FRAME) {
    const events: WorldEvent[] = stepWorld(world, rivalCommands(duel, world, pilot, FRAME), FRAME);
    rivalHeard(duel, world, events);
  }
  return world.player.life < world.player.maxLife;
}

void test('learning to leave corners did not teach the shipped model to run from a standing low-level hero', (): void => {
  const content: Content = provingRing(ringContent(loadContent()));
  const pilot: RivalPilot = pilotOf();
  const seeds: number[] = Array.from({ length: LOW.seeds }, (_unused: unknown, index: number): number => LOW.firstSeed + index);
  const hurt: number = seeds.filter((seed: number): boolean => hurtsAtLowLevel(content, pilot, seed)).length;
  assert.ok(hurt >= LOW.atLeast, `the level ${LOW.level} rival hurt a standing hero in only ${hurt} of ${LOW.seeds} duels`);
});

void test('the crossbow rival finds a clear shot around the ring wall', (): void => {
  const world: World = ringWorld(provingRing(ringContent(loadContent())), 9003, LOW.level);
  wearDuelKit(world);
  const duel: RivalDuel = must(startRivalDuel(world, 9003), 'duel');
  const rival: PlayerState = must(rivalOf(duel, world), 'rival');
  assert.equal(rival.skills[0]?.delivery.type, 'projectile');
  assert.equal(lineOfSight(world.grid, rival.pos, world.player.pos), false);
  for (let time: number = 0; time < RIVAL.startIn + LOW.seconds; time += FRAME) {
    const events: WorldEvent[] = stepWorld(world, rivalCommands(duel, world, SHOOT, FRAME), FRAME);
    if (events.some((event: WorldEvent): boolean => event.type === 'damage' && event.sourceId === rival.id && event.targetId === world.player.id && event.amount > 0)) return;
  }
  assert.fail('the crossbow rival never hit the standing hero');
});
