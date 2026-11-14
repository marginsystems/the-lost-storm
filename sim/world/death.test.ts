import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTPOST_CONTENT, OUTPOST_ZONE } from '../../test/road-support.ts';
import { finishQuests, must, worldIn, zoneOf } from '../../test/support.ts';
import type { Content, MonsterDef, ZoneDef, ZoneExit, ZonePack, ZoneReturn, ZoneWaypoint } from '../content/types.ts';
import { loadContent } from '../content/content.ts';
import { createWorld } from './create.ts';
import { choicesOpen, penaltyFor } from './death.ts';
import { stepWorld } from './step.ts';
import type { Command, MonsterState, World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';
import { xpToNextLevel } from '../progression.ts';

const content: Content = OUTPOST_CONTENT;
const DT: number = 1 / 60;

function advance(world: World, seconds: number, first: readonly Command[] = []): WorldEvent[] {
  const events: WorldEvent[] = [];
  const steps: number = Math.round(seconds / DT);
  for (let step: number = 0; step < steps; step += 1) events.push(...stepWorld(world, step === 0 ? first : [], DT));
  return events;
}

function killedBy(world: World, monster: MonsterState): void {
  monster.spawnTime = 0;
  world.player.stats.lifeRegen = 0;
  world.player.pos = { x: monster.pos.x, z: monster.pos.z + 1.5 };
  world.player.life = 1;
  for (let step: number = 0; step < 900 && world.player.alive; step += 1) stepWorld(world, [], DT);
}

function dead(zoneId: string): World {
  const world: World = worldIn(content, zoneId, 3);
  const monster: MonsterState = must(world.monsters.find((candidate: MonsterState): boolean => candidate.def.boss === null && candidate.alive), 'monster');
  killedBy(world, monster);
  assert.equal(world.player.alive, false);
  return world;
}

void test('dying records what killed the hero and nothing brings the hero back by itself', (): void => {
  const world: World = dead('outpost');
  const cause = must(world.death, 'death');
  assert.ok(cause.killer.length > 0);
  assert.ok([...content.skills.values()].some((skill): boolean => skill.name === cause.skill));
  assert.ok([...content.monsters.values()].some((def): boolean => def.name === cause.killer));
  advance(world, 30);
  assert.equal(world.player.alive, false);
  assert.equal(world.player.life, 0);
});

void test('a dead hero ignores every command until the choice opens, and the choice needs a moment', (): void => {
  const world: World = dead('outpost');
  const where = { ...world.player.pos };
  advance(world, 0.2, [{ type: 'move', held: false, dest: { x: where.x + 5, z: where.z } }, { type: 'respawn', choice: 'checkpoint' }]);
  assert.equal(world.player.alive, false);
  assert.equal(choicesOpen(world), false);
  advance(world, content.player.respawnDelay);
  assert.equal(choicesOpen(world), true);
  advance(world, 0.1, [{ type: 'move', held: false, dest: { x: where.x + 5, z: where.z } }]);
  assert.equal(world.player.alive, false);
});

void test('monsters lose interest the moment the hero falls', (): void => {
  const world: World = worldIn(content, 'outpost', 3);
  const monster: MonsterState = must(world.monsters.find((candidate: MonsterState): boolean => candidate.def.boss === null), 'monster');
  const other: MonsterState = must(world.monsters.find((candidate: MonsterState): boolean => candidate !== monster && candidate.def.boss === null), 'other');
  other.aggro = true;
  killedBy(world, monster);
  assert.equal(other.aggro, false);
});

void test('returning to the checkpoint restores the hero, resets the living and leaves the dead dead', (): void => {
  const world: World = worldIn(content, 'outpost', 3);
  const all: MonsterState[] = world.monsters.filter((candidate: MonsterState): boolean => candidate.def.boss === null);
  const killer: MonsterState = must(all[0], 'killer');
  const bystander: MonsterState = must(all[1], 'bystander');
  const corpse: MonsterState = must(all[2], 'corpse');
  killedBy(world, killer);
  advance(world, content.player.respawnDelay + 0.1);
  corpse.alive = false;
  bystander.life = 1;
  bystander.aggro = true;
  bystander.pos = { x: bystander.home.x + 4, z: bystander.home.z };
  world.player.mana = 0;
  world.player.cooldowns = { x: 5 };
  const level: number = world.player.level;
  const events: WorldEvent[] = stepWorld(world, [{ type: 'respawn', choice: 'checkpoint' }], DT);
  assert.equal(events.filter((event: WorldEvent): boolean => event.type === 'player_respawn').length, 1);
  assert.equal(world.player.alive, true);
  assert.equal(world.player.life, world.player.maxLife);
  assert.equal(world.player.mana, world.player.stats.maxMana);
  assert.deepEqual(world.player.cooldowns, {});
  assert.equal(world.player.level, level);
  assert.equal(world.death, null);
  assert.equal(bystander.life, bystander.maxLife);
  assert.ok(Math.hypot(bystander.pos.x - bystander.home.x, bystander.pos.z - bystander.home.z) < 1);
  assert.equal(bystander.aggro, false);
  assert.equal(corpse.alive, false);
});

void test('the hero is untouchable for a short time after returning and mortal again after', (): void => {
  const world: World = dead('outpost');
  const monster: MonsterState = must(world.monsters[0], 'monster');
  advance(world, content.player.respawnDelay + 0.1);
  advance(world, 0.05, [{ type: 'respawn', choice: 'checkpoint' }]);
  assert.ok(world.player.invulnerable > 0);
  monster.aggro = true;
  monster.spawnTime = 0;
  world.player.pos = { x: monster.pos.x, z: monster.pos.z + 1.5 };
  advance(world, content.player.respawnInvulnerability - 0.3);
  assert.equal(world.player.life, world.player.maxLife);
  advance(world, 3);
  assert.equal(world.player.invulnerable, 0);
  assert.ok(world.player.life < world.player.maxLife);
});

void test('a boss comes back at full life and in its first phase', (): void => {
  const def: MonsterDef = must([...content.monsters.values()].find((candidate: MonsterDef): boolean => candidate.boss !== null), 'boss def');
  const outpost: ZoneDef = OUTPOST_ZONE;
  const packs: ZonePack[] = [
    { x: 28, z: 14, members: [{ monster: def.id, count: 1, mods: [] }], when: [] },
    { x: 28, z: 40, members: [{ monster: 'mended', count: 1, mods: [] }], when: [] },
  ];
  const room: ZoneDef = { ...outpost, id: 'death_room', surge: null, packs, exits: [], waypoint: null };
  const withRoom: Content = { ...content, zones: new Map<string, ZoneDef>([...content.zones, [room.id, room]]) };
  const world: World = createWorld(withRoom, { seed: 5, save: null });
  enterZone(world, room, { type: 'start' });
  const boss: MonsterState = must(world.monsters.find((candidate: MonsterState): boolean => candidate.def.boss !== null), 'boss');
  const thrall: MonsterState = must(world.monsters.find((candidate: MonsterState): boolean => candidate.def.boss === null), 'thrall');
  boss.spawnTime = 0;
  thrall.spawnTime = 0;
  boss.life = boss.maxLife * 0.2;
  boss.phase = 2;
  killedBy(world, thrall);
  advance(world, content.player.respawnDelay + 0.1);
  boss.life = boss.maxLife * 0.2;
  boss.phase = 2;
  boss.aggro = true;
  stepWorld(world, [{ type: 'respawn', choice: 'checkpoint' }], DT);
  assert.equal(boss.life, boss.maxLife);
  assert.equal(boss.phase, 0);
  assert.equal(boss.aggro, false);
});

void test('each death takes a tenth of the experience the level needs, never more than the hero holds and never a level', (): void => {
  const penalty = content.player.deathPenalty;
  const curve = content.player.xp;
  assert.equal(penalty.minLevel, 1);
  const tenth = (level: number): number => Math.round(xpToNextLevel(curve, level) * penalty.xpPercent);
  assert.equal(penaltyFor(penalty, curve, 1, 500), tenth(1));
  assert.equal(penaltyFor(penalty, curve, 6, xpToNextLevel(curve, 6) - 1), tenth(6));
  assert.equal(penaltyFor(penalty, curve, 4, 3), 3);
  assert.equal(penaltyFor(penalty, curve, 4, 0), 0);
  assert.equal(penaltyFor({ minLevel: 3, xpPercent: 0.1 }, curve, 2, 500), 0);
});

void test('the experience is lost the moment the hero falls and stays lost after the return', (): void => {
  const curve = content.player.xp;
  const world: World = worldIn(content, 'outpost', 3);
  world.player.level = 3;
  const monster: MonsterState = must(world.monsters.find((candidate: MonsterState): boolean => candidate.def.boss === null && candidate.alive), 'monster');
  const held: number = Math.round(xpToNextLevel(curve, 3) * 0.5);
  world.player.xp = held;
  killedBy(world, monster);
  const lost: number = Math.round(xpToNextLevel(curve, 3) * content.player.deathPenalty.xpPercent);
  assert.equal(must(world.death, 'death').xpLost, lost);
  assert.equal(world.player.xp, held - lost);
  advance(world, content.player.respawnDelay + 0.1);
  advance(world, 0.05, [{ type: 'respawn', choice: 'checkpoint' }]);
  assert.equal(world.player.level, 3);
  assert.equal(world.player.xp, held - lost);
});

void test('dying with little experience empties the bar and keeps the level', (): void => {
  const world: World = worldIn(content, 'outpost', 5);
  world.player.level = 5;
  const monster: MonsterState = must(world.monsters.find((candidate: MonsterState): boolean => candidate.def.boss === null && candidate.alive), 'monster');
  world.player.xp = 2;
  killedBy(world, monster);
  assert.equal(must(world.death, 'death').xpLost, 2);
  assert.equal(world.player.xp, 0);
  assert.equal(world.player.level, 5);
});

void test('returning to town leaves the wilds for the town', (): void => {
  const world: World = dead('outpost');
  advance(world, content.player.respawnDelay + 0.1);
  const events: WorldEvent[] = advance(world, 0.05, [{ type: 'respawn', choice: 'town' }]);
  assert.equal(world.zone.id, content.world.town);
  assert.equal(world.zone.kind, 'town');
  assert.equal(world.player.alive, true);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'zone_changed'));
});

