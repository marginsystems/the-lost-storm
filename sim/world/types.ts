import type { FlaskDef, FlaskResource } from '../content/flasks.ts';
import type { Content, ItemSlot, LineDef, MonsterDef, NpcDef, SkillDef, StatBlock, TalkDef, ZoneDef, ZoneNpc, ZonePack } from '../content/types.ts';
import type { ServiceKind } from '../content/trade-types.ts';
import type { Vec2 } from '../math.ts';
import type { NavGrid } from '../nav/grid.ts';
import type { Rng } from '../rng.ts';

export interface RolledAffix {
  readonly affix: string;
  readonly value: number;
}

export interface ItemInstance {
  readonly uid: number;
  readonly base: string;
  readonly rarity: string;
  readonly level: number;
  readonly affixes: readonly RolledAffix[];
}

export type Equipment = Record<ItemSlot, ItemInstance | null>;

export type ActionPhase = 'windup' | 'recovery';

export interface ActionState {
  readonly skill: SkillDef;
  phase: ActionPhase;
  timeLeft: number;
  readonly windup: number;
  readonly recovery: number;
  readonly direction: Vec2;
  readonly target: Vec2 | null;
  readonly travelSpeed: number;
  travelLeft: number;
}

export interface FlaskDose {
  readonly rate: number;
  timeLeft: number;
}

export interface FlaskState {
  readonly def: FlaskDef;
  charges: number;
  cooldown: number;
  doses: FlaskDose[];
}

export interface ComboState {
  readonly skill: string;
  readonly hits: number;
  timeLeft: number;
}

export interface ActorState {
  readonly id: number;
  pos: Vec2;
  facing: number;
  knock: Vec2;
  readonly radius: number;
  life: number;
  maxLife: number;
  action: ActionState | null;
  cooldowns: Record<string, number>;
  stagger: number;
  combo: ComboState | null;
  root: number;
  alive: boolean;
  deadTime: number;
  moving: boolean;
}

export interface IdleIntent {
  readonly type: 'idle';
}

export interface MoveIntent {
  readonly type: 'move';
  readonly dest: Vec2;
}

export interface AttackIntent {
  readonly type: 'attack';
  readonly slot: number;
  readonly targetId: number;
}

export interface PickupIntent {
  readonly type: 'pickup';
  readonly groundId: number;
}

export interface TravelIntent {
  readonly type: 'travel';
  readonly exit: string;
}

export interface TalkIntent {
  readonly type: 'talk';
  readonly npcId: number;
}

export interface UseIntent {
  readonly type: 'use';
  readonly prop: number;
}

export type Intent = IdleIntent | MoveIntent | AttackIntent | PickupIntent | TravelIntent | TalkIntent | UseIntent;

export interface PlayerState extends ActorState {
  readonly kind: 'player';
  mana: number;
  stats: StatBlock;
  skills: SkillDef[];
  level: number;
  xp: number;
  gold: number;
  skillPoints: number;
  allocated: string[];
  inventory: (ItemInstance | null)[];
  equipped: Equipment;
  intent: Intent;
  path: Vec2[];
  repathTimer: number;
  queued: Command | null;
  invulnerable: number;
  strideTravel: number;
  kills: number;
  flasks: FlaskState[];
}

export type MonsterStance = 'approach' | 'engage' | 'hold' | 'retreat';

export interface MonsterState extends ActorState {
  readonly kind: 'monster';
  readonly def: MonsterDef;
  readonly level: number;
  readonly packId: number;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly home: Vec2;
  strafeSign: number;
  aggro: boolean;
  path: Vec2[];
  repathTimer: number;
  stance: MonsterStance;
  blindTime: number;
  stuckTime: number;
  restTime: number;
  lastPos: Vec2;
  lastTravel: number;
  spawnTime: number;
  phase: number;
  nextSkill: SkillDef | null;
  readonly summonerId: number | null;
  summonTimer: number;
}

export type Actor = PlayerState | MonsterState;

export interface NpcState {
  readonly id: number;
  readonly def: NpcDef;
  readonly placement: ZoneNpc;
  readonly pos: Vec2;
  readonly homeFacing: number;
  facing: number;
}

export interface DialogueState {
  readonly npcId: number;
  readonly npc: NpcDef;
  readonly talk: TalkDef;
  index: number;
}

export type Team = 'player' | 'monster';

export interface ProjectileState {
  readonly id: number;
  readonly ownerId: number;
  readonly team: Team;
  readonly skill: SkillDef;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly damagePercent: number;
  readonly critChance: number;
  readonly critMultiplier: number;
  pos: Vec2;
  readonly direction: Vec2;
  distanceLeft: number;
  pierceLeft: number;
  readonly hitIds: number[];
}

