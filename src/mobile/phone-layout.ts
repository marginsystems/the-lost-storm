import { TOUCH } from './touch-map.ts';

export const PHONE = {
  margin: 8,
  gap: 8,
  globeNatural: 132,
  goldNatural: 21,
  globeZoom: 0.42,
  menuButton: 44,
  menuGap: 2,
  minimapPortrait: 96,
  minimapLandscape: 104,
  minimapMin: 64,
  minimapRailShare: 0.32,
  minimapRailMin: 96,
  minimapRailMax: 136,
  caption: 18,
  zoneLabel: 20,
  zoneWidth: 160,
  zoneRoomyWidth: 360,
  questWidth: 150,
  questMinWidth: 90,
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
  barkHeight: 56,
  dialogueMaxHeight: 220,
  cardWidth: 320,
  cardInset: 16,
  bannerHeight: 24,
  bannerMaxWidth: 360,
  bannerMinWidth: 140,
  targetHeight: 28,
  targetTallHeight: 42,
  targetMaxWidth: 320,
  targetMinWidth: 140,
  meterHeight: 28,
  meterMaxWidth: 200,
  meterMinWidth: 140,
  partyHeight: 104,
  partyMinWidth: 120,
  partyMaxWidth: 190,
  inviteHeight: 64,
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
  readonly rail: boolean;
}

export interface PhoneLayout {
  readonly life: Rect;
  readonly mana: Rect;
  readonly menu: MenuPlacement;
  readonly zone: Rect;
  readonly minimap: Rect;
  readonly caption: Rect | null;
  readonly quests: Rect | null;
  readonly hint: Rect;
  readonly toast: Rect;
  readonly bark: Rect;
  readonly dialogue: Rect;
  readonly card: Rect;
  readonly banner: Rect;
  readonly target: Rect;
  readonly meter: Rect;
  readonly party: Rect | null;
  readonly invite: Rect;
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
  if (full <= spanRight - spanLeft) return { rect: { x: Math.round(spanLeft + (spanRight - spanLeft - full) / 2), y: top, w: full, h: PHONE.menuButton }, button: PHONE.menuButton, gap: PHONE.menuGap, rail: false };
  const room: number = belowRight - left;
  const button: number = Math.min(PHONE.menuButton, Math.floor((room - Math.max(0, count - 1) * PHONE.menuGap) / Math.max(1, count)));
  return { rect: { x: left, y: belowTop, w: width(button), h: button }, button, gap: PHONE.menuGap, rail: false };
}

interface Corner {
  readonly zone: Rect;
  readonly minimap: Rect;
  readonly caption: Rect;
}

function cornerAt(mapSize: number, rightEdge: number, top: number, zoneRoom: number): Corner {
  const zoneWidth: number = Math.max(mapSize, Math.min(PHONE.zoneWidth, zoneRoom));
  const zone: Rect = { x: rightEdge - zoneWidth, y: top, w: zoneWidth, h: PHONE.zoneLabel };
  const minimap: Rect = { x: rightEdge - mapSize, y: bottom(zone), w: mapSize, h: mapSize };
  return { zone, minimap, caption: { x: minimap.x, y: bottom(minimap), w: mapSize, h: PHONE.caption } };
}

const sharesColumns = (a: Rect, from: number, to: number): boolean => a.x < to && from < right(a);

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

interface Span {
  readonly from: number;
  readonly to: number;
}

interface BannerRow {
  readonly y: number;
  readonly span: Span;
}

function widestFree(from: number, to: number, blockers: readonly Rect[]): Span {
  const taken: Span[] = blockers.map((rect: Rect): Span => ({ from: rect.x - PHONE.gap, to: right(rect) + PHONE.gap })).toSorted((a: Span, b: Span): number => a.from - b.from);
  let best: Span = { from, to: from };
  let cursor: number = from;
  for (const block of [...taken, { from: to, to }]) {
    const end: number = Math.min(block.from, to);
    if (end - cursor > best.to - best.from) best = { from: cursor, to: end };
    cursor = Math.max(cursor, block.to);
  }
  return best;
}

