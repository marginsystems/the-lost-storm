import type { Fields } from './read.ts';
import { byId, choice, choiceList, ContentError, each, fields, flag, nullableText, numeric, text, textList } from './read.ts';
import type {
  AffixDef,
  AttachmentDef,
  AnimationKey,
  Condition,
  Content,
  Delivery,
  ItemBaseDef,
  ItemSlot,
  LineDef,
  MapPlace,
  MonsterBehaviour,
  MonsterDef,
  NpcDef,
  ObjectiveDef,
  PackMember,
  PlayerDef,
  PropDef,
  PropLight,
  QuestDef,
  RarityDef,
  RigClip,
  RigDef,
  RigSocket,
  SkillBinding,
  SkillDef,
  SkillMod,
  SkillTreeNodeDef,
  StatBlock,
  StatMod,
  SurgeRules,
  TalkDef,
  Triple,
  WearableDef,
  WearRegion,
  WorldDef,
  ZoneAmbience,
  ZoneCheckpoint,
  ZoneDef,
  ZoneExit,
  ZoneNpc,
  ZonePack,
  ZonePoint,
  ZoneProp,
  ZoneWaypoint,
} from './types.ts';
import { ACTION_ANIMATIONS, AFFIX_POSITIONS, ANIMATION_KEYS, ARMOUR_MATERIALS, ITEM_SLOTS, MOD_OPS, OBJECTIVE_STATES, QUEST_STATES, REQUIRE_MODES, SKILL_MOD_FIELDS, STAT_IDS, VFX_STYLES, WEAR_REGIONS, ZONE_KINDS } from './types.ts';

export interface RawContent {
  readonly skills: unknown;
  readonly monsters: unknown;
  readonly items: unknown;
  readonly skillTree: unknown;
  readonly rigs: unknown;
  readonly attachments: unknown;
  readonly wearables: unknown;
  readonly props: unknown;
  readonly zones: readonly unknown[];
  readonly world: unknown;
  readonly npcs: unknown;
  readonly lines: unknown;
  readonly quests: unknown;
  readonly player: unknown;
}

function statMod(value: unknown, where: string): StatMod {
  const source: Fields = fields(value, where);
  return { stat: choice(source, 'stat', STAT_IDS, where), op: choice(source, 'op', MOD_OPS, where), value: numeric(source, 'value', where) };
}

function skillMod(value: unknown, where: string): SkillMod {
  const source: Fields = fields(value, where);
  return { skill: text(source, 'skill', where), field: choice(source, 'field', SKILL_MOD_FIELDS, where), value: numeric(source, 'value', where) };
}

function delivery(value: unknown, where: string): Delivery {
  const source: Fields = fields(value, where);
  const type: Delivery['type'] = choice(source, 'type', ['arc', 'nova', 'projectile'] as const, where);
  if (type === 'arc') return { type, reach: numeric(source, 'reach', where), arcDegrees: numeric(source, 'arcDegrees', where) };
  if (type === 'nova') return { type, radius: numeric(source, 'radius', where) };
  return {
    type,
    speed: numeric(source, 'speed', where),
    radius: numeric(source, 'radius', where),
    range: numeric(source, 'range', where),
    pierce: numeric(source, 'pierce', where),
    count: numeric(source, 'count', where),
    spreadDegrees: numeric(source, 'spreadDegrees', where),
  };
}

function skill(value: unknown, where: string): SkillDef {
  const source: Fields = fields(value, where);
  const damage: Fields = fields(source['damage'], `${where}.damage`);
  const vfx: Fields = fields(source['vfx'], `${where}.vfx`);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    description: text(source, 'description', where),
    icon: text(source, 'icon', where),
    animation: choice(source, 'animation', ACTION_ANIMATIONS, where),
    manaCost: numeric(source, 'manaCost', where),
    cooldown: numeric(source, 'cooldown', where),
    windup: numeric(source, 'windup', where),
    recovery: numeric(source, 'recovery', where),
    scalesWithAttackSpeed: flag(source, 'scalesWithAttackSpeed', where),
    engageRange: numeric(source, 'engageRange', where),
    delivery: delivery(source['delivery'], `${where}.delivery`),
    damage: { weaponPercent: numeric(damage, 'weaponPercent', where), flatMin: numeric(damage, 'flatMin', where), flatMax: numeric(damage, 'flatMax', where) },
    knockback: numeric(source, 'knockback', where),
    stagger: numeric(source, 'stagger', where),
    shake: numeric(source, 'shake', where),
    hitStop: numeric(source, 'hitStop', where),
    vfx: { style: choice(vfx, 'style', VFX_STYLES, `${where}.vfx`), color: text(vfx, 'color', `${where}.vfx`) },
  };
}

