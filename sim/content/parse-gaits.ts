import type { Fields } from './read.ts';
import { ContentError, each, fields, positive, text } from './read.ts';
import type { RigGait } from './rig-types.ts';

export function rigGaits(value: unknown, where: string): RigGait[] {
  const gaits: RigGait[] = each(value, where, (entry: unknown, entryWhere: string): RigGait => {
    const source: Fields = fields(entry, entryWhere);
    return { clip: text(source, 'clip', entryWhere), groundSpeed: positive(source, 'groundSpeed', entryWhere) };
  });
  if (gaits.length === 0) throw new ContentError(where, 'a rig needs at least one gait');
  if (gaits.some((gait: RigGait, index: number): boolean => index > 0 && gait.groundSpeed <= (gaits[index - 1]?.groundSpeed ?? 0))) throw new ContentError(where, 'gaits run from the slowest to the fastest');
  return gaits;
}
