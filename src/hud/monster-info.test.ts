import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { MomentDef, MomentField } from '../../sim/content/moment-types.ts';
import type { Content, MonsterDef, SkillDef } from '../../sim/content/types.ts';
import { spawnPacks } from '../../sim/world/monsters.ts';
import { forceStrike } from '../../sim/world/moments.ts';
import { stepWorld } from '../../sim/world/step.ts';
import type { MomentState, MonsterState, World } from '../../sim/world/types.ts';
import { echoesOf, FIELD, fieldWorld, momentLibrary, QUIET, RAID, standAt } from '../../test/moment-support.ts';
import { must, worldIn } from '../../test/support.ts';
import { CATEGORY_NAMES } from './chart-ability.ts';
import { monsterLines, monsterSummary, monsterSummaryParts, reusedPhrases } from './monster-info.ts';
import type { MonsterLine } from './monster-info.ts';

const content: Content = loadContent();
const DT: number = 1 / 30;

function spawn(kind: string, mods: readonly string[] = []): { world: World; monster: MonsterState } {
  const world: World = worldIn(content, content.world.start, 3);
  world.zone = { ...world.zone, packs: [{ x: world.player.pos.x + 6, z: world.player.pos.z, members: [{ monster: kind, count: 1, mods: [...mods] }], when: [] }] };
  spawnPacks(world);
  return { world, monster: must(world.monsters.at(-1), kind) };
}

function texts(lines: readonly MonsterLine[], kind: MonsterLine['kind']): string[] {
  return lines.flatMap((line: MonsterLine): string[] => (line.kind === kind ? [line.kind === 'ability' ? line.name : line.text] : []));
}

void test('a monster lists its own skill with the chart category, and what it resists comes from its poise', (): void => {
  const { world, monster } = spawn('warden_patrol');
  const lines: MonsterLine[] = monsterLines(world, monster);
  const skill: SkillDef = must(content.skills.get(monster.def.skill), 'skill');
  assert.deepEqual(lines.find((line: MonsterLine): boolean => line.kind === 'ability'), { kind: 'ability', name: skill.name, tags: CATEGORY_NAMES[skill.category], effect: skill.description });
  assert.deepEqual(texts(lines, 'resist'), ['Resists knockback', 'Resists stagger']);
  assert.deepEqual(texts(lines, 'weak'), []);
});

void test('a monster with default poise shows no resistance line, and a ranged one says it keeps its distance', (): void => {
  const { world, monster } = spawn('mender');
  const lines: MonsterLine[] = monsterLines(world, monster);
  assert.deepEqual(texts(lines, 'resist'), []);
  assert.ok(texts(lines, 'state').includes('Keeps its distance'));
  assert.ok(texts(lines, 'ability').includes(must(content.skills.get('mender_stitch'), 'stitch').name));
});

void test('a boss names every phase skill once, takes no stagger and is marked as a boss', (): void => {
  const { world, monster } = spawn('unfinished_colossus');
  const lines: MonsterLine[] = monsterLines(world, monster);
  const phases: string[] = [...new Set<string>([monster.def.skill, ...(monster.def.boss?.phases.flatMap((phase): string[] => phase.skills.map((entry): string => entry.skill)) ?? [])])];
  assert.deepEqual(texts(lines, 'ability'), phases.map((id: string): string => must(content.skills.get(id), id).name));
  assert.ok(texts(lines, 'resist').includes('Immune to stagger'));
  assert.ok(texts(lines, 'state').includes('Boss'));
});

void test('an elite says so, and a guard reads as a resistance and a weakness', (): void => {
  const { world, monster } = spawn('mended', ['hulking']);
  assert.ok(texts(monsterLines(world, monster), 'state').includes('Elite'));
  const guarded: MonsterDef = { ...monster.def, guard: { arcDegrees: 120, damageTaken: 0.2, breakStagger: 0.4, breakTime: 1 }, poise: { knockback: 0, stagger: 1.5, resolve: 0 } };
  const lines: MonsterLine[] = monsterLines(world, { ...monster, def: guarded });
  assert.deepEqual(texts(lines, 'resist'), ['Immune to knockback', 'Guards its front']);
  assert.deepEqual(texts(lines, 'weak'), ['Easily staggered', 'Open from behind, and a heavy blow breaks its guard']);
});

