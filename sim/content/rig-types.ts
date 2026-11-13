export interface RigActionClip {
  readonly clip: string;
  readonly impactFraction: number;
}

export interface RigUnarmedClips {
  readonly idle: string;
  readonly actions: Readonly<Record<string, RigActionClip>>;
}

export interface RigClips {
  readonly idle: string;
  readonly run: string;
  readonly hit: readonly string[];
  readonly death: readonly string[];
  readonly rise: string | null;
  readonly actions: Readonly<Record<string, RigActionClip>>;
  readonly unarmed: RigUnarmedClips | null;
}

export interface RigGait {
  readonly clip: string;
  readonly groundSpeed: number;
}

export type Triple = readonly [number, number, number];

export interface RigSocket {
  readonly bone: string;
  readonly position: Triple;
  readonly rotationDegrees: Triple;
  readonly scale: number;
}

export interface AttachmentDef {
  readonly id: string;
  readonly model: string;
  readonly socket: string;
  readonly surfaces: Readonly<Record<string, string>>;
}

export interface RigDef {
  readonly id: string;
  readonly url: string;
  readonly clipFolder: string;
  readonly scale: number;
  readonly yawOffsetDegrees: number;
  readonly height: number;
  readonly rootMotionBone: string | null;
  readonly gaits: readonly RigGait[];
  readonly clips: RigClips;
  readonly sockets: Readonly<Record<string, RigSocket>>;
  readonly hiddenNodes: readonly string[];
  readonly idleRate: number;
  readonly bodyParts: Readonly<Record<string, readonly string[]>>;
  readonly base: readonly string[];
  readonly restHands: Readonly<Record<string, Readonly<Record<string, Triple>>>>;
}
