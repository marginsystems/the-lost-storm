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
