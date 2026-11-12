import type { Command, World } from '../../sim/world/types.ts';

export const OVERLAY_MARK = {
  attribute: 'data-overlay-open',
  event: 'overlay-change',
} as const;

export interface Markable {
  toggleAttribute(name: string, force: boolean): boolean;
  dispatchEvent(event: Event): boolean;
}

export interface OverlayScope {
  querySelector(selectors: string): unknown;
  addEventListener(type: string, listener: () => void): void;
}

export interface OverlayWatch {
  update(world: World, simDt: number): void;
}

export function markOverlay(element: Markable, open: boolean): void {
  element.toggleAttribute(OVERLAY_MARK.attribute, open);
  element.dispatchEvent(new Event(OVERLAY_MARK.event, { bubbles: true }));
}

export function overlayShown(scope: OverlayScope): boolean {
  return scope.querySelector(`[${OVERLAY_MARK.attribute}]`) !== null;
}

export function createOverlayWatch(scope: OverlayScope, send: (command: Command) => void): OverlayWatch {
  let sent: boolean = false;
  const tell = (shown: boolean): void => {
    send({ type: 'overlay', open: shown });
    sent = shown;
  };
  scope.addEventListener(OVERLAY_MARK.event, (): void => {
    const shown: boolean = overlayShown(scope);
    if (shown !== sent) tell(shown);
  });
  return {
    update(world: World, simDt: number): void {
      const shown: boolean = overlayShown(scope);
      if (shown === world.glitch.overlay) {
        sent = shown;
        return;
      }
      if (shown !== sent || simDt > 0) tell(shown);
    },
  };
}
