import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../test/arena-support.ts';
import { must, worldIn } from '../test/support.ts';
import { cuesForEvent, cuesForUi, uiActionForCommand, warmSoundIds } from './audio.ts';
import type { SoundCue } from './audio.ts';
import type { AmbienceStinger, AudioDef, CueDef, ZoneAmbience } from './content/audio.ts';
import { knownIdsOf, loadAudio, parseAudio } from './content/audio.ts';
import { loadContent } from './content/content.ts';
import audioJson from '../data/audio.json' with { type: 'json' };
import { createRng } from './rng.ts';
import { generateItem } from './items.ts';
import type { BodyMaterial, Content, SkillDef, ZoneDef } from './content/types.ts';
import type { Vec2 } from './math.ts';
import { forceStrike, insideAwakeMoment } from './world/moments.ts';
import { DT, fieldWorld, momentLibrary, QUIET, quietField, RAID, run, standAt, struck as dormantStrike } from '../test/moment-support.ts';
import { stepWorld } from './world/step.ts';
import { placeArea, stepAreas } from './world/areas.ts';
import { offenceOf } from './world/combat.ts';
import type { GroundItem, MomentState, MonsterState, World, WorldEvent } from './world/types.ts';

const content: Content = loadContent();
const audio: AudioDef = loadAudio(content);
const AWAY: Vec2 = { x: 3, z: 4 };

function fresh(): World {
  const world: World = arena(1);
  place(world, 'mended', { x: ARENA_CENTRE.x + 6, z: ARENA_CENTRE.z });
  return world;
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
  return { id: 1, pos: { x: 5, z: 6 }, from: { x: 4, z: 6 }, content: payload, age: 0, kept: false, find: null };
}

void test('a skill starting plays its start sound where the actor stands', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = monster(world, 'mended');
  const own: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'skill_start', actorId: world.player.id, skill: skill('cleave'), direction: AWAY, windup: 0.1, recovery: 0.1 });
  assert.deepEqual(sounds(own), ['sword_swing_light']);
  assert.deepEqual(own[0]?.position, world.player.pos);
  const theirs: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'skill_start', actorId: thrall.id, skill: skill('mended_rhythm'), direction: AWAY, windup: 0.1, recovery: 0.1 });
  assert.deepEqual(sounds(theirs), ['sword_swing_heavy']);
  assert.deepEqual(theirs[0]?.position, thrall.pos);
});

void test('the hero catching fire sizzles where they stand, and a monster catching fire is silent', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = monster(world, 'mended');
  const burning: SkillDef = skill('cinder_patch');
  const own: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'burn', targetId: world.player.id, skill: burning, pos: world.player.pos, duration: 2 });
  assert.deepEqual(sounds(own), ['burn_sizzle']);
  assert.deepEqual(own[0]?.position, world.player.pos);
  assert.deepEqual(cuesForEvent(audio, world, { type: 'burn', targetId: thrall.id, skill: burning, pos: thrall.pos, duration: 2 }), []);
});

void test('a person in the world swinging a skill is heard where they stand', (): void => {
  const world: World = worldIn(content, 'hideout', 1);
  const guide = must(world.npcs.find((npc): boolean => npc.def.id === 'warden_guide'), 'the Guide');
  const swing: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'skill_start', actorId: guide.id, skill: skill('warden_sweep'), direction: AWAY, windup: 0.1, recovery: 0.1 });
  assert.deepEqual(sounds(swing), ['sword_swing_heavy']);
  assert.deepEqual(swing[0]?.position, guide.pos);
});

void test('Thunderclap landing plays a boom and a crack at the origin', (): void => {
  const world: World = fresh();
  const origin: Vec2 = { x: 10, z: 12 };
  const cues: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'skill_impact', actorId: world.player.id, team: 'player', skill: skill('thunderclap'), origin, direction: AWAY, hits: 0, echo: false });
  assert.deepEqual(sounds(cues), ['ground_boom', 'thunder_crack']);
  assert.ok(cues.every((cue: SoundCue): boolean => cue.position?.x === 10 && cue.position.z === 12));
});

void test('a hit plays what the skill and the target sound like, and a crit the crit sound', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = monster(world, 'mended');
  const base = { type: 'damage', targetId: thrall.id, sourceId: world.player.id, targetTeam: 'monster', amount: 5, killed: false, pos: thrall.pos, direction: AWAY, burn: false, shoveGraced: false } as const;
  assert.deepEqual(sounds(cuesForEvent(audio, world, { ...base, crit: false, skill: skill('cleave') })), ['bone_hit']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { ...base, crit: true, skill: skill('cleave') })), ['bone_hit', 'crit_hit']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { ...base, crit: false, skill: skill('storm_bolt') })), ['storm_bolt_hit', 'bolt_impact', 'bone_hit']);
  const hurt: readonly SoundCue[] = cuesForEvent(audio, world, { ...base, targetId: world.player.id, targetTeam: 'player', crit: false, skill: skill('mender_needle') });
  assert.deepEqual(sounds(hurt), ['hex_impact', 'hero_hurt']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { ...base, crit: false, skill: skill('storm_bolt'), burn: true })), []);
});

