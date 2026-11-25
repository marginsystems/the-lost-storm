import type { PivotState } from './pivot.ts';
import type { TailwindEnd, TailwindState } from './tailwind-types.ts';
import type { RankRun } from '../content/rank-types.ts';
import type { FlaskDef, FlaskResource } from '../content/flasks.ts';
import type { GlitchEvent, GlitchState, PathAct, PathLog } from './glitch-types.ts';
import type { Content, ItemSlot, LineDef, MonsterDef, NpcDef, SkillDef, StatBlock, TalkDef, XpReduction, ZoneDef, ZonePack } from '../content/types.ts';
import type { PowerState } from './power-types.ts';
import type { ActionState, ChannelState } from './action-types.ts';
import type { PressBuffer } from './press-buffer.ts';
export type { ActionPhase, ActionState, ChannelState } from './action-types.ts';
export type { BuffState, EmpowerState, PowerState } from './power-types.ts';
import type { ItemPlace, OpenService } from './service-types.ts';
import type { UnisonEvent, UnisonState } from './unison-types.ts';
import type { MomentDef } from '../content/moment-types.ts';
import type { ZoneWake } from '../content/story-types.ts';
import type { Vec2 } from '../math.ts';
import type { ShoreState } from './shore-state.ts';
import type { DeathState } from './death.ts';
import type { LedgerState } from './ledger.ts';
import type { PackTimer } from './pack-return.ts';
import type { GridStamp, NavGrid } from '../nav/grid.ts';
import type { MomentFigure } from './moment-figure.ts';
import type { TransitState } from './moment-transit.ts';
import type { Rng } from '../rng.ts';
import type { NpcState } from './npc-types.ts';
import type { HazardState, ProjectileState, QueuedShot } from './delivery-types.ts';
import type { Escort, SceneState } from './scene-state.ts';
import type { WardState } from './wards.ts';
import type { MomentumState } from './momentum-types.ts';
import type { Tally } from '../tally.ts';
import type { PortalChannelIntent, PortalIntent, PortalStage, PortalState } from './portal-types.ts';
import type { OpenChest } from './command-types.ts';
import type { RunEnd, RunState } from './run-types.ts';

export type { AdvanceCommand, AllocateCommand, ChooseChangeCommand, Command, DropCommand, EquipCommand, FlaskCommand, GlitchCommand, GlitchSettingCommand, HeroCommand, HoldCommand, MoveCommand, OpenChest, PickupCommand, ReadCommand, RefundCommand, RespawnChoice, RespawnCommand, RespecCommand, SkillCommand, SlotCommand, SteerCommand, StopCommand, StrikeCommand, TalkCommand, TeleportCommand, TradeAction, TradeCommand, TravelCommand, UnequipCommand, UseCommand, WalkCommand } from './command-types.ts';
export type { HazardState, MomentFigure, NpcState, ProjectileState, QueuedShot };

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
  readonly ledger: string | null;
  readonly count?: number;
  readonly unidentified?: true;
}

export type Equipment = Record<ItemSlot, ItemInstance | null>;

export interface Offence {
  readonly sourceId: number;
  readonly team: Team;
  readonly faction: string | null;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly damagePercent: number;
  readonly critChance: number;
  readonly critMultiplier: number;
  readonly from?: Vec2;
}

export interface BurnState {
  readonly source: string;
  readonly skill: SkillDef;
  readonly offence: Offence;
  perTick: number;
  tickLeft: number;
  ticksLeft: number;
}

export interface BrandState {
  readonly source: string;
  readonly burst: SkillDef;
  readonly offence: Offence;
  timeLeft: number;
}

export interface FlaskDose {
  readonly rate: number;
  timeLeft: number;
}

export interface FlaskState {
  def: FlaskDef;
  tier: number;
  charges: number;
  cooldown: number;
  doses: FlaskDose[];
}

export interface ComboState {
  readonly skill: string;
  readonly hits: number;
  timeLeft: number;
}

