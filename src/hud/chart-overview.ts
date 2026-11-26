import type { ChartPoint } from './chart-model.ts';
import type { TreeNodeStatus } from './tree-status.ts';

export const CHART_OVERVIEW = {
  enterScale: 0.36,
  leaveScale: 0.42,
  maxDensity: 2,
  minRadius: 1.6,
  rimWidth: 1,
  trackWidth: 1.1,
  litWidth: 2,
  routeWidth: 1.8,
  idleTrack: 'rgba(140, 150, 165, 0.3)',
  shutTrack: 'rgba(140, 150, 165, 0.08)',
  routeTrack: 'rgba(235, 240, 248, 0.75)',
  idleFill: '#0b0f16',
  idleRim: 'rgba(170, 178, 190, 0.32)',
  openFill: '#1a202a',
  openRim: 'rgba(235, 240, 248, 0.75)',
  shutFill: '#07090d',
  shutRim: 'rgba(170, 178, 190, 0.1)',
  takenRim: 'rgba(255, 255, 255, 0.55)',
} as const;

export type PlaceMark = 'taken' | 'open' | 'route' | 'idle' | 'shut';
export type LinkMark = 'lit' | 'route' | 'idle' | 'shut';

export interface OverviewPlace {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly tint: string;
}

export interface OverviewLink {
  readonly from: string;
  readonly to: string;
  readonly points: readonly ChartPoint[];
  readonly tint: string;
}

export interface OverviewView {
  readonly cornerX: number;
  readonly cornerY: number;
  readonly scale: number;
}

export interface ChartOverview {
  draw(view: OverviewView, marks: ReadonlyMap<string, PlaceMark>, revision: number): void;
}

export function overviewWanted(scale: number, shown: boolean): boolean {
  return scale < (shown ? CHART_OVERVIEW.leaveScale : CHART_OVERVIEW.enterScale);
}

export function placeMark(status: TreeNodeStatus['kind'], onRoute: boolean): PlaceMark {
  if (status === 'allocated') return 'taken';
  if (status === 'closed') return 'shut';
  if (onRoute) return 'route';
  return status === 'available' ? 'open' : 'idle';
}

export function linkMark(from: PlaceMark, to: PlaceMark): LinkMark {
  if (from === 'shut' || to === 'shut') return 'shut';
  if (from === 'taken' && to === 'taken') return 'lit';
  const reaching: boolean = (from === 'route' || from === 'taken') && (to === 'route' || to === 'taken');
  return reaching && (from === 'route' || to === 'route') ? 'route' : 'idle';
}

function markOf(marks: ReadonlyMap<string, PlaceMark>, id: string): PlaceMark {
  return marks.get(id) ?? 'idle';
}

interface Box {
  readonly width: number;
  readonly height: number;
}

function grouped<T>(entries: readonly T[], key: (entry: T) => string | null): Map<string, T[]> {
  const groups: Map<string, T[]> = new Map<string, T[]>();
  for (const entry of entries) {
    const name: string | null = key(entry);
    if (name === null) continue;
    const list: T[] | undefined = groups.get(name);
    if (list === undefined) groups.set(name, [entry]);
    else list.push(entry);
  }
  return groups;
}

