import { TOUCH } from './touch-map.ts';

export const PHONE = {
  margin: 8,
  gap: 8,
  globeNatural: 132,
  goldNatural: 21,
  globeZoom: 0.42,
  flaskNaturalWidth: 34,
  flaskNaturalHeight: 53,
  flaskZoom: 0.6,
  flaskGap: 6,
  menuButton: 44,
  menuGap: 2,
  minimapPortrait: 96,
  minimapLandscape: 104,
  minimapMin: 64,
  zoneLabel: 20,
  zoneWidth: 160,
  zoneRoomyWidth: 360,
  questWidth: 150,
  questZoom: 0.72,
  questMinHeight: 40,
  questHeightShare: 0.4,
  xpHeight: 16,
  xpMaxWidth: 360,
  xpLift: 4,
  stickInset: 12,
  attack: 64,
  skill: 48,
  skillGap: 8,
  flaskButton: 44,
  hintMinWidth: 220,
  hintMaxWidth: 480,
  hintHeight: 48,
  toastMaxWidth: 340,
  toastHeight: 64,
} as const;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface SafeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface PhoneScreen {
  readonly width: number;
  readonly height: number;
  readonly safe: SafeInsets;
}

export interface PhoneCounts {
  readonly skills: number;
  readonly flasks: number;
  readonly menu: number;
}

export interface MenuPlacement {
  readonly rect: Rect;
  readonly button: number;
  readonly gap: number;
}

export interface PhoneLayout {
  readonly life: Rect;
  readonly mana: Rect;
  readonly lifeFlask: Rect;
  readonly manaFlask: Rect;
  readonly menu: MenuPlacement;
  readonly zone: Rect;
  readonly minimap: Rect;
  readonly quests: Rect | null;
  readonly hint: Rect;
  readonly toast: Rect;
  readonly xp: Rect;
  readonly stick: Rect;
  readonly attack: Rect;
  readonly skills: readonly Rect[];
  readonly flasks: readonly Rect[];
}

export interface NamedRect {
  readonly name: string;
  readonly rect: Rect;
}

const right = (rect: Rect): number => rect.x + rect.w;
const bottom = (rect: Rect): number => rect.y + rect.h;

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
}

function placeMenu(count: number, top: number, spanLeft: number, spanRight: number, belowRight: number, belowTop: number, left: number): MenuPlacement {
  const width = (button: number): number => count * button + Math.max(0, count - 1) * PHONE.menuGap;
  const full: number = width(PHONE.menuButton);
  if (full <= spanRight - spanLeft) return { rect: { x: Math.round(spanLeft + (spanRight - spanLeft - full) / 2), y: top, w: full, h: PHONE.menuButton }, button: PHONE.menuButton, gap: PHONE.menuGap };
  const room: number = belowRight - left;
  const button: number = Math.min(PHONE.menuButton, Math.floor((room - Math.max(0, count - 1) * PHONE.menuGap) / Math.max(1, count)));
  return { rect: { x: left, y: belowTop, w: width(button), h: button }, button, gap: PHONE.menuGap };
}

interface SkillGrid {
  readonly columns: number;
  readonly left: number;
  readonly band: number;
}

function chooseGrid(count: number, floor: number, ceiling: number): SkillGrid {
  const pitch: number = PHONE.skill + PHONE.skillGap;
  let fitting: SkillGrid | null = null;
  for (let columns = Math.max(1, count); columns >= 1; columns -= 1) {
    const width: number = count === 0 ? 0 : columns * pitch - PHONE.skillGap;
    const left: number = ceiling - width;
    const band: number = left - PHONE.gap - floor;
    const grid: SkillGrid = { columns, left, band };
    if (band >= PHONE.hintMinWidth) return grid;
    if (fitting === null && left >= floor) fitting = grid;
  }
  return fitting ?? { columns: 1, left: ceiling - PHONE.skill, band: 0 };
}

function questsRect(column: Rect, top: number, limit: number, height: number): Rect | null {
  const room: number = Math.min(height * PHONE.questHeightShare, limit - PHONE.gap - top);
  if (room < PHONE.questMinHeight) return null;
  return { x: column.x, y: top, w: column.w, h: Math.floor(room) };
}

