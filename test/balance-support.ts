import { loadContent } from '../sim/content/content.ts';
import type { Content, SkillDef } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { xpToNextLevel } from '../sim/progression.ts';
import { unlockedSkills } from '../sim/skill-book.ts';
import { grantXp } from '../sim/world/character.ts';
import { chargeOf } from '../sim/world/skills.ts';
import { stepWorld } from '../sim/world/step.ts';
import type { Command, MonsterState, PlayerState, World, WorldEvent } from '../sim/world/types.ts';
import { arena, ARENA_CENTRE, place } from './arena-support.ts';

export const BALANCE = {
  dt: 1 / 30,
  limit: 120,
  flaskAt: 0.45,
  chargeRelease: 0.95,
  crowd: 3,
  mobbed: 3,
  mobReach: 3,
  channelLife: 0.5,
  clump: 4,
  blinkGap: 4,
  barSize: 6,
  saveFor: 2,
} as const;

export interface Build {
  readonly name: string;
  readonly order: readonly string[];
}

export interface Encounter {
  readonly name: string;
  readonly pack: readonly { readonly monster: string; readonly at: Vec2; readonly mods: readonly string[] }[];
}

export interface Clear {
  readonly seconds: number;
  readonly cleared: boolean;
  readonly alive: boolean;
  readonly damage: ReadonlyMap<string, number>;
}

export const BALANCE_CONTENT: Content = loadContent();

export const BUILDS: readonly Build[] = [
  { name: 'striker', order: ['thunderhead', 'mist_step', 'downdraught', 'thunderclap', 'cleave'] },
  { name: 'caster', order: ['static_brand', 'living_wire', 'forkline', 'storm_bolt', 'cleave'] },
  { name: 'weather', order: ['held_breath', 'squall', 'downdraught', 'thunderclap', 'forkline', 'cleave'] },
];

function ring(count: number, radius: number, turn: number): Vec2[] {
  return Array.from({ length: count }, (_unused: unknown, index: number): Vec2 => {
    const angle: number = turn + (index / count) * Math.PI * 2;
    return { x: ARENA_CENTRE.x + Math.sin(angle) * radius, z: ARENA_CENTRE.z + Math.cos(angle) * radius };
  });
}

export const ENCOUNTERS: readonly Encounter[] = [
  {
    name: 'group',
    pack: [
      ...ring(4, 7, 0).map((at: Vec2): Encounter['pack'][number] => ({ monster: 'mended', at, mods: [] })),
      ...ring(2, 9, 0.8).map((at: Vec2): Encounter['pack'][number] => ({ monster: 'unfinished_brute', at, mods: [] })),
      ...ring(2, 11, 2.2).map((at: Vec2): Encounter['pack'][number] => ({ monster: 'mender', at, mods: [] })),
    ],
  },
  { name: 'tough', pack: [{ monster: 'unfinished_borrower', at: { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 7 }, mods: ['hulking'] }] },
];

export function buildBar(build: Build, level: number): string[] {
  const known: readonly string[] = unlockedSkills(BALANCE_CONTENT, level);
  const chosen: string[] = build.order.filter((skill: string): boolean => known.includes(skill)).filter((skill: string): boolean => skill !== 'cleave').slice(0, BALANCE.barSize - 2);
  return ['cleave', ...chosen, 'dodge_roll'];
}

function hero(build: Build, level: number, seed: number): World {
  const world: World = arena(seed, BALANCE_CONTENT);
  while (world.player.level < level) grantXp(world, xpToNextLevel(BALANCE_CONTENT.player.xp, world.player.level) - world.player.xp);
  const bar: readonly string[] = buildBar(build, level);
  const slots: Command[] = bar.map((skill: string, slot: number): Command => ({ type: 'slot', slot, skill }));
  for (let index: number = 0; index < BALANCE.barSize; index += 1) if (index >= bar.length) slots.push({ type: 'slot', slot: index, skill: null });
  stepWorld(world, slots, BALANCE.dt);
  stepWorld(world, slots, BALANCE.dt);
  world.player.life = world.player.maxLife;
  world.player.mana = world.player.stats.maxMana;
  world.zone = { ...world.zone, level };
  world.events = [];
  return world;
}

function nearest(foes: readonly MonsterState[], from: Vec2): MonsterState | null {
  let best: MonsterState | null = null;
  let gap: number = Infinity;
  for (const foe of foes) {
    const next: number = Math.hypot(foe.pos.x - from.x, foe.pos.z - from.z);
    if (next < gap) {
      gap = next;
      best = foe;
    }
  }
  return best;
}

function near(foes: readonly MonsterState[], at: Vec2, radius: number): MonsterState[] {
  return foes.filter((foe: MonsterState): boolean => Math.hypot(foe.pos.x - at.x, foe.pos.z - at.z) <= radius + foe.radius);
}

function centroid(foes: readonly MonsterState[]): Vec2 {
  const sum: Vec2 = { x: 0, z: 0 };
  for (const foe of foes) {
    sum.x += foe.pos.x;
    sum.z += foe.pos.z;
  }
  return { x: sum.x / foes.length, z: sum.z / foes.length };
}