export interface HazardState {
  readonly id: number;
  readonly ownerId: number;
  readonly team: Team;
  readonly skill: SkillDef;
  readonly pos: Vec2;
  readonly radius: number;
  readonly delay: number;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly damagePercent: number;
  readonly critChance: number;
  readonly critMultiplier: number;
  timeLeft: number;
}

export type GuardOutcome = 'open' | 'blocked' | 'broken';

export interface GoldDrop {
  readonly kind: 'gold';
  readonly amount: number;
}

export interface ItemDrop {
  readonly kind: 'item';
  readonly item: ItemInstance;
}

export interface GroundItem {
  readonly id: number;
  pos: Vec2;
  from: Vec2;
  readonly content: GoldDrop | ItemDrop;
  readonly find: string | null;
  age: number;
  kept: boolean;
}

export interface MoveCommand {
  readonly type: 'move';
  readonly held: boolean;
  readonly dest: Vec2;
}

export interface SkillCommand {
  readonly type: 'skill';
  readonly slot: number;
  readonly aim: Vec2;
  readonly targetId: number | null;
}

export interface PickupCommand {
  readonly type: 'pickup';
  readonly groundId: number;
}

export interface StopCommand {
  readonly type: 'stop';
}

export interface EquipCommand {
  readonly type: 'equip';
  readonly inventoryIndex: number;
}

export interface UnequipCommand {
  readonly type: 'unequip';
  readonly slot: ItemSlot;
}

export interface DropCommand {
  readonly type: 'drop';
  readonly inventoryIndex: number;
}

export interface AllocateCommand {
  readonly type: 'allocate';
  readonly node: string;
}

export interface TravelCommand {
  readonly type: 'travel';
  readonly exit: string;
}

export interface TalkCommand {
  readonly type: 'talk';
  readonly npcId: number;
}

export interface AdvanceCommand {
  readonly type: 'advance';
}

export interface FlaskCommand {
  readonly type: 'flask';
  readonly slot: number;
}

export interface TeleportCommand {
  readonly type: 'teleport';
  readonly zone: string;
}

export type RespawnChoice = 'checkpoint' | 'town';

export interface RespawnCommand {
  readonly type: 'respawn';
  readonly choice: RespawnChoice;
}

export interface DeathState {
  readonly killer: string;
  readonly skill: string;
  elapsed: number;
}

export interface UseCommand {
  readonly type: 'use';
  readonly prop: number;
}

export type TradeAction =
  | { readonly type: 'buy'; readonly index: number }
  | { readonly type: 'sell'; readonly inventoryIndex: number }
  | { readonly type: 'buy_back'; readonly index: number }
  | { readonly type: 'stash'; readonly inventoryIndex: number }
  | { readonly type: 'unstash'; readonly index: number }
  | { readonly type: 'close' };

export interface TradeCommand {
  readonly type: 'trade';
  readonly action: TradeAction;
}

export interface ReadCommand {
  readonly type: 'read';
  readonly book: string;
  readonly page: string;
}

export type Command = ReadCommand | MoveCommand | SkillCommand | PickupCommand | StopCommand | EquipCommand | UnequipCommand | DropCommand | AllocateCommand | TravelCommand | TalkCommand | AdvanceCommand | TeleportCommand | RespawnCommand | FlaskCommand | UseCommand | TradeCommand;

export interface StartRespawn {
  readonly type: 'start';
}

export interface ExitRespawn {
  readonly type: 'exit';
  readonly exit: string;
}

export interface CheckpointRespawn {
  readonly type: 'checkpoint';
  readonly checkpoint: string;
}

export interface WaypointRespawn {
  readonly type: 'waypoint';
}

export type RespawnPoint = StartRespawn | ExitRespawn | CheckpointRespawn | WaypointRespawn;

export type NoticeReason = 'no_mana' | 'on_cooldown' | 'inventory_full' | 'flask_empty' | 'life_full' | 'mana_full' | 'no_gold' | 'stash_full';

