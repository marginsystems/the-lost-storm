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
  readonly find: EncounterFind;
}

export interface VoidWander {
  readonly degrees: number;
  readonly seconds: number;
  readonly farther: number;
}

export interface ZoneVoid {
  readonly span: number;
  readonly wake: ZoneWake | null;
  readonly heading: number;
  readonly wander: VoidWander;
  readonly sets: StoryFlags;
  readonly encounters: readonly ZoneEncounter[];
}

export const HUD_PARTS = ['life', 'mana', 'bar', 'quests', 'minimap', 'hints'] as const;
export type HudPart = (typeof HUD_PARTS)[number];

export interface ZoneHud {
  readonly hide: readonly HudPart[];
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