function behaviour(value: unknown, where: string): MonsterBehaviour {
  const source: Fields = fields(value, where);
  const type: MonsterBehaviour['type'] = choice(source, 'type', ['chaser', 'ranged'] as const, where);
  if (type === 'chaser') return { type };
  return { type, preferredRange: numeric(source, 'preferredRange', where), retreatRange: numeric(source, 'retreatRange', where) };
}

function monster(value: unknown, where: string): MonsterDef {
  const source: Fields = fields(value, where);
  const loot: Fields = fields(source['loot'], `${where}.loot`);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    rig: text(source, 'rig', where),
    scale: numeric(source, 'scale', where),
    radius: numeric(source, 'radius', where),
    life: numeric(source, 'life', where),
    damageMin: numeric(source, 'damageMin', where),
    damageMax: numeric(source, 'damageMax', where),
    moveSpeed: numeric(source, 'moveSpeed', where),
    xp: numeric(source, 'xp', where),
    aggroRadius: numeric(source, 'aggroRadius', where),
    behaviour: behaviour(source['behaviour'], `${where}.behaviour`),
    skill: text(source, 'skill', where),
    loot: {
      goldChance: numeric(loot, 'goldChance', where),
      goldMin: numeric(loot, 'goldMin', where),
      goldMax: numeric(loot, 'goldMax', where),
      itemChance: numeric(loot, 'itemChance', where),
    },
    color: text(source, 'color', where),
    tint: text(source, 'tint', where),
    gear: textList(source, 'gear', where),
    wear: textList(source, 'wear', where),
  };
}

function rarity(value: unknown, where: string): RarityDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    color: text(source, 'color', where),
    weight: numeric(source, 'weight', where),
    affixMin: numeric(source, 'affixMin', where),
    affixMax: numeric(source, 'affixMax', where),
    statScale: numeric(source, 'statScale', where),
  };
}

function itemBase(value: unknown, where: string): ItemBaseDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    slot: choice(source, 'slot', ITEM_SLOTS, where),
    material: source['material'] === null || source['material'] === undefined ? null : choice(source, 'material', ARMOUR_MATERIALS, where),
    icon: text(source, 'icon', where),
    dropWeight: numeric(source, 'dropWeight', where),
    minLevel: numeric(source, 'minLevel', where),
    implicit: each(source['implicit'], `${where}.implicit`, statMod),
    visual: nullableText(source, 'visual', where),
    wear: textList(source, 'wear', where),
  };
}

function affix(value: unknown, where: string): AffixDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    label: text(source, 'label', where),
    position: choice(source, 'position', AFFIX_POSITIONS, where),
    slots: choiceList(source, 'slots', ITEM_SLOTS, where),
    stat: choice(source, 'stat', STAT_IDS, where),
    op: choice(source, 'op', MOD_OPS, where),
    min: numeric(source, 'min', where),
    max: numeric(source, 'max', where),
    perLevel: numeric(source, 'perLevel', where),
  };
}

function treeNode(value: unknown, where: string): SkillTreeNodeDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    description: text(source, 'description', where),
    icon: text(source, 'icon', where),
    column: numeric(source, 'column', where),
    row: numeric(source, 'row', where),
    requires: textList(source, 'requires', where),
    requireMode: choice(source, 'requireMode', REQUIRE_MODES, where),
    statMods: each(source['statMods'], `${where}.statMods`, statMod),
    skillMods: each(source['skillMods'], `${where}.skillMods`, skillMod),
  };
}

