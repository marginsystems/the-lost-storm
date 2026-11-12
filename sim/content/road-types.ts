import type { Condition } from './condition-types.ts';
import type { StoryFlags } from './story-types.ts';

export interface ZoneDrift {
  readonly id: string;
  readonly column: number;
  readonly row: number;
  readonly columns: number;
  readonly rows: number;
  readonly period: number;
  readonly open: number;
  readonly offset: number;
  readonly fade: number;
}

export interface ZoneTrigger {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly when: readonly Condition[];
  readonly sets: StoryFlags;
}

export interface ActEnd {
  readonly when: readonly Condition[];
  readonly line: string;
}

export interface RetiredZones {
  readonly zones: readonly string[];
  readonly to: string;
  readonly flags: StoryFlags;
}
