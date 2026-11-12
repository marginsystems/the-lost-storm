const OPEN: string = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const CLOSE: string = '</svg>';

const BOLT: string = '<path d="M13.5 2 5.5 13.2h5.3L9.6 22l8.9-12.2h-5.6z" fill="currentColor"/>';

const GLYPHS: ReadonlyMap<string, string> = new Map<string, string>([
  ['cleave', '<path d="M3.5 20C4.5 11 11 4.8 20.5 3.5 14.2 7.2 9.8 12.2 8.4 20.5z" fill="currentColor" stroke="none"/><path d="M11.5 20.5c1.1-4.4 4-7.9 9-10.2-3.3 2.9-5.2 5.9-6.1 10.2z" fill="currentColor" stroke="none" opacity="0.5"/>'],
  ['thunderclap', '<path d="M13.6 1.8 7.2 11.6h3.9L9.3 19l7.5-10.4h-4z" fill="currentColor" stroke="none"/><path d="M2.8 21h5.4M15.8 21h5.4"/><path d="M4.6 16.4l2.3 1.7M19.4 16.4l-2.3 1.7" opacity="0.55"/>'],
  ['storm_bolt', '<path d="M21.2 2.8 12.4 9.4l2.3 1.7L6.2 17.6l3.5-5.8-2.3-1.7 6.9-5z" fill="currentColor" stroke="none"/><path d="M2.8 21.2l2.6-2.6M7.4 21.6l1.6-1.6" opacity="0.55"/>'],
  ['dodge_roll', '<circle cx="14" cy="10.5" r="5.2"/><path d="M14 5.3a5.2 5.2 0 0 1 4.2 8.3" fill="none" stroke-width="2.2"/><path d="M2.5 19.5h5M4.5 15.5h4.5M7 11.5h2" opacity="0.6"/><path d="M10.5 20.5h10" />'],
  ['sword', '<path d="M20 4 9 15"/><path d="M20 4h-4M20 4v4"/><path d="M7 13l4 4"/><path d="M9 15 5 19"/><circle cx="4.3" cy="19.7" r="1.2"/>'],
  ['greatsword', '<path d="M19 3l2 2-11 11-2-2z" fill="currentColor"/><path d="M5 12l7 7"/><path d="M8 16 4 20"/>'],
  ['axe', '<path d="M5 20 14 8"/><path d="M11 4l7-1 3 4-7 4z" fill="currentColor"/>'],
  ['armour', '<path d="M12 3l8 3v6c0 5-4 8-8 10-4-2-8-5-8-10V6z"/><path d="M12 7v11"/><path d="M8 11h8" opacity="0.6"/>'],
  ['helm', '<path d="M5 13a7 7 0 0 1 14 0v6h-4.5v-4h-5v4H5z"/><path d="M12 6v7" opacity="0.6"/>'],
  ['gloves', '<path d="M7 20v-5l-2-5 1.6-.8L8.5 12V5.2a1.2 1.2 0 0 1 2.4 0V10M10.9 10V4.2a1.2 1.2 0 0 1 2.4 0V10M13.3 10V5.2a1.2 1.2 0 0 1 2.4 0V11M15.7 11V7.4a1.2 1.2 0 0 1 2.3 0V15l-1 5z"/><path d="M7 17h10" opacity="0.6"/>'],
  ['legs', '<path d="M6.5 3h11l1 18h-5L12 9l-1.5 12h-5z"/><path d="M6.5 6.5h11" opacity="0.6"/>'],
  ['staff', '<path d="M6 21 16.5 6.5"/><circle cx="17.6" cy="5" r="2.6" fill="currentColor"/><path d="M13.4 8.4l3.2 2.2" opacity="0.6"/>'],
  ['boots', '<path d="M8 3h6v10l5 3.2V20H8z"/><path d="M8 17h11" opacity="0.6"/><path d="M8 7h6" opacity="0.6"/>'],
  ['book', '<path d="M5 4.5h9.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9.5"/><path d="M9 8h5"/>'],
  ['charm', '<path d="M8 3c0 6 2 8 4 8s4-2 4-8"/><circle cx="12" cy="16" r="5"/><path d="M12 13l2 3-2 3-2-3z" fill="currentColor"/>'],
  ['life', '<path d="M12 21C5 16 3 11.5 3 8.5a4.5 4.5 0 0 1 9-1.5 4.5 4.5 0 0 1 9 1.5c0 3-2 7.5-9 12.5z"/>'],
  ['mana', '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12z"/><path d="M9 15a3 3 0 0 0 3 3" opacity="0.6"/>'],
  ['damage', '<path d="M12 2l2 7 7-1-5 5 3 7-7-4-7 4 3-7-5-5 7 1z"/>'],
  ['thunder', BOLT],
  ['fork', '<path d="M12 21V12"/><path d="M12 12 6 5M12 12l6-7"/><path d="M6 9V5h4M18 9V5h-4"/>'],
  ['eye', '<path d="M2 12c3-6 7-7 10-7s7 1 10 7c-3 6-7 7-10 7s-7-1-10-7z"/><circle cx="12" cy="12" r="3"/>'],
  ['mouse_left', '<rect x="5.5" y="2" width="13" height="20" rx="6.5" stroke-width="2"/><path d="M12 2v8H5.5V8.5A6.5 6.5 0 0 1 12 2z" fill="currentColor" stroke="none"/>'],
  ['mouse_right', '<rect x="5.5" y="2" width="13" height="20" rx="6.5" stroke-width="2"/><path d="M12 2v8h6.5V8.5A6.5 6.5 0 0 0 12 2z" fill="currentColor" stroke="none"/>'],
  ['coin', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5" opacity="0.5"/><path d="M12 9.5v5" opacity="0.8"/>'],
]);

const FALLBACK: string = '<path d="M12 3l9 9-9 9-9-9z"/>';

export function iconSvg(id: string): string {
  return `${OPEN}${GLYPHS.get(id) ?? FALLBACK}${CLOSE}`;
}