void test('a hit on a monster that is already gone still plays the skill sound only', (): void => {
  const world: World = fresh();
  const cues: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'damage', targetId: 99999, sourceId: world.player.id, targetTeam: 'monster', amount: 1, crit: false, killed: true, pos: AWAY, direction: AWAY, skill: skill('storm_bolt'), burn: false, shoveGraced: false });
  assert.deepEqual(sounds(cues), ['storm_bolt_hit', 'bolt_impact']);
});

void test('deaths play by who died', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = monster(world, 'mended');
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'death', actorId: thrall.id, team: 'monster', pos: thrall.pos, direction: AWAY })), ['bones_collapse']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'death', actorId: world.player.id, team: 'player', pos: world.player.pos, direction: AWAY })), ['hero_death']);
  assert.deepEqual(cuesForEvent(audio, world, { type: 'death', actorId: 99999, team: 'monster', pos: AWAY, direction: AWAY }), []);
});

void test('a kill while the streak holds a tier adds that tier\'s layer, pitched higher at every tier', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = monster(world, 'mended');
  const death: WorldEvent = { type: 'death', actorId: thrall.id, team: 'monster', pos: thrall.pos, direction: AWAY };
  const pitches: number[] = content.tailwind.tiers.map((_tier: unknown, index: number): number => {
    world.tailwind.tier = index + 1;
    const layer: SoundCue = must(cuesForEvent(audio, world, death)[1], `tier ${index + 1} layer`);
    return must(layer.pitch, 'pitch').min;
  });
  assert.ok(pitches.every((pitch: number, index: number): boolean => index === 0 || pitch > (pitches[index - 1] ?? 0)), pitches.join(' '));
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'death', actorId: world.player.id, team: 'player', pos: world.player.pos, direction: AWAY })), ['hero_death']);
  world.tailwind.tier = 0;
  assert.deepEqual(sounds(cuesForEvent(audio, world, death)), ['bones_collapse']);
});

void test('every tier rises with its own sound, a streak that fades falls softly and one ended by death is silent', (): void => {
  const world: World = fresh();
  for (let tier: number = 1; tier <= content.tailwind.tiers.length; tier += 1) assert.ok(cuesForEvent(audio, world, { type: 'tailwind_rise', tier, points: 0 }).length > 0, `tier ${tier}`);
  const end = (reason: 'faded' | 'left' | 'fell'): string[] => sounds(cuesForEvent(audio, world, { type: 'tailwind_end', reason, best: 3, points: 20, kills: 12, xp: 0, gold: 0 }));
  assert.ok(end('faded').length > 0);
  assert.deepEqual(end('fell'), []);
  assert.deepEqual(end('left'), []);
});

void test('projectiles sound when they spawn and when they run out, not when they hit', (): void => {
  const world: World = fresh();
  const bolt: SkillDef = skill('storm_bolt');
  const spawned: readonly SoundCue[] = cuesForEvent(audio, world, {
    type: 'projectile_spawn',
    projectile: { id: 1, ownerId: world.player.id, from: { x: 1, z: 2 }, team: 'player', faction: null, skill: bolt, damageMin: 1, damageMax: 2, damagePercent: 0, critChance: 0, critMultiplier: 1.5, pos: { x: 1, z: 2 }, direction: { x: 0, z: 1 }, distanceLeft: 10, pierceLeft: 0, hitIds: [] },
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
  const rare: GroundItem = ground({ kind: 'item', item: { uid: 1, base: 'rusted_blade', rarity: 'rare', level: 1, affixes: [], ledger: null } });
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
  const thrall: MonsterState = monster(world, 'mended');
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'aggro', monsterId: thrall.id })), ['bones_rattle']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'monster_spawn', monsterId: thrall.id })), ['monsters_rising']);
  for (const event of [{ type: 'xp', amount: 4, reduced: null }, { type: 'character_changed' }, { type: 'skill_interrupt', actorId: 1 }, { type: 'monster_remove', monsterId: 1 }] as const) {
    assert.deepEqual(cuesForEvent(audio, world, event), [], event.type);
  }
});

void test('quests, waypoints, flasks, respawns and cleared surges have sounds', (): void => {
  const world: World = fresh();
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'quest_started', quest: 'q' })), ['page_turn']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'quest_advanced', quest: 'q', objective: 'o' })), ['quest_update']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'quest_completed', quest: 'q' })), ['quest_update']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'waypoint_unlocked', zone: 'z' })), ['waypoint_attune', 'shimmer_faint']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'player_respawn' })), ['swell_slow']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'surge_cleared', surge: 1, delay: 3 })), ['shimmer_faint']);
});

