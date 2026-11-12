import type { Vec2 } from '../sim/math.ts';
import type { Command } from '../sim/world/types.ts';

export interface ExitFrame {
  readonly fresh: boolean;
  readonly tick: boolean;
  readonly open: boolean;
  readonly ground: Vec2;
}

export function exitPress(exit: string, frame: ExitFrame): Command | null {
  if (frame.fresh) return { type: 'travel', exit };
  if (!frame.open) return { type: 'move', held: true, dest: frame.ground };
  return frame.tick ? { type: 'travel', exit } : null;
}
