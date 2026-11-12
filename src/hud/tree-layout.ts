export interface TreePoint {
  readonly x: number;
  readonly y: number;
}

export interface TreePlacement {
  readonly id: string;
  readonly column: number;
  readonly row: number;
}

export interface TreeMetrics {
  readonly cell: number;
  readonly pad: number;
}

export interface TreeLayout {
  readonly width: number;
  readonly height: number;
  readonly centres: ReadonlyMap<string, TreePoint>;
}

const LINK = {
  straightWithin: 0.5,
  bend: 0.5,
  half: 0.5,
} as const;

export function layoutTree(nodes: readonly TreePlacement[], metrics: TreeMetrics): TreeLayout {
  const centres: Map<string, TreePoint> = new Map<string, TreePoint>();
  if (nodes.length === 0) return { width: metrics.pad * 2, height: metrics.pad * 2, centres };
  const columns: number[] = nodes.map((node: TreePlacement): number => node.column);
  const rows: number[] = nodes.map((node: TreePlacement): number => node.row);
  const minColumn: number = Math.min(...columns);
  const minRow: number = Math.min(...rows);
  for (const node of nodes) {
    centres.set(node.id, {
      x: Math.round(metrics.pad + (node.column - minColumn) * metrics.cell),
      y: Math.round(metrics.pad + (node.row - minRow) * metrics.cell),
    });
  }
  return {
    width: Math.round((Math.max(...columns) - minColumn) * metrics.cell + metrics.pad * 2),
    height: Math.round((Math.max(...rows) - minRow) * metrics.cell + metrics.pad * 2),
    centres,
  };
}

export function linkPath(from: TreePoint, to: TreePoint): string {
  const start: string = `M${from.x} ${from.y}`;
  if (Math.abs(from.x - to.x) < LINK.straightWithin || Math.abs(from.y - to.y) < LINK.straightWithin) return `${start}L${to.x} ${to.y}`;
  const midX: number = (from.x + to.x) * LINK.half;
  const midY: number = (from.y + to.y) * LINK.half;
  const controlX: number = midX + (from.x - midX) * LINK.bend;
  const controlY: number = midY + (to.y - midY) * LINK.bend;
  return `${start}Q${controlX} ${controlY} ${to.x} ${to.y}`;
}

export function clampPan(offset: number, content: number, viewport: number): number {
  if (content <= viewport) return 0;
  return Math.min(0, Math.max(viewport - content, offset));
}

export function centredPan(content: number, viewport: number): number {
  return clampPan((viewport - content) * LINK.half, content, viewport);
}
