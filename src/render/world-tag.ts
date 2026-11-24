import type { LabelGlide } from './label-glide.ts';

export interface WorldTag {
  readonly element: HTMLElement;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly shown: boolean;
  readonly edge: boolean;
  readonly glide: LabelGlide;
  readonly stack: LabelGlide;
}

export type WorldTags = () => readonly WorldTag[];
