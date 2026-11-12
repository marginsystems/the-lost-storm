import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena, ARENA_CENTRE, place } from '../../test/arena-support.ts';
import { finishQuests, must } from '../../test/support.ts';
import type { GlitchDef, GlitchKind } from '../content/glitches.ts';
import { loadContent } from '../content/content.ts';
import { loadGlitches } from '../content/glitches.ts';
import type { Content, ZoneExit } from '../content/types.ts';
import { distance } from '../math.ts';
import { readSave, toSave } from '../save.ts';
import { createWorld } from './create.ts';
import { CALM, glitchBlock, heldCommands, requestGlitch, setGlitchesEnabled, stageOf, stepGlitch, storyProgress } from './glitch.ts';
import { pendingOffer } from './learning.ts';
import { forceStrike } from './moments.ts';
import { attacksHeld } from './glitch-hold.ts';
import type { GlitchRequest } from './glitch-types.ts';
import { stepWorld } from './step.ts';
import type { MomentState, MonsterState, World, WorldEvent } from './types.ts';
import { travelThrough } from './zones.ts';

const content: Content = loadContent();
const DT: number = 1 / 30;
const MINUTES: number = 20;

type EventOf<T extends WorldEvent['type']> = Extract<WorldEvent, { readonly type: T }>;

function ofType<T extends WorldEvent['type']>(events: readonly WorldEvent[], type: T): EventOf<T>[] {
  return events.filter((event: WorldEvent): event is EventOf<T> => event.type === type);
}

function run(world: World, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) events.push(...stepWorld(world, [], DT));
  return events;
}

function combat(kind: GlitchKind): GlitchRequest {
  return { kind, source: 'combat', trigger: null };
}

function fight(seed: number): { readonly world: World; readonly thrall: MonsterState } {
  const world: World = arena(seed);
  const thrall: MonsterState = place(world, 'mended', { x: ARENA_CENTRE.x + 1.4, z: ARENA_CENTRE.z });
  return { world, thrall };
}

function keepFighting(world: World): void {
  for (const monster of world.monsters) {
    monster.alive = true;
    monster.aggro = true;
  }
}

function glitchOnly(world: World, seconds: number, tick: number, between: (world: World) => void = (): void => undefined): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(seconds / tick); step += 1) {
    between(world);
    world.events = [];
    world.time += tick;
    stepGlitch(world, tick);
    events.push(...world.events);
  }
  return events;
}

function harmlessFight(seed: number, progress: number): World {
  const { world, thrall } = fight(seed);
  thrall.pos = { x: ARENA_CENTRE.x + 6, z: ARENA_CENTRE.z };
  world.glitch.progress = progress;
  return world;
}

void test('a hard cut never hides a fight, not even when asked for directly', (): void => {
  const { world } = fight(1);
  assert.equal(glitchBlock(world, { kind: 'hard_cut', source: 'debug', trigger: null }), 'fight');
  assert.equal(glitchBlock(world, combat('quiet_pass')), 'fight');
  assert.equal(glitchBlock(world, { kind: 'quiet_pass', source: 'zone', trigger: null }), 'fight');
  assert.equal(glitchBlock(world, combat('stutter')), null);
  requestGlitch(world, 'hard_cut', 'debug');
  assert.equal(ofType(run(world, 1), 'glitch_start').length, 0);
});

void test('the seconds after a blow still count as a fight', (): void => {
  const world: World = harmlessFight(11, 4);
  world.monsters = [];
  world.time = CALM.arrival + 1;
  world.events = [{ type: 'damage', targetId: world.player.id, sourceId: 0, targetTeam: 'player', amount: 1, crit: false, killed: false, pos: world.player.pos, direction: { x: 1, z: 0 }, skill: must(content.skills.get('cleave'), 'cleave') }];
  stepGlitch(world, 0);
  assert.equal(glitchBlock(world, { kind: 'hard_cut', source: 'story', trigger: null }), 'fight');
  world.time += CALM.fightQuiet + 0.1;
  assert.equal(glitchBlock(world, { kind: 'hard_cut', source: 'story', trigger: null }), null);
});

