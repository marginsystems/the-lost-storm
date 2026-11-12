import type { ZoneLightning } from '../../sim/content/road-types.ts';

export const WEATHER = {
  lightningDecay: 3.2,
  flickerAt: 0.14,
  flickerPower: 0.7,
} as const;

export interface Weather {
  update(dt: number): void;
  strike(power: number): void;
  setLightning(lightning: ZoneLightning | null): void;
  readonly flash: number;
}

export function createWeather(random: () => number = Math.random): Weather {
  let flash: number = 0;
  let lightning: ZoneLightning | null = null;
  let untilStrike: number = Number.POSITIVE_INFINITY;
  let untilFlicker: number = -1;

  return {
    get flash(): number {
      return flash;
    },
    strike(power: number): void {
      flash = Math.max(flash, power);
    },
    setLightning(next: ZoneLightning | null): void {
      lightning = next;
      untilStrike = next === null ? Number.POSITIVE_INFINITY : next.first;
      untilFlicker = -1;
    },
    update(dt: number): void {
      flash = Math.max(0, flash - WEATHER.lightningDecay * dt * Math.max(0.25, flash));
      untilStrike -= dt;
      if (untilStrike <= 0 && lightning !== null) {
        flash = 1;
        untilStrike = lightning.min + random() * (lightning.max - lightning.min);
        untilFlicker = WEATHER.flickerAt;
      }
      if (untilFlicker > 0) {
        untilFlicker -= dt;
        if (untilFlicker <= 0) flash = Math.max(flash, WEATHER.flickerPower);
      }
    },
  };
}
