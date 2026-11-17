import type { ReadonlyVec2 } from '../math.ts';
import type { ServiceKind } from './trade-types.ts';

export interface PropLight {
  readonly color: string;
  readonly intensity: number;
  readonly distance: number;
  readonly height: number;
}

export interface SurfaceGlow {
  readonly color: string;
  readonly strength: number;
  readonly cover: number;
  readonly cracks: number;
  readonly scale: number;
  readonly flow: number;
  readonly pulse: number;
}

export interface SurfaceHeat {
  readonly skill: string;
  readonly lifeShare: number;
}

export interface SurfaceDef {
  readonly id: string;
  readonly color: string;
  readonly normal: string | null;
  readonly orm: string | null;
  readonly metres: number;
  readonly tint: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly normalScale: number;
  readonly spill: number;
  readonly pace: number;
  readonly glow: SurfaceGlow | null;
  readonly heat: SurfaceHeat | null;
  readonly blocks: boolean;
}

export interface PropCache {
  readonly goldMin: number;
  readonly goldMax: number;
  readonly itemChance: number;
  readonly opened: string | null;
}

export interface PropLid {
  readonly seam: number;
  readonly hinge: number;
  readonly degrees: number;
}

export interface PropDef {
  readonly id: string;
  readonly model: string;
  readonly footprint: string;
  readonly scale: number;
  readonly blockRadius: number;
  readonly blockLength: number;
  readonly solid: boolean | null;
  readonly footprints: readonly (readonly ReadonlyVec2[])[];
  readonly height: number;
  readonly light: PropLight | null;
  readonly surfaces: Readonly<Record<string, string>>;
  readonly tint: string | null;
  readonly service: ServiceKind | null;
  readonly label: string | null;
  readonly cache: PropCache | null;
  readonly lid: PropLid | null;
}
