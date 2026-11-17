import type { ServiceKind } from '../content/trade-types.ts';
import type { Vec2 } from '../math.ts';

export interface OpenService {
  readonly kind: ServiceKind;
  readonly owner: string;
  readonly anchor: Vec2;
}

export type ItemPlace = 'bag' | 'stash';
