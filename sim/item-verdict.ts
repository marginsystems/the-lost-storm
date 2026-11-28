import type { ChartPath, Content, DamageType, ItemBaseDef, ItemSlot, ResistedType, SkillDef, SkillTreeNodeDef, StatBlock, StatId, WeaponGroup } from './content/types.ts';
import { DAMAGE_TYPES } from './content/types.ts';
import { isUnidentified } from './identify.ts';
import { baseOf, slotOf } from './items.ts';
import { familyReading, wornPowers, wornVariants } from './powers.ts';
import type { FamilyReading } from './powers.ts';
import { computeStats, damagePerSecond, damageTakenScale, effectiveAttackSpeed, resistanceOf, resolveSkillBar, skillCycle } from './stats.ts';
import type { Threat, ThreatZone } from './threat.ts';
import { partOf, shareOf } from './threat.ts';
import { heldGroup, placeBound, placeLive, weaponGroup } from './weapons.ts';
import type { Equipment, ItemInstance, PlayerState } from './world/types.ts';

export const VERDICT = {
  even: 0.02,
  clear: 0.02,
  tradeBand: 0.25,
  fightSeconds: 10,
  sharpSpeed: 0.1,
  absent: 0.001,
  leastTaken: 0.005,
  move: 0.02,
} as const;

export const RESISTED_STATS: Readonly<Record<ResistedType, StatId>> = {
  storm: 'stormResist',
  frost: 'frostResist',
};

export const OUTSIDE_VERDICT: readonly StatId[] = ['goldFind'];

const RESISTED: readonly ResistedType[] = ['storm', 'frost'];

export type VerdictKind = 'better' | 'worse' | 'trade' | 'same' | 'switch';

export interface Peak {
  readonly types: readonly ResistedType[];
  readonly zone: string;
  readonly ahead: boolean;
  readonly toughness: number;
}

export interface PowerGain {
  readonly name: string;
  readonly count: number;
  readonly of: number;
}

export interface SkillChange {
  readonly from: string;
  readonly to: string;
}

export interface WeaponSwitch {
  readonly needs: string;
  readonly path: string;
  readonly places: number;
  readonly becomes: readonly SkillChange[];
  readonly fresh: number;
}

export interface Verdict {
  readonly kind: VerdictKind;
  readonly scored: VerdictKind;
  readonly power: number;
  readonly damage: number;
  readonly toughness: number;
  readonly here: number;
  readonly ahead: number | null;
  readonly speed: number;
  readonly move: number;
  readonly gained: PowerGain | null;
  readonly lost: string | null;
  readonly switched: WeaponSwitch | null;
  readonly against: readonly ResistedType[];
  readonly peaks: readonly Peak[];
  readonly absent: readonly ResistedType[];
  readonly looksAhead: boolean;
  readonly capped: readonly ResistedType[];
}

export type VerdictSubject = Pick<PlayerState, 'level' | 'equipped' | 'allocated' | 'bar' | 'changes'>;

export interface Build {
  readonly stats: StatBlock;
  readonly skills: readonly (SkillDef | null)[];
}

export interface Standing {
  readonly damage: number;
  readonly toughness: number;
  readonly lead: SkillDef | null;
}

export function buildOf(content: Content, subject: VerdictSubject, equipped: Equipment): Build {
  const held: string | null = heldGroup(content, equipped);
  return {
    stats: computeStats(content, subject.level, equipped, subject.allocated, [], held),
    skills: resolveSkillBar(content, subject.bar, subject.allocated, wornPowers(content, equipped), wornVariants(content, equipped), held, subject.changes, subject.level),
  };
}

function deals(skill: SkillDef): boolean {
  return skill.delivery.type !== 'dash' && (skill.damage.weaponPercent > 0 || skill.damage.flatMax > 0);
}

function manaGain(stats: StatBlock, skill: SkillDef): number {
  return stats.manaRegen + (skill.momentum === null ? 0 : skill.momentum.manaPerHit / skillCycle(stats, skill));
}

