export const VFX_STYLES = ['slash', 'claw', 'shockwave', 'bolt', 'orb', 'roll', 'fork', 'mist', 'wind', 'storm', 'heave', 'brand', 'beam', 'gap'] as const;
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

export interface SkillVfx {
  readonly style: VfxStyle;
  readonly color: string;
  readonly cue: VfxCue;
  readonly light: number;
  readonly lightning: VfxLightning | null;
  readonly impact: VfxImpact | null;
  readonly trail: number;
}
