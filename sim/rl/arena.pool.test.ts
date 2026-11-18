import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAYER_SIDE } from '../content/combat-types.ts';
import { loadContent } from '../content/content.ts';
import type { Content, MonsterDef } from '../content/types.ts';
import { regardOf } from '../world/factions.ts';
import { arenaPool } from './arena.ts';

const CONTENT: Content = loadContent();

void test('the arena pool holds only monsters that fight the player', (): void => {
  const pool: MonsterDef[] = arenaPool(CONTENT);
  assert.ok(pool.length > 0);
  assert.ok(pool.every((monster: MonsterDef): boolean => regardOf(CONTENT, PLAYER_SIDE, monster.faction) === 'hostile'));
  const friendly: MonsterDef[] = [...CONTENT.monsters.values()].filter((monster: MonsterDef): boolean => regardOf(CONTENT, PLAYER_SIDE, monster.faction) !== 'hostile');
  assert.ok(friendly.every((monster: MonsterDef): boolean => !pool.includes(monster)));
});
