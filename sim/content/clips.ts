import type { RigDef } from './types.ts';

export function rigClipNames(rig: RigDef): string[] {
  const clips = rig.clips;
  const named: string[] = [clips.idle, clips.run, ...clips.hit, ...clips.death, ...(clips.rise === null ? [] : [clips.rise]), ...Object.values(clips.actions).map((entry: { readonly clip: string }): string => entry.clip)];
  return [...new Set<string>(named)];
}

export function clipUrl(rig: RigDef, clip: string): string {
  return `${rig.clipFolder}/${clip}.glb`;
}
