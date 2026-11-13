export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ArrowPlacement {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface ArrowView {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly gap: number;
  readonly blockers: readonly Rect[];
  readonly hints: readonly Rect[];
}

export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

export type Projector = (x: number, y: number, z: number) => Point | null;

const ARROW_GEOMETRY = {
  probe: 1,
  passes: 8,
  epsilon: 1e-6,
  turnRate: 7,
} as const;

export function bearingOf(from: GroundPoint, to: GroundPoint): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function easeBearing(current: number | null, wanted: number, dt: number): number {
  if (current === null) return wanted;
  const delta: number = Math.atan2(Math.sin(wanted - current), Math.cos(wanted - current));
  return current + delta * (1 - Math.exp(-ARROW_GEOMETRY.turnRate * dt));
}

export function insideInset(point: Point, view: ArrowView): boolean {
  return point.x >= view.margin && point.x <= view.width - view.margin && point.y >= view.margin && point.y <= view.height - view.margin;
}

function edgeDistance(origin: number, step: number, low: number, high: number): number {
  if (step > 0) return (high - origin) / step;
  if (step < 0) return (low - origin) / step;
  return Infinity;
}

function entry(origin: number, step: number, low: number, high: number): number {
  if (step === 0) return origin >= low && origin <= high ? -Infinity : Infinity;
  return Math.min((low - origin) / step, (high - origin) / step);
}

function contains(rect: Rect, point: Point): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function grown(rect: Rect, by: number): Rect {
  return { left: rect.left - by, top: rect.top - by, right: rect.right + by, bottom: rect.bottom + by };
}

function inView(point: Point, view: ArrowView): boolean {
  return point.x >= view.margin - ARROW_GEOMETRY.epsilon && point.x <= view.width - view.margin + ARROW_GEOMETRY.epsilon && point.y >= view.margin - ARROW_GEOMETRY.epsilon && point.y <= view.height - view.margin + ARROW_GEOMETRY.epsilon;
}

type Axis = 'x' | 'y';

function slidOff(point: Point, along: Axis, zone: Rect): Point[] {
  return along === 'x' ? [{ x: zone.left, y: point.y }, { x: zone.right, y: point.y }] : [{ x: point.x, y: zone.top }, { x: point.x, y: zone.bottom }];
}

function overlaps(low: number, high: number, from: number, to: number): boolean {
  return Math.max(low, Math.min(from, to)) < Math.min(high, Math.max(from, to)) - ARROW_GEOMETRY.epsilon;
}

function crosses(rect: Rect, from: Point, to: Point): boolean {
  const spanX: boolean = from.x === to.x ? from.x > rect.left + ARROW_GEOMETRY.epsilon && from.x < rect.right - ARROW_GEOMETRY.epsilon : overlaps(rect.left, rect.right, from.x, to.x);
  const spanY: boolean = from.y === to.y ? from.y > rect.top + ARROW_GEOMETRY.epsilon && from.y < rect.bottom - ARROW_GEOMETRY.epsilon : overlaps(rect.top, rect.bottom, from.y, to.y);
  return spanX && spanY;
}

function clearOfHints(point: Point, along: Axis, view: ArrowView, blockers: readonly Rect[]): Point {
  let placed: Point = point;
  for (let pass = 0; pass < ARROW_GEOMETRY.passes; pass++) {
    const zone: Rect | undefined = view.hints.map((rect: Rect): Rect => grown(rect, rect.bottom - rect.top + view.gap)).find((rect: Rect): boolean => contains(rect, placed));
    if (zone === undefined) return placed;
    const from: Point = placed;
    const nearest: Point | undefined = slidOff(from, along, zone).toSorted((a: Point, b: Point): number => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
    if (nearest === undefined || !inView(nearest, view) || blockers.some((rect: Rect): boolean => crosses(rect, from, nearest))) return placed;
    placed = nearest;
  }
  return placed;
}

export function arrowAlong(origin: Point, direction: Point, view: ArrowView): ArrowPlacement | null {
  const length: number = Math.hypot(direction.x, direction.y);
  if (length === 0) return null;
  const ux: number = direction.x / length;
  const uy: number = direction.y / length;
  const start: Point = {
    x: Math.min(view.width - view.margin, Math.max(view.margin, origin.x)),
    y: Math.min(view.height - view.margin, Math.max(view.margin, origin.y)),
  };
  const sideReach: number = edgeDistance(start.x, ux, view.margin, view.width - view.margin);
  const rowReach: number = edgeDistance(start.y, uy, view.margin, view.height - view.margin);
  let reach: number = Math.max(0, Math.min(sideReach, rowReach));
  let along: Axis = rowReach <= sideReach ? 'x' : 'y';
  const blockers: readonly Rect[] = view.blockers.map((rect: Rect): Rect => grown(rect, view.gap));
  const at = (distance: number): Point => ({ x: start.x + ux * distance, y: start.y + uy * distance });
  for (let pass = 0; pass < ARROW_GEOMETRY.passes; pass++) {
    let moved: boolean = false;
    for (const rect of blockers) {
      if (!contains(rect, at(reach))) continue;
      const throughSide: number = entry(start.x, ux, rect.left, rect.right);
      const throughRow: number = entry(start.y, uy, rect.top, rect.bottom);
      const enter: number = Math.max(throughSide, throughRow);
      if (enter >= 0 && enter < reach - ARROW_GEOMETRY.epsilon) {
        reach = enter;
        along = throughRow >= throughSide ? 'x' : 'y';
        moved = true;
      }
    }
    if (!moved) break;
  }
  const point: Point = clearOfHints(at(reach), along, view, blockers);
  return { x: point.x, y: point.y, angle: Math.atan2(uy, ux) };
}

export function arrowToward(project: Projector, from: GroundPoint, to: GroundPoint, bearing: number, floor: number, view: ArrowView): ArrowPlacement | null {
  const target: Point | null = project(to.x, floor, to.z);
  if (target !== null && insideInset(target, view)) return null;
  if (to.x === from.x && to.z === from.z) return null;
  const origin: Point | null = project(from.x, floor, from.z);
  const probe: Point | null = project(from.x + Math.sin(bearing) * ARROW_GEOMETRY.probe, floor, from.z + Math.cos(bearing) * ARROW_GEOMETRY.probe);
  if (origin === null || probe === null) return null;
  return arrowAlong(origin, { x: probe.x - origin.x, y: probe.y - origin.y }, view);
}
