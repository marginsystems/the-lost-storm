import type { DamageType, Delivery, MonsterBehaviour, SkillCategory } from '../content/types.ts';
import { DAMAGE_TYPES, SKILL_CATEGORIES } from '../content/types.ts';

export const SITUATIONS = ['arena', 'duel', 'quest', 'roam'] as const;
export type Situation = (typeof SITUATIONS)[number];

export const ENTITY_KINDS = ['monster', 'rival', 'ally', 'projectile', 'hazard', 'area', 'loot', 'exit', 'npc', 'objective'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const DELIVERY_ORDER: Readonly<Record<Delivery['type'], number>> = { arc: 0, nova: 1, projectile: 2, dash: 3, mark: 4, revive: 5, field: 6, chain: 7, area: 8, blink: 9, beam: 10 };
export const DELIVERY_NAMES: readonly Delivery['type'][] = ['arc', 'nova', 'projectile', 'dash', 'mark', 'revive', 'field', 'chain', 'area', 'blink', 'beam'];

export const BEHAVIOUR_ORDER: Readonly<Record<MonsterBehaviour['type'], number>> = { chaser: 0, ranged: 1, stalker: 2, swarm: 3, ambush: 4, fixed: 5 };
export const BEHAVIOUR_NAMES: readonly MonsterBehaviour['type'][] = ['chaser', 'ranged', 'stalker', 'swarm', 'ambush', 'fixed'];

export const RL = {
  version: 1,
  tick: 1 / 30,
  ticksPerDecision: 4,
  actionParts: 4,
  slots: 6,
  flasks: 2,
  entities: 24,
  targets: 8,
  rays: 16,
  rayReach: 12,
  rayStep: 0.5,
  moveReach: 3,
  distanceScale: 20,
  speedScale: 10,
  timeScale: 10,
  areaScale: 10,
  damageScale: 100,
  levelScale: 30,
  lifeScale: 1000,
  manaScale: 200,
  countScale: 10,
  nearReach: 6,
  clip: 5,
  spareSelf: 8,
  spareSlot: 4,
  spareEntity: 4,
} as const;

function spare(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_unused: unknown, index: number): string => `${prefix}spare_${index}`);
}

function each(prefix: string, names: readonly string[]): string[] {
  return names.map((name: string): string => `${prefix}${name}`);
}

export const FLASK_FEATURES: readonly string[] = ['present', 'charges', 'ready', 'life', 'mana'];

function flaskNames(count: number): string[] {
  return Array.from({ length: count }, (_unused: unknown, index: number): string[] => each(`flask${index}_`, FLASK_FEATURES)).flat();
}

export const SELF_FEATURES: readonly string[] = [
  'life',
  'mana',
  'max_life',
  'max_mana',
  'level',
  'move_speed',
  'armour',
  'crit_chance',
  'damage',
  'attack_speed',
  'acting',
  'phase_windup',
  'phase_channel',
  'phase_recovery',
  'action_left',
  'stagger',
  'rooted',
  'invulnerable',
  'moving',
  'dead',
  ...flaskNames(RL.flasks),
  ...each('situation_', SITUATIONS),
  'objective_has',
  'objective_dx',
  'objective_dz',
  'objective_dist',
  'time_left',
  'foes_alive',
  'foes_near',
  'progress',
  ...spare('', RL.spareSelf),
];

export const SLOT_FEATURES: readonly string[] = [
  'present',
  'ready',
  'cooldown_left',
  'cooldown',
  'mana_cost',
  'affordable',
  'windup',
  'recovery',
  'reach',
  'area',
  'weapon_percent',
  'flat_damage',
  'knockback',
  'stun',
  'stagger',
  'press',
  'duration',
  'count',
  'held',
  ...each('delivery_', DELIVERY_NAMES),
  ...each('category_', SKILL_CATEGORIES),
  ...each('damage_', DAMAGE_TYPES),
  ...spare('', RL.spareSlot),
];

export const ENTITY_FEATURES: readonly string[] = [
  'present',
  ...each('kind_', ENTITY_KINDS),
  'hostile',
  'dx',
  'dz',
  'dist',
  'life',
  'max_life',
  'damage',
  'move_speed',
  'radius',
  'aggro',
  'acting',
  'windup_left',
  'reach',
  'area',
  'boss',
  'rank',
  'stunned',
  'dir_x',
  'dir_z',
  'speed',
  'time_left',
  ...each('behaviour_', BEHAVIOUR_NAMES),
  ...spare('', RL.spareEntity),
];

export const MOVE_CHOICES: number = 9;
export const SKILL_CHOICES: number = RL.slots + 1;
export const FLASK_CHOICES: number = RL.flasks + 1;
export const ACTION_HEADS: readonly number[] = [MOVE_CHOICES, SKILL_CHOICES, RL.targets, FLASK_CHOICES];

export interface ObservationLayout {
  readonly self: number;
  readonly slot: number;
  readonly slots: number;
  readonly entity: number;
  readonly entities: number;
  readonly rays: number;
  readonly size: number;
  readonly mask: number;
}

export const LAYOUT: ObservationLayout = {
  self: SELF_FEATURES.length,
  slot: SLOT_FEATURES.length,
  slots: RL.slots,
  entity: ENTITY_FEATURES.length,
  entities: RL.entities,
  rays: RL.rays,
  size: SELF_FEATURES.length + SLOT_FEATURES.length * RL.slots + ENTITY_FEATURES.length * RL.entities + RL.rays,
  mask: ACTION_HEADS.reduce((sum: number, choices: number): number => sum + choices, 0),
};

export interface Action {
  readonly move: number;
  readonly skill: number;
  readonly target: number;
  readonly flask: number;
}

export const NO_ACTION: Action = { move: 0, skill: 0, target: 0, flask: 0 };

export interface ContractShape {
  readonly version: number;
  readonly fingerprint: string;
  readonly layout: ObservationLayout;
  readonly heads: readonly number[];
  readonly self: readonly string[];
  readonly slot: readonly string[];
  readonly entity: readonly string[];
  readonly situations: readonly Situation[];
  readonly tick: number;
  readonly ticksPerDecision: number;
}

function hashText(text: string): string {
  let hash: number = 0x811c9dc5;
  for (let index: number = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

export function contractShape(): ContractShape {
  const names: string = [SELF_FEATURES, SLOT_FEATURES, ENTITY_FEATURES, ACTION_HEADS.map(String), [JSON.stringify(RL), JSON.stringify(DELIVERY_ORDER), JSON.stringify(BEHAVIOUR_ORDER)]].map((list: readonly string[]): string => list.join(',')).join('|');
  return {
    version: RL.version,
    fingerprint: hashText(names),
    layout: LAYOUT,
    heads: ACTION_HEADS,
    self: SELF_FEATURES,
    slot: SLOT_FEATURES,
    entity: ENTITY_FEATURES,
    situations: SITUATIONS,
    tick: RL.tick,
    ticksPerDecision: RL.ticksPerDecision,
  };
}

export function categoryIndex(category: SkillCategory): number {
  return SKILL_CATEGORIES.indexOf(category);
}

export function damageIndex(type: DamageType): number {
  return DAMAGE_TYPES.indexOf(type);
}
