import { el, setText } from './dom.ts';

const FPS = {
  window: 0.5,
} as const;

export interface FpsReadout {
  frame(now: number): void;
}

export function createFpsReadout(parent: HTMLElement): FpsReadout {
  const element: HTMLDivElement = el('div', 'hud-fps', parent);
  let last: number | null = null;
  let frames: number = 0;
  let elapsed: number = 0;
  return {
    frame(now: number): void {
      if (last !== null) {
        frames += 1;
        elapsed += (now - last) / 1000;
      }
      last = now;
      if (elapsed < FPS.window || frames === 0) return;
      setText(element, `${Math.round(frames / elapsed)} FPS · ${((elapsed / frames) * 1000).toFixed(1)} ms`, false);
      frames = 0;
      elapsed = 0;
    },
  };
}
