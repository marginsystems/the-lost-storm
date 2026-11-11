import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { cuesForEvent, cuesForUi, uiActionForCommand, warmSoundIds } from './audio.ts';
import type { SoundCue } from './audio.ts';
import type { AudioDef } from './content/audio.ts';
import { loadAudio } from './content/audio.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillDef } from './content/types.ts';
import type { Vec2 } from './math.ts';
import { createWorld } from './world/create.ts';
import { stepWorld } from './world/step.ts';
import type { GroundItem, MonsterState, World, WorldEvent } from './world/types.ts';

const content: Content = loadContent();
const audio: AudioDef = loadAudio(content);
const AWAY: Vec2 = { x: 3, z: 4 };

function fresh(): World {
  return createWorld(content, { seed: 1, save: null });
}

function skill(id: string): SkillDef {
  return must(content.skills.get(id), id);
}

function monster(world: World, id: string): MonsterState {
  return must(
    world.monsters.find((candidate: MonsterState): boolean => candidate.def.id === id),
    id,
  );
}

function sounds(cues: readonly SoundCue[]): string[] {
  return cues.map((cue: SoundCue): string => cue.sound);
}

function ground(payload: GroundItem['content']): GroundItem {
  return { id: 1, pos: { x: 5, z: 6 }, from: { x: 4, z: 6 }, content: payload, age: 0 };
}

void test('a skill starting plays its start sound where the actor stands', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = monster(world, 'bone_thrall');
  const own: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'skill_start', actorId: world.player.id, skill: skill('cleave'), direction: AWAY, windup: 0.1, recovery: 0.1 });
  assert.deepEqual(sounds(own), ['sword_swing_light']);
  assert.deepEqual(own[0]?.position, world.player.pos);
  const theirs: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'skill_start', actorId: thrall.id, skill: skill('thrall_claw'), direction: AWAY, windup: 0.1, recovery: 0.1 });
  assert.deepEqual(sounds(theirs), ['sword_swing_heavy']);
  assert.deepEqual(theirs[0]?.position, thrall.pos);
});

void test('Thunderclap landing plays a boom and a crack at the origin', (): void => {
  const world: World = fresh();
  const origin: Vec2 = { x: 10, z: 12 };
  const cues: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'skill_impact', actorId: world.player.id, team: 'player', skill: skill('thunderclap'), origin, direction: AWAY, hits: 0 });
  assert.deepEqual(sounds(cues), ['ground_boom', 'thunder_crack']);
  assert.ok(cues.every((cue: SoundCue): boolean => cue.position?.x === 10 && cue.position.z === 12));
});

void test('a hit plays what the skill and the target sound like, and a crit the crit sound', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = monster(world, 'bone_thrall');
  const base = { type: 'damage', targetId: thrall.id, sourceId: world.player.id, targetTeam: 'monster', amount: 5, killed: false, pos: thrall.pos, direction: AWAY } as const;
  assert.deepEqual(sounds(cuesForEvent(audio, world, { ...base, crit: false, skill: skill('cleave') })), ['bone_hit']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { ...base, crit: true, skill: skill('cleave') })), ['crit_hit']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { ...base, crit: false, skill: skill('storm_bolt') })), ['bolt_impact', 'bone_hit']);
  const hurt: readonly SoundCue[] = cuesForEvent(audio, world, { ...base, targetId: world.player.id, targetTeam: 'player', crit: false, skill: skill('hex_bolt') });
  assert.deepEqual(sounds(hurt), ['hex_impact', 'hero_hurt']);
});

void test('a hit on a monster that is already gone still plays the skill sound only', (): void => {
  const world: World = fresh();
  const cues: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'damage', targetId: 99999, sourceId: world.player.id, targetTeam: 'monster', amount: 1, crit: false, killed: true, pos: AWAY, direction: AWAY, skill: skill('storm_bolt') });
  assert.deepEqual(sounds(cues), ['bolt_impact']);
});

void test('deaths play by who died', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = monster(world, 'bone_thrall');
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'death', actorId: thrall.id, team: 'monster', pos: thrall.pos, direction: AWAY })), ['bones_collapse']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'death', actorId: world.player.id, team: 'player', pos: world.player.pos, direction: AWAY })), ['hero_death']);
  assert.deepEqual(cuesForEvent(audio, world, { type: 'death', actorId: 99999, team: 'monster', pos: AWAY, direction: AWAY }), []);
});

void test('projectiles sound when they spawn and when they run out, not when they hit', (): void => {
  const world: World = fresh();
  const bolt: SkillDef = skill('storm_bolt');
  const spawned: readonly SoundCue[] = cuesForEvent(audio, world, {
    type: 'projectile_spawn',
    projectile: { id: 1, ownerId: world.player.id, team: 'player', skill: bolt, damageMin: 1, damageMax: 2, damagePercent: 0, critChance: 0, critMultiplier: 1.5, pos: { x: 1, z: 2 }, direction: { x: 0, z: 1 }, distanceLeft: 10, pierceLeft: 0, hitIds: [] },
  });
  assert.deepEqual(sounds(spawned), ['bolt_whoosh']);
  assert.deepEqual(cuesForEvent(audio, world, { type: 'projectile_end', id: 1, pos: AWAY, hit: true, skill: bolt }), []);
  const expired: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'projectile_end', id: 1, pos: AWAY, hit: false, skill: bolt });
  assert.deepEqual(sounds(expired), ['electric_crackle']);
  assert.deepEqual(expired[0]?.position, AWAY);
});

