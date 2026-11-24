import type { MarkerLibrary } from './marker-types.ts';
import type { MonsterRank, PackRanks } from './rank-types.ts';
import type { TailwindDef } from './tailwind-types.ts';
import type { AffixDef, DropLean, FamilyDef, ItemBaseDef, ItemScaling, PowerTriggerDef, RarityDef } from './item-types.ts';
export type { WeaponKind } from './item-types.ts';
import type { FlaskDef } from './flasks.ts';
import type { AttachmentDef, RigDef } from './rig-types.ts';
import type { AlarmDef, AmbushBehaviour, BodyCrust, DormantDef, FactionDef, FieldDelivery, GuardDef, MarkDelivery, MonsterElement, MonsterModDef, MonsterPoise, MonsterTrail, RecoveryDef, ReviveDelivery, SkillEchoing, StalkerBehaviour, SummonDef, SwarmBehaviour } from './combat-types.ts';
import type { NovaSide, SkillMend } from './mend-types.ts';
import type { AreaDelivery, BeamDelivery, BlinkDelivery, ChainDelivery, SkillShape, SkillUnlock } from './shape-types.ts';
import type { TradeDef } from './trade-types.ts';
import type { RunTableDef } from './run-table-types.ts';
import type { PropDef, SurfaceDef } from './prop-types.ts';
import type { BookDef, StoryFlags } from './story-types.ts';
export type { ZoneAmbience } from './ambience-types.ts';
import type { ActEnd, RetiredZones } from './road-types.ts';
import type { MomentLibrary } from './moment-types.ts';
import type { ChartDef, SkillTarget, SkillVariant } from './chart-types.ts';
import type { SkillVfx } from './vfx-types.ts';
import type { XpCurve } from './xp-types.ts';
import type { BossDef, PieceStrikes } from './boss-types.ts';
import type { AtlasDef } from './atlas-types.ts';
export type { AtlasChain, AtlasDef, AtlasFeature, AtlasFeatureKind, AtlasLabel, AtlasPoint, AtlasRoad, MapPlace } from './atlas-types.ts';
export { ATLAS_FEATURE_KINDS } from './atlas-types.ts';
export type { BossAnchor, BossBarks, BossDef, BossDrop, BossFirstKill, BossPhase, BossPoise, BossPresence, BossSkill, CountBreak, PieceStrikes } from './boss-types.ts';
export type { XpAfter, XpCurve, XpGap, XpReduction } from './xp-types.ts';
export { VFX_CUES, VFX_MAX_FORKS, VFX_STYLES } from './vfx-types.ts';
export type { SkillVfx, VfxCue, VfxImpact, VfxLightning, VfxStyle } from './vfx-types.ts';
export type { ExitLook, PackMember, PackReturn, PackWait, SurgeRules, ZoneCheckpoint, DuelClosing, DuelGear, ZoneDef, ZoneDuel, ZoneEdge, ZoneExit, ZoneKind, ZoneNpc, ZoneOutside, ZonePack, ZonePoint, ZoneProp, ZoneReturn, ZoneSize, ZoneVoice, ZoneWalls, ZoneWaypoint } from './zone-types.ts';
export { DUEL_GEAR, ZONE_KINDS } from './zone-types.ts';
export type { ZoneFall } from './fall-types.ts';
export type { DefeatObjective, EitherObjective, LineDef, MomentObjective, NpcDef, ObjectiveBase, ObjectiveDef, PathObjective, QuestDef, ReachObjective, TalkDef, TalkObjective } from './quest-types.ts';
import type { ZoneDef } from './zone-types.ts';
import type { LineDef, NpcDef, QuestDef } from './quest-types.ts';

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

export const SKILL_MOD_FIELDS = ['damagePercent', 'areaPercent', 'rangePercent', 'durationPercent', 'cooldownPercent', 'manaCostPercent', 'knockbackPercent', 'staggerPercent', 'projectiles', 'pierce', 'chains', 'chainFalloff', 'momentumCapPercent', 'momentumGracePercent', 'lifePerHit', 'lifeOnHit', 'leech', 'echo', 'pull', 'spread'] as const;
export type SkillModField = (typeof SKILL_MOD_FIELDS)[number];

