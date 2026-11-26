import type { RarityDef } from '../../sim/content/types.ts';
import { allHold } from '../../sim/world/conditions.ts';
import { exitShown } from '../../sim/world/exits.ts';
import { isExplored } from '../../sim/world/exploration.ts';
import type { EncounterMark, QuestMark } from '../../sim/world/map-marks.ts';
import { encounterMarks, questMarks } from '../../sim/world/map-marks.ts';
import { questPins } from '../../sim/world/quest-pins.ts';
import type { QuestPin } from '../../sim/world/quest-pins.ts';
import type { GroundItem, MomentState, World } from '../../sim/world/types.ts';
import type { MapMatrix, MapPoint, MapRadii } from './projection.ts';
import { edgeMark, headingOnMap, mapRadii, toMap } from './projection.ts';

export const MARKS = {
  hero: 7,
  monster: 2.2,
  boss: 4.4,
  npc: 3.4,
  loot: 1.9,
  gold: 1.4,
  quest: 4.6,
  questArrow: 6.5,
  bangTop: 1.25,
  bangFoot: 0.35,
  bangWidth: 0.34,
  bangTaper: 0.55,
  bangDot: 0.3,
  bangDotAt: 0.85,
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
  momentFill: 0.28,
  momentEdge: 0.85,
  momentMarkScale: 0.45,
  labelSize: 9,
  labelInset: 15,
  labelFont: '"Alegreya Sans", system-ui, sans-serif',
  labelOutline: 3,
  placeLabelSize: 6,
  placeLabelGap: 1.6,
  placeLabelColour: '#efe6d6',
  waypointLabel: 'Waypoint',
} as const;

export interface MarkOptions {
  readonly width: number;
  readonly height: number;
  readonly unit: number;
  readonly edgeArrows: boolean;
  readonly labels: boolean;
  readonly characters?: readonly MapCharacter[];
}

