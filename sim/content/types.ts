import type { MonsterRank, PackRanks } from './rank-types.ts';
import type { ZoneBarrier } from './barrier-types.ts';
import type { AffixDef, FamilyDef, ItemBaseDef, ItemScaling, RarityDef } from './item-types.ts';
import type { FlaskDef } from './flasks.ts';
import type { AttachmentDef, RigDef } from './rig-types.ts';
import type { DormantDef, FactionDef, FieldDelivery, GuardDef, MarkDelivery, MonsterModDef, MonsterPoise, ReviveDelivery, StalkerBehaviour, SummonDef } from './combat-types.ts';
import type { AreaDelivery, BeamDelivery, BlinkDelivery, ChainDelivery, SkillShape, SkillUnlock } from './shape-types.ts';
import type { ServiceKind, TradeDef } from './trade-types.ts';
import type { PropDef, SurfaceDef } from './prop-types.ts';
import type { Condition } from './condition-types.ts';
import type { ZoneAmbience } from './ambience-types.ts';
import type { BookDef, StoryFlags, ZoneVoid } from './story-types.ts';
export type { ZoneAmbience } from './ambience-types.ts';
import type { ActEnd, RetiredZones, ZoneDrift, ZoneTrigger, ZoneWeather } from './road-types.ts';
import type { MomentField, MomentLibrary } from './moment-types.ts';
import type { ChartDef, SkillTarget, SkillVariant } from './chart-types.ts';
import type { SkillVfx } from './vfx-types.ts';
export { VFX_CUES, VFX_MAX_FORKS, VFX_STYLES } from './vfx-types.ts';
export type { SkillVfx, VfxCue, VfxImpact, VfxLightning, VfxStyle } from './vfx-types.ts';

export const STAT_IDS = [
  'maxLife',
  'maxMana',
  'lifeRegen',
  'manaRegen',
  'damageMin',
  'damageMax',
  'damagePercent',
  'attackSpeed',
  'critChance',
  'critMultiplier',
  'moveSpeed',
  'armour',
  'goldFind',
  'stormResist',
  'frostResist',
] as const;
export type StatId = (typeof STAT_IDS)[number];
export type StatBlock = Record<StatId, number>;

export const MOD_OPS = ['add', 'percent'] as const;
export type ModOp = (typeof MOD_OPS)[number];

export interface StatMod {
  readonly stat: StatId;
  readonly op: ModOp;
  readonly value: number;
}

export const SKILL_MOD_FIELDS = ['damagePercent', 'areaPercent', 'rangePercent', 'durationPercent', 'cooldownPercent', 'manaCostPercent', 'knockbackPercent', 'staggerPercent', 'projectiles', 'pierce', 'chains', 'chainFalloff'] as const;
export type SkillModField = (typeof SKILL_MOD_FIELDS)[number];

export interface SkillMod {
  readonly target: SkillTarget;
  readonly field: SkillModField;
  readonly value: number;
}


export const SKILL_CATEGORIES = ['none', 'area', 'single', 'chain', 'charged', 'mark', 'movement', 'defence', 'channel', 'lasting', 'melee', 'root', 'revive'] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export interface ArcDelivery {
  readonly type: 'arc';
  readonly reach: number;
  readonly arcDegrees: number;
}

export interface NovaDelivery {
  readonly type: 'nova';
  readonly radius: number;
}

export interface ProjectileDelivery {
  readonly type: 'projectile';
  readonly speed: number;
  readonly radius: number;
  readonly range: number;
  readonly pierce: number;
  readonly count: number;
  readonly spreadDegrees: number;
}

export interface DashDelivery {
  readonly type: 'dash';
  readonly distance: number;
  readonly duration: number;
  readonly invulnerable: number;
}

export type Delivery = ArcDelivery | NovaDelivery | ProjectileDelivery | DashDelivery | MarkDelivery | ReviveDelivery | FieldDelivery | ChainDelivery | AreaDelivery | BlinkDelivery | BeamDelivery;

export const DAMAGE_TYPES = ['physical', 'storm', 'frost'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];
export type ResistedType = Exclude<DamageType, 'physical'>;