void test('a hard cut waits out the first minute in a zone, never comes soon after another, and never lasts long', (): void => {
  const world: World = harmlessFight(12, 4);
  world.monsters = [];
  const story: GlitchRequest = { kind: 'hard_cut', source: 'story', trigger: null };
  const zone: GlitchRequest = { kind: 'hard_cut', source: 'zone', trigger: null };
  assert.equal(glitchBlock(world, story), 'arrival');
  assert.equal(glitchBlock(world, zone), 'arrival');
  world.time = CALM.arrival + 1;
  assert.equal(glitchBlock(world, story), null);
  requestGlitch(world, 'hard_cut', 'story');
  const start: EventOf<'glitch_start'> = must(ofType(glitchOnly(world, DT, DT), 'glitch_start')[0], 'hard cut');
  assert.ok(start.duration <= CALM.mistCap);
  glitchOnly(world, start.duration + 1, DT);
  world.time = world.glitch.readyAt;
  assert.equal(glitchBlock(world, story), 'spacing');
  assert.equal(glitchBlock(world, zone), 'spacing');
  world.time = world.glitch.lastMist + CALM.mistGap;
  assert.equal(glitchBlock(world, story), null);
});

void test('a hard cut waits while a moment fight is awake or a skill choice is open', (): void => {
  const world: World = harmlessFight(13, 4);
  const thrall: MonsterState = must(world.monsters[0], 'thrall');
  thrall.aggro = false;
  thrall.pos = { x: ARENA_CENTRE.x + 40, z: ARENA_CENTRE.z };
  world.time = CALM.arrival + 1;
  const story: GlitchRequest = { kind: 'hard_cut', source: 'story', trigger: null };
  assert.equal(glitchBlock(world, story), null);
  const def = must([...content.moments.defs.values()][0], 'a moment');
  const moment: MomentState = must(forceStrike(world, thrall.pos, def.id), 'moment');
  moment.phase = 'awake';
  moment.figures.splice(0, moment.figures.length, { echo: 0, pos: thrall.pos, facing: 0, turned: true, monsterId: thrall.id });
  assert.equal(glitchBlock(world, story), 'fight');
  world.moments = [];
  world.flags['first_moment'] = 'cleared';
  assert.notEqual(pendingOffer(world), null);
  assert.equal(glitchBlock(world, story), 'choice');
});

void test('monster attacks wait out the glitch and its grace, then resume', (): void => {
  const { world, thrall } = fight(2);
  requestGlitch(world, 'stutter', 'debug');
  const first: WorldEvent[] = stepWorld(world, [], DT);
  assert.equal(ofType(first, 'glitch_start')[0]?.kind, 'stutter');
  const held: number = world.glitch.def.stutter + world.glitch.def.rules.grace;
  const during: WorldEvent[] = run(world, held - DT * 2);
  assert.equal(ofType(during, 'skill_start').filter((event): boolean => event.actorId === thrall.id).length, 0);
  assert.equal(attacksHeld(world), true);
  const after: WorldEvent[] = run(world, 3);
  assert.equal(attacksHeld(world), false);
  assert.ok(ofType(after, 'skill_start').some((event): boolean => event.actorId === thrall.id));
});

void test('a glitch waits while the hero is below the life threshold or a lethal blow is winding up', (): void => {
  const { world, thrall } = fight(3);
  world.player.life = world.player.maxLife * world.glitch.def.rules.minLifeFraction * 0.9;
  assert.equal(glitchBlock(world, combat('hard_cut')), 'low_life');
  world.player.life = world.player.maxLife;
  for (let step: number = 0; step < 200 && thrall.action?.phase !== 'windup'; step += 1) stepWorld(world, [], DT);
  assert.equal(thrall.action?.phase, 'windup');
  assert.equal(glitchBlock(world, combat('stutter')), null);
  world.player.life = thrall.damageMax;
  assert.equal(glitchBlock(world, combat('hard_cut')), 'telegraph');
  requestGlitch(world, 'hard_cut', 'debug');
  assert.equal(ofType(stepWorld(world, [], 0), 'glitch_start').length, 0);
  assert.equal(world.glitch.requests.length, 1);
});

