import type { Fields } from './read.ts';
import { choiceList, ContentError, each, fields, flag, nonNegative, numeric, positive, textList } from './read.ts';
import type { BarrierFace, BarrierRow, ZoneBarrier } from './types.ts';
import { BARRIER_SIDES } from './types.ts';

function barrierFace(value: unknown, where: string): BarrierFace {
  const source: Fields = fields(value, where);
  return { props: textList(source, 'props', where), out: numeric(source, 'out', where), step: positive(source, 'step', where), turn: nonNegative(source, 'turn', where) };
}

function barrierRow(value: unknown, where: string): BarrierRow {
  const source: Fields = fields(value, where);
  const far: BarrierFace = barrierFace(source['far'], `${where}.far`);
  const near: BarrierFace = barrierFace(source['near'], `${where}.near`);
  if (far.props.length === 0 && near.props.length === 0) throw new ContentError(where, 'a barrier row needs props on at least one face');
  return { far, near, collide: flag(source, 'collide', where), shadow: flag(source, 'shadow', where) };
}

export function zoneBarrier(value: unknown, where: string): ZoneBarrier | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const rows: BarrierRow[] = each(source['rows'], `${where}.rows`, barrierRow);
  if (rows.length === 0) throw new ContentError(`${where}.rows`, 'a barrier needs at least one row');
  return { nearSides: choiceList(source, 'nearSides', BARRIER_SIDES, where), exitClear: nonNegative(source, 'exitClear', where), rows };
}