export interface SkillDamage {
  readonly type: DamageType;
  readonly weaponPercent: number;
  readonly flatMin: number;
  readonly flatMax: number;
}

export interface ComboStep {
  readonly animation: string;
  readonly windup: number;
  readonly recovery: number;
  readonly damageScale: number;
  readonly areaScale: number;
  readonly knockbackScale: number;
  readonly stagger: number;
  readonly shake: number;
  readonly hitStop: number;
}

export interface SkillCombo {
  readonly window: number;
  readonly steps: readonly ComboStep[];
}

export interface SkillDef extends SkillShape {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly animation: string;
  readonly manaCost: number;
  readonly cooldown: number;
  readonly windup: number;
  readonly recovery: number;
  readonly scalesWithAttackSpeed: boolean;
  readonly engageRange: number;
  readonly delivery: Delivery;
  readonly damage: SkillDamage;
  readonly knockback: number;
  readonly stagger: number;
  readonly shake: number;
  readonly hitStop: number;
  readonly vfx: SkillVfx;
  readonly category: SkillCategory;
  readonly combo: SkillCombo | null;
  readonly hold: number;
  readonly echo: number;
}

export interface ChaserBehaviour {
  readonly type: 'chaser';
}

export interface RangedBehaviour {
  readonly type: 'ranged';
  readonly preferredRange: number;
  readonly retreatRange: number;
}

export type MonsterBehaviour = ChaserBehaviour | RangedBehaviour | StalkerBehaviour;

export interface MonsterLoot {
  readonly goldChance: number;
  readonly goldMin: number;
  readonly goldMax: number;
  readonly itemChance: number;
}

export interface BossSkill {
  readonly skill: string;
  readonly weight: number;
}

export interface BossPhase {
  readonly below: number;
  readonly skills: readonly BossSkill[];
  readonly barks: readonly string[];
}

export interface BossPoise {
  readonly knockback: number;
}

export interface BossDrop {
  readonly items: number;
  readonly rarity: string;
  readonly goldMin: number;
  readonly goldMax: number;
}

export interface BossBarks {
  readonly aggro: readonly string[];
  readonly death: readonly string[];
}

export interface BossDef {
  readonly title: string;
  readonly phases: readonly BossPhase[];
  readonly poise: BossPoise;
  readonly drop: BossDrop;
  readonly barks: BossBarks;
}

export interface MonsterDef {
  readonly id: string;
  readonly name: string;
  readonly rig: string;
  readonly scale: number;
  readonly radius: number;
  readonly life: number;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly moveSpeed: number;
  readonly xp: number;
  readonly aggroRadius: number;
  readonly behaviour: MonsterBehaviour;
  readonly skill: string;
  readonly loot: MonsterLoot;
  readonly color: string;
  readonly tint: string;
  readonly gear: readonly string[];
  readonly wear: readonly string[];
  readonly boss: BossDef | null;
  readonly poise: MonsterPoise;
  readonly guard: GuardDef | null;
  readonly deathSkill: string | null;
  readonly summon: SummonDef | null;
  readonly mods: readonly string[];
  readonly faction: string;
  readonly dormant: DormantDef | null;
  readonly support: string | null;
  readonly barks: readonly string[];
  readonly regen: number;
  readonly rank: MonsterRank | null;
}

export const ITEM_SLOTS = ['weapon', 'head', 'chest', 'hands', 'legs', 'feet', 'charm'] as const;
export type ItemSlot = (typeof ITEM_SLOTS)[number];

export const WEAR_REGIONS = ['head', 'shoulders', 'chest', 'arms', 'hands', 'legs', 'feet'] as const;
export type WearRegion = (typeof WEAR_REGIONS)[number];

export interface WearableDef {
  readonly id: string;
  readonly model: string;
  readonly pieces: readonly string[];
  readonly region: WearRegion;
  readonly tint: string;
  readonly hides: readonly string[];
  readonly wakeLamps: number;
  readonly iconWith: readonly string[];
}