export function fightDamage(stats: StatBlock, skill: SkillDef, fallback: number): number {
  const full: number = damagePerSecond(stats, skill);
  if (skill.manaCost <= 0) return full;
  const spend: number = skill.manaCost / skillCycle(stats, skill);
  const gain: number = manaGain(stats, skill);
  if (gain >= spend) return full;
  const dry: number = Math.min(VERDICT.fightSeconds, Math.max(0, stats.maxMana) / (spend - gain));
  const after: number = Math.max(full * (Math.max(0, gain) / spend), fallback);
  return (full * dry + after * (VERDICT.fightSeconds - dry)) / VERDICT.fightSeconds;
}

function lead(build: Build): { readonly skill: SkillDef | null; readonly damage: number } {
  const dealing: SkillDef[] = build.skills.filter((skill: SkillDef | null): skill is SkillDef => skill !== null && deals(skill));
  const free: number = dealing.filter((skill: SkillDef): boolean => skill.manaCost <= 0).reduce((best: number, skill: SkillDef): number => Math.max(best, damagePerSecond(build.stats, skill)), 0);
  return dealing.reduce(
    (best: { readonly skill: SkillDef | null; readonly damage: number }, skill: SkillDef) => {
      const damage: number = fightDamage(build.stats, skill, free);
      return damage > best.damage ? { skill, damage } : best;
    },
    { skill: null, damage: 0 },
  );
}

export function takenScale(content: Content, stats: StatBlock, threat: Threat): number {
  const rules = content.player.resistance;
  const taken: number = threat.zones.reduce((sum: number, zone: ThreatZone): number => sum + zone.weight * DAMAGE_TYPES.reduce((inner: number, type: DamageType): number => inner + zone.mix[type] * damageTakenScale(stats, type, rules, zone.stormTier), 0), 0);
  return Math.max(VERDICT.leastTaken, taken);
}

function lifeGain(stats: StatBlock, skill: SkillDef | null): number {
  if (skill === null) return 0;
  const perHit: number = skill.lifeOnHit + (skill.momentum === null ? 0 : skill.momentum.lifePerHit);
  return perHit / skillCycle(stats, skill);
}

export function effectiveLife(content: Content, stats: StatBlock, skill: SkillDef | null, threat: Threat): number {
  const pool: number = stats.maxLife + (stats.lifeRegen + lifeGain(stats, skill)) * VERDICT.fightSeconds;
  return Math.max(0, pool) / takenScale(content, stats, threat);
}

export function standingOf(content: Content, build: Build, threat: Threat): Standing {
  const best = lead(build);
  return { damage: best.damage, toughness: effectiveLife(content, build.stats, best.skill, threat), lead: best.skill };
}

function change(after: number, before: number): number {
  if (before <= 0) return after > 0 ? 1 : 0;
  return after / before - 1;
}

function kindOf(power: number, damage: number, toughness: number): VerdictKind {
  const traded: boolean = (damage > VERDICT.clear && toughness < -VERDICT.clear) || (damage < -VERDICT.clear && toughness > VERDICT.clear);
  const band: number = traded ? Math.max(VERDICT.even, VERDICT.tradeBand * Math.min(Math.abs(damage), Math.abs(toughness))) : VERDICT.even;
  if (traded && Math.abs(power) <= band) return 'trade';
  if (power > VERDICT.even) return 'better';
  if (power < -VERDICT.even) return 'worse';
  return 'same';
}

function withResistance(stats: StatBlock, from: StatBlock): StatBlock {
  const kept: StatBlock = { ...stats };
  for (const type of RESISTED) kept[RESISTED_STATS[type]] = from[RESISTED_STATS[type]];
  return kept;
}

function lookedAhead(power: number, here: number, ahead: number | null, damage: number, toughness: number): VerdictKind {
  if (ahead !== null) {
    const upHere: boolean = here > VERDICT.even;
    const downHere: boolean = here < -VERDICT.even;
    const upAhead: boolean = ahead > VERDICT.even;
    const downAhead: boolean = ahead < -VERDICT.even;
    if ((downHere && upAhead) || (upHere && downAhead)) return 'trade';
    if (downHere && downAhead) return 'worse';
    if (upHere && upAhead) return 'better';
  }
  return kindOf(power, damage, toughness);
}

