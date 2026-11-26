import { markerLibrary } from './parse-markers.ts';
import { markerProblems } from './markers.ts';
import { packRanks, rankProblems } from './parse-ranks.ts';
import { runTable, runTableProblems } from './parse-run-table.ts';
import { tailwind, tailwindProblems } from './parse-tailwind.ts';
import { propCache, propLid, propSeat } from './parse-cache.ts';
import { propClimb } from './parse-climb.ts';
import { propLight } from './parse-light.ts';
import { atlasProblems } from './atlas.ts';
import { affix, dropLean, family, itemBase, rarity } from './parse-items.ts';
import { itemProblems } from './item-rules.ts';
import { fitProblems } from './fit-rules.ts';
import { powerRuleProblems } from './power-rules.ts';
import { auraProblems } from './aura-rules.ts';
import { leanProblems } from './lean-rules.ts';
import { books } from './parse-story.ts';
import { storyFlagNames, storyProblems } from './story.ts';
import { bossPackProblems, conditionProblems, roadProblems } from './road.ts';
import { parseFlasks } from './flasks.ts';
import { boss, pieceStrikes } from './parse-boss.ts';
import { combatProblems, fieldDelivery, markDelivery, monsterMod, monsterTraits, reviveDelivery, skillMotion } from './parse-combat.ts';
import { faction, factionProblems } from './parse-factions.ts';
import { momentLibrary } from './parse-moments.ts';
import { rig } from './parse-rigs.ts';
import { momentProblems } from './moments.ts';
import { sceneProblems } from './parse-scene.ts';
import { chartDef, chartProblems, treeNode } from './parse-chart.ts';
import { skillEmpowerment, statMod } from './parse-mods.ts';
import { bookProblems, shapeDelivery, shapeProblems, SHAPE_TYPES, skillPress, skillUnlock } from './parse-shapes.ts';
import type { Fields } from './read.ts';
import { flashProblems } from './parse-flash.ts';
import { PICTURE_VIEWS } from './rig-types.ts';
import { surface } from './parse-surface.ts';
import { line, npcs, quest, worldDef, zone } from './parse-world.ts';
import { skillVfx } from './parse-vfx.ts';
import { mendProblems, skillMend } from './mend.ts';
import { NOVA_SIDES } from './mend-types.ts';
import { service, trade, tradeProblems } from './parse-trade.ts';
import { xpAfter } from './parse-xp.ts';
import { RISE_SIDES } from './prop-types.ts';
import { byId, choice, choiceList, colour, ContentError, each, fields, flag, fraction, nonNegative, nullableText, numeric, positive, share, text, textList } from './read.ts';
import type {
  ActDef,
  AttachmentDef,
  ChartDef,
  SkillTreeNodeDef,
  BossPhase,
  BossSkill,
  ComboStep,
  Condition,
  Content,
  Delivery,
  ItemSlot,
  LineDef,
  MapPlace,
  MonsterBehaviour,
  MonsterDef,
  NpcDef,
  FirstDropDef,
  HeroDef, PlayerDef,
  PropClimb,
  ObjectiveDef,
  ObjectiveGift,
  PropDef,
  RarityDef,
  ResistanceRules,
  RestraintMark,
  SkillCap,
  StatCap,
  RigClips,
  RigDef,
  SkillBinding,
  SkillCombo,
  SkillDef,
  StatBlock,
  TalkDef,
  WearableDef,
  WearRegion,
  ZoneExit,
  ZoneDuel,
  ZoneReturn,
  XpGap,
} from './types.ts';
import { BODY_MATERIALS, DAMAGE_TYPES, MANA_SHOWS, NAME_STYLES, SKILL_CATEGORIES, SKILL_MOD_FIELDS, STAT_IDS, WEAR_REGIONS } from './types.ts';

export interface RawContent {
  readonly skills: unknown;
  readonly monsters: unknown;
  readonly monsterMods: unknown;
  readonly factions: unknown;
  readonly items: unknown;
  readonly skillTree: unknown;
  readonly chart: unknown;
  readonly rigs: unknown;
  readonly attachments: unknown;
  readonly wearables: unknown;
  readonly baseLayers: unknown;
  readonly surfaces: unknown;
  readonly props: unknown;
  readonly zones: readonly unknown[];
  readonly world: unknown;
  readonly npcs: unknown;
  readonly lines: unknown;
  readonly quests: unknown;
  readonly player: unknown;
  readonly flasks: unknown;
  readonly trade: unknown;
  readonly books: unknown;
  readonly moments: unknown;
  readonly packRanks: unknown;
  readonly runTable: unknown;
  readonly tailwind: unknown;
  readonly markers: unknown;
}

