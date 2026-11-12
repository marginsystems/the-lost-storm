import type { DeathPenalty } from '../content/types.ts';
import { clearProjectiles } from './skills.ts';
import type { MonsterState, PlayerState, RespawnChoice, World, WorldEvent } from './types.ts';
import { enterZone, placePlayer, startZone } from './zones.ts';

export function choicesOpen(world: World): boolean {
  return !world.player.alive && world.death !== null && world.death.elapsed >= world.content.player.respawnDelay;
}

export function penaltyFor(penalty: DeathPenalty, level: number, xp: number): number {
  if (level < penalty.minLevel) return 0;
  return Math.min(xp, Math.round(xp * penalty.xpPercent));
}

function resetMonster(monster: MonsterState): void {
  monster.aggro = false;
  monster.life = monster.maxLife;
  monster.pos = { x: monster.home.x, z: monster.home.z };
  monster.knock = { x: 0, z: 0 };
  monster.action = null;
  monster.path = [];
  monster.stance = 'approach';
  monster.blindTime = 0;
  monster.stuckTime = 0;
  monster.restTime = 0;
  monster.lastPos = { x: monster.pos.x, z: monster.pos.z };
  monster.lastTravel = 0;
  monster.stagger = 0;
  monster.phase = 0;
  monster.nextSkill = null;
  monster.cooldowns = {};
}

function revive(world: World): void {
  const player: PlayerState = world.player;
  player.xp -= penaltyFor(world.content.player.deathPenalty, player.level, player.xp);
  player.alive = true;
  player.life = player.maxLife;
  player.mana = player.stats.maxMana;
  player.cooldowns = {};
  player.combo = null;
  player.stagger = 0;
  player.invulnerable = world.content.player.respawnInvulnerability;
  world.death = null;
}

export function respawnPlayer(world: World, choice: RespawnChoice): void {
  if (!choicesOpen(world)) return;
  const town = world.zone.kind === 'town' ? world.zone : startZone(world.content);
  const away: boolean = choice === 'town' && town.id !== world.zone.id;
  if (choice === 'town' && !away) world.respawn = { type: 'start' };
  revive(world);
  if (away) {
    const from: string = world.zone.id;
    enterZone(world, town, { type: 'start' });
    world.events.push({ type: 'zone_changed', from, to: town.id });
  } else {
    placePlayer(world);
    clearProjectiles(world);
    for (const monster of world.monsters) if (monster.alive) resetMonster(monster);
  }
  world.events.push({ type: 'player_respawn' });
}

function recordDeath(world: World, event: Extract<WorldEvent, { readonly type: 'damage' }>): void {
  const source: MonsterState | undefined = world.monsters.find((monster: MonsterState): boolean => monster.id === event.sourceId);
  world.death = { killer: source?.def.name ?? 'The storm', skill: event.skill.name, elapsed: 0 };
  for (const monster of world.monsters) monster.aggro = false;
}

export function stepDeath(world: World, dt: number): void {
  const player: PlayerState = world.player;
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  if (!player.alive && world.death !== null) world.death.elapsed += dt;
  for (const event of world.events) {
    if (event.type === 'damage' && event.killed && event.targetTeam === 'player') recordDeath(world, event);
  }
}
