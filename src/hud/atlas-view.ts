export const ATLAS_VIEW = {
  zoomRange: 3.4,
  openCeiling: 0.85,
  openMargin: 0.12,
  openSettle: 1.14,
  markerFloor: 0.6,
  placeReach: { side: 110, above: 45, below: 70 },
  wheelRate: 0.0016,
  stiffness: 210,
  damping: 29,
  maxStep: 1 / 120,
  maxFrame: 1 / 4,
  restDistance: 0.05,
  restScale: 0.0005,
  restSpeed: 0.5,
  flingSeconds: 0.16,
} as const;

export interface AtlasView {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface AtlasFrame {
  readonly width: number;
  readonly height: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
}

export interface AtlasBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface MapFrame extends AtlasFrame {
  readonly places: AtlasBox;
}

export interface AtlasMotion {
  readonly view: AtlasView;
  readonly vx: number;
  readonly vy: number;
  readonly vs: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

function between(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, Math.min(low, high)), Math.max(low, high));
}

export function placeBox(points: readonly ScreenPoint[], mapWidth: number, mapHeight: number): AtlasBox {
  if (points.length === 0) return { left: 0, top: 0, right: mapWidth, bottom: mapHeight };
  const xs: number[] = points.map((point: ScreenPoint): number => point.x);
  const ys: number[] = points.map((point: ScreenPoint): number => point.y);
  const reach = ATLAS_VIEW.placeReach;
  return { left: Math.min(...xs) - reach.side, top: Math.min(...ys) - reach.above, right: Math.max(...xs) + reach.side, bottom: Math.max(...ys) + reach.below };
}

export function coverScale(frame: AtlasFrame): number {
  return Math.max(frame.width / frame.mapWidth, frame.height / frame.mapHeight);
}

export function openScale(frame: MapFrame): number {
  const room: number = 1 - 2 * ATLAS_VIEW.openMargin;
  const width: number = Math.max(1, frame.places.right - frame.places.left);
  const height: number = Math.max(1, frame.places.bottom - frame.places.top);
  return Math.min((frame.width * room) / width, (frame.height * room) / height, ATLAS_VIEW.openCeiling);
}

export function minScale(frame: MapFrame): number {
  return Math.min(coverScale(frame), openScale(frame));
}

export function maxScale(frame: MapFrame): number {
  return coverScale(frame) * ATLAS_VIEW.zoomRange;
}

export function markerScale(scale: number): number {
  return Math.max(1, ATLAS_VIEW.markerFloor / scale);
}

export function clampView(view: AtlasView, frame: MapFrame): AtlasView {
  const scale: number = between(view.scale, minScale(frame), maxScale(frame));
  const halfWidth: number = frame.width / (2 * scale);
  const halfHeight: number = frame.height / (2 * scale);
  return { scale, x: between(view.x, halfWidth, frame.mapWidth - halfWidth), y: between(view.y, halfHeight, frame.mapHeight - halfHeight) };
}

export function openView(frame: MapFrame): AtlasView {
  const { left, top, right, bottom } = frame.places;
  return clampView({ x: (left + right) / 2, y: (top + bottom) / 2, scale: openScale(frame) }, frame);
}

export function settleView(target: AtlasView, frame: MapFrame): AtlasView {
  return clampView({ x: target.x, y: target.y, scale: target.scale * ATLAS_VIEW.openSettle }, frame);
}

export function toMap(view: AtlasView, frame: AtlasFrame, screen: ScreenPoint): ScreenPoint {
  return { x: view.x + (screen.x - frame.width / 2) / view.scale, y: view.y + (screen.y - frame.height / 2) / view.scale };
}

export function toScreen(view: AtlasView, frame: AtlasFrame, map: ScreenPoint): ScreenPoint {
  return { x: (map.x - view.x) * view.scale + frame.width / 2, y: (map.y - view.y) * view.scale + frame.height / 2 };
}

export function zoomAt(view: AtlasView, frame: MapFrame, cursor: ScreenPoint, wheelDelta: number): AtlasView {
  const scale: number = between(view.scale * Math.exp(-wheelDelta * ATLAS_VIEW.wheelRate), minScale(frame), maxScale(frame));
  const held: ScreenPoint = toMap(view, frame, cursor);
  return clampView({ scale, x: held.x - (cursor.x - frame.width / 2) / scale, y: held.y - (cursor.y - frame.height / 2) / scale }, frame);
}

export interface Pinch {
  readonly a: ScreenPoint;
  readonly b: ScreenPoint;
}

export function pinchTo(view: AtlasView, frame: MapFrame, from: Pinch, to: Pinch): AtlasView {
  const before: number = Math.hypot(from.a.x - from.b.x, from.a.y - from.b.y);
  const after: number = Math.hypot(to.a.x - to.b.x, to.a.y - to.b.y);
  const ratio: number = before > 0 && after > 0 ? after / before : 1;
  const scale: number = between(view.scale * ratio, minScale(frame), maxScale(frame));
  const held: ScreenPoint = toMap(view, frame, { x: (from.a.x + from.b.x) / 2, y: (from.a.y + from.b.y) / 2 });
  const centre: ScreenPoint = { x: (to.a.x + to.b.x) / 2, y: (to.a.y + to.b.y) / 2 };
  return clampView({ scale, x: held.x - (centre.x - frame.width / 2) / scale, y: held.y - (centre.y - frame.height / 2) / scale }, frame);
}

export function panBy(view: AtlasView, frame: MapFrame, dx: number, dy: number): AtlasView {
  return clampView({ scale: view.scale, x: view.x - dx / view.scale, y: view.y - dy / view.scale }, frame);
}

export function still(view: AtlasView): AtlasMotion {
  return { view, vx: 0, vy: 0, vs: 0 };
}

export function atRest(motion: AtlasMotion, target: AtlasView): boolean {
  const near: boolean = Math.abs(motion.view.x - target.x) < ATLAS_VIEW.restDistance && Math.abs(motion.view.y - target.y) < ATLAS_VIEW.restDistance && Math.abs(motion.view.scale - target.scale) < ATLAS_VIEW.restScale;
  return near && Math.abs(motion.vx) < ATLAS_VIEW.restSpeed && Math.abs(motion.vy) < ATLAS_VIEW.restSpeed && Math.abs(motion.vs) < ATLAS_VIEW.restSpeed;
}

function pull(value: number, speed: number, target: number, dt: number): [number, number] {
  const next: number = speed + (ATLAS_VIEW.stiffness * (target - value) - ATLAS_VIEW.damping * speed) * dt;
  return [value + next * dt, next];
}

export function stepMotion(motion: AtlasMotion, target: AtlasView, dt: number): AtlasMotion {
  let left: number = Math.min(dt, ATLAS_VIEW.maxFrame);
  let { vx, vy, vs } = motion;
  let { x, y, scale } = motion.view;
  while (left > 0) {
    const step: number = Math.min(left, ATLAS_VIEW.maxStep);
    [x, vx] = pull(x, vx, target.x, step);
    [y, vy] = pull(y, vy, target.y, step);
    [scale, vs] = pull(scale, vs, target.scale, step);
    left -= step;
  }
  const moved: AtlasMotion = { view: { x, y, scale }, vx, vy, vs };
  return atRest(moved, target) ? still(target) : moved;
}