function lifeChange(content: Content, before: Build, after: Build, threat: Threat | null): number | null {
  if (threat === null) return null;
  return change(standingOf(content, after, threat).toughness, standingOf(content, before, threat).toughness);
}

function noGain(content: Content, before: Build, after: Build, threat: Threat, type: ResistedType): boolean {
  const rules = content.player.resistance;
  return threat.zones.every((zone: ThreatZone): boolean => zone.mix[type] < VERDICT.absent || resistanceOf(after.stats, type, rules, zone.stormTier) <= resistanceOf(before.stats, type, rules, zone.stormTier) + VERDICT.absent);
}

function only(zone: ThreatZone): Threat {
  return { zones: [{ ...zone, weight: 1 }] };
}

function peaksOf(content: Content, before: Build, after: Build, threat: Threat, types: readonly ResistedType[]): Peak[] {
  const peaks: Peak[] = [];
  for (const type of types) {
    const top: ThreatZone | undefined = threat.zones.toSorted((a: ThreatZone, b: ThreatZone): number => b.mix[type] - a.mix[type])[0];
    if (top === undefined) continue;
    const known: Peak | undefined = peaks.find((peak: Peak): boolean => peak.zone === top.name && peak.ahead === top.ahead);
    if (known === undefined) peaks.push({ types: [type], zone: top.name, ahead: top.ahead, toughness: lifeChange(content, before, after, only(top)) ?? 0 });
    else peaks[peaks.indexOf(known)] = { ...known, types: [...known.types, type] };
  }
  return peaks;
}

function settled(verdict: Verdict): VerdictKind {
  if (verdict.switched !== null && verdict.damage < -VERDICT.clear && verdict.switched.fresh > VERDICT.clear) return 'switch';
  if (verdict.scored === 'trade') return 'trade';
  const up: boolean = verdict.scored === 'better' || verdict.move >= VERDICT.move || verdict.gained !== null;
  const down: boolean = verdict.scored === 'worse' || verdict.move <= -VERDICT.move || verdict.lost !== null;
  if (up && down) return 'trade';
  if (up) return 'better';
  if (down) return 'worse';
  return verdict.scored;
}

function settle(verdict: Verdict): Verdict {
  return { ...verdict, kind: settled(verdict) };
}

export function compareBuilds(content: Content, before: Build, after: Build, threat: Threat): Verdict {
  const was: Standing = standingOf(content, before, threat);
  const now: Standing = standingOf(content, after, threat);
  const damage: number = change(now.damage, was.damage);
  const toughness: number = change(now.toughness, was.toughness);
  const power: number = change(now.damage * now.toughness, was.damage * was.toughness);
  const nearby: Threat | null = partOf(threat, false);
  const beyond: Threat | null = partOf(threat, true);
  const here: number = lifeChange(content, before, after, nearby) ?? toughness;
  const ahead: number | null = nearby === null ? null : lifeChange(content, before, after, beyond);
  const powerOf = (life: number): number => (1 + damage) * (1 + life) - 1;
  const raised: ResistedType[] = RESISTED.filter((type: ResistedType): boolean => after.stats[RESISTED_STATS[type]] > before.stats[RESISTED_STATS[type]] + VERDICT.absent);
  const moved: ResistedType[] = RESISTED.filter((type: ResistedType): boolean => Math.abs(after.stats[RESISTED_STATS[type]] - before.stats[RESISTED_STATS[type]]) > VERDICT.absent);
  const absent: ResistedType[] = raised.filter((type: ResistedType): boolean => shareOf(threat, type) < VERDICT.absent);
  const capped: ResistedType[] = raised.filter((type: ResistedType): boolean => !absent.includes(type) && noGain(content, before, after, threat, type));
  const open: ResistedType[] = raised.filter((type: ResistedType): boolean => !absent.includes(type) && !capped.includes(type));
  const bare: number = effectiveLife(content, withResistance(after.stats, before.stats), now.lead, threat);
  const fromResistance: number = change(now.toughness, bare);
  const resistanceLed: boolean = Math.abs(fromResistance) >= VERDICT.clear && Math.sign(fromResistance) === Math.sign(toughness) && Math.abs(fromResistance) * 2 >= Math.abs(toughness);
  const against: ResistedType[] = resistanceLed ? moved.filter((type: ResistedType): boolean => shareOf(threat, type) >= VERDICT.absent) : [];
  const scored: VerdictKind = lookedAhead(power, powerOf(here), ahead === null ? null : powerOf(ahead), damage, toughness);
  return settle({
    kind: scored,
    scored,
    power,
    damage,
    toughness,
    here,
    ahead,
    speed: change(effectiveAttackSpeed(after.stats), effectiveAttackSpeed(before.stats)),
    move: change(after.stats.moveSpeed, before.stats.moveSpeed),
    gained: null,
    lost: null,
    switched: null,
    against,
    peaks: peaksOf(content, before, after, threat, open),
    absent,
    looksAhead: beyond !== null,
    capped,
  });
}

