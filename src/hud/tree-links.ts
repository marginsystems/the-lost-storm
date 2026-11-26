import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import type { ChartPoint } from './chart-model.ts';
import { pathTint } from './chart-model.ts';
import type { OverviewLink } from './chart-overview.ts';
import { line } from './chart-parts.ts';
import { boltPoints } from './chart-storm.ts';

export const TREE_LINKS = {
  svgNamespace: 'http://www.w3.org/2000/svg',
} as const;

export interface LinkView {
  readonly path: SVGPolylineElement;
  readonly track: SVGPolylineElement;
  readonly from: string;
  readonly to: string;
}

export interface TreeLinks {
  readonly views: readonly LinkView[];
  readonly far: readonly OverviewLink[];
}

export function buildTreeLinks(svg: SVGSVGElement, content: Content, centreOf: (node: SkillTreeNodeDef) => ChartPoint, eye: ChartPoint, unit: number): TreeLinks {
  const shades: SVGGElement = document.createElementNS(TREE_LINKS.svgNamespace, 'g');
  shades.setAttribute('class', 'tree-shades');
  svg.appendChild(shades);
  const nodes: readonly SkillTreeNodeDef[] = content.skillTree;
  const byId: ReadonlyMap<string, SkillTreeNodeDef> = new Map<string, SkillTreeNodeDef>(nodes.map((node: SkillTreeNodeDef): [string, SkillTreeNodeDef] => [node.id, node]));
  const views: LinkView[] = [];
  const far: OverviewLink[] = [];
  for (const node of nodes) {
    for (const requiredId of node.requires) {
      const from: SkillTreeNodeDef | undefined = byId.get(requiredId);
      if (from === undefined) continue;
      const shared: boolean = from.common !== null || node.common !== null;
      const tint: string = shared ? content.chart.common.tint : pathTint(content, node.path === from.path ? node.path : from.path);
      const bolt: ChartPoint[] = boltPoints(centreOf(from), centreOf(node), eye, `${requiredId}>${node.id}`, unit);
      const ring: string = from.path === node.path && !shared ? '' : ' ring';
      line(shades, bolt, `tree-shade${ring}`, tint);
      const track: SVGPolylineElement = line(svg, bolt, `tree-track${ring}`, tint);
      views.push({ track, path: line(svg, bolt, `tree-flow${ring}`, tint), from: requiredId, to: node.id });
      far.push({ from: requiredId, to: node.id, points: bolt, tint });
    }
  }
  return { views, far };
}
