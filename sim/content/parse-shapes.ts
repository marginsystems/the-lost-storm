import { conditions } from './parse-conditions.ts';
import type { Fields } from './read.ts';
import { choice, ContentError, fields, fraction, nonNegative, positive, text, textList } from './read.ts';
import type { BeamDelivery, BlinkDelivery, BrandDef, ChainDelivery, AreaDelivery, PressDef, SkillOffer, SkillUnlock } from './shape-types.ts';
import { AREA_ANCHORS } from './shape-types.ts';
import type { Content, SkillBinding, SkillDef } from './types.ts';

export const SHAPE_LIMITS = {
  shortestPulse: 0.1,
  shortestInterval: 0.05,
} as const;

export const SHAPE_TYPES = ['chain', 'area', 'blink', 'beam'] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];
export type ShapeDelivery = ChainDelivery | AreaDelivery | BlinkDelivery | BeamDelivery;

function whole(source: Fields, key: string, where: string): number {
  const value: number = nonNegative(source, key, where);
  if (!Number.isInteger(value)) throw new ContentError(`${where}.${key}`, 'expected a whole number');
  return value;
}

function area(source: Fields, where: string): AreaDelivery {
  const duration: number = positive(source, 'duration', where);
  const pulse: number = nonNegative(source, 'pulse', where);
  if (pulse > duration) throw new ContentError(`${where}.pulse`, `expected at most the duration ${duration}`);
  if (pulse > 0 && pulse < SHAPE_LIMITS.shortestPulse) throw new ContentError(`${where}.pulse`, `expected 0 or at least ${SHAPE_LIMITS.shortestPulse} seconds`);
  return {
    type: 'area',
    range: nonNegative(source, 'range', where),
    radius: positive(source, 'radius', where),
    duration,
    pulse,
    pull: nonNegative(source, 'pull', where),
    slow: fraction(source, 'slow', where),
    anchor: choice(source, 'anchor', AREA_ANCHORS, where),
  };
}

export function shapeDelivery(type: ShapeType, source: Fields, where: string): ShapeDelivery {
  switch (type) {
    case 'chain':
      return { type, range: positive(source, 'range', where), jumps: whole(source, 'jumps', where), jumpRange: positive(source, 'jumpRange', where), falloff: fraction(source, 'falloff', where) };
    case 'area':
      return area(source, where);
    case 'blink':
      return { type, range: positive(source, 'range', where), radius: nonNegative(source, 'radius', where) };
    case 'beam':
      return { type, range: positive(source, 'range', where), width: positive(source, 'width', where) };
  }
  throw new ContentError(`${where}.type`, 'unknown delivery shape');
}

function press(value: unknown, where: string): PressDef | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const type: PressDef['type'] = choice(source, 'type', ['charge', 'channel'] as const, where);
  if (type === 'channel') {
    const interval: number = positive(source, 'interval', where);
    if (interval < SHAPE_LIMITS.shortestInterval) throw new ContentError(`${where}.interval`, `expected at least ${SHAPE_LIMITS.shortestInterval} seconds`);
    return { type, interval, max: positive(source, 'max', where) };
  }
  return { type, max: positive(source, 'max', where), damageScale: positive(source, 'damageScale', where), areaScale: positive(source, 'areaScale', where) };
}

function brand(value: unknown, where: string): BrandDef | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { duration: positive(source, 'duration', where), burst: text(source, 'burst', where) };
}

export interface SkillPress {
  readonly press: PressDef | null;
  readonly brand: BrandDef | null;
}

export function skillPress(source: Fields, where: string): SkillPress {
  return { press: press(source['press'], `${where}.press`), brand: brand(source['brand'], `${where}.brand`) };
}

export function shapeProblems(content: Content): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(problem);
  };
  for (const used of content.skills.values()) {
    if (used.press !== null) need(used.leap === null && used.delivery.type !== 'dash' && used.delivery.type !== 'blink', `skill ${used.id} moves the caster, so it cannot be held`);
    if (used.press?.type === 'channel') need(used.combo === null && used.leap === null, `skill ${used.id} is channelled, so it cannot combo or leap`);
    if (used.brand === null) continue;
    const burst: SkillDef | undefined = content.skills.get(used.brand.burst);
    need(burst !== undefined, `skill ${used.id} brands with unknown burst skill ${used.brand.burst}`);
    if (burst !== undefined) need(burst.delivery.type === 'nova' && burst.brand === null, `skill ${used.id} brands with ${burst.id}, which must be a nova that brands nothing itself`);
  }
  return problems;
}

export function skillUnlock(value: unknown, where: string): SkillUnlock {
  const source: Fields = fields(value, where);
  const level: number = positive(source, 'level', where);
  if (!Number.isInteger(level)) throw new ContentError(`${where}.level`, 'expected a whole level');
  return { skill: text(source, 'skill', where), level, when: conditions(source, 'when', where) };
}

export const OFFER_LIMITS = {
  fewest: 2,
  most: 3,
} as const;

export function skillOffer(value: unknown, where: string): SkillOffer {
  const source: Fields = fields(value, where);
  const level: number = positive(source, 'level', where);
  if (!Number.isInteger(level)) throw new ContentError(`${where}.level`, 'expected a whole level');
  const count: number = positive(source, 'count', where);
  if (!Number.isInteger(count) || count < OFFER_LIMITS.fewest || count > OFFER_LIMITS.most) throw new ContentError(`${where}.count`, `expected ${OFFER_LIMITS.fewest} to ${OFFER_LIMITS.most}`);
  return { id: text(source, 'id', where), level, when: conditions(source, 'when', where), choices: textList(source, 'choices', where), count };
}

export function bookProblems(content: Content): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(problem);
  };
  const book: ReadonlyMap<string, number> = new Map<string, number>(content.player.skillBook.map((entry: SkillUnlock): [string, number] => [entry.skill, entry.level]));
  need(book.size === content.player.skillBook.length, 'skill book lists a skill twice');
  const slotted: string[] = content.player.skillBar.flatMap((binding: SkillBinding): string[] => (binding.skill === null ? [] : [binding.skill]));
  need(new Set<string>(slotted).size === slotted.length, 'skill bar starts with a skill in two slots');
  for (const skill of slotted) need(book.has(skill), `skill bar keeps a home slot for ${skill}, which is not in the skill book`);
  need(content.player.skillBook.some((entry: SkillUnlock): boolean => entry.level === 1 && entry.when.length === 0), 'skill book teaches nothing at the start');
  const offerIds: Set<string> = new Set<string>();
  for (const offer of content.player.skillOffers) {
    need(!offerIds.has(offer.id), `skill offer ${offer.id} is listed twice`);
    offerIds.add(offer.id);
    need(offer.choices.length >= offer.count, `skill offer ${offer.id} offers fewer skills than it shows`);
    need(new Set<string>(offer.choices).size === offer.choices.length, `skill offer ${offer.id} lists a skill twice`);
    for (const skill of offer.choices) {
      need(content.skills.has(skill), `skill offer ${offer.id} offers unknown skill ${skill}`);
      need(!book.has(skill), `skill offer ${offer.id} offers ${skill}, which the skill book already grants`);
    }
  }
  return problems;
}
