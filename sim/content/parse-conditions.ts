import type { Fields } from './read.ts';
import { choice, each, fields, flag, text } from './read.ts';
import type { Condition } from './types.ts';
import { OBJECTIVE_STATES, QUEST_STATES } from './types.ts';

export function condition(value: unknown, where: string): Condition {
  const source: Fields = fields(value, where);
  const type: Condition['type'] = choice(source, 'type', ['quest', 'objective', 'flag'] as const, where);
  const not: boolean = source['not'] === undefined ? false : flag(source, 'not', where);
  if (type === 'flag') return { type, flag: text(source, 'flag', where), is: source['is'] === undefined ? null : text(source, 'is', where), not };
  if (type === 'quest') return { type, quest: text(source, 'quest', where), is: choice(source, 'is', QUEST_STATES, where), not };
  return { type, quest: text(source, 'quest', where), objective: text(source, 'objective', where), is: choice(source, 'is', OBJECTIVE_STATES, where), not };
}

export function conditions(source: Fields, key: string, where: string): Condition[] {
  return source[key] === undefined ? [] : each(source[key], `${where}.${key}`, condition);
}
