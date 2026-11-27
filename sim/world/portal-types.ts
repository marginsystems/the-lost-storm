import type { RankRun } from '../content/rank-types.ts';
import type { ZonePack } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import type { PackTimer } from './pack-return.ts';
import type { GroundItem, MonsterState, RespawnPoint } from './types.ts';

export interface KeptLive {
  readonly type: 'live';
  readonly monsters: MonsterState[];
  readonly spawnedPacks: ZonePack[];
  readonly roused: ZonePack[];
  readonly packReturns: PackTimer[];
  readonly rankRun: RankRun;
  readonly cachesOpened: number[];
  readonly ground: GroundItem[];
}

export interface KeptMonster {
  readonly monster: string;
  readonly group: number;
  readonly level: number;
  readonly x: number;
  readonly z: number;
  readonly life: number;
}

export interface KeptGround {
  readonly discarded?: boolean;
  readonly x: number;
  readonly z: number;
  readonly content: GroundItem['content'];
}

export interface KeptSaved {
  readonly type: 'saved';
  readonly packs: readonly number[];
  readonly roused: readonly number[];
  readonly monsters: readonly KeptMonster[];
  readonly caches: readonly number[];
  readonly ground: readonly KeptGround[];
}

export type KeptZone = KeptLive | KeptSaved;

export interface PortalState {
  readonly zone: string;
  readonly pos: Vec2;
  readonly respawn: RespawnPoint;
  readonly reach: number;
  kept: KeptZone | null;
}

export interface PortalSave {
  readonly zone: string;
  readonly x: number;
  readonly z: number;
  readonly respawn: RespawnPoint;
  readonly reach: number;
  readonly kept: KeptSaved | null;
}

export interface PortalChannelIntent {
  readonly type: 'portal_channel';
  readonly uid: number;
  readonly life: number;
  readonly reach: number;
  left: number;
}

export interface PortalIntent {
  readonly type: 'portal';
}

export interface UseItemCommand {
  readonly type: 'use_item';
  readonly inventoryIndex: number;
}

export interface EnterPortalCommand {
  readonly type: 'enter_portal';
}

export type PortalStage = 'channel' | 'broken' | 'opened' | 'entered' | 'arrived' | 'closed';

export type PortalEndKind = 'out' | 'home';

export interface PortalEnd {
  readonly kind: PortalEndKind;
  readonly zone: string;
  readonly pos: Vec2;
  readonly reach: number;
}