void test('a summon reads from the monster it calls, with count and cooldown and no tag', (): void => {
  const { world, monster } = spawn('mended');
  const caller: MonsterDef = { ...monster.def, summon: { monster: 'mender', count: 2, cooldown: 7.5, limit: 4 } };
  const line: MonsterLine | undefined = monsterLines(world, { ...monster, def: caller }).find((entry: MonsterLine): boolean => entry.kind === 'ability' && entry.name.startsWith('Calls'));
  assert.deepEqual(line, { kind: 'ability', name: `Calls 2 ${must(content.monsters.get('mender'), 'mender').name} every 7.5s`, tags: '', effect: '' });
});

void test('a turned echo is a hostile echo bound to its moment', (): void => {
  const shy: MomentDef = { ...RAID, id: 'test_shy', turnChance: 0.0001 };
  const field: MomentField = { ...FIELD, start: 0, max: 1, interval: { min: 1000, max: 1000 }, table: [{ moment: QUIET.id, weight: 50 }, { moment: shy.id, weight: 1 }], sure: [{ type: 'flag', flag: 'first_moment', is: 'cleared', not: true }] };
  const world: World = fieldWorld(field, momentLibrary([QUIET, shy]));
  const moment: MomentState = must(forceStrike(world, { x: 40, z: 40 }, null), 'strike');
  for (let elapsed: number = 0; elapsed < world.content.moments.telegraph + DT * 2; elapsed += DT) stepWorld(world, [], DT);
  standAt(world, moment.pos);
  for (let step: number = 0; step < 2; step += 1) stepWorld(world, [], DT);
  const echo: MonsterState = must(echoesOf(world, moment)[0], 'echo');
  const states: string[] = texts(monsterLines(world, echo), 'state');
  assert.ok(states.includes('Hostile echo') && states.includes('Bound to a moment'));
});

void test('every skill a shipped monster uses carries a category the chart can name', (): void => {
  for (const def of content.monsters.values()) {
    const ids: string[] = [def.skill, ...(def.boss?.phases.flatMap((phase): string[] => phase.skills.map((entry): string => entry.skill)) ?? []), ...(def.support === null ? [] : [def.support])];
    for (const id of ids) assert.notEqual(must(content.skills.get(id), id).category, 'none', `${def.id} uses ${id}`);
  }
});

void test('the phone summary keeps one short word per line and drops repeats', (): void => {
  const lines: MonsterLine[] = [
    { kind: 'state', text: 'Elite' },
    { kind: 'ability', name: 'Haymaker', tags: 'Melee', effect: '' },
    { kind: 'ability', name: 'Sweep', tags: 'Melee', effect: '' },
    { kind: 'ability', name: 'Calls for help', tags: '', effect: '' },
    { kind: 'resist', text: 'Resists knockback' },
  ];
  assert.equal(monsterSummary(lines), 'Elite · Melee · Calls for help · Resists knockback');
  assert.deepEqual(monsterSummaryParts(lines), ['Elite', 'Melee', 'Calls for help', 'Resists knockback']);
});

void test('a new summary keeps every phrase still shown in order and makes only the new ones', (): void => {
  assert.deepEqual(reusedPhrases(['Hostile echo', 'Melee'], ['Hostile echo', 'Bound to a moment', 'Melee']), [0, null, 1]);
  assert.deepEqual(reusedPhrases(['Asleep until it hears you', 'Melee'], ['Melee']), [1]);
  assert.deepEqual(reusedPhrases(['Melee', 'Area'], ['Area', 'Melee']), [1, null]);
});
