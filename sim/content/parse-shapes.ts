import { conditions } from './parse-conditions.ts';
import type { Fields } from './read.ts';
import { choice, ContentError, each, fields, flag, fraction, nonNegative, positive, share, text } from './read.ts';
import type { BeamDelivery, BlinkDelivery, BrandDef, BurnDef, ChainDelivery, AreaAnchor, AreaAura, AreaDelivery, AreaExposure, AreaStoke, MomentumDef, MomentumSpend, MomentumTier, PressDef, SkillUnlock, SoakDef } from './shape-types.ts';
import { AREA_ANCHORS } from './shape-types.ts';
import { skillMod, skillTarget, statMod } from './parse-mods.ts';
import type { Content, SkillBinding, SkillDef, SkillTreeNodeDef } from './types.ts';

export const SHAPE_LIMITS = {
  shortestPulse: 0.1,
  shortestInterval: 0.05,
} as const;

export const SHAPE_TYPES = ['chain', 'area', 'blink', 'beam'] as const;
export type ShapeType = (typeof SHAPE_TYPES)[number];
export type ShapeDelivery = ChainDelivery | AreaDelivery | BlinkDelivery | BeamDelivery;

function whole(source: Fields, key: string, where: string): number {
  const value: number = nonNegative(source, key, where);
  if (!Number.isInteger(value)) throw new ContentError(`${where}.${key}`, 'expected a whole number');
  return value;
}

function stokeOf(value: unknown, where: string): AreaStoke {
  const source: Fields = fields(value, where);
  return { perPulse: positive(source, 'perPulse', where), max: positive(source, 'max', where) };
}

function exposure(value: unknown, where: string): AreaExposure {
  const source: Fields = fields(value, where);
  return { target: skillTarget(source, where), value: positive(source, 'value', where) };
}

function auraOf(value: unknown, where: string): AreaAura {
  const source: Fields = fields(value, where);
  const aura: AreaAura = {
    statMods: source['statMods'] === undefined ? [] : each(source['statMods'], `${where}.statMods`, statMod),
    skillMods: source['skillMods'] === undefined ? [] : each(source['skillMods'], `${where}.skillMods`, skillMod),
    exposes: source['exposes'] === undefined ? [] : each(source['exposes'], `${where}.exposes`, exposure),
  };
  if (aura.statMods.length + aura.skillMods.length + aura.exposes.length === 0) throw new ContentError(where, 'expected an aura that changes something');
  return aura;
}

function area(source: Fields, where: string): AreaDelivery {
  const duration: number = positive(source, 'duration', where);
  const pulse: number = nonNegative(source, 'pulse', where);
  if (pulse > duration) throw new ContentError(`${where}.pulse`, `expected at most the duration ${duration}`);
  if (pulse > 0 && pulse < SHAPE_LIMITS.shortestPulse) throw new ContentError(`${where}.pulse`, `expected 0 or at least ${SHAPE_LIMITS.shortestPulse} seconds`);
  const stoke: AreaStoke | null = source['stoke'] === undefined ? null : stokeOf(source['stoke'], `${where}.stoke`);
  if (stoke !== null && pulse === 0) throw new ContentError(`${where}.stoke`, 'expected an area that pulses');
  const length: number = source['length'] === undefined ? 0 : nonNegative(source, 'length', where);
  const anchor: AreaAnchor = choice(source, 'anchor', AREA_ANCHORS, where);
  const pull: number = nonNegative(source, 'pull', where);
  if (length > 0 && anchor !== 'ground') throw new ContentError(`${where}.length`, 'expected a lane to lie on the ground');
  if (length > 0 && pull > 0) throw new ContentError(`${where}.length`, 'expected a lane that does not pull');
  const fork = source['fork'] === undefined ? null : fields(source['fork'], `${where}.fork`);
  const opening: boolean = source['opening'] === undefined ? false : flag(source, 'opening', where);
  if (fork !== null && (length === 0 || !opening)) throw new ContentError(`${where}.fork`, 'expected a lane that hits on opening');
  const degrees: number = fork === null ? 0 : positive(fork, 'degrees', `${where}.fork`);
  if (degrees >= 90) throw new ContentError(`${where}.fork.degrees`, 'expected two forward-facing branches');
  const pushForward: boolean = source['pushForward'] === undefined ? false : flag(source, 'pushForward', where);
  if (pushForward && length === 0) throw new ContentError(`${where}.pushForward`, 'expected a lane with a direction to push along');
  const blocks: boolean = source['blocks'] === undefined ? false : flag(source, 'blocks', where);
  if (blocks && length === 0) throw new ContentError(`${where}.blocks`, 'expected only a lane to block the way');
  const slam: string | null = source['slam'] === undefined ? null : text(source, 'slam', where);
  if (slam !== null && !blocks) throw new ContentError(`${where}.slam`, 'expected only a lane that blocks the way to be slammed into');
  const aura: AreaAura | null = source['aura'] === undefined ? null : auraOf(source['aura'], `${where}.aura`);
  if (aura !== null && anchor !== 'caster') throw new ContentError(`${where}.aura`, 'expected an aura to stand around its caster');
  return {
    type: 'area',
    range: nonNegative(source, 'range', where),
    radius: positive(source, 'radius', where),
    duration,
    pulse,
    pull,
    slow: fraction(source, 'slow', where),
    weaken: source['weaken'] === undefined ? 0 : share(source, 'weaken', where),
    anchor,
    opening,
    ...(fork === null ? {} : { fork: { degrees, length: nonNegative(fork, 'length', `${where}.fork`) } }),
    stoke,
    length,
    pushForward,
    blocks,
    slam,
    aura,
  };
}

