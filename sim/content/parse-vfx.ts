import type { Fields } from './read.ts';
import { choice, ContentError, fields, nonNegative, positive, share, text } from './read.ts';
import type { SkillVfx, VfxImpact, VfxLightning } from './vfx-types.ts';
import { VFX_CUES, VFX_MAX_FORKS, VFX_STYLES } from './vfx-types.ts';

function vfxLightning(value: unknown, where: string): VfxLightning | null {
  if (value === undefined) return null;
  const source: Fields = fields(value, where);
  const forks: number = nonNegative(source, 'forks', where);
  if (!Number.isInteger(forks) || forks > VFX_MAX_FORKS) throw new ContentError(`${where}.forks`, `expected a whole number from 0 to ${VFX_MAX_FORKS}`);
  return { forks, glow: share(source, 'glow', where), afterglow: positive(source, 'afterglow', where), jitter: nonNegative(source, 'jitter', where) };
}

function vfxImpact(value: unknown, where: string): VfxImpact | null {
  if (value === undefined) return null;
  const source: Fields = fields(value, where);
  const sparks: number = nonNegative(source, 'sparks', where);
  if (!Number.isInteger(sparks)) throw new ContentError(`${where}.sparks`, 'expected a whole number');
  return { sparks, flash: nonNegative(source, 'flash', where) };
}

export function skillVfx(value: unknown, where: string): SkillVfx {
  const source: Fields = fields(value, where);
  return {
    style: choice(source, 'style', VFX_STYLES, where),
    color: text(source, 'color', where),
    cue: source['cue'] === undefined ? 'none' : choice(source, 'cue', VFX_CUES, where),
    light: source['light'] === undefined ? 1 : nonNegative(source, 'light', where),
    lightning: vfxLightning(source['lightning'], `${where}.lightning`),
    impact: vfxImpact(source['impact'], `${where}.impact`),
    trail: source['trail'] === undefined ? 0 : nonNegative(source, 'trail', where),
  };
}