function delivery(value: unknown, where: string): Delivery {
  const source: Fields = fields(value, where);
  const type: Delivery['type'] = choice(source, 'type', ['arc', 'nova', 'projectile', 'dash', 'mark', 'revive', 'field', ...SHAPE_TYPES] as const, where);
  if (type === 'chain' || type === 'area' || type === 'blink' || type === 'beam') return shapeDelivery(type, source, where);
  if (type === 'dash') {
    const duration: number = positive(source, 'duration', where);
    const invulnerable: number = numeric(source, 'invulnerable', where);
    if (invulnerable < 0 || invulnerable > duration) throw new ContentError(`${where}.invulnerable`, `expected a window from 0 to the duration ${duration}`);
    return { type, distance: positive(source, 'distance', where), duration, invulnerable, passThrough: source['passThrough'] === undefined ? false : flag(source, 'passThrough', where), steady: source['steady'] === undefined ? false : flag(source, 'steady', where) };
  }
  if (type === 'mark') return markDelivery(source, where);
  if (type === 'revive') return reviveDelivery(source, where);
  if (type === 'field') return fieldDelivery(source, where);
  if (type === 'arc') return { type, reach: numeric(source, 'reach', where), arcDegrees: numeric(source, 'arcDegrees', where) };
  if (type === 'nova') return { type, radius: numeric(source, 'radius', where), side: source['side'] === undefined ? 'foes' : choice(source, 'side', NOVA_SIDES, where) };
  return {
    type,
    speed: numeric(source, 'speed', where),
    radius: numeric(source, 'radius', where),
    range: numeric(source, 'range', where),
    pierce: numeric(source, 'pierce', where),
    count: numeric(source, 'count', where),
    spreadDegrees: numeric(source, 'spreadDegrees', where),
    interval: source['interval'] === undefined ? 0 : nonNegative(source, 'interval', where),
  };
}

function comboStep(value: unknown, where: string): ComboStep {
  const source: Fields = fields(value, where);
  return {
    animation: text(source, 'animation', where),
    windup: positive(source, 'windup', where),
    recovery: numeric(source, 'recovery', where),
    damageScale: positive(source, 'damageScale', where),
    areaScale: positive(source, 'areaScale', where),
    knockbackScale: numeric(source, 'knockbackScale', where),
    stagger: numeric(source, 'stagger', where),
    shake: numeric(source, 'shake', where),
    hitStop: numeric(source, 'hitStop', where),
  };
}

function skillCombo(value: unknown, where: string): SkillCombo | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const steps: ComboStep[] = each(source['steps'], `${where}.steps`, comboStep);
  if (steps.length === 0) throw new ContentError(`${where}.steps`, 'a combo needs at least one step after the opening hit');
  return { window: positive(source, 'window', where), steps };
}

function skill(value: unknown, where: string): SkillDef {
  const source: Fields = fields(value, where);
  const damage: Fields = fields(source['damage'], `${where}.damage`);
  return {
    id: text(source, 'id', where),
    form: text(source, 'id', where),
    name: text(source, 'name', where),
    description: text(source, 'description', where),
    icon: text(source, 'icon', where),
    animation: text(source, 'animation', where),
    empowered: skillEmpowerment(source['empowered'], `${where}.empowered`),
    manaCost: numeric(source, 'manaCost', where),
    cooldown: numeric(source, 'cooldown', where),
    windup: numeric(source, 'windup', where),
    recovery: numeric(source, 'recovery', where),
    scalesWithAttackSpeed: flag(source, 'scalesWithAttackSpeed', where),
    engageRange: numeric(source, 'engageRange', where),
    delivery: delivery(source['delivery'], `${where}.delivery`),
    damage: { type: damage['type'] === undefined ? 'physical' : choice(damage, 'type', DAMAGE_TYPES, `${where}.damage`), weaponPercent: numeric(damage, 'weaponPercent', where), flatMin: numeric(damage, 'flatMin', where), flatMax: numeric(damage, 'flatMax', where) },
    knockback: numeric(source, 'knockback', where),
    stagger: numeric(source, 'stagger', where),
    shake: numeric(source, 'shake', where),
    hitStop: numeric(source, 'hitStop', where),
    vfx: skillVfx(source['vfx'], `${where}.vfx`),
    category: source['category'] === undefined ? 'none' : choice(source, 'category', SKILL_CATEGORIES, where),
    combo: skillCombo(source['combo'], `${where}.combo`),
    ...skillMotion(source, where),
    ...skillPress(source, where),
    mend: skillMend(source['mend'], `${where}.mend`),
  };
}

function behaviour(value: unknown, where: string): MonsterBehaviour {
  const source: Fields = fields(value, where);
  const type: MonsterBehaviour['type'] = choice(source, 'type', ['chaser', 'ranged', 'stalker', 'swarm', 'ambush', 'fixed'] as const, where);
  if (type === 'chaser') return { type };
  if (type === 'fixed') return { type, sealed: source['sealed'] === undefined ? false : flag(source, 'sealed', where), collateral: source['collateral'] === undefined ? 0 : share(source, 'collateral', where), strikes: source['strikes'] === undefined ? null : pieceStrikes(source['strikes'], `${where}.strikes`) };
  if (type === 'stalker') return { type, orbitRange: positive(source, 'orbitRange', where) };
  if (type === 'swarm') return { type, ring: positive(source, 'ring', where) };
  if (type === 'ambush') return { type, spring: positive(source, 'spring', where) };
  return { type, preferredRange: numeric(source, 'preferredRange', where), retreatRange: numeric(source, 'retreatRange', where), lead: source['lead'] === undefined ? 0 : nonNegative(source, 'lead', where) };
}

