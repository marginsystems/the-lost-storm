import type { Fields } from './read.ts';
import { packMods } from './parse-combat.ts';
import { byId, choice, ContentError, each, fields, flag, numeric, positive, text, textList } from './read.ts';
import type {
  ActDef,
  AtlasDef,
  AtlasFeature,
  AtlasLabel,
  AtlasPoint,
  AtlasRoad,
  Condition,
  LineDef,
  MapPlace,
  NpcDef,
  ObjectiveDef,
  PackMember,
  QuestDef,
  SurgeRules,
  TalkDef,
  WorldDef,
  ZoneAmbience,
  ZoneCheckpoint,
  ZoneDef,
  ZoneExit,
  ZoneNpc,
  ZoneOutside,
  ZonePack,
  ZonePoint,
  ZoneProp,
  ZoneVoice,
  ZoneWaypoint,
} from './types.ts';
import { service } from './parse-trade.ts';
import { ATLAS_FEATURE_KINDS, OBJECTIVE_STATES, QUEST_STATES, ZONE_KINDS } from './types.ts';

function point(value: unknown, where: string): ZonePoint {
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), z: numeric(source, 'z', where) };
}

function zoneProp(value: unknown, where: string): ZoneProp {
  const source: Fields = fields(value, where);
  return { prop: text(source, 'prop', where), x: numeric(source, 'x', where), z: numeric(source, 'z', where), y: numeric(source, 'y', where), rotationDegrees: numeric(source, 'rotationDegrees', where), when: conditions(source, 'when', where) };
}

function packMember(value: unknown, where: string): PackMember {
  const source: Fields = fields(value, where);
  return { monster: text(source, 'monster', where), count: numeric(source, 'count', where), mods: packMods(source, where) };
}

function pack(value: unknown, where: string): ZonePack {
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), z: numeric(source, 'z', where), members: each(source['members'], `${where}.members`, packMember), when: conditions(source, 'when', where) };
}

function surgeRules(value: unknown, where: string): SurgeRules | null {
  if (value === undefined) throw new ContentError(where, 'expected surge rules, or null for a zone without surges');
  if (value === null) return null;
  const source: Fields = fields(value, where);
  return { delay: numeric(source, 'delay', where), surgesPerExtraMonster: numeric(source, 'surgesPerExtraMonster', where), maxExtraMonsters: numeric(source, 'maxExtraMonsters', where) };
}

function condition(value: unknown, where: string): Condition {
  const source: Fields = fields(value, where);
  const type: Condition['type'] = choice(source, 'type', ['quest', 'objective'] as const, where);
  const not: boolean = source['not'] === undefined ? false : flag(source, 'not', where);
  if (type === 'quest') return { type, quest: text(source, 'quest', where), is: choice(source, 'is', QUEST_STATES, where), not };
  return { type, quest: text(source, 'quest', where), objective: text(source, 'objective', where), is: choice(source, 'is', OBJECTIVE_STATES, where), not };
}

function conditions(source: Fields, key: string, where: string): Condition[] {
  return source[key] === undefined ? [] : each(source[key], `${where}.${key}`, condition);
}

function zoneExit(value: unknown, where: string): ZoneExit {
  const source: Fields = fields(value, where);
  const requires: Condition[] = conditions(source, 'requires', where);
  return {
    requires,
    lockedHint: requires.length === 0 ? '' : text(source, 'lockedHint', where),
    hiddenWhenLocked: source['hiddenWhenLocked'] === undefined ? false : flag(source, 'hiddenWhenLocked', where),
    id: text(source, 'id', where),
    x: numeric(source, 'x', where),
    z: numeric(source, 'z', where),
    radius: positive(source, 'radius', where),
    to: text(source, 'to', where),
    toExit: text(source, 'toExit', where),
    arrival: point(source['arrival'], `${where}.arrival`),
  };
}

function zoneCheckpoint(value: unknown, where: string): ZoneCheckpoint {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), x: numeric(source, 'x', where), z: numeric(source, 'z', where), radius: positive(source, 'radius', where) };
}

function zoneNpc(value: unknown, where: string): ZoneNpc {
  const source: Fields = fields(value, where);
  return { npc: text(source, 'npc', where), x: numeric(source, 'x', where), z: numeric(source, 'z', where), facingDegrees: numeric(source, 'facingDegrees', where), when: conditions(source, 'when', where) };
}

function zoneWaypoint(value: unknown, where: string): ZoneWaypoint | null {
  if (value === undefined) throw new ContentError(where, 'expected a waypoint, or null for a zone without one');
  if (value === null) return null;
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), z: numeric(source, 'z', where), radius: positive(source, 'radius', where) };
}

