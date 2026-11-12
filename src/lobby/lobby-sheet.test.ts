import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLASSIC_BAR } from '../../test/support.ts';
import type { SheetSubject } from '../../sim/character-sheet.ts';
import { characterSheet } from '../../sim/character-sheet.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { emptyEquipment } from '../../sim/items.ts';
import { resolveSkillBar } from '../../sim/stats.ts';
import { LOBBY_SHEET, lobbyHero, lobbyStats, playedText } from './lobby-sheet.ts';
import type { LobbyHero, LobbyStat } from './lobby-sheet.ts';

const content: Content = loadContent();

function subject(level: number, xp: number): SheetSubject {
  return { level, xp, equipped: emptyEquipment(), allocated: [], skills: resolveSkillBar(content, CLASSIC_BAR, []) };
}

void test('a character who has not earned anything yet shows the quiet empty state', (): void => {
  assert.deepEqual(lobbyHero(content, subject(1, 0), 'The In-Between', 0), { kind: 'fresh' });
});

void test('a known character shows the Character panel figures, the time played and where he was last', (): void => {
  const hero: LobbyHero = lobbyHero(content, subject(4, 30), 'The Still', 3720);
  assert.ok(hero.kind === 'known');
  assert.equal(hero.level, 4);
  assert.equal(hero.seen, 'The Still');
  assert.equal(hero.played, '1 h 2 min');
  assert.ok(hero.progress > 0 && hero.progress < 1);
  assert.deepEqual(hero.stats, lobbyStats(characterSheet(content, subject(4, 30))));
});

void test('the lobby lists the chosen rows in order with the panel formatting', (): void => {
  const stats: LobbyStat[] = lobbyStats(characterSheet(content, subject(1, 0)));
  assert.deepEqual(stats.map((stat: LobbyStat): string => stat.name), [...LOBBY_SHEET.shown]);
  assert.equal(stats[0]?.value, '100');
});

void test('time played reads in hours and minutes and stays hidden under a minute', (): void => {
  assert.equal(playedText(30), null);
  assert.equal(playedText(Number.NaN), null);
  assert.equal(playedText(600), '10 min');
  assert.equal(playedText(7200), '2 h');
});