void test('cues carry the tuning of their data entry', (): void => {
  const world: World = fresh();
  const cue: SoundCue = must(cuesForEvent(audio, world, { type: 'monster_spawn', monsterId: monster(world, 'mended').id })[0], 'monster_spawn cue');
  assert.equal(cue.cooldown, 4);
  assert.equal(cue.maxVoices, 1);
  assert.equal(cue.volume, 0.7);
});

void test('a step on a surface with a step sound of its own plays it, and a surface without one keeps the plain step', (): void => {
  const world: World = fresh();
  const tile: string = must(Object.keys(world.zone.floors)[0], 'floor tile');
  world.zone = { ...world.zone, floors: { ...world.zone.floors, [tile]: 'scorched_stone' } };
  const ash: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'hero_step', pos: ARENA_CENTRE });
  assert.deepEqual(sounds(ash), ['step_ash']);
  assert.deepEqual(ash[0]?.position, ARENA_CENTRE);
  world.zone = { ...world.zone, floors: { ...world.zone.floors, [tile]: 'cave_floor' } };
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'hero_step', pos: ARENA_CENTRE })), ['footstep_stone']);
});

void test('every lava floor a hero can walk on steps in ash, and wading through molten lava gloops', (): void => {
  for (const id of ['lava_depths', 'lava_depths_2', 'lava_depths_3']) {
    const zone: ZoneDef = must(content.zones.get(id), id);
    const walked: readonly string[] = [...new Set<string>(Object.values(zone.floors))].filter((surface: string): boolean => content.surfaces.get(surface)?.blocks !== true);
    assert.ok(walked.length > 0, id);
    for (const surface of walked) {
      const molten: boolean = content.surfaces.get(surface)?.glow?.lit === 'map';
      assert.deepEqual(audio.steps.get(surface)?.map((cue: CueDef): string => cue.sound), [molten ? 'lava_glop' : 'step_ash'], `${id} ${surface}`);
    }
  }
});

void test('walking through a real world step produces footstep cues', (): void => {
  const world: World = fresh();
  world.monsters = [];
  const cues: SoundCue[] = [];
  for (let step: number = 0; step < 90; step += 1) {
    const events: readonly WorldEvent[] = stepWorld(world, step === 0 ? [{ type: 'move', held: false, dest: { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 8 } }] : [], 1 / 60);
    for (const event of events) if (event.type === 'hero_step') cues.push(...cuesForEvent(audio, world, event));
  }
  assert.ok(cues.length >= 2);
  assert.ok(cues.every((cue: SoundCue): boolean => cue.sound === 'footstep_stone' && cue.position !== null));
});

void test('interface actions have sounds and commands map to the right action', (): void => {
  assert.deepEqual(sounds(cuesForUi(audio, 'click')), ['ui_tap']);
  assert.equal(cuesForUi(audio, 'click')[0]?.position, null);
  assert.deepEqual(sounds(cuesForUi(audio, 'skill_point')), ['ui_skill_point']);
  assert.equal(uiActionForCommand({ type: 'allocate', node: 'x' }), 'skill_point');
  assert.equal(uiActionForCommand({ type: 'equip', inventoryIndex: 0 }), 'equip');
  assert.equal(uiActionForCommand({ type: 'unequip', slot: 'weapon' }), 'equip');
  assert.equal(uiActionForCommand({ type: 'move', held: false, dest: AWAY }), null);
  assert.equal(uiActionForCommand({ type: 'stop' }), null);
});

void test('the warm list names every one-shot sound once, footsteps first and no ambience loop', (): void => {
  const ids: readonly string[] = warmSoundIds(audio);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids[0], 'footstep_stone');
  for (const id of ['sword_swing_light', 'bone_hit', 'crit_hit', 'ground_boom', 'coin_pickup', 'ui_tap', 'wave_arrival']) assert.ok(ids.includes(id), id);
  for (const zone of audio.ambience.values()) {
    for (const loop of zone.loops) assert.equal(ids.includes(loop.sound), false, loop.sound);
  }
});

void test('a sound only a stinger plays is left off the warm list, and one a skill also plays is warmed once', (): void => {
  const stinger: AmbienceStinger = { sound: 'stinger_only', volume: 0.3, minDelay: 2, maxDelay: 5, pitch: null, near: null };
  const shared: AmbienceStinger = { ...stinger, sound: 'sword_swing_light' };
  const ambience: Map<string, ZoneAmbience> = new Map<string, ZoneAmbience>([...audio.ambience, ['stinger_zone', { loops: [], stingers: [stinger, shared], score: null }]]);
  const ids: readonly string[] = warmSoundIds({ ...audio, ambience });
  assert.equal(ids.includes('stinger_only'), false);
  assert.equal(ids.filter((id: string): boolean => id === 'sword_swing_light').length, 1);
});

const STRIKE_AT: Vec2 = { x: 40, z: 47 };

