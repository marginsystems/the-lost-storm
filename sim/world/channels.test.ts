import assert from 'node:assert/strict';
import { test } from 'node:test';
import { faceAt } from '../../test/facing-support.ts';
import { must } from '../../test/support.ts';
import { shapeArena } from '../../test/shape-support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { refreshPlayer } from './character.ts';
import { kill } from './combat.ts';
import { stepWorld } from './step.ts';
import { enterZone } from './zones.ts';
import type { Command, World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const DODGE_SLOT: number = 5;
const HELD: readonly string[] = [...content.skills.values()].filter((skill: SkillDef): boolean => skill.press?.type === 'channel').map((skill: SkillDef): string => skill.id);
const UP: Command = { type: 'hold', slot: 0, down: false };

function holder(held: string): World {
  const world: World = shapeArena([]);
  world.player.learned.push(held, 'dodge_roll');
  world.player.bar = [held, null, null, null, null, 'dodge_roll'];
  refreshPlayer(world);
  world.player.mana = world.player.stats.maxMana;
  faceAt(world.player, aimAhead(world, 1));
  return world;
}

function aimAhead(world: World, reach: number): Vec2 {
  return { x: world.player.pos.x + reach, z: world.player.pos.z };
}

function press(world: World): WorldEvent[] {
  return stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim: aimAhead(world, 4), targetId: null }], DT);
}

function keepHolding(world: World, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) {
    world.player.mana = world.player.stats.maxMana;
    events.push(...stepWorld(world, [{ type: 'steer', aim: aimAhead(world, 4) }], DT));
  }
  return events;
}

function ends(events: readonly WorldEvent[]): number {
  return events.filter((event: WorldEvent): boolean => event.type === 'channel_end').length;
}

function endsFor(events: readonly WorldEvent[], actorId: number, skill: string): boolean {
  return events.some((event: WorldEvent): boolean => event.type === 'channel_end' && event.actorId === actorId && event.skill.id === skill);
}

void test('the held skills are the channels: the Millwheel, the Firewheel, Firewall and Living Wire', (): void => {
  assert.deepEqual(HELD.toSorted(), ['cleave_firewheel', 'cleave_millwheel', 'firewall', 'living_wire']);
});

for (const held of HELD) {
  void test(`${held} ends its channel on the very step the key is let go, and not before`, (): void => {
    const world: World = holder(held);
    const opened: WorldEvent[] = press(world);
    assert.ok(opened.some((event: WorldEvent): boolean => event.type === 'skill_start' && event.skill.id === held));
    assert.equal(ends(keepHolding(world, 0.6)), 0);
    assert.equal(world.player.action?.phase, 'channel');
    const released: WorldEvent[] = stepWorld(world, [UP], DT);
    assert.ok(endsFor(released, world.player.id, held));
    assert.equal(ends(keepHolding(world, 1)), 0);
  });

  void test(`a quick tap of ${held} ends its channel once, as its single turn lands`, (): void => {
    const world: World = holder(held);
    const events: WorldEvent[] = [...press(world), ...stepWorld(world, [UP], DT)];
    assert.equal(ends(events), 0);
    let landed: number | null = null;
    let ended: number | null = null;
    for (let step: number = 0; step < 60; step += 1) {
      const later: WorldEvent[] = stepWorld(world, [], DT);
      if (landed === null && later.some((event: WorldEvent): boolean => event.type === 'skill_impact')) landed = step;
      if (ends(later) > 0) {
        assert.equal(ended, null);
        ended = step;
      }
    }
    assert.notEqual(ended, null);
    assert.equal(ended, landed);
  });

  void test(`${held} ends its channel when the mana runs out`, (): void => {
    const world: World = holder(held);
    world.player.stats = { ...world.player.stats, manaRegen: 0 };
    press(world);
    keepHolding(world, 0.4);
    world.player.mana = 0;
    let found: WorldEvent[] = [];
    for (let step: number = 0; step < 60 && ends(found) === 0; step += 1) found = stepWorld(world, [], DT);
    assert.ok(endsFor(found, world.player.id, held));
    assert.ok(found.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'no_mana'));
  });

  void test(`${held} ends its channel when the hero falls`, (): void => {
    const world: World = holder(held);
    press(world);
    keepHolding(world, 0.4);
    kill(world, world.player, { x: 1, z: 0 });
    assert.ok(endsFor(stepWorld(world, [], DT), world.player.id, held));
  });

  void test(`${held} ends its channel when the hero enters another zone, still holding`, (): void => {
    const world: World = holder(held);
    press(world);
    keepHolding(world, 0.4);
    enterZone(world, world.zone, { type: 'start' });
    assert.equal(world.player.action, null);
    assert.ok(endsFor(stepWorld(world, [], DT), world.player.id, held));
    assert.equal(ends(keepHolding(world, 0.5)), 0);
  });

  void test(`a dodge cutting ${held} reports the channel's end before the dodge starts`, (): void => {
    const world: World = holder(held);
    press(world);
    keepHolding(world, 0.4);
    const events: WorldEvent[] = stepWorld(world, [{ type: 'skill', slot: DODGE_SLOT, aim: aimAhead(world, 6), targetId: null }], DT);
    const end: number = events.findIndex((event: WorldEvent): boolean => event.type === 'channel_end');
    const dodge: number = events.findIndex((event: WorldEvent): boolean => event.type === 'skill_start' && event.skill.id === 'dodge_roll');
    assert.ok(end >= 0 && dodge > end, `end ${end}, dodge ${dodge}`);
    assert.equal(must(world.player.action, 'dodging').skill.id, 'dodge_roll');
  });
}

void test('a skill that is not held never reports a channel ending', (): void => {
  const world: World = holder('cleave');
  const events: WorldEvent[] = [...press(world), ...stepWorld(world, [UP], DT), ...keepHolding(world, 1)];
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'skill_start'));
  assert.equal(ends(events), 0);
  assert.equal(world.channels.length, 0);
});
