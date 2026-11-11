export const WEATHER = {
  lightningMin: 7,
  lightningMax: 16,
  lightningDecay: 3.2,
  flickerAt: 0.14,
  flickerPower: 0.7,
} as const;

export interface Weather {
  update(dt: number): void;
  strike(power: number): void;
  readonly flash: number;
}

export function createWeather(): Weather {
  let flash: number = 0;
  let untilStrike: number = WEATHER.lightningMin;
  let untilFlicker: number = -1;

  return {
    get flash(): number {
      return flash;
    },
    strike(power: number): void {
      flash = Math.max(flash, power);
    },
    update(dt: number): void {
      flash = Math.max(0, flash - WEATHER.lightningDecay * dt * Math.max(0.25, flash));
      untilStrike -= dt;
      if (untilStrike <= 0) {
        flash = 1;
        untilStrike = WEATHER.lightningMin + Math.random() * (WEATHER.lightningMax - WEATHER.lightningMin);
        untilFlicker = WEATHER.flickerAt;
      }
      if (untilFlicker > 0) {
        untilFlicker -= dt;
        if (untilFlicker <= 0) flash = Math.max(flash, WEATHER.flickerPower);
      }
    },
  };
}
