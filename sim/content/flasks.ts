import type { Fields } from './read.ts';
import { byId, ContentError, choice, each, fields, numeric, positive, text, textList } from './read.ts';

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
  readonly bindings: readonly string[];
  readonly label: string;
}

function flask(value: unknown, where: string): FlaskDef {
  const source: Fields = fields(value, where);
  const maxCharges: number = positive(source, 'maxCharges', where);
  const chargesPerUse: number = positive(source, 'chargesPerUse', where);
  const chargesPerKill: number = numeric(source, 'chargesPerKill', where);
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
    bindings: textList(source, 'bindings', where),
    label: text(source, 'label', where),
  };
}

export function parseFlasks(value: unknown, where: string): FlaskDef[] {
  const list: FlaskDef[] = each(value, where, flask);
  byId(list, where);
  const bound: Map<string, string> = new Map<string, string>();
  for (const def of list) {
    if (def.bindings.length === 0) throw new ContentError(`${where}.${def.id}.bindings`, 'expected at least one key');
    for (const binding of def.bindings) {
      const owner: string | undefined = bound.get(binding);
      if (owner !== undefined) throw new ContentError(`${where}.${def.id}.bindings`, `${binding} is already bound to ${owner}`);
      bound.set(binding, def.id);
    }
  }
  return list;
}
