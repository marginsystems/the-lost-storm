import { el, label } from './dom.ts';

const BANNERS = {
  holdMs: 1700,
  queuedHoldMs: 1300,
  actHoldMs: 5200,
  removeMs: 900,
  gapMs: 160,
} as const;

export type BannerTone = 'surge' | 'level' | 'zone' | 'checkpoint' | 'quest' | 'act';

export interface Banners {
  show(title: string, subtitle: string | null, tone: BannerTone): void;
}

export interface BannerRequest {
  readonly title: string;
  readonly subtitle: string | null;
  readonly tone: BannerTone;
}

export function bannerHoldMs(tone: BannerTone, waiting: number): number {
  if (tone === 'act') return BANNERS.actHoldMs;
  return waiting > 0 ? BANNERS.queuedHoldMs : BANNERS.holdMs;
}

function sameBanner(a: BannerRequest, b: BannerRequest): boolean {
  return a.title === b.title && a.subtitle === b.subtitle && a.tone === b.tone;
}

export function admits(showing: BannerRequest | null, queue: readonly BannerRequest[], request: BannerRequest): boolean {
  if (showing !== null && sameBanner(showing, request)) return false;
  return !queue.some((waiting: BannerRequest): boolean => sameBanner(waiting, request));
}

export function createBanners(root: HTMLElement): Banners {
  const layer: HTMLDivElement = el('div', 'hud-banners', root);
  const queue: BannerRequest[] = [];
  let busy: boolean = false;
  let showing: BannerRequest | null = null;

  const next = (): void => {
    const request: BannerRequest | undefined = queue.shift();
    if (request === undefined) {
      busy = false;
      showing = null;
      return;
    }
    busy = true;
    showing = request;
    const banner: HTMLDivElement = el('div', `banner ${request.tone}`, layer);
    label('banner-title', request.title, banner);
    if (request.subtitle !== null) label('banner-sub', request.subtitle, banner);
    banner.getBoundingClientRect();
    banner.classList.add('in');
    window.setTimeout((): void => {
      banner.classList.remove('in');
      banner.classList.add('out');
      showing = null;
      window.setTimeout((): void => {
        banner.remove();
      }, BANNERS.removeMs);
      window.setTimeout(next, BANNERS.gapMs);
    }, bannerHoldMs(request.tone, queue.length));
  };

  return {
    show(title: string, subtitle: string | null, tone: BannerTone): void {
      const request: BannerRequest = { title, subtitle, tone };
      if (!admits(showing, queue, request)) return;
      queue.push(request);
      if (!busy) next();
    },
  };
}
