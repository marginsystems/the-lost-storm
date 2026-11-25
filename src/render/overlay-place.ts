import type { Vector2 } from 'three';
import { keepTagInView } from './label-edge.ts';
import type { ViewSize } from './label-edge.ts';
import { createGlide, glideToward, LABEL_GLIDE } from './label-glide.ts';
import type { LabelGlide } from './label-glide.ts';
import type { ScreenRect } from './label-stack.ts';
import type { TagSize } from './tag-sizes.ts';

export function blockersIn(root: HTMLElement, selectors: readonly string[]): ScreenRect[] {
  const origin: DOMRect = root.getBoundingClientRect();
  const rects: ScreenRect[] = [];
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      const box: DOMRect = element.getBoundingClientRect();
      if (box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden') rects.push({ left: box.left - origin.left, top: box.top - origin.top, right: box.right - origin.left, bottom: box.bottom - origin.top });
    }
  }
  return rects;
}

export function place(element: HTMLElement, point: Vector2): void {
  element.style.transform = `translate3d(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px, 0)`;
}

export function glideAt(glide: LabelGlide, anchor: Vector2, target: Vector2, dt: number, bound: TagBound | null): void {
  glideToward(glide, target.x - anchor.x, target.y - anchor.y, dt);
  target.set(anchor.x + glide.x, anchor.y + glide.y);
  if (bound !== null) {
    const [x, y] = keepTagInView(target.x, target.y, bound.size.width, bound.size.height, bound.view);
    target.set(x, y);
  }
}

const PARTINGS: WeakMap<object, LabelGlide> = new WeakMap<object, LabelGlide>();

export function glideApart(owner: object, apart: number, dt: number): number {
  const parted: LabelGlide = PARTINGS.get(owner) ?? createGlide();
  PARTINGS.set(owner, parted);
  glideToward(parted, 0, apart, dt, LABEL_GLIDE.apartFrequency);
  return parted.y;
}

export function glidePlace(element: HTMLElement, glide: LabelGlide, anchor: Vector2, target: Vector2, dt: number): void {
  glideAt(glide, anchor, target, dt, null);
  place(element, target);
}

export interface TagBound {
  readonly size: TagSize;
  readonly view: ViewSize;
}
