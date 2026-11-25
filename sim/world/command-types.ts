import type { GlitchKind } from '../content/glitches.ts';
import type { ItemSlot } from '../content/types.ts';
import type { ReplayCommand } from './dialogue-types.ts';
import type { Vec2 } from '../math.ts';
import type { PurseCommand } from './ledger.ts';
import type { ItemPlace } from './service-types.ts';
import type { BenchCommand, SpawnCommand } from './dev-commands.ts';
import type { EnterPortalCommand, UseItemCommand } from './portal-types.ts';
import type { SetOutCommand } from './run-types.ts';

export interface MoveCommand {
  readonly type: 'move';
  readonly held: boolean;
  readonly dest: Vec2;
}

export interface WalkCommand {
  readonly type: 'walk';
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

export interface StopCommand { readonly type: 'stop' }

export interface HeroCommand {
  readonly type: 'hero';
  readonly hero: string;
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

export interface ArrangeCommand {
  readonly type: 'arrange';
  readonly from: number;
  readonly to: number;
}

export interface SlotCommand {
  readonly type: 'slot';
  readonly slot: number;
  readonly skill: string | null;
}

export interface AllocateCommand {
  readonly type: 'allocate';
  readonly node: string;
}

export interface RefundCommand {
  readonly type: 'refund';
  readonly node: string;
}

export interface RespecCommand { readonly type: 'respec' }

export interface ChooseChangeCommand {
  readonly type: 'choose_change';
  readonly skill: string;
  readonly becomes: string;
}

export interface TravelCommand {
  readonly type: 'travel';
  readonly exit: string;
}

export interface TalkCommand {
  readonly type: 'talk';
  readonly npcId: number;
}

export interface AdvanceCommand { readonly type: 'advance' }

export interface HoldCommand {
  readonly type: 'hold';
  readonly slot: number;
  readonly down: boolean;
}

export interface SteerCommand {
  readonly type: 'steer';
  readonly aim: Vec2;
}

export interface FlaskCommand {
  readonly type: 'flask';
  readonly slot: number;
}

export interface TeleportCommand {
  readonly type: 'teleport';
  readonly zone: string;
}

export interface LeaveDuelCommand { readonly type: 'leave_duel' }

export type RespawnChoice = 'checkpoint' | 'town';

export interface RespawnCommand {
  readonly type: 'respawn';
  readonly choice: RespawnChoice;
}

export interface StrikeCommand {
  readonly type: 'strike';
  readonly at: Vec2;
  readonly moment: string | null;
}

export interface UseCommand {
  readonly type: 'use';
  readonly prop: number;
}

export interface OpenChest {
  readonly type: 'open';
  readonly momentId: number;
}

export type TradeAction =
  | { readonly type: 'buy'; readonly index: number }
  | { readonly type: 'sell'; readonly inventoryIndex: number }
  | { readonly type: 'buy_back'; readonly index: number }
  | { readonly type: 'buy_good'; readonly index: number }
  | { readonly type: 'upgrade_flask'; readonly flask: string }
  | { readonly type: 'stash'; readonly inventoryIndex: number }
  | { readonly type: 'unstash'; readonly index: number }
  | { readonly type: 'identify'; readonly place: ItemPlace; readonly index: number }
  | { readonly type: 'identify_all' }
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

export interface GlitchCommand {
  readonly type: 'glitch';
  readonly kind: GlitchKind;
}

export interface GlitchSettingCommand {
  readonly type: 'glitch_setting';
  readonly enabled: boolean;
}

export interface Routed {
  readonly by?: number;
}

export type Command = (HeroCommand | StrikeCommand | SpawnCommand | BenchCommand | SlotCommand | HoldCommand | SteerCommand | GlitchCommand | GlitchSettingCommand | ReadCommand | MoveCommand | WalkCommand | SkillCommand | PickupCommand | StopCommand | EquipCommand | UnequipCommand | DropCommand | ArrangeCommand | AllocateCommand | RefundCommand | RespecCommand | ChooseChangeCommand | TravelCommand | TalkCommand | AdvanceCommand | ReplayCommand | TeleportCommand | RespawnCommand | LeaveDuelCommand | FlaskCommand | UseCommand | OpenChest | TradeCommand | PurseCommand | UseItemCommand | EnterPortalCommand | SetOutCommand) & Routed;
