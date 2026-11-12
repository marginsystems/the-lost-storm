import type { Fields } from './read.ts';
import { byId, ContentError, choice, each, fields, numeric, positive, text } from './read.ts';

export const FLASK_RESOURCES = ['life', 'mana'] as const;
export type FlaskResource = (typeof FLASK_RESOURCES)[number];

export interface FlaskDef {
  readonly id: string;
  readonly name: string;
  readonly resource: FlaskResource;
  readonly amount: number;
  readonly duration: number;
  readonly cooldown: number;
  readonly maxCharges: number;
  readonly chargesPerUse: number;
  readonly chargesPerKill: number;
}

function flask(value: unknown, where: string): FlaskDef {
  const source: Fields = fields(value, where);
  const maxCharges: number = positive(source, 'maxCharges', where);
  const chargesPerUse: number = positive(source, 'chargesPerUse', where);
  const chargesPerKill: number = numeric(source, 'chargesPerKill', where);
  for (const [key, charges] of Object.entries({ maxCharges, chargesPerUse, chargesPerKill })) {
    if (!Number.isInteger(charges)) throw new ContentError(`${where}.${key}`, 'expected a whole number');
  }
  const cooldown: number = numeric(source, 'cooldown', where);
  if (chargesPerUse > maxCharges) throw new ContentError(`${where}.chargesPerUse`, 'expected at most maxCharges');
  if (chargesPerKill < 0) throw new ContentError(`${where}.chargesPerKill`, 'expected zero or more');
  if (cooldown < 0) throw new ContentError(`${where}.cooldown`, 'expected zero or more');
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    resource: choice(source, 'resource', FLASK_RESOURCES, where),
    amount: positive(source, 'amount', where),
    duration: positive(source, 'duration', where),
    cooldown,
    maxCharges,
    chargesPerUse,
    chargesPerKill,
  };
}

export function parseFlasks(value: unknown, where: string): FlaskDef[] {
  const list: FlaskDef[] = each(value, where, flask);
  byId(list, where);
  return list;
}
