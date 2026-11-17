export interface BossSkill {
  readonly skill: string;
  readonly weight: number;
}

export interface BossAnchor {
  readonly monster: string;
  readonly radius: number;
}

export interface BossPhase {
  readonly below: number;
  readonly skills: readonly BossSkill[];
  readonly barks: readonly string[];
  readonly measure: readonly string[];
  readonly beat: number;
  readonly holds: readonly string[];
  readonly unseal: readonly string[];
  readonly anchor: BossAnchor | null;
}

export interface PieceStrikes {
  readonly count: number;
  readonly gap: number;
}

export interface CountBreak {
  readonly stagger: number;
  readonly open: number;
  readonly damageTaken: number;
}

export interface BossPoise {
  readonly knockback: number;
}

export interface BossDrop {
  readonly items: number;
  readonly floor: string;
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
  readonly countBreak: CountBreak | null;
  readonly yields: boolean;
  readonly presence: BossPresence | null;
}

export interface BossPresence {
  readonly color: string;
  readonly radius: number;
  readonly glow: number;
}
