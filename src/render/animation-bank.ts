export interface AnimationBank {
  take(dt: number, seen: boolean): number | null;
  owe(): number;
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
    drop(): void {
      banked = 0;
    },
  };
}