export function shapeDelivery(type: ShapeType, source: Fields, where: string): ShapeDelivery {
  switch (type) {
    case 'chain':
      return { type, range: positive(source, 'range', where), jumps: whole(source, 'jumps', where), jumpRange: positive(source, 'jumpRange', where), falloff: fraction(source, 'falloff', where) };
    case 'area':
      return area(source, where);
    case 'blink':
      return { type, range: positive(source, 'range', where), radius: nonNegative(source, 'radius', where) };
    case 'beam':
      return { type, range: positive(source, 'range', where), width: positive(source, 'width', where) };
  }
  throw new ContentError(`${where}.type`, 'unknown delivery shape');
}

function pressHint(source: Fields, where: string): string | null {
  return source['hint'] === undefined ? null : text(source, 'hint', where);
}

function press(value: unknown, where: string): PressDef | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const type: PressDef['type'] = choice(source, 'type', ['charge', 'channel', 'travel'] as const, where);
  if (type === 'travel') return { type, max: positive(source, 'max', where), move: positive(source, 'move', where), hint: pressHint(source, where) };
  if (type === 'channel') {
    const interval: number = positive(source, 'interval', where);
    if (interval < SHAPE_LIMITS.shortestInterval) throw new ContentError(`${where}.interval`, `expected at least ${SHAPE_LIMITS.shortestInterval} seconds`);
    const move: number = source['move'] === undefined ? 0 : fraction(source, 'move', where);
    const strafe: boolean = source['strafe'] !== undefined && flag(source, 'strafe', where);
    if (strafe && move === 0) throw new ContentError(where, 'a strafing channel needs a movement speed');
    return { type, interval, max: positive(source, 'max', where), move, ...(strafe ? { strafe } : {}), passThrough: source['passThrough'] === undefined ? false : flag(source, 'passThrough', where), hint: pressHint(source, where) };
  }
  return { type, max: positive(source, 'max', where), damageScale: positive(source, 'damageScale', where), areaScale: positive(source, 'areaScale', where), hint: pressHint(source, where) };
}

function brand(value: unknown, where: string): BrandDef | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { duration: positive(source, 'duration', where), burst: text(source, 'burst', where) };
}

function momentumTier(value: unknown, where: string): MomentumTier {
  const source: Fields = fields(value, where);
  return { at: positive(source, 'at', where), turn: positive(source, 'turn', where), reach: positive(source, 'reach', where) };
}

function momentum(value: unknown, where: string): MomentumDef | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const cap: number = positive(source, 'cap', where);
  const steady: number = nonNegative(source, 'steady', where);
  if (steady > cap) throw new ContentError(`${where}.steady`, `expected at most the cap ${cap}`);
  const tiers: MomentumTier[] = each(source['tiers'], `${where}.tiers`, momentumTier);
  tiers.forEach((tier: MomentumTier, index: number): void => {
    const before: MomentumTier | undefined = tiers[index - 1];
    if (tier.at > cap) throw new ContentError(`${where}.tiers`, `a step at ${tier.at} is past the cap ${cap}`);
    if (before !== undefined && (tier.at <= before.at || tier.turn < before.turn || tier.reach < before.reach)) throw new ContentError(`${where}.tiers`, 'steps must rise in order');
  });
  return {
    perHit: positive(source, 'perHit', where),
    cap,
    grace: nonNegative(source, 'grace', where),
    drain: positive(source, 'drain', where),
    steady,
    manaPerHit: nonNegative(source, 'manaPerHit', where),
    lifePerHit: nonNegative(source, 'lifePerHit', where),
    tiers,
  };
}

