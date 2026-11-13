import type { RigClips, RigDef } from './rig-types.ts';
import type { EchoLook, MomentDef, MomentEcho, MomentField, MomentProp } from './moment-types.ts';
import type { Content, MonsterDef, RarityDef, SkillDef, WearableDef, WearRegion, ZoneDef } from './types.ts';

function poseClips(clips: RigClips): ReadonlySet<string> {
  return new Set<string>(['idle', 'run', 'hit', 'death', ...Object.keys(clips.actions)]);
}

function lookProblems(content: Content, at: string, look: EchoLook, rig: RigDef): string[] {
  const problems: string[] = [];
  for (const held of look.gear) {
    const socket: string | undefined = content.attachments.get(held)?.socket;
    if (socket === undefined) problems.push(`${at} carries unknown attachment ${held}`);
    else if (rig.sockets[socket] === undefined) problems.push(`${at} carries ${held}, but rig ${rig.id} has no socket ${socket}`);
  }
  const regions: Set<WearRegion> = new Set<WearRegion>();
  for (const id of look.wear) {
    const worn: WearableDef | undefined = content.wearables.get(id);
    if (worn === undefined) {
      problems.push(`${at} wears unknown wearable ${id}`);
      continue;
    }
    if (regions.has(worn.region)) problems.push(`${at} wears two pieces on its ${worn.region}`);
    regions.add(worn.region);
  }
  return problems;
}

function echoProblems(content: Content, at: string, entry: MomentEcho): string[] {
  const monster: MonsterDef | undefined = content.monsters.get(entry.monster);
  if (monster === undefined) return [`${at} names unknown monster ${entry.monster}`];
  const rigId: string = entry.look?.rig ?? monster.rig;
  const rig: RigDef | undefined = content.rigs.get(rigId);
  if (rig === undefined) return [`${at} uses unknown rig ${rigId}`];
  const problems: string[] = entry.look === null ? [] : lookProblems(content, at, entry.look, rig);
  if (!poseClips(rig.clips).has(entry.pose.clip)) problems.push(`${at} poses in clip ${entry.pose.clip}, which rig ${rigId} does not have`);
  const skill: SkillDef | undefined = content.skills.get(monster.skill);
  if (entry.turns && skill !== undefined && rig.clips.actions[skill.animation] === undefined) problems.push(`${at} may turn and fight with ${skill.id}, but rig ${rigId} has no action clip ${skill.animation}`);
  return problems;
}

export const MOMENT_PROPS = { blockingMost: 1, centreReach: 1, lowHeight: 0.62 } as const;

function centreProblems(at: string, def: MomentDef): string[] {
  const blocking: MomentProp[] = def.props.filter((placed: MomentProp): boolean => placed.blocks);
  const problems: string[] = blocking.length > MOMENT_PROPS.blockingMost ? [`${at} blocks with ${blocking.length} props, more than ${MOMENT_PROPS.blockingMost}`] : [];
  for (const placed of blocking) if (Math.hypot(placed.x, placed.z) > MOMENT_PROPS.centreReach) problems.push(`${at} blocks with ${placed.prop} off its centre`);
  return problems;
}

function defProblems(content: Content, def: MomentDef): string[] {
  const at: string = `moment ${def.id}`;
  const problems: string[] = [];
  if (!content.surfaces.has(def.ground)) problems.push(`${at} stands on unknown surface ${def.ground}`);
  for (const placed of def.props) if (!content.props.has(placed.prop)) problems.push(`${at} places unknown prop ${placed.prop}`);
  problems.push(...centreProblems(at, def));
  for (const placed of def.props) {
    const height: number | undefined = content.props.get(placed.prop)?.height;
    if (placed.blocks || height === undefined) continue;
    if (height <= 0) problems.push(`${at} places ${placed.prop}, which has no measured height and does not block`);
    else if (height > MOMENT_PROPS.lowHeight) problems.push(`${at} places ${placed.prop}, ${height.toFixed(2)} m tall, which does not block and stands above ${MOMENT_PROPS.lowHeight} m`);
  }
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
  for (const entry of [...field.table, ...field.first]) {
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