void test('touching a waypoint makes it the checkpoint and the hero returns to it', (): void => {
  const world: World = finishQuests(worldIn(content, 'outpost', 4));
  world.monsters = [];
  const waypoint: ZoneWaypoint = must(world.zone.waypoint, 'waypoint');
  assert.notEqual(world.respawn.type, 'waypoint');
  world.player.pos = { x: waypoint.x, z: waypoint.z };
  advance(world, 0.1);
  assert.deepEqual(world.respawn, { type: 'waypoint' });
  world.player.pos = { x: waypoint.x + 6, z: waypoint.z };
  world.player.life = 0;
  world.player.alive = false;
  world.death = { killer: 'x', skill: 'y', elapsed: 99, xpLost: 0 };
  stepWorld(world, [{ type: 'respawn', choice: 'checkpoint' }], DT);
  assert.deepEqual(world.player.pos, { x: waypoint.x, z: waypoint.z });
});

void test('entering a zone through an exit makes that entrance the checkpoint', (): void => {
  const world: World = finishQuests(createWorld(content, { seed: 6, save: null }));
  const wild: ZoneDef = zoneOf(content, 'outpost');
  const exit = must(world.zone.exits.find((candidate) => candidate.to === wild.id), 'exit');
  world.monsters = [];
  world.player.pos = { x: exit.x, z: exit.z };
  advance(world, 0.1, [{ type: 'travel', exit: exit.id }]);
  assert.equal(world.zone.id, wild.id);
  assert.deepEqual(world.respawn, { type: 'exit', exit: exit.toExit });
  world.player.life = 0;
  world.player.alive = false;
  world.death = { killer: 'x', skill: 'y', elapsed: 99, xpLost: 0 };
  world.player.pos = { x: 1, z: 1 };
  stepWorld(world, [{ type: 'respawn', choice: 'checkpoint' }], DT);
  const arrival = must(wild.exits.find((candidate) => candidate.id === exit.toExit), 'arrival').arrival;
  assert.deepEqual(world.player.pos, { x: arrival.x, z: arrival.z });
});

