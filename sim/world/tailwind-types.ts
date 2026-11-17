export type TailwindEnd = 'faded' | 'left' | 'fell';

export interface TailwindState {
  points: number;
  kills: number;
  tier: number;
  best: number;
  fuse: number;
  full: number;
  lastKill: number;
  xp: number;
  gold: number;
}
