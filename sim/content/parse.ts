import { atlasProblems } from './atlas.ts';
import { affix, family, itemBase, rarity } from './parse-items.ts';
import { itemProblems } from './item-rules.ts';
import { powerRuleProblems } from './power-rules.ts';
import { books } from './parse-story.ts';
import { storyFlagNames, storyProblems } from './story.ts';
import { conditionProblems, roadProblems } from './road.ts';
import { parseFlasks } from './flasks.ts';
import { combatProblems, fieldDelivery, markDelivery, monsterMod, monsterTraits, reviveDelivery, skillMotion } from './parse-combat.ts';
import { faction, factionProblems } from './parse-factions.ts';
import { momentLibrary } from './parse-moments.ts';
import { rig } from './parse-rigs.ts';
import { momentProblems } from './moments.ts';
import { chartDef, chartProblems, statMod, treeNode } from './parse-chart.ts';
import { bookProblems, shapeDelivery, shapeProblems, SHAPE_TYPES, skillPress, skillUnlock } from './parse-shapes.ts';
import type { Fields } from './read.ts';
import { line, npcs, quest, worldDef, zone } from './parse-world.ts';
import { service, trade, tradeProblems } from './parse-trade.ts';
import { byId, choice, colour, ContentError, each, fields, flag, fraction, nonNegative, nullableText, numeric, positive, share, text, textList } from './read.ts';
import type {
  ActDef,
  AttachmentDef,
  BossDef,
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
  PlayerDef,
  PropDef,
  PropLight,
  RarityDef,
  ResistanceRules,
  StatCap,
  RigClips,
  RigDef,
  SkillBinding,
  SkillCombo,
  SkillDef,
  SkillVfx,
  StatBlock,
  SurfaceDef,
  TalkDef,
  WearableDef,
  WearRegion,
  ZoneExit,
} from './types.ts';
import { DAMAGE_TYPES, MANA_SHOWS, SKILL_CATEGORIES, STAT_IDS, VFX_CUES, VFX_STYLES, WEAR_REGIONS } from './types.ts';

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
}

function delivery(value: unknown, where: string): Delivery {
  const source: Fields = fields(value, where);
  const type: Delivery['type'] = choice(source, 'type', ['arc', 'nova', 'projectile', 'dash', 'mark', 'revive', 'field', ...SHAPE_TYPES] as const, where);
  if (type === 'chain' || type === 'area' || type === 'blink' || type === 'beam') return shapeDelivery(type, source, where);
  if (type === 'dash') {
    const duration: number = positive(source, 'duration', where);
    const invulnerable: number = numeric(source, 'invulnerable', where);
    if (invulnerable < 0 || invulnerable > duration) throw new ContentError(`${where}.invulnerable`, `expected a window from 0 to the duration ${duration}`);
    return { type, distance: positive(source, 'distance', where), duration, invulnerable };
  }
  if (type === 'mark') return markDelivery(source, where);
  if (type === 'revive') return reviveDelivery(source, where);
  if (type === 'field') return fieldDelivery(source, where);
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

function skillVfx(value: unknown, where: string): SkillVfx {
  const source: Fields = fields(value, where);
  return {
    style: choice(source, 'style', VFX_STYLES, where),
    color: text(source, 'color', where),
    cue: source['cue'] === undefined ? 'none' : choice(source, 'cue', VFX_CUES, where),
    light: source['light'] === undefined ? 1 : nonNegative(source, 'light', where),
  };
}

function skill(value: unknown, where: string): SkillDef {
  const source: Fields = fields(value, where);
  const damage: Fields = fields(source['damage'], `${where}.damage`);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    description: text(source, 'description', where),
    icon: text(source, 'icon', where),
    animation: text(source, 'animation', where),
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
  };
}

function behaviour(value: unknown, where: string): MonsterBehaviour {
  const source: Fields = fields(value, where);
  const type: MonsterBehaviour['type'] = choice(source, 'type', ['chaser', 'ranged', 'stalker'] as const, where);
  if (type === 'chaser') return { type };
  if (type === 'stalker') return { type, orbitRange: positive(source, 'orbitRange', where) };
  return { type, preferredRange: numeric(source, 'preferredRange', where), retreatRange: numeric(source, 'retreatRange', where) };
}

function bossSkill(value: unknown, where: string): BossSkill {
  const source: Fields = fields(value, where);
  return { skill: text(source, 'skill', where), weight: positive(source, 'weight', where) };
}

