export const LOBBY_ORBIT = {
  pitchUpRadians: 0.6,
  floorClearance: 0.6,
  radiansPerPixel: 0.006,
  pitchReturnSpring: { freq: 1.25, damping: 0.78 },
  autoRadiansPerSecond: (2 * Math.PI) / 38,
  resumeAfterSeconds: 4,
  autoSpring: { freq: 0.9, damping: 1 },
  flingFriction: 3.2,
  flingMaxSpeed: 9,
  flingRestBelow: 0.01,
  flingStillSeconds: 0.1,
  flingSmoothSeconds: 0.05,
  flingShortestSeconds: 1 / 240,
  restBelowRadians: 0.002,
  zoomSpring: { freq: 1.6, damping: 1 },
  zoomPerWheelPixel: 0.0016,
  far: { distance: 10.2, lookHeight: 0.98 },
  near: { distance: 3.4, lookHeight: 1.85 },
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
  idleSeconds: number;
  seconds: number;
  movedAt: number;
  readonly yaw: Spring;
  readonly auto: Spring;
  readonly pitch: Spring;
  readonly zoom: Spring;
  zoomTarget: number;
}

export interface OrbitView {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly lookHeight: number;
  readonly zoom: number;
}

export function createLobbyOrbit(): LobbyOrbit {
  return { held: false, idleSeconds: LOBBY_ORBIT.resumeAfterSeconds, seconds: 0, movedAt: 0, yaw: { x: 0, v: 0 }, auto: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, zoom: { x: 0, v: 0 }, zoomTarget: 0 };
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
  orbit.movedAt = orbit.seconds;
}

export function release(orbit: LobbyOrbit): void {
  orbit.held = false;
  if (orbit.seconds - orbit.movedAt > LOBBY_ORBIT.flingStillSeconds) orbit.yaw.v = 0;
}

export function orbitBy(orbit: LobbyOrbit, dxPixels: number, dyPixels: number, seconds: number): void {
  if (!orbit.held) return;
  const step: number = -dxPixels * LOBBY_ORBIT.radiansPerPixel;
  orbit.yaw.x = wrapAngle(orbit.yaw.x + step);
  const interval: number = Math.max(seconds, LOBBY_ORBIT.flingShortestSeconds);
  const blend: number = 1 - Math.exp(-interval / LOBBY_ORBIT.flingSmoothSeconds);
  const speed: number = orbit.yaw.v + (step / interval - orbit.yaw.v) * blend;
  orbit.yaw.v = Math.max(-LOBBY_ORBIT.flingMaxSpeed, Math.min(LOBBY_ORBIT.flingMaxSpeed, speed));
  orbit.pitch.x = Math.min(LOBBY_ORBIT.pitchUpRadians, orbit.pitch.x + dyPixels * LOBBY_ORBIT.radiansPerPixel);
  orbit.pitch.v = 0;
  orbit.movedAt = orbit.seconds;
}

export function zoomBy(orbit: LobbyOrbit, amount: number): void {
  orbit.zoomTarget = Math.min(1, Math.max(0, orbit.zoomTarget + amount));
  orbit.idleSeconds = 0;
}

function stepTurn(orbit: LobbyOrbit, dt: number): void {
  if (orbit.held) {
    orbit.idleSeconds = 0;
    orbit.auto.x = 0;
    orbit.auto.v = 0;
    return;
  }
  orbit.idleSeconds += dt;
  const resting: boolean = orbit.idleSeconds >= LOBBY_ORBIT.resumeAfterSeconds;
  stepSpring(orbit.auto, resting ? LOBBY_ORBIT.autoRadiansPerSecond : 0, LOBBY_ORBIT.autoSpring.freq, LOBBY_ORBIT.autoSpring.damping, dt);
  orbit.yaw.x = wrapAngle(orbit.yaw.x + (orbit.yaw.v + orbit.auto.x) * dt);
  orbit.yaw.v *= Math.exp(-LOBBY_ORBIT.flingFriction * dt);
  if (Math.abs(orbit.yaw.v) < LOBBY_ORBIT.flingRestBelow) orbit.yaw.v = 0;
  if (!resting) return;
  stepSpring(orbit.pitch, 0, LOBBY_ORBIT.pitchReturnSpring.freq, LOBBY_ORBIT.pitchReturnSpring.damping, dt);
  if (Math.abs(orbit.pitch.x) < LOBBY_ORBIT.restBelowRadians && Math.abs(orbit.pitch.v) < LOBBY_ORBIT.restBelowRadians) {
    orbit.pitch.x = 0;
    orbit.pitch.v = 0;
  }
}

export function stepOrbit(orbit: LobbyOrbit, dt: number): OrbitView {
  orbit.seconds += dt;
  stepTurn(orbit, dt);
  const zoom: number = stepSpring(orbit.zoom, orbit.zoomTarget, LOBBY_ORBIT.zoomSpring.freq, LOBBY_ORBIT.zoomSpring.damping, dt);
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
    x: Math.sin(orbit.yaw.x) * Math.cos(rise) * distance,
    y: lookHeight + Math.sin(rise) * distance,
    z: Math.cos(orbit.yaw.x) * Math.cos(rise) * distance,
    lookHeight,
    zoom,
  };
}
