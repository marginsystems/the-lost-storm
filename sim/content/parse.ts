import type { Fields } from './read.ts';
import { byId, choice, choiceList, ContentError, each, fields, flag, nullableText, numeric, text, textList } from './read.ts';
import type {
  AffixDef,
  AttachmentDef,
  AnimationKey,
  ArenaDef,
  ArenaPack,
  ArenaPoint,
  ArenaProp,
  Content,
  Delivery,
  ItemBaseDef,
  MonsterBehaviour,
  MonsterDef,
  PackMember,
  PlayerDef,
  PropDef,
  PropLight,
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
  Triple,
  WearableDef,
  WearRegion,
} from './types.ts';
import { ACTION_ANIMATIONS, AFFIX_POSITIONS, ANIMATION_KEYS, ITEM_SLOTS, MOD_OPS, REQUIRE_MODES, SKILL_MOD_FIELDS, STAT_IDS, VFX_STYLES, WEAR_REGIONS } from './types.ts';

export interface RawContent {
  readonly skills: unknown;
  readonly monsters: unknown;
  readonly items: unknown;
  readonly skillTree: unknown;
  readonly rigs: unknown;
  readonly attachments: unknown;
  readonly wearables: unknown;
  readonly props: unknown;
  readonly arena: unknown;
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

function point(value: unknown, where: string): ArenaPoint {
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), z: numeric(source, 'z', where) };
}

function arenaProp(value: unknown, where: string): ArenaProp {
  const source: Fields = fields(value, where);
  return { prop: text(source, 'prop', where), x: numeric(source, 'x', where), z: numeric(source, 'z', where), y: numeric(source, 'y', where), rotationDegrees: numeric(source, 'rotationDegrees', where) };
}

function packMember(value: unknown, where: string): PackMember {
  const source: Fields = fields(value, where);
  return { monster: text(source, 'monster', where), count: numeric(source, 'count', where) };
}

function pack(value: unknown, where: string): ArenaPack {
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), z: numeric(source, 'z', where), members: each(source['members'], `${where}.members`, packMember) };
}

function arena(value: unknown, where: string): ArenaDef {
  const source: Fields = fields(value, where);
  const floorFields: Fields = fields(source['floors'], `${where}.floors`);
  const floors: Record<string, readonly string[]> = {};
  for (const key of Object.keys(floorFields)) floors[key] = textList(floorFields, key, `${where}.floors`);
  const walls: Fields = fields(source['walls'], `${where}.walls`);
  const surge: Fields = fields(source['surge'], `${where}.surge`);
  const tiles: string[] = textList(source, 'tiles', where);
  const width: number = tiles[0]?.length ?? 0;
  if (width === 0 || tiles.some((row: string): boolean => row.length !== width)) throw new ContentError(`${where}.tiles`, 'every row must have the same length');
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    cellSize: numeric(source, 'cellSize', where),
    floorHeight: numeric(source, 'floorHeight', where),
    tiles,
    floors,
    walls: { tall: textList(walls, 'tall', `${where}.walls`), low: text(walls, 'low', `${where}.walls`), corner: text(walls, 'corner', `${where}.walls`), halfThickness: numeric(walls, 'halfThickness', `${where}.walls`) },
    props: each(source['props'], `${where}.props`, arenaProp),
    playerStart: point(source['playerStart'], `${where}.playerStart`),
    packs: each(source['packs'], `${where}.packs`, pack),
    surge: {
      delay: numeric(surge, 'delay', `${where}.surge`),
      lifePerSurge: numeric(surge, 'lifePerSurge', `${where}.surge`),
      damagePerSurge: numeric(surge, 'damagePerSurge', `${where}.surge`),
      xpPerSurge: numeric(surge, 'xpPerSurge', `${where}.surge`),
      surgesPerExtraMonster: numeric(surge, 'surgesPerExtraMonster', `${where}.surge`),
      maxExtraMonsters: numeric(surge, 'maxExtraMonsters', `${where}.surge`),
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
    arena: arena(raw.arena, 'arena'),
    player: player(raw.player, 'player'),
  };
}

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
  const arenaDef: ArenaDef = content.arena;
  for (const models of Object.values(arenaDef.floors)) for (const model of models) need(content.props.has(model), `arena floor uses unknown prop ${model}`);
  for (const model of [...arenaDef.walls.tall, arenaDef.walls.low, arenaDef.walls.corner]) need(content.props.has(model), `arena wall uses unknown prop ${model}`);
  for (const placed of arenaDef.props) need(content.props.has(placed.prop), `arena places unknown prop ${placed.prop}`);
  for (const packDef of arenaDef.packs) for (const member of packDef.members) need(content.monsters.has(member.monster), `arena pack uses unknown monster ${member.monster}`);
  return problems;
}
