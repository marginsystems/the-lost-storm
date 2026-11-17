import type { FactionDef, Regard } from '../content/combat-types.ts';
import { PLAYER_SIDE } from '../content/combat-types.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import type { Actor, MonsterState, World } from './types.ts';
import { wardStops } from './wards.ts';

export interface Side {
  readonly sourceId: number;
  readonly faction: string | null;
  readonly from?: Vec2;
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

function grudge(world: World, sourceId: number, target: Actor, source: MonsterState | null): boolean {
  if (source !== null) return source.foeId === target.id;
  for (const monster of world.monsters) if (monster.id === sourceId) return monster.foeId === target.id;
  return false;
}

export function mayStrike(world: World, side: Side, target: Actor, source: MonsterState | null = null): boolean {
  if (!target.alive || target.id === side.sourceId || (target.kind === 'monster' && target.sealed) || wardStops(world, side, target)) return false;
  const from: string = side.faction ?? PLAYER_SIDE;
  const toward: string = sideOf(target);
  if (from === toward) return false;
  return regardOf(world.content, from, toward) === 'hostile' || grudge(world, side.sourceId, target, source);
}

export function playerMayStrike(world: World, monster: MonsterState): boolean {
  return mayStrike(world, { sourceId: world.player.id, faction: null }, monster);
}

export function provoke(world: World, target: MonsterState, sourceId: number, source: string): void {
  if (sourceId === target.id) return;
  const regard: Regard = regardOf(world.content, target.def.faction, source);
  if (regard === 'hostile' || regard === 'wary') target.foeId = sourceId;
}
