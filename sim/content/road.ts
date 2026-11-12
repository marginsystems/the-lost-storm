import { isFloorCell } from '../nav/layout.ts';
import type { RetiredZones, ZoneDrift } from './road-types.ts';
import type { Condition, Content, ObjectiveDef, PathObjective, QuestDef, ZoneCheckpoint, ZoneDef, ZoneExit } from './types.ts';

export function objectivePaths(objective: ObjectiveDef): readonly PathObjective[] {
  return objective.type === 'either' ? objective.paths : [objective];
}

export function roadFlagNames(content: Content): string[] {
  const names: string[] = [];
  for (const zone of content.zones.values()) for (const trigger of zone.triggers) names.push(...Object.keys(trigger.sets));
  for (const quest of content.quests.values()) {
    for (const objective of quest.objectives) {
      names.push(...Object.keys(objective.sets));
      for (const path of objectivePaths(objective)) if (path !== objective) names.push(...Object.keys(path.sets));
    }
  }
  if (content.world.retired !== null) names.push(...Object.keys(content.world.retired.flags));
  names.push(...Object.keys(content.moments.cleared));
  return names;
}

export function conditionProblems(content: Content, flags: ReadonlySet<string>, holder: string, list: readonly Condition[]): string[] {
  const problems: string[] = [];
  for (const entry of list) {
    if (entry.type === 'flag') {
      if (!flags.has(entry.flag)) problems.push(`${holder} names flag ${entry.flag}, which nothing sets`);
      continue;
    }
    if (entry.type === 'visited') {
      if (!content.zones.has(entry.zone)) problems.push(`${holder} names unknown zone ${entry.zone}`);
      continue;
    }
    if (entry.type !== 'quest' && entry.type !== 'objective') continue;
    const questDef: QuestDef | undefined = content.quests.get(entry.quest);
    if (questDef === undefined) problems.push(`${holder} names unknown quest ${entry.quest}`);
    else if (entry.type === 'objective' && !questDef.objectives.some((candidate: ObjectiveDef): boolean => candidate.id === entry.objective)) problems.push(`${holder} names unknown objective ${entry.quest}.${entry.objective}`);
  }
  return problems;
}

function pathProblems(content: Content, at: string, path: PathObjective): string[] {
  let problem: string | null = null;
  switch (path.type) {
    case 'talk':
      if (!content.npcs.has(path.npc)) problem = `${at} names unknown npc ${path.npc}`;
      break;
    case 'reach':
      if (!content.zones.has(path.zone)) problem = `${at} names unknown zone ${path.zone}`;
      break;
    case 'defeat':
      if (!content.monsters.has(path.monster)) problem = `${at} names unknown monster ${path.monster}`;
      break;
    case 'moment':
      if (![...content.zones.values()].some((zone): boolean => zone.moments?.combat === true)) problem = `${at} needs a zone whose moments can be fought`;
      break;
  }
  return problem === null ? [] : [problem];
}

interface Anchor {
  readonly name: string;
  readonly x: number;
  readonly z: number;
}

function driftProblems(zone: ZoneDef, drift: ZoneDrift): string[] {
  const problems: string[] = [];
  for (let row: number = drift.row; row < drift.row + drift.rows; row += 1) {
    for (let column: number = drift.column; column < drift.column + drift.columns; column += 1) {
      if (!isFloorCell(zone, column, row)) problems.push(`zone ${zone.id} drift ${drift.id} covers cell ${column},${row}, which is not floor`);
    }
  }
  const covers = (x: number, z: number): boolean => {
    const column: number = Math.floor(x / zone.cellSize);
    const row: number = Math.floor(z / zone.cellSize);
    return column >= drift.column && column < drift.column + drift.columns && row >= drift.row && row < drift.row + drift.rows;
  };
  const anchors: Anchor[] = [
    { name: 'the player start', x: zone.playerStart.x, z: zone.playerStart.z },
    ...zone.exits.flatMap((exit: ZoneExit): Anchor[] => [
      { name: `exit ${exit.id}`, x: exit.x, z: exit.z },
      { name: `exit ${exit.id} arrival`, x: exit.arrival.x, z: exit.arrival.z },
    ]),
    ...zone.checkpoints.map((checkpoint: ZoneCheckpoint): Anchor => ({ name: `checkpoint ${checkpoint.id}`, x: checkpoint.x, z: checkpoint.z })),
    ...(zone.waypoint === null ? [] : [{ name: 'the waypoint', x: zone.waypoint.x, z: zone.waypoint.z }]),
  ];
  for (const anchor of anchors) if (covers(anchor.x, anchor.z)) problems.push(`zone ${zone.id} drift ${drift.id} covers ${anchor.name}, which must stay on firm ground`);
  return problems;
}

function overlaps(a: ZoneDrift, b: ZoneDrift): boolean {
  return a.column < b.column + b.columns && b.column < a.column + a.columns && a.row < b.row + b.rows && b.row < a.row + a.rows;
}

export function roadProblems(content: Content, flags: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  for (const zone of content.zones.values()) {
    for (const drift of zone.drifts) problems.push(...driftProblems(zone, drift));
    zone.drifts.forEach((drift: ZoneDrift, index: number): void => {
      for (const other of zone.drifts.slice(index + 1)) if (overlaps(drift, other)) problems.push(`zone ${zone.id} drifts ${drift.id} and ${other.id} overlap; a cell drifts with one patch only`);
    });
    for (const trigger of zone.triggers) problems.push(...conditionProblems(content, flags, `zone ${zone.id} trigger ${trigger.id}`, trigger.when));
    if (zone.kind === 'void' && (zone.drifts.length > 0 || zone.triggers.length > 0)) problems.push(`zone ${zone.id} is a void: it cannot hold drifts or triggers`);
  }
  for (const quest of content.quests.values()) {
    for (const objective of quest.objectives) {
      const at: string = `quest ${quest.id} objective ${objective.id}`;
      problems.push(...conditionProblems(content, flags, at, objective.when));
      for (const path of objectivePaths(objective)) {
        const where: string = path === objective ? at : `${at} path ${path.id}`;
        if (path !== objective) problems.push(...conditionProblems(content, flags, where, path.when));
        problems.push(...pathProblems(content, where, path));
      }
    }
  }
  for (const act of content.world.acts) if (act.end !== null) problems.push(...conditionProblems(content, flags, `act ${act.id} end`, act.end.when));
  const retired: RetiredZones | null = content.world.retired;
  if (retired !== null) {
    if (!content.zones.has(retired.to)) problems.push(`retired zones lead to unknown zone ${retired.to}`);
    for (const id of retired.zones) if (content.zones.has(id)) problems.push(`zone ${id} is retired but still exists`);
  }
  return problems;
}
