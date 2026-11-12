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
} as const;

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

export function arrowAlong(origin: Point, direction: Point, view: ArrowView): ArrowPlacement | null {
  const length: number = Math.hypot(direction.x, direction.y);
  if (length === 0) return null;
  const ux: number = direction.x / length;
  const uy: number = direction.y / length;
  const start: Point = {
    x: Math.min(view.width - view.margin, Math.max(view.margin, origin.x)),
    y: Math.min(view.height - view.margin, Math.max(view.margin, origin.y)),
  };
  let reach: number = Math.max(0, Math.min(edgeDistance(start.x, ux, view.margin, view.width - view.margin), edgeDistance(start.y, uy, view.margin, view.height - view.margin)));
  const blockers: readonly Rect[] = view.blockers.map((rect: Rect): Rect => grown(rect, view.gap));
  const at = (distance: number): Point => ({ x: start.x + ux * distance, y: start.y + uy * distance });
  for (let pass = 0; pass < ARROW_GEOMETRY.passes; pass++) {
    let moved: boolean = false;
    for (const rect of blockers) {
      if (!contains(rect, at(reach))) continue;
      const enter: number = Math.max(entry(start.x, ux, rect.left, rect.right), entry(start.y, uy, rect.top, rect.bottom));
      if (enter >= 0 && enter < reach - ARROW_GEOMETRY.epsilon) {
        reach = enter;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const point: Point = at(reach);
  return { x: point.x, y: point.y, angle: Math.atan2(uy, ux) };
}

export function arrowToward(project: Projector, from: GroundPoint, to: GroundPoint, floor: number, view: ArrowView): ArrowPlacement | null {
  const target: Point | null = project(to.x, floor, to.z);
  if (target !== null && insideInset(target, view)) return null;
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  const distance: number = Math.hypot(dx, dz);
  if (distance === 0) return null;
  const origin: Point | null = project(from.x, floor, from.z);
  const probe: Point | null = project(from.x + (dx / distance) * ARROW_GEOMETRY.probe, floor, from.z + (dz / distance) * ARROW_GEOMETRY.probe);
  if (origin === null || probe === null) return null;
  return arrowAlong(origin, { x: probe.x - origin.x, y: probe.y - origin.y }, view);
}