void test('a boss winding up any blow holds every glitch back, even at full life', (): void => {
  const boss: string = must([...content.monsters.values()].find((def): boolean => def.boss !== null), 'a boss').id;
  const world: World = arena(4);
  const monster: MonsterState = place(world, boss, { x: ARENA_CENTRE.x + 1.6, z: ARENA_CENTRE.z });
  world.player.invulnerable = 60;
  for (let step: number = 0; step < 600 && monster.action?.phase !== 'windup'; step += 1) stepWorld(world, [], DT);
  assert.equal(monster.action?.phase, 'windup');
  world.player.life = world.player.maxLife;
  assert.equal(glitchBlock(world, combat('stutter')), 'telegraph');
});

void test('two glitches never come within the cooldown, but a debug request may', (): void => {
  const world: World = harmlessFight(5, 0);
  world.glitch.requests.push(combat('stutter'));
  glitchOnly(world, world.glitch.def.stutter + DT * 3, DT);
  assert.equal(world.glitch.active, null);
  assert.equal(glitchBlock(world, combat('stutter')), 'cooldown');
  assert.equal(glitchBlock(world, { kind: 'stutter', source: 'debug', trigger: null }), null);
  assert.equal(glitchBlock(world, { kind: 'quiet_pass', source: 'zone', trigger: null }), 'cooldown');
  world.time = world.glitch.readyAt;
  assert.equal(glitchBlock(world, combat('stutter')), null);
});

void test('silhouettes stand where the hero once stood in this zone when those spots are in sight', (): void => {
  const world: World = finishQuests(world0());
  stepWorld(world, [], DT);
  const hero = world.player.pos;
  const near: number = world.glitch.def.silhouettes.near + 1;
  for (let index: number = 0; index < 20; index += 1) world.path.entries.push({ t: index, zone: world.zone.id, x: hero.x + near, z: hero.z + index * 0.1, act: 'step' });
  world.path.clock = 500;
  world.glitch.progress = 4;
  world.glitch.requests.push({ kind: 'quiet_pass', source: 'zone', trigger: null });
  world.events = [];
  stepGlitch(world, 0);
  const start: EventOf<'glitch_start'> = must(ofType(world.events, 'glitch_start')[0], 'quiet pass');
  assert.ok(start.silhouettes.length > 0);
  for (const shade of start.silhouettes) assert.ok(world.path.entries.some((entry): boolean => entry.x === shade.x && entry.z === shade.z));
});

void test('a hard cut with nothing else to change still names its one edit: the hero turned', (): void => {
  const world: World = harmlessFight(14, 1);
  world.monsters = [];
  world.zone = { ...world.zone, props: [] };
  requestGlitch(world, 'hard_cut', 'debug');
  const start: EventOf<'glitch_start'> = must(ofType(glitchOnly(world, DT, DT), 'glitch_start')[0], 'hard cut');
  assert.equal(start.edit, 'hero_turn');
});

void test('the glitch setting reaches the world as a command', (): void => {
  const world: World = harmlessFight(15, 0);
  stepWorld(world, [{ type: 'glitch_setting', enabled: false }], DT);
  assert.equal(world.glitch.enabled, false);
  stepWorld(world, [{ type: 'glitch_setting', enabled: true }], DT);
  assert.equal(world.glitch.enabled, true);
});

void test('a quiet pass starts the cooldown like any other glitch', (): void => {
  const world: World = harmlessFight(5, 4);
  world.monsters = [];
  world.glitch.requests.push({ kind: 'quiet_pass', source: 'zone', trigger: null });
  glitchOnly(world, world.glitch.def.quietPass + DT * 3, DT);
  assert.equal(world.glitch.active, null);
  assert.equal(glitchBlock(world, combat('stutter')), 'cooldown');
});

