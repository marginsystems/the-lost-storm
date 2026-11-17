export interface PickColumn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
}

export interface PickRay {
  readonly origin: { readonly x: number; readonly y: number; readonly z: number };
  readonly direction: { readonly x: number; readonly y: number; readonly z: number };
}

export function columnHit(ray: PickRay, column: PickColumn): number | null {
  if (column.radius <= 0 || column.height <= 0) return null;
  const ox: number = ray.origin.x - column.x;
  const oz: number = ray.origin.z - column.z;
  const dx: number = ray.direction.x;
  const dz: number = ray.direction.z;
  const a: number = dx * dx + dz * dz;
  const b: number = 2 * (ox * dx + oz * dz);
  const c: number = ox * ox + oz * oz - column.radius * column.radius;
  const enter: number = a <= 0 ? (c <= 0 ? 0 : Infinity) : (-b - Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
  const leave: number = a <= 0 ? (c <= 0 ? Infinity : -Infinity) : (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
  if (a > 0 && b * b - 4 * a * c < 0) return null;
  const dy: number = ray.direction.y;
  const bottom: number = column.y - ray.origin.y;
  const top: number = column.y + column.height - ray.origin.y;
  const low: number = dy === 0 ? (bottom <= 0 && top >= 0 ? -Infinity : Infinity) : Math.min(bottom / dy, top / dy);
  const high: number = dy === 0 ? (bottom <= 0 && top >= 0 ? Infinity : -Infinity) : Math.max(bottom / dy, top / dy);
  const from: number = Math.max(enter, low, 0);
  const to: number = Math.min(leave, high);
  return from <= to ? from : null;
}

export function nearestColumn<T>(ray: PickRay, columns: readonly (readonly [T, PickColumn])[]): T | null {
  let best: T | null = null;
  let bestAt: number = Infinity;
  for (const [value, column] of columns) {
    const at: number | null = columnHit(ray, column);
    if (at === null || at >= bestAt) continue;
    best = value;
    bestAt = at;
  }
  return best;
}
