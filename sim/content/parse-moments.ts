import { conditions } from './parse-conditions.ts';
import { storyFlags } from './parse-story.ts';
import type { Fields } from './read.ts';
import { byId, colour, ContentError, each, fields, flag, nonNegative, nullableText, numeric, positive, text, textList } from './read.ts';
import type { ChestLid, ChestRules, EchoLook, EchoPose, MomentChest, MomentDef, MomentEcho, MomentField, MomentLibrary, MomentProp, MomentReward, StrikeArea, StrikeClearance, StrikeBearing, StrikeInterval, StrikeNear, WeightedMoment } from './moment-types.ts';

function chance(source: Fields, key: string, where: string): number {
  const value: number = numeric(source, key, where);
  if (value < 0 || value > 1) throw new ContentError(`${where}.${key}`, 'expected a chance from 0 to 1');
  return value;
}

function whole(source: Fields, key: string, min: number, where: string): number {
  const value: number = numeric(source, key, where);
  if (!Number.isInteger(value) || value < min) throw new ContentError(`${where}.${key}`, `expected a whole number of at least ${min}`);
  return value;
}

function momentProp(value: unknown, where: string): MomentProp {
  const source: Fields = fields(value, where);
  return { prop: text(source, 'prop', where), x: numeric(source, 'x', where), z: numeric(source, 'z', where), rotationDegrees: numeric(source, 'rotationDegrees', where), blocks: source['blocks'] === undefined ? false : flag(source, 'blocks', where) };
}

function pose(value: unknown, where: string): EchoPose {
  const source: Fields = fields(value, where);
  return { clip: text(source, 'clip', where), at: chance(source, 'at', where) };
}

function look(value: unknown, where: string): EchoLook | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { rig: text(source, 'rig', where), scale: positive(source, 'scale', where), gear: textList(source, 'gear', where), wear: textList(source, 'wear', where) };
}

function echo(value: unknown, where: string): MomentEcho {
  const source: Fields = fields(value, where);
  return {
    monster: text(source, 'monster', where),
    x: numeric(source, 'x', where),
    z: numeric(source, 'z', where),
    facingDegrees: numeric(source, 'facingDegrees', where),
    pose: pose(source['pose'], `${where}.pose`),
    turns: flag(source, 'turns', where),
    look: look(source['look'], `${where}.look`),
  };
}

function reward(value: unknown, where: string): MomentReward {
  const source: Fields = fields(value, where);
  const goldMin: number = nonNegative(source, 'goldMin', where);
  const goldMax: number = nonNegative(source, 'goldMax', where);
  if (goldMax < goldMin) throw new ContentError(`${where}.goldMax`, 'goldMax is below goldMin');
  return { goldMin, goldMax, items: whole(source, 'items', 0, where), itemChance: chance(source, 'itemChance', where), rarity: nullableText(source, 'rarity', where) };
}

function chest(value: unknown, radius: number, where: string): MomentChest | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const x: number = numeric(source, 'x', where);
  const z: number = numeric(source, 'z', where);
  if (Math.hypot(x, z) >= radius) throw new ContentError(where, 'a chest stands inside its bubble');
  const goldMin: number = nonNegative(source, 'goldMin', where);
  const goldMax: number = nonNegative(source, 'goldMax', where);
  if (goldMax < goldMin) throw new ContentError(`${where}.goldMax`, 'goldMax is below goldMin');
  return { x, z, rotationDegrees: numeric(source, 'rotationDegrees', where), goldMin, goldMax };
}

function lid(value: unknown, where: string): ChestLid {
  const source: Fields = fields(value, where);
  return { seam: positive(source, 'seam', where), hinge: numeric(source, 'hinge', where), degrees: positive(source, 'degrees', where) };
}

function chestRules(value: unknown, where: string): ChestRules {
  const source: Fields = fields(value, where);
  return { prop: text(source, 'prop', where), reach: positive(source, 'reach', where), open: positive(source, 'open', where), linger: positive(source, 'linger', where), lid: lid(source['lid'], `${where}.lid`) };
}