function monster(value: unknown, where: string): MonsterDef {
  const source: Fields = fields(value, where);
  const loot: Fields = fields(source['loot'], `${where}.loot`);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    rig: text(source, 'rig', where),
    bodyMaterial: source['bodyMaterial'] === undefined ? 'flesh' : choice(source, 'bodyMaterial', BODY_MATERIALS, where),
    scale: numeric(source, 'scale', where),
    radius: numeric(source, 'radius', where),
    life: numeric(source, 'life', where),
    scalesLife: source['scalesLife'] === undefined ? true : flag(source, 'scalesLife', where),
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
    boss: boss(source['boss'], `${where}.boss`),
    ...monsterTraits(source, where),
  };
}

function attachment(value: unknown, where: string): AttachmentDef {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), model: text(source, 'model', where), socket: text(source, 'socket', where), stance: source['stance'] === undefined ? null : nullableText(source, 'stance', where), view: source['view'] === undefined ? 'side' : choice(source, 'view', PICTURE_VIEWS, where), surfaces: dressing(source['surfaces'], `${where}.surfaces`) };
}

function wearable(value: unknown, where: string): WearableDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    model: text(source, 'model', where),
    pieces: source['pieces'] === undefined ? [] : textList(source, 'pieces', where),
    region: choice(source, 'region', WEAR_REGIONS, where),
    covers: source['covers'] === undefined ? [] : choiceList(source, 'covers', WEAR_REGIONS, where),
    fit: source['fit'] === undefined ? null : text(source, 'fit', where),
    fits: dressing(source['fits'], `${where}.fits`),
    surfaces: dressing(source['surfaces'], `${where}.surfaces`),
    tint: text(source, 'tint', where),
    hides: textList(source, 'hides', where),
    wakeLamps: source['wakeLamps'] === undefined ? 1 : share(source, 'wakeLamps', where),
    iconWith: source['iconWith'] === undefined ? [] : textList(source, 'iconWith', where),
  };
}

function baseLayers(value: unknown, where: string): ReadonlyMap<string, readonly string[]> {
  const layers: Map<string, readonly string[]> = new Map<string, readonly string[]>();
  each(value, where, (entry: unknown, at: string): null => {
    const source: Fields = fields(entry, at);
    const body: string = text(source, 'body', at);
    if (layers.has(body)) throw new ContentError(`${at}.body`, `${body} has two base layers`);
    layers.set(body, textList(source, 'wear', at));
    return null;
  });
  return layers;
}

function dressing(value: unknown, where: string): Record<string, string> {
  if (value === undefined) return {};
  const source: Fields = fields(value, where);
  const mapped: Record<string, string> = {};
  for (const key of Object.keys(source)) mapped[key] = text(source, key, where);
  return mapped;
}

function prop(value: unknown, where: string): PropDef {
  const source: Fields = fields(value, where);
  const blockRadius: number = numeric(source, 'blockRadius', where);
  const blockLength: number = source['blockLength'] === undefined ? 0 : numeric(source, 'blockLength', where);
  if (blockRadius < 0 || blockLength < 0) throw new ContentError(`${where}.blockRadius`, 'a collider cannot be negative');
  if (blockLength > 0 && blockRadius === 0) throw new ContentError(`${where}.blockRadius`, 'a collider with a length needs a radius above zero to block anything');
  const model: string = text(source, 'model', where);
  const walkOn: boolean = source['walkOn'] === undefined ? false : flag(source, 'walkOn', where);
  const solid: boolean | null = source['solid'] === undefined ? null : flag(source, 'solid', where);
  if (walkOn && solid !== null) throw new ContentError(`${where}.walkOn`, 'a prop the hero walks on never blocks, so it cannot also say whether it is solid');
  const climb: PropClimb | null = propClimb(source['climb'], `${where}.climb`);
  if (climb !== null && (walkOn || solid !== null)) throw new ContentError(`${where}.climb`, 'a prop the hero climbs is blocked only by its own walls, so it cannot also be walkOn or say whether it is solid');
  return {
    id: text(source, 'id', where),
    model,
    footprint: source['footprint'] === undefined ? model : text(source, 'footprint', where),
    scale: numeric(source, 'scale', where),
    blockRadius,
    blockLength,
    solid,
    walkOn,
    climb,
    rises: source['rises'] === undefined ? null : choice(source, 'rises', RISE_SIDES, where),
    shadow: source['shadow'] === undefined ? true : flag(source, 'shadow', where),
    footprints: [],
    height: 0,
    light: propLight(source['light'], `${where}.light`),
    surfaces: dressing(source['surfaces'], `${where}.surfaces`),
    tint: source['tint'] === undefined ? null : colour(source, 'tint', where),
    service: service(source, where),
    label: nullableText(source, 'label', where),
    cache: propCache(source['cache'], `${where}.cache`),
    lid: propLid(source['lid'], `${where}.lid`),
    seat: propSeat(source['seat'], `${where}.seat`),
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
    stormResist: read('stormResist'),
    frostResist: read('frostResist'),
  };
}

function skillBinding(value: unknown, where: string): SkillBinding {
  const source: Fields = fields(value, where);
  return { skill: nullableText(source, 'skill', where), bindings: textList(source, 'bindings', where), label: text(source, 'label', where) };
}

function resistanceRules(value: unknown, where: string): ResistanceRules {
  const source: Fields = fields(value, where);
  const cap: number = fraction(source, 'cap', where);
  const floor: number = numeric(source, 'floor', where);
  if (floor > 0 || floor < -1) throw new ContentError(`${where}.floor`, 'expected a number from -1 to 0');
  return { armourCap: fraction(source, 'armourCap', where), cap, floor, tierPenalty: fraction(source, 'tierPenalty', where) };
}

