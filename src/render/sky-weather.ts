import type { Scene } from 'three';
import type { ZoneLightning } from '../../sim/content/road-types.ts';
import type { ForkView } from './fork-bolt.ts';
import { createForkView } from './fork-bolt.ts';
import type { SkyFlash, Thunder, Weather } from './weather.ts';
import { createWeather } from './weather.ts';

export interface Sky {
  update(dt: number, focusX: number, focusZ: number, soft: boolean): void;
  strike(power: number): void;
  pulse(power: number): void;
  setLightning(lightning: ZoneLightning | null): void;
  takeThunder(): Thunder[];
  readonly flash: number;
  readonly light: SkyFlash;
}

export function createSky(scene: Scene, weather: Weather = createWeather()): Sky {
  const fork: ForkView = createForkView(scene);
  return {
    get flash(): number {
      return weather.flash;
    },
    get light(): SkyFlash {
      return weather.light;
    },
    strike(power: number): void {
      weather.strike(power);
    },
    pulse(power: number): void {
      weather.pulse(power);
    },
    setLightning(lightning: ZoneLightning | null): void {
      weather.setLightning(lightning);
    },
    takeThunder(): Thunder[] {
      return weather.takeThunder();
    },
    update(dt: number, focusX: number, focusZ: number, soft: boolean): void {
      weather.setSoft(soft);
      weather.update(dt);
      fork.update(weather.bolt, focusX, focusZ);
    },
  };
}
