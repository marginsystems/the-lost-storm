export interface MarkDelivery {
  readonly type: 'mark';
  readonly range: number;
  readonly radius: number;
  readonly delay: number;
  readonly count: number;
  readonly spacing: number;
  readonly step: number;
}

export interface SkillLeap {
  readonly distance: number;
  readonly stopShort: number;
  readonly airTime: number;
  readonly lane: boolean;
}

export interface StalkerBehaviour {
  readonly type: 'stalker';
  readonly orbitRange: number;
}

export interface SwarmBehaviour {
  readonly type: 'swarm';
  readonly ring: number;
}

export interface AmbushBehaviour {
  readonly type: 'ambush';
  readonly spring: number;
}

export interface MonsterPoise {
  readonly knockback: number;
  readonly stagger: number;
  readonly resolve: number;
}

export interface RecoveryDef {
  readonly window: number;
  readonly perHeld: number;
  readonly fade: number;
  readonly interruptRest: number;
  readonly elite: number;
  readonly boss: number;
  readonly stunRest: number;
  readonly stunElite: number;
  readonly stunBoss: number;
  readonly leechElite: number;
  readonly leechBoss: number;
  readonly leechCap: number;
}

export interface SkillEchoing {
  readonly echo: number;
  readonly echoTurn: number;
  readonly echoShare: number;
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

export interface MonsterElement {
  readonly type: 'storm' | 'frost';
  readonly share: number;
  readonly resist: number;
}

export interface MonsterTrail {
  readonly skill: string;
  readonly every: number;
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
  readonly staggerScale: number;
  readonly knockbackScale: number;
  readonly regen: number;
  readonly guard: GuardDef | null;
  readonly element: MonsterElement | null;
  readonly trail: MonsterTrail | null;
  readonly line: string;
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

export interface AlarmDef {
  readonly reach: number;
  readonly cry: number;
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
  readonly palette: FactionPalette;
  readonly wearables: readonly string[];
  readonly weapons: readonly string[];
  readonly regards: Readonly<Record<string, Regard>>;
  readonly unison: UnisonDef | null;
}

export interface UnisonDef {
  readonly sight: number;
  readonly gather: number;
  readonly look: number;
  readonly turn: number;
  readonly flinch: number;
  readonly flinchRange: number;
}

export interface BodyCrust {
  readonly cells: number;
  readonly seam: number;
  readonly strength: number;
  readonly rim: number;
}