function rigClips(value: unknown, where: string): Record<AnimationKey, RigClip> {
  const source: Fields = fields(value, where);
  const clip = (key: AnimationKey): RigClip => {
    const entry: Fields = fields(source[key], `${where}.${key}`);
    return { clip: text(entry, 'clip', `${where}.${key}`), impactFraction: numeric(entry, 'impactFraction', `${where}.${key}`) };
  };
  return { idle: clip('idle'), run: clip('run'), attack: clip('attack'), slam: clip('slam'), cast: clip('cast'), hit: clip('hit'), death: clip('death') };
}

function triple(source: Fields, key: string, where: string): Triple {
  const values: number[] = each(source[key], `${where}.${key}`, (entry: unknown, entryWhere: string): number => {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) throw new ContentError(entryWhere, 'expected a number');
    return entry;
  });
  const [x, y, z] = values;
  if (values.length !== 3 || x === undefined || y === undefined || z === undefined) throw new ContentError(`${where}.${key}`, 'expected three numbers');
  return [x, y, z];
}

function rigSocket(value: unknown, where: string): RigSocket {
  const source: Fields = fields(value, where);
  return { bone: text(source, 'bone', where), position: triple(source, 'position', where), rotationDegrees: triple(source, 'rotationDegrees', where), scale: numeric(source, 'scale', where) };
}

function rig(value: unknown, where: string): RigDef {
  const source: Fields = fields(value, where);
  const socketFields: Fields = fields(source['sockets'], `${where}.sockets`);
  const sockets: Record<string, RigSocket> = {};
  for (const key of Object.keys(socketFields)) sockets[key] = rigSocket(socketFields[key], `${where}.sockets.${key}`);
  for (const key of ANIMATION_KEYS) fields(fields(source['clips'], `${where}.clips`)[key], `${where}.clips.${key}`);
  const partFields: Fields = fields(source['bodyParts'], `${where}.bodyParts`);
  const bodyParts: Record<string, readonly string[]> = {};
  for (const key of Object.keys(partFields)) bodyParts[key] = textList(partFields, key, `${where}.bodyParts`);
  return {
    id: text(source, 'id', where),
    url: text(source, 'url', where),
    animationUrls: textList(source, 'animationUrls', where),
    scale: numeric(source, 'scale', where),
    yawOffsetDegrees: numeric(source, 'yawOffsetDegrees', where),
    height: numeric(source, 'height', where),
    rootMotionBone: nullableText(source, 'rootMotionBone', where),
    clips: rigClips(source['clips'], `${where}.clips`),
    sockets,
    hiddenNodes: textList(source, 'hiddenNodes', where),
    bodyParts,
  };
}

function attachment(value: unknown, where: string): AttachmentDef {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), model: text(source, 'model', where), socket: text(source, 'socket', where) };
}

function wearable(value: unknown, where: string): WearableDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    model: text(source, 'model', where),
    region: choice(source, 'region', WEAR_REGIONS, where),
    tint: text(source, 'tint', where),
    hides: textList(source, 'hides', where),
  };
}

function propLight(value: unknown, where: string): PropLight | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  return { color: text(source, 'color', where), intensity: numeric(source, 'intensity', where), distance: numeric(source, 'distance', where), height: numeric(source, 'height', where) };
}

function prop(value: unknown, where: string): PropDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    model: text(source, 'model', where),
    scale: numeric(source, 'scale', where),
    blockRadius: numeric(source, 'blockRadius', where),
    light: propLight(source['light'], `${where}.light`),
  };
}

function point(value: unknown, where: string): ZonePoint {
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), z: numeric(source, 'z', where) };
}

function zoneProp(value: unknown, where: string): ZoneProp {
  const source: Fields = fields(value, where);
  return { prop: text(source, 'prop', where), x: numeric(source, 'x', where), z: numeric(source, 'z', where), y: numeric(source, 'y', where), rotationDegrees: numeric(source, 'rotationDegrees', where) };
}

function packMember(value: unknown, where: string): PackMember {
  const source: Fields = fields(value, where);
  return { monster: text(source, 'monster', where), count: numeric(source, 'count', where) };
}