export { ARMOUR_MATERIALS, CAST_ORIGINS, GROUND_KEEPS, GROUND_MODELS, ITEM_STATS, POWER_TARGETS, POWER_TRIGGERS, RARITY_MARKERS } from './item-types.ts';
export type { AffixDef, ArmourMaterial, BuffEffect, CastEffect, CastOrigin, FamilyDef, GroundKeep, GroundLook, GroundModel, ItemBaseDef, ItemScaling, ItemStat, PowerDef, PowerEffect, PowerTarget, PowerTrigger, PowerTriggerDef, RarityDef, RarityMarker } from './item-types.ts';

export const TREE_NODE_KINDS = ['minor', 'notable', 'keystone'] as const;
export type TreeNodeKind = (typeof TREE_NODE_KINDS)[number];

export interface SkillTreeNodeDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly kind: TreeNodeKind;
  readonly path: string;
  readonly column: number;
  readonly row: number;
  readonly requires: readonly string[];
  readonly statMods: readonly StatMod[];
  readonly skillMods: readonly SkillMod[];
  readonly variants: readonly SkillVariant[];
  readonly unlock: string | null;
}

export type { ChartDef, ChartGroup, ChartPath, ChartRespec, PointGrant, SkillTarget, SkillVariant } from './chart-types.ts';

export type { PropDef, PropLight, SurfaceDef } from './prop-types.ts';

export type { AttachmentDef, RigActionClip, RigClips, RigContact, RigDef, RigGait, RigSocket, RigStanceClips, Triple } from './rig-types.ts';

export interface ZonePoint {
  readonly x: number;
  readonly z: number;
}

export interface ZoneProp {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly rotationDegrees: number;
  readonly when: readonly Condition[];
}

export interface ScatterSize {
  readonly least: number;
  readonly most: number;
}

export interface OpenScatter {
  readonly type: 'open';
  readonly props: readonly string[];
  readonly count: number;
  readonly clump: number;
  readonly spread: number;
  readonly size: ScatterSize;
  readonly clear: number;
}

export interface AroundScatter {
  readonly type: 'around';
  readonly props: readonly string[];
  readonly anchors: readonly string[];
  readonly each: number;
  readonly spread: number;
  readonly size: ScatterSize;
}

export type ZoneScatter = OpenScatter | AroundScatter;

export const SCATTER_TYPES = ['open', 'around'] as const;

export interface ZoneVoice {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly lines: readonly string[];
  readonly when: readonly Condition[];
}

export interface PackMember {
  readonly monster: string;
  readonly count: number;
  readonly mods: readonly string[];
}

export interface ZonePack {
  readonly x: number;
  readonly z: number;
  readonly members: readonly PackMember[];
  readonly when: readonly Condition[];
  readonly row?: ZonePoint;
}

export interface PackReturn { readonly after: number; readonly away: number }

export interface SurgeRules {
  readonly delay: number;
  readonly surgesPerExtraMonster: number;
  readonly maxExtraMonsters: number;
}

export interface ZoneEdge {
  readonly props: readonly string[];
  readonly gap: number;
  readonly exitClear: number;
}

export interface ZoneOutside {
  readonly surface: string;
  readonly reach: number;
  readonly edge: ZoneEdge | null;
  readonly barrier: ZoneBarrier | null;
}

export interface ZoneWalls {
  readonly tall: readonly string[];
  readonly low: string;
  readonly corner: string;
  readonly halfThickness: number;
}

