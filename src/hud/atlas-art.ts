import type { AtlasDef, AtlasFeature, AtlasPoint } from '../../sim/content/types.ts';
import { along, fixed, inside, roughen, scatter, seeded, smoothPath } from './atlas-geometry.ts';
import type { Rng, Spot } from './atlas-geometry.ts';
import { svg } from './svg.ts';

const ART = {
  seed: 9173,
  coastRough: 0.16,
  coastPasses: 3,
  shoreWidths: [84, 58, 34, 14],
  shoreLine: 1.6,
  waveSpacing: 54,
  waveHalf: 7,
  waveLift: 2.6,
  riverRough: 0.14,
  riverPasses: 3,
  ridgeRough: 0.1,
  ridgeSpacing: 30,
  peakMin: 13,
  peakGrow: 12,
  peakLean: 0.18,
  peakHeight: 1.15,
  peakSpread: 9,
  hatchSteps: [0.28, 0.5, 0.72],
  treeSpacing: 15,
  treeWidth: 4.2,
  treeHeight: 5.6,
  trunk: 3,
  reedSpacing: 21,
  reedHalf: 5.5,
  reedGap: 3.2,
  grainTile: 220,
  grainDots: 150,
  grainSize: 1.1,
  frameInset: 14,
  frameGap: 7,
  tickEvery: 50,
  tickLength: 6,
  roseRadius: 46,
  roseInner: 36,
  roseLong: 42,
  roseShort: 24,
  roseWaist: 6,
  roseLetter: 60,
  labelSpacing: 0.34,
} as const;

function spots(points: readonly AtlasPoint[]): Spot[] {
  return points.map((point: AtlasPoint): Spot => ({ x: point.x, y: point.y }));
}

function ofKind(atlas: AtlasDef, kind: AtlasFeature['kind']): Spot[][] {
  return atlas.features.filter((feature: AtlasFeature): boolean => feature.kind === kind).map((feature: AtlasFeature): Spot[] => spots(feature.points));
}

function star(long: number, waist: number, turn: number): string {
  const parts: string[] = [];
  for (let index: number = 0; index < 8; index += 1) {
    const angle: number = turn + (index * Math.PI) / 4;
    const reach: number = index % 2 === 0 ? long : waist;
    parts.push(`${index === 0 ? 'M' : 'L'}${fixed(Math.sin(angle) * reach)} ${fixed(-Math.cos(angle) * reach)}`);
  }
  return `${parts.join('')}Z`;
}

function drawSea(atlas: AtlasDef, parent: SVGGElement, lands: readonly Spot[][], rng: Rng): void {
  svg('rect', 'atlas-sea', parent, { x: 0, y: 0, width: atlas.width, height: atlas.height });
  const sheet: Spot[] = [
    { x: 0, y: 0 },
    { x: atlas.width, y: 0 },
    { x: atlas.width, y: atlas.height },
    { x: 0, y: atlas.height },
  ];
  const waves: string = scatter(sheet, ART.waveSpacing, rng)
    .filter((spot: Spot): boolean => !lands.some((land: Spot[]): boolean => inside(land, spot)))
    .map((spot: Spot): string => `M${fixed(spot.x - ART.waveHalf)} ${fixed(spot.y)}q${fixed(ART.waveHalf / 2)} ${fixed(-ART.waveLift)} ${fixed(ART.waveHalf)} 0t${fixed(ART.waveHalf)} 0`)
    .join('');
  svg('path', 'atlas-waves', parent, { d: waves });
}

function drawLand(parent: SVGGElement, lands: readonly Spot[][]): void {
  const shape: string = lands.map((land: Spot[]): string => smoothPath(land, true)).join('');
  for (const width of ART.shoreWidths) {
    svg('path', 'atlas-shore-line', parent, { d: shape, 'stroke-width': width });
    svg('path', 'atlas-shore-gap', parent, { d: shape, 'stroke-width': width - ART.shoreLine * 2 });
  }
  svg('path', 'atlas-land', parent, { d: shape });
}

