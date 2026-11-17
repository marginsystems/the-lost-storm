import type { Fields } from './read.ts';
import { choice, colour, ContentError, each, fields, nonNegative, positive, share, text } from './read.ts';
import type { SkillVfx, VfxBurn, VfxCover, VfxFlare, VfxGather, VfxImpact, VfxLightning, VfxPunch, VfxRipple, VfxShadow, VfxWater, VfxWave } from './vfx-types.ts';
import { VFX_CUES, VFX_MAX_FORKS, VFX_STYLES } from './vfx-types.ts';

function vfxLightning(value: unknown, where: string): VfxLightning | null {
  if (value === undefined) return null;
  const source: Fields = fields(value, where);
  const forks: number = nonNegative(source, 'forks', where);
  if (!Number.isInteger(forks) || forks > VFX_MAX_FORKS) throw new ContentError(`${where}.forks`, `expected a whole number from 0 to ${VFX_MAX_FORKS}`);
  return {
    forks,
    glow: share(source, 'glow', where),
    afterglow: positive(source, 'afterglow', where),
    jitter: nonNegative(source, 'jitter', where),
    width: source['width'] === undefined ? 1 : positive(source, 'width', where),
    core: source['core'] === undefined ? 1 : nonNegative(source, 'core', where),
  };
}

function vfxImpact(value: unknown, where: string): VfxImpact | null {
  if (value === undefined) return null;
  const source: Fields = fields(value, where);
  const sparks: number = nonNegative(source, 'sparks', where);
  if (!Number.isInteger(sparks)) throw new ContentError(`${where}.sparks`, 'expected a whole number');
  return { sparks, flash: nonNegative(source, 'flash', where) };
}

export const GATHER_MIN_SAMPLES: number = 2;

function gatherCurve(value: unknown, where: string): readonly number[] {
  const samples: number[] = each(value, where, (entry: unknown, entryWhere: string): number => {
    if (typeof entry !== 'number' || entry < 0 || entry > 1) throw new ContentError(entryWhere, 'expected a number from 0 to 1');
    return entry;
  });
  if (samples.length < GATHER_MIN_SAMPLES) throw new ContentError(where, `expected at least ${GATHER_MIN_SAMPLES} samples`);
  return samples;
}

function vfxGather(value: unknown, where: string): VfxGather | null {
  if (value === undefined) return null;
  const source: Fields = fields(value, where);
  return {
    radius: positive(source, 'radius', where),
    lift: nonNegative(source, 'lift', where),
    size: gatherCurve(source['size'], `${where}.size`),
    glow: gatherCurve(source['glow'], `${where}.glow`),
    dust: nonNegative(source, 'dust', where),
    light: nonNegative(source, 'light', where),
  };
}

function vfxRipple(value: unknown, where: string): VfxRipple {
  const source: Fields = fields(value, where);
  return { delay: positive(source, 'delay', where), strength: share(source, 'strength', where) };
}

function vfxWave(value: unknown, where: string): VfxWave | null {
  if (value === undefined) return null;
  const source: Fields = fields(value, where);
  const ripples: VfxRipple[] = each(source['ripples'], `${where}.ripples`, vfxRipple);
  ripples.forEach((ripple: VfxRipple, index: number): void => {
    const before: VfxRipple | undefined = ripples[index - 1];
    if (before !== undefined && ripple.delay <= before.delay) throw new ContentError(`${where}.ripples[${index}].delay`, 'expected each after-wave to leave later than the one before');
  });
  const quiet: number = positive(source, 'quiet', where);
  const last: VfxRipple | undefined = ripples.at(-1);
  if (last !== undefined && quiet <= last.delay) throw new ContentError(`${where}.quiet`, 'expected the wave to go quiet after its last after-wave leaves');
  return {
    halfWidth: positive(source, 'halfWidth', where),
    depth: positive(source, 'depth', where),
    mist: nonNegative(source, 'mist', where),
    swell: gatherCurve(source['swell'], `${where}.swell`),
    ripples,
    quiet,
  };
}

function vfxPunch(value: unknown, where: string): VfxPunch | null {
  if (value === undefined) return null;
  const source: Fields = fields(value, where);
  const dust: number = nonNegative(source, 'dust', where);
  if (!Number.isInteger(dust)) throw new ContentError(`${where}.dust`, 'expected a whole number');
  return { dust, kick: positive(source, 'kick', where) };
}

function vfxFlare(value: unknown, where: string): VfxFlare {
  const source: Fields = fields(value, where);
  return { at: nonNegative(source, 'at', where), strength: share(source, 'strength', where) };
}

function vfxBurn(value: unknown, where: string): VfxBurn | null {
  if (value === undefined) return null;
  const source: Fields = fields(value, where);
  const flares: VfxFlare[] = each(source['flares'], `${where}.flares`, vfxFlare);
  flares.forEach((flare: VfxFlare, index: number): void => {
    const before: VfxFlare | undefined = flares[index - 1];
    if (before !== undefined && flare.at <= before.at) throw new ContentError(`${where}.flares[${index}].at`, 'expected each flare later than the one before');
  });
  return { flares, embers: nonNegative(source, 'embers', where), light: nonNegative(source, 'light', where) };
}

function vfxShadow(value: unknown, where: string): VfxShadow | null {
  if (value === undefined) return null;
  const source: Fields = fields(value, where);
  const strength: number = share(source, 'strength', where);
  if (strength <= 0) throw new ContentError(`${where}.strength`, 'expected a share above 0 and up to 1');
  return { color: colour(source, 'color', where), strength };
}

function vfxWater(value: unknown, where: string): VfxWater | null {
  if (value === undefined) return null;
  const source: Fields = fields(value, where);
  const depth: number = share(source, 'depth', where);
  if (depth <= 0) throw new ContentError(`${where}.depth`, 'expected a share above 0 and up to 1');
  return { deep: colour(source, 'deep', where), foam: colour(source, 'foam', where), depth };
}

function vfxCover(value: unknown, where: string): VfxCover | null {
  if (value === undefined) return null;
  const source: Fields = fields(value, where);
  const glow: number = share(source, 'glow', where);
  if (glow <= 0) throw new ContentError(`${where}.glow`, 'expected a share above 0 and up to 1');
  return { glow, wobble: share(source, 'wobble', where) };
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
    linger: source['linger'] === undefined ? 0 : nonNegative(source, 'linger', where),
    gather: vfxGather(source['gather'], `${where}.gather`),
    wave: vfxWave(source['wave'], `${where}.wave`),
    punch: vfxPunch(source['punch'], `${where}.punch`),
    burn: vfxBurn(source['burn'], `${where}.burn`),
    shadow: vfxShadow(source['shadow'], `${where}.shadow`),
    water: vfxWater(source['water'], `${where}.water`),
    cover: vfxCover(source['cover'], `${where}.cover`),
  };
}
