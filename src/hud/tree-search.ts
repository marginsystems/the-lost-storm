import type { Content } from '../../sim/content/types.ts';
import { chartMatches } from './chart-model.ts';

export interface SearchPlace {
  readonly id: string;
  readonly button: HTMLElement;
}

export function wireTreeSearch(search: HTMLInputElement, viewport: HTMLElement, content: Content, places: readonly SearchPlace[], find: (id: string) => void): void {
  const showMatches = (): void => {
    const found: ReadonlySet<string> | null = chartMatches(content, search.value);
    viewport.classList.toggle('searching', found !== null);
    for (const place of places) place.button.classList.toggle('match', found !== null && found.has(place.id));
  };
  let findIndex: number = 0;
  search.addEventListener('input', (): void => {
    findIndex = 0;
    showMatches();
  });
  search.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.code === 'Escape') return;
    event.stopPropagation();
    if (event.code !== 'Enter') return;
    const found: readonly SearchPlace[] = places.filter((place: SearchPlace): boolean => place.button.classList.contains('match'));
    const next: SearchPlace | undefined = found[findIndex % Math.max(1, found.length)];
    if (next === undefined) return;
    findIndex += 1;
    find(next.id);
  });
  search.addEventListener('keyup', (event: KeyboardEvent): void => event.stopPropagation());
}