function drawRivers(parent: SVGGElement, rivers: readonly Spot[][], rng: Rng): void {
  const shape: string = rivers.map((river: Spot[]): string => smoothPath(roughen(river, false, rng, ART.riverRough, ART.riverPasses), false)).join('');
  svg('path', 'atlas-river-bank', parent, { d: shape });
  svg('path', 'atlas-river', parent, { d: shape });
}

function drawMarsh(parent: SVGGElement, marshes: readonly Spot[][], rng: Rng): void {
  const reeds: string = marshes
    .flatMap((marsh: Spot[]): Spot[] => scatter(marsh, ART.reedSpacing, rng))
    .map((spot: Spot): string => `M${fixed(spot.x - ART.reedHalf)} ${fixed(spot.y)}h${fixed(ART.reedHalf * 2)}M${fixed(spot.x - ART.reedHalf / 2)} ${fixed(spot.y + ART.reedGap)}h${fixed(ART.reedHalf)}M${fixed(spot.x)} ${fixed(spot.y)}v${fixed(-ART.reedGap * 1.4)}`)
    .join('');
  svg('path', 'atlas-reeds', parent, { d: reeds });
}

function drawForest(parent: SVGGElement, forests: readonly Spot[][], rng: Rng): void {
  const trees: Spot[] = forests.flatMap((forest: Spot[]): Spot[] => scatter(forest, ART.treeSpacing, rng)).toSorted((a: Spot, b: Spot): number => a.y - b.y);
  const trunks: string = trees.map((tree: Spot): string => `M${fixed(tree.x)} ${fixed(tree.y)}v${fixed(ART.trunk)}`).join('');
  const crowns: string = trees.map((tree: Spot): string => `M${fixed(tree.x - ART.treeWidth)} ${fixed(tree.y)}a${fixed(ART.treeWidth)} ${fixed(ART.treeHeight)} 0 1 1 ${fixed(ART.treeWidth * 2)} 0Z`).join('');
  svg('path', 'atlas-trunks', parent, { d: trunks });
  svg('path', 'atlas-trees', parent, { d: crowns });
}

function drawRidges(parent: SVGGElement, ridges: readonly Spot[][], rng: Rng): void {
  const peaks: Spot[] = ridges
    .flatMap((ridge: Spot[]): Spot[] => along(roughen(ridge, false, rng, ART.ridgeRough, 1), ART.ridgeSpacing))
    .map((spot: Spot): Spot => ({ x: spot.x + (rng() - 0.5) * ART.peakSpread, y: spot.y + (rng() - 0.5) * ART.peakSpread * 2 }))
    .toSorted((a: Spot, b: Spot): number => a.y - b.y);
  for (const peak of peaks) {
    const size: number = ART.peakMin + rng() * ART.peakGrow;
    const top: Spot = { x: peak.x + size * ART.peakLean * (rng() - 0.5), y: peak.y - size * ART.peakHeight };
    const right: Spot = { x: peak.x + size, y: peak.y };
    svg('path', 'atlas-peak', parent, { d: `M${fixed(peak.x - size)} ${fixed(peak.y)}L${fixed(top.x)} ${fixed(top.y)}L${fixed(right.x)} ${fixed(right.y)}` });
    const hatch: string = ART.hatchSteps
      .map((step: number): string => {
        const from: Spot = { x: top.x + (right.x - top.x) * step, y: top.y + (right.y - top.y) * step };
        return `M${fixed(from.x)} ${fixed(from.y)}L${fixed(from.x - size * 0.16)} ${fixed(peak.y - (peak.y - from.y) * 0.25)}`;
      })
      .join('');
    svg('path', 'atlas-hatch', parent, { d: hatch });
  }
}

