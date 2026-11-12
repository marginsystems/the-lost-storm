import type { ReadonlyVec2, Vec2 } from '../math.ts';
import type { NavGrid } from './grid.ts';
import { cellCenter, cellIndex, isWalkable, linePace, lineWalkable, nearestWalkable, paceAt } from './grid.ts';

interface Step {
  readonly dc: number;
  readonly dr: number;
  readonly cost: number;
}

const PATH = {
  snapRadius: 8,
  maxExpansions: 6000,
  faceStep: 0.1,
  goalRing: 2,
} as const;

const STEPS: readonly Step[] = [
  { dc: 1, dr: 0, cost: 1 },
  { dc: -1, dr: 0, cost: 1 },
  { dc: 0, dr: 1, cost: 1 },
  { dc: 0, dr: -1, cost: 1 },
  { dc: 1, dr: 1, cost: Math.SQRT2 },
  { dc: 1, dr: -1, cost: Math.SQRT2 },
  { dc: -1, dr: 1, cost: Math.SQRT2 },
  { dc: -1, dr: -1, cost: Math.SQRT2 },
];

class MinHeap {
  private readonly nodes: number[] = [];
  private readonly scores: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, score: number): void {
    let index: number = this.nodes.length;
    this.nodes.push(node);
    this.scores.push(score);
    while (index > 0) {
      const parent: number = (index - 1) >> 1;
      if ((this.scores[parent] ?? 0) <= score) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  pop(): number {
    const top: number = this.nodes[0] ?? -1;
    const lastNode: number | undefined = this.nodes.pop();
    const lastScore: number | undefined = this.scores.pop();
    if (this.nodes.length > 0 && lastNode !== undefined && lastScore !== undefined) {
      this.nodes[0] = lastNode;
      this.scores[0] = lastScore;
      this.sink(0);
    }
    return top;
  }

  private sink(start: number): void {
    let index: number = start;
    for (;;) {
      const left: number = index * 2 + 1;
      const right: number = left + 1;
      let smallest: number = index;
      if ((this.scores[left] ?? Infinity) < (this.scores[smallest] ?? Infinity)) smallest = left;
      if ((this.scores[right] ?? Infinity) < (this.scores[smallest] ?? Infinity)) smallest = right;
      if (smallest === index) return;
      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const nodeA: number = this.nodes[a] ?? 0;
    const scoreA: number = this.scores[a] ?? 0;
    this.nodes[a] = this.nodes[b] ?? 0;
    this.scores[a] = this.scores[b] ?? 0;
    this.nodes[b] = nodeA;
    this.scores[b] = scoreA;
  }
}

function heuristic(grid: NavGrid, a: number, b: number): number {
  const dc: number = Math.abs((a % grid.columns) - (b % grid.columns));
  const dr: number = Math.abs(Math.floor(a / grid.columns) - Math.floor(b / grid.columns));
  return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
}

function searchCells(grid: NavGrid, start: number, goal: number): number[] | null {
  const total: number = grid.columns * grid.rows;
  const cost: Float32Array = new Float32Array(total).fill(Infinity);
  const parent: Int32Array = new Int32Array(total).fill(-1);
  const closed: Uint8Array = new Uint8Array(total);
  const open: MinHeap = new MinHeap();
  cost[start] = 0;
  open.push(start, heuristic(grid, start, goal));
  let expansions: number = 0;
  while (open.size > 0 && expansions < PATH.maxExpansions) {
    const current: number = open.pop();
    if (current === goal) break;
    if (closed[current] === 1) continue;
    closed[current] = 1;
    expansions += 1;
    const column: number = current % grid.columns;
    const row: number = Math.floor(current / grid.columns);
    for (const step of STEPS) {
      const nextColumn: number = column + step.dc;
      const nextRow: number = row + step.dr;
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= grid.columns || nextRow >= grid.rows) continue;
      const next: number = nextRow * grid.columns + nextColumn;
      if (grid.walkable[next] !== 1 || closed[next] === 1) continue;
      if (step.dc !== 0 && step.dr !== 0 && (grid.walkable[row * grid.columns + nextColumn] !== 1 || grid.walkable[nextRow * grid.columns + column] !== 1)) continue;
      const nextCost: number = (cost[current] ?? Infinity) + step.cost / (grid.pace[next] ?? 1);
      if (nextCost >= (cost[next] ?? Infinity)) continue;
      cost[next] = nextCost;
      parent[next] = current;
      open.push(next, nextCost + heuristic(grid, next, goal));
    }
  }
  if (parent[goal] === -1 && goal !== start) return null;
  const cells: number[] = [];
  for (let cell: number = goal; cell !== -1 && cell !== start; cell = parent[cell] ?? -1) cells.unshift(cell);
  return cells;
}

function slowest(grid: NavGrid, anchor: ReadonlyVec2, points: readonly Vec2[], from: number, to: number): number {
  let pace: number = paceAt(grid, anchor.x, anchor.z);
  for (let index: number = from; index <= to; index += 1) {
    const point: Vec2 | undefined = points[index];
    if (point !== undefined) pace = Math.min(pace, paceAt(grid, point.x, point.z));
  }
  return pace;
}

function smooth(grid: NavGrid, from: ReadonlyVec2, points: readonly Vec2[]): Vec2[] {
  const result: Vec2[] = [];
  let anchor: ReadonlyVec2 = from;
  let index: number = 0;
  while (index < points.length) {
    let reach: number = index;
    for (let candidate: number = points.length - 1; candidate > index; candidate -= 1) {
      const point: Vec2 | undefined = points[candidate];
      if (point !== undefined && lineWalkable(grid, anchor, point) && linePace(grid, anchor, point) >= slowest(grid, anchor, points, index, candidate)) {
        reach = candidate;
        break;
      }
    }
    const chosen: Vec2 | undefined = points[reach];
    if (chosen === undefined) break;
    result.push(chosen);
    anchor = chosen;
    index = reach + 1;
  }
  return result;
}

function straight(grid: NavGrid, start: Vec2, goal: Vec2): boolean {
  return lineWalkable(grid, start, goal) && linePace(grid, start, goal) >= Math.min(paceAt(grid, start.x, start.z), paceAt(grid, goal.x, goal.z));
}

export function directPath(grid: NavGrid, from: ReadonlyVec2, to: ReadonlyVec2): Vec2[] | null {
  const start: Vec2 | null = nearestWalkable(grid, from, PATH.snapRadius);
  const goal: Vec2 | null = nearestWalkable(grid, to, PATH.snapRadius);
  if (start === null || goal === null) return [];
  return straight(grid, start, goal) ? [goal] : null;
}

function nearestCell(grid: NavGrid, point: ReadonlyVec2, ring: number, clear: boolean): number {
  const own: number = cellIndex(grid, point.x, point.z);
  let best: number = -1;
  let bestGap: number = Number.POSITIVE_INFINITY;
  const column: number = own % grid.columns;
  const row: number = Math.floor(own / grid.columns);
  for (let dr: number = -ring; dr <= ring; dr += 1) {
    for (let dc: number = -ring; dc <= ring; dc += 1) {
      const nextColumn: number = column + dc;
      const nextRow: number = row + dr;
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= grid.columns || nextRow >= grid.rows) continue;
      const next: number = nextRow * grid.columns + nextColumn;
      if (grid.walkable[next] !== 1) continue;
      const centre: Vec2 = cellCenter(grid, next);
      const gap: number = Math.hypot(centre.x - point.x, centre.z - point.z);
      if (gap < bestGap && (!clear || lineWalkable(grid, point, centre))) {
        best = next;
        bestGap = gap;
      }
    }
  }
  return best;
}

