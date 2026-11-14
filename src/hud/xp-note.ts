import type { XpReduction } from '../../sim/content/types.ts';

const LINES: Readonly<Record<XpReduction['side'], string>> = {
  below: 'Reduced experience: this place is far below your level',
  above: 'Reduced experience: this place is far above your level',
};

export function reducedLine(reduced: XpReduction | null): string | null {
  return reduced === null ? null : LINES[reduced.side];
}
