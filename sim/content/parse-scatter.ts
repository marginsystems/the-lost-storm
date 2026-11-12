import type { Fields } from './read.ts';
import { choice, ContentError, fields, nonNegative, positive, textList } from './read.ts';
import type { ScatterSize, ZoneScatter } from './types.ts';
import { SCATTER_TYPES } from './types.ts';

function scatterSize(value: unknown, where: string): ScatterSize {
  const source: Fields = fields(value, where);
  const least: number = positive(source, 'least', where);
  const most: number = positive(source, 'most', where);
  if (most < least) throw new ContentError(where, 'most must be at least least');
  return { least, most };
}

export function zoneScatter(value: unknown, where: string): ZoneScatter {
  const source: Fields = fields(value, where);
  const props: string[] = textList(source, 'props', where);
  if (props.length === 0) throw new ContentError(`${where}.props`, 'scatter needs at least one prop');
  const size: ScatterSize = scatterSize(source['size'], `${where}.size`);
  const type: ZoneScatter['type'] = choice(source, 'type', SCATTER_TYPES, where);
  let read: ZoneScatter;
  switch (type) {
    case 'open':
      read = { type, props, count: positive(source, 'count', where), clump: positive(source, 'clump', where), spread: nonNegative(source, 'spread', where), size, clear: nonNegative(source, 'clear', where) };
      break;
    case 'around':
      read = { type, props, anchors: textList(source, 'anchors', where), each: positive(source, 'each', where), spread: positive(source, 'spread', where), size };
      break;
  }
  return read;
}
