export const MARKER_ROLES = ['waypoint', 'checkpoint', 'down', 'up'] as const;
export type MarkerRole = (typeof MARKER_ROLES)[number];

export const MARKER_FACINGS = ['arrival', 'camera'] as const;
export type MarkerFacing = (typeof MARKER_FACINGS)[number];

export const VEIL_SHAPES = ['arch', 'well'] as const;
export type VeilShape = (typeof VEIL_SHAPES)[number];

export const VEIL_FLOWS = ['rise', 'sink'] as const;
export type VeilFlow = (typeof VEIL_FLOWS)[number];

export interface MarkerFocal {
  readonly node: string;
  readonly lift: number;
  readonly spin: number;
  readonly bob: number;
}

export interface MarkerSeal {
  readonly node: string;
  readonly sink: number;
}

export interface MarkerVeil {
  readonly node: string;
  readonly shape: VeilShape;
  readonly flow: VeilFlow;
  readonly edge: string;
  readonly core: string;
}

export interface MarkerLight {
  readonly intensity: number;
  readonly distance: number;
  readonly height: number;
}

export interface MarkerPick {
  readonly radius: number;
  readonly height: number;
}

export interface MarkerLevels {
  readonly dormant: number;
  readonly awake: number;
  readonly aimed: number;
  readonly used: number;
}

export interface MarkerKind {
  readonly id: string;
  readonly model: string;
  readonly surfaces: Readonly<Record<string, string>>;
  readonly color: string;
  readonly glow: readonly string[];
  readonly focal: MarkerFocal | null;
  readonly seal: MarkerSeal | null;
  readonly veil: MarkerVeil | null;
  readonly light: MarkerLight;
  readonly shadow: number;
  readonly pick: MarkerPick;
  readonly label: number;
  readonly facing: MarkerFacing;
  readonly levels: MarkerLevels;
}

export interface MarkerLibrary {
  readonly kinds: ReadonlyMap<string, MarkerKind>;
  readonly roles: Readonly<Record<MarkerRole, string>>;
}
