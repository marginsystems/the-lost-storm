import { skillArt } from './skill-art/index.ts';

const OPEN: string = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const CLOSE: string = '</svg>';

const BOLT: string = '<path d="M13.5 2 5.5 13.2h5.3L9.6 22l8.9-12.2h-5.6z" fill="currentColor"/>';

const GLYPHS: ReadonlyMap<string, string> = new Map<string, string>([
  ['cleave', '<path d="M3.5 20C4.5 11 11 4.8 20.5 3.5 14.2 7.2 9.8 12.2 8.4 20.5z" fill="currentColor" stroke="none"/><path d="M11.5 20.5c1.1-4.4 4-7.9 9-10.2-3.3 2.9-5.2 5.9-6.1 10.2z" fill="currentColor" stroke="none" opacity="0.5"/>'],
  ['thunderclap', '<path d="M13.6 1.8 7.2 11.6h3.9L9.3 19l7.5-10.4h-4z" fill="currentColor" stroke="none"/><path d="M2.8 21h5.4M15.8 21h5.4"/><path d="M4.6 16.4l2.3 1.7M19.4 16.4l-2.3 1.7" opacity="0.55"/>'],
  ['storm_bolt', '<path d="M21.2 2.8 12.4 9.4l2.3 1.7L6.2 17.6l3.5-5.8-2.3-1.7 6.9-5z" fill="currentColor" stroke="none"/><path d="M2.8 21.2l2.6-2.6M7.4 21.6l1.6-1.6" opacity="0.55"/>'],
  ['forkline', '<path d="M3 3.2 9.4 8l-1.6 1.4 4.6 2.8" stroke-width="2"/><path d="M12.4 12.2 20.4 9.6M12.4 12.2l6.4 5.2M12.4 12.2l-1 8.2"/><circle cx="20.6" cy="9.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="17.6" r="1.4" fill="currentColor" stroke="none"/><circle cx="11.3" cy="20.6" r="1.4" fill="currentColor" stroke="none"/>'],
  ['mist_step', '<path d="M2.5 9.5c1.6-1.2 3.2-1.2 4.8 0s3.2 1.2 4.8 0M3.5 14c1.4-1 2.8-1 4.2 0s2.8 1 4.2 0M5 18.5c1.2-.8 2.4-.8 3.6 0" opacity="0.55"/><path d="M15.4 4.6 21 12l-5.6 7.4-1.6-1.2L18.4 12l-4.6-6.2z" fill="currentColor" stroke="none"/>'],
  ['downdraught', '<path d="M12 12.6a1.6 1.6 0 1 1 1.6-1.9 3.6 3.6 0 1 1-4.8 4.3 6 6 0 1 1 9.9-6.7"/><path d="M3.2 5.6 6.4 8.2M20.8 18.4l-3.2-2.6M5.2 20.4 7.8 17" opacity="0.55"/>'],
  ['squall', '<path d="M6.4 12.2a4 4 0 0 1 .4-8 5.4 5.4 0 0 1 10.2 1.6 3.3 3.3 0 0 1 .2 6.4z" fill="currentColor" stroke="none"/><path d="M6 15.4 4.8 19M10 15.4l-1.2 3.6M18 15.4l-1.2 3.6" opacity="0.55"/><path d="M14 13.6l-2.2 4h2.6l-1.6 4.4"/>'],
  ['thunderhead', '<path d="M12 22 8.6 14.6h2.4L9.8 9.4l5.6 7.4h-2.6z" fill="currentColor" stroke="none"/><path d="M4.4 9.4a8.2 8.2 0 0 1 15.2 0"/><path d="M7.4 9.6a5 5 0 0 1 9.2 0" opacity="0.55"/><path d="M12 2.2v1.4" opacity="0.55"/>'],
  ['static_brand', '<circle cx="12" cy="12" r="8.6" stroke-dasharray="3.2 2.2"/><circle cx="12" cy="12" r="4.4" opacity="0.55"/><path d="M13 7.4 9.6 12.6h2.6l-1.2 4 3.4-5.2h-2.6z" fill="currentColor" stroke="none"/>'],
  ['living_wire', '<circle cx="4" cy="16" r="2.2" fill="currentColor" stroke="none"/><path d="M6.2 15 9 12.2l1.6 2.6 3-4.4 1.8 2.4 3-3.6 2.6 1.4"/><path d="M7.4 18.4l2.4-1.6M12 18.2l2.6-2.2M16.8 15l2.2-1.8" opacity="0.55"/>'],
  ['held_breath', '<circle cx="12" cy="12" r="8.6" opacity="0.55"/><path d="M9.6 8.4v7.2M14.4 8.4v7.2" stroke-width="2.4"/><path d="M12 1.6v2M12 20.4v2M1.6 12h2M20.4 12h2"/>'],
  ['mending_pulse', '<circle cx="12" cy="13" r="8.6" opacity="0.55"/><path d="M12 8.6v8.8M7.6 13h8.8" stroke-width="2.4"/><circle cx="5" cy="3.6" r="1.1" fill="currentColor" stroke="none" opacity="0.7"/><circle cx="12" cy="1.8" r="0.9" fill="currentColor" stroke="none" opacity="0.55"/><circle cx="19" cy="3.6" r="1.1" fill="currentColor" stroke="none" opacity="0.7"/>'],
  ['spell_strike', '<path d="M3 21 13.4 8.8l1.8 1.8z" fill="currentColor" stroke="none" opacity="0.55"/><circle cx="16.6" cy="7.4" r="3.2" fill="currentColor" stroke="none"/><path d="M16.6 1.4v1.4M22.6 7.4h-1.4M20.8 3.2l-1 1M20.8 11.6l-1-1M12.4 3.2l1 1"/>'],
  ['standing_storm', '<circle cx="12" cy="8.6" r="2.2"/><path d="M8.2 17.6c0-2.8 1.7-4.6 3.8-4.6s3.8 1.8 3.8 4.6"/><path d="M2.6 18.4c1.4 1.8 5 3 9.4 3s8-1.2 9.4-3" opacity="0.55"/><path d="M5.6 3.4 2.6 8.6h2.2l-.9 4.2 3.2-5.4H4.9z" fill="currentColor" stroke="none"/><path d="M18.4 3.4 21.4 8.6h-2.2l.9 4.2-3.2-5.4h2.2z" fill="currentColor" stroke="none"/>'],
  ['umbra', '<path d="M14.8 1.8a4.6 4.6 0 1 0 0 8.2 3.8 3.8 0 1 1 0-8.2z" fill="currentColor" stroke="none"/><path d="M2.2 17.4c1-2 4.6-3.2 9.8-3.2s8.8 1.2 9.8 3.2c-1 2-4.6 3.4-9.8 3.4s-8.8-1.4-9.8-3.4z" fill="currentColor" stroke="none" opacity="0.45"/><path d="M6.4 17.4c1.4-.8 3.4-1.2 5.6-1.2s4.2.4 5.6 1.2"/>'],
  ['millrace', '<path d="M2.4 19.4c3.4 0 5-2.4 6.6-5.8s3.8-6.6 7.8-6.6c2.6 0 4.4 1.8 4.4 4 0 1.9-1.4 3.2-3.1 3.2-1.4 0-2.4-1-2.2-2.4" stroke-width="2"/><path d="M2.4 22h19.2" opacity="0.55"/><circle cx="19.6" cy="3.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="22" cy="6" r="0.8" fill="currentColor" stroke="none"/><circle cx="16.6" cy="2.6" r="0.7" fill="currentColor" stroke="none"/>'],
  ['banked_fire', '<path d="M12 2.6c1.6 2.8 4.2 4.4 4.2 7.6a4.2 4.2 0 0 1-8.4 0c0-1.8.9-2.9 1.8-3.8.2 1.5.9 2.3 1.8 2.5-.2-2.2.2-4.1.6-6.3z" fill="currentColor" stroke="none"/><path d="M5.2 17.4c1.2-1.2 2.6-1.6 3.8-.8 1-1 2.2-1.2 3-.4.8-.8 2-.6 3 .4 1.2-.8 2.6-.4 3.8.8" opacity="0.7"/><path d="M3.2 20.6h17.6" opacity="0.45"/>'],
  ['ghost_wave', '<path d="M6.4 20c4.2 0 5.8-3.2 7.2-6.8S17 5.4 20 5.4c1.6 0 2.4 1.2 2.4 2.4s-.9 2.2-2.1 2.2-1.9-.9-1.6-2" stroke-width="2"/><path d="M2.6 17.6c2.6-.4 3.8-2.6 4.8-5.2" opacity="0.55"/><path d="M1.6 11.8c1.2-.6 1.8-1.8 2.4-3.4" opacity="0.3"/><path d="M6.4 20h15" opacity="0.55"/>'],
  ['wisp_volley', '<circle cx="17.8" cy="16.2" r="2.4" fill="currentColor" stroke="none"/><circle cx="14.4" cy="9.6" r="2.4" fill="currentColor" stroke="none"/><circle cx="7.8" cy="6.2" r="2.4" fill="currentColor" stroke="none"/><path d="M9.4 18.7 13.2 17.6M7.8 16.2l2.9-2.9M5.3 14.6l1.1-3.8" opacity="0.55"/><circle cx="3.6" cy="20.4" r="1.2" fill="currentColor" stroke="none" opacity="0.55"/>'],
  ['fire_burst', '<path d="M12 2.4c1.2 3.2 4.8 5.2 4.8 9.8a4.8 4.8 0 0 1-9.6 0c0-2.2 1-3.6 2.2-4.6-.1 1.6.6 2.8 1.6 3.2-.2-3.2.2-5.8 1-8.4z" fill="currentColor" stroke="none"/><path d="M4.6 10.6c.6 1.8 2 2.8 2 4.6a2 2 0 0 1-4 0c0-1.8 1.2-2.6 2-4.6zM19.4 10.6c-.6 1.8-2 2.8-2 4.6a2 2 0 0 0 4 0c0-1.8-1.2-2.6-2-4.6z" fill="currentColor" stroke="none" opacity="0.55"/><path d="M2.6 20.6h18.8"/>'],
  ['thunderclap_gathered', '<path d="M12.4 3.6 7.6 12.2" stroke-width="2"/><path d="M2.6 12.4l5.6-3.1 2.6 4.7-5.6 3.1z" fill="currentColor" stroke="none"/><path d="M11.6 21c-1.6 0-2.5-1.1-2.5-2.4 0-1.7 1.4-2.6 2.5-5 1.1 2.4 2.5 3.3 2.5 5 0 1.3-.9 2.4-2.5 2.4z" fill="currentColor" stroke="none"/><path d="M16.6 21c-1.3 0-2.1-.9-2.1-2 0-1.4 1.2-2.2 2.1-4.2.9 2 2.1 2.8 2.1 4.2 0 1.1-.8 2-2.1 2z" fill="currentColor" stroke="none" opacity="0.75"/><path d="M20.6 21c-1 0-1.6-.7-1.6-1.6 0-1.1.9-1.7 1.6-3.2.7 1.5 1.6 2.1 1.6 3.2 0 .9-.6 1.6-1.6 1.6z" fill="currentColor" stroke="none" opacity="0.5"/><path d="M2.4 21.6h19.6" opacity="0.45"/><path d="M3 19.4l-1-1M7.4 19.2l.6-1.2" opacity="0.55"/>'],
  ['dodge_roll','<circle cx="14" cy="10.5" r="5.2"/><path d="M14 5.3a5.2 5.2 0 0 1 4.2 8.3" fill="none" stroke-width="2.2"/><path d="M2.5 19.5h5M4.5 15.5h4.5M7 11.5h2" opacity="0.6"/><path d="M10.5 20.5h10" />'],
  ['sword', '<path d="M20 4 9 15"/><path d="M20 4h-4M20 4v4"/><path d="M7 13l4 4"/><path d="M9 15 5 19"/><circle cx="4.3" cy="19.7" r="1.2"/>'],
  ['greatsword', '<path d="M19 3l2 2-11 11-2-2z" fill="currentColor"/><path d="M5 12l7 7"/><path d="M8 16 4 20"/>'],
  ['axe', '<path d="M5 20 14 8"/><path d="M11 4l7-1 3 4-7 4z" fill="currentColor"/>'],
  ['mace', '<path d="M4.5 19.5 13 11"/><circle cx="16" cy="8" r="3.6" fill="currentColor" stroke="none"/><path d="M16 2.6v2M21.4 8h-2M16 13.4v-2M10.6 8h2M19.8 4.2l-1.4 1.4M19.8 11.8l-1.4-1.4M12.2 4.2l1.4 1.4"/>'],
  ['armour', '<path d="M12 3l8 3v6c0 5-4 8-8 10-4-2-8-5-8-10V6z"/><path d="M12 7v11"/><path d="M8 11h8" opacity="0.6"/>'],
  ['helm', '<path d="M5 13a7 7 0 0 1 14 0v6h-4.5v-4h-5v4H5z"/><path d="M12 6v7" opacity="0.6"/>'],
  ['mask', '<path d="M6 4.5h12c.6 6-.4 11.5-6 15-5.6-3.5-6.6-9-6-15z"/><circle cx="12" cy="10" r="2.2" fill="currentColor" stroke="none"/>'],
  ['circlet', '<ellipse cx="12" cy="13" rx="8.5" ry="3.6"/><circle cx="12" cy="16.6" r="1.5" fill="currentColor" stroke="none"/>'],
  ['crown', '<path d="M4 18.5h16"/><path d="M4.6 15.5 3.4 7.5l4.8 3.6L12 4.5l3.8 6.6 4.8-3.6-1.2 8z"/><circle cx="12" cy="12.6" r="1.3" fill="currentColor" stroke="none"/>'],
  ['bust', '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'],
  ['gloves', '<path d="M7 20v-5l-2-5 1.6-.8L8.5 12V5.2a1.2 1.2 0 0 1 2.4 0V10M10.9 10V4.2a1.2 1.2 0 0 1 2.4 0V10M13.3 10V5.2a1.2 1.2 0 0 1 2.4 0V11M15.7 11V7.4a1.2 1.2 0 0 1 2.3 0V15l-1 5z"/><path d="M7 17h10" opacity="0.6"/>'],
  ['legs', '<path d="M6.5 3h11l1 18h-5L12 9l-1.5 12h-5z"/><path d="M6.5 6.5h11" opacity="0.6"/>'],
  ['crossbow', '<path d="M4 20 16.5 7.5"/><path d="M9.2 5.2c4.6-.6 9 3.8 9.6 9.6" stroke-width="2"/><path d="M9.2 5.2 6.5 17.5M18.8 14.8 6.5 17.5" opacity="0.6"/><path d="M16.5 7.5 20 4" stroke-width="2"/>'],
  ['quarrel', '<path d="M3.5 20.5 17 7"/><path d="M21 3l-1.2 6.2-5-5z" fill="currentColor" stroke="none"/><path d="M3.5 16.5v4h4M6.5 13.5v4h4" opacity="0.6"/>'],
  ['staff', '<path d="M6 21 16.5 6.5"/><circle cx="17.6" cy="5" r="2.6" fill="currentColor"/><path d="M13.4 8.4l3.2 2.2" opacity="0.6"/>'],
  ['boots', '<path d="M8 3h6v10l5 3.2V20H8z"/><path d="M8 17h11" opacity="0.6"/><path d="M8 7h6" opacity="0.6"/>'],
  ['book', '<path d="M5 4.5h9.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9.5"/><path d="M9 8h5"/>'],
  ['portal', '<path d="M12 2.5c-1.6 3.2 1.8 5.4 0 8.6s1.9 5.6 0 9.4"/><path d="M8 21h8" opacity="0.6"/><path d="M8.2 7.5 6.6 6.4M15.8 14.5l1.6 1.1M7.6 15l-1.5.8" opacity="0.6"/>'],
  ['charm', '<path d="M8 3c0 6 2 8 4 8s4-2 4-8"/><circle cx="12" cy="16" r="5"/><path d="M12 13l2 3-2 3-2-3z" fill="currentColor"/>'],
  ['life', '<path d="M12 21C5 16 3 11.5 3 8.5a4.5 4.5 0 0 1 9-1.5 4.5 4.5 0 0 1 9 1.5c0 3-2 7.5-9 12.5z"/>'],
  ['mana', '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12z"/><path d="M9 15a3 3 0 0 0 3 3" opacity="0.6"/>'],
  ['damage', '<path d="M12 2l2 7 7-1-5 5 3 7-7-4-7 4 3-7-5-5 7 1z"/>'],
  ['thunder', BOLT],
  ['fork', '<path d="M12 21V12"/><path d="M12 12 6 5M12 12l6-7"/><path d="M6 9V5h4M18 9V5h-4"/>'],
  ['eye', '<path d="M2 12c3-6 7-7 10-7s7 1 10 7c-3 6-7 7-10 7s-7-1-10-7z"/><circle cx="12" cy="12" r="3"/>'],
  ['mouse_left', '<rect x="5.5" y="2" width="13" height="20" rx="6.5" stroke-width="2"/><path d="M12 2v8H5.5V8.5A6.5 6.5 0 0 1 12 2z" fill="currentColor" stroke="none"/>'],
  ['mouse_right', '<rect x="5.5" y="2" width="13" height="20" rx="6.5" stroke-width="2"/><path d="M12 2v8h6.5V8.5A6.5 6.5 0 0 0 12 2z" fill="currentColor" stroke="none"/>'],
  ['tag', '<path d="M3.5 11.6V4.5a1 1 0 0 1 1-1h7.1l8.6 8.6a1 1 0 0 1 0 1.4l-7.1 7.1a1 1 0 0 1-1.4 0z"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>'],
  ['flask', '<path d="M9.5 2.5h5M10.5 2.5v5.2a7 7 0 1 0 3 0V2.5"/><path d="M6.6 15.2h10.8" opacity="0.6"/>'],
  ['coin', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5" opacity="0.5"/><path d="M12 9.5v5" opacity="0.8"/>'],
]);

const FALLBACK: string = '<path d="M12 3l9 9-9 9-9-9z"/>';

export function iconBody(id: string): string {
  return GLYPHS.get(id) ?? FALLBACK;
}

export function iconSvg(id: string): string {
  return skillArt(id) ?? `${OPEN}${iconBody(id)}${CLOSE}`;
}
