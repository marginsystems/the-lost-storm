import type { BossAnchor, BossDef, BossPhase, PieceStrikes, SkillDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { PLAYER_SIDE } from '../content/combat-types.ts';
import { provoke } from './factions.ts';
import type { MonsterState, World } from './types.ts';

export const COUNT = {
  lastLine: 1,
  settle: 0.3,
} as const;

function phaseOf(monster: MonsterState): BossPhase | null {
  return monster.def.boss?.phases[monster.phase] ?? null;
}

export function lineOf(boss: BossDef, phase: number): number {
  return boss.phases[phase + 1]?.below ?? 0;
}

export function holdersOf(world: World, monster: MonsterState): MonsterState[] {
  const holds: readonly string[] = phaseOf(monster)?.holds ?? [];
  if (holds.length === 0 || !monster.alive) return [];
  return world.monsters.filter((other: MonsterState): boolean => other.alive && other !== monster && holds.includes(other.def.id));
}

export function keepsPiece(boss: BossDef, pieceId: string): boolean {
  return boss.phases.some((phase: BossPhase): boolean => phase.holds.includes(pieceId) || phase.unseal.includes(pieceId) || phase.anchor?.monster === pieceId);
}

export function rouseKeepers(world: World, piece: MonsterState, sourceId: number, faction: string | null): void {
  if (faction !== null) return;
  for (const boss of world.monsters) {
    const def: BossDef | null = boss.def.boss;
    if (def === null || !boss.alive || !keepsPiece(def, piece.def.id)) continue;
    provoke(world, boss, sourceId, PLAYER_SIDE);
    if (boss.aggro) continue;
    boss.aggro = true;
    boss.returning = false;
    world.events.push({ type: 'aggro', monsterId: boss.id });
  }
}

export function piecesHolding(world: World, monster: MonsterState): MonsterState[] {
  const holds: readonly string[] = phaseOf(monster)?.holds ?? [];
  if (holds.length === 0) return [];
  return world.monsters.filter((other: MonsterState): boolean => other !== monster && holds.includes(other.def.id));
}

export function lifeFloor(world: World, monster: MonsterState): number {
  const boss: BossDef | null = monster.def.boss;
  if (boss === null || holdersOf(world, monster).length === 0) return -Infinity;
  const line: number = lineOf(boss, monster.phase);
  return line <= 0 ? COUNT.lastLine : Math.floor(line * monster.maxLife) + 1;
}

export function heldAtLine(world: World, monster: MonsterState): boolean {
  return monster.alive && monster.life <= lifeFloor(world, monster);
}

export function openScale(world: World, monster: MonsterState): number {
  const broken = monster.def.boss?.countBreak ?? null;
  return broken !== null && world.time < monster.openUntil ? broken.damageTaken : 1;
}

export function strikesOf(monster: MonsterState): PieceStrikes | null {
  return monster.def.behaviour.type === 'fixed' ? monster.def.behaviour.strikes : null;
}

export function strikeWaiting(world: World, monster: MonsterState): boolean {
  return strikesOf(monster) !== null && world.time < monster.strikeReady;
}

export function strike(world: World, monster: MonsterState, amount: number): number {
  const strikes: PieceStrikes | null = strikesOf(monster);
  if (strikes === null) return amount;
  if (amount <= 0 || world.time < monster.strikeReady) return 0;
  monster.strikeReady = world.time + strikes.gap;
  return Math.min(monster.life, Math.ceil(monster.maxLife / strikes.count));
}

export function holdLine(world: World, monster: MonsterState, amount: number): number {
  const floor: number = lifeFloor(world, monster);
  const room: number = Math.max(0, monster.life - floor);
  if (amount <= room) return amount;
  if (!monster.held) {
    monster.held = true;
    world.events.push({ type: 'boss_held', monsterId: monster.id, holders: holdersOf(world, monster).map((holder: MonsterState): number => holder.id) });
  }
  return room;
}

export function breakCount(world: World, fallen: MonsterState): void {
  for (const boss of world.monsters) {
    const def: BossDef | null = boss.def.boss;
    if (def === null || !boss.alive || !(phaseOf(boss)?.holds ?? []).includes(fallen.def.id) || holdersOf(world, boss).length > 0) continue;
    boss.held = false;
    const broken = def.countBreak;
    if (broken !== null) {
      boss.stagger = Math.max(boss.stagger, broken.stagger);
      boss.action = null;
      boss.openUntil = world.time + broken.open;
    }
    world.events.push({ type: 'count_broken', monsterId: boss.id, piece: fallen.id, pos: { x: fallen.pos.x, z: fallen.pos.z } });
  }
}

export function unseal(world: World, boss: BossDef, phase: number): void {
  const opened: readonly string[] = boss.phases[phase]?.unseal ?? [];
  for (const monster of world.monsters) {
    if (!monster.sealed || !opened.includes(monster.def.id)) continue;
    monster.sealed = false;
    world.events.push({ type: 'piece_unsealed', monsterId: monster.id });
  }
}

export function measureSkill(world: World, monster: MonsterState, phase: BossPhase): SkillDef | null {
  const id: string | undefined = phase.measure[monster.measureStep % Math.max(1, phase.measure.length)];
  return id === undefined ? null : (world.content.skills.get(id) ?? null);
}

export function onBeat(world: World, monster: MonsterState): boolean {
  return world.time >= monster.beatAt;
}

export function stepMeasure(world: World, monster: MonsterState): void {
  const phase: BossPhase | null = phaseOf(monster);
  if (phase === null || phase.measure.length === 0) return;
  monster.measureStep = (monster.measureStep + 1) % phase.measure.length;
  monster.beatAt = world.time + phase.beat;
}

export function passOver(world: World, monster: MonsterState): boolean {
  const phase: BossPhase | null = phaseOf(monster);
  if (phase === null || phase.measure.length === 0 || world.time < monster.beatAt + phase.beat) return false;
  stepMeasure(world, monster);
  monster.nextSkill = null;
  return true;
}

export function anchorOf(world: World, monster: MonsterState): { readonly pos: Vec2; readonly radius: number } | null {
  const anchor: BossAnchor | null = phaseOf(monster)?.anchor ?? null;
  if (anchor === null) return null;
  const piece: MonsterState | undefined = world.monsters.find((other: MonsterState): boolean => other.def.id === anchor.monster);
  return piece === undefined ? null : { pos: piece.pos, radius: anchor.radius };
}

export function anchoredGoal(world: World, monster: MonsterState, goal: ReadonlyVec2): Vec2 {
  const anchor = anchorOf(world, monster);
  if (anchor === null) return { x: goal.x, z: goal.z };
  const gap: number = distance(anchor.pos, goal);
  if (gap <= anchor.radius) return { x: goal.x, z: goal.z };
  const share: number = anchor.radius / gap;
  return { x: anchor.pos.x + (goal.x - anchor.pos.x) * share, z: anchor.pos.z + (goal.z - anchor.pos.z) * share };
}