void test('the debug command asks for a glitch through the world step', (): void => {
  const world: World = harmlessFight(13, 0);
  const events: WorldEvent[] = stepWorld(world, [{ type: 'glitch', kind: 'stutter' }], DT);
  assert.equal(ofType(events, 'glitch_start')[0]?.kind, 'stutter');
});

void test('the story decides how often glitches come and which kinds, and the same seed gives the same glitches', (): void => {
  const early: WorldEvent[] = ofType(glitchOnly(harmlessFight(6, 0), MINUTES * 60, 0.25, keepFighting), 'glitch_start');
  const late: WorldEvent[] = ofType(glitchOnly(harmlessFight(6, 4), MINUTES * 60, 0.25, keepFighting), 'glitch_start');
  const again: WorldEvent[] = ofType(glitchOnly(harmlessFight(6, 4), MINUTES * 60, 0.25, keepFighting), 'glitch_start');
  assert.ok(early.length > 0, `early ${early.length} late ${late.length}`);
  assert.ok(late.length > early.length, `early ${early.length} late ${late.length}`);
  assert.deepEqual(again, late);
  assert.equal(ofType(late, 'glitch_start').some((event): boolean => event.kind === 'hard_cut' || event.kind === 'quiet_pass'), false);
});

function world0(): World {
  return createWorld(content, { seed: 1, save: null });
}

const done = (quest: string): { readonly type: 'quest'; readonly quest: string; readonly is: 'done'; readonly not: false } => ({ type: 'quest', quest, is: 'done', not: false });
const STAGED: GlitchDef = {
  ...loadGlitches(),
  progress: [
    { value: 1, when: [done('out_of_the_mist')] },
    { value: 2, when: [done('to_the_waystation')] },
    { value: 4, when: [done('out_of_the_mist'), done('to_the_waystation')] },
  ],
};

function lateWorld(seed: number, save: ReturnType<typeof readSave> = null): World {
  return createWorld(content, { seed, save, glitches: STAGED });
}

void test('story progress comes from quests, never falls, and travels in the save', (): void => {
  const partial: World = lateWorld(1);
  partial.quests = { out_of_the_mist: must(content.quests.get('out_of_the_mist'), 'quest').objectives.length };
  assert.equal(storyProgress(partial), 1);
  partial.quests = { to_the_waystation: must(content.quests.get('to_the_waystation'), 'quest').objectives.length };
  assert.equal(storyProgress(partial), 2);
  const world: World = finishQuests(lateWorld(1));
  assert.equal(storyProgress(world), 4);
  stepWorld(world, [], DT);
  assert.equal(world.glitch.progress, 4);
  world.quests = {};
  assert.equal(storyProgress(world), 4);
  const loaded: World = lateWorld(2, readSave(content, JSON.parse(JSON.stringify(toSave(world)))));
  assert.equal(loaded.glitch.progress, 4);
  const plain: World = finishQuests(world0());
  assert.equal(storyProgress(plain), 1);
});

void test('a story trigger waits for its moment, fires once, and stays fired after a save', (): void => {
  const world: World = harmlessFight(7, 0);
  world.quests = { to_the_waystation: must(content.quests.get('to_the_waystation'), 'quest').objectives.length };
  for (const monster of world.monsters) monster.aggro = true;
  assert.equal(ofType(glitchOnly(world, 2, DT), 'glitch_start').length, 0);
  for (const monster of world.monsters) monster.aggro = false;
  world.time = CALM.arrival + 1;
  const fired: EventOf<'glitch_start'>[] = ofType(glitchOnly(world, DT, DT), 'glitch_start');
  assert.equal(fired[0]?.kind, 'hard_cut');
  assert.deepEqual(world.glitch.fired, ['first_seam']);
  const loaded: World = createWorld(content, { seed: 8, save: readSave(content, JSON.parse(JSON.stringify(toSave(world)))) });
  assert.deepEqual(loaded.glitch.fired, ['first_seam']);
  glitchOnly(world, 120, 1);
  assert.equal(world.glitch.requests.some((request: GlitchRequest): boolean => request.trigger === 'first_seam'), false);
});