function bossPhase(value: unknown, where: string): BossPhase {
  const source: Fields = fields(value, where);
  const skills: BossSkill[] = each(source['skills'], `${where}.skills`, bossSkill);
  if (skills.length === 0) throw new ContentError(`${where}.skills`, 'a phase needs at least one skill');
  return { below: fraction(source, 'below', where), skills, barks: textList(source, 'barks', where) };
}

function bossDrop(source: Fields, where: string): BossDef['drop'] {
  const items: number = numeric(source, 'items', where);
  const goldMin: number = numeric(source, 'goldMin', where);
  const goldMax: number = numeric(source, 'goldMax', where);
  if (!Number.isInteger(items) || items < 0) throw new ContentError(`${where}.items`, 'expected a whole number, zero or more');
  if (goldMin < 0) throw new ContentError(`${where}.goldMin`, 'expected zero or more');
  if (goldMax < goldMin) throw new ContentError(`${where}.goldMax`, 'expected at least goldMin');
  return { items, rarity: text(source, 'rarity', where), goldMin, goldMax };
}

function boss(value: unknown, where: string): BossDef | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const poise: Fields = fields(source['poise'], `${where}.poise`);
  const drop: Fields = fields(source['drop'], `${where}.drop`);
  const barks: Fields = fields(source['barks'], `${where}.barks`);
  const phases: BossPhase[] = each(source['phases'], `${where}.phases`, bossPhase);
  if (phases[0]?.below !== 1) throw new ContentError(`${where}.phases`, 'the first phase must start at full life (below: 1)');
  if (phases.some((phase: BossPhase, index: number): boolean => index > 0 && phase.below >= (phases[index - 1]?.below ?? 0))) throw new ContentError(`${where}.phases`, 'each phase must begin at a lower life fraction than the one before');
  const knockback: number = numeric(poise, 'knockback', `${where}.poise`);
  if (knockback < 0 || knockback > 1) throw new ContentError(`${where}.poise.knockback`, 'expected a number from 0 to 1');
  return {
    title: text(source, 'title', where),
    phases,
    poise: { knockback },
    drop: bossDrop(drop, `${where}.drop`),
    barks: { aggro: textList(barks, 'aggro', `${where}.barks`), death: textList(barks, 'death', `${where}.barks`) },
  };
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
    boss: boss(source['boss'], `${where}.boss`),
    ...monsterTraits(source, where),
  };
}

function attachment(value: unknown, where: string): AttachmentDef {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), model: text(source, 'model', where), socket: text(source, 'socket', where), surfaces: dressing(source['surfaces'], `${where}.surfaces`) };
}

function wearable(value: unknown, where: string): WearableDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    model: text(source, 'model', where),
    region: choice(source, 'region', WEAR_REGIONS, where),
    tint: text(source, 'tint', where),
    hides: textList(source, 'hides', where),
    wakeLamps: source['wakeLamps'] === undefined ? 1 : share(source, 'wakeLamps', where),
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

function propLight(value: unknown, where: string): PropLight | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  return { color: text(source, 'color', where), intensity: numeric(source, 'intensity', where), distance: numeric(source, 'distance', where), height: numeric(source, 'height', where) };
}

function surface(value: unknown, where: string): SurfaceDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    color: text(source, 'color', where),
    normal: nullableText(source, 'normal', where),
    orm: nullableText(source, 'orm', where),
    metres: positive(source, 'metres', where),
    tint: text(source, 'tint', where),
    roughness: numeric(source, 'roughness', where),
    metalness: numeric(source, 'metalness', where),
    normalScale: numeric(source, 'normalScale', where),
    spill: numeric(source, 'spill', where),
    pace: source['pace'] === undefined ? 1 : positive(source, 'pace', where),
  };
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
  return {
    id: text(source, 'id', where),
    model: text(source, 'model', where),
    scale: numeric(source, 'scale', where),
    blockRadius,
    blockLength,
    solid: source['solid'] === undefined ? null : flag(source, 'solid', where),
    footprints: [],
    height: 0,
    light: propLight(source['light'], `${where}.light`),
    surfaces: dressing(source['surfaces'], `${where}.surfaces`),
    tint: source['tint'] === undefined ? null : colour(source, 'tint', where),
    service: service(source, where),
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
  return {
    rig: text(source, 'rig', where),
    radius: numeric(source, 'radius', where),
    baseStats: statBlock(source['baseStats'], `${where}.baseStats`),
    perLevel: each(source['perLevel'], `${where}.perLevel`, statMod),
    skillBar: each(source['skillBar'], `${where}.skillBar`, skillBinding),
    skillBook: each(source['skillBook'], `${where}.skillBook`, skillUnlock),
    xp: { base: numeric(xp, 'base', `${where}.xp`), growth: numeric(xp, 'growth', `${where}.xp`), maxLevel: numeric(xp, 'maxLevel', `${where}.xp`) },
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
    goldMagnetRadius: numeric(source, 'goldMagnetRadius', where),
    respawnDelay: numeric(source, 'respawnDelay', where),
    respawnInvulnerability: numeric(source, 'respawnInvulnerability', where),
    deathPenalty: { minLevel: positive(penalty, 'minLevel', `${where}.deathPenalty`), xpPercent: fraction(penalty, 'xpPercent', `${where}.deathPenalty`) },
    resistance: resistanceRules(source['resistance'], `${where}.resistance`),
    caps: each(source['caps'], `${where}.caps`, (entry: unknown, entryWhere: string): StatCap => {
      const cap: Fields = fields(entry, entryWhere);
      return { stat: choice(cap, 'stat', STAT_IDS, entryWhere), max: positive(cap, 'max', entryWhere) };
    }),
  };
}

