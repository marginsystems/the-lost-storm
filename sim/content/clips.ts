import type { RigActionClip, RigDef, RigGait } from './types.ts';

function actionClipNames(actions: Readonly<Record<string, RigActionClip>>): string[] {
  return Object.values(actions).map((entry: RigActionClip): string => entry.clip);
}

export function rigClipNames(rig: RigDef): string[] {
  const clips = rig.clips;
  const named: string[] = [clips.idle, clips.run, ...rig.gaits.map((gait: RigGait): string => gait.clip), ...clips.hit, clips.stagger, ...clips.death, ...(clips.rise === null ? [] : [clips.rise]), ...actionClipNames(clips.actions), ...(clips.unarmed === null ? [] : [clips.unarmed.idle, ...actionClipNames(clips.unarmed.actions)])];
  return [...new Set<string>(named)];
}

export function clipUrl(rig: RigDef, clip: string): string {
  return `${rig.clipFolder}/${clip}.glb`;
}
