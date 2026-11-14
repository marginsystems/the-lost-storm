import type { Vec2 } from '../math.ts';

export interface MomentFigure {
  readonly echo: number;
  pos: Vec2;
  readonly facing: number;
  turned: boolean;
  monsterId: number | null;
}
