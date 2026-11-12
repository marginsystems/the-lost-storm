export interface MapFrame {
  readonly scale: number;
  readonly squash: number;
  readonly centreX: number;
  readonly centreY: number;
  readonly focusX: number;
  readonly focusZ: number;
}

export interface MapMatrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

export interface EdgeMark {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly inside: boolean;
}

const DIAGONAL: number = Math.SQRT1_2;

export function mapMatrix(frame: MapFrame): MapMatrix {
  const a: number = DIAGONAL * frame.scale;
  const b: number = DIAGONAL * frame.scale * frame.squash;
  const c: number = -a;
  const d: number = b;
  return { a, b, c, d, e: frame.centreX - (a * frame.focusX + c * frame.focusZ), f: frame.centreY - (b * frame.focusX + d * frame.focusZ) };
}

export function toMap(matrix: MapMatrix, x: number, z: number): MapPoint {
  return { x: matrix.a * x + matrix.c * z + matrix.e, y: matrix.b * x + matrix.d * z + matrix.f };
}

export function toWorld(matrix: MapMatrix, x: number, y: number): { readonly x: number; readonly z: number } {
  const det: number = matrix.a * matrix.d - matrix.b * matrix.c;
  const px: number = x - matrix.e;
  const py: number = y - matrix.f;
  return { x: (matrix.d * px - matrix.c * py) / det, z: (matrix.a * py - matrix.b * px) / det };
}

export function headingOnMap(matrix: MapMatrix, facing: number): number {
  const dx: number = Math.sin(facing);
  const dz: number = Math.cos(facing);
  return Math.atan2(matrix.b * dx + matrix.d * dz, matrix.a * dx + matrix.c * dz);
}

export function edgeMark(point: MapPoint, width: number, height: number, margin: number): EdgeMark {
  const cx: number = width / 2;
  const cy: number = height / 2;
  const dx: number = point.x - cx;
  const dy: number = point.y - cy;
  const angle: number = Math.atan2(dy, dx);
  const halfW: number = cx - margin;
  const halfH: number = cy - margin;
  if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) return { x: point.x, y: point.y, angle, inside: true };
  const reach: number = Math.min(Math.abs(dx) > 0 ? halfW / Math.abs(dx) : Infinity, Math.abs(dy) > 0 ? halfH / Math.abs(dy) : Infinity);
  return { x: cx + dx * reach, y: cy + dy * reach, angle, inside: false };
}
