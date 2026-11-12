import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { must } from '../../test/support.ts';
import audioJson from '../../data/audio.json' with { type: 'json' };
import soundIds from '../../data/sound-ids.json' with { type: 'json' };
import type { AudioDef, CueDef, KnownIds } from './audio.ts';
import { knownIdsOf, loadAudio, parseAudio, UI_ACTIONS, WORLD_SOUND_EVENTS } from './audio.ts';
import { loadContent } from './content.ts';
import { ContentError } from './read.ts';
import type { Content } from './types.ts';

const content: Content = loadContent();
const AMBIENT_ZONE: string = 'hall_of_time';
const known: KnownIds = knownIdsOf(content);

function variant(change: (draft: Record<string, unknown>) => void): unknown {
  const copy: unknown = JSON.parse(JSON.stringify(audioJson));
  if (typeof copy !== 'object' || copy === null) throw new Error('audio.json is not an object');
  const draft: Record<string, unknown> = Object.fromEntries(Object.entries(copy));
  change(draft);
  return draft;
}

function reject(value: unknown, pattern: RegExp): void {
  assert.throws(
    (): AudioDef => parseAudio(value, known),
    (error: unknown): boolean => error instanceof ContentError && pattern.test(error.message),
  );
}

void test('the shipped audio data loads against the shipped content', (): void => {
  const audio: AudioDef = loadAudio(content);
  assert.equal(audio.defaults.maxVoices, 4);
  assert.ok(audio.skillStart.size >= 5);
  assert.ok(audio.ambience.has(AMBIENT_ZONE));
});

void test('every skill the player or a monster uses has a start sound', (): void => {
  const audio: AudioDef = loadAudio(content);
  const bossSkills: string[] = [...content.monsters.values()].flatMap((monster): string[] => (monster.boss === null ? [] : monster.boss.phases.flatMap((phase): string[] => phase.skills.map((entry): string => entry.skill))));
  const used: string[] = [...content.player.skillBook.map((entry): string => entry.skill), ...[...content.monsters.values()].map((monster): string => monster.skill), ...bossSkills];
  for (const skill of used) assert.ok((audio.skillStart.get(skill)?.length ?? 0) > 0, `${skill} has no start sound`);
});

void test('cues take the defaults for what they leave out', (): void => {
  const audio: AudioDef = parseAudio(variant((draft): void => {
    draft['ui'] = { click: [{ sound: 'ui_click' }, { sound: 'ui_click', volume: 0.5, maxVoices: 2, cooldown: 1 }] };
  }), known);
  const [plain, tuned]: readonly CueDef[] = must(audio.ui.get('click'), 'click cues');
  assert.deepEqual(plain, { sound: 'ui_click', volume: 1, maxVoices: 4, cooldown: 0 });
  assert.deepEqual(tuned, { sound: 'ui_click', volume: 0.5, maxVoices: 2, cooldown: 1 });
});

void test('a table that names an id the game does not have is rejected', (): void => {
  reject(variant((draft): void => {
    draft['skillStart'] = { not_a_skill: [{ sound: 'a' }] };
  }), /skillStart\.not_a_skill/);
  reject(variant((draft): void => {
    draft['hit'] = { not_a_monster: [{ sound: 'a' }] };
  }), /hit\.not_a_monster/);
  reject(variant((draft): void => {
    draft['drop'] = { mythic: [{ sound: 'a' }] };
  }), /drop\.mythic/);
  reject(variant((draft): void => {
    draft['notice'] = { no_luck: [{ sound: 'a' }] };
  }), /notice\.no_luck/);
  reject(variant((draft): void => {
    draft['world'] = { hero_sneeze: [{ sound: 'a' }] };
  }), /world\.hero_sneeze/);
  reject(variant((draft): void => {
    draft['ui'] = { shout: [{ sound: 'a' }] };
  }), /ui\.shout/);
  reject(variant((draft): void => {
    draft['ambience'] = { moon_base: { loops: [], stingers: [] } };
  }), /ambience\.moon_base/);
});

void test('only projectile skills can have projectile sounds', (): void => {
  reject(variant((draft): void => {
    draft['projectileSpawn'] = { cleave: [{ sound: 'a' }] };
  }), /projectileSpawn\.cleave/);
});

