import type { ColourStop, RadialLayer, RadialSize, Rgba } from './paint.ts';
import { rgba, transparent } from './paint.ts';

export interface Backdrops {
  readonly title: readonly RadialLayer[];
  readonly edge: readonly RadialLayer[];
  readonly voidEdge: readonly RadialLayer[];
  readonly voidLit: readonly RadialLayer[];
  readonly wakeSoft: readonly RadialLayer[];
  readonly hurt: readonly RadialLayer[];
  readonly death: readonly RadialLayer[];
  readonly veilMist: readonly RadialLayer[];
}

const FAR: RadialSize = { kind: 'farthest-corner' };

function stop(at: number, colour: Rgba): ColourStop {
  return { at, colour };
}

function centred(stops: readonly ColourStop[]): RadialLayer {
  return { centre: { x: 0.5, y: 0.5 }, size: FAR, stops };
}

export const BACKDROPS: Backdrops = {
  title: [{ centre: { x: 0.5, y: 0.4 }, size: FAR, stops: [stop(0, rgba(22, 34, 52, 0.9)), stop(0.34, rgba(13, 19, 29, 0.93)), stop(0.7, rgba(4, 6, 10, 0.97))] }],
  edge: [centred([stop(0.52, rgba(0, 0, 0, 0)), stop(1, rgba(2, 4, 8, 0.62))])],
  voidEdge: [centred([stop(0.4, rgba(40, 44, 50, 0)), stop(1, rgba(40, 44, 50, 0.38))])],
  voidLit: [centred([stop(0.3, rgba(34, 38, 46, 0)), stop(1, rgba(34, 38, 46, 0.66))])],
  wakeSoft: [{ centre: { x: 0.5, y: 0.52 }, size: { kind: 'fixed', rx: 0.62, ry: 0.58 }, stops: [stop(0.46, rgba(238, 240, 243, 0)), stop(0.82, rgba(238, 240, 243, 0.42)), stop(1, rgba(238, 240, 243, 0.7))] }],
  hurt: [centred([stop(0.68, rgba(108, 46, 40, 0)), stop(0.86, rgba(108, 46, 40, 0.16)), stop(1, rgba(120, 52, 44, 0.34))])],
  death: [centred([stop(0, rgba(8, 2, 4, 0)), stop(1, rgba(8, 2, 4, 0.55))])],
  veilMist: [
    { centre: { x: 0.32, y: 0.42 }, size: { kind: 'fixed', rx: 0.42, ry: 0.3 }, stops: [stop(0, rgba(128, 136, 148, 0.16)), stop(1, transparent())] },
    { centre: { x: 0.68, y: 0.62 }, size: { kind: 'fixed', rx: 0.36, ry: 0.26 }, stops: [stop(0, rgba(128, 136, 148, 0.12)), stop(1, transparent())] },
  ],
};
