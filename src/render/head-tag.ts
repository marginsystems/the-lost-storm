import { anchorInView, LABEL_EDGE } from './label-edge.ts';
import type { ViewSize } from './label-edge.ts';
import type { ScreenRect } from './label-stack.ts';
import type { TagSize, TagSizes } from './tag-sizes.ts';

export const HEAD_TAG = {
  enterInset: 8,
  offClass: 'offscreen',
  edgeClass: 'edge',
} as const;

export interface HeadSpot {
  readonly x: number;
  readonly y: number;
  readonly front: boolean;
}

export function headTagSeen(spot: HeadSpot, view: ViewSize, was: boolean): boolean {
  if (!spot.front) return false;
  const inset: number = was ? 0 : HEAD_TAG.enterInset;
  return spot.x >= inset && spot.x <= view.width - inset && spot.y >= LABEL_EDGE.top + inset && spot.y <= view.height - inset;
}

export function headTagRect(x: number, y: number, width: number, height: number): ScreenRect {
  return { left: x - width / 2, top: y - height, right: x + width / 2, bottom: y };
}

export function plateSize(element: HTMLElement, sizes: TagSizes<HTMLElement>): TagSize | null {
  const plate: Element | null = element.firstElementChild;
  if (!(plate instanceof HTMLElement)) return null;
  const size: TagSize = sizes.size(plate);
  return size.width > 0 ? size : null;
}

export function showHeadTag(element: HTMLElement, spot: HeadSpot, shown: boolean, view: ViewSize, sizes: TagSizes<HTMLElement>, rects: ScreenRect[]): void {
  const seen: boolean = shown && headTagSeen(spot, view, !element.classList.contains(HEAD_TAG.offClass));
  element.classList.toggle(HEAD_TAG.offClass, !seen);
  const size: TagSize | null = seen ? plateSize(element, sizes) : null;
  if (size !== null) rects.push(headTagRect(spot.x, spot.y, size.width, size.height));
}

export function markEdge(element: HTMLElement, x: number, y: number, view: ViewSize): boolean {
  const edge: boolean = !anchorInView(x, y, view);
  element.classList.toggle(HEAD_TAG.edgeClass, edge);
  return edge;
}
