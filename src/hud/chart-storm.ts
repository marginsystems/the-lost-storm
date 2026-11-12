import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import type { ChartPoint } from './chart-model.ts';

export const CHART_STORM = {
  boltStep: 0.5,
  boltJag: 0.12,
  nearEye: 0.001,
} as const;

export interface ArmShape {
  readonly base: number;
  readonly reach: number;
}

export type Colour = readonly [number, number, number];

function hash(text: string): number {
  let value: number = 2166136261;
  for (let index: number = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}

function wobble(seed: number, index: number): number {
  const mixed: number = hash(`${seed}:${index}`);
  return (mixed / 4294967295) * 2 - 1;
}

function turn(angle: number): number {
  return angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));
}

export function boltPoints(from: ChartPoint, to: ChartPoint, eye: ChartPoint, key: string, unit: number): ChartPoint[] {
  const fromRadius: number = Math.hypot(from.x - eye.x, from.y - eye.y);
  const toRadius: number = Math.hypot(to.x - eye.x, to.y - eye.y);
  const toAngle: number = Math.atan2(to.y - eye.y, to.x - eye.x);
  const fromAngle: number = fromRadius < CHART_STORM.nearEye * unit ? toAngle : Math.atan2(from.y - eye.y, from.x - eye.x);
  const endAngle: number = toRadius < CHART_STORM.nearEye * unit ? fromAngle : toAngle;
  const sweep: number = turn(endAngle - fromAngle);
  const length: number = Math.abs(toRadius - fromRadius) + Math.abs(sweep) * Math.max(fromRadius, toRadius);
  const segments: number = Math.max(2, Math.round(length / (CHART_STORM.boltStep * unit)));
  const seed: number = hash(key);
  const points: ChartPoint[] = [from];
  for (let index: number = 1; index < segments; index += 1) {
    const share: number = index / segments;
    const radius: number = fromRadius + (toRadius - fromRadius) * share + wobble(seed, index) * CHART_STORM.boltJag * unit;
    const angle: number = fromAngle + sweep * share;
    points.push({ x: eye.x + Math.max(0, radius) * Math.cos(angle), y: eye.y + Math.max(0, radius) * Math.sin(angle) });
  }
  points.push(to);
  return points;
}

export function armShape(content: Content, path: string): ArmShape {
  const twist: number = content.chart.twist;
  const own: readonly SkillTreeNodeDef[] = content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.path === path);
  let cos: number = 0;
  let sin: number = 0;
  let reach: number = 0;
  for (const node of own) {
    const radius: number = Math.hypot(node.column, node.row);
    const untwisted: number = Math.atan2(node.row, node.column) - twist * radius;
    cos += Math.cos(untwisted);
    sin += Math.sin(untwisted);
    reach = Math.max(reach, radius);
  }
  return { base: Math.atan2(sin, cos), reach };
}

export function spiralOffset(shape: ArmShape, twist: number, at: ChartPoint): number {
  return turn(Math.atan2(at.y, at.x) - shape.base - twist * Math.hypot(at.x, at.y));
}

function channel(part: string | undefined): number {
  return Number.parseInt(part ?? 'ff', 16) / 255;
}

export function hexColour(text: string): Colour {
  const match: RegExpExecArray | null = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
  if (match === null) return [1, 1, 1];
  return [channel(match[1]), channel(match[2]), channel(match[3])];
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function polyline(points: readonly ChartPoint[]): string {
  return points.map((point: ChartPoint): string => `${round(point.x)},${round(point.y)}`).join(' ');
}
