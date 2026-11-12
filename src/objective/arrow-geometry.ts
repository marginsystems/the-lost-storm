export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ArrowPlacement {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export function arrowPlacement(target: Point, width: number, height: number, margin: number, bottom: number = margin): ArrowPlacement | null {
  const centre: Point = { x: width / 2, y: (margin + height - bottom) / 2 };
  const dx: number = target.x - centre.x;
  const dy: number = target.y - centre.y;
  const halfWidth: number = width / 2 - margin;
  const halfHeight: number = Math.max(0, (height - bottom - margin) / 2);
  if (Math.abs(dx) <= halfWidth && Math.abs(dy) <= halfHeight) return null;
  const scale: number = Math.min(dx === 0 ? Infinity : halfWidth / Math.abs(dx), dy === 0 ? Infinity : halfHeight / Math.abs(dy));
  return { x: centre.x + dx * scale, y: centre.y + dy * scale, angle: Math.atan2(target.y - height / 2, target.x - width / 2) };
}
