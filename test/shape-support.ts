import type { Content, SkillDef } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { stepWorld } from '../sim/world/step.ts';
import type { Command, MonsterState, World, WorldEvent } from '../sim/world/types.ts';
import { arena, ARENA_CENTRE, ARENA_CONTENT, place } from './arena-support.ts';
import { must } from './support.ts';

export const SHAPE_DT: number = 1 / 60;

const strike: SkillDef = must(ARENA_CONTENT.skills.get('cleave'), 'cleave');
const plain: SkillDef = { ...strike, manaCost: 0, cooldown: 0, windup: 0.1, recovery: 0.1, scalesWithAttackSpeed: false, combo: null, knockback: 0, stagger: 0, damage: { weaponPercent: 0, flatMin: 10, flatMax: 10 } };

export const SHAPE_SKILLS: readonly SkillDef[] = [
  { ...plain, id: 'test_fork', delivery: { type: 'chain', range: 10, jumps: 2, jumpRange: 5, falloff: 0.5 } },
  { ...plain, id: 'test_squall', delivery: { type: 'area', range: 10, radius: 3, duration: 1, pulse: 0.25, pull: 0, slow: 1, anchor: 'ground' } },
  { ...plain, id: 'test_draught', delivery: { type: 'area', range: 10, radius: 6, duration: 0.5, pulse: 0.5, pull: 12, slow: 1, anchor: 'ground' } },
  { ...plain, id: 'test_hush', delivery: { type: 'area', range: 0, radius: 8, duration: 2, pulse: 0, pull: 0, slow: 0.25, anchor: 'caster' } },
  { ...plain, id: 'test_step', delivery: { type: 'blink', range: 6, radius: 2 } },
  { ...plain, id: 'test_wire', manaCost: 2, delivery: { type: 'beam', range: 10, width: 1 }, press: { type: 'channel', interval: 0.2, max: 2 } },
  { ...plain, id: 'test_heave', delivery: { type: 'arc', reach: 3, arcDegrees: 120 }, press: { type: 'charge', max: 1, damageScale: 3, areaScale: 1.5 } },
  { ...plain, id: 'test_brander', delivery: { type: 'arc', reach: 3, arcDegrees: 120 }, brand: { duration: 5, burst: 'test_brand_burst' } },
  { ...plain, id: 'test_brand_burst', delivery: { type: 'nova', radius: 3 }, damage: { weaponPercent: 0, flatMin: 50, flatMax: 50 } },
];

export const SHAPE_CONTENT: Content = { ...ARENA_CONTENT, skills: new Map<string, SkillDef>([...ARENA_CONTENT.skills, ...SHAPE_SKILLS.map((def: SkillDef): [string, SkillDef] => [def.id, def])]) };

export function shapeSkill(id: string): SkillDef {
  return must(SHAPE_CONTENT.skills.get(id), id);
}

export function shapeArena(ids: readonly string[]): World {
  const world: World = arena(7, SHAPE_CONTENT);
  world.player.skills = ids.map(shapeSkill);
  world.player.mana = world.player.stats.maxMana;
  world.player.stats = { ...world.player.stats, critChance: 0 };
  return world;
}

export function dummy(world: World, at: Vec2): MonsterState {
  const monster: MonsterState = place(world, 'test_shambler', at);
  monster.life = 10000;
  monster.maxLife = 10000;
  monster.aggro = false;
  monster.cooldowns['test_grab'] = 1000;
  return monster;
}

export function offset(x: number, z: number): Vec2 {
  return { x: ARENA_CENTRE.x + x, z: ARENA_CENTRE.z + z };
}

export function cast(world: World, slot: number, aim: Vec2): WorldEvent[] {
  return stepWorld(world, [{ type: 'skill', slot, aim, targetId: null }], SHAPE_DT);
}

export function run(world: World, seconds: number, commands: readonly Command[] = []): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(seconds / SHAPE_DT); step += 1) events.push(...stepWorld(world, step === 0 ? commands : [], SHAPE_DT));
  return events;
}

export function damageTo(events: readonly WorldEvent[], targetId: number): number[] {
  return events.flatMap((event: WorldEvent): number[] => (event.type === 'damage' && event.targetId === targetId ? [event.amount] : []));
}
