import type { ArmourMaterial, Content, ItemBaseDef, ItemSlot, RarityDef } from '../../sim/content/types.ts';
import { itemVerdict, readItem, readingLines, verdictParts } from '../../sim/item-reading.ts';
import type { Headline, ItemReading, ReadingRow, Verdict, VerdictKind } from '../../sim/item-reading.ts';
import { baseOf, itemName, rarityOf, slotOf } from '../../sim/items.ts';
import { familyReading } from '../../sim/powers.ts';
import type { FamilyPiece, FamilyReading } from '../../sim/powers.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import { el, label } from './dom.ts';
import type { HudApi } from './hud-api.ts';
import { setPicture } from './item-picture.ts';

const SLOT_NAMES: Readonly<Record<ItemSlot, string>> = {
  weapon: 'Weapon',
  head: 'Headgear',
  chest: 'Body Armour',
  hands: 'Gloves',
  legs: 'Leggings',
  feet: 'Boots',
  charm: 'Charm',
};

const MATERIAL_NAMES: Readonly<Record<ArmourMaterial, string>> = {
  cloth: 'Cloth',
  leather: 'Leather',
  mail: 'Mail',
  plate: 'Plate',
};

const VERDICT_WORDS: Readonly<Record<VerdictKind, string>> = {
  better: 'Better',
  worse: 'Worse',
  trade: 'Trade',
  same: 'Same',
};

function deltaClass(delta: number | null): string {
  if (delta === null || delta === 0) return '';
  return delta > 0 ? ' better' : ' worse';
}

function appendRow(parent: HTMLElement, row: ReadingRow, className: string): void {
  const line: HTMLDivElement = el('div', `tip-row ${className}`, parent);
  label('tip-row-text', row.text, line);
  if (row.deltaText !== null) label(`tip-delta${deltaClass(row.delta)}`, row.deltaText, line);
}

function appendHeadline(parent: HTMLElement, headline: Headline): void {
  if (headline.kind === 'none') return;
  const block: HTMLDivElement = el('div', 'tip-headline', parent);
  if (headline.kind === 'damage') {
    label('tip-headline-value', `${Math.round(headline.min)}–${Math.round(headline.max)}`, block);
    label('tip-headline-name', 'Damage', block);
    if (headline.delta !== null && headline.delta !== 0) label(`tip-delta${deltaClass(headline.delta)}`, `${headline.delta > 0 ? '+' : '−'}${Math.abs(headline.delta)} average hit`, block);
    return;
  }
  label('tip-headline-value', headline.row.text, block);
  if (headline.row.deltaText !== null) label(`tip-delta${deltaClass(headline.row.delta)}`, headline.row.deltaText, block);
}

function appendVerdict(parent: HTMLElement, verdict: Verdict): void {
  const line: HTMLDivElement = el('div', `tip-verdict ${verdict.kind}`, parent);
  label('tip-verdict-word', VERDICT_WORDS[verdict.kind], line);
  const parts: readonly string[] = verdictParts(verdict);
  if (parts.length > 0) label('tip-verdict-detail', parts.join(' · '), line);
}

function appendReading(parent: HTMLElement, reading: ItemReading): void {
  appendHeadline(parent, reading.headline);
  if (reading.rows.length + reading.lost.length === 0) return;
  el('div', 'tip-sep', parent);
  for (const line of readingLines(reading)) appendRow(parent, line.row, line.lost ? 'lost' : 'own');
}

function appendPower(parent: HTMLElement, family: FamilyReading): void {
  const block: HTMLDivElement = el('div', 'tip-power', parent);
  label('tip-power-text', family.text, block);
  const line: HTMLDivElement = el('div', 'tip-family', parent);
  label('tip-family-name', `${family.name} ${family.count}/${family.pieces.length}`, line);
  family.pieces.forEach((piece: FamilyPiece): void => {
    label(piece.worn ? 'tip-family-piece worn' : 'tip-family-piece', piece.name, line);
  });
}

function itemCard(api: HudApi, item: ItemInstance, equipped: ItemInstance | null, compare: boolean, hint: string | null, className: string): HTMLElement {
  const content: Content = api.world.content;
  const root: HTMLDivElement = el('div', className, null);
  const rarity: RarityDef = rarityOf(content, item);
  const slot: ItemSlot | null = slotOf(content, item);
  const base: ItemBaseDef | null = baseOf(content, item);
  const head: HTMLDivElement = el('div', 'tip-head', root);
  const picture: HTMLDivElement = el('div', 'tip-picture', head);
  picture.style.setProperty('--rarity', rarity.color);
  setPicture(picture, api.itemImage(item), base === null ? '' : base.icon);
  const heading: HTMLDivElement = el('div', 'tip-heading', head);
  const title: HTMLDivElement = label('tip-title', itemName(content, item), heading);
  title.style.color = rarity.color;
  const material: ArmourMaterial | null = base?.material ?? null;
  const kind: string = slot === null ? '' : material === null ? SLOT_NAMES[slot] : `${MATERIAL_NAMES[material]} ${SLOT_NAMES[slot]}`;
  label('tip-sub', slot === null ? rarity.name : `${rarity.name} ${kind}`, heading);
  label('tip-sub', `Item level ${item.level}`, heading);
  el('div', 'tip-sep', root);
  appendReading(root, readItem(content, item, equipped));
  const family: FamilyReading | null = familyReading(content, item, api.world.player.equipped);
  if (family !== null) appendPower(root, family);
  if (compare) {
    const verdict: Verdict | null = itemVerdict(content, api.world.player, api.world.zone, item);
    if (verdict !== null) appendVerdict(root, verdict);
  }
  if (hint !== null) label('tip-hint', hint, root);
  return root;
}

export function itemTooltip(api: HudApi, item: ItemInstance, equipped: ItemInstance | null, hint: string): HTMLElement {
  const pair: HTMLDivElement = el('div', 'tip-pair', null);
  const worn: boolean = Object.values(api.world.player.equipped).some((held: ItemInstance | null): boolean => held !== null && held.uid === item.uid);
  pair.append(itemCard(api, item, equipped, !worn, hint, 'tip'));
  if (equipped !== null) {
    const side: HTMLElement = itemCard(api, equipped, null, false, null, 'tip tip-equipped');
    label('tip-sub', 'Equipped', side);
    pair.append(side);
  }
  return pair;
}