export function phoneLayout(screen: PhoneScreen, counts: PhoneCounts): PhoneLayout {
  const { width, height, safe } = screen;
  const left: number = safe.left + PHONE.margin;
  const rightEdge: number = width - safe.right - PHONE.margin;
  const top: number = safe.top + PHONE.margin;
  const landscape: boolean = width > height;

  const globe: number = PHONE.globeNatural * PHONE.globeZoom;
  const life: Rect = { x: left, y: top, w: globe, h: globe };
  const mana: Rect = { x: right(life) + PHONE.gap, y: top, w: globe, h: (PHONE.globeNatural + PHONE.goldNatural) * PHONE.globeZoom };
  const flaskW: number = PHONE.flaskNaturalWidth * PHONE.flaskZoom;
  const flaskH: number = PHONE.flaskNaturalHeight * PHONE.flaskZoom;
  const lifeFlask: Rect = { x: right(mana) + PHONE.gap, y: top, w: flaskW, h: flaskH };
  const manaFlask: Rect = { x: right(lifeFlask) + PHONE.flaskGap, y: top, w: flaskW, h: flaskH };
  const clusterBottom: number = Math.max(bottom(life), bottom(mana), bottom(lifeFlask));

  const menuWidth: number = counts.menu * PHONE.menuButton + Math.max(0, counts.menu - 1) * PHONE.menuGap;
  const mapSize: number = Math.max(PHONE.minimapMin, Math.min(landscape ? PHONE.minimapLandscape : PHONE.minimapPortrait, rightEdge - left - menuWidth - PHONE.gap));
  const zoneWidth: number = Math.max(mapSize, Math.min(PHONE.zoneWidth, rightEdge - right(manaFlask) - PHONE.gap));
  const zone: Rect = { x: rightEdge - zoneWidth, y: top, w: zoneWidth, h: PHONE.zoneLabel };
  const minimap: Rect = { x: rightEdge - mapSize, y: bottom(zone), w: mapSize, h: mapSize };
  const menu: MenuPlacement = placeMenu(counts.menu, top, right(manaFlask) + PHONE.gap, zone.x - PHONE.gap, minimap.x - PHONE.gap, Math.ceil(clusterBottom + PHONE.gap), left);

  const xpWidth: number = Math.min(rightEdge - left, PHONE.xpMaxWidth);
  const xpBottom: number = height - safe.bottom - PHONE.xpLift;
  const xp: Rect = { x: Math.round(left + (rightEdge - left - xpWidth) / 2), y: xpBottom - PHONE.xpHeight, w: xpWidth, h: PHONE.xpHeight };
  const baseline: number = xp.y - PHONE.gap;

  const stickSize: number = TOUCH.stickRadius * 2;
  const stick: Rect = { x: left + PHONE.stickInset, y: baseline - stickSize, w: stickSize, h: stickSize };
  const attack: Rect = { x: rightEdge - PHONE.attack, y: baseline - PHONE.attack, w: PHONE.attack, h: PHONE.attack };
  const grid: SkillGrid = chooseGrid(counts.skills, right(stick) + PHONE.gap, attack.x - PHONE.gap);
  const pitch: number = PHONE.skill + PHONE.skillGap;
  const skills: Rect[] = Array.from({ length: counts.skills }, (_: unknown, index: number): Rect => {
    const column: number = grid.columns - 1 - (index % grid.columns);
    const row: number = Math.floor(index / grid.columns);
    return { x: grid.left + column * pitch, y: baseline - PHONE.skill - row * pitch, w: PHONE.skill, h: PHONE.skill };
  });
  const flasks: Rect[] = Array.from({ length: counts.flasks }, (_: unknown, index: number): Rect => ({
    x: stick.x + index * (PHONE.flaskButton + PHONE.gap),
    y: stick.y - PHONE.gap - PHONE.flaskButton,
    w: PHONE.flaskButton,
    h: PHONE.flaskButton,
  }));

  const controls: readonly Rect[] = [stick, attack, ...skills, ...flasks];
  const inBand: boolean = grid.band >= PHONE.hintMinWidth;
  const bandLeft: number = inBand ? right(stick) + PHONE.gap : left;
  const bandRight: number = inBand ? grid.left - PHONE.gap : rightEdge;
  const hintWidth: number = Math.min(bandRight - bandLeft, PHONE.hintMaxWidth);
  const hintBottom: number = inBand ? baseline : Math.min(...controls.map((rect: Rect): number => rect.y)) - PHONE.gap;
  const hint: Rect = { x: Math.round(bandLeft + (bandRight - bandLeft - hintWidth) / 2), y: hintBottom - PHONE.hintHeight, w: hintWidth, h: PHONE.hintHeight };

  const toastWidth: number = Math.min(bandRight - bandLeft, PHONE.toastMaxWidth);
  const toast: Rect = { x: Math.round(bandLeft + (bandRight - bandLeft - toastWidth) / 2), y: hint.y - PHONE.gap - PHONE.toastHeight, w: toastWidth, h: PHONE.toastHeight };

  const column: Rect = { x: rightEdge - PHONE.questWidth, y: 0, w: PHONE.questWidth, h: height };
  const below: number = Math.min(height, ...[toast, hint, ...controls].filter((rect: Rect): boolean => rect.x < right(column) && column.x < right(rect)).map((rect: Rect): number => rect.y));
  const sharesColumn: boolean = menu.rect.x < right(column) && column.x < right(menu.rect);
  const questTop: number = Math.max(bottom(minimap), sharesColumn ? bottom(menu.rect) : 0) + PHONE.gap;
  const quests: Rect | null = questsRect(column, questTop, below, height);

  return { life, mana, lifeFlask, manaFlask, menu, zone, minimap, quests, hint, toast, xp, stick, attack, skills, flasks };
}

export function layoutRects(layout: PhoneLayout): NamedRect[] {
  const named: NamedRect[] = [
    { name: 'life', rect: layout.life },
    { name: 'mana', rect: layout.mana },
    { name: 'lifeFlask', rect: layout.lifeFlask },
    { name: 'manaFlask', rect: layout.manaFlask },
    { name: 'menu', rect: layout.menu.rect },
    { name: 'zone', rect: layout.zone },
    { name: 'minimap', rect: layout.minimap },
    { name: 'hint', rect: layout.hint },
    { name: 'toast', rect: layout.toast },
    { name: 'xp', rect: layout.xp },
    { name: 'stick', rect: layout.stick },
    { name: 'attack', rect: layout.attack },
  ];
  if (layout.quests !== null) named.push({ name: 'quests', rect: layout.quests });
  layout.skills.forEach((rect: Rect, index: number): void => {
    named.push({ name: `skill${index}`, rect });
  });
  layout.flasks.forEach((rect: Rect, index: number): void => {
    named.push({ name: `flask${index}`, rect });
  });
  return named;
}

export function collisions(rects: readonly NamedRect[]): string[] {
  const hits: string[] = [];
  rects.forEach((a: NamedRect, index: number): void => {
    for (const b of rects.slice(index + 1)) if (overlaps(a.rect, b.rect)) hits.push(`${a.name} × ${b.name}`);
  });
  return hits;
}