void test('late in the story every zone change passes through the mist, with silhouettes from the hero’s own path', (): void => {
  const world: World = finishQuests(lateWorld(1));
  stepWorld(world, [], DT);
  for (let index: number = 0; index < 30; index += 1) world.path.entries.push({ t: index, zone: world.zone.id, x: 10 + index, z: 30, act: 'step' });
  world.path.clock = 500;
  const exit: ZoneExit = must(world.zone.exits[0], 'an exit');
  world.events = [];
  travelThrough(world, exit);
  stepGlitch(world, 0);
  const start: EventOf<'glitch_start'> = must(ofType(world.events, 'glitch_start')[0], 'quiet pass');
  assert.equal(start.kind, 'quiet_pass');
  assert.equal(start.duration, world.glitch.def.quietPass);
  assert.equal(start.silhouettes.length, stageOf(world.glitch.def, 4).silhouettes);
  for (const shade of start.silhouettes) {
    const gap: number = distance(shade, world.player.pos);
    assert.ok(gap >= world.glitch.def.silhouettes.near - 1e-6 && gap <= world.glitch.def.silhouettes.far + 1e-6);
  }
  assert.equal(ofType(world.events, 'silence')[0]?.duration, start.duration);
});

void test('early in the story a zone change stays clear of the mist', (): void => {
  const world: World = world0();
  const exit: ZoneExit = must(world.zone.exits[0], 'an exit');
  world.events = [];
  travelThrough(world, exit);
  stepGlitch(world, 0);
  assert.equal(ofType(world.events, 'glitch_start').length, 0);
});

void test('in the mist the hero stands still and worldly commands are dropped', (): void => {
  const { world } = fight(9);
  world.monsters = [];
  requestGlitch(world, 'hard_cut', 'debug');
  stepWorld(world, [], DT);
  const before = { ...world.player.pos };
  assert.deepEqual(heldCommands(world, [{ type: 'move', held: false, dest: { x: 2, z: 2 } }, { type: 'stop' }]), [{ type: 'stop' }]);
  run(world, 0.5);
  stepWorld(world, [{ type: 'move', held: false, dest: { x: before.x + 6, z: before.z } }], DT);
  run(world, 0.3);
  assert.ok(distance(world.player.pos, before) < 0.5);
});

void test('the hero faces the other way only when the cut ends', (): void => {
  const { world } = fight(10);
  world.monsters = [];
  world.glitch.progress = 0;
  const facing: number = world.player.facing;
  requestGlitch(world, 'hard_cut', 'debug');
  const start: EventOf<'glitch_start'> = must(ofType(stepWorld(world, [], DT), 'glitch_start')[0], 'hard cut');
  assert.equal(start.edit, 'hero_turn');
  assert.equal(world.player.facing, facing);
  run(world, start.duration + DT);
  assert.ok(Math.abs(Math.cos(world.player.facing - facing) + 1) < 1e-9);
});

void test('turned off, nothing fires on its own, but a debug request still does', (): void => {
  const world: World = harmlessFight(11, 4);
  setGlitchesEnabled(world, false);
  assert.equal(ofType(glitchOnly(world, 600, 1), 'glitch_start').length, 0);
  requestGlitch(world, 'stutter', 'debug');
  assert.equal(ofType(glitchOnly(world, DT, DT), 'glitch_start').length, 1);
});

void test('a wrong word arms the next line instead of taking the hero anywhere', (): void => {
  const world: World = harmlessFight(12, 0);
  requestGlitch(world, 'wrong_word', 'debug');
  const events: WorldEvent[] = glitchOnly(world, DT, DT);
  assert.equal(ofType(events, 'glitch_start')[0]?.kind, 'wrong_word');
  assert.notEqual(world.glitch.wrongWord, null);
  assert.equal(world.glitch.active, null);
  assert.equal(ofType(events, 'silence').length, 0);
});
