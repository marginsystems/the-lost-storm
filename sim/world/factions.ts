import type { FactionDef, Regard } from '../content/combat-types.ts';
import { PLAYER_SIDE } from '../content/combat-types.ts';
import type { Content } from '../content/types.ts';
import type { Actor, MonsterState, World } from './types.ts';

export interface Side {
  readonly sourceId: number;
  readonly faction: string | null;
}

export function sideOf(actor: Actor): string {
  return actor.kind === 'player' ? PLAYER_SIDE : actor.def.faction;
}

export function regardOf(content: Content, from: string, toward: string): Regard {
  if (from === toward) return 'friendly';
  const people: FactionDef | undefined = content.factions.get(from);
  if (people !== undefined) return people.regards[toward] ?? 'neutral';
  if (from !== PLAYER_SIDE) return 'neutral';
  const other: Regard = content.factions.get(toward)?.regards[PLAYER_SIDE] ?? 'neutral';
  return other === 'hostile' || other === 'wary' ? 'hostile' : 'neutral';
}

function grudge(world: World, sourceId: number, target: Actor): boolean {
  const source: MonsterState | undefined = world.monsters.find((monster: MonsterState): boolean => monster.id === sourceId);
  return source !== undefined && source.foeId === target.id;
}

export function mayStrike(world: World, side: Side, target: Actor): boolean {
  if (!target.alive || target.id === side.sourceId) return false;
  const from: string = side.faction ?? PLAYER_SIDE;
  const toward: string = sideOf(target);
  if (from === toward) return false;
  return regardOf(world.content, from, toward) === 'hostile' || grudge(world, side.sourceId, target);
}

export function playerMayStrike(world: World, monster: MonsterState): boolean {
  return mayStrike(world, { sourceId: world.player.id, faction: null }, monster);
}

export function provoke(world: World, target: MonsterState, sourceId: number, source: string): void {
  if (sourceId === target.id) return;
  const regard: Regard = regardOf(world.content, target.def.faction, source);
  if (regard === 'hostile' || regard === 'wary') target.foeId = sourceId;
}
