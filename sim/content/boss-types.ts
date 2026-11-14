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

export interface BossFirstKill {
  readonly flag: string;
  readonly xpShare: number;
  readonly goldMin: number;
  readonly goldMax: number;
}

export interface BossDef {
  readonly title: string;
  readonly phases: readonly BossPhase[];
  readonly poise: BossPoise;
  readonly drop: BossDrop;
  readonly firstKill: BossFirstKill | null;
  readonly barks: BossBarks;
}
