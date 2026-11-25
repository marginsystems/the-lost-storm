import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../test/support.ts';
import { cuesForEvent } from './audio.ts';
import type { SoundCue } from './audio.ts';
import type { AudioDef } from './content/audio.ts';
import { loadAudio } from './content/audio.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillDef, SkillTreeNodeDef, SkillVariant } from './content/types.ts';
import type { Vec2 } from './math.ts';
import { resolveSkill } from './stats.ts';
import type { World } from './world/types.ts';

const content: Content = loadContent();
const audio: AudioDef = loadAudio(content);
const AWAY: Vec2 = { x: 3, z: 4 };
const LIGHTNING: ReadonlySet<string> = new Set<string>(['electric_crackle', 'thunder_crack', 'bolt_impact']);

function gatheredClap(): SkillDef {
  const base: SkillDef = must(content.skills.get('thunderclap'), 'thunderclap');
  const node: SkillTreeNodeDef = must(content.skillTree.find((candidate: SkillTreeNodeDef): boolean => candidate.variants.some((entry: SkillVariant): boolean => entry.becomes === 'thunderclap_gathered')), 'gathered clap node');
  return resolveSkill(content, base, [node.id], [], [], 'heavy');
}

void test('Gathered Clap sounds like fire when it starts and lands, never like Thunderclap lightning', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  const clap: SkillDef = gatheredClap();
  assert.equal(clap.form, 'thunderclap_gathered');
  const heard: readonly SoundCue[] = [
    ...cuesForEvent(audio, world, { type: 'skill_start', actorId: world.player.id, skill: clap, direction: AWAY, windup: 0.1, recovery: 0.1 }),
    ...cuesForEvent(audio, world, { type: 'skill_impact', actorId: world.player.id, team: 'player', skill: clap, origin: world.player.pos, direction: AWAY, hits: 1, echo: false }),
  ];
  assert.ok(heard.length > 0);
  assert.ok(heard.every((cue: SoundCue): boolean => !LIGHTNING.has(cue.sound)));
});