function burn(value: unknown, where: string): BurnDef | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const duration: number = positive(source, 'duration', where);
  const tick: number = positive(source, 'tick', where);
  if (tick < SHAPE_LIMITS.shortestInterval) throw new ContentError(`${where}.tick`, `expected at least ${SHAPE_LIMITS.shortestInterval} seconds`);
  if (tick > duration) throw new ContentError(`${where}.tick`, `expected at most the duration ${duration}`);
  return { duration, tick, share: fraction(source, 'share', where) };
}

function soak(value: unknown, where: string): SoakDef | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { tempo: fraction(source, 'tempo', where), duration: positive(source, 'duration', where) };
}

function spend(value: unknown, where: string): MomentumSpend | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { damage: nonNegative(source, 'damage', where), area: nonNegative(source, 'area', where), range: nonNegative(source, 'range', where), stun: source['stun'] === undefined ? 0 : nonNegative(source, 'stun', where) };
}

export interface SkillPress {
  readonly press: PressDef | null;
  readonly brand: BrandDef | null;
  readonly momentum: MomentumDef | null;
  readonly burn: BurnDef | null;
  readonly soak: SoakDef | null;
  readonly spend: MomentumSpend | null;
  readonly spent: number;
}

export function skillPress(source: Fields, where: string): SkillPress {
  return { press: press(source['press'], `${where}.press`), brand: brand(source['brand'], `${where}.brand`), momentum: momentum(source['momentum'], `${where}.momentum`), burn: burn(source['burn'], `${where}.burn`), soak: soak(source['soak'], `${where}.soak`), spend: spend(source['spend'], `${where}.spend`), spent: 0 };
}

export function shapeProblems(content: Content): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(problem);
  };
  for (const used of content.skills.values()) {
    if (used.press !== null) need(used.leap === null && used.delivery.type !== 'dash' && used.delivery.type !== 'blink', `skill ${used.id} moves the caster, so it cannot be held`);
    if (used.press?.type === 'channel') need(used.combo === null && used.leap === null, `skill ${used.id} is channelled, so it cannot combo or leap`);
    if (used.momentum !== null) need(used.press?.type === 'channel', `skill ${used.id} builds momentum, so it must be channelled`);
    if (used.spend !== null) need(used.momentum === null && used.press === null, `skill ${used.id} spends momentum, so it can neither build it nor be held`);
    if (used.brand === null) continue;
    const burst: SkillDef | undefined = content.skills.get(used.brand.burst);
    need(burst !== undefined, `skill ${used.id} brands with unknown burst skill ${used.brand.burst}`);
    if (burst !== undefined) need(burst.delivery.type === 'nova' && burst.brand === null, `skill ${used.id} brands with ${burst.id}, which must be a nova that brands nothing itself`);
  }
  return problems;
}

export function skillUnlock(value: unknown, where: string): SkillUnlock {
  const source: Fields = fields(value, where);
  const level: number = positive(source, 'level', where);
  if (!Number.isInteger(level)) throw new ContentError(`${where}.level`, 'expected a whole level');
  return { skill: text(source, 'skill', where), level, when: conditions(source, 'when', where) };
}

export function bookProblems(content: Content): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(problem);
  };
  const book: ReadonlyMap<string, number> = new Map<string, number>(content.player.skillBook.map((entry: SkillUnlock): [string, number] => [entry.skill, entry.level]));
  need(book.size === content.player.skillBook.length, 'skill book lists a skill twice');
  const slotted: string[] = content.player.skillBar.flatMap((binding: SkillBinding): string[] => (binding.skill === null ? [] : [binding.skill]));
  need(new Set<string>(slotted).size === slotted.length, 'skill bar starts with a skill in two slots');
  need(content.player.skillBook.some((entry: SkillUnlock): boolean => entry.level === 1 && entry.when.length === 0), 'skill book teaches nothing at the start');
  const unlocks: string[] = content.skillTree.flatMap((node: SkillTreeNodeDef): string[] => (node.unlock === null ? [] : [node.unlock]));
  for (const binding of content.player.skillBar) {
    if (binding.whenLearned === true) need(binding.skill !== null, 'a slot that opens on learning needs a home skill');
    if (binding.skill !== null) need(book.has(binding.skill) || unlocks.includes(binding.skill), `skill bar keeps a home slot for unknown unlock ${binding.skill}`);
  }
  need(new Set<string>(unlocks).size === unlocks.length, 'two chart places unlock the same skill');
  for (const skill of unlocks) {
    need(content.skills.has(skill), `a chart place unlocks unknown skill ${skill}`);
    need(!book.has(skill), `a chart place unlocks ${skill}, which the skill book already grants`);
    need(content.skills.get(skill)?.category !== 'none', `${skill} is unlocked on the chart but has no category`);
  }
  return problems;
}
