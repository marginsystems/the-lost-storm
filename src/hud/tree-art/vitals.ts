import { halo, spark } from '../skill-art/kit.ts';
import type { Palette } from '../skill-art/kit.ts';
import { around, crystalGem, heartGem, shieldPlate, star, sword, turned } from './parts.ts';

export type Motif = (palette: Palette) => string;

const DROP: string = 'M0 -9C3.6 -3.6 6 -0.4 6 3A6 6 0 0 1 -6 3C-6 -0.4 -3.6 -3.6 0 -9Z';

function drop(x: number, y: number, scale: number, fill: string): string {
  return `<path d="${DROP}" transform="translate(${x} ${y}) scale(${scale})" fill="${fill}"/>`
    + `<ellipse cx="${x - 2 * scale}" cy="${y + 1.5 * scale}" rx="${1.3 * scale}" ry="${2 * scale}" fill="#fff" opacity="0.6"/>`;
}

function snowflake(cx: number, cy: number, r: number): string {
  const arms: string[] = [];
  for (const turn of [0, 60, 120]) {
    arms.push(`<g transform="rotate(${turn} ${cx} ${cy})"><path d="M${cx} ${cy - r}V${cy + r}M${cx - r * 0.3} ${cy - r * 0.78}L${cx} ${cy - r * 0.52}L${cx + r * 0.3} ${cy - r * 0.78}M${cx - r * 0.3} ${cy + r * 0.78}L${cx} ${cy + r * 0.52}L${cx + r * 0.3} ${cy + r * 0.78}"/></g>`);
  }
  return `<g fill="none" stroke="#f2fdff" stroke-width="2.2" stroke-linecap="round" filter="url(#glow)">${arms.join('')}</g>`;
}