export type Motion = 'still' | 'stride' | 'knocked' | 'pulled' | 'dash' | 'lunge' | 'rising';

export interface ActorState {
  leech: LeechState;
  readonly id: number;
  pos: Vec2;
  facing: number;
  knock: Vec2;
  readonly radius: number;
  life: number;
  maxLife: number;
  action: ActionState | null;
  pivot: PivotState | null;
  cooldowns: Record<string, number>;
  stagger: number;
  interrupts: number;
  combo: ComboState | null;
  root: number;
  rootGrace: number;
  knockGrace: number;
  tempo: number;
  tempoTime: number;
  brand: BrandState | null;
  burn: BurnState | null;
  alive: boolean;
  deadTime: number;
  moving: boolean;
  motion: Motion;
  gait: number;
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

export type Intent = IdleIntent | MoveIntent | AttackIntent | PickupIntent | TravelIntent | TalkIntent | UseIntent | OpenChest | PortalChannelIntent | PortalIntent;

export interface PlayerState extends ActorState {
  readonly kind: 'player';
  party: number;
  hero: string;
  wielding: string | null;
  mana: number;
  stats: StatBlock;
  bar: (string | null)[];
  skills: (SkillDef | null)[];
  level: number;
  xp: number;
  gold: number;
  skillPoints: number;
  allocated: string[];
  changes: Record<string, string>;
  learned: string[];
  grantsTaken: string[];
  freeReset: boolean;
  inventory: (ItemInstance | null)[];
  equipped: Equipment;
  intent: Intent;
  path: Vec2[];
  repathTimer: number;
  buffered: PressBuffer;
  held: number[];
  invulnerable: number;
  stridePhase: number;
  strideGait: number;
  walked: Vec2;
  chase: ChaseState;
  kills: number;
  tally: Tally;
  flasks: FlaskState[];
  powers: PowerState;
  momentum: MomentumState;
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
  stranded: number;
  stance: MonsterStance;
  blindTime: number;
  stuckTime: number;
  restTime: number;
  stalledFor: number | null;
  calm: number;
  lastPos: Vec2;
  lastTravel: number;
  spawnTime: number;
  phase: number;
  nextSkill: SkillDef | null;
  measureStep: number;
  beatAt: number;
  sealed: boolean;
  openUntil: number;
  strikeReady: number;
  held: boolean;
  yielded: boolean;
  readonly summonerId: number | null;
  summonTimer: number;
  trailFrom: Vec2;
  foeId: number | null;
  readonly revived: boolean;
  leashTime: number;
  returning: boolean;
  unison: UnisonState;
  recovery: RecoveryState;
}

export interface LeechState {
  at: number;
  taken: number;
}

export interface RecoveryState {
  guard: number;
  strain: number;
  unbroken: number;
  stunned: number;
}

export type Actor = PlayerState | MonsterState;

export interface DialogueState {
  readonly npcId: number;
  readonly npc: NpcDef;
  readonly talk: TalkDef;
  readonly replay: boolean;
  index: number;
}

export type Team = 'player' | 'monster';

export interface EchoState {
  readonly ownerId: number;
  readonly team: Team;
  readonly faction: string | null;
  readonly skill: SkillDef;
  readonly origin: Vec2;
  readonly direction: Vec2;
  readonly target: Vec2 | null;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly damagePercent: number;
  readonly critChance: number;
  readonly critMultiplier: number;
  timeLeft: number;
}

export interface AreaState {
  readonly id: number;
  readonly ownerId: number;
  readonly from: Vec2;
  readonly skill: SkillDef;
  readonly offence: Offence;
  readonly pos: Vec2;
  readonly toward: Vec2;
  readonly reach: number;
  timeLeft: number;
  pulseLeft: number;
  pulses: number;
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
  content: GoldDrop | ItemDrop;
  readonly find: string | null;
  age: number;
  kept: boolean;
}

export interface ChaseState {
  mark: Vec2;
  still: number;
}

export type MomentPhase = 'mark' | 'dormant' | 'awake' | 'fading';
export type MomentOutcome = 'faded' | 'played' | 'resolved' | 'expired' | 'left' | 'opened';
export type ChestState = 'none' | 'closed' | 'opening' | 'opened';

export interface MomentState {
  readonly id: number;
  readonly def: MomentDef;
  readonly combat: boolean;
  readonly level: number;
  pos: Vec2;
  phase: MomentPhase;
  timeLeft: number;
  phaseTime: number;
  armed: boolean;
  away: number;
  entered: boolean;
  bounty: number;
  full: number;
  reduced: XpReduction | null;
  blocks: GridStamp | null;
  outcome: MomentOutcome | null;
  chest: ChestState;
  readonly figures: MomentFigure[];
  transit: TransitState | null;
}

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

export type AreaStage = 'start' | 'pulse' | 'end';

export type ArmedWhere = 'bag' | 'ground';

export type NoticeReason = 'wrong_weapon' | 'no_mana' | 'on_cooldown' | 'inventory_full' | 'flask_empty' | 'life_full' | 'mana_full' | 'no_gold' | 'stash_full' | 'legendary_limit' | 'portal_town' | 'portal_boss' | 'run_refused' | 'unidentified' | 'duel_gear';

export type WorldEvent =
  | { readonly type: 'tailwind_rise'; readonly tier: number; readonly points: number }
  | { readonly type: 'tailwind_end'; readonly reason: TailwindEnd; readonly best: number; readonly points: number; readonly kills: number; readonly xp: number; readonly gold: number }
  | { readonly type: 'skill_start'; readonly actorId: number; readonly skill: SkillDef; readonly direction: Vec2; readonly windup: number; readonly recovery: number }
  | { readonly type: 'skill_impact'; readonly actorId: number; readonly team: Team; readonly skill: SkillDef; readonly origin: Vec2; readonly direction: Vec2; readonly hits: number; readonly echo: boolean }
  | { readonly type: 'revive'; readonly monsterId: number; readonly corpseId: number; readonly by: number }
  | { readonly type: 'skill_interrupt'; readonly actorId: number }
  | { readonly type: 'channel_end'; readonly actorId: number; readonly skill: SkillDef }
  | { readonly type: 'projectile_spawn'; readonly projectile: ProjectileState }
  | { readonly type: 'projectile_end'; readonly id: number; readonly pos: Vec2; readonly hit: boolean; readonly skill: SkillDef }
  | { readonly type: 'damage'; readonly targetId: number; readonly sourceId: number; readonly targetTeam: Team; readonly amount: number; readonly crit: boolean; readonly killed: boolean; readonly pos: Vec2; readonly direction: Vec2; readonly skill: SkillDef; readonly burn: boolean; readonly shoveGraced: boolean }
  | { readonly type: 'burn'; readonly targetId: number; readonly skill: SkillDef; readonly pos: Vec2; readonly duration: number }
  | { readonly type: 'soak'; readonly targetId: number; readonly skill: SkillDef; readonly pos: Vec2; readonly duration: number }
  | { readonly type: 'stun'; readonly monsterId: number; readonly pos: Vec2; readonly duration: number }
  | { readonly type: 'mend'; readonly actorId: number; readonly amount: number }
  | { readonly type: 'heal'; readonly sourceId: number; readonly targetId: number; readonly amount: number; readonly wanted: number; readonly skill: SkillDef; readonly pos: Vec2 }
  | { readonly type: 'guarded'; readonly monsterId: number; readonly broken: boolean; readonly pos: Vec2; readonly direction: Vec2 }
  | { readonly type: 'area'; readonly area: AreaState; readonly stage: AreaStage; readonly hits: number }
  | { readonly type: 'chain'; readonly actorId: number; readonly team: Team; readonly skill: SkillDef; readonly points: readonly Vec2[] }
  | { readonly type: 'beam'; readonly actorId: number; readonly team: Team; readonly skill: SkillDef; readonly from: Vec2; readonly to: Vec2; readonly hits: number }
  | { readonly type: 'blink'; readonly actorId: number; readonly skill: SkillDef; readonly from: Vec2; readonly to: Vec2 }
  | { readonly type: 'brand'; readonly targetId: number; readonly skill: SkillDef; readonly pos: Vec2; readonly burst: boolean }
  | { readonly type: 'hazard'; readonly hazard: HazardState; readonly burst: boolean; readonly hits: number }
  | { readonly type: 'death'; readonly actorId: number; readonly team: Team; readonly pos: Vec2; readonly direction: Vec2 }
  | { readonly type: 'monster_spawn'; readonly monsterId: number }
  | { readonly type: 'monster_remove'; readonly monsterId: number }
  | { readonly type: 'aggro'; readonly monsterId: number }
  | { readonly type: 'drop'; readonly ground: GroundItem }
  | { readonly type: 'pickup'; readonly ground: GroundItem }
  | { readonly type: 'item_found'; readonly rarity: string }
  | { readonly type: 'xp'; readonly amount: number; readonly reduced: XpReduction | null }
  | { readonly type: 'level_up'; readonly level: number }
  | { readonly type: 'skill_unlocked'; readonly skill: string; readonly slot: number | null }
  | { readonly type: 'chart_point'; readonly source: string; readonly points: number }
  | { readonly type: 'surge'; readonly surge: number }
  | { readonly type: 'surge_cleared'; readonly surge: number; readonly delay: number }
  | { readonly type: 'player_respawn' }
  | { readonly type: 'zone_changed'; readonly from: string; readonly to: string }
  | { readonly type: 'checkpoint'; readonly checkpoint: string; readonly pos: Vec2 }
  | { readonly type: 'hero_step'; readonly pos: Vec2 }
  | { readonly type: 'wake'; readonly beat: WakeBeat }
  | { readonly type: 'encounter_nearing'; readonly encounter: string }
  | { readonly type: 'encounter_shown'; readonly encounter: string; readonly pos: Vec2 }
  | { readonly type: 'explored'; readonly zone: string }
  | { readonly type: 'dialogue_line'; readonly npcId: number; readonly npc: string; readonly talk: string; readonly line: LineDef; readonly index: number; readonly last: boolean }
  | { readonly type: 'dialogue_closed'; readonly npcId: number; readonly npc: string; readonly talk: string; readonly finished: boolean; readonly replay: boolean }
  | { readonly type: 'quest_started'; readonly quest: string }
  | { readonly type: 'quest_advanced'; readonly quest: string; readonly objective: string }
  | { readonly type: 'quest_completed'; readonly quest: string }
  | { readonly type: 'act_ended'; readonly act: string }
  | { readonly type: 'triggered'; readonly trigger: string; readonly pos: Vec2 }
  | { readonly type: 'waypoint_unlocked'; readonly zone: string }
  | { readonly type: 'exit_locked'; readonly exit: string; readonly hint: string }
  | { readonly type: 'boss_phase'; readonly monsterId: number; readonly phase: number }
  | { readonly type: 'boss_defeated'; readonly monsterId: number; readonly monster: string; readonly first: boolean; readonly yielded: boolean }
  | { readonly type: 'boss_held'; readonly monsterId: number; readonly holders: readonly number[] }
  | { readonly type: 'count_broken'; readonly monsterId: number; readonly piece: number; readonly pos: Vec2 }
  | { readonly type: 'piece_unsealed'; readonly monsterId: number }
  | { readonly type: 'bark'; readonly speaker: string; readonly line: LineDef }
  | { readonly type: 'scene_lead'; readonly scene: string; readonly npcId: number }
  | { readonly type: 'scene_ward'; readonly scene: string; readonly npcId: number; readonly wardId: number }
  | { readonly type: 'notice'; readonly reason: NoticeReason }
  | { readonly type: 'item_identified'; readonly place: ItemPlace; readonly index: number; readonly uid: number; readonly good: boolean }
  | { readonly type: 'armed'; readonly group: string; readonly base: string; readonly where: ArmedWhere | null }
  | { readonly type: 'portal'; readonly stage: PortalStage; readonly zone: string; readonly pos: Vec2 }
  | { readonly type: 'flasks_refilled' }
  | { readonly type: 'flask_upgraded'; readonly flask: string; readonly tier: number }
  | { readonly type: 'flask_used'; readonly slot: number; readonly flask: string; readonly resource: FlaskResource; readonly pos: Vec2 }
  | { readonly type: 'character_changed' }
  | GlitchEvent
  | { readonly type: 'path_marked'; readonly act: PathAct }
  | { readonly type: 'moment_mark'; readonly moment: MomentState }
  | { readonly type: 'moment_strike'; readonly moment: MomentState }
  | { readonly type: 'moment_woke'; readonly moment: MomentState; readonly turned: readonly number[] }
  | { readonly type: 'moment_ended'; readonly moment: MomentState; readonly outcome: MomentOutcome }
  | { readonly type: 'moment_gone'; readonly momentId: number }
  | { readonly type: 'moment_chest'; readonly moment: MomentState }
  | UnisonEvent
  | { readonly type: 'chest_opened'; readonly moment: MomentState; readonly pos: Vec2; readonly gold: number }
  | { readonly type: 'cache_opened'; readonly prop: number; readonly pos: Vec2; readonly gold: number }
  | { readonly type: 'run_set'; readonly zone: string; readonly price: number }
  | { readonly type: 'run_ended'; readonly zone: string; readonly end: RunEnd };

export interface VendorStock {
  stock: (ItemInstance | null)[];
  buyback: ItemInstance[];
  stale: boolean;
}

export interface EncounterState {
  readonly id: string;
  walked: number;
  moving: number;
  neared: boolean;
  pos: Vec2 | null;
  off: number;
  groundId: number | null;
}

export type WakeBeat = 'stir' | 'front' | 'standing';

export interface WakeState {
  elapsed: number;
  rate: number;
  readonly plan: ZoneWake;
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
  readonly heroes: PlayerState[];
  setAside: Equipment | null;
  monsters: MonsterState[];
  spawnedPacks: ZonePack[];
  rankRun: RankRun;
  roused: ZonePack[];
  packReturns: PackTimer[];
  cachesOpened: number[];
  npcs: NpcState[];
  dialogue: DialogueState | null;
  heard: string[];
  quests: Record<string, number>;
  waypoints: string[];
  explored: Record<string, Uint8Array>;
  exploredRevision: number;
  projectiles: ProjectileState[];
  shots: QueuedShot[];
  hazards: HazardState[];
  echoes: EchoState[];
  channels: ChannelState[];
  areas: AreaState[];
  ground: GroundItem[];
  nextId: number;
  nextItemUid: number;
  readonly ledger: LedgerState;
  nextPackId: number;
  surge: number;
  surgeTimer: number | null;
  wake: WakeState | null;
  shift: Vec2;
  trail: Vec2;
  heading: Vec2;
  encounters: EncounterState[];
  shore: ShoreState | null;
  shoreBlocks: GridStamp | null;
  flags: Record<string, string>;
  events: WorldEvent[];
  service: OpenService | null;
  vendors: Record<string, VendorStock>;
  stash: (ItemInstance | null)[];
  purse: number;
  tradeZone: string;
  readonly glitch: GlitchState;
  readonly path: PathLog;
  moments: MomentState[];
  strikeTimer: number;
  strikeMisses: number;
  scene: SceneState | null;
  escort: Escort | null;
  wards: WardState[];
  portal: PortalState | null;
  run: RunState;
  tailwind: TailwindState;
}

export type { ShoreState };
