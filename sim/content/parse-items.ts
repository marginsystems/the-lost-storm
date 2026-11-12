import type { Fields } from './read.ts';
import { choice, choiceList, each, fields, nullableText, numeric, text, textList } from './read.ts';
import type { AffixDef, ItemBaseDef, ItemScaling, RarityDef, SkillMod, StatMod } from './types.ts';
import { AFFIX_GROUPS, AFFIX_POSITIONS, ARMOUR_MATERIALS, ITEM_SLOTS, MOD_OPS, SKILL_MOD_FIELDS, STAT_IDS } from './types.ts';

const NO_MAX_LEVEL: number = 9999;

export function statMod(value: unknown, where: string): StatMod {
  const source: Fields = fields(value, where);
  return { stat: choice(source, 'stat', STAT_IDS, where), op: choice(source, 'op', MOD_OPS, where), value: numeric(source, 'value', where) };
}

export function skillMod(value: unknown, where: string): SkillMod {
  const source: Fields = fields(value, where);
  return { skill: text(source, 'skill', where), field: choice(source, 'field', SKILL_MOD_FIELDS, where), value: numeric(source, 'value', where) };
}

export function parseRarity(value: unknown, where: string): RarityDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    color: text(source, 'color', where),
    weight: numeric(source, 'weight', where),
    affixMin: numeric(source, 'affixMin', where),
    affixMax: numeric(source, 'affixMax', where),
    statScale: numeric(source, 'statScale', where),
    maxPerGroup: numeric(source, 'maxPerGroup', where),
  };
}

export function parseItemBase(value: unknown, where: string): ItemBaseDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    slot: source['slot'] === null ? null : choice(source, 'slot', ITEM_SLOTS, where),
    book: source['book'] === undefined ? null : text(source, 'book', where),
    material: source['material'] === null || source['material'] === undefined ? null : choice(source, 'material', ARMOUR_MATERIALS, where),
    icon: text(source, 'icon', where),
    dropWeight: numeric(source, 'dropWeight', where),
    minLevel: numeric(source, 'minLevel', where),
    maxLevel: source['maxLevel'] === undefined ? NO_MAX_LEVEL : numeric(source, 'maxLevel', where),
    implicit: each(source['implicit'], `${where}.implicit`, statMod),
    visual: nullableText(source, 'visual', where),
    wear: textList(source, 'wear', where),
    uniqueWeight: source['uniqueWeight'] === undefined ? 0 : numeric(source, 'uniqueWeight', where),
    flavour: source['flavour'] === undefined ? null : text(source, 'flavour', where),
    skillMods: source['skillMods'] === undefined ? [] : each(source['skillMods'], `${where}.skillMods`, skillMod),
  };
}

export function parseAffix(value: unknown, where: string): AffixDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    label: text(source, 'label', where),
    family: text(source, 'family', where),
    group: choice(source, 'group', AFFIX_GROUPS, where),
    tier: numeric(source, 'tier', where),
    minLevel: numeric(source, 'minLevel', where),
    weight: numeric(source, 'weight', where),
    position: choice(source, 'position', AFFIX_POSITIONS, where),
    slots: choiceList(source, 'slots', ITEM_SLOTS, where),
    stat: choice(source, 'stat', STAT_IDS, where),
    op: choice(source, 'op', MOD_OPS, where),
    min: numeric(source, 'min', where),
    max: numeric(source, 'max', where),
    perLevel: numeric(source, 'perLevel', where),
  };
}

export function itemScaling(source: Fields, where: string): ItemScaling {
  return {
    implicitPerLevel: numeric(source, 'implicitPerLevel', where),
    uniqueChance: numeric(source, 'uniqueChance', where),
    uniqueChancePerLevel: numeric(source, 'uniqueChancePerLevel', where),
    maxPerPosition: numeric(source, 'maxPerPosition', where),
  };
}