function aimFor(player: PlayerState, skill: SkillDef, foes: readonly MonsterState[], target: MonsterState): Vec2 | null {
  const gap: number = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) - target.radius;
  const tough: boolean = foes.length === 1;
  const delivery = skill.delivery;
  switch (delivery.type) {
    case 'arc':
      return gap <= skill.engageRange || skill.id === 'cleave' ? target.pos : null;
    case 'nova':
      return near(foes, player.pos, delivery.radius).length >= (tough ? 1 : 2) ? target.pos : null;
    case 'projectile':
      if (skill.brand !== null) {
        const fresh: MonsterState | null = nearest(foes.filter((foe: MonsterState): boolean => foe.brand === null), player.pos);
        return fresh === null ? null : fresh.pos;
      }
      return gap <= skill.engageRange ? target.pos : null;
    case 'chain':
      return gap <= skill.engageRange ? target.pos : null;
    case 'beam':
      return gap <= skill.engageRange && near(foes, player.pos, skill.engageRange).length >= 2 ? target.pos : null;
    case 'blink':
      return gap > BALANCE.blinkGap && gap <= delivery.range ? target.pos : null;
    case 'area': {
      if (delivery.anchor === 'caster') return near(foes, player.pos, delivery.radius).length >= (tough ? 1 : BALANCE.crowd) ? player.pos : null;
      const cluster: MonsterState[] = near(foes, target.pos, BALANCE.clump);
      const centre: Vec2 = centroid(cluster);
      if (Math.hypot(centre.x - player.pos.x, centre.z - player.pos.z) > delivery.range) return null;
      return tough || cluster.length >= 2 ? centre : null;
    }
    case 'dash':
    case 'mark':
    case 'field':
    case 'revive':
      return null;
  }
  return null;
}

function pilot(world: World): Command[] {
  const player: PlayerState = world.player;
  const foes: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.alive);
  const target: MonsterState | null = nearest(foes, player.pos);
  if (target === null) return [];
  const commands: Command[] = [];
  if (player.life < player.maxLife * BALANCE.flaskAt) commands.push({ type: 'flask', slot: 0 });
  const action = player.action;
  if (action !== null) {
    const hold = action.skill.press;
    const slot: number | null = action.slot;
    if (hold === null || slot === null) return commands;
    const gap: number = Math.hypot(target.pos.x - player.pos.x, target.pos.z - player.pos.z) - target.radius;
    const mobbed: boolean = near(foes, player.pos, BALANCE.mobReach).length >= BALANCE.mobbed || player.life < player.maxLife * BALANCE.channelLife;
    const done: boolean = hold.type === 'charge' ? chargeOf(action) >= BALANCE.chargeRelease : gap > action.skill.engageRange || mobbed;
    commands.push(done ? { type: 'hold', slot, down: false } : { type: 'steer', aim: target.pos });
    return commands;
  }
  let reserve: number = 0;
  for (const [slot, skill] of player.skills.entries()) {
    if (skill === null || skill.id === 'cleave') continue;
    const wait: number = player.cooldowns[skill.id] ?? 0;
    if (wait > 0 || player.mana - skill.manaCost < reserve) {
      if (wait <= BALANCE.saveFor) reserve = Math.max(reserve, skill.manaCost);
      continue;
    }
    const aim: Vec2 | null = aimFor(player, skill, foes, target);
    if (aim === null) continue;
    if (skill.press !== null) commands.push({ type: 'hold', slot, down: true });
    commands.push({ type: 'skill', slot, aim, targetId: target.id });
    return commands;
  }
  for (const slot of player.held) commands.push({ type: 'hold', slot, down: false });
  commands.push({ type: 'skill', slot: 0, aim: target.pos, targetId: target.id });
  return commands;
}

function ownerOf(skill: SkillDef): string {
  const brander: SkillDef | undefined = [...BALANCE_CONTENT.skills.values()].find((def: SkillDef): boolean => def.brand?.burst === skill.id);
  return brander?.id ?? skill.id;
}

export function clearEncounter(build: Build, encounter: Encounter, level: number, seed: number): Clear {
  const world: World = hero(build, level, seed);
  for (const member of encounter.pack) place(world, member.monster, member.at, member.mods);
  const damage: Map<string, number> = new Map<string, number>();
  let time: number = 0;
  while (time < BALANCE.limit && world.player.alive && world.monsters.some((monster: MonsterState): boolean => monster.alive)) {
    const events: WorldEvent[] = stepWorld(world, pilot(world), BALANCE.dt);
    for (const event of events) {
      if (event.type !== 'damage' || event.sourceId !== world.player.id) continue;
      const owner: string = ownerOf(event.skill);
      damage.set(owner, (damage.get(owner) ?? 0) + event.amount);
    }
    time += BALANCE.dt;
  }
  return { seconds: time, cleared: !world.monsters.some((monster: MonsterState): boolean => monster.alive), alive: world.player.alive, damage };
}
