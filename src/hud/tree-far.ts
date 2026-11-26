import { createChartOverview, overviewWanted, placeMark } from './chart-overview.ts';
import type { ChartOverview, OverviewLink, OverviewPlace, OverviewView, PlaceMark } from './chart-overview.ts';
import { durationMs } from './overlays.ts';
import type { TreeNodeStatus } from './tree-status.ts';

export const TREE_FAR = {
  fadeFallbackMs: 520,
  fadeToken: '--spring-smooth-ms',
} as const;

export type FarChange = 'none' | 'left' | 'entered';

export interface TreeFar {
  isFar(): boolean;
  status(id: string, kind: TreeNodeStatus['kind']): void;
  route(route: ReadonlySet<string>): void;
  remark(): void;
  move(view: OverviewView): FarChange;
}

export function createTreeFar(viewport: HTMLElement, board: HTMLElement, places: readonly OverviewPlace[], links: readonly OverviewLink[]): TreeFar {
  const overview: ChartOverview | null = createChartOverview(viewport, board, places, links);
  const kinds: Map<string, TreeNodeStatus['kind']> = new Map<string, TreeNodeStatus['kind']>();
  const marks: Map<string, PlaceMark> = new Map<string, PlaceMark>();
  let routed: ReadonlySet<string> = new Set<string>();
  let shownRoute: string = '';
  let revision: number = 0;
  let far: boolean = false;
  let fadeUntil: number = 0;
  let fadeMs: number | null = null;
  let lastView: OverviewView | null = null;

  const draw = (): void => {
    if (overview === null || lastView === null || (!far && performance.now() >= fadeUntil)) return;
    overview.draw(lastView, marks, revision);
  };
  const remark = (): void => {
    for (const [id, kind] of kinds) marks.set(id, placeMark(kind, routed.has(id)));
    revision += 1;
    draw();
  };

  return {
    isFar: (): boolean => far,
    status(id: string, kind: TreeNodeStatus['kind']): void {
      kinds.set(id, kind);
    },
    route(route: ReadonlySet<string>): void {
      const key: string = [...route].join(' ');
      if (key === shownRoute) return;
      shownRoute = key;
      routed = route;
      remark();
    },
    remark,
    move(view: OverviewView): FarChange {
      lastView = view;
      const wanted: boolean = overview !== null && overviewWanted(view.scale, far);
      const change: FarChange = wanted === far ? 'none' : wanted ? 'entered' : 'left';
      if (change !== 'none') {
        far = wanted;
        viewport.classList.toggle('far', far);
      }
      if (change === 'left') {
        fadeMs ??= durationMs(getComputedStyle(viewport).getPropertyValue(TREE_FAR.fadeToken)) ?? TREE_FAR.fadeFallbackMs;
        fadeUntil = performance.now() + fadeMs;
      }
      draw();
      return change;
    },
  };
}
