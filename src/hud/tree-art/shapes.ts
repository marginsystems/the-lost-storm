import { halo, spark } from '../skill-art/kit.ts';
import type { Palette } from '../skill-art/kit.ts';
import { bolt, chevron, star } from './parts.ts';
import type { Motif } from './vitals.ts';

const SPLIT_SEAM: string = 'M32 55L30 43L33 32L25 26L23 22L12 11M33 32L41 24L43 19L53 9';
const BOOT: string = 'M22 15H34V34C36 37.6 42 39.6 47 41C50.6 42 52 44.6 52 47.6V50H21V44C21 40 22 36 22 31Z';
const WING: string = 'M23 22C15 17 8 17 3 19.6C8 21.4 11 23.4 13 25.6C9 25.6 6 26.6 4 28.6C10 30 16 29 22 27C17 28.8 13 31 11 33.4C16 33.6 20 32.4 23 30Z';
const PRINT: string = 'M0 -9C3.4 -9 5 -5.6 4.6 -1.6C4.4 1.4 3 3.4 0 3.4C-3 3.4 -4.4 1.4 -4.6 -1.6C-5 -5.6 -3.4 -9 0 -9ZM0 5.4C2.6 5.4 3.6 7 3.4 8.6C3.2 10.4 1.8 11.2 0 11.2C-1.8 11.2 -3.2 10.4 -3.4 8.6C-3.6 7 -2.6 5.4 0 5.4Z';

function print(x: number, y: number, turn: number, fill: string, opacity: number): string {
  return `<path d="${PRINT}" transform="translate(${x} ${y}) rotate(${turn}) scale(0.78)" fill="${fill}" stroke="#05070c" stroke-opacity="0.6" stroke-width="0.8" opacity="${opacity}"/>`;
}

function orb(x: number, y: number, r: number, p: Palette, opacity: number): string {
  return `<g opacity="${opacity}">${halo(x, y, r * 2, p.hot, 0.55)}<circle cx="${x}" cy="${y}" r="${r}" fill="url(#core)"/><circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="#fff"/></g>`;
}