function firstDrop(value: unknown, where: string): FirstDropDef {
  const source: Fields = fields(value, where);
  return { flag: text(source, 'flag', where), rarity: text(source, 'rarity', where) };
}

function player(value: unknown, where: string): PlayerDef {
  const source: Fields = fields(value, where);
  const xp: Fields = fields(source['xp'], `${where}.xp`);
  const penalty: Fields = fields(source['deathPenalty'], `${where}.deathPenalty`);
  const heroes: HeroDef[] = each(source['heroes'], `${where}.heroes`, (entry: unknown, entryWhere: string): HeroDef => {
    const hero: Fields = fields(entry, entryWhere);
    return { id: text(hero, 'id', entryWhere), name: text(hero, 'name', entryWhere), rig: text(hero, 'rig', entryWhere), names: choice(hero, 'names', NAME_STYLES, entryWhere) };
  });
  const [first] = heroes;
  if (first === undefined) throw new ContentError(`${where}.heroes`, 'the player needs at least one hero');
  return {
    hero: first,
    heroes,
    radius: numeric(source, 'radius', where),
    baseStats: statBlock(source['baseStats'], `${where}.baseStats`),
    perLevel: each(source['perLevel'], `${where}.perLevel`, statMod),
    skillBar: each(source['skillBar'], `${where}.skillBar`, skillBinding),
    skillBook: each(source['skillBook'], `${where}.skillBook`, skillUnlock),
    xp: { base: numeric(xp, 'base', `${where}.xp`), growth: numeric(xp, 'growth', `${where}.xp`), after: xpAfter(xp['after'], `${where}.xp.after`), maxLevel: numeric(xp, 'maxLevel', `${where}.xp`), gap: xpGap(xp['gap'], `${where}.xp.gap`) },
    startingItems: textList(source, 'startingItems', where),
    dressedFlag: text(source, 'dressedFlag', where),
    firstDrop: firstDrop(source['firstDrop'], `${where}.firstDrop`),
    neverWears: textList(source, 'neverWears', where),
    unarmedVisual: nullableText(source, 'unarmedVisual', where),
    manaShows: choice(source, 'manaShows', MANA_SHOWS, where),
    tint: text(source, 'tint', where),
    color: text(source, 'color', where),
    gear: textList(source, 'gear', where),
    inventorySize: numeric(source, 'inventorySize', where),
    pickupRadius: numeric(source, 'pickupRadius', where),
    pickupAim: numeric(source, 'pickupAim', where),
    rootGrace: numeric(source, 'rootGrace', where),
    knockGrace: nonNegative(source, 'knockGrace', where),
    turnRate: positive(source, 'turnRate', where),
    walkTurnRate: positive(source, 'walkTurnRate', where),
    goldMagnetRadius: numeric(source, 'goldMagnetRadius', where),
    respawnDelay: numeric(source, 'respawnDelay', where),
    respawnInvulnerability: numeric(source, 'respawnInvulnerability', where),
    deathPenalty: { minLevel: positive(penalty, 'minLevel', `${where}.deathPenalty`), xpPercent: fraction(penalty, 'xpPercent', `${where}.deathPenalty`) },
    resistance: resistanceRules(source['resistance'], `${where}.resistance`),
    caps: each(source['caps'], `${where}.caps`, (entry: unknown, entryWhere: string): StatCap => {
      const cap: Fields = fields(entry, entryWhere);
      return { stat: choice(cap, 'stat', STAT_IDS, entryWhere), max: positive(cap, 'max', entryWhere) };
    }),
    skillCaps: each(source['skillCaps'], `${where}.skillCaps`, skillCap),
  };
}

function skillCap(entry: unknown, where: string): SkillCap {
  const cap: Fields = fields(entry, where);
  const min: number | null = cap['min'] === undefined ? null : numeric(cap, 'min', where);
  const max: number | null = cap['max'] === undefined ? null : numeric(cap, 'max', where);
  if (min === null && max === null) throw new ContentError(where, 'a skill cap needs a min or a max');
  if (min !== null && max !== null && min > max) throw new ContentError(where, 'a skill cap\'s min is above its max');
  return { field: choice(cap, 'field', SKILL_MOD_FIELDS, where), min, max };
}

function xpGap(value: unknown, where: string): XpGap {
  const source: Fields = fields(value, where);
  const floor: number = share(source, 'floor', where);
  if (floor <= 0) throw new ContentError(`${where}.floor`, 'expected a share above zero');
  return { band: nonNegative(source, 'band', where), widenEvery: positive(source, 'widenEvery', where), soft: positive(source, 'soft', where), power: positive(source, 'power', where), floor, above: flag(source, 'above', where) };
}