function pack(value: unknown, where: string): ZonePack {
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), z: numeric(source, 'z', where), members: each(source['members'], `${where}.members`, packMember) };
}

function surgeRules(value: unknown, where: string): SurgeRules | null {
  if (value === undefined) throw new ContentError(where, 'expected surge rules, or null for a zone without surges');
  if (value === null) return null;
  const source: Fields = fields(value, where);
  return { delay: numeric(source, 'delay', where), surgesPerExtraMonster: numeric(source, 'surgesPerExtraMonster', where), maxExtraMonsters: numeric(source, 'maxExtraMonsters', where) };
}

function positive(source: Fields, key: string, where: string): number {
  const value: number = numeric(source, key, where);
  if (value <= 0) throw new ContentError(`${where}.${key}`, 'expected a number above zero');
  return value;
}

function condition(value: unknown, where: string): Condition {
  const source: Fields = fields(value, where);
  const type: Condition['type'] = choice(source, 'type', ['quest', 'objective'] as const, where);
  if (type === 'quest') return { type, quest: text(source, 'quest', where), is: choice(source, 'is', QUEST_STATES, where) };
  return { type, quest: text(source, 'quest', where), objective: text(source, 'objective', where), is: choice(source, 'is', OBJECTIVE_STATES, where) };
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

function zone(value: unknown, where: string): ZoneDef {
  const source: Fields = fields(value, where);
  const floorFields: Fields = fields(source['floors'], `${where}.floors`);
  const floors: Record<string, readonly string[]> = {};
  for (const key of Object.keys(floorFields)) floors[key] = textList(floorFields, key, `${where}.floors`);
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
    walls: { tall: textList(walls, 'tall', `${where}.walls`), low: text(walls, 'low', `${where}.walls`), corner: text(walls, 'corner', `${where}.walls`), halfThickness: numeric(walls, 'halfThickness', `${where}.walls`) },
    props: each(source['props'], `${where}.props`, zoneProp),
    playerStart: point(source['playerStart'], `${where}.playerStart`),
    packs,
    surge,
    exits: [...byId(each(source['exits'], `${where}.exits`, zoneExit), `${where}.exits`).values()],
    checkpoints: [...byId(each(source['checkpoints'], `${where}.checkpoints`, zoneCheckpoint), `${where}.checkpoints`).values()],
    waypoint: zoneWaypoint(source['waypoint'], `${where}.waypoint`),
    npcs: each(source['npcs'], `${where}.npcs`, zoneNpc),
    ambience: zoneAmbience(source['ambience'], `${where}.ambience`),
  };
}

function line(value: unknown, where: string): LineDef {
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
  };
}

