import { art, fire, halo, spark } from './kit.ts';

export const CORE_ART: ReadonlyMap<string, string> = new Map<string, string>([
  ['fire_slam', art('fire', `
${halo(22, 48, 16, '#ff5a12', 0.8)}
${halo(44, 36, 14, '#ff5a12', 0.45)}
<path d="M0 60 L64 26 L64 64 L0 64Z" fill="#0a0302" opacity="0.55"/>
<path d="M12 52 L22 47 L26 48 L34 43 L40 41 L46 36 L52 34 L62 27" stroke="#ff7a1a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#bloom)"/>
<path d="M12 52 L22 47 L26 48 L34 43 L40 41 L46 36 L52 34 L62 27" stroke="#ffd27a" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
${fire(59, 30, 9, 3, 1.5)}
${fire(51, 35, 13, 4, 2)}
${fire(42, 40, 18, 5, 2.5)}
${fire(31, 46, 24, 6.5, 3)}
<g transform="rotate(-24 18 36)">
<rect x="21" y="0" width="5.4" height="32" rx="2.2" fill="url(#wood)"/>
<rect x="20.6" y="6" width="6.2" height="2" rx="0.6" fill="#24140a"/>
<rect x="20.6" y="11" width="6.2" height="2" rx="0.6" fill="#24140a"/>
<path d="M8 31 h24 l2 2.6 v10 l-2 2.6 h-24 l-2 -2.6 v-10z" fill="url(#iron)"/>
<path d="M8 31 h24 l2 2.6 h-28z" fill="#e6ecf2" opacity="0.85"/>
<path d="M6 43.6 l2 2.6 h24 l2 -2.6z" fill="#ff8a2a" opacity="0.9" filter="url(#glow)"/>
<rect x="18" y="33.6" width="5" height="10" rx="1" fill="#2a3038" opacity="0.6"/>
</g>
<path d="M5 50l4-3.4 2.6 3-4.4 2.4z" fill="#2a1408"/>
<path d="M16 58l3.4-2.2 2.2 2.4-3.4 2z" fill="#2a1408"/>
<path d="M7 42l3-2 1.6 2-3 1.6z" fill="#3a1c0a"/>
${spark(9, 36, 0.9, '#ffd27a')}
${spark(28, 30, 0.8, '#ffe9b8')}
${spark(38, 22, 0.7, '#ffd27a')}
${spark(50, 18, 0.6, '#ffe9b8')}
${spark(14, 44, 0.7, '#ffb43a')}
`)],
  ['cleave', art('steel', `
${halo(36, 30, 20, '#7fb8e8', 0.4)}
<path d="M58 6 C 66 34 46 58 8 60 C 40 50 54 32 58 6Z" fill="url(#energyX)" opacity="0.5" filter="url(#glow)"/>
<path d="M58 6 C 62 30 48 50 18 57 C 42 46 54 30 58 6Z" fill="#eaf6ff" opacity="0.5"/>
<path d="M58 6 C 60 26 50 42 30 51" stroke="#ffffff" stroke-width="1" fill="none" opacity="0.9" filter="url(#glow)"/>
<g transform="rotate(-38 30 32)">
<rect x="27.6" y="10" width="4.8" height="50" rx="2.2" fill="url(#wood)"/>
<rect x="27.2" y="50" width="5.6" height="9" rx="1.6" fill="url(#leather)"/>
<path d="M32 12 C 46 6 56 16 55 34 C 50 28 42 26 32 28Z" fill="url(#steel)"/>
<path d="M32 12 C 40 10 46 13 50 18 L 40 22 L32 21Z" fill="#ffffff" opacity="0.35"/>
<path d="M55 34 C 56 18 48 8 38 9" stroke="#ffffff" stroke-width="1.6" fill="none" filter="url(#glow)"/>
<path d="M28 14 C 21 13 17 17 16 23 C 20 21.6 24 21.6 28 23Z" fill="url(#iron)"/>
<rect x="26.6" y="11" width="6.8" height="18" rx="1.4" fill="url(#iron)"/>
<circle cx="30" cy="16" r="1.2" fill="#c9d2dc"/><circle cx="30" cy="24" r="1.2" fill="#c9d2dc"/>
</g>
${spark(58, 8, 1.3, '#ffffff')}
${halo(58, 8, 4, '#ffffff', 0.6)}
`)],
  ['storm_bolt', art('storm', `
${halo(44, 20, 16, '#3fb8ff', 0.75)}
<path d="M8 58 L20 44 L17 42 L30 30 L27 28 L42 18" stroke="#3fb8ff" stroke-width="5" fill="none" stroke-linejoin="round" stroke-linecap="round" opacity="0.5" filter="url(#bloom)"/>
<path d="M8 58 L20 44 L17 42 L30 30 L27 28 L42 18" stroke="url(#energy)" stroke-width="2.6" fill="none" stroke-linejoin="round" stroke-linecap="round" filter="url(#glow)"/>
<path d="M8 58 L20 44 L17 42 L30 30 L27 28 L42 18" stroke="#ffffff" stroke-width="0.9" fill="none" stroke-linejoin="round"/>
<path d="M20 44 L13 41 L9 43" stroke="#7fd4ff" stroke-width="0.9" fill="none" opacity="0.8"/>
<path d="M30 30 L34 36 L32 40" stroke="#7fd4ff" stroke-width="0.9" fill="none" opacity="0.8"/>
<circle cx="44" cy="18" r="8" fill="url(#core)" filter="url(#glow)"/>
<circle cx="44" cy="18" r="3.4" fill="#ffffff"/>
<path d="M44 6v4M56 18h-4M52.5 9.5l-2.8 2.8M52.5 26.5l-2.8-2.8M35.5 9.5l2.8 2.8" stroke="#bfe9ff" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
`)],
]);