function struck(): { readonly world: World; readonly moment: MomentState } {
  const world: World = worldIn(content, 'hall_of_time', 1);
  return { world, moment: must(forceStrike(world, STRIKE_AT, 'first_fire'), 'a strike') };
}

void test('a moment striking plays a thunder crack, a ground boom and the bubble forming, at the strike point, reaching across a zone', (): void => {
  const { world, moment } = struck();
  const found: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'moment_strike', moment });
  assert.deepEqual(sounds(found), ['thunder_crack', 'ground_boom', 'bubble_calm']);
  for (const cue of found) {
    assert.deepEqual(cue.position, STRIKE_AT);
    assert.ok(cue.reach > audio.defaults.reach, `${cue.sound} reaches only ${cue.reach} m`);
    assert.ok(cue.cooldown > 0 && cue.maxVoices <= 2, `${cue.sound} can stack`);
  }
});

void test('a strike with no combat, as in the mist of the In-Between, plays the same sounds, each softer', (): void => {
  const { world, moment } = struck();
  const loud: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'moment_strike', moment });
  const soft: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'moment_strike', moment: { ...moment, combat: false } });
  assert.deepEqual(sounds(soft), sounds(loud));
  soft.forEach((cue: SoundCue, index: number): void => {
    assert.ok(cue.volume < must(loud[index], 'loud cue').volume, cue.sound);
  });
});

void test('a waking moment plays the hostile sound when echoes turn, and the calm one, quieter than its strike, when none do', (): void => {
  const { world, moment } = struck();
  assert.deepEqual(sounds(cuesForEvent(audio, world, { type: 'moment_woke', moment, turned: [7] })), ['bubble_hostile']);
  const calm: SoundCue = must(cuesForEvent(audio, world, { type: 'moment_woke', moment, turned: [] })[0], 'calm wake');
  assert.equal(calm.sound, 'bubble_calm');
  const formed: SoundCue = must(cuesForEvent(audio, world, { type: 'moment_strike', moment }).find((cue: SoundCue): boolean => cue.sound === 'bubble_calm'), 'bubble forming');
  assert.ok(calm.volume < formed.volume);
});

void test('the strike sounds sit under the hit sounds', (): void => {
  const { world, moment } = struck();
  const hits: number[] = [...audio.hit.values()].flat().map((cue): number => cue.volume);
  const loudestHit: number = Math.max(...hits);
  for (const cue of cuesForEvent(audio, world, { type: 'moment_strike', moment })) assert.ok(cue.volume < loudestHit, `${cue.sound} at ${cue.volume}`);
});

function armed(world: World, base: string): void {
  world.player.equipped.weapon = must(generateItem(content, createRng(1), 1, 1, base, 'common'), base);
}

function variant(change: (draft: Record<string, unknown>) => void): AudioDef {
  const copy: unknown = JSON.parse(JSON.stringify(audioJson));
  if (typeof copy !== 'object' || copy === null) throw new Error('audio.json is not an object');
  const draft: Record<string, unknown> = Object.fromEntries(Object.entries(copy));
  change(draft);
  return parseAudio(draft, knownIdsOf(content));
}

function tableOf(draft: Record<string, unknown>, key: string): Record<string, unknown> {
  const value: unknown = draft[key];
  if (typeof value !== 'object' || value === null) throw new Error(`audio.json has no ${key}`);
  return Object.fromEntries(Object.entries(value));
}

function swung(world: World, skillId: string, from: AudioDef = audio): string[] {
  return sounds(cuesForEvent(from, world, { type: 'skill_start', actorId: world.player.id, skill: skill(skillId), direction: AWAY, windup: 0.1, recovery: 0.1 }));
}

function hitSounds(world: World, target: MonsterState, skillId: string, crit: boolean, from: AudioDef = audio): string[] {
  return sounds(cuesForEvent(from, world, { type: 'damage', targetId: target.id, sourceId: world.player.id, targetTeam: 'monster', amount: 5, crit, killed: false, pos: target.pos, direction: AWAY, skill: skill(skillId), burn: false, shoveGraced: false }));
}

void test('a swing adds a heavy layer only for heavy weapons, and an empty hand still swings', (): void => {
  const world: World = fresh();
  world.player.equipped.weapon = null;
  assert.deepEqual(swung(world, 'cleave'), ['sword_swing_light']);
  armed(world, 'stormsteel_sword');
  assert.deepEqual(swung(world, 'cleave'), ['sword_swing_light']);
  armed(world, 'woodsman_hatchet');
  assert.deepEqual(swung(world, 'cleave'), ['sword_swing_light']);
  armed(world, 'flanged_mace');
  assert.deepEqual(swung(world, 'cleave'), ['sword_swing_light', 'heavy_whoosh']);
  armed(world, 'tempest_greatsword');
  assert.deepEqual(swung(world, 'cleave'), ['sword_swing_light', 'heavy_whoosh']);
});

