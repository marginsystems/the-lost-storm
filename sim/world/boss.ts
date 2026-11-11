import type { BossDef, BossPhase, BossSkill, LineDef, SkillDef } from '../content/types.ts';
import { generateItem } from '../items.ts';
import { dropOnGround } from './ground.ts';
import type { ItemInstance, MonsterState, World, WorldEvent } from './types.ts';

export function phaseAt(boss: BossDef, lifeFraction: number): number {
  let phase: number = 0;
  boss.phases.forEach((entry: BossPhase, index: number): void => {
    if (lifeFraction <= entry.below) phase = index;
  });
  return phase;
}

export function lifePhase(monster: MonsterState, boss: BossDef): number {
  return Math.max(monster.phase, phaseAt(boss, Math.max(0, monster.life) / monster.maxLife));
}

export function pickBossSkill(world: World, monster: MonsterState, boss: BossDef): SkillDef | null {
  const options: readonly BossSkill[] = boss.phases[lifePhase(monster, boss)]?.skills ?? [];
  const usable: BossSkill[] = options.filter((option: BossSkill): boolean => world.content.skills.has(option.skill) && (monster.cooldowns[option.skill] ?? 0) <= 0);
  if (usable.length === 0) {
    let soonest: BossSkill | null = null;
    for (const option of options) {
      if (soonest === null || (monster.cooldowns[option.skill] ?? 0) < (monster.cooldowns[soonest.skill] ?? 0)) soonest = option;
    }
    return soonest === null ? null : (world.content.skills.get(soonest.skill) ?? null);
  }
  const total: number = usable.reduce((sum: number, option: BossSkill): number => sum + option.weight, 0);
  let roll: number = world.rng.next() * total;
  for (const option of usable) {
    roll -= option.weight;
    if (roll < 0) return world.content.skills.get(option.skill) ?? null;
  }
  return world.content.skills.get(usable.at(-1)?.skill ?? '') ?? null;
}

export function bark(world: World, lineIds: readonly string[]): void {
  for (const lineId of lineIds) {
    const line: LineDef | undefined = world.content.lines.get(lineId);
    if (line !== undefined) world.events.push({ type: 'bark', speaker: line.speaker, line });
  }
}

function reward(world: World, monster: MonsterState, boss: BossDef): void {
  for (let dropped: number = 0; dropped < boss.drop.items; dropped += 1) {
    const item: ItemInstance | null = generateItem(world.content, world.rng, world.nextItemUid, Math.max(monster.level, world.player.level), null, boss.drop.rarity);
    if (item === null) continue;
    world.nextItemUid += 1;
    dropOnGround(world, monster.pos, { kind: 'item', item });
  }
  if (boss.drop.goldMax > 0) dropOnGround(world, monster.pos, { kind: 'gold', amount: Math.max(1, Math.round(world.rng.int(boss.drop.goldMin, boss.drop.goldMax) * (1 + world.player.stats.goldFind))) });
}

function bossOf(world: World, monsterId: number): MonsterState | null {
  const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.id === monsterId);
  return monster === undefined || monster.def.boss === null ? null : monster;
}

function onAggro(world: World, monsterId: number): void {
  const monster: MonsterState | null = bossOf(world, monsterId);
  const boss: BossDef | null = monster?.def.boss ?? null;
  if (monster !== null && boss !== null) bark(world, boss.barks.aggro);
}

function onHurt(world: World, monsterId: number): void {
  const monster: MonsterState | null = bossOf(world, monsterId);
  const boss: BossDef | null = monster?.def.boss ?? null;
  if (monster === null || boss === null) return;
  const phase: number = lifePhase(monster, boss);
  if (phase <= monster.phase) return;
  for (let entered: number = monster.phase + 1; entered <= phase; entered += 1) {
    world.events.push({ type: 'boss_phase', monsterId: monster.id, phase: entered });
    bark(world, boss.phases[entered]?.barks ?? []);
  }
  monster.phase = phase;
  monster.nextSkill = null;
}

function onDeath(world: World, monsterId: number): void {
  const monster: MonsterState | null = bossOf(world, monsterId);
  const boss: BossDef | null = monster?.def.boss ?? null;
  if (monster === null || boss === null) return;
  reward(world, monster, boss);
  bark(world, boss.barks.death);
}

export function stepBosses(world: World): void {
  const events: readonly WorldEvent[] = [...world.events];
  for (const event of events) {
    if (event.type === 'aggro') onAggro(world, event.monsterId);
    else if (event.type === 'damage' && event.targetTeam === 'monster') onHurt(world, event.targetId);
    else if (event.type === 'death' && event.team === 'monster') onDeath(world, event.actorId);
  }
}
