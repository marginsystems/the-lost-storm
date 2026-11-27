export const VFX_STYLES = ['slash', 'claw', 'shockwave', 'bolt', 'orb', 'roll', 'fork', 'mist', 'wind', 'storm', 'heave', 'brand', 'beam', 'gap', 'mend', 'gale', 'blaze', 'wave', 'fire', 'firebird'] as const;
export type VfxStyle = (typeof VFX_STYLES)[number];

export const VFX_CUES = ['none', 'hand', 'ground', 'blade'] as const;
export type VfxCue = (typeof VFX_CUES)[number];

export const VFX_MAX_FORKS: number = 3;

export interface VfxLightning {
  readonly forks: number;
  readonly glow: number;
  readonly afterglow: number;
  readonly jitter: number;
  readonly width: number;
  readonly core: number;
}

export interface VfxImpact {
  readonly sparks: number;
  readonly flash: number;
}

export interface VfxGather {
  readonly radius: number;
  readonly lift: number;
  readonly size: readonly number[];
  readonly glow: readonly number[];
  readonly dust: number;
  readonly light: number;
}

export interface VfxRipple {
  readonly delay: number;
  readonly strength: number;
}

export interface VfxWave {
  readonly halfWidth: number;
  readonly depth: number;
  readonly mist: number;
  readonly swell: readonly number[];
  readonly ripples: readonly VfxRipple[];
  readonly quiet: number;
}

export interface VfxPunch {
  readonly dust: number;
  readonly kick: number;
}

export interface VfxFlare {
  readonly at: number;
  readonly strength: number;
}

export interface VfxBurn {
  readonly flares: readonly VfxFlare[];
  readonly embers: number;
  readonly light: number;
}

export interface VfxShadow {
  readonly color: string;
  readonly strength: number;
}

export interface VfxCover {
  readonly glow: number;
  readonly wobble: number;
}

export interface VfxWater {
  readonly deep: string;
  readonly foam: string;
  readonly depth: number;
}

export interface SkillVfx {
  readonly style: VfxStyle;
  readonly color: string;
  readonly cue: VfxCue;
  readonly light: number;
  readonly lightning: VfxLightning | null;
  readonly impact: VfxImpact | null;
  readonly trail: number;
  readonly linger: number;
  readonly gather: VfxGather | null;
  readonly wave: VfxWave | null;
  readonly punch: VfxPunch | null;
  readonly burn: VfxBurn | null;
  readonly shadow: VfxShadow | null;
  readonly water: VfxWater | null;
  readonly cover: VfxCover | null;
  readonly rim: boolean;
}
