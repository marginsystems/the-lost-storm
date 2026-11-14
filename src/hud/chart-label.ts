import type { FrameLabel, FrameTargets } from './chart-frame.ts';
import type { ChartPoint } from './chart-model.ts';
import { label } from './dom.ts';

export interface NameView extends FrameLabel {
  measure(): void;
}

export function createNameView(host: HTMLElement, text: string, tint: string, at: ChartPoint): NameView {
  const name: HTMLDivElement = label('chart-path-name', text, host);
  name.style.setProperty('--tint', tint);
  let half: ChartPoint = { x: 0, y: 0 };
  let pinnedNow: boolean = false;
  let transformNow: string = '';
  return {
    at,
    get halfWidth(): number {
      return half.x;
    },
    get halfHeight(): number {
      return half.y;
    },
    measure(): void {
      half = { x: name.offsetWidth / 2, y: name.offsetHeight / 2 };
    },
    place(transform: string, pinned: boolean): void {
      if (transform !== transformNow) {
        transformNow = transform;
        name.style.transform = transform;
      }
      if (pinned !== pinnedNow) {
        pinnedNow = pinned;
        name.classList.toggle('pinned', pinned);
      }
    },
  };
}

export function createFrameTargets(board: HTMLElement, here: HTMLElement, labels: readonly NameView[]): FrameTargets {
  let hereZoom: number = 0;
  return {
    labels,
    moveBoard: (transform: string): void => {
      board.style.transform = transform;
    },
    zoomHere: (scale: number): void => {
      if (scale === hereZoom) return;
      hereZoom = scale;
      here.style.setProperty('--zoom', String(scale));
    },
  };
}