function zoneVoice(value: unknown, where: string): ZoneVoice {
  const source: Fields = fields(value, where);
  const lines: string[] = textList(source, 'lines', where);
  if (lines.length === 0) throw new ContentError(`${where}.lines`, 'a voice needs at least one line');
  return { id: text(source, 'id', where), x: numeric(source, 'x', where), z: numeric(source, 'z', where), radius: positive(source, 'radius', where), lines, when: conditions(source, 'when', where) };
}

function zoneAmbience(value: unknown, where: string): ZoneAmbience {
  const source: Fields = fields(value, where);
  return {
    background: text(source, 'background', where),
    abyss: text(source, 'abyss', where),
    fogNear: numeric(source, 'fogNear', where),
    fogFar: numeric(source, 'fogFar', where),
    skyColor: text(source, 'skyColor', where),
    groundColor: text(source, 'groundColor', where),
    skyIntensity: numeric(source, 'skyIntensity', where),
    keyColor: text(source, 'keyColor', where),
    keyIntensity: numeric(source, 'keyIntensity', where),
  };
}

function zoneOutside(value: unknown, where: string): ZoneOutside | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  return { surface: text(source, 'surface', where), reach: positive(source, 'reach', where) };
}

export function zone(value: unknown, where: string): ZoneDef {
  const source: Fields = fields(value, where);
  const floorFields: Fields = fields(source['floors'], `${where}.floors`);
  const floors: Record<string, string> = {};
  for (const key of Object.keys(floorFields)) floors[key] = text(floorFields, key, `${where}.floors`);
  const walls: Fields = fields(source['walls'], `${where}.walls`);
  const tiles: string[] = textList(source, 'tiles', where);
  const width: number = tiles[0]?.length ?? 0;
  if (width === 0 || tiles.some((row: string): boolean => row.length !== width)) throw new ContentError(`${where}.tiles`, 'every row must have the same length');
  const kind: ZoneDef['kind'] = choice(source, 'kind', ZONE_KINDS, where);
  const packs: ZonePack[] = each(source['packs'], `${where}.packs`, pack);
  const surge: SurgeRules | null = surgeRules(source['surge'], `${where}.surge`);
  if (kind === 'town' && (packs.length > 0 || surge !== null)) throw new ContentError(where, 'a town is safe: it cannot have packs or surges');
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    kind,
    level: positive(source, 'level', where),
    cellSize: positive(source, 'cellSize', where),
    floorHeight: numeric(source, 'floorHeight', where),
    tiles,
    floors,
    outside: zoneOutside(source['outside'], `${where}.outside`),
    walls: { tall: textList(walls, 'tall', `${where}.walls`), low: text(walls, 'low', `${where}.walls`), corner: text(walls, 'corner', `${where}.walls`), halfThickness: numeric(walls, 'halfThickness', `${where}.walls`) },
    props: each(source['props'], `${where}.props`, zoneProp),
    playerStart: point(source['playerStart'], `${where}.playerStart`),
    packs,
    surge,
    exits: [...byId(each(source['exits'], `${where}.exits`, zoneExit), `${where}.exits`).values()],
    checkpoints: [...byId(each(source['checkpoints'], `${where}.checkpoints`, zoneCheckpoint), `${where}.checkpoints`).values()],
    waypoint: zoneWaypoint(source['waypoint'], `${where}.waypoint`),
    npcs: each(source['npcs'], `${where}.npcs`, zoneNpc),
    voices: source['voices'] === undefined ? [] : [...byId(each(source['voices'], `${where}.voices`, zoneVoice), `${where}.voices`).values()],
    ambience: zoneAmbience(source['ambience'], `${where}.ambience`),
  };
}

export function line(value: unknown, where: string): LineDef {
  const source: Fields = fields(value, where);
  const spoken: string = text(source, 'text', where);
  if (spoken.trim() === '') throw new ContentError(`${where}.text`, 'a line needs words');
  return { id: text(source, 'id', where), speaker: text(source, 'speaker', where), text: spoken };
}

function talk(value: unknown, where: string): TalkDef {
  const source: Fields = fields(value, where);
  const lines: string[] = textList(source, 'lines', where);
  if (lines.length === 0) throw new ContentError(`${where}.lines`, 'a conversation needs at least one line');
  return { id: text(source, 'id', where), once: flag(source, 'once', where), when: conditions(source, 'when', where), lines };
}