export interface SkillMod {
  readonly target: SkillTarget;
  readonly field: SkillModField;
  readonly value: number;
}

export interface EmpoweredMod {
  readonly field: SkillModField;
  readonly value: number;
}

export interface SkillEmpowerment {
  readonly weapon: string;
  readonly mods: readonly EmpoweredMod[];
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
  readonly side: NovaSide;
}

export interface ProjectileDelivery {
  readonly type: 'projectile';
  readonly speed: number;
  readonly radius: number;
  readonly range: number;
  readonly pierce: number;
  readonly count: number;
  readonly spreadDegrees: number;
  readonly interval: number;
}

export interface DashDelivery {
  readonly type: 'dash';
  readonly distance: number;
  readonly duration: number;
  readonly invulnerable: number;
  readonly passThrough: boolean;
  readonly steady: boolean;
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

export interface SkillDef extends SkillShape, SkillEchoing {
  readonly id: string;
  readonly form: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly animation: string;
  readonly empowered: SkillEmpowerment | null;
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
  readonly stun: number;
  readonly lifeOnHit: number;
  readonly leech: number;
  readonly leaves: string | null;
  readonly mend: SkillMend | null;
}

export interface ChaserBehaviour {
  readonly type: 'chaser';
}

export interface RangedBehaviour {
  readonly type: 'ranged';
  readonly preferredRange: number;
  readonly retreatRange: number;
  readonly lead: number;
}

export interface FixedBehaviour {
  readonly type: 'fixed';
  readonly sealed: boolean;
  readonly collateral: number;
  readonly strikes: PieceStrikes | null;
}

export type MonsterBehaviour = ChaserBehaviour | RangedBehaviour | StalkerBehaviour | SwarmBehaviour | AmbushBehaviour | FixedBehaviour;

export interface MonsterLoot {
  readonly goldChance: number;
  readonly goldMin: number;
  readonly goldMax: number;
  readonly itemChance: number;
}

export const BODY_MATERIALS = ['flesh', 'bone', 'hide', 'chitin', 'armour'] as const;
export type BodyMaterial = (typeof BODY_MATERIALS)[number];

export interface MonsterDef {
  readonly id: string;
  readonly name: string;
  readonly rig: string;
  readonly bodyMaterial: BodyMaterial;
  readonly scale: number;
  readonly radius: number;
  readonly life: number;
  readonly scalesLife: boolean;
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
  readonly alarm: AlarmDef | null;
  readonly support: string | null;
  readonly barks: readonly string[];
  readonly regen: number;
  readonly element: MonsterElement | null;
  readonly trail: MonsterTrail | null;
  readonly rank: MonsterRank | null;
  readonly heatproof: boolean;
  readonly crust: BodyCrust | null;
}

export const ITEM_SLOTS = ['weapon', 'head', 'chest', 'hands', 'legs', 'feet', 'charm'] as const;
export type ItemSlot = (typeof ITEM_SLOTS)[number];

export const WEAR_REGIONS = ['hair', 'head', 'neck', 'shoulders', 'chest', 'arms', 'hands', 'legs', 'feet'] as const;
export type WearRegion = (typeof WEAR_REGIONS)[number];

export interface WearableDef {
  readonly id: string;
  readonly model: string;
  readonly pieces: readonly string[];
  readonly region: WearRegion;
  readonly covers: readonly WearRegion[];
  readonly fit: string | null;
  readonly fits: Readonly<Record<string, string>>;
  readonly surfaces: Readonly<Record<string, string>>;
  readonly tint: string;
  readonly hides: readonly string[];
  readonly wakeLamps: number;
  readonly iconWith: readonly string[];
}

export { ARMOUR_MATERIALS, CAST_ORIGINS, GROUND_KEEPS, GROUND_MODELS, ITEM_STATS, POWER_TARGETS, POWER_TRIGGERS, RARITY_MARKERS, WEAPON_KINDS } from './item-types.ts';
export type { AffixDef, ArmourMaterial, DropLean, BuffEffect, CastEffect, EmpowerEffect, EmpowerLook, FlaskEffect, RestoreEffect, CastOrigin, FamilyDef, GroundKeep, GroundLook, GroundModel, ItemBaseDef, ItemScaling, ItemStat, PowerDef, PowerEffect, PowerTarget, PowerTrigger, PowerTriggerDef, RarityDef, RarityMarker, ItemUse, PortalUse } from './item-types.ts';

export const STANCES = ['moving', 'still', 'low_life', 'full_life'] as const;
export type Stance = (typeof STANCES)[number];

export interface StanceMod {
  readonly when: Stance;
  readonly statMods: readonly StatMod[];
}

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
  readonly weapon: string | null;
  readonly triggers: readonly PowerTriggerDef[];
  readonly stances: readonly StanceMod[];
  readonly cluster: string | null;
  readonly common: string | null;
  readonly specialty: string | null;
}

