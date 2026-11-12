import type { Fields } from './read.ts';
import { choice, choiceList, each, fields, nonNegative, nullableText, numeric, positive, text, textList } from './read.ts';
import { statMod } from './parse-chart.ts';
import type { AffixDef, GroundLook, ItemBaseDef, ItemSlot, RarityDef } from './types.ts';
import { ARMOUR_MATERIALS, GROUND_KEEPS, GROUND_MODELS, ITEM_SLOTS, ITEM_STATS, MOD_OPS, RARITY_MARKERS } from './types.ts';

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