function npc(value: unknown, where: string): NpcDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    title: text(source, 'title', where),
    rig: text(source, 'rig', where),
    scale: positive(source, 'scale', where),
    tint: text(source, 'tint', where),
    color: text(source, 'color', where),
    gear: textList(source, 'gear', where),
    wear: textList(source, 'wear', where),
    talks: each(source['talks'], `${where}.talks`, talk),
    service: service(source, where),
  };
}

export function npcs(value: unknown, where: string): Map<string, NpcDef> {
  const defs: Map<string, NpcDef> = byId(each(value, where, npc), where);
  byId(
    [...defs.values()].flatMap((def: NpcDef): readonly TalkDef[] => def.talks),
    `${where} talks`,
  );
  return defs;
}

function mapPlace(value: unknown, where: string): MapPlace {
  const source: Fields = fields(value, where);
  return { zone: text(source, 'zone', where), x: numeric(source, 'x', where), y: numeric(source, 'y', where) };
}

function atlasPoint(value: unknown, where: string): AtlasPoint {
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), y: numeric(source, 'y', where) };
}

function atlasRoad(value: unknown, where: string): AtlasRoad {
  const source: Fields = fields(value, where);
  return { from: text(source, 'from', where), to: text(source, 'to', where), via: each(source['via'], `${where}.via`, atlasPoint) };
}

function atlasFeature(value: unknown, where: string): AtlasFeature {
  const source: Fields = fields(value, where);
  const points: AtlasPoint[] = each(source['points'], `${where}.points`, atlasPoint);
  if (points.length < 2) throw new ContentError(`${where}.points`, 'a map feature needs at least two points');
  return { kind: choice(source, 'kind', ATLAS_FEATURE_KINDS, where), points };
}

function atlasLabel(value: unknown, where: string): AtlasLabel {
  const source: Fields = fields(value, where);
  return { text: text(source, 'text', where), x: numeric(source, 'x', where), y: numeric(source, 'y', where), size: positive(source, 'size', where), tilt: numeric(source, 'tilt', where) };
}

function atlas(value: unknown, where: string): AtlasDef {
  const source: Fields = fields(value, where);
  return {
    width: positive(source, 'width', where),
    height: positive(source, 'height', where),
    compass: atlasPoint(source['compass'], `${where}.compass`),
    places: each(source['places'], `${where}.places`, mapPlace),
    roads: each(source['roads'], `${where}.roads`, atlasRoad),
    features: each(source['features'], `${where}.features`, atlasFeature),
    labels: each(source['labels'], `${where}.labels`, atlasLabel),
  };
}

function act(value: unknown, where: string): ActDef {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), title: text(source, 'title', where), name: text(source, 'name', where), atlas: atlas(source['atlas'], `${where}.atlas`) };
}

function objective(value: unknown, where: string): ObjectiveDef {
  const source: Fields = fields(value, where);
  const type: ObjectiveDef['type'] = choice(source, 'type', ['talk', 'reach', 'defeat'] as const, where);
  const id: string = text(source, 'id', where);
  const shown: string = text(source, 'text', where);
  if (type === 'talk') return { type, id, text: shown, npc: text(source, 'npc', where) };
  if (type === 'defeat') return { type, id, text: shown, monster: text(source, 'monster', where) };
  return { type, id, text: shown, zone: text(source, 'zone', where), x: numeric(source, 'x', where), z: numeric(source, 'z', where), radius: positive(source, 'radius', where) };
}

export function quest(value: unknown, where: string): QuestDef {
  const source: Fields = fields(value, where);
  const objectives: ObjectiveDef[] = [...byId(each(source['objectives'], `${where}.objectives`, objective), `${where}.objectives`).values()];
  if (objectives.length === 0) throw new ContentError(`${where}.objectives`, 'a quest needs at least one objective');
  return { id: text(source, 'id', where), name: text(source, 'name', where), requires: textList(source, 'requires', where), objectives };
}

export function worldDef(value: unknown, where: string): WorldDef {
  const source: Fields = fields(value, where);
  const scaling: Fields = fields(source['scaling'], `${where}.scaling`);
  return {
    acts: [...byId(each(source['acts'], `${where}.acts`, act), `${where}.acts`).values()],
    start: text(source, 'start', where),
    scaling: {
      lifePerLevel: numeric(scaling, 'lifePerLevel', `${where}.scaling`),
      damagePerLevel: numeric(scaling, 'damagePerLevel', `${where}.scaling`),
      xpPerLevel: numeric(scaling, 'xpPerLevel', `${where}.scaling`),
    },
  };
}
