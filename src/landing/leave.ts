export const LEAVE = {
  linkSelector: 'a.play',
  leavingClass: 'leaving',
  durationToken: '--spring-snappy-ms',
  fallbackMs: 260,
  restoreMs: 4000,
} as const;

export interface LeaveClick {
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
}

export function fadesOut(click: LeaveClick): boolean {
  if (click.defaultPrevented || click.button !== 0) return false;
  return !click.metaKey && !click.ctrlKey && !click.shiftKey && !click.altKey;
}

export function leaveMs(token: string): number {
  const parsed: number = Number.parseFloat(token);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : LEAVE.fallbackMs;
}

export function wireLeave(): void {
  document.addEventListener('click', (event: MouseEvent): void => {
    const target: EventTarget | null = event.target;
    const link: Element | null = target instanceof Element ? target.closest(LEAVE.linkSelector) : null;
    if (!(link instanceof HTMLAnchorElement) || !fadesOut(event)) return;
    event.preventDefault();
    document.body.classList.add(LEAVE.leavingClass);
    const ms: number = leaveMs(getComputedStyle(document.documentElement).getPropertyValue(LEAVE.durationToken));
    window.setTimeout((): void => {
      window.location.assign(link.href);
      window.setTimeout((): void => {
        document.body.classList.remove(LEAVE.leavingClass);
      }, LEAVE.restoreMs);
    }, ms);
  });
  window.addEventListener('pageshow', (event: PageTransitionEvent): void => {
    if (event.persisted) document.body.classList.remove(LEAVE.leavingClass);
  });
}
