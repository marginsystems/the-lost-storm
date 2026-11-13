import type { ReadonlyVec2 } from '../math.ts';
import type { ServiceKind } from './trade-types.ts';

export interface PropLight {
  readonly color: string;
  readonly intensity: number;
  readonly distance: number;
  readonly height: number;
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
}

export interface PropDef {
  readonly id: string;
  readonly model: string;
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
}
