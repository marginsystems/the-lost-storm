import type { ZoneAmbience } from './ambience-types.ts';
import type { Condition } from './condition-types.ts';

export type StoryFlags = Readonly<Record<string, string>>;

export interface ZoneWake {
  readonly still: number;
  readonly stir: number;
  readonly rise: number;
  readonly front: number;
  readonly settle: number;
  readonly hurry: number;
}

export const FIND_MARKERS = ['none', 'bolt'] as const;
export type FindMarker = (typeof FIND_MARKERS)[number];

export interface ItemFind {
  readonly type: 'item';
  readonly item: string;
  readonly marker: FindMarker;
  readonly sets: StoryFlags;
  readonly equip: boolean;
}

export interface ExitFind {
  readonly type: 'exit';
  readonly exit: string;
}

export type EncounterFind = ItemFind | ExitFind;

export interface ZoneEncounter {
  readonly id: string;
  readonly when: readonly Condition[];
  readonly after: number;
  readonly ahead: number;
  readonly latest: number | null;
  readonly nearing: number | null;
  readonly shoreAt: ShorePoint | null;
  readonly find: EncounterFind;
}

export interface ShorePoint {
  readonly x: number;
  readonly z: number;
}

export interface VoidWander {
  readonly degrees: number;
  readonly seconds: number;
  readonly farther: number;
}

export interface ShoreProp {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly rotationDegrees: number;
  readonly scale: number;
}

export interface ShorePool {
  readonly surface: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly length: number;
  readonly rotationDegrees: number;
}

export interface GlimpsePiece {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly rotationDegrees: number;
  readonly scale: number;
}

export interface VoidGlimpse {
  readonly pieces: readonly GlimpsePiece[];
}

export interface ShorePath {
  readonly surface: string;
  readonly width: number;
  readonly length: number;
  readonly sway: number;
  readonly rubble: readonly string[];
}

export interface ShoreRoom {
  readonly half: number;
  readonly depth: number;
  readonly margin: number;
}

export interface VoidShore {
  readonly when: readonly Condition[];
  readonly ahead: number;
  readonly thin: number;
  readonly surface: string | null;
  readonly ambience: ZoneAmbience;
  readonly props: readonly ShoreProp[];
  readonly pools: readonly ShorePool[];
  readonly path: ShorePath | null;
  readonly room: ShoreRoom | null;
  readonly rain: number;
}

export interface ZoneVoid {
  readonly span: number;
  readonly wake: ZoneWake | null;
  readonly heading: number;
  readonly wander: VoidWander;
  readonly sets: StoryFlags;
  readonly encounters: readonly ZoneEncounter[];
  readonly emptyHanded: boolean;
  readonly shore: VoidShore | null;
  readonly glimpses: readonly VoidGlimpse[];
}

export interface FlashThreshold {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface ZoneFlash {
  readonly from: string;
  readonly when: readonly Condition[];
  readonly calm: number;
  readonly seconds: number;
  readonly seam: number;
  readonly threshold: FlashThreshold | null;
  readonly into: string;
  readonly sets: StoryFlags;
}

export interface PageDef {
  readonly id: string;
  readonly lines: readonly string[];
  readonly address: string;
  readonly unnamed: string;
  readonly voice: string | null;
  readonly when: readonly Condition[];
  readonly sets: StoryFlags;
}

export interface BookDef {
  readonly id: string;
  readonly title: string;
  readonly pages: readonly PageDef[];
}
