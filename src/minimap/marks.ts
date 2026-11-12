import type { RarityDef, ZoneExit } from '../../sim/content/types.ts';
import { allHold } from '../../sim/world/conditions.ts';
import { isExplored } from '../../sim/world/exploration.ts';
import type { QuestMark } from '../../sim/world/map-marks.ts';
import { questMarks } from '../../sim/world/map-marks.ts';
import type { GroundItem, World } from '../../sim/world/types.ts';
import type { MapMatrix, MapPoint } from './projection.ts';
import { edgeMark, headingOnMap, toMap } from './projection.ts';

export const MARKS = {
  hero: 7,
  monster: 2.2,
  boss: 4.4,
  npc: 3.4,
  loot: 1.9,
  gold: 1.4,
  quest: 4.6,
  questArrow: 6.5,
  exit: 4,
  waypoint: 4.2,
  edgeMargin: 9,
  outline: 1,
  heroColour: '#f3ead8',
  monsterColour: '#d8402f',
  bossColour: '#ff5a2a',
  npcColour: '#9fd8a8',
  questColour: '#e8b866',
  exitColour: '#b9c6d8',
  lockedExitColour: 'rgba(185, 198, 216, 0.38)',
  waypointColour: '#8fe8d0',
  goldColour: '#c9a24e',
  shadowColour: 'rgba(0, 0, 0, 0.85)',
} as const;

export interface MarkOptions {
  readonly width: number;
  readonly height: number;
  readonly unit: number;
  readonly edgeArrows: boolean;
}

function dot(context: CanvasRenderingContext2D, at: MapPoint, radius: number, colour: string): void {
  context.beginPath();
  context.arc(at.x, at.y, radius, 0, Math.PI * 2);
  context.fillStyle = colour;
  context.fill();
  context.stroke();
}

function diamond(context: CanvasRenderingContext2D, at: MapPoint, size: number, colour: string): void {
  context.beginPath();
  context.moveTo(at.x, at.y - size);
  context.lineTo(at.x + size, at.y);
  context.lineTo(at.x, at.y + size);
  context.lineTo(at.x - size, at.y);
  context.closePath();
  context.fillStyle = colour;
  context.fill();
  context.stroke();
}

function arrow(context: CanvasRenderingContext2D, at: MapPoint, angle: number, size: number, colour: string): void {
  context.save();
  context.translate(at.x, at.y);
  context.rotate(angle);
  context.beginPath();
  context.moveTo(size, 0);
  context.lineTo(-size * 0.7, size * 0.62);
  context.lineTo(-size * 0.35, 0);
  context.lineTo(-size * 0.7, -size * 0.62);
  context.closePath();
  context.fillStyle = colour;
  context.fill();
  context.stroke();
  context.restore();
}

function gate(context: CanvasRenderingContext2D, at: MapPoint, size: number, colour: string): void {
  context.beginPath();
  context.rect(at.x - size, at.y - size * 0.55, size * 2, size * 1.1);
  context.fillStyle = colour;
  context.fill();
  context.stroke();
}

function lootColour(world: World, ground: GroundItem): string {
  if (ground.content.kind === 'gold') return MARKS.goldColour;
  const rarity: string = ground.content.item.rarity;
  return world.content.rarities.find((candidate: RarityDef): boolean => candidate.id === rarity)?.color ?? MARKS.goldColour;
}

function visible(at: MapPoint, options: MarkOptions, pad: number): boolean {
  return at.x > -pad && at.y > -pad && at.x < options.width + pad && at.y < options.height + pad;
}

export function drawMarks(context: CanvasRenderingContext2D, matrix: MapMatrix, world: World, options: MarkOptions): void {
  const unit: number = options.unit;
  context.lineWidth = MARKS.outline * unit;
  context.strokeStyle = MARKS.shadowColour;
  context.lineJoin = 'round';
  const zone = world.zone;
  for (const exit of zone.exits) {
    if (!isExplored(world, exit.x, exit.z)) continue;
    const open: boolean = allHold(world, exit.requires);
    if (!open && exit.hiddenWhenLocked) continue;
    const at: MapPoint = toMap(matrix, exit.x, exit.z);
    if (visible(at, options, MARKS.exit * unit)) gate(context, at, MARKS.exit * unit, open ? MARKS.exitColour : MARKS.lockedExitColour);
  }
  const waypoint = zone.waypoint;
  if (waypoint !== null && (isExplored(world, waypoint.x, waypoint.z) || world.waypoints.includes(zone.id))) {
    diamond(context, toMap(matrix, waypoint.x, waypoint.z), MARKS.waypoint * unit, MARKS.waypointColour);
  }
  for (const ground of world.ground) {
    if (!isExplored(world, ground.pos.x, ground.pos.z)) continue;
    const at: MapPoint = toMap(matrix, ground.pos.x, ground.pos.z);
    if (visible(at, options, unit * MARKS.loot)) dot(context, at, (ground.content.kind === 'gold' ? MARKS.gold : MARKS.loot) * unit, lootColour(world, ground));
  }
  for (const npc of world.npcs) {
    if (!isExplored(world, npc.pos.x, npc.pos.z)) continue;
    diamond(context, toMap(matrix, npc.pos.x, npc.pos.z), MARKS.npc * unit, MARKS.npcColour);
  }
  for (const monster of world.monsters) {
    if (!monster.alive || !isExplored(world, monster.pos.x, monster.pos.z)) continue;
    const at: MapPoint = toMap(matrix, monster.pos.x, monster.pos.z);
    if (!visible(at, options, MARKS.boss * unit)) continue;
    const boss: boolean = monster.def.boss !== null;
    dot(context, at, (boss ? MARKS.boss : MARKS.monster) * unit, boss ? MARKS.bossColour : MARKS.monsterColour);
  }
  for (const mark of questMarks(world)) drawQuest(context, matrix, mark, options);
  const hero = world.player;
  arrow(context, toMap(matrix, hero.pos.x, hero.pos.z), headingOnMap(matrix, hero.facing), MARKS.hero * unit, MARKS.heroColour);
}

function drawQuest(context: CanvasRenderingContext2D, matrix: MapMatrix, mark: QuestMark, options: MarkOptions): void {
  const unit: number = options.unit;
  const at: MapPoint = toMap(matrix, mark.pos.x, mark.pos.z);
  const pinned = edgeMark(at, options.width, options.height, MARKS.edgeMargin * unit);
  if (pinned.inside || !options.edgeArrows) {
    diamond(context, at, MARKS.quest * unit, MARKS.questColour);
    context.beginPath();
    context.arc(at.x, at.y, MARKS.quest * unit * 1.9, 0, Math.PI * 2);
    context.strokeStyle = MARKS.questColour;
    context.stroke();
    context.strokeStyle = MARKS.shadowColour;
    return;
  }
  arrow(context, pinned, pinned.angle, MARKS.questArrow * unit, MARKS.questColour);
}

export function exitAt(world: World, x: number, z: number): ZoneExit | null {
  return world.zone.exits.find((exit: ZoneExit): boolean => Math.hypot(exit.x - x, exit.z - z) <= exit.radius && !(exit.hiddenWhenLocked && !allHold(world, exit.requires))) ?? null;
}
