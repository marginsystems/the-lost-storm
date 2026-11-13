import type { RigActionClip, RigDef, RigGait, RigStanceClips } from './types.ts';

function actionClipNames(actions: Readonly<Record<string, RigActionClip>>): string[] {
  return Object.values(actions).map((entry: RigActionClip): string => entry.clip);
}

function stanceClipNames(stances: readonly RigStanceClips[]): string[] {
  return stances.flatMap((stance: RigStanceClips): string[] => [stance.idle, ...actionClipNames(stance.actions)]);
}

export function rigClipNames(rig: RigDef): string[] {
  const clips = rig.clips;
  const named: string[] = [clips.idle, clips.run, ...rig.gaits.map((gait: RigGait): string => gait.clip), ...clips.hit, ...clips.death, ...(clips.rise === null ? [] : [clips.rise]), ...actionClipNames(clips.actions), ...stanceClipNames(clips.unarmed === null ? [] : [clips.unarmed]), ...stanceClipNames(Object.values(clips.stances))];
  return [...new Set<string>(named)];
}

export function clipUrl(rig: RigDef, clip: string): string {
  return `${rig.clipFolder}/${clip}.glb`;
}
