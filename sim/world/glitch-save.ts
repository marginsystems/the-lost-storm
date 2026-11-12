import { isFields } from '../content/read.ts';
import type { GlitchSave } from './glitch-types.ts';

export function readGlitchSave(value: unknown): GlitchSave {
  if (!isFields(value)) return { progress: 0, fired: [] };
  const progress: unknown = value['progress'];
  const fired: unknown = value['fired'];
  const list: readonly unknown[] = Array.isArray(fired) ? fired : [];
  return {
    progress: typeof progress === 'number' && Number.isFinite(progress) && progress >= 0 ? progress : 0,
    fired: list.filter((id: unknown): id is string => typeof id === 'string'),
  };
}
