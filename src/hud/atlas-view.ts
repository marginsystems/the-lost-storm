export const ATLAS_VIEW = {
  zoomRange: 3.4,
  openZoom: 1.3,
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
  return low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value));
}

export function minScale(frame: AtlasFrame): number {
  return Math.max(frame.width / frame.mapWidth, frame.height / frame.mapHeight);
}

export function maxScale(frame: AtlasFrame): number {
  return minScale(frame) * ATLAS_VIEW.zoomRange;
}

export function clampView(view: AtlasView, frame: AtlasFrame): AtlasView {
  const scale: number = between(view.scale, minScale(frame), maxScale(frame));
  const halfWidth: number = frame.width / (2 * scale);
  const halfHeight: number = frame.height / (2 * scale);
  return { scale, x: between(view.x, halfWidth, frame.mapWidth - halfWidth), y: between(view.y, halfHeight, frame.mapHeight - halfHeight) };
}

export function openView(frame: AtlasFrame, x: number, y: number): AtlasView {
  return clampView({ x, y, scale: minScale(frame) * ATLAS_VIEW.openZoom }, frame);
}

export function toMap(view: AtlasView, frame: AtlasFrame, screen: ScreenPoint): ScreenPoint {
  return { x: view.x + (screen.x - frame.width / 2) / view.scale, y: view.y + (screen.y - frame.height / 2) / view.scale };
}

export function toScreen(view: AtlasView, frame: AtlasFrame, map: ScreenPoint): ScreenPoint {
  return { x: (map.x - view.x) * view.scale + frame.width / 2, y: (map.y - view.y) * view.scale + frame.height / 2 };
}

export function zoomAt(view: AtlasView, frame: AtlasFrame, cursor: ScreenPoint, wheelDelta: number): AtlasView {
  const scale: number = between(view.scale * Math.exp(-wheelDelta * ATLAS_VIEW.wheelRate), minScale(frame), maxScale(frame));
  const held: ScreenPoint = toMap(view, frame, cursor);
  return clampView({ scale, x: held.x - (cursor.x - frame.width / 2) / scale, y: held.y - (cursor.y - frame.height / 2) / scale }, frame);
}

export function panBy(view: AtlasView, frame: AtlasFrame, dx: number, dy: number): AtlasView {
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
