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

export function createBanners(root: HTMLElement): Banners {
  const layer: HTMLDivElement = el('div', 'hud-banners', root);
  const queue: BannerRequest[] = [];
  let busy: boolean = false;

  const next = (): void => {
    const request: BannerRequest | undefined = queue.shift();
    if (request === undefined) {
      busy = false;
      return;
    }
    busy = true;
    const banner: HTMLDivElement = el('div', `banner ${request.tone}`, layer);
    label('banner-title', request.title, banner);
    if (request.subtitle !== null) label('banner-sub', request.subtitle, banner);
    banner.getBoundingClientRect();
    banner.classList.add('in');
    window.setTimeout((): void => {
      banner.classList.remove('in');
      banner.classList.add('out');
      window.setTimeout((): void => {
        banner.remove();
        window.setTimeout(next, BANNERS.gapMs);
      }, BANNERS.removeMs);
    }, bannerHoldMs(request.tone, queue.length));
  };

  return {
    show(title: string, subtitle: string | null, tone: BannerTone): void {
      queue.push({ title, subtitle, tone });
      if (!busy) next();
    },
  };
}