function powerGain(content: Content, item: ItemInstance, base: ItemBaseDef, swapped: Equipment): PowerGain {
  const family: FamilyReading | null = familyReading(content, item, swapped);
  return family === null ? { name: base.name, count: 1, of: 1 } : { name: family.name, count: family.count, of: family.pieces.length };
}

function powerName(content: Content, base: ItemBaseDef | null): string | null {
  if (base === null || base.power === null) return null;
  return content.families.get(base.power.family)?.name ?? base.name;
}

function pathName(content: Content, group: WeaponGroup): string {
  const path: ChartPath | undefined = content.chart.paths.find((entry: ChartPath): boolean => entry.id === group.path);
  return (path?.name ?? group.name).replace(/^the\s+/i, '');
}

function switchOf(content: Content, subject: VerdictSubject, swapped: Equipment, before: Build, after: Build, threat: Threat): WeaponSwitch | null {
  const was: WeaponGroup | null = weaponGroup(content, heldGroup(content, subject.equipped) ?? '');
  const now: WeaponGroup | null = weaponGroup(content, heldGroup(content, swapped) ?? '');
  if (was === null || now === null || was.id === now.id) return null;
  const places: number = content.skillTree.filter((node: SkillTreeNodeDef): boolean => subject.allocated.includes(node.id) && placeBound(node) && placeLive(node, was.id) && !placeLive(node, now.id)).length;
  const becomes: SkillChange[] = before.skills.flatMap((skill: SkillDef | null, index: number): SkillChange[] => {
    const next: SkillDef | null = after.skills[index] ?? null;
    return skill === null || next === null || skill.form === next.form ? [] : [{ from: skill.name, to: next.name }];
  });
  if (places === 0 && becomes.length === 0) return null;
  const bare: VerdictSubject = { ...subject, allocated: [], changes: {} };
  const fresh: number = change(standingOf(content, buildOf(content, bare, swapped), threat).damage, standingOf(content, buildOf(content, bare, subject.equipped), threat).damage);
  return { needs: now.needs, path: pathName(content, was), places, becomes, fresh };
}

export function itemVerdict(content: Content, subject: VerdictSubject, threat: Threat, item: ItemInstance): Verdict | null {
  const slot: ItemSlot | null = slotOf(content, item);
  const base: ItemBaseDef | null = baseOf(content, item);
  if (slot === null || base === null || isUnidentified(item)) return null;
  const replaced: ItemInstance | null = subject.equipped[slot];
  const swapped: Equipment = { ...subject.equipped, [slot]: item };
  const before: Build = buildOf(content, subject, subject.equipped);
  const after: Build = buildOf(content, subject, swapped);
  const scored: Verdict = compareBuilds(content, before, after, threat);
  const changed: boolean = replaced === null || replaced.base !== item.base;
  return settle({
    ...scored,
    gained: changed && base.power !== null ? powerGain(content, item, base, swapped) : null,
    lost: changed && replaced !== null ? powerName(content, baseOf(content, replaced)) : null,
    switched: switchOf(content, subject, swapped, before, after, threat),
  });
}

function percent(value: number): number {
  return Math.round(value * 100);
}

function signedPercent(value: number): string {
  const rounded: number = percent(value);
  return `${rounded < 0 ? '−' : '+'}${Math.abs(rounded)}%`;
}

function listed(types: readonly string[]): string {
  if (types.length <= 1) return types.join('');
  return `${types.slice(0, -1).join(', ')} and ${types[types.length - 1] ?? ''}`;
}

