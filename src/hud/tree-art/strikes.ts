import { fire, flame, halo, spark } from '../skill-art/kit.ts';
import type { Palette } from '../skill-art/kit.ts';
import { around, bolt, shieldPlate, star, sword, turned } from './parts.ts';
import type { Motif } from './vitals.ts';

const SLASH: string = 'M10 46C17 24 35 12 55 11C40 17 26 30 17 50Z';

export const STRIKES: ReadonlyMap<string, Motif> = new Map<string, Motif>([
  ['power_storm', (p: Palette): string => `
${halo(32, 30, 22, p.hot, 0.35)}
${halo(30, 34, 12, '#4aa8ff', 0.6)}
<path d="M27 22L18 18M24 38L13 42M40 30L52 26" stroke="#9fd8ff" stroke-width="1.4" stroke-linecap="round" opacity="0.8" filter="url(#glow)"/>
<path d="M37 5L21 32H31L24 59L45 25H34L43 5Z" fill="url(#tBolt)" stroke="#ffffff" stroke-width="0.8" filter="url(#glow)"/>
<path d="M37 5L30 18L36 18" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.8"/>
${spark(24, 58, 2, '#eaf9ff')}
${spark(50, 12, 1, '#eaf9ff')}`],
  ['power_fire', (p: Palette): string => `
${halo(32, 40, 20, '#ff5a12', 0.55)}
${halo(32, 30, 26, p.hot, 0.16)}
${fire(32, 54, 40, 10, 1.5)}
${spark(16, 30, 1, '#ffd27a')}
${spark(48, 22, 0.9, '#ffe9b8')}
${spark(44, 14, 0.7, '#ffd27a')}`],
  ['power_blade', (p: Palette): string => `
${halo(34, 28, 22, p.hot, 0.32)}
<path d="${SLASH}" fill="${p.light}" opacity="0.4" filter="url(#bloom)"/>
${turned(42, sword())}
<path d="${SLASH}" fill="url(#edge)" opacity="0.9"/>
<path d="M14 44C22 26 36 16 52 13" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity="0.9"/>
${spark(52, 13, 1.6, '#fff')}`],
  ['power_shot', (p: Palette): string => `
${halo(44, 20, 14, p.hot, 0.45)}
<path d="M6 58L40 24" stroke="url(#energyX)" stroke-width="6" stroke-linecap="round" opacity="0.5" filter="url(#bloom)"/>
<path d="M8 50L30 28M14 56L36 34" stroke="${p.light}" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
${bolt(10, 54, 46, 18)}
<path d="${star(50, 14, 8, 2.4, 4, 45)}" fill="#fff" filter="url(#glow)"/>
${spark(50, 14, 2, '#fff')}`],
  ['power_shadow', (p: Palette): string => `
<ellipse cx="32" cy="48" rx="22" ry="9" fill="${p.core}" opacity="0.8" filter="url(#bloom)"/>
<ellipse cx="22" cy="40" rx="9" ry="7" fill="${p.hot}" opacity="0.35" filter="url(#bloom)"/>
<ellipse cx="42" cy="42" rx="10" ry="7" fill="${p.hot}" opacity="0.3" filter="url(#bloom)"/>
${halo(32, 26, 16, p.hot, 0.5)}
<g transform="rotate(180 32 32)" filter="url(#glow)">${sword()}</g>
<path d="M28.6 24V52L32 58L35.4 52V24Z" fill="${p.hot}" opacity="0.35"/>
<path d="M14 52C20 46 26 50 32 46C38 50 44 46 50 52" fill="none" stroke="${p.hot}" stroke-width="2" stroke-linecap="round" opacity="0.8" filter="url(#glow)"/>
${spark(20, 26, 0.9, p.light)}
${spark(46, 30, 0.8, p.light)}`],
  ['power_tide', (p: Palette): string => `
${halo(32, 36, 22, p.hot, 0.35)}
<path d="M6 48C11 30 28 18 44 22C53 24.4 57 33 53 40C50 34 43 33 40 38C37 44 42 50 49 49C40 58 15 59 6 48Z" fill="url(#energy)"/>
<path d="M6 48C11 30 28 18 44 22C53 24.4 57 33 53 40" fill="none" stroke="#f2fffc" stroke-width="2" stroke-linecap="round" filter="url(#glow)"/>
<path d="M40 38C37 44 42 50 49 49" fill="none" stroke="#f2fffc" stroke-width="1.2" opacity="0.8"/>
<path d="M14 44C20 34 30 28 40 28" fill="none" stroke="#fff" stroke-width="0.9" opacity="0.5"/>
${spark(54, 28, 1.2, '#f2fffc')}
${spark(46, 18, 1, '#f2fffc')}
${spark(58, 36, 0.8, '#f2fffc')}`],
  ['power_echo', (p: Palette): string => `
${halo(32, 30, 22, p.hot, 0.3)}
<g opacity="0.3">${turned(-24, sword())}</g>
<g opacity="0.3">${turned(24, sword())}</g>
${sword()}
<path d="M14 14A26 26 0 0 0 14 50M50 14A26 26 0 0 1 50 50" fill="none" stroke="${p.light}" stroke-width="1.8" stroke-linecap="round" opacity="0.7" filter="url(#glow)"/>
${spark(32, 8, 1.6, '#fff')}`],
  ['might', (p: Palette): string => `
${halo(32, 30, 22, '#ff5a2a', 0.45)}
${halo(32, 30, 26, p.hot, 0.2)}
<path d="M32 4V10M10 14L15 18M54 14L49 18M6 32H11M58 32H53" stroke="#ffd27a" stroke-width="2" stroke-linecap="round" opacity="0.8" filter="url(#glow)"/>
<rect x="18" y="24" width="28" height="22" rx="6" fill="url(#iron)"/>
<rect x="17.5" y="15.5" width="7.6" height="12" rx="3.6" fill="url(#steel)"/>
<rect x="25" y="14" width="7.6" height="13" rx="3.6" fill="url(#steel)"/>
<rect x="32.5" y="14" width="7.6" height="13" rx="3.6" fill="url(#steel)"/>
<rect x="40" y="15.5" width="7.6" height="12" rx="3.6" fill="url(#steel)"/>
<path d="M18 30C12.6 30 10.6 35.6 13 40C15 43.6 21 44 26 41.6V32.4Z" fill="url(#steel)"/>
<rect x="19.5" y="44.5" width="25" height="10" rx="2" fill="url(#leather)"/>
<rect x="19.5" y="44.5" width="25" height="2.6" fill="url(#tGold)"/>
<path d="M19 17C22 15.4 30 13.6 40 15" fill="none" stroke="#fff" stroke-width="1" opacity="0.6"/>`],
  ['edge', (p: Palette): string => `
${halo(26, 42, 14, '#ff9a2a', 0.5)}
${halo(36, 26, 20, p.hot, 0.22)}
<rect x="9" y="38" width="30" height="12" rx="3.4" fill="url(#iron)" transform="rotate(-16 24 44)"/>
<rect x="11" y="39" width="26" height="3" rx="1.4" fill="#c4ccd6" opacity="0.5" transform="rotate(-16 24 44)"/>
${turned(52, sword())}
<path d="M28 38L18 30M28 38L16 38M28 38L22 26M28 38L14 33" stroke="#ffd27a" stroke-width="1.3" stroke-linecap="round" filter="url(#glow)"/>
${spark(28, 38, 2.2, '#fff6c8')}
${spark(13, 28, 0.9, '#ffd27a')}
${spark(17, 22, 0.7, '#ffe9b8')}`],
  ['crit', (p: Palette): string => `
${halo(32, 32, 22, p.hot, 0.28)}
${halo(32, 32, 9, '#ffd27a', 0.7)}
<path d="M14.6 24A19 19 0 0 1 24 14.6M40 14.6A19 19 0 0 1 49.4 24M49.4 40A19 19 0 0 1 40 49.4M24 49.4A19 19 0 0 1 14.6 40" fill="none" stroke="url(#tGold)" stroke-width="3.4" stroke-linecap="round"/>
<path d="M32 6V15M32 49V58M6 32H15M49 32H58" stroke="${p.light}" stroke-width="2" stroke-linecap="round"/>
<path d="${star(32, 32, 13, 3, 4)}" fill="#fff" filter="url(#glow)"/>
<path d="${star(32, 32, 6, 1.6, 4, 45)}" fill="#fff6c8"/>`],
  ['crit_power', (p: Palette): string => `
${halo(32, 32, 20, '#ff6a2a', 0.55)}
${halo(32, 32, 27, p.hot, 0.18)}
<path d="${star(32, 32, 25, 10, 8)}" fill="url(#tGold)" stroke="#fff3c0" stroke-width="0.6"/>
<path d="${star(32, 32, 16, 6, 8, 22.5)}" fill="#ff5a2a" opacity="0.85"/>
<path d="${star(32, 32, 9, 3.4, 4)}" fill="#fff" filter="url(#glow)"/>
<path d="M50 8L55 6L53 11Z M8 50L12 54L7 56Z M53 53L58 52L55 57Z M9 9L13 8L11 13Z" fill="#fff3c0"/>`],
  ['haste', (p: Palette): string => `
${halo(36, 26, 22, p.hot, 0.3)}
<path d="M18.4 11A24 24 0 0 1 50.6 14.4" fill="none" stroke="url(#energyX)" stroke-width="3" stroke-linecap="round" filter="url(#glow)"/>
<path d="M14 19A22 22 0 0 1 36 10" fill="none" stroke="${p.light}" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
<g opacity="0.16">${turned(-16, sword())}</g>
<g opacity="0.32">${turned(12, sword())}</g>
${turned(40, sword())}
${spark(50.6, 14.4, 1.4, '#fff')}`],
  ['on_hit', (p: Palette): string => `
${halo(26, 38, 16, p.hot, 0.45)}
<path d="${star(26, 38, 18, 5, 8)}" fill="${p.hot}" opacity="0.5" filter="url(#bloom)"/>
<path d="${star(26, 38, 15, 4.4, 8)}" fill="url(#tGold)"/>
<path d="${star(26, 38, 8, 2.4, 4)}" fill="#fff" filter="url(#glow)"/>
<path d="M34 30L41 26L39 20L48 14L46 10L54 6" fill="none" stroke="${p.light}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
<path d="${star(54, 7, 5, 1.6, 4)}" fill="#fff" filter="url(#glow)"/>`],
  ['on_kill', (p: Palette): string => `
${halo(32, 18, 14, p.hot, 0.55)}
<path d="${flame(32, 22, 20, 7, 1)}" fill="url(#energy)" filter="url(#glow)"/>
<path d="${flame(32, 21, 11, 3.6, 0.6)}" fill="${p.light}"/>
<path d="M18 34C18 25 24 20 32 20C40 20 46 25 46 34C46 39 43.6 42 41 43.6V49H23V43.6C20.4 42 18 39 18 34Z" fill="url(#tBone)" stroke="#3a3024" stroke-width="0.7"/>
<ellipse cx="26" cy="35" rx="4" ry="4.6" fill="#0a0608"/>
<ellipse cx="38" cy="35" rx="4" ry="4.6" fill="#0a0608"/>
<circle cx="26" cy="35.6" r="1.6" fill="${p.hot}" filter="url(#glow)"/>
<circle cx="38" cy="35.6" r="1.6" fill="${p.hot}" filter="url(#glow)"/>
<path d="M30.6 40.6L32 38L33.4 40.6Z" fill="#0a0608"/>
<path d="M27 49V54H37V49M30.4 49V54M33.6 49V54" fill="url(#tBone)" stroke="#3a3024" stroke-width="0.7"/>
<path d="M21 27C23 23.4 27 21.6 31 21.6" fill="none" stroke="#fff" stroke-width="1.1" opacity="0.7"/>`],
  ['on_struck', (p: Palette): string => `
${halo(32, 32, 24, p.hot, 0.4)}
<path d="M32 2L35 14L46 6L42 18L56 16L46 25L60 32L46 37L56 47L42 45L46 58L35 50L32 62L29 50L18 58L22 45L8 47L18 37L4 32L18 25L8 16L22 18L18 6L29 14Z" fill="${p.light}" opacity="0.55" filter="url(#glow)"/>
${around(32, 33, 0.8, shieldPlate())}
<path d="M33 15L30 24L35 30L29 38L32 46" fill="none" stroke="#0b0d12" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M33 15L30 24L35 30L29 38L32 46" fill="none" stroke="${p.hot}" stroke-width="0.8" stroke-linejoin="round" filter="url(#glow)"/>`],
  ['empower', (p: Palette): string => `
${halo(32, 34, 22, p.hot, 0.45)}
<path d="${flame(18, 56, 34, 6, 3)}" fill="url(#energy)" opacity="0.9" filter="url(#glow)"/>
<path d="${flame(46, 56, 34, 6, -3)}" fill="url(#energy)" opacity="0.9" filter="url(#glow)"/>
<path d="${flame(32, 60, 26, 9, 0)}" fill="url(#energy)" opacity="0.6" filter="url(#bloom)"/>
${sword()}
${spark(14, 18, 1, p.light)}
${spark(50, 16, 1.1, p.light)}
${spark(32, 4, 1.4, '#fff')}`],
]);