export const ZONE_KINDS = ['town', 'wild', 'void'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

export { OBJECTIVE_STATES, QUEST_STATES } from './condition-types.ts';
export type { Condition, FlagCondition, ObjectiveCondition, ObjectiveState, QuestCondition, QuestState } from './condition-types.ts';

export type ExitLook = 'ring' | 'mist';

export interface ZoneExit {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly to: string;
  readonly toExit: string;
  readonly arrival: ZonePoint;
  readonly requires: readonly Condition[];
  readonly lockedHint: string;
  readonly hiddenWhenLocked: boolean;
  readonly look: ExitLook;
}

export interface ZoneWaypoint {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface ZoneCheckpoint {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface ZoneNpc {
  readonly npc: string;
  readonly x: number;
  readonly z: number;
  readonly facingDegrees: number;
  readonly when: readonly Condition[];
}

export interface ZoneDef {
  readonly id: string;
  readonly name: string;
  readonly kind: ZoneKind;
  readonly level: number;
  readonly levelUpTo: number;
  readonly stormTier: number;
  readonly cellSize: number;
  readonly floorHeight: number;
  readonly tiles: readonly string[];
  readonly floors: Readonly<Record<string, string>>;
  readonly outside: ZoneOutside | null;
  readonly walls: ZoneWalls | null;
  readonly props: readonly ZoneProp[];
  readonly scatter: readonly ZoneScatter[];
  readonly playerStart: ZonePoint;
  readonly packs: readonly ZonePack[];
  readonly packReturn: PackReturn | null;
  readonly ranks: boolean;
  readonly surge: SurgeRules | null;
  readonly exits: readonly ZoneExit[];
  readonly checkpoints: readonly ZoneCheckpoint[];
  readonly waypoint: ZoneWaypoint | null;
  readonly npcs: readonly ZoneNpc[];
  readonly voices: readonly ZoneVoice[];
  readonly ambience: ZoneAmbience;
  readonly void: ZoneVoid | null;
  readonly drifts: readonly ZoneDrift[];
  readonly triggers: readonly ZoneTrigger[];
  readonly moments: MomentField | null;
  readonly weather: ZoneWeather;
}

export interface LineDef {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
}

export interface TalkDef {
  readonly id: string;
  readonly once: boolean;
  readonly when: readonly Condition[];
  readonly lines: readonly string[];
}

export interface ObjectiveBase {
  readonly id: string;
  readonly text: string;
  readonly when: readonly Condition[];
  readonly sets: StoryFlags;
}

export interface TalkObjective extends ObjectiveBase {
  readonly type: 'talk';
  readonly npc: string;
}

export interface ReachObjective extends ObjectiveBase {
  readonly type: 'reach';
  readonly zone: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface DefeatObjective extends ObjectiveBase {
  readonly type: 'defeat';
  readonly monster: string;
}

export interface MomentObjective extends ObjectiveBase {
  readonly type: 'moment';
}

export type PathObjective = TalkObjective | ReachObjective | DefeatObjective | MomentObjective;

export interface EitherObjective extends ObjectiveBase {
  readonly type: 'either';
  readonly paths: readonly PathObjective[];
}

export type ObjectiveDef = PathObjective | EitherObjective;

export interface QuestDef {
  readonly id: string;
  readonly name: string;
  readonly requires: readonly string[];
  readonly when: readonly Condition[];
  readonly objectives: readonly ObjectiveDef[];
}

export interface NpcDef {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly rig: string;
  readonly scale: number;
  readonly tint: string;
  readonly color: string;
  readonly gear: readonly string[];
  readonly wear: readonly string[];
  readonly talks: readonly TalkDef[];
  readonly service: ServiceKind | null;
  readonly faction: string | null;
}

export interface MonsterScaling {
  readonly lifePerLevel: number;
  readonly damagePerLevel: number;
  readonly xpPerLevel: number;
}

export interface MapPlace {
  readonly zone: string;
  readonly x: number;
  readonly y: number;
}

export interface AtlasPoint {
  readonly x: number;
  readonly y: number;
}

export const ATLAS_FEATURE_KINDS = ['coast', 'ridge', 'river', 'forest', 'marsh'] as const;
export type AtlasFeatureKind = (typeof ATLAS_FEATURE_KINDS)[number];

export interface AtlasFeature {
  readonly kind: AtlasFeatureKind;
  readonly points: readonly AtlasPoint[];
}

export interface AtlasRoad {
  readonly from: string;
  readonly to: string;
  readonly via: readonly AtlasPoint[];
}

export interface AtlasLabel {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly tilt: number;
}

export interface AtlasDef {
  readonly width: number;
  readonly height: number;
  readonly compass: AtlasPoint;
  readonly places: readonly MapPlace[];
  readonly roads: readonly AtlasRoad[];
  readonly features: readonly AtlasFeature[];
  readonly labels: readonly AtlasLabel[];
}

export interface ActDef {
  readonly id: string;
  readonly title: string;
  readonly name: string;
  readonly atlas: AtlasDef;
  readonly end: ActEnd | null;
}

export interface WorldDef {
  readonly start: string;
  readonly town: string;
  readonly opening: string | null;
  readonly legacyFlags: StoryFlags;
  readonly scaling: MonsterScaling;
  readonly acts: readonly ActDef[];
  readonly retired: RetiredZones | null;
}

export interface SkillBinding {
  readonly skill: string | null;
  readonly bindings: readonly string[];
  readonly label: string;
}

export interface XpCurve {
  readonly base: number;
  readonly growth: number;
  readonly maxLevel: number;
}

export interface FirstDropDef {
  readonly flag: string;
  readonly rarity: string;
}

export interface HeroDef {
  readonly id: string;
  readonly name: string;
  readonly rig: string;
}

export interface PlayerDef {
  readonly hero: HeroDef;
  readonly heroes: readonly HeroDef[];
  readonly radius: number;
  readonly baseStats: StatBlock;
  readonly perLevel: readonly StatMod[];
  readonly skillBar: readonly SkillBinding[];
  readonly skillBook: readonly SkillUnlock[];
  readonly xp: XpCurve;
  readonly startingItems: readonly string[];
  readonly dressedFlag: string;
  readonly firstDrop: FirstDropDef;
  readonly neverWears: readonly string[];
  readonly unarmedVisual: string | null;
  readonly tint: string;
  readonly color: string;
  readonly gear: readonly string[];
  readonly inventorySize: number;
  readonly pickupRadius: number;
  readonly pickupAim: number;
  readonly rootGrace: number;
  readonly goldMagnetRadius: number;
  readonly respawnDelay: number;
  readonly respawnInvulnerability: number;
  readonly deathPenalty: DeathPenalty;
  readonly resistance: ResistanceRules;
  readonly caps: readonly StatCap[];
  readonly manaShows: ManaShows;
}

export const MANA_SHOWS = ['costly_skill', 'always'] as const;
export type ManaShows = (typeof MANA_SHOWS)[number];

export interface StatCap {
  readonly stat: StatId;
  readonly max: number;
}

export interface ResistanceRules {
  readonly armourCap: number;
  readonly cap: number;
  readonly floor: number;
  readonly tierPenalty: number;
}

export interface DeathPenalty {
  readonly minLevel: number;
  readonly xpPercent: number;
}

export interface Content {
  readonly skills: ReadonlyMap<string, SkillDef>;
  readonly monsters: ReadonlyMap<string, MonsterDef>;
  readonly monsterMods: ReadonlyMap<string, MonsterModDef>;
  readonly factions: ReadonlyMap<string, FactionDef>;
  readonly rarities: readonly RarityDef[];
  readonly itemBases: ReadonlyMap<string, ItemBaseDef>;
  readonly families: ReadonlyMap<string, FamilyDef>;
  readonly affixes: ReadonlyMap<string, AffixDef>;
  readonly itemScaling: ItemScaling;
  readonly skillTree: readonly SkillTreeNodeDef[];
  readonly chart: ChartDef;
  readonly rigs: ReadonlyMap<string, RigDef>;
  readonly attachments: ReadonlyMap<string, AttachmentDef>;
  readonly wearables: ReadonlyMap<string, WearableDef>;
  readonly baseLayers: ReadonlyMap<string, readonly string[]>;
  readonly surfaces: ReadonlyMap<string, SurfaceDef>;
  readonly props: ReadonlyMap<string, PropDef>;
  readonly zones: ReadonlyMap<string, ZoneDef>;
  readonly world: WorldDef;
  readonly npcs: ReadonlyMap<string, NpcDef>;
  readonly lines: ReadonlyMap<string, LineDef>;
  readonly quests: ReadonlyMap<string, QuestDef>;
  readonly books: ReadonlyMap<string, BookDef>;
  readonly player: PlayerDef;
  readonly flasks: readonly FlaskDef[];
  readonly trade: TradeDef;
  readonly moments: MomentLibrary;
  readonly packRanks: PackRanks;
}
