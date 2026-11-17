import type { Fields } from './read.ts';
import { ContentError, colour, each, fields, flag, fraction, numeric, positive, text, textList } from './read.ts';
import type { BossAnchor, BossDef, BossFirstKill, BossPhase, BossPresence, BossSkill, CountBreak, PieceStrikes } from './boss-types.ts';

function bossSkill(value: unknown, where: string): BossSkill {
  const source: Fields = fields(value, where);
  return { skill: text(source, 'skill', where), weight: positive(source, 'weight', where) };
}

function anchor(value: unknown, where: string): BossAnchor | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { monster: text(source, 'monster', where), radius: positive(source, 'radius', where) };
}

function list(source: Fields, key: string, where: string): readonly string[] {
  return source[key] === undefined ? [] : textList(source, key, where);
}

function bossPhase(value: unknown, where: string): BossPhase {
  const source: Fields = fields(value, where);
  const skills: BossSkill[] = source['skills'] === undefined ? [] : each(source['skills'], `${where}.skills`, bossSkill);
  const measure: readonly string[] = list(source, 'measure', where);
  if (skills.length === 0 && measure.length === 0) throw new ContentError(`${where}.skills`, 'a phase needs at least one skill or a measure');
  const beat: number = source['beat'] === undefined ? 0 : numeric(source, 'beat', where);
  if (beat < 0) throw new ContentError(`${where}.beat`, 'expected zero or more');
  return {
    below: fraction(source, 'below', where),
    skills,
    barks: textList(source, 'barks', where),
    measure,
    beat,
    holds: list(source, 'holds', where),
    unseal: list(source, 'unseal', where),
    anchor: anchor(source['anchor'], `${where}.anchor`),
  };
}

function bossDrop(source: Fields, where: string): BossDef['drop'] {
  const items: number = numeric(source, 'items', where);
  const goldMin: number = numeric(source, 'goldMin', where);
  const goldMax: number = numeric(source, 'goldMax', where);
  if (!Number.isInteger(items) || items < 0) throw new ContentError(`${where}.items`, 'expected a whole number, zero or more');
  if (goldMin < 0) throw new ContentError(`${where}.goldMin`, 'expected zero or more');
  if (goldMax < goldMin) throw new ContentError(`${where}.goldMax`, 'expected at least goldMin');
  return { items, floor: text(source, 'floor', where), goldMin, goldMax };
}

function firstKill(value: unknown, where: string): BossFirstKill | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const goldMin: number = numeric(source, 'goldMin', where);
  const goldMax: number = numeric(source, 'goldMax', where);
  if (goldMin < 0) throw new ContentError(`${where}.goldMin`, 'expected zero or more');
  if (goldMax < goldMin) throw new ContentError(`${where}.goldMax`, 'expected at least goldMin');
  return { flag: text(source, 'flag', where), xpShare: fraction(source, 'xpShare', where), goldMin, goldMax };
}

export function pieceStrikes(value: unknown, where: string): PieceStrikes {
  const source: Fields = fields(value, where);
  const count: number = numeric(source, 'count', where);
  if (!Number.isInteger(count) || count < 1) throw new ContentError(`${where}.count`, 'expected a whole number, one or more');
  return { count, gap: positive(source, 'gap', where) };
}

function countBreak(value: unknown, where: string): CountBreak | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { stagger: positive(source, 'stagger', where), open: positive(source, 'open', where), damageTaken: positive(source, 'damageTaken', where) };
}

export function bossPresence(value: unknown, where: string): BossPresence | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const glow: number = positive(source, 'glow', where);
  if (glow > 1) throw new ContentError(`${where}.glow`, 'expected a number above 0, at most 1');
  return { color: colour(source, 'color', where), radius: positive(source, 'radius', where), glow };
}

export function boss(value: unknown, where: string): BossDef | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const poise: Fields = fields(source['poise'], `${where}.poise`);
  const drop: Fields = fields(source['drop'], `${where}.drop`);
  const barks: Fields = fields(source['barks'], `${where}.barks`);
  const phases: BossPhase[] = each(source['phases'], `${where}.phases`, bossPhase);
  if (phases[0]?.below !== 1) throw new ContentError(`${where}.phases`, 'the first phase must start at full life (below: 1)');
  if (phases.some((phase: BossPhase, index: number): boolean => index > 0 && phase.below >= (phases[index - 1]?.below ?? 0))) throw new ContentError(`${where}.phases`, 'each phase must begin at a lower life fraction than the one before');
  const knockback: number = numeric(poise, 'knockback', `${where}.poise`);
  if (knockback < 0 || knockback > 1) throw new ContentError(`${where}.poise.knockback`, 'expected a number from 0 to 1');
  return {
    title: text(source, 'title', where),
    phases,
    poise: { knockback },
    drop: bossDrop(drop, `${where}.drop`),
    firstKill: firstKill(source['firstKill'], `${where}.firstKill`),
    barks: { aggro: textList(barks, 'aggro', `${where}.barks`), death: textList(barks, 'death', `${where}.barks`) },
    countBreak: countBreak(source['countBreak'], `${where}.countBreak`),
    yields: source['yields'] === undefined ? false : flag(source, 'yields', where),
    presence: bossPresence(source['presence'], `${where}.presence`),
  };
}
