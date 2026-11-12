export const LEAVE = {
  linkSelector: 'a.play',
  leavingClass: 'leaving',
  durationToken: '--spring-snappy-ms',
  fallbackMs: 260,
  abandonKey: 'Escape',
  abandonEvent: 'navigateerror',
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
  let pending: number | null = null;
  document.addEventListener('click', (event: MouseEvent): void => {
    const target: EventTarget | null = event.target;
    const link: Element | null = target instanceof Element ? target.closest(LEAVE.linkSelector) : null;
    if (!(link instanceof HTMLAnchorElement) || !fadesOut(event)) return;
    event.preventDefault();
    document.body.classList.add(LEAVE.leavingClass);
    const ms: number = leaveMs(getComputedStyle(document.documentElement).getPropertyValue(LEAVE.durationToken));
    if (pending !== null) window.clearTimeout(pending);
    pending = window.setTimeout((): void => {
      pending = null;
      window.location.assign(link.href);
    }, ms);
  });
  const restore = (): void => {
    if (pending !== null) window.clearTimeout(pending);
    pending = null;
    document.body.classList.remove(LEAVE.leavingClass);
  };
  window.addEventListener('pageshow', (event: PageTransitionEvent): void => {
    if (event.persisted) restore();
  });
  window.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.key === LEAVE.abandonKey) restore();
  });
  const navigation: unknown = Reflect.get(window, 'navigation');
  if (navigation instanceof EventTarget) navigation.addEventListener(LEAVE.abandonEvent, restore);
}
