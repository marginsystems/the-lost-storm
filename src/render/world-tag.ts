export interface WorldTag {
  readonly element: HTMLElement;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly shown: boolean;
}

export type WorldTags = () => readonly WorldTag[];
