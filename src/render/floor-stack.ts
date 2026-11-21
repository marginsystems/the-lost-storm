export const FLOOR_STACK = {
  slots: 8,
  most: 16,
  lanes: 4,
} as const;

export interface FloorCorner {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
}

export type CornerAlphas = readonly [number, number, number, number];

export interface FloorStack {
  readonly fringes: readonly string[];
  readonly blends: readonly string[];
  readonly surfaces: readonly string[];
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly shades: number[];
  readonly solid: number[];
  readonly fringeLow: number[];
  readonly fringeHigh: number[];
  readonly blendLow: number[];
  readonly blendHigh: number[];
  readonly indices: number[];
  readonly fringeOrder: number[];
  readonly blendOrder: number[];
}

export interface ShapedFloor {
  readonly fringes: readonly string[];
  readonly blends: readonly string[];
  readonly surfaces: readonly string[];
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly shades: Float32Array;
  readonly solid: Float32Array;
  readonly fringeLow: Float32Array;
  readonly fringeHigh: Float32Array;
  readonly blendLow: Float32Array;
  readonly blendHigh: Float32Array;
  readonly indices: Uint32Array;
  readonly fringeOrder: readonly number[];
  readonly blendOrder: readonly number[];
}

export function createFloorStack(solids: readonly string[], fringes: readonly string[], blends: readonly string[]): FloorStack | null {
  if (fringes.length > FLOOR_STACK.slots || blends.length > FLOOR_STACK.slots) return null;
  const surfaces: string[] = [...new Set([...solids, ...fringes, ...blends])];
  if (surfaces.length > FLOOR_STACK.most) return null;
  return { fringes, blends, surfaces, positions: [], normals: [], uvs: [], shades: [], solid: [], fringeLow: [], fringeHigh: [], blendLow: [], blendHigh: [], indices: [], fringeOrder: [], blendOrder: [] };
}

export function surfaceLayer(stack: Pick<FloorStack, 'surfaces'>, surface: string): number | null {
  const known: number = stack.surfaces.indexOf(surface);
  return known >= 0 ? known : null;
}

function noteOrder(order: number[], alphas: readonly (CornerAlphas | null)[]): void {
  alphas.forEach((alpha: CornerAlphas | null, slot: number): void => {
    if (alpha !== null && !order.includes(slot)) order.push(slot);
  });
}

function pushSlots(low: number[], high: number[], alphas: readonly (CornerAlphas | null)[], corner: number): void {
  for (let slot: number = 0; slot < FLOOR_STACK.slots; slot += 1) {
    const value: number = alphas[slot]?.[corner] ?? 0;
    if (slot < FLOOR_STACK.lanes) low.push(value);
    else high.push(value);
  }
}

export function floorQuad(stack: FloorStack, corners: readonly [FloorCorner, FloorCorner, FloorCorner, FloorCorner], uvs: readonly number[], shades: readonly number[], solid: string, fringes: readonly (CornerAlphas | null)[], blends: readonly (CornerAlphas | null)[]): boolean {
  const layer: number | null = surfaceLayer(stack, solid);
  if (layer === null) return false;
  const base: number = stack.positions.length / 3;
  corners.forEach((corner: FloorCorner, at: number): void => {
    stack.positions.push(corner.x, corner.y, corner.z);
    stack.normals.push(corner.nx, corner.ny, corner.nz);
    stack.uvs.push(uvs[at * 2] ?? 0, uvs[at * 2 + 1] ?? 0);
    stack.shades.push(shades[at] ?? 1);
    stack.solid.push(layer);
    pushSlots(stack.fringeLow, stack.fringeHigh, fringes, at);
    pushSlots(stack.blendLow, stack.blendHigh, blends, at);
  });
  stack.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  noteOrder(stack.fringeOrder, fringes);
  noteOrder(stack.blendOrder, blends);
  return true;
}

export function shapedFloor(stack: FloorStack): ShapedFloor {
  return {
    fringes: stack.fringes,
    blends: stack.blends,
    surfaces: [...stack.surfaces],
    positions: Float32Array.from(stack.positions),
    normals: Float32Array.from(stack.normals),
    uvs: Float32Array.from(stack.uvs),
    shades: Float32Array.from(stack.shades),
    solid: Float32Array.from(stack.solid),
    fringeLow: Float32Array.from(stack.fringeLow),
    fringeHigh: Float32Array.from(stack.fringeHigh),
    blendLow: Float32Array.from(stack.blendLow),
    blendHigh: Float32Array.from(stack.blendHigh),
    indices: Uint32Array.from(stack.indices),
    fringeOrder: [...stack.fringeOrder],
    blendOrder: [...stack.blendOrder],
  };
}