function freeRow(ys: readonly number[], height: number, minWidth: number, maxWidth: number, left: number, rightEdge: number, taken: readonly Rect[]): Rect {
  const rows: readonly BannerRow[] = ys.map((y: number): BannerRow => {
    const row: Rect = { x: left, y, w: rightEdge - left, h: height };
    return { y, span: widestFree(left, rightEdge, taken.filter((rect: Rect): boolean => overlaps(rect, row))) };
  });
  const roomOf = (row: BannerRow): number => row.span.to - row.span.from;
  const first: BannerRow = rows[0] ?? { y: left, span: { from: left, to: rightEdge } };
  const chosen: BannerRow = rows.find((row: BannerRow): boolean => roomOf(row) >= minWidth) ?? rows.reduce((a: BannerRow, b: BannerRow): BannerRow => (roomOf(b) > roomOf(a) ? b : a), first);
  const width: number = Math.min(maxWidth, roomOf(chosen));
  return { x: Math.round(chosen.span.from + (roomOf(chosen) - width) / 2), y: chosen.y, w: width, h: height };
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
  const clusterBottom: number = Math.max(bottom(life), bottom(mana));
  const zoneRoom: number = rightEdge - right(mana) - PHONE.gap;

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

  const railMap: number = Math.round(Math.min(PHONE.minimapRailMax, zoneRoom, Math.max(PHONE.minimapRailMin, width * PHONE.minimapRailShare)));
  const railCorner: Corner = cornerAt(railMap, rightEdge, top, zoneRoom);
  const railLength: number = counts.menu * PHONE.menuButton + Math.max(0, counts.menu - 1) * PHONE.menuGap;
  const railRect: Rect = { x: rightEdge - PHONE.menuButton, y: bottom(railCorner.caption) + PHONE.gap, w: PHONE.menuButton, h: railLength };
  const railFloor: number = Math.min(...controls.filter((rect: Rect): boolean => sharesColumns(rect, railRect.x, right(railRect))).map((rect: Rect): number => rect.y));
  const railFits: boolean = !landscape && !inBand && bottom(railRect) + PHONE.gap <= railFloor && railRect.x - PHONE.gap - left >= PHONE.hintMinWidth;

  const menuWidth: number = counts.menu * PHONE.menuButton + Math.max(0, counts.menu - 1) * PHONE.menuGap;
  const rowMap: number = Math.max(PHONE.minimapMin, Math.min(landscape ? PHONE.minimapLandscape : PHONE.minimapPortrait, rightEdge - left - menuWidth - PHONE.gap));
  const corner: Corner = railFits ? railCorner : cornerAt(rowMap, rightEdge, top, zoneRoom);
  const { zone, minimap } = corner;
  const caption: Rect | null = railFits ? corner.caption : null;
  const mapFoot: Rect = caption ?? minimap;
  const menu: MenuPlacement = railFits
    ? { rect: railRect, button: PHONE.menuButton, gap: PHONE.menuGap, rail: true }
    : placeMenu(counts.menu, top, right(mana) + PHONE.gap, zone.x - PHONE.gap, minimap.x - PHONE.gap, Math.ceil(clusterBottom + PHONE.gap), left);

  const bandLeft: number = inBand ? right(stick) + PHONE.gap : left;
  const bandRight: number = inBand ? grid.left - PHONE.gap : menu.rail ? menu.rect.x - PHONE.gap : rightEdge;
  const hintWidth: number = Math.min(bandRight - bandLeft, PHONE.hintMaxWidth);
  const hintBottom: number = inBand ? baseline : Math.min(...controls.map((rect: Rect): number => rect.y)) - PHONE.gap;
  const hint: Rect = { x: Math.round(bandLeft + (bandRight - bandLeft - hintWidth) / 2), y: hintBottom - PHONE.hintHeight, w: hintWidth, h: PHONE.hintHeight };

  const toastWidth: number = Math.min(bandRight - bandLeft, PHONE.toastMaxWidth);
  const toast: Rect = { x: Math.round(bandLeft + (bandRight - bandLeft - toastWidth) / 2), y: hint.y - PHONE.gap - PHONE.toastHeight, w: toastWidth, h: PHONE.toastHeight };

  const questRight: number = menu.rail ? menu.rect.x - PHONE.gap : rightEdge;
  const questWidth: number = menu.rail ? Math.min(PHONE.questWidth, questRight - PHONE.gap - left - PHONE.meterMinWidth - PHONE.gap) : PHONE.questWidth;
  const column: Rect = { x: questRight - questWidth, y: 0, w: questWidth, h: height };
  const below: number = Math.min(height, ...[toast, hint, ...controls].filter((rect: Rect): boolean => sharesColumns(rect, column.x, right(column))).map((rect: Rect): number => rect.y));
  const dialogueRight: number = attack.x - PHONE.gap;
  const overhead: readonly Rect[] = [life, mana, menu.rect, zone, mapFoot].filter((rect: Rect): boolean => sharesColumns(rect, left, dialogueRight));
  const dialogueTop: number = Math.max(baseline - PHONE.dialogueMaxHeight, Math.ceil(Math.max(clusterBottom, ...overhead.map(bottom)) + PHONE.gap));
  const dialogue: Rect = { x: left, y: dialogueTop, w: dialogueRight - left, h: baseline - dialogueTop };

  const cardWidth: number = Math.min(PHONE.cardWidth, width - safe.left - safe.right - PHONE.cardInset * 2);
  const cardHeight: number = height - safe.top - safe.bottom - PHONE.cardInset * 2;
  const card: Rect = { x: safe.left + (width - safe.left - safe.right - cardWidth) / 2, y: safe.top + PHONE.cardInset, w: cardWidth, h: cardHeight };

  const sharesColumn: boolean = !menu.rail && sharesColumns(menu.rect, column.x, right(column));
  const questTop: number = menu.rail ? menu.rect.y : Math.max(bottom(mapFoot), sharesColumn ? bottom(menu.rect) : 0) + PHONE.gap;
  const quests: Rect | null = questWidth < PHONE.questMinWidth ? null : questsRect(column, questTop, below, height);

  const taken: readonly Rect[] = [life, mana, menu.rect, zone, minimap, mapFoot, hint, toast, dialogue, ...controls, ...(quests === null ? [] : [quests])];
  const underCluster: number = Math.ceil(Math.max(clusterBottom, menu.rail ? 0 : bottom(menu.rect)) + PHONE.gap);
  const banner: Rect = freeRow([underCluster, top], PHONE.bannerHeight, PHONE.bannerMinWidth, PHONE.bannerMaxWidth, left, rightEdge, taken);
  const open: readonly Rect[] = [...taken.filter((rect: Rect): boolean => rect !== dialogue), banner];
  const targetOf = (rowHeight: number): Rect => freeRow([top, underCluster, bottom(banner) + PHONE.gap], rowHeight, PHONE.targetMinWidth, PHONE.targetMaxWidth, left, rightEdge, open);
  const meterBeside = (beside: Rect): Rect => freeRow([top, underCluster, bottom(banner) + PHONE.gap, bottom(beside) + PHONE.gap], PHONE.meterHeight, PHONE.meterMinWidth, PHONE.meterMaxWidth, left, rightEdge, [...open, beside]);
  const tall: Rect = targetOf(PHONE.targetTallHeight);
  const tallMeter: Rect = meterBeside(tall);
  const roomy: boolean = tall.w >= PHONE.targetMinWidth && tallMeter.w >= PHONE.meterMinWidth && !open.some((rect: Rect): boolean => overlaps(rect, tall) || overlaps(rect, tallMeter)) && !overlaps(tall, tallMeter);
  const target: Rect = roomy ? tall : targetOf(PHONE.targetHeight);
  const meter: Rect = roomy ? tallMeter : meterBeside(target);
  const aboveToast: Rect = { x: toast.x, y: toast.y - PHONE.gap - PHONE.barkHeight, w: toast.w, h: PHONE.barkHeight };
  const standing: readonly Rect[] = [...open, target, meter];
  const bark: Rect = aboveToast.y >= top && !standing.some((rect: Rect): boolean => overlaps(rect, aboveToast)) ? aboveToast : toast;
  const partyRow: Rect = freeRow([bottom(meter) + PHONE.gap, bottom(target) + PHONE.gap, underCluster], PHONE.partyHeight, PHONE.partyMinWidth, PHONE.partyMaxWidth, left, rightEdge, [...standing, bark, toast]);
  const party: Rect | null = partyRow.w >= PHONE.partyMinWidth ? partyRow : null;
  const above = (rect: Rect): Rect => ({ x: toast.x, y: rect.y - PHONE.gap - PHONE.inviteHeight, w: toast.w, h: PHONE.inviteHeight });
  const inviteBlockers: readonly Rect[] = [...standing.filter((rect: Rect): boolean => rect !== quests), toast, bark, ...(party === null ? [] : [party])];
  const inviteClear = (rect: Rect): boolean => rect.y >= top && !inviteBlockers.some((other: Rect): boolean => overlaps(other, rect));
  const invite: Rect = [above(bark), above(toast)].find(inviteClear) ?? toast;

  return { life, mana, menu, zone, minimap, caption, quests, hint, toast, bark, dialogue, card, banner, target, meter, party, invite, xp, stick, attack, skills, flasks };
}

export function layoutRects(layout: PhoneLayout): NamedRect[] {
  const named: NamedRect[] = [
    { name: 'life', rect: layout.life },
    { name: 'mana', rect: layout.mana },
    { name: 'menu', rect: layout.menu.rect },
    { name: 'zone', rect: layout.zone },
    { name: 'minimap', rect: layout.minimap },
    { name: 'hint', rect: layout.hint },
    { name: 'toast', rect: layout.toast },
    { name: 'banner', rect: layout.banner },
    { name: 'target', rect: layout.target },
    { name: 'meter', rect: layout.meter },
    { name: 'xp', rect: layout.xp },
    { name: 'stick', rect: layout.stick },
    { name: 'attack', rect: layout.attack },
  ];
  if (layout.caption !== null) named.push({ name: 'caption', rect: layout.caption });
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
