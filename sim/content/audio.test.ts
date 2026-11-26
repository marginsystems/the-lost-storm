import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { must } from '../../test/support.ts';
import audioJson from '../../data/audio.json' with { type: 'json' };
import soundIds from '../../data/sound-ids.json' with { type: 'json' };
import type { AmbienceStinger, AudioDef, CueDef, KnownIds, WeaponCue } from './audio.ts';
import { knownIdsOf, loadAudio, parseAudio, UI_ACTIONS, WORLD_SOUND_EVENTS } from './audio.ts';
import { loadContent } from './content.ts';
import { ContentError } from './read.ts';
import type { Content, ItemBaseDef } from './types.ts';

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
  const bossSkills: string[] = [...content.monsters.values()].flatMap((monster): string[] => (monster.boss === null ? [] : monster.boss.phases.flatMap((phase): string[] => [...phase.skills.map((entry): string => entry.skill), ...phase.measure, ...(phase.support === null ? [] : [phase.support])])));
  const supports: string[] = [...content.monsters.values()].flatMap((monster): string[] => (monster.support === null ? [] : [monster.support]));
  const used: string[] = [...content.player.skillBook.map((entry): string => entry.skill), ...[...content.monsters.values()].map((monster): string => monster.skill), ...bossSkills, ...supports];
  for (const skill of used) assert.ok((audio.skillStart.get(skill)?.length ?? 0) > 0, `${skill} has no start sound`);
});

void test('cues take the defaults for what they leave out', (): void => {
  const audio: AudioDef = parseAudio(variant((draft): void => {
    draft['ui'] = { click: [{ sound: 'ui_click' }, { sound: 'ui_click', volume: 0.5, maxVoices: 2, cooldown: 1, reach: 60 }] };
  }), known);
  const [plain, tuned]: readonly CueDef[] = must(audio.ui.get('click'), 'click cues');
  assert.deepEqual(plain, { sound: 'ui_click', volume: 1, maxVoices: 4, cooldown: 0, reach: 30, holdForVoice: 0, pitch: null, volumeJitter: null, weapons: [], brighten: 0, swell: 0 });
  assert.deepEqual(tuned, { sound: 'ui_click', volume: 0.5, maxVoices: 2, cooldown: 1, reach: 60, holdForVoice: 0, pitch: null, volumeJitter: null, weapons: [], brighten: 0, swell: 0 });
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
    draft['encounterNearing'] = { not_a_find: [{ sound: 'a' }] };
  }), /encounterNearing\.not_a_find/);
  reject(variant((draft): void => {
    draft['encounterShown'] = { not_a_find: [{ sound: 'a' }] };
  }), /encounterShown\.not_a_find/);
  reject(variant((draft): void => {
    draft['ambience'] = { moon_base: { loops: [], stingers: [] } };
  }), /ambience\.moon_base/);
});

void test('a cue may wait a bounded time for a voice to finish, and waits for none unless it says so', (): void => {
  const audio: AudioDef = loadAudio(content);
  const nearing: readonly CueDef[] = must(audio.encounterNearing.get('journal'), 'journal nearing cues');
  assert.ok(nearing.every((entry: CueDef): boolean => entry.holdForVoice > 0 && entry.maxVoices === 1));
  assert.ok(must(audio.encounterShown.get('journal'), 'journal shown cues').every((entry: CueDef): boolean => entry.holdForVoice === 0 && entry.maxVoices === 1));
  reject(variant((draft): void => {
    draft['encounterNearing'] = { journal: [{ sound: 'a', holdForVoice: 31 }] };
  }), /encounterNearing\.journal\[0\]\.holdForVoice/);
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
    draft['ui'] = { click: [{ sound: 'a', reach: 1 }] };
  }), /reach/);
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