export interface MapCharacter {
  readonly name: string;
  readonly x: number;
  readonly z: number;
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

function bang(context: CanvasRenderingContext2D, at: MapPoint, size: number, colour: string): void {
  const top: number = at.y - size * MARKS.bangTop;
  const foot: number = at.y + size * MARKS.bangFoot;
  const half: number = size * MARKS.bangWidth;
  context.beginPath();
  context.moveTo(at.x - half, top);
  context.lineTo(at.x + half, top);
  context.lineTo(at.x + half * MARKS.bangTaper, foot);
  context.lineTo(at.x - half * MARKS.bangTaper, foot);
  context.closePath();
  context.moveTo(at.x + size * MARKS.bangDot, at.y + size * MARKS.bangDotAt);
  context.arc(at.x, at.y + size * MARKS.bangDotAt, size * MARKS.bangDot, 0, Math.PI * 2);
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

function momentShown(world: World, moment: MomentState): number {
  switch (moment.phase) {
    case 'mark':
      return MARKS.momentMarkScale + (1 - MARKS.momentMarkScale) * Math.min(1, moment.phaseTime / world.content.moments.telegraph);
    case 'dormant':
    case 'awake':
      return 1;
    case 'fading':
      return Math.max(0, 1 - moment.phaseTime / world.content.moments.fade);
  }
  return 1;
}

function drawMoment(context: CanvasRenderingContext2D, matrix: MapMatrix, world: World, moment: MomentState): void {
  const at: MapPoint = toMap(matrix, moment.pos.x, moment.pos.z);
  const shown: number = momentShown(world, moment);
  const radii: MapRadii = mapRadii(matrix, moment.def.radius * (moment.phase === 'fading' ? 1 : shown));
  context.save();
  context.beginPath();
  context.ellipse(at.x, at.y, radii.horizontal, radii.vertical, 0, 0, Math.PI * 2);
  context.globalAlpha = MARKS.momentFill * shown;
  context.fillStyle = moment.def.tint;
  context.fill();
  context.globalAlpha = MARKS.momentEdge * shown;
  context.strokeStyle = moment.def.tint;
  context.stroke();
  context.restore();
}

function lootColour(world: World, ground: GroundItem): string {
  if (ground.content.kind === 'gold') return MARKS.goldColour;
  const rarity: string = ground.content.item.rarity;
  return world.content.rarities.find((candidate: RarityDef): boolean => candidate.id === rarity)?.color ?? MARKS.goldColour;
}

export type LabelSide = 'above' | 'below';

export interface LabelSpot {
  readonly x: number;
  readonly y: number;
  readonly side: LabelSide;
}

export interface LabelSize {
  readonly width: number;
  readonly height: number;
  readonly offset: number;
}

export function labelSpot(at: MapPoint, size: LabelSize, side: LabelSide, options: MarkOptions): LabelSpot {
  const half: number = size.width / 2;
  const x: number = half * 2 >= options.width ? options.width / 2 : Math.min(options.width - half, Math.max(half, at.x));
  const fitsBelow: boolean = at.y + size.offset + size.height <= options.height;
  const fitsAbove: boolean = at.y - size.offset - size.height >= 0;
  const chosen: LabelSide = side === 'below' ? (fitsBelow || !fitsAbove ? 'below' : 'above') : fitsAbove || !fitsBelow ? 'above' : 'below';
  return { x, y: chosen === 'below' ? at.y + size.offset : at.y - size.offset, side: chosen };
}

function placeLabel(context: CanvasRenderingContext2D, at: MapPoint, reach: number, side: LabelSide, text: string, options: MarkOptions): void {
  const unit: number = options.unit;
  context.save();
  context.font = `600 ${MARKS.placeLabelSize * unit}px ${MARKS.labelFont}`;
  context.textAlign = 'center';
  const size: LabelSize = { width: context.measureText(text).width + MARKS.labelOutline * 2, height: MARKS.placeLabelSize * unit, offset: reach + MARKS.placeLabelGap * unit };
  const spot: LabelSpot = labelSpot(at, size, side, options);
  context.textBaseline = spot.side === 'below' ? 'top' : 'bottom';
  context.lineWidth = MARKS.labelOutline;
  context.strokeStyle = MARKS.shadowColour;
  context.strokeText(text, spot.x, spot.y);
  context.fillStyle = MARKS.placeLabelColour;
  context.fillText(text, spot.x, spot.y);
  context.restore();
}

function pointTo(context: CanvasRenderingContext2D, at: MapPoint, options: MarkOptions, colour: string): void {
  const pinned = edgeMark(at, options.width, options.height, MARKS.edgeMargin * options.unit);
  arrow(context, pinned, pinned.angle, MARKS.questArrow * options.unit, colour);
}

function visible(at: MapPoint, options: MarkOptions, pad: number): boolean {
  return at.x > -pad && at.y > -pad && at.x < options.width + pad && at.y < options.height + pad;
}

export function placeShown(at: MapPoint, options: MarkOptions, radius: number): boolean {
  return visible(at, options, options.labels ? -radius : radius);
}

export function drawMarks(context: CanvasRenderingContext2D, matrix: MapMatrix, world: World, options: MarkOptions): void {
  const unit: number = options.unit;
  context.lineWidth = MARKS.outline * unit;
  context.strokeStyle = MARKS.shadowColour;
  context.lineJoin = 'round';
  const zone = world.zone;
  const found: EncounterMark[] = encounterMarks(world);
  const foundExits: ReadonlySet<string | null> = new Set<string | null>(found.map((mark: EncounterMark): string | null => mark.exit));
  const foundGround: ReadonlySet<number | null> = new Set<number | null>(found.map((mark: EncounterMark): number | null => mark.ground));
  for (const exit of zone.exits) {
    if (foundExits.has(exit.id)) continue;
    if (!isExplored(world, exit.x, exit.z)) continue;
    if (!exitShown(world, exit)) continue;
    const open: boolean = allHold(world, exit.requires);
    const at: MapPoint = toMap(matrix, exit.x, exit.z);
    if (!placeShown(at, options, MARKS.exit * unit)) {
      if (options.labels) pointTo(context, at, options, open ? MARKS.exitColour : MARKS.lockedExitColour);
      continue;
    }
    gate(context, at, MARKS.exit * unit, open ? MARKS.exitColour : MARKS.lockedExitColour);
    const name: string | undefined = world.content.zones.get(exit.to)?.name;
    if (options.labels && name !== undefined) placeLabel(context, at, MARKS.exit * unit * 0.55, 'below', name, options);
  }
  const waypoint = zone.waypoint;
  if (waypoint !== null && (isExplored(world, waypoint.x, waypoint.z) || world.waypoints.includes(zone.id))) {
    const at: MapPoint = toMap(matrix, waypoint.x, waypoint.z);
    if (placeShown(at, options, MARKS.waypoint * unit)) {
      diamond(context, at, MARKS.waypoint * unit, MARKS.waypointColour);
      if (options.labels) placeLabel(context, at, MARKS.waypoint * unit, 'above', MARKS.waypointLabel, options);
    } else if (options.labels) pointTo(context, at, options, MARKS.waypointColour);
  }
  for (const moment of world.moments) drawMoment(context, matrix, world, moment);
  for (const ground of world.ground) {
    if (foundGround.has(ground.id)) continue;
    if (!isExplored(world, ground.pos.x, ground.pos.z)) continue;
    const at: MapPoint = toMap(matrix, ground.pos.x, ground.pos.z);
    if (visible(at, options, unit * MARKS.loot)) dot(context, at, (ground.content.kind === 'gold' ? MARKS.gold : MARKS.loot) * unit, lootColour(world, ground));
  }
  const pins: readonly QuestPin[] = questPins(world);
  for (const npc of world.npcs) {
    if (!isExplored(world, npc.pos.x, npc.pos.z)) continue;
    const at: MapPoint = toMap(matrix, npc.pos.x, npc.pos.z);
    if (pins.some((pin: QuestPin): boolean => pin.kind === 'npc' && pin.npcId === npc.id)) bang(context, at, MARKS.quest * unit, MARKS.questColour);
    else diamond(context, at, MARKS.npc * unit, MARKS.npcColour);
  }
  for (const character of options.characters ?? []) {
    if (!isExplored(world, character.x, character.z)) continue;
    const at: MapPoint = toMap(matrix, character.x, character.z);
    if (visible(at, options, MARKS.npc * unit)) diamond(context, at, MARKS.npc * unit, MARKS.npcColour);
  }
  for (const monster of world.monsters) {
    if (!monster.alive || !isExplored(world, monster.pos.x, monster.pos.z)) continue;
    const at: MapPoint = toMap(matrix, monster.pos.x, monster.pos.z);
    if (!visible(at, options, MARKS.boss * unit)) continue;
    const boss: boolean = monster.def.boss !== null;
    dot(context, at, (boss ? MARKS.boss : MARKS.monster) * unit, boss ? MARKS.bossColour : MARKS.monsterColour);
  }
  for (const mark of found) drawFound(context, matrix, mark, world, options);
  for (const mark of questMarks(world)) drawQuest(context, matrix, mark, options);
  const hero = world.player;
  arrow(context, toMap(matrix, hero.pos.x, hero.pos.z), headingOnMap(matrix, hero.facing), MARKS.hero * unit, MARKS.heroColour);
}

function drawQuest(context: CanvasRenderingContext2D, matrix: MapMatrix, mark: QuestMark, options: MarkOptions): void {
  const unit: number = options.unit;
  const at: MapPoint = toMap(matrix, mark.pos.x, mark.pos.z);
  const pinned = edgeMark(at, options.width, options.height, MARKS.edgeMargin * unit);
  if (pinned.inside || !options.edgeArrows) {
    bang(context, at, MARKS.quest * unit, MARKS.questColour);
    context.beginPath();
    context.arc(at.x, at.y, MARKS.quest * unit * 1.9, 0, Math.PI * 2);
    context.strokeStyle = MARKS.questColour;
    context.stroke();
    context.strokeStyle = MARKS.shadowColour;
    return;
  }
  arrow(context, pinned, pinned.angle, MARKS.questArrow * unit, MARKS.questColour);
}

function drawFound(context: CanvasRenderingContext2D, matrix: MapMatrix, mark: EncounterMark, world: World, options: MarkOptions): void {
  const unit: number = options.unit;
  const at: MapPoint = toMap(matrix, mark.pos.x, mark.pos.z);
  const pinned = edgeMark(at, options.width, options.height, MARKS.edgeMargin * unit);
  const colour: string = mark.kind === 'item' ? MARKS.questColour : mark.open ? MARKS.exitColour : MARKS.lockedExitColour;
  if (pinned.inside || !options.edgeArrows) {
    if (mark.kind === 'item') diamond(context, at, MARKS.quest * unit, colour);
    else gate(context, at, MARKS.exit * unit, colour);
    return;
  }
  arrow(context, pinned, pinned.angle, MARKS.questArrow * unit, colour);
  const metres: number = Math.round(Math.hypot(mark.pos.x - world.player.pos.x, mark.pos.z - world.player.pos.z));
  const inward: number = MARKS.labelInset * unit;
  const x: number = pinned.x - Math.cos(pinned.angle) * inward;
  const y: number = pinned.y - Math.sin(pinned.angle) * inward;
  context.save();
  context.font = `${MARKS.labelSize * unit}px ${MARKS.labelFont}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = MARKS.labelOutline * unit;
  context.strokeStyle = MARKS.shadowColour;
  context.strokeText(String(metres), x, y);
  context.fillStyle = colour;
  context.fillText(String(metres), x, y);
  context.restore();
}
