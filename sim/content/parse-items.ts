import type { Fields } from './read.ts';
import { ContentError, choice, choiceList, each, fields, flag, nonNegative, nullableText, numeric, positive, text, textList } from './read.ts';
import { skillMod, statMod } from './parse-mods.ts';
import { powerTrigger } from './parse-powers.ts';
import type { SkillVariant } from './chart-types.ts';
import type { ItemUse } from './item-types.ts';
import type { AffixDef, DropLean, FamilyDef, GroundLook, ItemBaseDef, ItemSlot, PowerDef, RarityDef, WeaponKind } from './types.ts';
import { ARMOUR_MATERIALS, GROUND_KEEPS, GROUND_MODELS, ITEM_SLOTS, ITEM_STATS, MOD_OPS, RARITY_MARKERS, WEAPON_KINDS } from './types.ts';

function genericLook(slot: ItemSlot | null): GroundLook {
  return { model: slot === 'charm' ? 'pouch' : 'bundle', keep: 'all', scale: 1, flatten: 1, pitch: 0, roll: 0, yawJitter: 180 };
}

export function rarity(value: unknown, where: string): RarityDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    color: text(source, 'color', where),
    marker: source['marker'] === undefined ? 'none' : choice(source, 'marker', RARITY_MARKERS, where),
    weight: numeric(source, 'weight', where),
    affixMin: numeric(source, 'affixMin', where),
    affixMax: numeric(source, 'affixMax', where),
    powers: source['powers'] === undefined ? false : flag(source, 'powers', where),
    wornLimit: source['wornLimit'] === undefined ? null : positive(source, 'wornLimit', where),
  };
}

export function dropLean(value: unknown, where: string): DropLean {
  const source: Fields = fields(value, where);
  const lean: number = positive(source, 'share', where);
  const legendary: number = positive(source, 'legendary', where);
  if (lean < 1) throw new ContentError(`${where}.share`, 'expected 1 or more: a lean raises a share and never lowers one');
  if (legendary < 1) throw new ContentError(`${where}.legendary`, 'expected 1 or more: a lean raises a share and never lowers one');
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    zones: textList(source, 'zones', where),
    share: lean,
    weapons: textList(source, 'weapons', where),
    slots: choiceList(source, 'slots', ITEM_SLOTS, where),
    families: textList(source, 'families', where),
    legendary,
  };
}

export function family(value: unknown, where: string): FamilyDef {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), name: text(source, 'name', where) };
}

function skillVariant(value: unknown, where: string): SkillVariant {
  const source: Fields = fields(value, where);
  return { skill: text(source, 'skill', where), becomes: text(source, 'becomes', where) };
}

function power(value: unknown, where: string): PowerDef | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return {
    family: text(source, 'family', where),
    text: text(source, 'text', where),
    skillMods: source['skillMods'] === undefined ? [] : each(source['skillMods'], `${where}.skillMods`, skillMod),
    variants: source['variants'] === undefined ? [] : each(source['variants'], `${where}.variants`, skillVariant),
    triggers: source['triggers'] === undefined ? [] : each(source['triggers'], `${where}.triggers`, powerTrigger),
  };
}

function weaponKind(source: Fields, slot: ItemSlot | null, where: string): WeaponKind | null {
  const given: boolean = source['weaponKind'] !== undefined && source['weaponKind'] !== null;
  if (slot !== 'weapon') {
    if (given) throw new ContentError(`${where}.weaponKind`, 'only a weapon has a weapon kind');
    return null;
  }
  if (!given) throw new ContentError(`${where}.weaponKind`, `a weapon needs a kind, one of ${WEAPON_KINDS.join(', ')}`);
  return choice(source, 'weaponKind', WEAPON_KINDS, where);
}

export function itemBase(value: unknown, where: string): ItemBaseDef {
  const source: Fields = fields(value, where);
  const slot: ItemSlot | null = source['slot'] === null ? null : choice(source, 'slot', ITEM_SLOTS, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    slot,
    book: source['book'] === undefined ? null : text(source, 'book', where),
    keepsake: source['keepsake'] === undefined ? null : text(source, 'keepsake', where),
    story: source['story'] === undefined ? false : flag(source, 'story', where),
    material: source['material'] === null || source['material'] === undefined ? null : choice(source, 'material', ARMOUR_MATERIALS, where),
    weaponKind: weaponKind(source, slot, where),
    icon: text(source, 'icon', where),
    dropWeight: numeric(source, 'dropWeight', where),
    minLevel: numeric(source, 'minLevel', where),
    implicit: each(source['implicit'], `${where}.implicit`, statMod),
    visual: nullableText(source, 'visual', where),
    wear: textList(source, 'wear', where),
    wornModel: source['wornModel'] === undefined ? true : flag(source, 'wornModel', where),
    ground: source['ground'] === undefined ? genericLook(slot) : groundLook(source['ground'], `${where}.ground`),
    power: power(source['power'], `${where}.power`),
    variants: source['variants'] === undefined ? [] : each(source['variants'], `${where}.variants`, skillVariant),
    use: itemUse(source['use'], `${where}.use`),
    unsellable: source['unsellable'] === undefined ? false : flag(source, 'unsellable', where),
    stack: source['stack'] === undefined ? 1 : stackSize(source, where),
  };
}

function stackSize(source: Fields, where: string): number {
  const size: number = positive(source, 'stack', where);
  if (!Number.isInteger(size)) throw new ContentError(`${where}.stack`, 'expected a whole number, one or more');
  return size;
}

const ITEM_USES = ['portal'] as const;

function itemUse(value: unknown, where: string): ItemUse | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { type: choice(source, 'type', ITEM_USES, where), channel: positive(source, 'channel', where), reach: positive(source, 'reach', where) };
}

function groundLook(value: unknown, where: string): GroundLook {
  const source: Fields = fields(value, where);
  return {
    model: choice(source, 'model', GROUND_MODELS, where),
    keep: source['keep'] === undefined ? 'all' : choice(source, 'keep', GROUND_KEEPS, where),
    scale: positive(source, 'scale', where),
    flatten: source['flatten'] === undefined ? 1 : positive(source, 'flatten', where),
    pitch: numeric(source, 'pitch', where),
    roll: numeric(source, 'roll', where),
    yawJitter: nonNegative(source, 'yawJitter', where),
  };
}

export function affix(value: unknown, where: string): AffixDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    label: text(source, 'label', where),
    slots: choiceList(source, 'slots', ITEM_SLOTS, where),
    stat: choice(source, 'stat', ITEM_STATS, where),
    op: choice(source, 'op', MOD_OPS, where),
    min: numeric(source, 'min', where),
    max: numeric(source, 'max', where),
    perLevel: numeric(source, 'perLevel', where),
    minLevel: source['minLevel'] === undefined ? 1 : positive(source, 'minLevel', where),
  };
}
