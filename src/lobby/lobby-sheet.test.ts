import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLASSIC_BAR } from '../../test/support.ts';
import { characterSheet } from '../../sim/character-sheet.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { emptyEquipment } from '../../sim/items.ts';
import { resolveSkillBar } from '../../sim/stats.ts';
import { DAMAGE_NAME, ladderFigures } from '../../sim/ladder.ts';
import { LOBBY_SHEET, lobbyHero, lobbyStats, playedText } from './lobby-sheet.ts';
import type { LobbyHero, LobbyStat, LobbySubject } from './lobby-sheet.ts';

const content: Content = loadContent();

function subject(level: number, xp: number): LobbySubject {
  return { level, xp, equipped: emptyEquipment(), allocated: [], bar: CLASSIC_BAR, skills: resolveSkillBar(content, CLASSIC_BAR, []) };
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
  assert.deepEqual(hero.stats, lobbyStats(characterSheet(content, subject(4, 30)), ladderFigures(content, subject(4, 30)).damage));
});

void test('the lobby lists the chosen rows in order with the panel formatting', (): void => {
  const stats: LobbyStat[] = lobbyStats(characterSheet(content, subject(1, 0)), 1234.9);
  assert.deepEqual(stats.map((stat: LobbyStat): string => stat.name), [...LOBBY_SHEET.shown]);
  assert.equal(stats[0]?.value, '100');
  assert.equal(stats.find((stat: LobbyStat): boolean => stat.name === DAMAGE_NAME)?.value, '1,234');
});

void test('the sheet shows the same damage figure the ladder ranks by', (): void => {
  const hero: LobbyHero = lobbyHero(content, subject(6, 10), 'The Still', 0);
  assert.ok(hero.kind === 'known');
  const shown: string | undefined = hero.stats.find((stat: LobbyStat): boolean => stat.name === DAMAGE_NAME)?.value;
  assert.equal(shown, ladderFigures(content, subject(6, 10)).damage.toLocaleString('en-US'));
});

void test('time played reads in hours and minutes and stays hidden under a minute', (): void => {
  assert.equal(playedText(30), null);
  assert.equal(playedText(Number.NaN), null);
  assert.equal(playedText(600), '10 min');
  assert.equal(playedText(7200), '2 h');
});
