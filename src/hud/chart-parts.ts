import type { SkillTreeNodeDef } from '../../sim/content/types.ts';
import type { ChartPoint } from './chart-model.ts';
import { polyline } from './chart-storm.ts';
import type { TreeNodeStatus } from './tree-status.ts';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg' as const;

export interface Drag {
  readonly pointer: number;
  x: number;
  y: number;
  time: number;
  travelled: number;
  vx: number;
  vy: number;
}

export function reachable(status: TreeNodeStatus): boolean {
  return status.kind === 'available' || status.kind === 'no_points';
}

export function kindWord(node: SkillTreeNodeDef): string {
  if (node.unlock !== null) return 'ability';
  if (node.kind === 'keystone') return 'keystone';
  if (node.variants.length > 0) return 'changes a skill';
  return node.kind === 'notable' ? 'named place' : 'place';
}

export function line(svg: SVGElement, points: readonly ChartPoint[], className: string, tint: string): SVGPolylineElement {
  const shape: SVGPolylineElement = document.createElementNS(SVG_NAMESPACE, 'polyline');
  shape.setAttribute('class', className);
  shape.setAttribute('points', polyline(points));
  shape.setAttribute('pathLength', '1');
  shape.style.setProperty('--tint', tint);
  svg.appendChild(shape);
  return shape;
}
