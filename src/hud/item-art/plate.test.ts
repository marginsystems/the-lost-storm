import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../../sim/content/content.ts';
import type { RarityDef } from '../../../sim/content/types.ts';
import { backdropSvg, coverSvg, moteCount, PLATE, plateImages } from './plate.ts';

function whole(svg: string, name: string): void {
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), name);
  assert.ok(!svg.includes('NaN') && !svg.includes('undefined'), name);
}

void test('every rarity is painted a whole plate under and over its picture', (): void => {
  for (const rarity of loadContent().rarities) {
    whole(backdropSvg(rarity), `${rarity.id} backdrop`);
    whole(coverSvg(rarity), `${rarity.id} cover`);
    const images = plateImages(rarity);
    assert.ok(images.backdrop.startsWith('url("data:image/svg+xml,'), rarity.id);
    assert.ok(images.cover.startsWith('url("data:image/svg+xml,'), rarity.id);
  }
});

void test('each rarity has its own backdrop, tinted by its colour', (): void => {
  const rarities: readonly RarityDef[] = loadContent().rarities;
  const backdrops: Set<string> = new Set<string>(rarities.map((rarity: RarityDef): string => backdropSvg(rarity)));
  assert.equal(backdrops.size, rarities.length);
});

void test('a rarer item carries more motes, up to the cap', (): void => {
  const rarities: readonly RarityDef[] = loadContent().rarities;
  for (const rarity of rarities) {
    assert.equal(moteCount(rarity), Math.min(PLATE.maxMotes, Math.max(0, rarity.affixMax)), rarity.id);
    const sparks: number = backdropSvg(rarity).split('filter="url(#glow)"').length - 1;
    assert.equal(sparks, moteCount(rarity), rarity.id);
  }
  const plain: RarityDef | undefined = rarities.find((rarity: RarityDef): boolean => rarity.affixMax === 0);
  assert.ok(plain !== undefined && moteCount(plain) === 0);
});

void test('a plate is painted once and then reused', (): void => {
  const rarity: RarityDef | undefined = loadContent().rarities[0];
  assert.ok(rarity !== undefined);
  assert.equal(plateImages(rarity), plateImages(rarity));
});
