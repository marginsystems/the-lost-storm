export interface MarkDelivery {
  readonly type: 'mark';
  readonly range: number;
  readonly radius: number;
  readonly delay: number;
}

export interface SkillLeap {
  readonly distance: number;
  readonly stopShort: number;
  readonly airTime: number;
}

export interface StalkerBehaviour {
  readonly type: 'stalker';
  readonly orbitRange: number;
}

export interface MonsterPoise {
  readonly knockback: number;
  readonly stagger: number;
  readonly resolve: number;
}

export interface SkillCommit {
  readonly at: number;
  readonly breakStagger: number;
}

export interface GuardDef {
  readonly arcDegrees: number;
  readonly damageTaken: number;
  readonly breakStagger: number;
  readonly breakTime: number;
}

export interface SummonDef {
  readonly monster: string | null;
  readonly count: number;
  readonly cooldown: number;
  readonly limit: number;
}

export interface MonsterModDef {
  readonly id: string;
  readonly prefix: string;
  readonly lifeScale: number;
  readonly damageScale: number;
  readonly speedScale: number;
  readonly sizeScale: number;
  readonly xpScale: number;
  readonly lootScale: number;
  readonly color: string;
  readonly deathSkill: string | null;
  readonly summon: SummonDef | null;
}

export interface ReviveDelivery {
  readonly type: 'revive';
  readonly range: number;
  readonly count: number;
  readonly lifeShare: number;
}

export interface FieldDelivery {
  readonly type: 'field';
  readonly range: number;
  readonly radius: number;
  readonly duration: number;
  readonly slow: number;
}

export interface DormantDef {
  readonly noiseRadius: number;
}

export const REGARDS = ['hostile', 'wary', 'neutral', 'friendly'] as const;
export type Regard = (typeof REGARDS)[number];

export const PLAYER_SIDE: string = 'player';

export interface FactionPalette {
  readonly tints: readonly string[];
  readonly glow: string;
}

export interface FactionDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly palette: FactionPalette;
  readonly wearables: readonly string[];
  readonly weapons: readonly string[];
  readonly regards: Readonly<Record<string, Regard>>;
}