export function createChartOverview(host: HTMLElement, before: Element | null, places: readonly OverviewPlace[], links: readonly OverviewLink[]): ChartOverview | null {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.className = 'chart-overview';
  const pen: CanvasRenderingContext2D | null = canvas.getContext('2d', { alpha: true });
  if (pen === null) return null;
  host.insertBefore(canvas, before);
  let box: Box = { width: 0, height: 0 };
  let boxStale: boolean = true;
  new ResizeObserver((): void => {
    boxStale = true;
  }).observe(host);
  let drawn: string = '';

  const strokeLinks = (view: OverviewView, chosen: readonly OverviewLink[], colour: string, width: number): void => {
    if (chosen.length === 0) return;
    pen.beginPath();
    for (const link of chosen) {
      link.points.forEach((point: ChartPoint, index: number): void => {
        const x: number = view.cornerX + point.x * view.scale;
        const y: number = view.cornerY + point.y * view.scale;
        if (index === 0) pen.moveTo(x, y);
        else pen.lineTo(x, y);
      });
    }
    pen.strokeStyle = colour;
    pen.lineWidth = width;
    pen.stroke();
  };

  const dots = (view: OverviewView, chosen: readonly OverviewPlace[], fill: string, rim: string): void => {
    if (chosen.length === 0) return;
    pen.beginPath();
    for (const place of chosen) {
      const x: number = view.cornerX + place.x * view.scale;
      const y: number = view.cornerY + place.y * view.scale;
      const radius: number = Math.max(CHART_OVERVIEW.minRadius, place.radius * view.scale);
      if (x < -radius || y < -radius || x > box.width + radius || y > box.height + radius) continue;
      pen.moveTo(x + radius, y);
      pen.arc(x, y, radius, 0, Math.PI * 2);
    }
    pen.fillStyle = fill;
    pen.fill();
    pen.strokeStyle = rim;
    pen.lineWidth = CHART_OVERVIEW.rimWidth;
    pen.stroke();
  };

  return {
    draw(view: OverviewView, marks: ReadonlyMap<string, PlaceMark>, revision: number): void {
      if (boxStale) {
        const measured: DOMRect = host.getBoundingClientRect();
        box = { width: measured.width, height: measured.height };
        boxStale = false;
      }
      const density: number = Math.min(CHART_OVERVIEW.maxDensity, window.devicePixelRatio);
      const width: number = Math.max(1, Math.round(box.width * density));
      const height: number = Math.max(1, Math.round(box.height * density));
      const key: string = `${width}x${height} ${view.cornerX} ${view.cornerY} ${view.scale} ${revision}`;
      if (key === drawn) return;
      drawn = key;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      pen.setTransform(density, 0, 0, density, 0, 0);
      pen.clearRect(0, 0, box.width, box.height);
      pen.lineCap = 'round';
      pen.lineJoin = 'round';
      const byLink: Map<string, OverviewLink[]> = grouped(links, (link: OverviewLink): string => {
        const mark: LinkMark = linkMark(markOf(marks, link.from), markOf(marks, link.to));
        return mark === 'lit' ? `lit ${link.tint}` : mark;
      });
      strokeLinks(view, byLink.get('shut') ?? [], CHART_OVERVIEW.shutTrack, CHART_OVERVIEW.trackWidth);
      strokeLinks(view, byLink.get('idle') ?? [], CHART_OVERVIEW.idleTrack, CHART_OVERVIEW.trackWidth);
      strokeLinks(view, byLink.get('route') ?? [], CHART_OVERVIEW.routeTrack, CHART_OVERVIEW.routeWidth);
      for (const [name, chosen] of byLink) if (name.startsWith('lit ')) strokeLinks(view, chosen, name.slice('lit '.length), CHART_OVERVIEW.litWidth);
      const byPlace: Map<string, OverviewPlace[]> = grouped(places, (place: OverviewPlace): string => {
        const mark: PlaceMark = markOf(marks, place.id);
        return mark === 'taken' ? `taken ${place.tint}` : mark;
      });
      dots(view, byPlace.get('shut') ?? [], CHART_OVERVIEW.shutFill, CHART_OVERVIEW.shutRim);
      dots(view, byPlace.get('idle') ?? [], CHART_OVERVIEW.idleFill, CHART_OVERVIEW.idleRim);
      dots(view, byPlace.get('open') ?? [], CHART_OVERVIEW.openFill, CHART_OVERVIEW.openRim);
      dots(view, byPlace.get('route') ?? [], CHART_OVERVIEW.openFill, CHART_OVERVIEW.routeTrack);
      for (const [name, chosen] of byPlace) if (name.startsWith('taken ')) dots(view, chosen, name.slice('taken '.length), CHART_OVERVIEW.takenRim);
    },
  };
}