export type WorldEvent =
  | { readonly type: 'skill_start'; readonly actorId: number; readonly skill: SkillDef; readonly direction: Vec2; readonly windup: number; readonly recovery: number }
  | { readonly type: 'skill_impact'; readonly actorId: number; readonly team: Team; readonly skill: SkillDef; readonly origin: Vec2; readonly direction: Vec2; readonly hits: number }
  | { readonly type: 'skill_interrupt'; readonly actorId: number }
  | { readonly type: 'projectile_spawn'; readonly projectile: ProjectileState }
  | { readonly type: 'projectile_end'; readonly id: number; readonly pos: Vec2; readonly hit: boolean; readonly skill: SkillDef }
  | { readonly type: 'damage'; readonly targetId: number; readonly sourceId: number; readonly targetTeam: Team; readonly amount: number; readonly crit: boolean; readonly killed: boolean; readonly pos: Vec2; readonly direction: Vec2; readonly skill: SkillDef }
  | { readonly type: 'guarded'; readonly monsterId: number; readonly broken: boolean; readonly pos: Vec2; readonly direction: Vec2 }
  | { readonly type: 'hazard'; readonly hazard: HazardState; readonly burst: boolean; readonly hits: number }
  | { readonly type: 'death'; readonly actorId: number; readonly team: Team; readonly pos: Vec2; readonly direction: Vec2 }
  | { readonly type: 'monster_spawn'; readonly monsterId: number }
  | { readonly type: 'monster_remove'; readonly monsterId: number }
  | { readonly type: 'aggro'; readonly monsterId: number }
  | { readonly type: 'drop'; readonly ground: GroundItem }
  | { readonly type: 'pickup'; readonly ground: GroundItem }
  | { readonly type: 'xp'; readonly amount: number }
  | { readonly type: 'level_up'; readonly level: number }
  | { readonly type: 'surge'; readonly surge: number }
  | { readonly type: 'surge_cleared'; readonly surge: number; readonly delay: number }
  | { readonly type: 'player_respawn' }
  | { readonly type: 'zone_changed'; readonly from: string; readonly to: string }
  | { readonly type: 'checkpoint'; readonly checkpoint: string; readonly pos: Vec2 }
  | { readonly type: 'hero_step'; readonly pos: Vec2 }
  | { readonly type: 'explored'; readonly zone: string }
  | { readonly type: 'dialogue_line'; readonly npcId: number; readonly npc: string; readonly talk: string; readonly line: LineDef; readonly index: number; readonly last: boolean }
  | { readonly type: 'dialogue_closed'; readonly npcId: number; readonly npc: string; readonly talk: string; readonly finished: boolean }
  | { readonly type: 'quest_started'; readonly quest: string }
  | { readonly type: 'quest_advanced'; readonly quest: string; readonly objective: string }
  | { readonly type: 'quest_completed'; readonly quest: string }
  | { readonly type: 'waypoint_unlocked'; readonly zone: string }
  | { readonly type: 'exit_locked'; readonly exit: string; readonly hint: string }
  | { readonly type: 'boss_phase'; readonly monsterId: number; readonly phase: number }
  | { readonly type: 'bark'; readonly speaker: string; readonly line: LineDef }
  | { readonly type: 'notice'; readonly reason: NoticeReason }
  | { readonly type: 'flasks_refilled' }
  | { readonly type: 'flask_used'; readonly slot: number; readonly flask: string; readonly resource: FlaskResource; readonly pos: Vec2 }
  | { readonly type: 'character_changed' };

export interface VendorStock {
  stock: (ItemInstance | null)[];
  buyback: ItemInstance[];
  stale: boolean;
}

export interface OpenService {
  readonly kind: ServiceKind;
  readonly owner: string;
  readonly anchor: Vec2;
}

export interface EncounterState {
  readonly id: string;
  walked: number;
  pos: Vec2 | null;
  off: number;
  groundId: number | null;
}

export interface WakeState {
  elapsed: number;
  readonly lie: number;
  readonly rise: number;
}

export interface World {
  readonly content: Content;
  zone: ZoneDef;
  grid: NavGrid;
  respawn: RespawnPoint;
  death: DeathState | null;
  visited: string[];
  readonly rng: Rng;
  time: number;
  readonly player: PlayerState;
  monsters: MonsterState[];
  spawnedPacks: ZonePack[];
  npcs: NpcState[];
  dialogue: DialogueState | null;
  heard: string[];
  quests: Record<string, number>;
  waypoints: string[];
  explored: Record<string, Uint8Array>;
  exploredRevision: number;
  projectiles: ProjectileState[];
  hazards: HazardState[];
  ground: GroundItem[];
  nextId: number;
  nextItemUid: number;
  nextPackId: number;
  surge: number;
  surgeTimer: number | null;
  wake: WakeState | null;
  shift: Vec2;
  trail: Vec2;
  heading: Vec2;
  encounters: EncounterState[];
  flags: Record<string, string>;
  events: WorldEvent[];
  service: OpenService | null;
  vendors: Record<string, VendorStock>;
  stash: (ItemInstance | null)[];
  tradeZone: string;
}