void test('bad cues are rejected with where they are', (): void => {
  reject(variant((draft): void => {
    draft['ui'] = { click: [{ sound: 'Ui-Click' }] };
  }), /ui\.click\[0\]\.sound/);
  reject(variant((draft): void => {
    draft['ui'] = { click: [{ sound: 'a', volume: 0 }] };
  }), /volume/);
  reject(variant((draft): void => {
    draft['ui'] = { click: [{ sound: 'a', volume: 9 }] };
  }), /volume/);
  reject(variant((draft): void => {
    draft['ui'] = { click: [{ sound: 'a', maxVoices: 1.5 }] };
  }), /maxVoices/);
  reject(variant((draft): void => {
    draft['ui'] = { click: [{ sound: 'a', maxVoices: 0 }] };
  }), /maxVoices/);
  reject(variant((draft): void => {
    draft['ui'] = { click: [{ sound: 'a', cooldown: -1 }] };
  }), /cooldown/);
  reject(variant((draft): void => {
    draft['ui'] = { click: [{}] };
  }), /sound/);
  reject(variant((draft): void => {
    draft['ui'] = { click: 'ui_click' };
  }), /ui\.click/);
  reject(variant((draft): void => {
    draft['ui'] = 'nothing';
  }), /ui/);
  reject(variant((draft): void => {
    draft['defaults'] = { volume: 1, maxVoices: 0, cooldown: 0 };
  }), /defaults\.maxVoices/);
});

void test('stingers need a sensible delay window', (): void => {
  reject(variant((draft): void => {
    draft['ambience'] = { [AMBIENT_ZONE]: { loops: [], stingers: [{ sound: 'a', minDelay: 30, maxDelay: 10 }] } };
  }), /maxDelay/);
  reject(variant((draft): void => {
    draft['ambience'] = { [AMBIENT_ZONE]: { loops: [{ sound: 'a', volume: 0 }], stingers: [] } };
  }), /volume/);
});

void test('a stinger must say how soon and how late it can come', (): void => {
  const stingerWith = (fields: Record<string, unknown>): unknown =>
    variant((draft): void => {
      draft['ambience'] = { [AMBIENT_ZONE]: { loops: [], stingers: [{ sound: 'a', ...fields }] } };
    });
  reject(stingerWith({}), /minDelay/);
  reject(stingerWith({ minDelay: 5 }), /maxDelay/);
  reject(stingerWith({ maxDelay: 5 }), /minDelay/);
  reject(stingerWith({ minDelay: 0, maxDelay: 5 }), /minDelay/);
  assert.equal(parseAudio(stingerWith({ minDelay: 5, maxDelay: 5 }), known).ambience.get(AMBIENT_ZONE)?.stingers.length, 1);
});

void test('the fixed id lists are not empty and have no repeats', (): void => {
  assert.equal(new Set(UI_ACTIONS).size, UI_ACTIONS.length);
  assert.equal(new Set(WORLD_SOUND_EVENTS).size, WORLD_SOUND_EVENTS.length);
  assert.ok(WORLD_SOUND_EVENTS.includes('hero_step'));
});

const MANIFEST_VARIABLE: string = 'ASSET_MANIFEST';
const SIBLING_MANIFEST: string = '../the-lost-storm-assets/manifest.json';

function soundIdsIn(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) soundIdsIn(entry, found);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'sound' && typeof entry === 'string') found.add(entry);
    else soundIdsIn(entry, found);
  }
}

function manifestPath(): string | null {
  const named: string | undefined = process.env[MANIFEST_VARIABLE];
  if (named !== undefined && named.length > 0) return resolve(named);
  const sibling: string = resolve(SIBLING_MANIFEST);
  return existsSync(sibling) ? sibling : null;
}

function soundIdsOf(manifest: unknown): ReadonlySet<string> {
  if (typeof manifest !== 'object' || manifest === null) return new Set<string>();
  const sfx: unknown = Object.fromEntries(Object.entries(manifest))['sfx'];
  if (typeof sfx !== 'object' || sfx === null) return new Set<string>();
  return new Set<string>(Object.keys(sfx));
}

void test('every sound id in data/audio.json exists in the assets manifest', (t: TestContext): void => {
  const path: string | null = manifestPath();
  if (path === null) {
    t.skip(`no assets manifest: set ${MANIFEST_VARIABLE} or check out the-lost-storm-assets beside this repository`);
    return;
  }
  const available: ReadonlySet<string> = soundIdsOf(JSON.parse(readFileSync(path, 'utf8')));
  const used: Set<string> = new Set<string>();
  soundIdsIn(audioJson, used);
  assert.ok(used.size > 0);
  assert.deepEqual([...used].filter((id: string): boolean => !available.has(id)), []);
});

void test('every sound id in data/audio.json is in the committed list of sound ids', (): void => {
  const used: Set<string> = new Set<string>();
  soundIdsIn(audioJson, used);
  const listed: ReadonlySet<string> = new Set<string>(soundIds);
  assert.ok(used.size > 0);
  assert.deepEqual([...used].filter((id: string): boolean => !listed.has(id)), []);
});