void test('a hero who falls in a lair with a way out rises outside at its door, and the lair is built fresh with its boss whole', (): void => {
  const shipped: Content = loadContent();
  const lair: ZoneDef = must([...shipped.zones.values()].find((zone: ZoneDef): boolean => zone.deathReturn !== null), 'a lair');
  const back: ZoneReturn = must(lair.deathReturn, 'its way out');
  const door: ZoneExit = must(zoneOf(shipped, back.zone).exits.find((exit: ZoneExit): boolean => exit.id === back.exit), 'the door');
  const world: World = worldIn(shipped, lair.id, 5);
  const boss: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.boss !== null), 'boss');
  boss.life = Math.round(boss.maxLife * 0.2);
  boss.phase = 2;
  killedBy(world, boss);
  assert.equal(world.player.alive, false);
  const xp: number = world.player.xp;
  advance(world, shipped.player.respawnDelay + 0.1);
  const events: WorldEvent[] = advance(world, 0.05, [{ type: 'respawn', choice: 'checkpoint' }]);
  assert.equal(world.player.alive, true);
  assert.equal(world.zone.id, back.zone);
  assert.deepEqual(events.filter((event: WorldEvent): boolean => event.type === 'zone_changed'), [{ type: 'zone_changed', from: lair.id, to: back.zone }]);
  assert.ok(Math.hypot(world.player.pos.x - door.arrival.x, world.player.pos.z - door.arrival.z) < 0.5, 'the hero did not rise at the door');
  assert.equal(world.player.xp, xp);
  enterZone(world, lair, { type: 'exit', exit: door.toExit });
  const again: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.boss !== null), 'boss again');
  assert.equal(again.life, again.maxLife);
  assert.equal(again.phase, 0);
});

void test('falling in a lair and choosing the town still goes to the town', (): void => {
  const shipped: Content = loadContent();
  const lair: ZoneDef = must([...shipped.zones.values()].find((zone: ZoneDef): boolean => zone.deathReturn !== null), 'a lair');
  const world: World = worldIn(shipped, lair.id, 6);
  killedBy(world, must(world.monsters.find((monster: MonsterState): boolean => monster.def.boss !== null), 'boss'));
  advance(world, shipped.player.respawnDelay + 0.1);
  advance(world, 0.05, [{ type: 'respawn', choice: 'town' }]);
  assert.equal(world.zone.id, shipped.world.town);
});
