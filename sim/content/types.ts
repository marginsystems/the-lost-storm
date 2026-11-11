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

export const SKILL_MOD_FIELDS = ['damagePercent', 'areaPercent', 'cooldownPercent', 'manaCostPercent', 'knockbackPercent', 'projectiles', 'pierce'] as const;
export type SkillModField = (typeof SKILL_MOD_FIELDS)[number];

export interface SkillMod {
  readonly skill: string;
  readonly field: SkillModField;
  readonly value: number;
}

export const ANIMATION_KEYS = ['idle', 'run', 'attack', 'slam', 'cast', 'hit', 'death'] as const;
export type AnimationKey = (typeof ANIMATION_KEYS)[number];

export const ACTION_ANIMATIONS = ['attack', 'slam', 'cast'] as const;
export type ActionAnimation = (typeof ACTION_ANIMATIONS)[number];

export const VFX_STYLES = ['slash', 'claw', 'shockwave', 'bolt', 'orb'] as const;
export type VfxStyle = (typeof VFX_STYLES)[number];

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

export type Delivery = ArcDelivery | NovaDelivery | ProjectileDelivery;

export interface SkillDamage {
  readonly weaponPercent: number;
  readonly flatMin: number;
  readonly flatMax: number;
}

export interface SkillVfx {
  readonly style: VfxStyle;
  readonly color: string;
}

export interface SkillDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly animation: ActionAnimation;
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
}

export interface ChaserBehaviour {
  readonly type: 'chaser';
}

export interface RangedBehaviour {
  readonly type: 'ranged';
  readonly preferredRange: number;
  readonly retreatRange: number;
}

export type MonsterBehaviour = ChaserBehaviour | RangedBehaviour;

export interface MonsterLoot {
  readonly goldChance: number;
  readonly goldMin: number;
  readonly goldMax: number;
  readonly itemChance: number;
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
}

export const ITEM_SLOTS = ['weapon', 'head', 'chest', 'hands', 'legs', 'feet', 'charm'] as const;
export type ItemSlot = (typeof ITEM_SLOTS)[number];

export const WEAR_REGIONS = ['head', 'shoulders', 'chest', 'arms', 'hands', 'legs', 'feet'] as const;
export type WearRegion = (typeof WEAR_REGIONS)[number];

export interface WearableDef {
  readonly id: string;
  readonly model: string;
  readonly region: WearRegion;
  readonly tint: string;
  readonly hides: readonly string[];
}

export interface RarityDef {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly weight: number;
  readonly affixMin: number;
  readonly affixMax: number;
  readonly statScale: number;
}

export const ARMOUR_MATERIALS = ['cloth', 'leather', 'mail', 'plate'] as const;
export type ArmourMaterial = (typeof ARMOUR_MATERIALS)[number];

export interface ItemBaseDef {
  readonly id: string;
  readonly name: string;
  readonly slot: ItemSlot;
  readonly material: ArmourMaterial | null;
  readonly icon: string;
  readonly dropWeight: number;
  readonly minLevel: number;
  readonly implicit: readonly StatMod[];
  readonly visual: string | null;
  readonly wear: readonly string[];
}

export const AFFIX_POSITIONS = ['prefix', 'suffix'] as const;
export type AffixPosition = (typeof AFFIX_POSITIONS)[number];

export interface AffixDef {
  readonly id: string;
  readonly label: string;
  readonly position: AffixPosition;
  readonly slots: readonly ItemSlot[];
  readonly stat: StatId;
  readonly op: ModOp;
  readonly min: number;
  readonly max: number;
  readonly perLevel: number;
}

export interface ItemScaling {
  readonly implicitPerLevel: number;
}

export const REQUIRE_MODES = ['all', 'any'] as const;
export type RequireMode = (typeof REQUIRE_MODES)[number];

export interface SkillTreeNodeDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly column: number;
  readonly row: number;
  readonly requires: readonly string[];
  readonly requireMode: RequireMode;
  readonly statMods: readonly StatMod[];
  readonly skillMods: readonly SkillMod[];
}

export interface RigClip {
  readonly clip: string;
  readonly impactFraction: number;
}

export type Triple = readonly [number, number, number];

export interface RigSocket {
  readonly bone: string;
  readonly position: Triple;
  readonly rotationDegrees: Triple;
  readonly scale: number;
}

export interface AttachmentDef {
  readonly id: string;
  readonly model: string;
  readonly socket: string;
}