export type { ChartCommon, ChartDef, CommonPlace, SpecialtyDef, ChartGroup, ChartPath, ChartRespec, PointGrant, SkillTarget, SkillVariant, WeaponGroup } from './chart-types.ts';

export type { FlameLight, GlowLight, GlowLit, PropCache, PropClimb, PropDef, PropLid, PropLight, PropSeat, SurfaceDef, SurfaceGlow, SurfaceHeat } from './prop-types.ts';

export type { AttachmentDef, PictureView, RigActionClip, RigClips, RigPrivateClip, RigContact, RigDef, RigGait, RigSocket, RigStanceClips, Triple } from './rig-types.ts';
export { PICTURE_VIEWS } from './rig-types.ts';

export type { AroundScatter, CliffScatter, OpenScatter, ScatterSize, ZoneScatter } from './scatter-types.ts';
export { SCATTER_TYPES } from './scatter-types.ts';

export { OBJECTIVE_STATES, QUEST_STATES } from './condition-types.ts';
export type { Condition, FlagCondition, ObjectiveCondition, ObjectiveState, QuestCondition, QuestState } from './condition-types.ts';

export interface ScalingRamp {
  readonly from: number;
  readonly to: number;
  readonly lifePerLevel: number;
  readonly damagePerLevel: number;
}

export interface ScalingPoint {
  readonly level: number;
  readonly times: number;
}

export interface MonsterScaling {
  readonly lifePerLevel: number;
  readonly damagePerLevel: number;
  readonly xpPerLevel: number;
  readonly ramp: ScalingRamp | null;
  readonly lifeTimes: readonly ScalingPoint[];
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
  readonly recovery: RecoveryDef;
  readonly acts: readonly ActDef[];
  readonly retired: RetiredZones | null;
  readonly withheld: readonly string[];
}

export interface SkillBinding {
  readonly skill: string | null;
  readonly bindings: readonly string[];
  readonly label: string;
}

export interface FirstDropDef {
  readonly flag: string;
  readonly rarity: string;
}

export type NameStyle = 'man' | 'woman';

export const NAME_STYLES: readonly NameStyle[] = ['man', 'woman'];

export interface HeroDef {
  readonly id: string;
  readonly name: string;
  readonly rig: string;
  readonly names: NameStyle;
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
  readonly knockGrace: number;
  readonly turnRate: number;
  readonly walkTurnRate: number;
  readonly goldMagnetRadius: number;
  readonly respawnDelay: number;
  readonly respawnInvulnerability: number;
  readonly deathPenalty: DeathPenalty;
  readonly resistance: ResistanceRules;
  readonly caps: readonly StatCap[];
  readonly skillCaps: readonly SkillCap[];
  readonly manaShows: ManaShows;
}

export const MANA_SHOWS = ['costly_skill', 'always'] as const;
export type ManaShows = (typeof MANA_SHOWS)[number];

export interface StatCap {
  readonly stat: StatId;
  readonly max: number;
}

export interface SkillCap {
  readonly field: SkillModField;
  readonly min: number | null;
  readonly max: number | null;
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
  readonly leaning: boolean;
  readonly leans: readonly DropLean[];
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
  readonly runTable: RunTableDef;
  readonly tailwind: TailwindDef;
  readonly markers: MarkerLibrary;
}
