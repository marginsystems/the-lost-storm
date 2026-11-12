import type { ZoneAmbience } from './ambience-types.ts';
import type { Condition } from './condition-types.ts';

export type StoryFlags = Readonly<Record<string, string>>;

export interface ZoneWake {
  readonly lie: number;
  readonly rise: number;
}

export interface ItemFind {
  readonly type: 'item';
  readonly item: string;
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
  readonly find: EncounterFind;
}

export interface VoidWander {
  readonly degrees: number;
  readonly seconds: number;
  readonly farther: number;
}

export interface VoidShore {
  readonly when: readonly Condition[];
  readonly ahead: number;
  readonly thin: number;
  readonly surface: string | null;
  readonly ambience: ZoneAmbience;
}

export interface VoidFinds {
  readonly reach: number;
  readonly aim: number;
}

export interface ZoneVoid {
  readonly span: number;
  readonly wake: ZoneWake | null;
  readonly heading: number;
  readonly wander: VoidWander;
  readonly sets: StoryFlags;
  readonly encounters: readonly ZoneEncounter[];
  readonly finds: VoidFinds;
  readonly emptyHanded: boolean;
  readonly shore: VoidShore | null;
}

export interface ZoneHud {
  readonly until: readonly Condition[];
}

export interface PageDef {
  readonly id: string;
  readonly lines: readonly string[];
  readonly address: string;
  readonly unnamed: string;
  readonly when: readonly Condition[];
  readonly sets: StoryFlags;
}

export interface BookDef {
  readonly id: string;
  readonly title: string;
  readonly pages: readonly PageDef[];
}
