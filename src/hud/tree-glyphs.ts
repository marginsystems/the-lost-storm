const OPEN: string = '<svg class="tree-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const CLOSE: string = '</svg>';

const LIGHTNING: string = '<path d="M14.2 2.2 6 13h4.6L8.8 21.8 18 10.6h-4.8z" fill="currentColor" stroke="none"/>';

const GLYPHS: ReadonlyMap<string, string> = new Map<string, string>([
  ['lightning', LIGHTNING],
  ['thunder_ring', '<path d="M13.4 5.6 8.8 12.4h3l-1.2 6 4.6-7.2h-3z" fill="currentColor" stroke="none"/><path d="M6.2 5.4A9 9 0 0 0 3.6 15"/><path d="M17.8 5.4a9 9 0 0 1 2.6 9.6"/><path d="M7.4 20a9 9 0 0 0 9.2 0" opacity="0.55"/>'],
  ['forked_bolt', '<path d="M12 21.6 13.2 16.4 10.8 15 12 10.6"/><path d="M12 10.6 8.4 8.6 9.4 5.6 6.4 2.6"/><path d="M12 10.6 13 6.6 11.6 5 12.4 2.4" opacity="0.55"/><path d="M12 10.6 15.8 8.8 15 5.6 17.8 2.6"/>'],
  ['heavy_strike', '<path d="M4.6 8.2 10 2.8 15.2 8 9.8 13.4z" fill="currentColor" stroke="none"/><path d="M12.6 10.6 20.6 18.6"/><path d="M3 17.2h4.4"/><path d="M5.4 21.2 8 19" opacity="0.55"/><path d="M10.6 21.4v-3" opacity="0.55"/>'],
  ['tempered_body', '<path d="M7.4 3.2 12 5.4 16.6 3.2 20 6.8 17.6 10v9.2L12 21.6 6.4 19.2V10L4 6.8z"/><path d="M12 5.4v16.2" opacity="0.55"/><path d="M8.6 12.6h6.8"/><path d="M9.2 16.2h5.6" opacity="0.55"/>'],
  ['eye_of_storm', '<circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/><path d="M12 6.4A5.6 5.6 0 0 1 17.6 12c0 3.8-3.2 6.4-7.2 6.6"/><path d="M12 17.6A5.6 5.6 0 0 1 6.4 12c0-3.8 3.2-6.4 7.2-6.6"/><path d="M2.8 10C4 5.6 7.6 2.8 12 2.8" opacity="0.55"/><path d="M21.2 14c-1.2 4.4-4.8 7.2-9.2 7.2" opacity="0.55"/>'],
  ['focus', '<path d="M12 7.2 15.6 12 12 16.8 8.4 12z" fill="currentColor" stroke="none"/><path d="M12 2.4v2.4M12 19.2v2.4M2.4 12h3M18.6 12h3"/><path d="M5.4 5.4 7.4 7.4M18.6 5.4 16.6 7.4M5.4 18.6 7.4 16.6M18.6 18.6 16.6 16.6" opacity="0.55"/>'],
]);

export function treeGlyph(id: string): string {
  return `${OPEN}${GLYPHS.get(id) ?? LIGHTNING}${CLOSE}`;
}

export function hasTreeGlyph(id: string): boolean {
  return GLYPHS.has(id);
}
