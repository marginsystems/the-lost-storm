import { loadContent } from '../sim/content/content.ts';
import type { MonsterModDef } from '../sim/content/combat-types.ts';
import type { Content, MonsterDef, SkillDef } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import { nearestWalkable, routedGrid } from '../sim/nav/grid.ts';
import { spawnPacks } from '../sim/world/monsters.ts';
import type { MonsterState, World } from '../sim/world/types.ts';
import { enterZone } from '../sim/world/zones.ts';
import { sceneZone } from './motion-support.ts';
import { SCENE_BASE } from './road-support.ts';
import { armed, must, worldIn } from './support.ts';

export const ARENA_CENTRE: Vec2 = { x: 14, z: 14 };
const ARENA_FIRST_ID: number = 18;

const OPEN: readonly string[] = ['.......', '.......', '.......', '.......', '.......', '.......', '.......'];

const shipped: Content = loadContent();
const claw: SkillDef = must(shipped.skills.get('mended_rhythm'), 'mended_rhythm');
const bolt: SkillDef = must(shipped.skills.get('mender_needle'), 'mender_needle');
const thrall: MonsterDef = must(shipped.monsters.get('mended'), 'mended');

const SKILLS: readonly SkillDef[] = [
  { ...claw, id: 'test_grab', windup: 0.6, root: 1.2, knockback: 0 },
  { ...claw, id: 'test_pounce', cooldown: 2, windup: 0.8, engageRange: 8, delivery: { type: 'nova', radius: 1.4 }, leap: { distance: 9, stopShort: 0.8, airTime: 0.35, lane: false } },
  { ...bolt, id: 'test_mark', cooldown: 3, windup: 0.4, engageRange: 11, delivery: { type: 'mark', range: 12, radius: 2.2, delay: 1.2, count: 1, spacing: 0, step: 0 } },
  { ...bolt, id: 'test_burst', delivery: { type: 'mark', range: 0, radius: 3, delay: 0.8, count: 1, spacing: 0, step: 0 } },
  { ...claw, id: 'test_slam', cooldown: 2.5, windup: 1.2, recovery: 0.9, engageRange: 2, delivery: { type: 'arc', reach: 3, arcDegrees: 90 } },
  { ...claw, id: 'test_heavy', stagger: 0.6 },
  { ...bolt, id: 'test_row', cooldown: 3, windup: 0.4, engageRange: 11, delivery: { type: 'mark', range: 12, radius: 0.8, delay: 1, count: 5, spacing: 1.6, step: 0.12 } },
  { ...claw, id: 'test_turned', cooldown: 4, windup: 0.5, engageRange: 3, delivery: { type: 'arc', reach: 3, arcDegrees: 40 }, echo: 0.6, echoTurn: 90 },
];

const MONSTERS: readonly MonsterDef[] = [
  { ...thrall, id: 'test_shambler', skill: 'test_grab', moveSpeed: 2.6, poise: { knockback: 0.4, stagger: 0.5, resolve: 0 } },
  { ...thrall, id: 'test_ghoul', skill: 'test_pounce', moveSpeed: 7, behaviour: { type: 'stalker', orbitRange: 5 } },
  { ...thrall, id: 'test_counter', skill: 'test_row', behaviour: { type: 'ranged', preferredRange: 9, retreatRange: 4.5, lead: 0 } },
  { ...thrall, id: 'test_turner', skill: 'test_turned' },
  { ...thrall, id: 'test_rower', deathSkill: 'test_row' },
  { ...thrall, id: 'test_caller', skill: 'test_mark', behaviour: { type: 'ranged', preferredRange: 9, retreatRange: 4.5, lead: 0 } },
  { ...thrall, id: 'test_breeder', summon: { monster: null, count: 1, cooldown: 1, limit: 2 } },
  { ...thrall, id: 'test_brute', skill: 'test_slam', life: 400, guard: { arcDegrees: 140, damageTaken: 0.2, breakStagger: 0.45, breakTime: 1.4 } },
];

const MODS: readonly MonsterModDef[] = [
  { id: 'test_swift', prefix: 'Swift', lifeScale: 1.2, damageScale: 1, speedScale: 1.5, sizeScale: 1.05, xpScale: 2, lootScale: 2, color: '#ffffff', deathSkill: null, summon: null, staggerScale: 1, knockbackScale: 1, regen: 0, guard: null, element: null, trail: null, line: '' },
  { id: 'test_volatile', prefix: 'Volatile', lifeScale: 1, damageScale: 1, speedScale: 1, sizeScale: 1, xpScale: 2, lootScale: 2, color: '#ff8040', deathSkill: 'test_burst', summon: null, staggerScale: 1, knockbackScale: 1, regen: 0, guard: null, element: null, trail: null, line: '' },
  { id: 'test_brood', prefix: 'Brood', lifeScale: 2, damageScale: 1, speedScale: 1, sizeScale: 1.2, xpScale: 3, lootScale: 3, color: '#80ff80', deathSkill: null, summon: { monster: null, count: 2, cooldown: 3, limit: 3 }, staggerScale: 1, knockbackScale: 1, regen: 0, guard: null, element: null, trail: null, line: '' },
];

function byId<T extends { readonly id: string }>(base: ReadonlyMap<string, T>, extra: readonly T[]): Map<string, T> {
  return new Map<string, T>([...base, ...extra.map((def: T): [string, T] => [def.id, def])]);
}

export const ARENA_CONTENT: Content = {
  ...shipped,
  skills: byId(shipped.skills, SKILLS),
  monsters: byId(shipped.monsters, MONSTERS),
  monsterMods: byId(shipped.monsterMods, MODS),
};

export function arena(seed: number, content: Content = ARENA_CONTENT): World {
  const world: World = worldIn(content, content.world.town, seed);
  enterZone(world, sceneZone(SCENE_BASE, 'test_arena', { tiles: OPEN, props: [], start: ARENA_CENTRE }), { type: 'start' });
  world.monsters = [];
  world.nextId = ARENA_FIRST_ID;
  return armed(world);
}

export function place(world: World, kind: string, at: Vec2, mods: readonly string[] = []): MonsterState {
  world.zone = { ...world.zone, packs: [{ x: at.x, z: at.z, members: [{ monster: kind, count: 1, mods }], when: [] }] };
  world.spawnedPacks = [];
  world.roused = [];
  spawnPacks(world);
  const monster: MonsterState = must(world.monsters.at(-1), `${kind} spawned`);
  monster.pos = must(nearestWalkable(routedGrid(world.grid), at, 6), 'walkable spawn');
  monster.lastPos = { x: monster.pos.x, z: monster.pos.z };
  monster.spawnTime = 0;
  monster.aggro = true;
  world.events = [];
  return monster;
}
