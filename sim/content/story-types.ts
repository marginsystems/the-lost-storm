export interface ZoneWake {
  readonly lie: number;
  readonly rise: number;
}

export interface ZoneVoid {
  readonly span: number;
  readonly wake: ZoneWake | null;
}

export const HUD_PARTS = ['life', 'mana', 'bar', 'quests', 'minimap', 'hints'] as const;
export type HudPart = (typeof HUD_PARTS)[number];
