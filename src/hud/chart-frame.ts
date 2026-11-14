import { toScreen } from './atlas-view.ts';
import type { AtlasFrame, AtlasView, ScreenPoint } from './atlas-view.ts';
import { pinLabel, spreadLabels } from './chart-view.ts';
import type { LabelBox, PinnedLabel } from './chart-view.ts';

export interface FrameLabel {
  readonly at: ScreenPoint;
  readonly halfWidth: number;
  readonly halfHeight: number;
  place(transform: string, pinned: boolean): void;
}

export interface FrameTargets {
  readonly labels: readonly FrameLabel[];
  moveBoard(transform: string): void;
  zoomHere(scale: number): void;
}

export function boardTransform(view: AtlasView, frame: AtlasFrame): string {
  const corner: ScreenPoint = toScreen(view, frame, { x: 0, y: 0 });
  return `translate(${corner.x}px, ${corner.y}px) scale(${view.scale})`;
}

export function labelTransform(box: LabelBox): string {
  return `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px) translate(-50%, -50%)`;
}

export function writeView(targets: FrameTargets, view: AtlasView, frame: AtlasFrame, foot: number): void {
  targets.moveBoard(boardTransform(view, frame));
  targets.zoomHere(view.scale);
  const pins: readonly PinnedLabel[] = targets.labels.map((label: FrameLabel): PinnedLabel => pinLabel(toScreen(view, frame, label.at), label.halfWidth, label.halfHeight, frame, foot));
  const boxes: readonly LabelBox[] = spreadLabels(
    pins.map((pin: PinnedLabel, index: number): LabelBox => ({ x: pin.x, y: pin.y, halfWidth: targets.labels[index]?.halfWidth ?? 0, halfHeight: targets.labels[index]?.halfHeight ?? 0 })),
    frame,
  );
  targets.labels.forEach((label: FrameLabel, index: number): void => {
    const box: LabelBox | undefined = boxes[index];
    if (box === undefined) return;
    label.place(labelTransform(box), pins[index]?.pinned ?? false);
  });
}