export const VITALS: ReadonlyMap<string, Motif> = new Map<string, Motif>([
  ['life', (p: Palette): string => `
${halo(32, 34, 17, '#ff2a3a', 0.5)}
${halo(32, 34, 24, p.hot, 0.18)}
${heartGem()}
${spark(41, 22, 1.4, '#fff')}
${spark(19, 38, 0.8, '#ffd0c8')}`],
  ['life_regen', (p: Palette): string => `
${halo(28, 38, 15, '#ff2a3a', 0.4)}
${halo(44, 22, 12, '#5fe08a', 0.35)}
${halo(32, 32, 24, p.hot, 0.14)}
${around(27, 38, 0.7, heartGem())}
<path d="M44 50C52 42 52 28 44 18" fill="none" stroke="#6ee68e" stroke-width="3" stroke-linecap="round" filter="url(#glow)"/>
<path d="M38.6 20.6L44 14.6L48.6 21.6Z" fill="#c8ffd4" filter="url(#glow)"/>
<path d="M17 18h6M20 15v6" stroke="#c8ffd4" stroke-width="2" stroke-linecap="round" filter="url(#glow)"/>
${spark(52, 34, 1.2, '#c8ffd4')}
${spark(40, 30, 0.9, '#6ee68e')}
${spark(50, 12, 1, '#eaffef')}`],
  ['mana', (p: Palette): string => `
${halo(32, 32, 18, '#2a7cff', 0.55)}
${halo(32, 32, 25, p.hot, 0.16)}
${crystalGem()}
${spark(37, 14, 1.3, '#fff')}
${spark(16, 40, 0.8, '#bfe6ff')}
${spark(49, 44, 0.8, '#bfe6ff')}`],
  ['mana_regen', (p: Palette): string => `
${halo(28, 30, 15, '#2a7cff', 0.5)}
${halo(32, 32, 25, p.hot, 0.14)}
${around(28, 30, 0.68, crystalGem())}
<path d="M12 44C18 56 42 58 50 44C55 35 52 24 44 18" fill="none" stroke="#6cc4ff" stroke-width="3" stroke-linecap="round" filter="url(#glow)"/>
<path d="M12 44C18 56 42 58 50 44" fill="none" stroke="#e8f9ff" stroke-width="1" stroke-linecap="round"/>
<path d="M38.4 20.4L43 13.6L47.6 21.4Z" fill="#e8f9ff" filter="url(#glow)"/>
${spark(52, 30, 1.1, '#e8f9ff')}
${spark(20, 54, 0.9, '#6cc4ff')}`],
  ['vigour', (p: Palette): string => `
${halo(22, 34, 13, '#ff2a3a', 0.45)}
${halo(42, 32, 13, '#2a7cff', 0.45)}
${halo(32, 32, 25, p.hot, 0.14)}
${around(42, 31, 0.7, crystalGem())}
${around(23, 35, 0.66, heartGem())}
${spark(32, 14, 1.2, '#fff')}`],
  ['armour', (p: Palette): string => `
${halo(32, 32, 22, p.hot, 0.3)}
${shieldPlate()}
${spark(18, 14, 1, '#fff')}`],
  ['frost_ward', (p: Palette): string => `
${halo(32, 32, 22, '#8fe0ff', 0.35)}
${halo(32, 32, 26, p.hot, 0.12)}
${around(32, 33, 0.92, shieldPlate())}
${halo(32, 30, 9, '#8fe0ff', 0.7)}
${snowflake(32, 30, 10)}
${spark(46, 14, 1, '#f2fdff')}
${spark(14, 46, 0.8, '#bff0ff')}`],
  ['storm_ward', (p: Palette): string => `
${halo(32, 32, 22, '#4aa8ff', 0.35)}
${halo(32, 32, 26, p.hot, 0.12)}
${around(32, 33, 0.92, shieldPlate())}
${halo(32, 31, 10, '#7ccaff', 0.7)}
<path d="M35 14L24 33H31L27 48L41 27H34L39 14Z" fill="url(#tBolt)" stroke="#eaf9ff" stroke-width="0.6" filter="url(#glow)"/>
${spark(48, 16, 1, '#eaf9ff')}`],
  ['flask', (p: Palette): string => `
${halo(32, 40, 18, '#ff2a3a', 0.4)}
${halo(32, 32, 25, p.hot, 0.14)}
<rect x="27" y="7.5" width="10" height="5" rx="1.4" fill="url(#wood)"/>
<rect x="28.4" y="12" width="7.2" height="10" fill="url(#tGlass)" stroke="#e6eef6" stroke-opacity="0.6" stroke-width="0.8"/>
<circle cx="32" cy="38" r="16" fill="#140608" opacity="0.6"/>
<path d="M16.6 34A16 16 0 0 0 47.4 34C43 31 37 37 32 34C27 31 21 37 16.6 34Z" fill="url(#tBlood)" transform="translate(0 4)"/>
<circle cx="32" cy="38" r="16" fill="url(#tGlass)" stroke="#e6eef6" stroke-opacity="0.65" stroke-width="1"/>
<ellipse cx="24.5" cy="31" rx="3" ry="5.2" transform="rotate(30 24.5 31)" fill="#fff" opacity="0.5"/>
<circle cx="36" cy="46" r="1.6" fill="#ffd0c8" opacity="0.8"/><circle cx="29" cy="49" r="1.1" fill="#ffd0c8" opacity="0.7"/><circle cx="40" cy="42" r="0.9" fill="#ffd0c8" opacity="0.7"/>`],
  ['poised', (p: Palette): string => `
${halo(32, 36, 16, '#ff2a3a', 0.4)}
${halo(32, 14, 10, '#ffd27a', 0.5)}
${halo(32, 32, 25, p.hot, 0.14)}
${around(32, 37, 0.8, heartGem())}
<ellipse cx="32" cy="13" rx="11" ry="3.6" fill="none" stroke="url(#tGold)" stroke-width="2.6" filter="url(#glow)"/>
<ellipse cx="32" cy="13" rx="11" ry="3.6" fill="none" stroke="#fff6c8" stroke-width="0.8"/>
${spark(16, 24, 0.9, '#fff6c8')}
${spark(48, 24, 0.9, '#fff6c8')}`],
  ['leech', (p: Palette): string => `
${halo(46, 46, 13, '#ff2a3a', 0.55)}
${halo(30, 28, 20, p.hot, 0.22)}
${turned(45, sword())}
<path d="M38.6 22.6L42.4 18.8L44.6 21L40.8 24.8Z" fill="#c8101e" opacity="0.9"/>
<path d="M33 29L36.4 25.6L37.6 26.8L34.2 30.2Z" fill="#c8101e" opacity="0.8"/>
<path d="M50 13C60 22 60 36 52 42" fill="none" stroke="#ff3a4a" stroke-width="2.6" stroke-linecap="round" filter="url(#glow)"/>
<path d="M50 13C60 22 60 36 52 42" fill="none" stroke="#ffd0c8" stroke-width="0.9" stroke-linecap="round"/>
${around(46, 47, 0.46, heartGem())}
${drop(40, 34, 0.7, 'url(#tBlood)')}
${spark(57, 26, 1, '#ffd0c8')}`],
  ['thrift', (p: Palette): string => `
${halo(26, 28, 15, '#2a7cff', 0.5)}
${halo(44, 46, 11, '#ffd27a', 0.45)}
${halo(32, 32, 25, p.hot, 0.12)}
${around(25, 27, 0.66, crystalGem())}
<circle cx="44" cy="45" r="9.5" fill="url(#tGold)" stroke="#7a4610" stroke-width="0.8"/>
<circle cx="44" cy="45" r="6.8" fill="none" stroke="#fff6c8" stroke-opacity="0.7" stroke-width="0.9"/>
<path d="${star(44, 45, 4.4, 1.8, 4)}" fill="#fff6c8"/>
<path d="M39 22C47 22 52 28 51 34" fill="none" stroke="#fff6c8" stroke-width="2" stroke-linecap="round" filter="url(#glow)"/>
<path d="M47.6 33L51 38.4L54.2 32.6Z" fill="#fff6c8"/>`],
]);