function moment(value: unknown, where: string): MomentDef {
  const source: Fields = fields(value, where);
  const radius: number = positive(source, 'radius', where);
  const echoes: MomentEcho[] = each(source['echoes'], `${where}.echoes`, echo);
  echoes.forEach((entry: MomentEcho, index: number): void => {
    if (Math.hypot(entry.x, entry.z) >= radius) throw new ContentError(`${where}.echoes[${index}]`, 'an echo stands inside its bubble');
  });
  const turnChance: number = chance(source, 'turnChance', where);
  if (turnChance > 0 && !echoes.some((entry: MomentEcho): boolean => entry.turns)) throw new ContentError(`${where}.turnChance`, 'a moment with a turn chance needs an echo that turns');
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    tint: text(source, 'tint', where),
    ground: text(source, 'ground', where),
    light: colour(source, 'light', where),
    bright: flag(source, 'bright', where),
    radius,
    lifetime: positive(source, 'lifetime', where),
    awake: positive(source, 'awake', where),
    turnChance,
    props: each(source['props'], `${where}.props`, momentProp),
    echoes,
    reward: reward(source['reward'], `${where}.reward`),
    chest: chest(source['chest'], radius, `${where}.chest`),
  };
}

export function momentLibrary(value: unknown, where: string): MomentLibrary {
  const source: Fields = fields(value, where);
  return {
    faction: text(source, 'faction', where),
    hostileTint: text(source, 'hostileTint', where),
    telegraph: positive(source, 'telegraph', where),
    fade: positive(source, 'fade', where),
    cleared: storyFlags(source['cleared'], `${where}.cleared`),
    playedShare: chance(source, 'playedShare', where),
    rouse: source['rouse'] === undefined ? 0 : nonNegative(source, 'rouse', where),
    comeback: source['comeback'] === undefined ? 0 : nonNegative(source, 'comeback', where),
    echoKnockback: source['echoKnockback'] === undefined ? 1 : chance(source, 'echoKnockback', where),
    stagger: source['stagger'] === undefined ? 0 : nonNegative(source, 'stagger', where),
    chest: chestRules(source['chest'], `${where}.chest`),
    defs: byId(each(source['moments'], `${where}.moments`, moment), `${where}.moments`),
  };
}

function area(value: unknown, where: string): StrikeArea {
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), z: numeric(source, 'z', where), radius: positive(source, 'radius', where) };
}

function clearance(value: unknown, where: string): StrikeClearance {
  const source: Fields = fields(value, where);
  return { hero: nonNegative(source, 'hero', where), exits: nonNegative(source, 'exits', where), between: nonNegative(source, 'between', where), safe: source['safe'] === undefined ? 0 : nonNegative(source, 'safe', where), packs: source['packs'] === undefined ? 0 : nonNegative(source, 'packs', where) };
}

function interval(value: unknown, where: string): StrikeInterval {
  const source: Fields = fields(value, where);
  const min: number = positive(source, 'min', where);
  const max: number = positive(source, 'max', where);
  if (max < min) throw new ContentError(`${where}.max`, 'max is below min');
  return { min, max };
}

function bearing(value: unknown, where: string): StrikeBearing {
  const source: Fields = fields(value, where);
  const x: number = numeric(source, 'x', where);
  const z: number = numeric(source, 'z', where);
  if (Math.hypot(x, z) === 0) throw new ContentError(where, 'bearing has no direction');
  return { x, z, spreadDegrees: nonNegative(source, 'spreadDegrees', where) };
}

function near(value: unknown, where: string): StrikeNear {
  const source: Fields = fields(value, where);
  return { ...interval(value, where), bearing: source['bearing'] === undefined ? null : bearing(source['bearing'], `${where}.bearing`) };
}

function weighted(value: unknown, where: string): WeightedMoment {
  const source: Fields = fields(value, where);
  return { moment: text(source, 'moment', where), weight: positive(source, 'weight', where) };
}

export function momentField(value: unknown, where: string): MomentField | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const max: number = whole(source, 'max', 1, where);
  const start: number = whole(source, 'start', 0, where);
  if (start > max) throw new ContentError(`${where}.start`, 'a field cannot start with more moments than its max');
  const areas: StrikeArea[] = each(source['areas'], `${where}.areas`, area);
  if (areas.length === 0) throw new ContentError(`${where}.areas`, 'a field needs at least one area');
  const table: WeightedMoment[] = each(source['table'], `${where}.table`, weighted);
  if (table.length === 0) throw new ContentError(`${where}.table`, 'a field needs at least one moment');
  return { combat: flag(source, 'combat', where), areas, clearance: clearance(source['clearance'], `${where}.clearance`), interval: interval(source['interval'], `${where}.interval`), start, max, table, sure: conditions(source, 'sure', where), first: source['first'] === undefined ? [] : each(source['first'], `${where}.first`, weighted), grace: source['grace'] === undefined ? 0 : nonNegative(source, 'grace', where), avoid: source['avoid'] === undefined ? [] : each(source['avoid'], `${where}.avoid`, area), near: source['near'] === undefined ? null : near(source['near'], `${where}.near`) };
}
