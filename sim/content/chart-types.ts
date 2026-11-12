export type SkillTarget = { readonly type: 'skill'; readonly skill: string } | { readonly type: 'group'; readonly group: string };

export interface SkillVariant {
  readonly skill: string;
  readonly becomes: string;
}

export interface ChartPath {
  readonly id: string;
  readonly name: string;
  readonly tint: string;
  readonly description: string;
}

export interface ChartGroup {
  readonly id: string;
  readonly name: string;
  readonly skills: readonly string[];
}

export interface ChartRespec {
  readonly goldPerPoint: number;
  readonly goldPerLevel: number;
}

import type { Condition } from './condition-types.ts';

export interface PointGrant {
  readonly id: string;
  readonly when: readonly Condition[];
  readonly points: number;
}

export interface ChartDef {
  readonly title: string;
  readonly pointsPerLevel: number;
  readonly respec: ChartRespec;
  readonly paths: readonly ChartPath[];
  readonly groups: readonly ChartGroup[];
  readonly grants: readonly PointGrant[];
}