export interface RigDef {
  readonly id: string;
  readonly url: string;
  readonly animationUrls: readonly string[];
  readonly scale: number;
  readonly yawOffsetDegrees: number;
  readonly height: number;
  readonly rootMotionBone: string | null;
  readonly clips: Readonly<Record<AnimationKey, RigClip>>;
  readonly sockets: Readonly<Record<string, RigSocket>>;
  readonly hiddenNodes: readonly string[];
  readonly bodyParts: Readonly<Record<string, readonly string[]>>;
}

export interface PropLight {
  readonly color: string;
  readonly intensity: number;
  readonly distance: number;
  readonly height: number;
}

export interface PropDef {
  readonly id: string;
  readonly model: string;
  readonly scale: number;
  readonly blockRadius: number;
  readonly light: PropLight | null;
}

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
}

export interface PackMember {
  readonly monster: string;
  readonly count: number;
}

export interface ZonePack {
  readonly x: number;
  readonly z: number;
  readonly members: readonly PackMember[];
}

export interface SurgeRules {
  readonly delay: number;
  readonly surgesPerExtraMonster: number;
  readonly maxExtraMonsters: number;
}

export interface ZoneWalls {
  readonly tall: readonly string[];
  readonly low: string;
  readonly corner: string;
  readonly halfThickness: number;
}

export const ZONE_KINDS = ['town', 'wild'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

export interface ZoneExit {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly to: string;
  readonly toExit: string;
  readonly arrival: ZonePoint;
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
}

export interface ZoneAmbience {
  readonly background: string;
  readonly abyss: string;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly skyColor: string;
  readonly groundColor: string;
  readonly skyIntensity: number;
  readonly keyColor: string;
  readonly keyIntensity: number;
}

export interface ZoneDef {
  readonly id: string;
  readonly name: string;
  readonly kind: ZoneKind;
  readonly level: number;
  readonly cellSize: number;
  readonly floorHeight: number;
  readonly tiles: readonly string[];
  readonly floors: Readonly<Record<string, readonly string[]>>;
  readonly walls: ZoneWalls;
  readonly props: readonly ZoneProp[];
  readonly playerStart: ZonePoint;
  readonly packs: readonly ZonePack[];
  readonly surge: SurgeRules | null;
  readonly exits: readonly ZoneExit[];
  readonly checkpoints: readonly ZoneCheckpoint[];
  readonly npcs: readonly ZoneNpc[];
  readonly ambience: ZoneAmbience;
}

export interface LineDef {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
}

export interface TalkDef {
  readonly id: string;
  readonly once: boolean;
  readonly lines: readonly string[];
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
}

export interface MonsterScaling {
  readonly lifePerLevel: number;
  readonly damagePerLevel: number;
  readonly xpPerLevel: number;
}

export interface WorldDef {
  readonly start: string;
  readonly scaling: MonsterScaling;
}

export interface SkillBinding {
  readonly skill: string;
  readonly bindings: readonly string[];
  readonly label: string;
}

export interface XpCurve {
  readonly base: number;
  readonly growth: number;
  readonly maxLevel: number;
}

export interface PlayerDef {
  readonly rig: string;
  readonly radius: number;
  readonly baseStats: StatBlock;
  readonly perLevel: readonly StatMod[];
  readonly skillBar: readonly SkillBinding[];
  readonly xp: XpCurve;
  readonly startingItems: readonly string[];
  readonly unarmedVisual: string | null;
  readonly tint: string;
  readonly color: string;
  readonly gear: readonly string[];
  readonly wear: readonly string[];
  readonly inventorySize: number;
  readonly pickupRadius: number;
  readonly goldMagnetRadius: number;
  readonly respawnDelay: number;
}

export interface Content {
  readonly skills: ReadonlyMap<string, SkillDef>;
  readonly monsters: ReadonlyMap<string, MonsterDef>;
  readonly rarities: readonly RarityDef[];
  readonly itemBases: ReadonlyMap<string, ItemBaseDef>;
  readonly affixes: ReadonlyMap<string, AffixDef>;
  readonly itemScaling: ItemScaling;
  readonly skillTree: readonly SkillTreeNodeDef[];
  readonly rigs: ReadonlyMap<string, RigDef>;
  readonly attachments: ReadonlyMap<string, AttachmentDef>;
  readonly wearables: ReadonlyMap<string, WearableDef>;
  readonly props: ReadonlyMap<string, PropDef>;
  readonly zones: ReadonlyMap<string, ZoneDef>;
  readonly world: WorldDef;
  readonly npcs: ReadonlyMap<string, NpcDef>;
  readonly lines: ReadonlyMap<string, LineDef>;
  readonly player: PlayerDef;
}
