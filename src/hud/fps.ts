import { el, setText } from './dom.ts';

const FPS = {
  window: 0.5,
  maxGap: 0.25,
} as const;

export interface FpsReadout {
  frame(now: number): void;
  setVisible(visible: boolean): void;
}

export function createFpsReadout(parent: HTMLElement): FpsReadout {
  const element: HTMLDivElement = el('div', 'hud-fps', parent);
  let last: number | null = null;
  let frames: number = 0;
  let elapsed: number = 0;
  return {
    setVisible(visible: boolean): void {
      element.classList.toggle('shown', visible);
    },
    frame(now: number): void {
      const gap: number = last === null ? Infinity : (now - last) / 1000;
      last = now;
      if (gap > FPS.maxGap) return;
      frames += 1;
      elapsed += gap;
      if (elapsed < FPS.window || frames === 0) return;
      setText(element, `${Math.round(frames / elapsed)} FPS · ${((elapsed / frames) * 1000).toFixed(1)} ms`, false);
      frames = 0;
      elapsed = 0;
    },
  };
}
