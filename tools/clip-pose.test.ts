import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clipUrl } from '../sim/content/clips.ts';
import { loadContent } from '../sim/content/content.ts';
import type { Content } from '../sim/content/types.ts';
import { CLIP_POSE, finalTurns } from './clip-pose.ts';

const content: Content = loadContent();

void test('every death clip ends with the arms relaxed, never spread in the bind pose, and the check catches one that does', async (): Promise<void> => {
  const hero = content.rigs.get(content.player.rig);
  assert.ok(hero !== undefined);
  const spread: number[] = await finalTurns(`public/${clipUrl(hero, 'Death01')}`, CLIP_POSE.arms);
  assert.ok(spread.some((turn: number): boolean => turn < CLIP_POSE.minTurn));
  const checks: { readonly rig: string; readonly clip: string; readonly path: string }[] = [...content.rigs.values()].flatMap((rig) => [...new Set<string>([...rig.clips.death, ...(rig.clips.rise === null ? [] : [rig.clips.rise])])].map((clip: string) => ({ rig: rig.id, clip, path: `public/${clipUrl(rig, clip)}` })));
  const turns: number[][] = await Promise.all(checks.map(async (check): Promise<number[]> => finalTurns(check.path, CLIP_POSE.arms)));
  const problems: string[] = checks.flatMap((check, index: number): string[] => {
    const arms: number[] = turns[index] ?? [];
    return arms.some((turn: number): boolean => turn < CLIP_POSE.minTurn) ? [`${check.rig} ${check.clip} ends with an arm ${Math.min(...arms).toFixed(2)} rad from the bind pose`] : [];
  });
  assert.deepEqual(problems, []);
});