void test('a cue filtered by weapon kind plays only for that kind, for the shot and for the hit', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = monster(world, 'mended');
  const filtered: AudioDef = variant((draft: Record<string, unknown>): void => {
    draft['skillStart'] = { ...tableOf(draft, 'skillStart'), quarrel: [{ sound: 'bolt_whoosh', weapons: ['crossbow'] }] };
    draft['skillHit'] = { ...tableOf(draft, 'skillHit'), quarrel: [{ sound: 'bolt_impact', weapons: ['crossbow'] }, { sound: 'hit_wood', weapons: ['staff', 'blade'] }] };
  });
  armed(world, 'hand_crossbow');
  assert.deepEqual(swung(world, 'quarrel', filtered), ['bolt_whoosh']);
  assert.deepEqual(hitSounds(world, thrall, 'quarrel', false, filtered), ['bolt_impact', 'bone_hit']);
  armed(world, 'stormsteel_sword');
  assert.deepEqual(swung(world, 'quarrel', filtered), []);
  assert.deepEqual(hitSounds(world, thrall, 'quarrel', false, filtered), ['hit_wood', 'bone_hit']);
  world.player.equipped.weapon = null;
  assert.deepEqual(hitSounds(world, thrall, 'quarrel', false, filtered), ['bone_hit']);
  const theirs: readonly SoundCue[] = cuesForEvent(filtered, world, { type: 'damage', targetId: world.player.id, sourceId: thrall.id, targetTeam: 'player', amount: 5, crit: false, killed: false, pos: AWAY, direction: AWAY, skill: skill('quarrel'), burn: false, shoveGraced: false });
  assert.deepEqual(sounds(theirs), ['hero_hurt']);
});

