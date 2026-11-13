export const TRACK = {
  delayMs: 250,
  batchMs: 200,
  restartAfter: 1.5,
  keepMs: 3000,
  walkFrom: 0.2,
  millisecondsPerSecond: 1000,
  fadeRate: 4.5,
  settledWithin: 0.004,
} as const;

export interface TrackSample {
  readonly at: number;
  readonly x: number;
  readonly z: number;
  readonly facing: number;
}

export interface Track {
  samples: TrackSample[];
}

export interface TrackPose {
  readonly x: number;
  readonly z: number;
  readonly facing: number;
  readonly speed: number;
}

export function createTrack(start: TrackSample): Track {
  return { samples: [start] };
}

export function placeTrack(track: Track, sample: TrackSample): void {
  track.samples = [sample];
}

export function pushSample(track: Track, sample: TrackSample): void {
  const last: TrackSample | undefined = track.samples[track.samples.length - 1];
  if (last !== undefined && sample.at <= last.at) return;
  if (last !== undefined && sample.at - last.at > TRACK.batchMs * TRACK.restartAfter) track.samples.push({ ...last, at: sample.at - TRACK.batchMs });
  track.samples.push(sample);
  const oldest: number = sample.at - TRACK.keepMs;
  while (track.samples.length > 2 && (track.samples[1]?.at ?? Number.POSITIVE_INFINITY) < oldest) track.samples.shift();
}

function turnBetween(from: number, to: number, share: number): number {
  let delta: number = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * share;
}

function still(sample: TrackSample): TrackPose {
  return { x: sample.x, z: sample.z, facing: sample.facing, speed: 0 };
}

export function poseAt(track: Track, at: number): TrackPose | null {
  const samples: readonly TrackSample[] = track.samples;
  const first: TrackSample | undefined = samples[0];
  if (first === undefined) return null;
  if (at <= first.at) return still(first);
  for (let index: number = 1; index < samples.length; index += 1) {
    const from: TrackSample | undefined = samples[index - 1];
    const to: TrackSample | undefined = samples[index];
    if (from === undefined || to === undefined || at > to.at) continue;
    const span: number = to.at - from.at;
    const share: number = span <= 0 ? 1 : (at - from.at) / span;
    const dx: number = to.x - from.x;
    const dz: number = to.z - from.z;
    const speed: number = span <= 0 ? 0 : (Math.hypot(dx, dz) / span) * TRACK.millisecondsPerSecond;
    const facing: number = speed >= TRACK.walkFrom ? Math.atan2(dx, dz) : turnBetween(from.facing, to.facing, share);
    return { x: from.x + dx * share, z: from.z + dz * share, facing, speed };
  }
  const last: TrackSample | undefined = samples[samples.length - 1];
  return last === undefined ? null : still(last);
}

export function fadeToward(value: number, target: number, dt: number): number {
  const next: number = value + (target - value) * (1 - Math.exp(-TRACK.fadeRate * Math.max(0, dt)));
  return Math.abs(target - next) < TRACK.settledWithin ? target : next;
}