export function parseContent(raw: RawContent): Content {
  const itemFields: Fields = fields(raw.items, 'items');
  const scaling: Fields = fields(itemFields['scaling'], 'items.scaling');
  return {
    skills: byId(each(raw.skills, 'skills', skill), 'skills'),
    monsters: byId(each(raw.monsters, 'monsters', monster), 'monsters'),
    monsterMods: byId(each(raw.monsterMods, 'monsterMods', monsterMod), 'monsterMods'),
    factions: byId(each(raw.factions, 'factions', faction), 'factions'),
    rarities: each(itemFields['rarities'], 'items.rarities', rarity),
    itemBases: byId(each(itemFields['bases'], 'items.bases', itemBase), 'items.bases'),
    families: byId(each(itemFields['families'] ?? [], 'items.families', family), 'items.families'),
    affixes: byId(each(itemFields['affixes'], 'items.affixes', affix), 'items.affixes'),
    itemScaling: { implicitPerLevel: numeric(scaling, 'implicitPerLevel', 'items.scaling') },
    skillTree: each(raw.skillTree, 'skillTree', treeNode),
    chart: chartDef(raw.chart, 'chart'),
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
    for (const phase of def.boss?.phases ?? []) for (const entry of phase.skills) animates(`boss ${def.id}`, def.rig, entry.skill);
    for (const held of def.gear) fits(`monster ${def.id}`, def.rig, held);
    wears(`monster ${def.id}`, def.rig, def.wear);
  }
  need(content.rigs.has(content.player.rig), `player uses unknown rig ${content.player.rig}`);
  for (const held of content.player.gear) fits('player', content.player.rig, held);
  if (content.player.unarmedVisual !== null) fits('player', content.player.rig, content.player.unarmedVisual);
  for (const base of content.itemBases.values()) {
    if (base.visual !== null) fits(`item ${base.id}`, content.player.rig, base.visual);
    wears(`item ${base.id}`, content.player.rig, base.wear);
    need((base.slot !== null && WORN_SLOTS.has(base.slot)) === (base.material !== null), `item ${base.id} in slot ${base.slot ?? 'none'} ${base.material === null ? 'needs a material' : 'cannot have a material'}`);
  }
  for (const worn of content.wearables.values()) wears(`wearable ${worn.id}`, content.player.rig, [worn.id]);
  for (const [body, layer] of content.baseLayers) {
    const rigDef: RigDef | undefined = [...content.rigs.values()].find((candidate: RigDef): boolean => candidate.url === body);
    need(rigDef !== undefined, `base layer names body ${body}, which no rig uses`);
    if (rigDef !== undefined) wears(`base layer of ${body}`, rigDef.id, layer);
  }
  for (const entry of content.player.skillBook) {
    need(content.skills.has(entry.skill), `skill book uses unknown skill ${entry.skill}`);
    animates('skill book', content.player.rig, entry.skill);
  }
  for (const base of content.player.startingItems) need(content.itemBases.has(base), `starting item ${base} is unknown`);
  need(content.rarities.length > 0, 'items need at least one rarity');
  problems.push(...itemProblems(content));
  problems.push(...powerRuleProblems(content));
  problems.push(...chartProblems(content));
  const flagNames: ReadonlySet<string> = storyFlagNames(content);
  const known = (holder: string, list: readonly Condition[]): void => {
    problems.push(...conditionProblems(content, flagNames, holder, list));
  };
  problems.push(...roadProblems(content, flagNames));
  for (const entry of content.player.skillBook) known(`skill book ${entry.skill}`, entry.when);
  for (const grant of content.chart.grants) known(`chart point grant ${grant.id}`, grant.when);
  for (const def of content.props.values()) {
    for (const [material, surfaceId] of Object.entries(def.surfaces)) need(content.surfaces.has(surfaceId), `prop ${def.id} dresses ${material} in unknown surface ${surfaceId}`);
  }
  for (const def of content.attachments.values()) {
    for (const [material, surfaceId] of Object.entries(def.surfaces)) need(content.surfaces.has(surfaceId), `attachment ${def.id} dresses ${material} in unknown surface ${surfaceId}`);
  }
  need(content.zones.has(content.world.start), `world starts in unknown zone ${content.world.start}`);
  need(content.world.opening === null || content.zones.get(content.world.opening)?.kind === 'void', `world opens in ${content.world.opening ?? ''}, which is not a void zone`);
  need(content.zones.get(content.world.town)?.kind === 'town', `world names ${content.world.town} as its town, which is not a town zone`);
  need(content.world.acts.length > 0, 'world has no act');
  for (const problem of atlasProblems(content)) problems.push(problem);
  for (const problem of [...combatProblems(content), ...factionProblems(content), ...shapeProblems(content), ...bookProblems(content)]) problems.push(problem);
  for (const problem of storyProblems(content)) problems.push(problem);
  for (const zoneDef of content.zones.values()) {
    const at: string = `zone ${zoneDef.id}`;
    for (const floor of Object.values(zoneDef.floors)) need(content.surfaces.has(floor), `${at} floor uses unknown surface ${floor}`);
    if (zoneDef.outside !== null) need(content.surfaces.has(zoneDef.outside.surface), `${at} outside uses unknown surface ${zoneDef.outside.surface}`);
    const shoreSurface: string | null = zoneDef.void?.shore?.surface ?? null;
    if (shoreSurface !== null) need(content.surfaces.has(shoreSurface), `${at} shore uses unknown surface ${shoreSurface}`);
    const shorePathSurface: string | null = zoneDef.void?.shore?.path?.surface ?? null;
    if (shorePathSurface !== null) need(content.surfaces.has(shorePathSurface), `${at} shore path uses unknown surface ${shorePathSurface}`);
    for (const placed of zoneDef.void?.shore?.props ?? []) need(content.props.has(placed.prop), `${at} shore places unknown prop ${placed.prop}`);
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
    if (zoneDef.kind === 'void') need(places === 0, `${at} is a void: it has no place on the world map`);
    else need(places === 1, `${at} needs one place on the world map`);
    for (const met of zoneDef.void?.encounters ?? []) known(`${at} encounter ${met.id}`, met.when);
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
  for (const spoken of content.lines.values()) need(content.npcs.has(spoken.speaker) || content.monsters.has(spoken.speaker), `line ${spoken.id} has unknown speaker ${spoken.speaker}`);
  for (const def of content.monsters.values()) {
    if (def.boss === null) continue;
    const at: string = `boss ${def.id}`;
    need(content.rarities.some((entry: RarityDef): boolean => entry.id === def.boss?.drop.rarity), `${at} drops unknown rarity ${def.boss.drop.rarity}`);
    for (const phase of def.boss.phases) for (const entry of phase.skills) need(content.skills.has(entry.skill), `${at} uses unknown skill ${entry.skill}`);
    for (const lineId of [...def.boss.barks.aggro, ...def.boss.barks.death, ...def.boss.phases.flatMap((phase: BossPhase): readonly string[] => phase.barks)]) {
      const spoken: LineDef | undefined = content.lines.get(lineId);
      need(spoken !== undefined, `${at} barks unknown line ${lineId}`);
      if (spoken !== undefined) need(spoken.speaker === def.id, `${at} barks line ${lineId}, which is spoken by ${spoken.speaker}`);
    }
  }
  for (const book of content.books.values()) for (const page of book.pages) known(`book ${book.id} page ${page.id}`, page.when);
  for (const questDef of content.quests.values()) {
    known(`quest ${questDef.id}`, questDef.when);
    for (const required of questDef.requires) need(content.quests.has(required) && required !== questDef.id, `quest ${questDef.id} requires unknown quest ${required}`);
  }
  problems.push(...tradeProblems(content));
  problems.push(...momentProblems(content));
  return problems;
}