export const SHAPES: ReadonlyMap<string, Motif> = new Map<string, Motif>([
  ['swift', (p: Palette): string => `
${halo(36, 34, 20, p.hot, 0.3)}
<path d="M4 40H17M2 45.6H16M7 51H19" stroke="url(#energyX)" stroke-width="2.4" stroke-linecap="round"/>
<path d="${BOOT}" fill="url(#leather)" stroke="#1a1008" stroke-width="0.8"/>
<rect x="20" y="47.6" width="33" height="3.6" rx="1.2" fill="#1a1008"/>
<rect x="21" y="15" width="14" height="4.4" rx="1" fill="#8a5a30"/>
<path d="M24 22L32 24M24 27L32 29" stroke="#d8b080" stroke-width="1" opacity="0.6"/>
<path d="M36 37C41 40 46 41 49 42" fill="none" stroke="#c89a68" stroke-width="1" opacity="0.6"/>
<path d="${WING}" fill="#f2f6fc" stroke="#9fb0c4" stroke-width="0.6" filter="url(#glow)"/>
<path d="M22 22C16 19 10 19 6 20" fill="none" stroke="${p.light}" stroke-width="0.8"/>`],
  ['moving', (p: Palette): string => `
${halo(36, 28, 24, p.hot, 0.32)}
<path d="M6 58L54 10" stroke="url(#energyX)" stroke-width="12" stroke-linecap="round" opacity="0.22" filter="url(#bloom)"/>
${print(12, 52, 45, p.light, 0.3)}
${print(25, 46, 45, p.light, 0.5)}
${print(28, 32, 45, p.light, 0.75)}
${print(41, 26, 45, '#ffffff', 1)}
<path d="M44 12C48 10 52 11 54 14M50 20C53 19 56 20 57 22" fill="none" stroke="${p.light}" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>
<path d="M4 34H14M8 28H16M2 40H10" stroke="${p.hot}" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>`],
  ['still', (p: Palette): string => `
${halo(32, 32, 24, p.hot, 0.32)}
<path d="M8 58C16 52 24 54 32 50C40 54 48 52 56 58" fill="none" stroke="${p.hot}" stroke-width="2" opacity="0.6" filter="url(#glow)"/>
<circle cx="32" cy="11" r="4.4" fill="none" stroke="url(#steel)" stroke-width="2.6"/>
<rect x="29.8" y="15" width="4.4" height="34" rx="1.4" fill="url(#iron)"/>
<rect x="21" y="19.4" width="22" height="4" rx="1.6" fill="url(#steel)"/>
<path d="M13 35C14.6 47 23 52.6 32 52.6C41 52.6 49.4 47 51 35" fill="none" stroke="url(#iron)" stroke-width="4.4" stroke-linecap="round"/>
<path d="M8.6 38.6L13 30.6L17.4 38Z M55.4 38.6L51 30.6L46.6 38Z" fill="url(#steel)"/>
<path d="M30.6 16V46" stroke="#fff" stroke-width="0.8" opacity="0.5"/>`],
  ['area', (p: Palette): string => `
${halo(32, 38, 24, p.hot, 0.38)}
<ellipse cx="32" cy="40" rx="27" ry="10" fill="none" stroke="${p.hot}" stroke-width="2" opacity="0.4" filter="url(#glow)"/>
<ellipse cx="32" cy="40" rx="19" ry="7" fill="none" stroke="${p.hot}" stroke-width="2.4" opacity="0.7" filter="url(#glow)"/>
<ellipse cx="32" cy="40" rx="10" ry="3.8" fill="none" stroke="${p.light}" stroke-width="2.6" filter="url(#glow)"/>
<ellipse cx="32" cy="40" rx="5" ry="2" fill="#fff"/>
<path d="M32 38L32 12M26 38L20 20M38 38L44 20" stroke="${p.light}" stroke-width="1.6" stroke-linecap="round" opacity="0.7" filter="url(#glow)"/>
<path d="${star(32, 36, 10, 2.6, 4)}" fill="#fff" filter="url(#glow)"/>
${spark(14, 30, 1, p.light)}
${spark(50, 28, 1.1, p.light)}
${spark(32, 8, 1.2, '#fff')}`],
  ['duration', (p: Palette): string => `
${halo(32, 32, 22, p.hot, 0.32)}
${halo(32, 44, 10, '#ffd27a', 0.4)}
<rect x="15" y="8" width="34" height="5" rx="2" fill="url(#wood)"/>
<rect x="15" y="51" width="34" height="5" rx="2" fill="url(#wood)"/>
<rect x="17" y="12" width="3" height="40" rx="1" fill="url(#wood)"/>
<rect x="44" y="12" width="3" height="40" rx="1" fill="url(#wood)"/>
<path d="M22 13H42C42 23 35 27.6 33.4 32C35 36.4 42 41 42 51H22C22 41 29 36.4 30.6 32C29 27.6 22 23 22 13Z" fill="url(#tGlass)" stroke="#e6eef6" stroke-opacity="0.7" stroke-width="0.9"/>
<path d="M25 18H39C38 23.6 34 27 32 30.4C30 27 26 23.6 25 18Z" fill="url(#tGold)"/>
<path d="M32 30.4V46" stroke="#ffe08a" stroke-width="1.1" filter="url(#glow)"/>
<path d="M24 51C25.6 44.6 30 42 32 41.4C34 42 38.4 44.6 40 51Z" fill="url(#tGold)"/>
<path d="M24.6 16C25.4 21 28 24 30 26.4" fill="none" stroke="#fff" stroke-width="1" opacity="0.6"/>`],
  ['cooldown', (p: Palette): string => `
${halo(32, 32, 22, p.hot, 0.35)}
<path d="M45.8 20.4A18 18 0 1 1 25.8 15.1" fill="none" stroke="${p.hot}" stroke-width="5" stroke-linecap="round" opacity="0.55" filter="url(#bloom)"/>
<path d="M45.8 20.4A18 18 0 1 1 25.8 15.1" fill="none" stroke="url(#energy)" stroke-width="4.2" stroke-linecap="round"/>
<path d="M45.8 20.4A18 18 0 1 1 25.8 15.1" fill="none" stroke="${p.light}" stroke-width="1" stroke-linecap="round"/>
<path d="M34.6 12.2L25.6 9.2L26.6 21Z" fill="${p.light}" filter="url(#glow)"/>
<circle cx="32" cy="32" r="9" fill="${p.deep}" stroke="${p.light}" stroke-opacity="0.6" stroke-width="1"/>
<path d="M32 32V25.4M32 32L37 34.6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
<circle cx="32" cy="32" r="1.4" fill="url(#tGold)"/>`],
  ['reach', (p: Palette): string => `
${halo(48, 14, 12, p.hot, 0.5)}
<path d="M8 58Q10 22 48 14" fill="none" stroke="${p.light}" stroke-width="1.2" stroke-dasharray="2 3.4" opacity="0.6"/>
<path d="M6 56L40 22" stroke="url(#energyX)" stroke-width="5" stroke-linecap="round" opacity="0.55" filter="url(#glow)"/>
${bolt(12, 50, 44, 18)}
<circle cx="50" cy="12" r="7" fill="none" stroke="url(#tGold)" stroke-width="1.8"/>
<circle cx="50" cy="12" r="3.4" fill="none" stroke="#fff6c8" stroke-width="1.2"/>
${spark(50, 12, 1.4, '#fff')}`],
  ['knockback', (p: Palette): string => `
${halo(26, 32, 18, p.hot, 0.3)}
<rect x="6" y="20" width="20" height="24" rx="4.4" fill="url(#iron)"/>
<rect x="18" y="18" width="9" height="28" rx="3" fill="url(#steel)"/>
<path d="M19 20.4H26" stroke="#fff" stroke-width="1" opacity="0.7"/>
${halo(29, 32, 7, '#fff', 0.6)}
${chevron(36, 32, 22, 9, '#fff', 1, 90)}
${chevron(45, 32, 22, 9, p.light, 0.7, 90)}
${chevron(54, 32, 22, 9, p.hot, 0.45, 90)}`],
  ['stagger', (p: Palette): string => `
${halo(32, 38, 20, p.hot, 0.3)}
<path d="M16 46C16 31 22.6 23 32 23C41.4 23 48 31 48 46V52H16Z" fill="url(#iron)"/>
<path d="M32 23C41.4 23 48 31 48 46V52H40V40C40 31 37 25 32 23Z" fill="#000" opacity="0.22"/>
<rect x="20" y="38" width="24" height="3.6" rx="1.4" fill="#06080c"/>
<path d="M32 23V52" stroke="#c4ccd6" stroke-width="2.6"/><path d="M31.2 24V52" stroke="#fff" stroke-width="0.6" opacity="0.7"/>
<path d="M20 30C23 26 27 24.4 31 24.2" fill="none" stroke="#fff" stroke-width="1" opacity="0.6"/>
<ellipse cx="32" cy="15" rx="19" ry="5.6" fill="none" stroke="url(#tGold)" stroke-width="1.2" opacity="0.6"/>
<path d="${star(14.6, 16.6, 4.6, 1.4, 4)}" fill="#fff6c8" filter="url(#glow)"/>
<path d="${star(32, 9.4, 4, 1.2, 4)}" fill="#fff6c8" filter="url(#glow)"/>
<path d="${star(48.4, 18.6, 4.4, 1.3, 4)}" fill="#fff6c8" filter="url(#glow)"/>`],
  ['momentum', (p: Palette): string => `
${halo(32, 26, 22, p.hot, 0.38)}
${chevron(32, 48, 30, 12, p.hot, 0.45)}
${chevron(32, 36, 30, 12, p.hot, 0.75)}
${chevron(32, 24, 30, 12, p.light, 1)}
<path d="M17 24L32 12L47 24" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
${spark(32, 8, 1.6, '#fff')}`],
  ['volley', (p: Palette): string => `
${halo(32, 18, 22, p.hot, 0.38)}
${halo(32, 56, 9, p.hot, 0.5)}
<path d="M24 58L8 20M32 60V8M40 58L56 20" stroke="url(#energy)" stroke-width="6" stroke-linecap="round" opacity="0.4" filter="url(#bloom)"/>
${bolt(24, 58, 8, 18)}
${bolt(32, 60, 32, 6)}
${bolt(40, 58, 56, 18)}
${spark(8, 18, 1.4, '#fff')}
${spark(32, 6, 1.6, '#fff')}
${spark(56, 18, 1.4, '#fff')}`],
  ['pierce', (p: Palette): string => `
${halo(32, 32, 22, p.hot, 0.3)}
<ellipse cx="22" cy="42" rx="5.4" ry="10" transform="rotate(45 22 42)" fill="#1a1e26" stroke="url(#iron)" stroke-width="2.2"/>
<ellipse cx="40" cy="24" rx="5.4" ry="10" transform="rotate(45 40 24)" fill="#1a1e26" stroke="url(#iron)" stroke-width="2.2"/>
${halo(22, 42, 4, p.hot, 0.9)}
${halo(40, 24, 4, p.hot, 0.9)}
<path d="M6 58L52 12" stroke="url(#energyX)" stroke-width="4" stroke-linecap="round" opacity="0.6" filter="url(#glow)"/>
${bolt(8, 56, 54, 10)}
${spark(22, 42, 1.4, p.light)}
${spark(40, 24, 1.4, p.light)}`],
  ['split_seam', (p: Palette): string => `
${halo(32, 32, 23, p.hot, 0.32)}
<g fill="none" stroke-linejoin="round" stroke-linecap="round">
<path d="${SPLIT_SEAM}" stroke="${p.hot}" stroke-width="8" opacity="0.68" filter="url(#bloom)"/>
<path d="${SPLIT_SEAM}" stroke="url(#energy)" stroke-width="4"/>
<path d="${SPLIT_SEAM}" stroke="${p.light}" stroke-width="1.4"/>
</g>
${spark(33, 32, 2.6, '#fff')}
${spark(19, 17, 1.5, p.light)}
${spark(47, 15, 1.2, p.light)}`],
  ['chain', (p: Palette): string => `
${halo(32, 32, 22, p.hot, 0.28)}
<path d="M13 46L19 38L16 33L24 27L23 22L32 17M32 17L38 24L37 29L45 33L44 38L51 44" fill="none" stroke="${p.hot}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.6" filter="url(#bloom)"/>
<path d="M13 46L19 38L16 33L24 27L23 22L32 17M32 17L38 24L37 29L45 33L44 38L51 44" fill="none" stroke="url(#tBolt)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
${orb(13, 46, 5, p, 1)}
${orb(32, 17, 5.4, p, 1)}
${orb(51, 44, 5, p, 1)}`],
  ['echo', (p: Palette): string => `
${halo(32, 32, 22, p.hot, 0.3)}
${orb(17, 32, 5.4, p, 0.3)}
${orb(47, 32, 5.4, p, 0.3)}
<path d="M22 18A18 18 0 0 0 22 46M42 18A18 18 0 0 1 42 46" fill="none" stroke="${p.light}" stroke-width="2" stroke-linecap="round" opacity="0.8" filter="url(#glow)"/>
<path d="M14 12A26 26 0 0 0 14 52M50 12A26 26 0 0 1 50 52" fill="none" stroke="${p.hot}" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>
${orb(32, 32, 7.4, p, 1)}`],
  ['pull', (p: Palette): string => `
${halo(32, 32, 24, p.hot, 0.35)}
<circle cx="32" cy="32" r="9" fill="url(#tVoid)"/>
<g fill="none" stroke-linecap="round">
<path d="M32 6C47 7 57 20 53 33C51 40 44 43 39 39" stroke="url(#energy)" stroke-width="3.4"/>
<path d="M32 6C47 7 57 20 53 33C51 40 44 43 39 39" stroke="url(#energy)" stroke-width="3.4" transform="rotate(120 32 32)"/>
<path d="M32 6C47 7 57 20 53 33C51 40 44 43 39 39" stroke="url(#energy)" stroke-width="3.4" transform="rotate(240 32 32)"/>
<path d="M32 6C47 7 57 20 53 33" stroke="${p.light}" stroke-width="1" opacity="0.8"/>
<path d="M32 6C47 7 57 20 53 33" stroke="${p.light}" stroke-width="1" opacity="0.8" transform="rotate(120 32 32)"/>
<path d="M32 6C47 7 57 20 53 33" stroke="${p.light}" stroke-width="1" opacity="0.8" transform="rotate(240 32 32)"/>
</g>
<circle cx="32" cy="32" r="4.4" fill="none" stroke="${p.light}" stroke-width="1.2" filter="url(#glow)"/>`],
]);
