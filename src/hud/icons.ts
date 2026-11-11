const OPEN: string = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const CLOSE: string = '</svg>';

const BOLT: string = '<path d="M13.5 2 5.5 13.2h5.3L9.6 22l8.9-12.2h-5.6z" fill="currentColor"/>';

const GLYPHS: ReadonlyMap<string, string> = new Map<string, string>([
  ['cleave', '<path d="M3.5 16.5C5.5 9.5 10.5 5 17 4.5"/><path d="M7 20c2.2-5 6-8 12-9"/><path d="M12 20.5c1.6-3 4-5 8-6" opacity="0.6"/>'],
  ['thunderclap', `${BOLT}<circle cx="12" cy="12" r="9.5" opacity="0.45"/>`],
  ['storm_bolt', '<path d="M3 21l6-6-2-3 7-4-2-3"/><circle cx="17.5" cy="5.5" r="3" fill="currentColor"/><path d="M17.5 1.5v1M21.5 5.5h-1M20.3 2.7l-.7.7" opacity="0.6"/>'],
  ['sword', '<path d="M20 4 9 15"/><path d="M20 4h-4M20 4v4"/><path d="M7 13l4 4"/><path d="M9 15 5 19"/><circle cx="4.3" cy="19.7" r="1.2"/>'],
  ['greatsword', '<path d="M19 3l2 2-11 11-2-2z" fill="currentColor"/><path d="M5 12l7 7"/><path d="M8 16 4 20"/>'],
  ['axe', '<path d="M5 20 14 8"/><path d="M11 4l7-1 3 4-7 4z" fill="currentColor"/>'],
  ['armour', '<path d="M12 3l8 3v6c0 5-4 8-8 10-4-2-8-5-8-10V6z"/><path d="M12 7v11"/><path d="M8 11h8" opacity="0.6"/>'],
  ['charm', '<path d="M8 3c0 6 2 8 4 8s4-2 4-8"/><circle cx="12" cy="16" r="5"/><path d="M12 13l2 3-2 3-2-3z" fill="currentColor"/>'],
  ['life', '<path d="M12 21C5 16 3 11.5 3 8.5a4.5 4.5 0 0 1 9-1.5 4.5 4.5 0 0 1 9 1.5c0 3-2 7.5-9 12.5z"/>'],
  ['mana', '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12z"/><path d="M9 15a3 3 0 0 0 3 3" opacity="0.6"/>'],
  ['damage', '<path d="M12 2l2 7 7-1-5 5 3 7-7-4-7 4 3-7-5-5 7 1z"/>'],
  ['thunder', BOLT],
  ['fork', '<path d="M12 21V12"/><path d="M12 12 6 5M12 12l6-7"/><path d="M6 9V5h4M18 9V5h-4"/>'],
  ['eye', '<path d="M2 12c3-6 7-7 10-7s7 1 10 7c-3 6-7 7-10 7s-7-1-10-7z"/><circle cx="12" cy="12" r="3"/>'],
  ['coin', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5" opacity="0.5"/><path d="M12 9.5v5" opacity="0.8"/>'],
]);

const FALLBACK: string = '<path d="M12 3l9 9-9 9-9-9z"/>';

export function iconSvg(id: string): string {
  return `${OPEN}${GLYPHS.get(id) ?? FALLBACK}${CLOSE}`;
}
