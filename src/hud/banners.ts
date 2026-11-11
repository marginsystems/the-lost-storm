import { el, label } from './dom.ts';

const BANNERS = {
  holdMs: 1700,
  removeMs: 900,
} as const;

export type BannerTone = 'surge' | 'level' | 'zone' | 'checkpoint' | 'quest';

export interface Banners {
  show(title: string, subtitle: string | null, tone: BannerTone): void;
}

export function createBanners(root: HTMLElement): Banners {
  const layer: HTMLDivElement = el('div', 'hud-banners', root);
  return {
    show(title: string, subtitle: string | null, tone: BannerTone): void {
      const banner: HTMLDivElement = el('div', `banner ${tone}`, layer);
      label('banner-title', title, banner);
      if (subtitle !== null) label('banner-sub', subtitle, banner);
      banner.getBoundingClientRect();
      banner.classList.add('in');
      window.setTimeout((): void => {
        banner.classList.remove('in');
        banner.classList.add('out');
        window.setTimeout((): void => {
          banner.remove();
        }, BANNERS.removeMs);
      }, BANNERS.holdMs);
    },
  };
}
