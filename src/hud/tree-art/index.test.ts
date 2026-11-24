import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../../sim/content/content.ts';
import { SKILL_ART } from '../skill-art/index.ts';
import { COMMON_ART, hasTreeArt, placeArt, placeSkills, splitArt, treeArtIds, treeArtSvg } from './index.ts';

void test('every place on the tree is painted', (): void => {
  const content = loadContent();
  for (const node of content.skillTree) {
    const art: string | null = placeArt(content, node);
    assert.ok(art !== null && art.startsWith('url("data:image/svg+xml,'), node.id);
  }
});

void test('an ability or variant place shows the painted art of every skill it gives', (): void => {
  const content = loadContent();
  for (const node of content.skillTree) {
    const skills: readonly string[] = placeSkills(content, node);
    if (node.unlock === null && node.variants.length === 0) {
      assert.deepEqual(skills, [], node.id);
      assert.ok(hasTreeArt(node.icon), `${node.id} names unknown art ${node.icon}`);
      continue;
    }
    assert.equal(skills.length, node.unlock === null ? node.variants.length : 1, node.id);
    for (const skill of skills) assert.ok(SKILL_ART.has(skill), `${node.id} gives ${skill} with no art`);
    const [first, second] = skills.map((skill: string): string => SKILL_ART.get(skill) ?? '');
    const svg: string = first === undefined ? '' : second === undefined ? first : splitArt(first, second);
    assert.equal(placeArt(content, node), `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, node.id);
  }
});

void test('a place that changes two skills shows both, split corner to corner', (): void => {
  const content = loadContent();
  const twin = content.skillTree.find((node): boolean => node.variants.length > 1);
  assert.ok(twin !== undefined);
  const svg: string = decodeURIComponent(placeArt(content, twin)?.slice('url("data:image/svg+xml,'.length, -2) ?? '');
  assert.ok(svg.includes('url(#a1-bg)') && svg.includes('url(#a2-bg)'), twin.id);
  assert.ok(svg.includes('clip-path="url(#splitA)"') && svg.includes('clip-path="url(#splitB)"'), twin.id);
});

void test('common places, and only they, wear the common art', (): void => {
  const content = loadContent();
  for (const node of content.skillTree) assert.equal(COMMON_ART.has(node.icon), node.common !== null, node.id);
  for (const place of content.chart.common.places) assert.ok(COMMON_ART.has(place.icon), place.id);
  for (const motif of COMMON_ART.values()) assert.ok(treeArtIds().includes(motif), motif);
});

void test('every painting is shown by some place', (): void => {
  const content = loadContent();
  const shown: Set<string> = new Set<string>(content.skillTree.map((node): string => COMMON_ART.get(node.icon) ?? node.icon));
  for (const id of treeArtIds()) assert.ok(shown.has(id), id);
});

void test('a painting is a whole svg with no missing numbers, tinted by its path', (): void => {
  for (const id of treeArtIds()) {
    const svg: string | null = treeArtSvg(id, '#86c8f0');
    assert.ok(svg !== null && svg.startsWith('<svg') && svg.endsWith('</svg>'), id);
    assert.ok(!svg.includes('undefined') && !svg.includes('NaN'), id);
    assert.notEqual(svg, treeArtSvg(id, '#e0773a'), id);
  }
  assert.equal(treeArtSvg('nothing', '#86c8f0'), null);
});
