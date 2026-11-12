import type { GlitchDef, GlitchKind } from '../content/glitches.ts';
import type { Rng } from '../rng.ts';

export const GLITCH_SOURCES = ['combat', 'zone', 'story', 'debug'] as const;
export type GlitchSource = (typeof GLITCH_SOURCES)[number];

export interface Silhouette {
  readonly x: number;
  readonly z: number;
  readonly facing: number;
}

export interface ActiveGlitch {
  readonly kind: GlitchKind;
  readonly source: GlitchSource;
  readonly duration: number;
  readonly edit: string | null;
  readonly turn: boolean;
  elapsed: number;
}

export interface GlitchRequest {
  readonly kind: GlitchKind;
  readonly source: GlitchSource;
  readonly trigger: string | null;
}

export interface GlitchState {
  readonly def: GlitchDef;
  readonly rng: Rng;
  enabled: boolean;
  progress: number;
  fired: string[];
  active: ActiveGlitch | null;
  holdUntil: number;
  readyAt: number;
  combatTime: number;
  lastFight: number;
  lastMist: number;
  zoneSince: number;
  requests: GlitchRequest[];
  wrongWord: number | null;
}

export interface GlitchSave {
  readonly progress: number;
  readonly fired: readonly string[];
}

export const PATH_ACTS = ['step', 'zone', 'kill', 'level', 'death', 'quest', 'glitch'] as const;
export type PathAct = (typeof PATH_ACTS)[number];

export interface PathEntry {
  readonly t: number;
  readonly zone: string;
  readonly x: number;
  readonly z: number;
  readonly act: PathAct;
}

export interface PathLog {
  entries: PathEntry[];
  clock: number;
}

export interface PathLogSave {
  readonly version: number;
  readonly zones: readonly string[];
  readonly entries: readonly (readonly number[])[];
}
