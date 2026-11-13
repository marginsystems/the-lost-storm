export const LOBBY_ORBIT = {
  swayRadians: 0.2,
  swayPeriodSeconds: 45,
  pitchUpRadians: 0.6,
  floorClearance: 0.6,
  radiansPerPixel: 0.006,
  returnSpring: { freq: 1.25, damping: 0.78 },
  holdSeconds: 1.6,
  restBelowRadians: 0.002,
  zoomSpring: { freq: 1.6, damping: 1 },
  zoomPerWheelPixel: 0.0016,
  far: { distance: 10.2, lookHeight: 0.98 },
  near: { distance: 2.6, lookHeight: 1.85 },
  height: 1.4,
  activeWithinMs: 250,
  maxSubstepsPerSecond: 480,
} as const;

export interface Spring {
  x: number;
  v: number;
}

export interface LobbyOrbit {
  held: boolean;
  holdLeft: number;
  seconds: number;
  readonly yaw: Spring;
  readonly pitch: Spring;
  readonly zoom: Spring;
  zoomTarget: number;
}

export interface OrbitView {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly lookHeight: number;
}

export function createLobbyOrbit(): LobbyOrbit {
  return { held: false, holdLeft: 0, seconds: 0, yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, zoom: { x: 0, v: 0 }, zoomTarget: 0 };
}

export function stepSpring(spring: Spring, target: number, freq: number, damping: number, dt: number): number {
  const stiffness: number = (2 * Math.PI * freq) ** 2;
  const friction: number = 2 * damping * 2 * Math.PI * freq;
  const steps: number = Math.max(1, Math.ceil(dt * LOBBY_ORBIT.maxSubstepsPerSecond));
  const step: number = dt / steps;
  for (let index: number = 0; index < steps; index += 1) {
    spring.v += (stiffness * (target - spring.x) - friction * spring.v) * step;
    spring.x += spring.v * step;
  }
  return spring.x;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function grab(orbit: LobbyOrbit): void {
  orbit.held = true;
  orbit.yaw.v = 0;
  orbit.pitch.v = 0;
}

export function release(orbit: LobbyOrbit): void {
  orbit.held = false;
  orbit.holdLeft = LOBBY_ORBIT.holdSeconds;
}

export function orbitBy(orbit: LobbyOrbit, dxPixels: number, dyPixels: number): void {
  if (!orbit.held) return;
  orbit.yaw.x = wrapAngle(orbit.yaw.x - dxPixels * LOBBY_ORBIT.radiansPerPixel);
  orbit.pitch.x = Math.min(LOBBY_ORBIT.pitchUpRadians, orbit.pitch.x + dyPixels * LOBBY_ORBIT.radiansPerPixel);
  orbit.yaw.v = 0;
  orbit.pitch.v = 0;
}

export function zoomBy(orbit: LobbyOrbit, amount: number): void {
  orbit.zoomTarget = Math.min(1, Math.max(0, orbit.zoomTarget + amount));
}

export function stepOrbit(orbit: LobbyOrbit, dt: number): OrbitView {
  orbit.seconds += dt;
  if (!orbit.held) {
    orbit.holdLeft = Math.max(0, orbit.holdLeft - dt);
    if (orbit.holdLeft === 0) {
      orbit.yaw.x = wrapAngle(orbit.yaw.x);
      for (const spring of [orbit.yaw, orbit.pitch]) {
        stepSpring(spring, 0, LOBBY_ORBIT.returnSpring.freq, LOBBY_ORBIT.returnSpring.damping, dt);
        if (Math.abs(spring.x) < LOBBY_ORBIT.restBelowRadians && Math.abs(spring.v) < LOBBY_ORBIT.restBelowRadians) {
          spring.x = 0;
          spring.v = 0;
        }
      }
    }
  }
  const zoom: number = stepSpring(orbit.zoom, orbit.zoomTarget, LOBBY_ORBIT.zoomSpring.freq, LOBBY_ORBIT.zoomSpring.damping, dt);
  const sway: number = LOBBY_ORBIT.swayRadians * Math.sin((2 * Math.PI * orbit.seconds) / LOBBY_ORBIT.swayPeriodSeconds);
  const yaw: number = sway + orbit.yaw.x;
  const lookHeight: number = LOBBY_ORBIT.far.lookHeight + (LOBBY_ORBIT.near.lookHeight - LOBBY_ORBIT.far.lookHeight) * zoom;
  const distance: number = LOBBY_ORBIT.far.distance + (LOBBY_ORBIT.near.distance - LOBBY_ORBIT.far.distance) * zoom;
  const settled: number = Math.atan2(LOBBY_ORBIT.height - LOBBY_ORBIT.far.lookHeight, LOBBY_ORBIT.far.distance);
  const lowest: number = -Math.asin(Math.min(1, Math.max(0, (lookHeight - LOBBY_ORBIT.floorClearance) / distance)));
  if (settled + orbit.pitch.x < lowest) {
    orbit.pitch.x = lowest - settled;
    orbit.pitch.v = Math.max(0, orbit.pitch.v);
  }
  const rise: number = settled + orbit.pitch.x;
  return {
    x: Math.sin(yaw) * Math.cos(rise) * distance,
    y: lookHeight + Math.sin(rise) * distance,
    z: Math.cos(yaw) * Math.cos(rise) * distance,
    lookHeight,
  };
}