function drawGrain(atlas: AtlasDef, parent: SVGGElement, defs: SVGDefsElement, id: string, rng: Rng): void {
  const pattern: SVGPatternElement = svg('pattern', '', defs, { id, width: ART.grainTile, height: ART.grainTile, patternUnits: 'userSpaceOnUse' });
  let dots: string = '';
  for (let index: number = 0; index < ART.grainDots; index += 1) dots += `M${fixed(rng() * ART.grainTile)} ${fixed(rng() * ART.grainTile)}h${fixed(ART.grainSize + rng() * ART.grainSize)}`;
  svg('path', 'atlas-grain-dots', pattern, { d: dots });
  svg('rect', 'atlas-grain', parent, { x: 0, y: 0, width: atlas.width, height: atlas.height, fill: `url(#${id})` });
}

function drawFrame(atlas: AtlasDef, parent: SVGGElement): void {
  const outer: number = ART.frameInset;
  const inner: number = ART.frameInset + ART.frameGap;
  svg('rect', 'atlas-frame', parent, { x: outer, y: outer, width: atlas.width - outer * 2, height: atlas.height - outer * 2 });
  svg('rect', 'atlas-frame thin', parent, { x: inner, y: inner, width: atlas.width - inner * 2, height: atlas.height - inner * 2 });
  let ticks: string = '';
  for (let x: number = ART.tickEvery; x < atlas.width; x += ART.tickEvery) ticks += `M${x} ${inner}v${ART.tickLength}M${x} ${atlas.height - inner}v${-ART.tickLength}`;
  for (let y: number = ART.tickEvery; y < atlas.height; y += ART.tickEvery) ticks += `M${inner} ${y}h${ART.tickLength}M${atlas.width - inner} ${y}h${-ART.tickLength}`;
  svg('path', 'atlas-frame thin', parent, { d: ticks });
}

function drawCompass(atlas: AtlasDef, parent: SVGGElement): void {
  const rose: SVGGElement = svg('g', 'atlas-rose', parent, { transform: `translate(${atlas.compass.x} ${atlas.compass.y})` });
  svg('circle', 'atlas-rose-ring', rose, { r: ART.roseRadius });
  svg('circle', 'atlas-rose-ring thin', rose, { r: ART.roseInner });
  svg('path', 'atlas-rose-minor', rose, { d: star(ART.roseShort, ART.roseWaist * 0.7, Math.PI / 4) });
  svg('path', 'atlas-rose-major', rose, { d: star(ART.roseLong, ART.roseWaist, 0) });
  svg('path', 'atlas-rose-north', rose, { d: `M0 ${-ART.roseLong}L${ART.roseWaist * 0.7} ${-ART.roseWaist * 0.7}L0 0Z` });
  const north: SVGTextElement = svg('text', 'atlas-rose-letter', rose, { y: -ART.roseLetter + 6, 'text-anchor': 'middle' });
  north.textContent = 'N';
}

function drawLabels(atlas: AtlasDef, parent: SVGGElement): void {
  for (const label of atlas.labels) {
    const text: SVGTextElement = svg('text', 'atlas-region', parent, { 'text-anchor': 'middle', 'font-size': label.size, 'letter-spacing': fixed(label.size * ART.labelSpacing), transform: `translate(${label.x} ${label.y}) rotate(${label.tilt})` });
    text.textContent = label.text;
  }
}

export function drawAtlasArt(atlas: AtlasDef, parent: SVGGElement, defs: SVGDefsElement, grainId: string): void {
  const rng: Rng = seeded(ART.seed);
  const lands: Spot[][] = ofKind(atlas, 'coast').map((coast: Spot[]): Spot[] => roughen(coast, true, rng, ART.coastRough, ART.coastPasses));
  drawSea(atlas, parent, lands, rng);
  drawLand(parent, lands);
  drawRivers(parent, ofKind(atlas, 'river'), rng);
  drawMarsh(parent, ofKind(atlas, 'marsh'), rng);
  drawRidges(parent, ofKind(atlas, 'ridge'), rng);
  drawForest(parent, ofKind(atlas, 'forest'), rng);
  drawGrain(atlas, parent, defs, grainId, rng);
  drawLabels(atlas, parent);
  drawCompass(atlas, parent);
  drawFrame(atlas, parent);
}
