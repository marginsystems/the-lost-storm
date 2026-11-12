import type { RigClips } from './rig-types.ts';
import type { MomentDef, MomentEcho, MomentField } from './moment-types.ts';
import type { Content, MonsterDef, RarityDef, ZoneDef } from './types.ts';

function poseClips(clips: RigClips): ReadonlySet<string> {
  return new Set<string>(['idle', 'run', 'hit', 'death', ...Object.keys(clips.actions)]);
}

function echoProblems(content: Content, at: string, entry: MomentEcho): string[] {
  const monster: MonsterDef | undefined = content.monsters.get(entry.monster);
  if (monster === undefined) return [`${at} names unknown monster ${entry.monster}`];
  const clips: RigClips | undefined = content.rigs.get(monster.rig)?.clips;
  if (clips === undefined || poseClips(clips).has(entry.pose.clip)) return [];
  return [`${at} poses in clip ${entry.pose.clip}, which rig ${monster.rig} does not have`];
}

function defProblems(content: Content, def: MomentDef): string[] {
  const at: string = `moment ${def.id}`;
  const problems: string[] = [];
  for (const placed of def.props) if (!content.props.has(placed.prop)) problems.push(`${at} places unknown prop ${placed.prop}`);
  def.echoes.forEach((entry: MomentEcho, index: number): void => {
    problems.push(...echoProblems(content, `${at} echo ${index}`, entry));
  });
  const rarity: string | null = def.reward.rarity;
  if (rarity !== null && !content.rarities.some((entry: RarityDef): boolean => entry.id === rarity)) problems.push(`${at} rewards unknown rarity ${rarity}`);
  return problems;
}

function fieldProblems(content: Content, zone: ZoneDef, field: MomentField): string[] {
  const at: string = `zone ${zone.id} moments`;
  const problems: string[] = [];
  for (const entry of field.table) {
    const def: MomentDef | undefined = content.moments.defs.get(entry.moment);
    if (def === undefined) problems.push(`${at} names unknown moment ${entry.moment}`);
  }
  const widthMetres: number = (zone.tiles[0]?.length ?? 0) * zone.cellSize;
  const depthMetres: number = zone.tiles.length * zone.cellSize;
  field.areas.forEach((area, index: number): void => {
    const inside: boolean = area.x >= 0 && area.z >= 0 && area.x <= widthMetres && area.z <= depthMetres;
    if (!inside) problems.push(`${at} area ${index} has its centre outside the zone`);
  });
  return problems;
}

export function momentProblems(content: Content): string[] {
  const problems: string[] = [];
  if (!content.factions.has(content.moments.faction)) problems.push(`moments use unknown faction ${content.moments.faction}`);
  for (const def of content.moments.defs.values()) problems.push(...defProblems(content, def));
  for (const zone of content.zones.values()) if (zone.moments !== null) problems.push(...fieldProblems(content, zone, zone.moments));
  return problems;
}