interface Part {
  readonly value: number;
  readonly text: string;
}

function split(verdict: Verdict): Part | null {
  if (verdict.ahead === null) return null;
  const here: number = percent(verdict.here);
  const ahead: number = percent(verdict.ahead);
  if (here === 0 || ahead === 0 || Math.sign(here) === Math.sign(ahead)) return null;
  const gainAhead: boolean = ahead > 0;
  const gain: string = gainAhead ? `${signedPercent(verdict.ahead)} ahead` : `${signedPercent(verdict.here)} here`;
  const loss: string = gainAhead ? `${signedPercent(verdict.here)} here` : `${signedPercent(verdict.ahead)} ahead`;
  return { value: Math.max(verdict.here, verdict.ahead), text: `toughness ${gain}, ${loss}` };
}

export function verdictParts(verdict: Verdict): readonly string[] {
  const parts: Part[] = [];
  if (percent(verdict.damage) !== 0) parts.push({ value: verdict.damage, text: `${signedPercent(verdict.damage)} damage` });
  const divided: Part | null = split(verdict);
  if (divided !== null) parts.push(divided);
  else if (percent(verdict.toughness) !== 0) {
    const against: string = verdict.against.length === 0 ? '' : ` against ${listed(verdict.against)}`;
    parts.push({ value: verdict.toughness, text: `${signedPercent(verdict.toughness)} toughness${against}` });
  }
  if (Math.abs(verdict.speed) >= VERDICT.sharpSpeed && percent(verdict.speed) !== 0) parts.push({ value: verdict.speed, text: `${signedPercent(verdict.speed)} attack speed` });
  if (Math.abs(verdict.move) >= VERDICT.move && percent(verdict.move) !== 0) parts.push({ value: verdict.move, text: `${signedPercent(verdict.move)} movement speed` });
  const gained: PowerGain | null = verdict.gained;
  const powers: string[] = [];
  if (gained !== null) powers.push(gained.of > 1 ? `${gained.name} power, ${gained.count}/${gained.of} worn` : `${gained.name} power`);
  if (verdict.lost !== null) powers.push(`loses the ${verdict.lost} power`);
  return [...parts.toSorted((a: Part, b: Part): number => b.value - a.value).map((part: Part): string => part.text), ...powers];
}

export function placeName(zone: string): string {
  const head: string = zone.split(',')[0]?.trim() ?? zone;
  return `the ${head.replace(/^the\s+/i, '')}`;
}

function peakText(peak: Peak): string {
  const verb: string = peak.types.length > 1 ? 'hit' : 'hits';
  if (!peak.ahead) return `${listed(peak.types)} ${verb} hardest here`;
  const there: string = percent(peak.toughness) === 0 ? '' : `: ${signedPercent(peak.toughness)} toughness there`;
  return `${listed(peak.types)} ${verb} hardest in ${placeName(peak.zone)}${there}`;
}

function switchText(switched: WeaponSwitch): string {
  const losses: string[] = [];
  if (switched.places > 0) losses.push(`${switched.places} ${switched.path} ${switched.places === 1 ? 'place stops' : 'places stop'} adding damage`);
  for (const skill of switched.becomes) losses.push(`${skill.from} becomes ${skill.to}`);
  const fresh: string = percent(switched.fresh) === 0 ? '' : ` · ${signedPercent(switched.fresh)} damage on an unspent tree`;
  return `with ${switched.needs} ${listed(losses)}${fresh}`;
}

export function verdictNote(verdict: Verdict): string | null {
  const notes: string[] = [];
  if (verdict.switched !== null) notes.push(switchText(verdict.switched));
  const peak: Peak | undefined = verdict.peaks[0];
  if (peak !== undefined) notes.push(peakText(peak));
  if (verdict.absent.length > 0) notes.push(`no ${listed(verdict.absent)} ${verdict.looksAhead ? 'here or ahead' : 'nearby'}`);
  if (verdict.capped.length > 0) notes.push(`${listed(verdict.capped)} resistance already capped`);
  if (notes.length === 0) return null;
  const text: string = notes.join(' · ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