export function parseContent(raw: RawContent): Content {
  const itemFields: Fields = fields(raw.items, 'items');
  const scaling: Fields = fields(itemFields['scaling'], 'items.scaling');
  const chart: ChartDef = chartDef(raw.chart, 'chart');
  return {
    skills: byId(each(raw.skills, 'skills', skill), 'skills'),
    monsters: byId(each(raw.monsters, 'monsters', monster), 'monsters'),
    monsterMods: byId(each(raw.monsterMods, 'monsterMods', monsterMod), 'monsterMods'),
    factions: byId(each(raw.factions, 'factions', faction), 'factions'),
    rarities: each(itemFields['rarities'], 'items.rarities', rarity),
    itemBases: byId(each(itemFields['bases'], 'items.bases', itemBase), 'items.bases'),
    families: byId(each(itemFields['families'] ?? [], 'items.families', family), 'items.families'),
    leaning: itemFields['leaning'] === undefined ? false : flag(itemFields, 'leaning', 'items'),
    leans: [...byId(each(itemFields['leans'] ?? [], 'items.leans', dropLean), 'items.leans').values()],
    affixes: byId(each(itemFields['affixes'], 'items.affixes', affix), 'items.affixes'),
    itemScaling: { implicitPerLevel: numeric(scaling, 'implicitPerLevel', 'items.scaling') },
    skillTree: each(raw.skillTree, 'skillTree', (value: unknown, where: string): SkillTreeNodeDef => treeNode(value, where, chart.common.places)),
    chart,
    rigs: byId(each(raw.rigs, 'rigs', rig), 'rigs'),
    attachments: byId(each(raw.attachments, 'attachments', attachment), 'attachments'),
    wearables: byId(each(raw.wearables, 'wearables', wearable), 'wearables'),
    baseLayers: baseLayers(raw.baseLayers, 'baseLayers'),
    surfaces: byId(each(raw.surfaces, 'surfaces', surface), 'surfaces'),
    props: byId(each(raw.props, 'props', prop), 'props'),
    zones: byId(each(raw.zones, 'zones', zone), 'zones'),
    world: worldDef(raw.world, 'world'),
    npcs: npcs(raw.npcs, 'npcs'),
    lines: byId(each(raw.lines, 'lines', line), 'lines'),
    quests: byId(each(raw.quests, 'quests', quest), 'quests'),
    player: player(raw.player, 'player'),
    flasks: parseFlasks(raw.flasks, 'flasks'),
    trade: trade(raw.trade, 'trade'),
    books: books(raw.books, 'books'),
    moments: momentLibrary(raw.moments, 'moments'),
    packRanks: packRanks(raw.packRanks, 'packRanks'),
    runTable: runTable(raw.runTable, 'runTable'),
    tailwind: tailwind(raw.tailwind, 'tailwind'),
    markers: markerLibrary(raw.markers, 'markers'),
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
  for (const rigDef of content.rigs.values()) wears(`rig ${rigDef.id} base`, rigDef.id, rigDef.base);
  for (const skillDef of content.skills.values()) {
    if (skillDef.delivery.type === 'dash') need(skillDef.windup === skillDef.delivery.duration, `skill ${skillDef.id} is a dash whose windup ${skillDef.windup} differs from its duration ${skillDef.delivery.duration}`);
  }
  const animates = (holder: string, rigId: string, skillId: string): void => {
    const used: SkillDef | undefined = content.skills.get(skillId);
    const actions: RigClips['actions'] | undefined = content.rigs.get(rigId)?.clips.actions;
    if (used === undefined || actions === undefined) return;
    for (const animation of [used.animation, ...(used.combo?.steps ?? []).map((step: ComboStep): string => step.animation)]) need(actions[animation] !== undefined, `${holder} uses skill ${skillId}, but rig ${rigId} has no action clip ${animation}`);
  };
  for (const def of content.monsters.values()) {
    need(content.skills.has(def.skill), `monster ${def.id} uses unknown skill ${def.skill}`);
    need(content.rigs.has(def.rig), `monster ${def.id} uses unknown rig ${def.rig}`);
    animates(`monster ${def.id}`, def.rig, def.skill);
    for (const phase of def.boss?.phases ?? []) for (const id of [...phase.skills.map((entry: BossSkill): string => entry.skill), ...phase.measure, ...(phase.support === null ? [] : [phase.support])]) animates(`boss ${def.id}`, def.rig, id);
    for (const held of def.gear) fits(`monster ${def.id}`, def.rig, held);
    wears(`monster ${def.id}`, def.rig, def.wear);
  }
  need(new Set<string>(content.player.heroes.map((hero: HeroDef): string => hero.id)).size === content.player.heroes.length, 'the player lists a hero twice');
  for (const hero of content.player.heroes) {
    need(content.rigs.has(hero.rig), `hero ${hero.id} uses unknown rig ${hero.rig}`);
    for (const held of content.player.gear) fits(`hero ${hero.id}`, hero.rig, held);
    if (content.player.unarmedVisual !== null) fits(`hero ${hero.id}`, hero.rig, content.player.unarmedVisual);
    for (const base of content.itemBases.values()) {
      if (base.visual !== null) fits(`item ${base.id}`, hero.rig, base.visual);
      wears(`item ${base.id}`, hero.rig, base.wear);
    }
    for (const worn of content.wearables.values()) wears(`wearable ${worn.id}`, hero.rig, [worn.id]);
    for (const entry of content.player.skillBook) animates('skill book', hero.rig, entry.skill);
  }
  for (const base of content.itemBases.values()) {
    need((base.slot !== null && WORN_SLOTS.has(base.slot)) === (base.material !== null), `item ${base.id} in slot ${base.slot ?? 'none'} ${base.material === null ? 'needs a material' : 'cannot have a material'}`);
  }
  for (const [body, layer] of content.baseLayers) {
    const rigDef: RigDef | undefined = [...content.rigs.values()].find((candidate: RigDef): boolean => candidate.url === body);
    need(rigDef !== undefined, `base layer names body ${body}, which no rig uses`);
    if (rigDef !== undefined) wears(`base layer of ${body}`, rigDef.id, layer);
  }
  for (const entry of content.player.skillBook) {
    need(content.skills.has(entry.skill), `skill book uses unknown skill ${entry.skill}`);
  }
  for (const base of content.player.startingItems) need(content.itemBases.has(base), `starting item ${base} is unknown`);
  need(content.rarities.length > 0, 'items need at least one rarity');
  problems.push(...itemProblems(content));
  problems.push(...powerRuleProblems(content));
  problems.push(...auraProblems(content));
  problems.push(...leanProblems(content));
  problems.push(...chartProblems(content));
  const setFlags: ReadonlySet<string> = storyFlagNames(content);
  for (const name of content.world.withheld) need(!setFlags.has(name), `flag ${name} is withheld, so nothing may set it`);
  const flagNames: ReadonlySet<string> = new Set<string>([...setFlags, ...content.world.withheld]);
  const known = (holder: string, list: readonly Condition[]): void => {
    problems.push(...conditionProblems(content, flagNames, holder, list));
  };
  problems.push(...roadProblems(content, flagNames), ...bossPackProblems(content));
  for (const act of content.world.acts) for (const place of act.atlas.places) known(`world map place ${place.zone}`, place.when);
  for (const entry of content.player.skillBook) known(`skill book ${entry.skill}`, entry.when);
  for (const grant of content.chart.grants) known(`chart point grant ${grant.id}`, grant.when);
  for (const def of content.props.values()) {
    for (const [material, surfaceId] of Object.entries(def.surfaces)) need(content.surfaces.has(surfaceId), `prop ${def.id} dresses ${material} in unknown surface ${surfaceId}`);
    const opened: string | null = def.cache?.opened ?? null;
    need(opened === null || content.props.has(opened), `prop ${def.id} opens into unknown prop ${opened ?? ''}`);
  }
  for (const def of content.attachments.values()) {
    need(def.stance === null || [...content.rigs.values()].some((rigDef: RigDef): boolean => rigDef.clips.stances[def.stance ?? ''] !== undefined), `attachment ${def.id} is held in stance ${def.stance ?? ''}, which no rig has`);
    for (const [material, surfaceId] of Object.entries(def.surfaces)) need(content.surfaces.has(surfaceId), `attachment ${def.id} dresses ${material} in unknown surface ${surfaceId}`);
  }
  for (const def of content.wearables.values()) for (const [material, surfaceId] of Object.entries(def.surfaces)) need(content.surfaces.has(surfaceId), `wearable ${def.id} dresses ${material} in unknown surface ${surfaceId}`);
  for (const problem of fitProblems(content)) problems.push(problem);
  need(content.zones.has(content.world.start), `world starts in unknown zone ${content.world.start}`);
  need(content.world.opening === null || content.zones.get(content.world.opening)?.kind === 'void', `world opens in ${content.world.opening ?? ''}, which is not a void zone`);
  need(content.zones.get(content.world.town)?.kind === 'town', `world names ${content.world.town} as its town, which is not a town zone`);
  need(content.world.acts.length > 0, 'world has no act');
  for (const problem of atlasProblems(content)) problems.push(problem);
  for (const problem of [...combatProblems(content), ...rankProblems(content), ...tailwindProblems(content), ...markerProblems(content), ...factionProblems(content), ...shapeProblems(content), ...mendProblems(content), ...bookProblems(content)]) problems.push(problem);
  for (const problem of storyProblems(content)) problems.push(problem);
  for (const zoneDef of content.zones.values()) {
    const at: string = `zone ${zoneDef.id}`;
    for (const floor of Object.values(zoneDef.floors)) need(content.surfaces.has(floor), `${at} floor uses unknown surface ${floor}`);
    if (zoneDef.outside !== null) need(content.surfaces.has(zoneDef.outside.surface), `${at} outside uses unknown surface ${zoneDef.outside.surface}`);
    if (zoneDef.terrain !== null) need(content.surfaces.has(zoneDef.terrain.cliff), `${at} cliff uses unknown surface ${zoneDef.terrain.cliff}`);
    for (const blend of zoneDef.terrain?.blends ?? []) need(content.surfaces.has(blend.surface), `${at} blends unknown surface ${blend.surface}`);
    for (const fall of zoneDef.falls) need((content.surfaces.get(fall.surface)?.glow ?? null) !== null, `${at} pours a fall of ${fall.surface}, which is unknown or does not glow`);
    for (const rule of zoneDef.terrain?.cliffs ?? []) for (const id of rule.props) need(content.props.has(id), `${at} lays unknown cliff rock ${id}`);
    for (const tunnel of zoneDef.tunnels) for (const piece of tunnel.roof) need(content.props.has(piece.prop), `${at} roofs tunnel ${tunnel.id} with unknown prop ${piece.prop}`);
    const shoreSurface: string | null = zoneDef.void?.shore?.surface ?? null;
    if (shoreSurface !== null) need(content.surfaces.has(shoreSurface), `${at} shore uses unknown surface ${shoreSurface}`);
    const shorePathSurface: string | null = zoneDef.void?.shore?.path?.surface ?? null;
    if (shorePathSurface !== null) need(content.surfaces.has(shorePathSurface), `${at} shore path uses unknown surface ${shorePathSurface}`);
    for (const stone of zoneDef.void?.shore?.path?.rubble ?? []) need(content.props.has(stone), `${at} shore path strews unknown prop ${stone}`);
    for (const placed of zoneDef.void?.shore?.props ?? []) need(content.props.has(placed.prop), `${at} shore places unknown prop ${placed.prop}`);
    for (const pool of zoneDef.void?.shore?.pools ?? []) need(content.surfaces.has(pool.surface), `${at} shore pool uses unknown surface ${pool.surface}`);
    for (const glimpse of zoneDef.void?.glimpses ?? []) for (const piece of glimpse.pieces) need(content.props.has(piece.prop), `${at} glimpse shows unknown prop ${piece.prop}`);
    for (const model of zoneDef.walls === null ? [] : [...zoneDef.walls.tall, zoneDef.walls.low, zoneDef.walls.corner]) need(content.props.has(model), `${at} wall uses unknown prop ${model}`);
    for (const placed of zoneDef.props) {
      const def: PropDef | undefined = content.props.get(placed.prop);
      need(def !== undefined, `${at} places unknown prop ${placed.prop}`);
      known(`${at} prop ${placed.prop}`, placed.when);
      if (def !== undefined && placed.when.length > 0) need(def.blockRadius === 0, `${at} places prop ${placed.prop} with a condition, but it blocks the way; a prop that comes and goes cannot block`);
    }
    for (const scatter of zoneDef.scatter) {
      for (const id of scatter.props) {
        const def: PropDef | undefined = content.props.get(id);
        need(def !== undefined, `${at} scatters unknown prop ${id}`);
        if (def !== undefined) need(def.blockRadius === 0 && def.light === null, `${at} scatters ${id}, which blocks or glows; scatter is loose ground cover`);
      }
      if (scatter.type === 'around') for (const anchor of scatter.anchors) need(content.props.has(anchor), `${at} scatters around unknown prop ${anchor}`);
    }
    for (const voice of zoneDef.voices) {
      known(`${at} voice ${voice.id}`, voice.when);
      for (const lineId of voice.lines) need(content.lines.has(lineId), `${at} voice ${voice.id} uses unknown line ${lineId}`);
    }
    for (const packDef of zoneDef.packs) {
      known(`${at} pack`, packDef.when);
      for (const member of packDef.members) need(content.monsters.has(member.monster), `${at} pack uses unknown monster ${member.monster}`);
    }
    const places: number = content.world.acts.filter((act: ActDef): boolean => act.atlas.places.some((place: MapPlace): boolean => place.zone === zoneDef.id)).length;
    if (zoneDef.kind === 'void') need(places <= 1, `${at} is a void: it has at most one place on the world map`);
    else if (zoneDef.duel !== null) need(places === 0, `${at} holds a duel: it has no place on the world map`);
    else if (zoneDef.flash !== null) need(places === 0, `${at} is a flash: it has no place on the world map`);
    else need(places === 1, `${at} needs one place on the world map`);
    for (const met of zoneDef.void?.encounters ?? []) known(`${at} encounter ${met.id}`, met.when);
    known(`${at} flash`, zoneDef.flash?.when ?? []);
    for (const problem of flashProblems(at, zoneDef, content.zones)) need(false, problem);
    for (const placed of zoneDef.npcs) {
      need(content.npcs.has(placed.npc), `${at} places unknown npc ${placed.npc}`);
      known(`${at} npc ${placed.npc}`, placed.when);
    }
    for (const exit of zoneDef.exits) {
      known(`${at} exit ${exit.id}`, exit.requires);
      const far: ZoneExit | undefined = content.zones.get(exit.to)?.exits.find((candidate: ZoneExit): boolean => candidate.id === exit.toExit);
      need(far !== undefined, `${at} exit ${exit.id} leads to unknown exit ${exit.to}.${exit.toExit}`);
      if (far !== undefined && zoneDef.kind !== 'void') need(far.to === zoneDef.id && far.toExit === exit.id, `${at} exit ${exit.id} is not matched by ${exit.to}.${exit.toExit}`);
    }
    const duel: ZoneDuel | null = zoneDef.duel;
    if (duel !== null) {
      need(content.zones.get(duel.home.zone)?.exits.some((candidate: ZoneExit): boolean => candidate.id === duel.home.exit) === true && duel.home.zone !== zoneDef.id, `${at} sends the duellist home to ${duel.home.zone}.${duel.home.exit}, which is not an exit of another zone`);
      need(zoneDef.kind !== 'town' && zoneDef.kind !== 'void', `${at} holds a duel, so it cannot be a ${zoneDef.kind}`);
      need(zoneDef.packs.length === 0 && zoneDef.surge === null && zoneDef.moments === null, `${at} holds a duel, so it cannot have packs, a surge or moments`);
    }
    const back: ZoneReturn | null = zoneDef.deathReturn;
    if (back !== null) need(content.zones.get(back.zone)?.exits.some((candidate: ZoneExit): boolean => candidate.id === back.exit) === true && back.zone !== zoneDef.id, `${at} returns the fallen to ${back.zone}.${back.exit}, which is not an exit of another zone`);
  }
  for (const def of content.npcs.values()) {
    need(content.rigs.has(def.rig), `npc ${def.id} uses unknown rig ${def.rig}`);
    for (const held of def.gear) fits(`npc ${def.id}`, def.rig, held);
    wears(`npc ${def.id}`, def.rig, def.wear);
    const lastWord: number = def.talks.findIndex((entry: TalkDef): boolean => !entry.once && entry.when.length === 0);
    need(lastWord >= 0, `npc ${def.id} has no repeatable conversation without conditions`);
    for (const unreachable of lastWord < 0 ? [] : def.talks.slice(lastWord + 1)) need(false, `conversation ${unreachable.id} of ${def.id} can never play: it comes after the repeatable conversation ${def.talks[lastWord]?.id ?? ''}, which has no conditions`);
    for (const [kind, lineId] of Object.entries(def.remarks)) {
      const said: LineDef | undefined = content.lines.get(lineId);
      need(said !== undefined, `npc ${def.id} remark ${kind} uses unknown line ${lineId}`);
      if (said !== undefined) need(said.speaker === def.id, `npc ${def.id} remark ${kind} uses line ${lineId}, which is spoken by ${said.speaker}`);
    }
    for (const entry of def.talks) {
      known(`conversation ${entry.id}`, entry.when);
      for (const lineId of entry.lines) {
        const spoken: LineDef | undefined = content.lines.get(lineId);
        need(spoken !== undefined, `conversation ${entry.id} uses unknown line ${lineId}`);
        if (spoken !== undefined) need(spoken.speaker === def.id, `conversation ${entry.id} of ${def.id} uses line ${lineId}, which is spoken by ${spoken.speaker}`);
      }
    }
  }
  const talkIds: Set<string> = new Set<string>([...content.npcs.values()].flatMap((def: NpcDef): string[] => def.talks.map((entry: TalkDef): string => entry.id)));
  const voiceZones: Map<string, string> = new Map<string, string>();
  for (const zoneDef of content.zones.values()) {
    for (const voice of zoneDef.voices) {
      const first: string | undefined = voiceZones.get(voice.id);
      need(!talkIds.has(voice.id), `zone ${zoneDef.id} voice ${voice.id} shares its id with a conversation; what the hero has heard is kept by id`);
      need(first === undefined, `zone ${zoneDef.id} voice ${voice.id} shares its id with a voice in zone ${first ?? ''}; what the hero has heard is kept by id`);
      voiceZones.set(voice.id, zoneDef.id);
    }
  }
  for (const spoken of content.lines.values()) need(content.npcs.has(spoken.speaker) || content.monsters.has(spoken.speaker) || content.books.has(spoken.speaker), `line ${spoken.id} has unknown speaker ${spoken.speaker}`);
  for (const book of content.books.values()) for (const page of book.pages) if (page.voice !== null) need(content.lines.get(page.voice)?.speaker === book.id, `book ${book.id} page ${page.id} voices ${page.voice}, which is not a line spoken by the book`);
  for (const def of content.monsters.values()) {
    if (def.boss === null) continue;
    const at: string = `boss ${def.id}`;
    need(content.rarities.some((entry: RarityDef): boolean => entry.id === def.boss?.drop.floor), `${at} drops unknown rarity ${def.boss.drop.floor}`);
    for (const phase of def.boss.phases) {
      for (const id of [...phase.skills.map((entry: BossSkill): string => entry.skill), ...phase.measure]) need(content.skills.has(id), `${at} uses unknown skill ${id}`);
      for (const id of [...phase.holds, ...phase.unseal, ...(phase.anchor === null ? [] : [phase.anchor.monster])]) need(content.monsters.has(id) && id !== def.id, `${at} names unknown piece ${id}`);
    }
    for (const lineId of [...def.boss.barks.aggro, ...def.boss.barks.death, ...def.boss.phases.flatMap((phase: BossPhase): readonly string[] => phase.barks)]) {
      const spoken: LineDef | undefined = content.lines.get(lineId);
      need(spoken !== undefined, `${at} barks unknown line ${lineId}`);
      if (spoken !== undefined) need(spoken.speaker === def.id, `${at} barks line ${lineId}, which is spoken by ${spoken.speaker}`);
    }
  }
  for (const book of content.books.values()) for (const page of book.pages) known(`book ${book.id} page ${page.id}`, page.when);
  content.world.restraint.forEach((mark: RestraintMark, index: number): void => known(`world restraint mark ${index}`, mark.when));
  for (const questDef of content.quests.values()) {
    known(`quest ${questDef.id}`, questDef.when);
    for (const required of questDef.requires) need(content.quests.has(required) && required !== questDef.id, `quest ${questDef.id} requires unknown quest ${required}`);
    for (const objective of questDef.objectives) {
      const gifts: readonly ObjectiveGift[] = [objective, ...(objective.type === 'either' ? objective.paths : [])].flatMap((step: ObjectiveDef): ObjectiveGift[] => (step.gift === null ? [] : [step.gift]));
      for (const gift of gifts) need(content.rarities.some((entry: RarityDef): boolean => entry.id === gift.rarity), `quest ${questDef.id} objective ${objective.id} gives unknown rarity ${gift.rarity}`);
    }
  }
  problems.push(...tradeProblems(content));
  problems.push(...runTableProblems(content));
  problems.push(...momentProblems(content));
  problems.push(...sceneProblems(content, flagNames));
  return problems;
}