function npcs(value: unknown, where: string): Map<string, NpcDef> {
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

function objective(value: unknown, where: string): ObjectiveDef {
  const source: Fields = fields(value, where);
  const type: ObjectiveDef['type'] = choice(source, 'type', ['talk', 'reach', 'defeat'] as const, where);
  const id: string = text(source, 'id', where);
  const shown: string = text(source, 'text', where);
  if (type === 'talk') return { type, id, text: shown, npc: text(source, 'npc', where) };
  if (type === 'defeat') return { type, id, text: shown, monster: text(source, 'monster', where) };
  return { type, id, text: shown, zone: text(source, 'zone', where), x: numeric(source, 'x', where), z: numeric(source, 'z', where), radius: positive(source, 'radius', where) };
}

function quest(value: unknown, where: string): QuestDef {
  const source: Fields = fields(value, where);
  const objectives: ObjectiveDef[] = [...byId(each(source['objectives'], `${where}.objectives`, objective), `${where}.objectives`).values()];
  if (objectives.length === 0) throw new ContentError(`${where}.objectives`, 'a quest needs at least one objective');
  return { id: text(source, 'id', where), name: text(source, 'name', where), requires: textList(source, 'requires', where), objectives };
}

function worldDef(value: unknown, where: string): WorldDef {
  const source: Fields = fields(value, where);
  const scaling: Fields = fields(source['scaling'], `${where}.scaling`);
  return {
    map: each(source['map'], `${where}.map`, mapPlace),
    start: text(source, 'start', where),
    scaling: {
      lifePerLevel: numeric(scaling, 'lifePerLevel', `${where}.scaling`),
      damagePerLevel: numeric(scaling, 'damagePerLevel', `${where}.scaling`),
      xpPerLevel: numeric(scaling, 'xpPerLevel', `${where}.scaling`),
    },
  };
}

function statBlock(value: unknown, where: string): StatBlock {
  const source: Fields = fields(value, where);
  const read = (stat: keyof StatBlock): number => numeric(source, stat, where);
  return {
    maxLife: read('maxLife'),
    maxMana: read('maxMana'),
    lifeRegen: read('lifeRegen'),
    manaRegen: read('manaRegen'),
    damageMin: read('damageMin'),
    damageMax: read('damageMax'),
    damagePercent: read('damagePercent'),
    attackSpeed: read('attackSpeed'),
    critChance: read('critChance'),
    critMultiplier: read('critMultiplier'),
    moveSpeed: read('moveSpeed'),
    armour: read('armour'),
    goldFind: read('goldFind'),
  };
}

function skillBinding(value: unknown, where: string): SkillBinding {
  const source: Fields = fields(value, where);
  return { skill: text(source, 'skill', where), bindings: textList(source, 'bindings', where), label: text(source, 'label', where) };
}

function player(value: unknown, where: string): PlayerDef {
  const source: Fields = fields(value, where);
  const xp: Fields = fields(source['xp'], `${where}.xp`);
  return {
    rig: text(source, 'rig', where),
    radius: numeric(source, 'radius', where),
    baseStats: statBlock(source['baseStats'], `${where}.baseStats`),
    perLevel: each(source['perLevel'], `${where}.perLevel`, statMod),
    skillBar: each(source['skillBar'], `${where}.skillBar`, skillBinding),
    xp: { base: numeric(xp, 'base', `${where}.xp`), growth: numeric(xp, 'growth', `${where}.xp`), maxLevel: numeric(xp, 'maxLevel', `${where}.xp`) },
    startingItems: textList(source, 'startingItems', where),
    unarmedVisual: nullableText(source, 'unarmedVisual', where),
    tint: text(source, 'tint', where),
    color: text(source, 'color', where),
    gear: textList(source, 'gear', where),
    wear: textList(source, 'wear', where),
    inventorySize: numeric(source, 'inventorySize', where),
    pickupRadius: numeric(source, 'pickupRadius', where),
    goldMagnetRadius: numeric(source, 'goldMagnetRadius', where),
    respawnDelay: numeric(source, 'respawnDelay', where),
  };
}

export function parseContent(raw: RawContent): Content {
  const itemFields: Fields = fields(raw.items, 'items');
  const scaling: Fields = fields(itemFields['scaling'], 'items.scaling');
  return {
    skills: byId(each(raw.skills, 'skills', skill), 'skills'),
    monsters: byId(each(raw.monsters, 'monsters', monster), 'monsters'),
    rarities: each(itemFields['rarities'], 'items.rarities', rarity),
    itemBases: byId(each(itemFields['bases'], 'items.bases', itemBase), 'items.bases'),
    affixes: byId(each(itemFields['affixes'], 'items.affixes', affix), 'items.affixes'),
    itemScaling: { implicitPerLevel: numeric(scaling, 'implicitPerLevel', 'items.scaling') },
    skillTree: each(raw.skillTree, 'skillTree', treeNode),
    rigs: byId(each(raw.rigs, 'rigs', rig), 'rigs'),
    attachments: byId(each(raw.attachments, 'attachments', attachment), 'attachments'),
    wearables: byId(each(raw.wearables, 'wearables', wearable), 'wearables'),
    props: byId(each(raw.props, 'props', prop), 'props'),
    zones: byId(each(raw.zones, 'zones', zone), 'zones'),
    world: worldDef(raw.world, 'world'),
    npcs: npcs(raw.npcs, 'npcs'),
    lines: byId(each(raw.lines, 'lines', line), 'lines'),
    quests: byId(each(raw.quests, 'quests', quest), 'quests'),
    player: player(raw.player, 'player'),
  };
}

const WORN_SLOTS: ReadonlySet<ItemSlot> = new Set<ItemSlot>(['head', 'chest', 'hands', 'legs', 'feet']);

export function contentProblems(content: Content): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(problem);
  };
  const fits = (holder: string, rigId: string, attachmentId: string): void => {
    const held: AttachmentDef | undefined = content.attachments.get(attachmentId);
    need(held !== undefined, `${holder} uses unknown attachment ${attachmentId}`);
    const sockets: RigDef['sockets'] | undefined = content.rigs.get(rigId)?.sockets;
    if (held !== undefined && sockets !== undefined) need(sockets[held.socket] !== undefined, `${holder} uses attachment ${attachmentId}, but rig ${rigId} has no socket ${held.socket}`);
  };
  const wears = (holder: string, rigId: string, wearableIds: readonly string[]): void => {
    const regions: Set<WearRegion> = new Set<WearRegion>();
    const bodyParts: RigDef['bodyParts'] | undefined = content.rigs.get(rigId)?.bodyParts;
    for (const id of wearableIds) {
      const worn: WearableDef | undefined = content.wearables.get(id);
      need(worn !== undefined, `${holder} wears unknown wearable ${id}`);
      if (worn === undefined) continue;
      need(!regions.has(worn.region), `${holder} wears two pieces on its ${worn.region}`);
      regions.add(worn.region);
      if (bodyParts === undefined) continue;
      for (const part of worn.hides) need(bodyParts[part] !== undefined, `${holder} wears ${id}, which hides ${part}, but rig ${rigId} has no body part ${part}`);
    }
  };
  for (const def of content.monsters.values()) {
    need(content.skills.has(def.skill), `monster ${def.id} uses unknown skill ${def.skill}`);
    need(content.rigs.has(def.rig), `monster ${def.id} uses unknown rig ${def.rig}`);
    for (const held of def.gear) fits(`monster ${def.id}`, def.rig, held);
    wears(`monster ${def.id}`, def.rig, def.wear);
  }
  need(content.rigs.has(content.player.rig), `player uses unknown rig ${content.player.rig}`);
  for (const held of content.player.gear) fits('player', content.player.rig, held);
  wears('player', content.player.rig, content.player.wear);
  if (content.player.unarmedVisual !== null) fits('player', content.player.rig, content.player.unarmedVisual);
  for (const base of content.itemBases.values()) {
    if (base.visual !== null) fits(`item ${base.id}`, content.player.rig, base.visual);
    wears(`item ${base.id}`, content.player.rig, base.wear);
    need(WORN_SLOTS.has(base.slot) === (base.material !== null), `item ${base.id} in slot ${base.slot} ${base.material === null ? 'needs a material' : 'cannot have a material'}`);
  }
  for (const worn of content.wearables.values()) wears(`wearable ${worn.id}`, content.player.rig, [worn.id]);
  for (const binding of content.player.skillBar) need(content.skills.has(binding.skill), `skill bar uses unknown skill ${binding.skill}`);
  for (const base of content.player.startingItems) need(content.itemBases.has(base), `starting item ${base} is unknown`);
  need(content.rarities.length > 0, 'items need at least one rarity');
  const nodeIds: Set<string> = new Set<string>(content.skillTree.map((node: SkillTreeNodeDef): string => node.id));
  need(nodeIds.size === content.skillTree.length, 'skill tree has duplicate node ids');
  for (const node of content.skillTree) {
    for (const required of node.requires) need(nodeIds.has(required), `tree node ${node.id} requires unknown node ${required}`);
    for (const mod of node.skillMods) need(content.skills.has(mod.skill), `tree node ${node.id} modifies unknown skill ${mod.skill}`);
  }
  const known = (holder: string, list: readonly Condition[]): void => {
    for (const entry of list) {
      const questDef: QuestDef | undefined = content.quests.get(entry.quest);
      need(questDef !== undefined, `${holder} names unknown quest ${entry.quest}`);
      if (questDef !== undefined && entry.type === 'objective') need(questDef.objectives.some((candidate: ObjectiveDef): boolean => candidate.id === entry.objective), `${holder} names unknown objective ${entry.quest}.${entry.objective}`);
    }
  };
  need(content.zones.has(content.world.start), `world starts in unknown zone ${content.world.start}`);
  for (const place of content.world.map) need(content.zones.has(place.zone), `world map places unknown zone ${place.zone}`);
  for (const zoneDef of content.zones.values()) {
    const at: string = `zone ${zoneDef.id}`;
    for (const models of Object.values(zoneDef.floors)) for (const model of models) need(content.props.has(model), `${at} floor uses unknown prop ${model}`);
    for (const model of [...zoneDef.walls.tall, zoneDef.walls.low, zoneDef.walls.corner]) need(content.props.has(model), `${at} wall uses unknown prop ${model}`);
    for (const placed of zoneDef.props) need(content.props.has(placed.prop), `${at} places unknown prop ${placed.prop}`);
    for (const packDef of zoneDef.packs) for (const member of packDef.members) need(content.monsters.has(member.monster), `${at} pack uses unknown monster ${member.monster}`);
    need(content.world.map.some((place: MapPlace): boolean => place.zone === zoneDef.id), `${at} has no place on the world map`);
    for (const placed of zoneDef.npcs) {
      need(content.npcs.has(placed.npc), `${at} places unknown npc ${placed.npc}`);
      known(`${at} npc ${placed.npc}`, placed.when);
    }
    for (const exit of zoneDef.exits) {
      known(`${at} exit ${exit.id}`, exit.requires);
      const far: ZoneExit | undefined = content.zones.get(exit.to)?.exits.find((candidate: ZoneExit): boolean => candidate.id === exit.toExit);
      need(far !== undefined, `${at} exit ${exit.id} leads to unknown exit ${exit.to}.${exit.toExit}`);
      if (far !== undefined) need(far.to === zoneDef.id && far.toExit === exit.id, `${at} exit ${exit.id} is not matched by ${exit.to}.${exit.toExit}`);
    }
  }
  for (const def of content.npcs.values()) {
    need(content.rigs.has(def.rig), `npc ${def.id} uses unknown rig ${def.rig}`);
    for (const held of def.gear) fits(`npc ${def.id}`, def.rig, held);
    wears(`npc ${def.id}`, def.rig, def.wear);
    const lastWord: number = def.talks.findIndex((entry: TalkDef): boolean => !entry.once && entry.when.length === 0);
    need(lastWord >= 0, `npc ${def.id} has no repeatable conversation without conditions`);
    for (const unreachable of lastWord < 0 ? [] : def.talks.slice(lastWord + 1)) need(false, `conversation ${unreachable.id} of ${def.id} can never play: it comes after the repeatable conversation ${def.talks[lastWord]?.id ?? ''}, which has no conditions`);
    for (const entry of def.talks) {
      known(`conversation ${entry.id}`, entry.when);
      for (const lineId of entry.lines) {
        const spoken: LineDef | undefined = content.lines.get(lineId);
        need(spoken !== undefined, `conversation ${entry.id} uses unknown line ${lineId}`);
        if (spoken !== undefined) need(spoken.speaker === def.id, `conversation ${entry.id} of ${def.id} uses line ${lineId}, which is spoken by ${spoken.speaker}`);
      }
    }
  }
  for (const spoken of content.lines.values()) need(content.npcs.has(spoken.speaker), `line ${spoken.id} has unknown speaker ${spoken.speaker}`);
  for (const questDef of content.quests.values()) {
    for (const required of questDef.requires) need(content.quests.has(required) && required !== questDef.id, `quest ${questDef.id} requires unknown quest ${required}`);
    for (const goal of questDef.objectives) {
      const at: string = `quest ${questDef.id} objective ${goal.id}`;
      switch (goal.type) {
        case 'talk':
          need(content.npcs.has(goal.npc), `${at} names unknown npc ${goal.npc}`);
          break;
        case 'reach':
          need(content.zones.has(goal.zone), `${at} names unknown zone ${goal.zone}`);
          break;
        case 'defeat':
          need(content.monsters.has(goal.monster), `${at} names unknown monster ${goal.monster}`);
          break;
      }
    }
  }
  return problems;
}