void test('a stinger may be tied to the nearest cell of named surfaces within a reach, and may vary its pitch', (): void => {
  const stingerWith = (fields: Record<string, unknown>): unknown =>
    variant((draft): void => {
      draft['ambience'] = { [AMBIENT_ZONE]: { loops: [], stingers: [{ sound: 'a', minDelay: 5, maxDelay: 9, ...fields }] } };
    });
  const plain: AmbienceStinger = must(parseAudio(stingerWith({}), known).ambience.get(AMBIENT_ZONE)?.stingers[0], 'plain stinger');
  assert.equal(plain.near, null);
  assert.equal(plain.pitch, null);
  const tied: AmbienceStinger = must(parseAudio(stingerWith({ pitch: [0.8, 1.2], near: { surfaces: ['vent_bed'], reach: 15 } }), known).ambience.get(AMBIENT_ZONE)?.stingers[0], 'tied stinger');
  assert.deepEqual(tied.near, { surfaces: ['vent_bed'], reach: 15 });
  assert.deepEqual(tied.pitch, { min: 0.8, max: 1.2 });
  reject(stingerWith({ near: { surfaces: ['moon_dust'], reach: 15 } }), /near\.surfaces/);
  reject(stingerWith({ near: { surfaces: [], reach: 15 } }), /near\.surfaces/);
  reject(stingerWith({ near: { surfaces: ['vent_bed'] } }), /near\.reach/);
  reject(stingerWith({ pitch: [1.4, 1.1] }), /pitch/);
});

void test('steps are keyed by surface, and an unknown surface is refused', (): void => {
  reject(variant((draft): void => {
    draft['steps'] = { moon_dust: [{ sound: 'a' }] };
  }), /steps\.moon_dust/);
});

void test('the fixed id lists are not empty and have no repeats', (): void => {
  assert.equal(new Set(UI_ACTIONS).size, UI_ACTIONS.length);
  assert.equal(new Set(WORLD_SOUND_EVENTS).size, WORLD_SOUND_EVENTS.length);
  assert.ok(WORLD_SOUND_EVENTS.includes('hero_step'));
});

const MANIFEST_VARIABLE: string = 'ASSET_MANIFEST';
const SIBLING_SUFFIX: string = '-assets';
const MANIFEST_FILE: string = 'manifest.json';

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
  const sibling: string = resolve('..', `${basename(resolve('.'))}${SIBLING_SUFFIX}`, MANIFEST_FILE);
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
    t.skip(`no sound manifest: set ${MANIFEST_VARIABLE} to one`);
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

void test('the hideout is sheltered: no rain falls there, while the storm still flashes overhead and its wind is heard', (): void => {
  const hideout = must(content.zones.get('hideout'), 'the hideout');
  assert.equal(hideout.weather.rain, 0);
  assert.notEqual(hideout.weather.lightning, null);
  const heard = must(loadAudio(content).ambience.get('hideout'), 'the hideout ambience');
  const loops: string[] = heard.loops.map((loop): string => loop.sound);
  assert.ok(loops.some((sound: string): boolean => sound.includes('wind')), 'no wind is heard in the hideout');
  assert.ok(!loops.includes('ambience_hall_storm'), 'the Hall\'s rain is heard in the hideout');
  assert.ok(heard.stingers.some((stinger): boolean => stinger.sound.startsWith('thunder')), 'no thunder is heard in the hideout');
});

void test('the cave zone has its own ambience loops, quieter than the Hall of Time\'s storm and with no weather of the Hall in them', (): void => {
  const audio = loadAudio(content);
  const cave = must(audio.ambience.get('under_hall'), 'the cave ambience');
  const hall = must(audio.ambience.get(AMBIENT_ZONE), 'the Hall ambience');
  const loops: ReadonlySet<string> = new Set<string>(cave.loops.map((loop): string => loop.sound));
  assert.ok(loops.has('ambience_cave_air'));
  assert.ok(!loops.has('ambience_cave_drips'));
  assert.ok(!loops.has('ambience_hall_storm'));
  const storm = must(hall.loops.find((loop): boolean => loop.sound === 'ambience_hall_storm'), 'the Hall storm');
  const air = must(cave.loops.find((loop): boolean => loop.sound === 'ambience_cave_air'), 'the cave air');
  assert.ok(air.volume < storm.volume);
  assert.ok(cave.stingers.length > 0);
  for (const stinger of cave.stingers) assert.ok(!hall.stingers.some((weather): boolean => weather.sound === stinger.sound), stinger.sound);
  for (const level of ['under_hall_2', 'under_hall_3']) assert.deepEqual(audio.ambience.get(level), cave, level);
});

void test('a cue may be filtered to weapon kinds, and an unknown kind is rejected', (): void => {
  const audio: AudioDef = parseAudio(variant((draft): void => {
    draft['skillStart'] = { cleave: [{ sound: 'sword_swing_light' }, { sound: 'sword_swing_heavy', weapons: ['blunt', 'greatsword'] }] };
  }), known);
  const [plain, heavy]: readonly WeaponCue[] = must(audio.skillStart.get('cleave'), 'cleave cues');
  assert.deepEqual(plain?.weapons, []);
  assert.deepEqual(heavy?.weapons, ['blunt', 'greatsword']);
  reject(variant((draft): void => {
    draft['skillStart'] = { cleave: [{ sound: 'a', weapons: ['wand'] }] };
  }), /skillStart\.cleave\[0\]\.weapons/);
});

