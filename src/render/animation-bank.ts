export const BANK = {
  repaceTolerance: 0.05,
} as const;

export function closeRate(held: number, wanted: number): boolean {
  return Math.abs(wanted - held) <= BANK.repaceTolerance * Math.max(Math.abs(wanted), Math.abs(held));
}

export interface AnimationBank {
  take(dt: number, seen: boolean): number | null;
  owe(): number;
  owing(): boolean;
  drop(): void;
}

export function animationBank(): AnimationBank {
  let banked: number = 0;
  return {
    take(dt: number, seen: boolean): number | null {
      if (!seen) {
        banked += dt;
        return null;
      }
      const step: number = banked + dt;
      banked = 0;
      return step;
    },
    owe(): number {
      const owed: number = banked;
      banked = 0;
      return owed;
    },
    owing(): boolean {
      return banked > 0;
    },
    drop(): void {
      banked = 0;
    },
  };
}
