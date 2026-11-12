import type { Fields } from './read.ts';
import { choice, choiceList, each, fields, flag, nonNegative, nullableText, numeric, positive, text, textList } from './read.ts';
import { skillMod, skillTarget, statMod } from './parse-chart.ts';
import type { SkillTarget, SkillVariant } from './chart-types.ts';
import type { AffixDef, FamilyDef, GroundLook, ItemBaseDef, ItemSlot, PowerDef, PowerEffect, PowerTriggerDef, RarityDef } from './types.ts';
import { ARMOUR_MATERIALS, CAST_ORIGINS, GROUND_KEEPS, GROUND_MODELS, ITEM_SLOTS, ITEM_STATS, MOD_OPS, POWER_TARGETS, POWER_TRIGGERS, RARITY_MARKERS, STAT_IDS } from './types.ts';

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

export function family(value: unknown, where: string): FamilyDef {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), name: text(source, 'name', where) };
}

function powerEffect(value: unknown, where: string): PowerEffect {
  const source: Fields = fields(value, where);
  const type: 'cast' | 'buff' = choice(source, 'type', ['cast', 'buff'] as const, where);
  switch (type) {
    case 'cast':
      return { type, skill: text(source, 'skill', where), at: choice(source, 'at', CAST_ORIGINS, where) };
    case 'buff':
      return { type, stat: choice(source, 'stat', STAT_IDS, where), op: choice(source, 'op', MOD_OPS, where), value: numeric(source, 'value', where), duration: positive(source, 'duration', where), stacks: positive(source, 'stacks', where) };
  }
  return { type: 'cast', skill: text(source, 'skill', where), at: 'target' };
}

function triggerSkill(value: unknown, where: string): SkillTarget | null {
  return value === undefined || value === null ? null : skillTarget(fields(value, where), where);
}

function powerTrigger(value: unknown, where: string): PowerTriggerDef {
  const source: Fields = fields(value, where);
  return {
    on: choice(source, 'on', POWER_TRIGGERS, where),
    skill: triggerSkill(source['skill'], `${where}.skill`),
    target: source['target'] === undefined ? 'any' : choice(source, 'target', POWER_TARGETS, where),
    every: source['every'] === undefined ? 1 : positive(source, 'every', where),
    cooldown: source['cooldown'] === undefined ? 0 : nonNegative(source, 'cooldown', where),
    effect: powerEffect(source['effect'], `${where}.effect`),
  };
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

export function itemBase(value: unknown, where: string): ItemBaseDef {
  const source: Fields = fields(value, where);
  const slot: ItemSlot | null = source['slot'] === null ? null : choice(source, 'slot', ITEM_SLOTS, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    slot,
    book: source['book'] === undefined ? null : text(source, 'book', where),
    material: source['material'] === null || source['material'] === undefined ? null : choice(source, 'material', ARMOUR_MATERIALS, where),
    icon: text(source, 'icon', where),
    dropWeight: numeric(source, 'dropWeight', where),
    minLevel: numeric(source, 'minLevel', where),
    implicit: each(source['implicit'], `${where}.implicit`, statMod),
    visual: nullableText(source, 'visual', where),
    wear: textList(source, 'wear', where),
    ground: source['ground'] === undefined ? genericLook(slot) : groundLook(source['ground'], `${where}.ground`),
    power: power(source['power'], `${where}.power`),
  };
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
  };
}
