import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { standAt } from '../../test/moment-support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, MonsterDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { createWorld } from './create.ts';
import { LEASH } from './leash.ts';
import { forceStrike } from './moments.ts';
import { spawnMonster } from './spawn.ts';
import { stepWorld } from './step.ts';
import type { MomentState, MonsterState, World } from './types.ts';
import { enterZone } from './zones.ts';

const PROBE = { dt: 1 / 30, east: 30, hearth: 3, outside: 4, home: 12, giveUpSlack: 0.5, homeBy: 12, settle: 0.1 } as const;

const content: Content = loadContent();

interface Shut {
  readonly world: World;
  readonly moment: MomentState;
  readonly roamer: MonsterState;
}

function heroInBubble(roamerId: string): Shut {
  const world: World = createWorld(content, { seed: 5, save: null });
  enterZone(world, must(content.zones.get('hall_of_time'), 'hall'), { type: 'start' });
  world.monsters = [];
  world.player.invulnerable = Infinity;
  const at: Vec2 = { x: world.player.pos.x + PROBE.east, z: world.player.pos.z };
  const moment: MomentState = must(forceStrike(world, at, 'first_fire'), 'first fire');
  for (let elapsed: number = 0; elapsed < content.moments.telegraph + PROBE.dt * 2; elapsed += PROBE.dt) stepWorld(world, [], PROBE.dt);
  standAt(world, { x: at.x + PROBE.hearth, z: at.z });
  stepWorld(world, [], PROBE.dt);
  assert.equal(moment.phase, 'awake');
  const def: MonsterDef = must(content.monsters.get(roamerId), roamerId);
  const roamer: MonsterState = spawnMonster(world, def, world.nextPackId, { x: at.x + moment.def.radius + PROBE.home, z: at.z }, { summonerId: null, scatter: 0, revived: false });
  roamer.spawnTime = 0;
  roamer.pos = { x: at.x + moment.def.radius + PROBE.outside, z: at.z };
  roamer.aggro = true;
  return { world, moment, roamer };
}

for (const roamerId of ['unfinished_taker', 'unfinished_brute', 'unfinished_thrower']) {
  void test(`a roaming ${roamerId} chasing the hero into a live moment stops at its shell, never hits him there, and walks home after a few seconds`, (): void => {
    const { world, moment, roamer } = heroInBubble(roamerId);
    let gaveUp: number | null = null;
    let home: number | null = null;
    for (let elapsed: number = 0; elapsed < LEASH.wait + PROBE.homeBy && home === null; elapsed += PROBE.dt) {
      for (const event of stepWorld(world, [], PROBE.dt)) {
        if (event.type === 'damage' && event.targetTeam === 'player') assert.notEqual(event.sourceId, roamer.id, `hit him from outside at ${elapsed.toFixed(1)} s`);
      }
      assert.ok(distance(roamer.pos, moment.pos) >= moment.def.radius + roamer.radius - 1e-6, `inside the shell at ${elapsed.toFixed(1)} s`);
      if (gaveUp === null && !roamer.aggro) gaveUp = elapsed;
      if (gaveUp !== null && !roamer.returning && distance(roamer.pos, roamer.home) <= LEASH.homeReach) home = elapsed;
    }
    const quit: number = must(gaveUp, 'gave up');
    assert.ok(quit >= LEASH.wait - PROBE.settle && quit <= LEASH.wait + PROBE.giveUpSlack, `gave up after ${quit.toFixed(1)} s`);
    must(home, 'walked home');
    assert.ok(roamer.alive && !roamer.aggro);
  });
}

void test('a roaming monster standing where a moment wakes is pushed out to its shell, while the moment\'s own echoes stay inside', (): void => {
  const { world, moment, roamer } = heroInBubble('unfinished_taker');
  roamer.pos = { x: moment.pos.x - 1, z: moment.pos.z + 1 };
  stepWorld(world, [], PROBE.dt);
  assert.ok(distance(roamer.pos, moment.pos) >= moment.def.radius + roamer.radius - 1e-6);
  const echoes: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster !== roamer && monster.alive);
  assert.ok(echoes.length > 0);
  for (const echo of echoes) assert.ok(distance(echo.pos, moment.pos) <= moment.def.radius);
});
