export interface RigActionClip {
  readonly clip: string;
  readonly impactFraction: number;
}

export interface RigStanceClips {
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
  readonly unarmed: RigStanceClips | null;
  readonly stances: Readonly<Record<string, RigStanceClips>>;
}

export interface RigGait {
  readonly clip: string;
  readonly groundSpeed: number;
  readonly stride: number | null;
}

export type Triple = readonly [number, number, number];

export interface RigSocket {
  readonly bone: string;
  readonly position: Triple;
  readonly rotationDegrees: Triple;
  readonly scale: number;
}

export interface RigContact {
  readonly bone: string;
  readonly radius: number;
}

export interface AttachmentDef {
  readonly id: string;
  readonly model: string;
  readonly socket: string;
  readonly stance: string | null;
  readonly surfaces: Readonly<Record<string, string>>;
}

export interface RigDef {
  readonly id: string;
  readonly url: string;
  readonly clipFolder: string;
  readonly frame: string;
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
  readonly contacts: readonly RigContact[];
}
