import { el, label } from './dom.ts';

const BANNERS = {
  holdMs: 1700,
  queuedHoldMs: 1100,
  actHoldMs: 5200,
  removeMs: 900,
} as const;

export type BannerTone = 'surge' | 'level' | 'zone' | 'checkpoint' | 'quest' | 'act';

export interface Banners {
  show(title: string, subtitle: string | null, tone: BannerTone): void;
}

interface BannerRequest {
  readonly title: string;
  readonly subtitle: string | null;
  readonly tone: BannerTone;
}

export function holdFor(tone: BannerTone, waiting: number): number {
  if (tone === 'act') return BANNERS.actHoldMs;
  return waiting > 0 ? BANNERS.queuedHoldMs : BANNERS.holdMs;
}

export function sameBanner(a: BannerRequest, b: BannerRequest): boolean {
  return a.title === b.title && a.subtitle === b.subtitle && a.tone === b.tone;
}

function leave(banner: HTMLDivElement): void {
  banner.classList.remove('in');
  banner.classList.add('out');
  window.setTimeout((): void => {
    banner.remove();
  }, BANNERS.removeMs);
}

export function createBanners(root: HTMLElement): Banners {
  const layer: HTMLDivElement = el('div', 'hud-banners', root);
  const waiting: BannerRequest[] = [];
  let current: BannerRequest | null = null;

  const present = (request: BannerRequest): void => {
    current = request;
    const banner: HTMLDivElement = el('div', `banner ${request.tone}`, layer);
    label('banner-title', request.title, banner);
    if (request.subtitle !== null) label('banner-sub', request.subtitle, banner);
    banner.getBoundingClientRect();
    banner.classList.add('in');
    const finish = (): void => {
      leave(banner);
      current = null;
      const next: BannerRequest | undefined = waiting.shift();
      if (next !== undefined) present(next);
    };
    window.setTimeout(finish, holdFor(request.tone, waiting.length));
  };

  return {
    show(title: string, subtitle: string | null, tone: BannerTone): void {
      const request: BannerRequest = { title, subtitle, tone };
      if (current !== null && sameBanner(current, request)) return;
      if (waiting.some((queued: BannerRequest): boolean => sameBanner(queued, request))) return;
      if (current === null) present(request);
      else waiting.push(request);
    },
  };
}