void test('hit tables take monster ids, body materials, fallback and the player, and the guard table takes only guard outcomes', (): void => {
  const audio: AudioDef = parseAudio(variant((draft): void => {
    draft['hit'] = { wolf: [{ sound: 'a' }], chitin: [{ sound: 'a' }], fallback: [{ sound: 'a' }], player: [{ sound: 'a' }] };
    draft['guarded'] = { blocked: [{ sound: 'a' }], broken: [{ sound: 'a' }] };
  }), known);
  assert.equal(audio.hit.size, 4);
  assert.equal(audio.guarded.size, 2);
  reject(variant((draft): void => {
    draft['hit'] = { scales: [{ sound: 'a' }] };
  }), /hit\.scales/);
  reject(variant((draft): void => {
    draft['guarded'] = { wolf: [{ sound: 'a' }] };
  }), /guarded\.wolf/);
});

void test('every monster has a hit sound by its own id, its material or the fallback', (): void => {
  const audio: AudioDef = loadAudio(content);
  assert.ok((audio.hit.get('fallback')?.length ?? 0) > 0);
  assert.ok((audio.critHit.get('fallback')?.length ?? 0) > 0);
  for (const def of content.monsters.values()) {
    const found: boolean = [def.id, def.bodyMaterial, 'fallback'].some((key: string): boolean => (audio.hit.get(key)?.length ?? 0) > 0);
    assert.ok(found, def.id);
  }
});

void test('the shield sound is named only by the guard table', (): void => {
  const audio: AudioDef = loadAudio(content);
  assert.ok((audio.guarded.get('blocked') ?? []).some((entry: CueDef): boolean => entry.sound === 'hit_shield'));
  for (const table of [audio.hit, audio.critHit, audio.skillHit, audio.skillStart, audio.death]) {
    for (const list of table.values()) assert.ok(list.every((entry: CueDef): boolean => entry.sound !== 'hit_shield'));
  }
});

void test('every weapon sounds the swing it makes, whatever its kind', (): void => {
  const audio: AudioDef = loadAudio(content);
  const kinds: readonly string[] = [...new Set<string>([...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.slot === 'weapon').map((base: ItemBaseDef): string => base.weaponKind ?? 'none'))];
  assert.ok(!kinds.includes('none'));
  for (const kind of kinds) {
    const heard: readonly WeaponCue[] = (audio.skillStart.get('cleave') ?? []).filter((entry: WeaponCue): boolean => entry.weapons.length === 0 || entry.weapons.some((weapon: string): boolean => weapon === kind));
    assert.ok(heard.length > 0, kind);
  }
});

void test('a cue may carry its own pitch range and volume jitter, and bad ones are rejected', (): void => {
  const audio: AudioDef = parseAudio(variant((draft): void => {
    draft['ui'] = { click: [{ sound: 'ui_click', pitch: [0.94, 1.06], volumeJitter: 0.15 }, { sound: 'ui_click' }] };
  }), known);
  const clicks: readonly CueDef[] = must(audio.ui.get('click'), 'click cues');
  const varied: CueDef = must(clicks[0], 'varied cue');
  const plain: CueDef = must(clicks[1], 'plain cue');
  assert.deepEqual(varied.pitch, { min: 0.94, max: 1.06 });
  assert.equal(varied.volumeJitter, 0.15);
  assert.equal(plain.pitch, null);
  assert.equal(plain.volumeJitter, null);
  for (const bad of [[1.06, 0.94], [0.94], [0.94, 1.06, 1.1], [0.1, 1], [1, 3], ['a', 'b']]) {
    reject(variant((draft): void => {
      draft['ui'] = { click: [{ sound: 'a', pitch: bad }] };
    }), /ui\.click\[0\]\.pitch/);
  }
  reject(variant((draft): void => {
    draft['ui'] = { click: [{ sound: 'a', pitch: 1 }] };
  }), /pitch/);
  reject(variant((draft): void => {
    draft['ui'] = { click: [{ sound: 'a', volumeJitter: 0.9 }] };
  }), /volumeJitter/);
  reject(variant((draft): void => {
    draft['ui'] = { click: [{ sound: 'a', volumeJitter: -0.1 }] };
  }), /volumeJitter/);
});