function openCell(grid: NavGrid, point: ReadonlyVec2): number {
  const own: number = cellIndex(grid, point.x, point.z);
  if (own < 0 || grid.walkable[own] === 1) return own;
  const seen: number = nearestCell(grid, point, PATH.goalRing, true);
  if (seen >= 0) return seen;
  const near: number = nearestCell(grid, point, Math.ceil(PATH.snapRadius / grid.cellSize), false);
  return near >= 0 ? near : own;
}

export function findPath(grid: NavGrid, from: ReadonlyVec2, to: ReadonlyVec2): Vec2[] {
  const start: Vec2 | null = nearestWalkable(grid, from, PATH.snapRadius);
  const goal: Vec2 | null = nearestWalkable(grid, to, PATH.snapRadius);
  if (start === null || goal === null) return [];
  if (straight(grid, start, goal)) return [goal];
  const startCell: number = openCell(grid, start);
  const goalCell: number = openCell(grid, goal);
  if (startCell < 0 || goalCell < 0) return [];
  const cells: number[] | null = searchCells(grid, startCell, goalCell);
  if (cells === null) return [];
  const points: Vec2[] = cells.map((cell: number): Vec2 => cellCenter(grid, cell));
  const last: Vec2 = points.at(-1) ?? start;
  if (lineWalkable(grid, last, goal)) points.push(goal);
  if (points.length === 0) return [];
  return smooth(grid, start, points);
}

export function nearFace(grid: NavGrid, from: ReadonlyVec2, to: ReadonlyVec2): Vec2 | null {
  if (isWalkable(grid, to.x, to.z)) return null;
  const dx: number = from.x - to.x;
  const dz: number = from.z - to.z;
  const steps: number = Math.ceil(Math.hypot(dx, dz) / PATH.faceStep);
  for (let step: number = 1; step <= steps; step += 1) {
    const t: number = step / steps;
    const x: number = to.x + dx * t;
    const z: number = to.z + dz * t;
    if (isWalkable(grid, x, z)) return { x, z };
  }
  return null;
}
