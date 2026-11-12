import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { SkillUnlock } from './content/shape-types.ts';
import type { Content } from './content/types.ts';
import { grantXp } from './world/character.ts';
import { xpToNextLevel } from './progression.ts';
import { parseSaveText, toSave } from './save.ts';
import { assignSlot, defaultBar, readBar, unlockedSkills, withUnlocks } from './skill-book.ts';
import { stepWorld } from './world/step.ts';
import type { World, WorldEvent } from './world/types.ts';

const content: Content = loadContent();

function levelTo(world: World, level: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  while (world.player.level < level) {
    world.events = [];
    grantXp(world, xpToNextLevel(content.player.xp, world.player.level) - world.player.xp);
    events.push(...world.events);
  }
  return events;
}

void test('the hero learns eight to ten active skills across the first act, beyond the basic attack and the roll', (): void => {
  const learned: readonly SkillUnlock[] = content.player.skillBook.filter((entry: SkillUnlock): boolean => entry.skill !== 'cleave' && entry.skill !== 'dodge_roll');
  assert.ok(learned.length >= 8 && learned.length <= 10);
  assert.ok(learned.every((entry: SkillUnlock): boolean => entry.level <= 7));
  assert.ok(content.player.skillBook.length > content.player.skillBar.length);
  const shapes: Set<string> = new Set<string>(learned.map((entry: SkillUnlock): string => {
    const skill = must(content.skills.get(entry.skill), entry.skill);
    const area: string = skill.delivery.type === 'area' ? `${skill.delivery.anchor}:${skill.delivery.pull > 0 ? 'pull' : ''}:${skill.delivery.pulse > 0 ? 'pulse' : ''}:${skill.delivery.slow < 1 ? 'slow' : ''}` : '';
    return `${skill.delivery.type}:${area}:${skill.press?.type ?? ''}:${skill.brand === null ? '' : 'brand'}`;
  }));
  assert.equal(shapes.size, learned.length);
});

void test('a skill is placed in a slot, and placing one already on the bar swaps the two', (): void => {
  const bar = ['cleave', 'thunderclap', 'storm_bolt', null, null, 'dodge_roll'];
  assert.deepEqual(assignSlot(bar, 3, 'forkline'), ['cleave', 'thunderclap', 'storm_bolt', 'forkline', null, 'dodge_roll']);
  assert.deepEqual(assignSlot(bar, 1, 'storm_bolt'), ['cleave', 'storm_bolt', 'thunderclap', null, null, 'dodge_roll']);
  assert.deepEqual(assignSlot(bar, 4, 'cleave'), [null, 'thunderclap', 'storm_bolt', null, 'cleave', 'dodge_roll']);
  assert.deepEqual(assignSlot(bar, 9, 'cleave'), bar);
});

void test('new skills fill empty slots as they are learned and stop when the bar is full', (): void => {
  const filled = withUnlocks(content, defaultBar(content), 1, 7);
  assert.ok(!filled.includes(null));
  assert.equal(new Set(filled).size, filled.length);
  assert.deepEqual(unlockedSkills(content, 1).toSorted(), ['cleave', 'dodge_roll', 'storm_bolt', 'thunderclap']);
});

void test('reaching a level that teaches a skill announces it and puts it in an empty slot', (): void => {
  const world: World = worldIn(content, 'shallows', 3);
  const events: WorldEvent[] = levelTo(world, 2);
  const learned = events.filter((event: WorldEvent): boolean => event.type === 'skill_unlocked');
  assert.ok(learned.length >= 1);
  const forkline: number = world.player.bar.indexOf('forkline');
  assert.ok(forkline >= 0);
  assert.equal(world.player.skills[forkline]?.id, 'forkline');
});

void test('the slot command places only learned skills, and the choice survives a save', (): void => {
  const world: World = worldIn(content, 'shallows', 3);
  stepWorld(world, [{ type: 'slot', slot: 1, skill: 'held_breath' }], 1 / 60);
  assert.equal(world.player.bar[1], 'thunderclap');
  levelTo(world, 7);
  stepWorld(world, [{ type: 'slot', slot: 1, skill: 'held_breath' }], 1 / 60);
  assert.equal(world.player.bar[1], 'held_breath');
  assert.equal(world.player.skills[1]?.id, 'held_breath');
  const saved = must(parseSaveText(content, JSON.stringify(toSave(world))), 'save');
  assert.deepEqual(saved.bar, world.player.bar);
});

void test('an older save with no bar gets the default bar plus every skill its level has learned', (): void => {
  const bar = readBar(content, undefined, 3);
  assert.equal(bar[0], 'cleave');
  assert.ok(bar.includes('forkline') && bar.includes('mist_step'));
  assert.deepEqual(readBar(content, ['held_breath', 'cleave', 'cleave', 42, null, 'nonsense'], 3), [null, 'cleave', null, null, null, null]);
});