void test('a hit picks the sound of the monster itself, else of what the target is made of', (): void => {
  const world: World = fresh();
  const expected: Readonly<Record<BodyMaterial, string>> = { flesh: 'hit_flesh', bone: 'bone_hit', hide: 'hit_flesh', chitin: 'hit_flesh', armour: 'hit_flesh' };
  for (const def of content.monsters.values()) {
    const target: MonsterState = place(world, def.id, { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
    const heard: string[] = hitSounds(world, target, 'cleave', false);
    assert.equal(heard.length, 1, def.id);
    assert.equal(heard[0], audio.hit.get(def.id)?.[0]?.sound ?? expected[def.bodyMaterial], def.id);
  }
});

void test('a monster with no sound of its own or for its material falls back, and nothing goes silent', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = monster(world, 'mended');
  const bare: AudioDef = variant((draft: Record<string, unknown>): void => {
    draft['hit'] = { fallback: [{ sound: 'hit_wood' }] };
    draft['critHit'] = { fallback: [{ sound: 'crit_hit' }] };
  });
  assert.deepEqual(hitSounds(world, thrall, 'cleave', true, bare), ['hit_wood', 'crit_hit']);
  const specific: AudioDef = variant((draft: Record<string, unknown>): void => {
    draft['hit'] = { fallback: [{ sound: 'hit_wood' }], bone: [{ sound: 'bone_hit' }], mended: [{ sound: 'body_fall' }] };
  });
  assert.deepEqual(hitSounds(world, thrall, 'cleave', false, specific), ['body_fall']);
  const mender: MonsterState = place(world, 'mender', { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
  assert.deepEqual(hitSounds(world, mender, 'cleave', false, specific), ['bone_hit']);
});

void test('a layer whose cues are all filtered out for the weapon is skipped, not silent', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = monster(world, 'mended');
  const filtered: AudioDef = variant((draft: Record<string, unknown>): void => {
    draft['hit'] = { mended: [{ sound: 'body_fall', weapons: ['blade'] }], bone: [{ sound: 'bone_hit' }], fallback: [{ sound: 'hit_wood' }] };
  });
  armed(world, 'stormsteel_sword');
  assert.deepEqual(hitSounds(world, thrall, 'cleave', false, filtered), ['body_fall']);
  armed(world, 'woodsman_hatchet');
  assert.deepEqual(hitSounds(world, thrall, 'cleave', false, filtered), ['bone_hit']);
  const noBone: AudioDef = variant((draft: Record<string, unknown>): void => {
    draft['hit'] = { mended: [{ sound: 'body_fall', weapons: ['blade'] }], fallback: [{ sound: 'hit_wood' }] };
  });
  assert.deepEqual(hitSounds(world, thrall, 'cleave', false, noBone), ['hit_wood']);
});

void test('a crit adds to the hit instead of replacing it', (): void => {
  const world: World = fresh();
  const wolf: MonsterState = place(world, 'wolf', { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
  assert.deepEqual(hitSounds(world, wolf, 'cleave', false), ['hit_flesh']);
  assert.deepEqual(hitSounds(world, wolf, 'cleave', true), ['hit_flesh', 'crit_hit']);
});

void test('the shield sound plays only when the sim reports a blocked or broken guard', (): void => {
  const world: World = fresh();
  const brute: MonsterState = place(world, 'unfinished_brute', { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
  assert.ok(!hitSounds(world, brute, 'cleave', false).includes('hit_shield'));
  assert.ok(!hitSounds(world, brute, 'cleave', true).includes('hit_shield'));
  const guard = { type: 'guarded', monsterId: brute.id, pos: brute.pos, direction: AWAY } as const;
  assert.deepEqual(sounds(cuesForEvent(audio, world, { ...guard, broken: false })), ['hit_shield']);
  assert.deepEqual(sounds(cuesForEvent(audio, world, { ...guard, broken: true })), ['hit_shield']);
  assert.deepEqual(cuesForEvent(audio, world, { ...guard, broken: false })[0]?.position, brute.pos);
});

void test('no sound id the data names for a weapon hit is the shield sound unless it is guarded', (): void => {
  const named: string[] = [...audio.hit.values(), ...audio.critHit.values(), ...audio.skillHit.values(), ...audio.death.values()].flatMap((list): string[] => list.map((entry): string => entry.sound));
  assert.ok(!named.includes('hit_shield'));
});

void test('the flask drink is one short cork-and-gulp sound at the hero', (): void => {
  const world: World = fresh();
  const drunk: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'flask_used', slot: 0, flask: 'life', resource: 'life', pos: world.player.pos });
  assert.deepEqual(sounds(drunk), ['flask_drink']);
  assert.deepEqual(drunk[0]?.position, world.player.pos);
});

void test('a portal opens with a sound where it stands, the step through and the arrival travel, and a closing portal is silent', (): void => {
  const world: World = fresh();
  const stage = (kind: 'opened' | 'entered' | 'arrived' | 'closed' | 'channel'): readonly SoundCue[] => cuesForEvent(audio, world, { type: 'portal', stage: kind, zone: 'hideout', pos: AWAY });
  assert.deepEqual(sounds(stage('opened')), ['portal_open']);
  assert.deepEqual(stage('opened')[0]?.position, AWAY);
  assert.deepEqual(sounds(stage('entered')), ['portal_travel']);
  assert.deepEqual(sounds(stage('arrived')), ['portal_travel']);
  assert.ok((stage('arrived')[0]?.volume ?? 1) < (stage('entered')[0]?.volume ?? 0));
  assert.deepEqual(stage('closed'), []);
  assert.deepEqual(stage('channel'), []);
});

void test('the shadow, water and fire skills each have their own sound, and the Millwheel and the Riptide roll are told apart by their form and the whirl swings like Cleave', (): void => {
  const world: World = fresh();
  const starts = (id: string): string[] => sounds(cuesForEvent(audio, world, { type: 'skill_start', actorId: world.player.id, skill: skill(id), direction: AWAY, windup: 0.1, recovery: 0.1 }));
  assert.deepEqual(starts('umbra'), ['shadow_cast']);
  const formed = (id: string, form: string): string[] => sounds(cuesForEvent(audio, world, { type: 'skill_start', actorId: world.player.id, skill: { ...skill(id), form }, direction: AWAY, windup: 0.1, recovery: 0.1 }));
  assert.deepEqual(formed('cleave', 'cleave_millwheel'), ['millwheel_whoosh', 'water_sweep']);
  assert.deepEqual(formed('dodge_roll', 'dodge_roll_riptide'), ['water_cast', 'dodge_whoosh']);
  assert.deepEqual(formed('cleave', 'cleave_whirl'), starts('cleave'));
  assert.deepEqual(formed('dodge_roll', 'dodge_roll'), starts('dodge_roll'));
  const lands = (id: string): string[] => sounds(cuesForEvent(audio, world, { type: 'skill_impact', actorId: world.player.id, team: 'player', skill: skill(id), origin: AWAY, direction: AWAY, hits: 0, echo: false }));
  assert.deepEqual(lands('riptide_wake'), ['water_douse']);
  assert.deepEqual(lands('gathered_embers'), ['fire_ignite']);
});

void test('the mite bite is a quiet pop, not the roll whoosh', (): void => {
  const world: World = fresh();
  const bite: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'skill_start', actorId: world.player.id, skill: skill('mite_bite'), direction: AWAY, windup: 0.1, recovery: 0.1 });
  assert.deepEqual(sounds(bite), ['lava_bubble']);
  assert.ok((bite[0]?.volume ?? 1) <= 0.5);
});

void test('Standing Storm crackles and rumbles when it starts, crackles quietly on each pulse, snaps once for a pulse that strikes however many it hits, and fades when it ends', (): void => {
  const world: World = fresh();
  const storm: SkillDef = skill('standing_storm');
  const lists = (): SoundCue[][] => world.events.splice(0).flatMap((event: WorldEvent): SoundCue[][] => (event.type === 'area' ? [[...cuesForEvent(audio, world, event)]] : []));
  const names = (): string[][] => lists().map(sounds);
  world.events.length = 0;
  placeArea(world, offenceOf(world.player), storm, world.player.pos);
  assert.deepEqual(names(), [['storm_hum', 'spark_tick']]);
  stepAreas(world, 0.5);
  const quiet: SoundCue[][] = lists();
  assert.deepEqual(quiet.map(sounds), [['spark_tick']]);
  assert.ok((quiet[0]?.[0]?.volume ?? 1) <= 0.15);
  assert.ok((quiet[0]?.[0]?.cooldown ?? 0) >= 1.5);
  for (const spot of [1, 1.5, 2]) place(world, 'mended', { x: world.player.pos.x + spot, z: world.player.pos.z + 1 });
  stepAreas(world, 0.5);
  assert.deepEqual(names(), [['spark_tick', 'spark_snap']]);
  stepAreas(world, 5);
  assert.deepEqual(names().at(-1), ['storm_fade']);
});

void test('a lasting area sounds from its own form, a crackle sounds on its pulse, and a flare adds its strike sound', (): void => {
  const world: World = fresh();
  const owner: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const cuesOf = (id: string, stage: 'start' | 'pulse' | 'end', hits: number, pulses: number = 0): readonly SoundCue[] => cuesForEvent(audio, world, { type: 'area', area: { id: 1, ownerId: world.player.id, from: owner, skill: skill(id), offence: offenceOf(world.player), pos: owner, toward: { x: 0, z: 1 }, reach: 0, timeLeft: 1, pulseLeft: 1, pulses }, stage, hits });
  const area = (id: string, stage: 'start' | 'pulse' | 'end', hits: number): string[] => sounds(cuesOf(id, stage, hits));
  assert.deepEqual(area('thunderclap_gathered', 'pulse', 0), []);
  assert.deepEqual(area('thunderclap_gathered', 'pulse', 2), ['slam_heavy']);
  assert.deepEqual(area('banked_fire', 'start', 0), ['fire_ignite']);
  assert.deepEqual(area('banked_fire', 'pulse', 0), ['ember_bed']);
  assert.deepEqual(area('banked_fire', 'pulse', 2), ['ember_bed', 'flare_crackle']);
  assert.deepEqual(area('banked_fire', 'end', 0), ['fire_extinguish']);
  assert.deepEqual(area('gathered_embers', 'end', 0), ['fire_extinguish']);
  assert.deepEqual(area('cinder_patch', 'start', 0), ['fire_ignite']);
  assert.deepEqual(area('cinder_patch', 'pulse', 1), ['ember_bed', 'flare_crackle']);
  assert.deepEqual(area('umbra', 'start', 0), ['shade_hush']);
  assert.deepEqual(area('umbra', 'pulse', 1), ['shade_hush', 'shade_breath']);
  assert.deepEqual(area('umbra', 'end', 0), ['shadow_cast']);
  assert.deepEqual(area('ground_heat', 'start', 0), []);
});

void test('Banked Fire crackles brighter with every strike of its stoke, up to its limit, and an area without a stoke never changes pitch', (): void => {
  const world: World = fresh();
  const owner: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const flare = (id: string, pulses: number): SoundCue | undefined => cuesForEvent(audio, world, { type: 'area', area: { id: 1, ownerId: world.player.id, from: owner, skill: skill(id), offence: offenceOf(world.player), pos: owner, toward: { x: 0, z: 1 }, reach: 0, timeLeft: 1, pulseLeft: 1, pulses }, stage: 'pulse', hits: 1 }).find((cue: SoundCue): boolean => cue.sound === 'flare_crackle');
  const cold: number = flare('banked_fire', 0)?.pitch?.min ?? 0;
  const warm: number = flare('banked_fire', 3)?.pitch?.min ?? 0;
  const hot: number = flare('banked_fire', 5)?.pitch?.min ?? 0;
  const past: number = flare('banked_fire', 9)?.pitch?.min ?? 0;
  assert.ok(cold > 0 && cold < warm && warm < hot);
  assert.equal(past, hot);
  assert.deepEqual(flare('gathered_embers', 0)?.pitch, flare('gathered_embers', 5)?.pitch);
});

void test('a brand sounds when it lands and when it bursts, and the Timekeeper count is heard when it comes due', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = monster(world, 'mended');
  const brand = (id: string, burst: boolean): string[] => sounds(cuesForEvent(audio, world, { type: 'brand', targetId: thrall.id, skill: skill(id), pos: thrall.pos, burst }));
  assert.deepEqual(brand('static_brand', false), ['spell_flick']);
  assert.deepEqual(brand('static_brand_burst', true), ['bolt_impact', 'brand_burst']);
  assert.deepEqual(brand('tally_due', true), ['tally_due']);
});

void test('a crossbow shot and its changes sound as shots, the heavy one weightier, and the ground flare of a Shoulder Through lands with fire', (): void => {
  const world: World = fresh();
  armed(world, 'hand_crossbow');
  assert.deepEqual(swung(world, 'quarrel'), ['crossbow_shot']);
  assert.deepEqual(swung(world, 'quarrel_fan'), ['crossbow_shot']);
  assert.deepEqual(swung(world, 'quarrel_heave'), ['crossbow_heavy']);
  const flies = (id: string): string[] => sounds(cuesForEvent(audio, world, { type: 'projectile_spawn', projectile: { id: 1, ownerId: world.player.id, from: AWAY, team: 'player', faction: null, skill: skill(id), damageMin: 1, damageMax: 2, damagePercent: 0, critChance: 0, critMultiplier: 1.5, pos: AWAY, direction: { x: 0, z: 1 }, distanceLeft: 10, pierceLeft: 0, hitIds: [] } }));
  assert.deepEqual(flies('quarrel'), []);
  assert.deepEqual(flies('quarrel_fan'), ['bolt_flight']);
  assert.deepEqual(flies('quarrel_heave'), ['bolt_flight']);
  const lands: readonly SoundCue[] = cuesForEvent(audio, world, { type: 'skill_impact', actorId: world.player.id, team: 'player', skill: skill('shoulder_flare'), origin: AWAY, direction: AWAY, hits: 0, echo: true });
  assert.deepEqual(sounds(lands), ['fire_ignite', 'ground_boom']);
});

void test('the bubble sound and the muffled bed follow the hero into a woken bubble', (): void => {
  const world: World = fieldWorld(quietField());
  const moment: MomentState = dormantStrike(world, QUIET.id);
  assert.equal(insideAwakeMoment(world), false);
  standAt(world, moment.pos);
  const events: WorldEvent[] = run(world, DT * 2);
  assert.equal(insideAwakeMoment(world), true);
  const woke: WorldEvent | undefined = events.find((event: WorldEvent): boolean => event.type === 'moment_woke');
  assert.ok(woke !== undefined);
  assert.deepEqual(cuesForEvent(loadAudio(world.content), world, woke).map((cue): string => cue.sound), ['bubble_calm']);
  world.player.pos = { x: moment.pos.x + moment.def.radius + 5, z: moment.pos.z };
  assert.equal(insideAwakeMoment(world), false);
});

void test('a bubble that turns its echoes opens with the hostile sound', (): void => {
  const world: World = fieldWorld(quietField({ table: [{ moment: RAID.id, weight: 1 }] }), momentLibrary([RAID]));
  const moment: MomentState = must(forceStrike(world, { x: 40, z: 40 }, RAID.id), 'strike');
  run(world, world.content.moments.telegraph + DT * 2);
  standAt(world, moment.pos);
  const events: WorldEvent[] = run(world, DT * 2);
  const woke: WorldEvent | undefined = events.find((event: WorldEvent): boolean => event.type === 'moment_woke' && event.turned.length > 0);
  assert.ok(woke !== undefined);
  assert.deepEqual(cuesForEvent(loadAudio(world.content), world, woke).map((cue): string => cue.sound), ['bubble_hostile']);
});

function wave(spent: number): SkillDef {
  return { ...skill('millrace'), spent };
}

void test('Millrace surges as it leaves and crashes where it strikes, louder for the momentum spent into it, with the heavy crash almost silent from a cold start', (): void => {
  const world: World = fresh();
  const thrall: MonsterState = monster(world, 'mended');
  const leaves = (spent: number): readonly SoundCue[] => cuesForEvent(audio, world, { type: 'projectile_spawn', projectile: { id: 1, ownerId: world.player.id, from: AWAY, team: 'player', faction: null, skill: wave(spent), damageMin: 1, damageMax: 2, damagePercent: 0, critChance: 0, critMultiplier: 1.5, pos: AWAY, direction: { x: 0, z: 1 }, distanceLeft: 10, pierceLeft: 99, hitIds: [] } });
  const strikes = (spent: number): readonly SoundCue[] => cuesForEvent(audio, world, { type: 'damage', targetId: thrall.id, sourceId: world.player.id, targetTeam: 'monster', amount: 5, crit: false, killed: false, pos: thrall.pos, direction: AWAY, skill: wave(spent), burn: false, shoveGraced: false }).slice(0, 2);
  assert.deepEqual(sounds(leaves(0)), ['water_surge']);
  assert.deepEqual(sounds(strikes(0)), ['water_crash', 'water_crash_heavy']);
  const cold: number = must(leaves(0)[0], 'cold surge').volume;
  const full: number = must(leaves(1)[0], 'full surge').volume;
  assert.ok(cold < full);
  assert.ok(Math.abs(full - must(audio.projectileSpawn.get('millrace')?.[0], 'surge cue').volume) < 1e-9);
  const heavyCold: number = must(strikes(0)[1], 'cold crash').volume;
  const heavyFull: number = must(strikes(1)[1], 'full crash').volume;
  assert.ok(heavyCold < heavyFull * 0.15);
  assert.ok(must(strikes(0.5)[0], 'half crash').volume < must(strikes(1)[0], 'full crash').volume);
});