void test('an area cue may brighten with its stoke by up to half, and Banked Fire alone does', (): void => {
  const audio: AudioDef = parseAudio(variant((draft): void => {
    draft['ui'] = { click: [{ sound: 'ui_click', brighten: 0.3 }, { sound: 'ui_click' }] };
  }), known);
  const clicks: readonly WeaponCue[] = must(audio.ui.get('click'), 'click cues');
  assert.equal(clicks[0]?.brighten, 0.3);
  assert.equal(clicks[1]?.brighten, 0);
  for (const bad of [0.6, -0.1]) {
    reject(variant((draft): void => {
      draft['ui'] = { click: [{ sound: 'a', brighten: bad }] };
    }), /brighten/);
  }
  const shipped: AudioDef = loadAudio(content);
  const brightened: string[] = [...shipped.areaStrike.entries()].filter(([, list]: [string, readonly WeaponCue[]]): boolean => list.some((entry: WeaponCue): boolean => entry.brighten > 0)).map(([id]: [string, readonly WeaponCue[]]): string => id);
  assert.deepEqual(brightened, ['banked_fire']);
});

void test('the dodge roll varies its pitch and level more than the default and keeps a wide choice of takes', (): void => {
  const roll: readonly CueDef[] = must(loadAudio(content).skillStart.get('dodge_roll'), 'roll cues');
  const whoosh: CueDef | undefined = roll.find((entry: CueDef): boolean => entry.sound === 'dodge_whoosh');
  assert.ok(whoosh !== undefined && whoosh.pitch !== null && whoosh.volumeJitter !== null);
  assert.ok(whoosh.pitch.max - whoosh.pitch.min > 0.08);
});

void test('the lobby has a bed of its own: cold wind and a low drone under a slow score of pads, with nothing sudden in it', (): void => {
  const lobby = loadAudio(content).lobby;
  const loops: readonly string[] = lobby.loops.map((loop): string => loop.sound);
  assert.ok(loops.some((sound: string): boolean => sound.includes('wind')), 'no wind is heard in the lobby');
  assert.ok(loops.some((sound: string): boolean => sound.includes('drone')), 'no drone sits under the lobby');
  assert.equal(lobby.stingers.length, 0);
  const score = must(lobby.score, 'the lobby score');
  assert.ok(score.length >= 90, 'the lobby score repeats in under 90 seconds');
  assert.ok(score.notes.every((note): boolean => note.sound.startsWith('music_')));
  const ats: readonly number[] = score.notes.map((note): number => note.at);
  assert.deepEqual(ats, ats.toSorted((a: number, b: number): number => a - b));
});

void test('a zone has no score unless it gives one', (): void => {
  for (const zone of loadAudio(content).ambience.values()) assert.equal(zone.score, null);
});

void test('a score is checked: a length, notes inside it, a playback rate and a pan in range, and at least one note', (): void => {
  const scored = (score: unknown): unknown =>
    variant((draft): void => {
      draft['ambience'] = { [AMBIENT_ZONE]: { loops: [], stingers: [], score } };
    });
  const note = { sound: 'music_pad_am', at: 4 };
  const parsed = must(parseAudio(scored({ length: 60, notes: [{ ...note, rate: 0.5, pan: -0.3, volume: 0.8 }] }), known).ambience.get(AMBIENT_ZONE)?.score, 'a score');
  assert.deepEqual(parsed, { length: 60, notes: [{ sound: 'music_pad_am', at: 4, rate: 0.5, pan: -0.3, volume: 0.8 }] });
  const plain = must(parseAudio(scored({ length: 60, notes: [note] }), known).ambience.get(AMBIENT_ZONE)?.score?.notes[0], 'a plain note');
  assert.deepEqual(plain, { sound: 'music_pad_am', at: 4, rate: 1, pan: 0, volume: 1 });
  reject(scored({ notes: [note] }), /length/);
  reject(scored({ length: 5, notes: [note] }), /length/);
  reject(scored({ length: 60, notes: [] }), /notes/);
  reject(scored({ length: 60, notes: [{ ...note, at: 60 }] }), /at/);
  reject(scored({ length: 60, notes: [{ ...note, at: -1 }] }), /at/);
  reject(scored({ length: 60, notes: [{ ...note, rate: 3 }] }), /rate/);
  reject(scored({ length: 60, notes: [{ ...note, pan: 1.5 }] }), /pan/);
  reject(variant((draft): void => {
    delete draft['lobby'];
  }), /lobby/);
});