void test('drops sound at the loot by rarity and pickups sound at the hero by kind', (): void => {
  const world: World = fresh();
  const gold: GroundItem = ground({ kind: 'gold', amount: 3 });
  const rare: GroundItem = ground({ kind: 'item', item: { uid: 1, base: 'rusted_blade', rarity: 'rare', level: 1, affixes: [] } });
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'drop', ground: gold })), ['coin_drop']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'drop', ground: rare })), ['item_drop_rare']);
  assert.deepEqual(cuesForEvent(audio, world, { type: 'drop', ground: rare })[0]?.position, rare.pos);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'pickup', ground: gold })), ['coin_pickup']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'pickup', ground: rare })), ['item_metal']);
  assert.equal(cuesForEvent(audio, world, { type: 'pickup', ground: rare })[0]?.position, null);
});

void test('level ups, surges, notices and footsteps have sounds, and bookkeeping events do not', (): void => {
  const world: World = fresh();
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'level_up', level: 2 })), ['level_up']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'surge', surge: 2 })), ['wave_arrival']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'notice', reason: 'no_mana' })), ['ui_error']);
  const step: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'hero_step', pos: AWAY });
  assert.deepEqual(sounds(step), ['footstep_stone']);
  assert.deepEqual(step[0]?.position, AWAY);
  const thrall: MonsterState = monster(world, 'bone_thrall');
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'aggro', monsterId: thrall.id })), ['bones_rattle']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'monster_spawn', monsterId: thrall.id })), ['monsters_rising']);
  for (const event of [{ type: 'xp', amount: 4 }, { type: 'character_changed' }, { type: 'skill_interrupt', actorId: 1 }, { type: 'monster_remove', monsterId: 1 }, { type: 'surge_cleared', surge: 1, delay: 3 }, { type: 'player_respawn' }] as const) {
    assert.deepEqual(cuesForEvent(audio, world, event), [], event.type);
  }
});

void test('cues carry the tuning of their data entry', (): void => {
  const world: World = fresh();
  const cue: SoundCue = must(cuesForEvent(audio, world, { type: 'monster_spawn', monsterId: monster(world, 'bone_thrall').id })[0], 'monster_spawn cue');
  assert.equal(cue.cooldown, 4);
  assert.equal(cue.maxVoices, 1);
  assert.equal(cue.volume, 0.7);
});

void test('walking through a real world step produces footstep cues', (): void => {
  const world: World = fresh();
  world.monsters = [];
  const cues: SoundCue[] = [];
  for (let step: number = 0; step < 90; step += 1) {
    const events: readonly WorldEvent[] = stepWorld(world, step === 0 ? [{ type: 'move', dest: { x: 28, z: 25 } }] : [], 1 / 60);
    for (const event of events) cues.push(...cuesForEvent(audio, world, event));
  }
  assert.ok(cues.length >= 2);
  assert.ok(cues.every((cue: SoundCue): boolean => cue.sound === 'footstep_stone' && cue.position !== null));
});

void test('interface actions have sounds and commands map to the right action', (): void => {
  assert.deepEqual(sounds(cuesForUi(audio, 'click')), ['ui_click']);
  assert.equal(cuesForUi(audio, 'click')[0]?.position, null);
  assert.deepEqual(sounds(cuesForUi(audio, 'skill_point')), ['ui_skill_point']);
  assert.equal(uiActionForCommand({ type: 'allocate', node: 'x' }), 'skill_point');
  assert.equal(uiActionForCommand({ type: 'equip', inventoryIndex: 0 }), 'equip');
  assert.equal(uiActionForCommand({ type: 'unequip', slot: 'weapon' }), 'equip');
  assert.equal(uiActionForCommand({ type: 'move', dest: AWAY }), null);
  assert.equal(uiActionForCommand({ type: 'stop' }), null);
});

void test('the warm list names every one-shot sound once, footsteps first and no ambience', (): void => {
  const ids: readonly string[] = warmSoundIds(audio);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], 'footstep_stone');
  for (const id of ['sword_swing_light', 'bone_hit', 'crit_hit', 'ground_boom', 'coin_pickup', 'ui_click', 'wave_arrival']) assert.ok(ids.includes(id), id);
  for (const zone of audio.ambience.values()) {
    for (const loop of zone.loops) assert.equal(ids.includes(loop.sound), false, loop.sound);
    for (const stinger of zone.stingers) assert.equal(ids.includes(stinger.sound), false, stinger.sound);
  }
});
