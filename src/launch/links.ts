import { isFields } from '../../sim/content/read.ts';

export type LinkId = 'discord' | 'github' | 'x';

export interface Links {
  readonly site: string;
  readonly play: string;
  readonly github: string;
  readonly discord: string | null;
  readonly x: string | null;
}

export interface OutboundLink {
  readonly id: LinkId;
  readonly label: string;
  readonly href: string;
}

const LABELS: Readonly<Record<LinkId, string>> = { discord: 'Discord', github: 'GitHub', x: 'X' };
const ORDER: readonly LinkId[] = ['discord', 'github', 'x'];

function httpsUrl(value: unknown, key: string): string {
  if (typeof value !== 'string') throw new Error(`links.${key} must be a string`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`links.${key} is not a URL`);
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') throw new Error(`links.${key} must be an https URL`);
  return value;
}

function optionalUrl(value: unknown, key: string): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null;
  return httpsUrl(value, key);
}

export function readLinks(value: unknown): Links {
  if (!isFields(value)) throw new Error('links must be an object');
  return {
    site: httpsUrl(value['site'], 'site'),
    play: httpsUrl(value['play'], 'play'),
    github: httpsUrl(value['github'], 'github'),
    discord: optionalUrl(value['discord'], 'discord'),
    x: optionalUrl(value['x'], 'x'),
  };
}

export function hrefOf(links: Links, id: LinkId): string | null {
  const hrefs: Readonly<Record<LinkId, string | null>> = { discord: links.discord, github: links.github, x: links.x };
  return hrefs[id];
}

export function outboundLinks(links: Links): readonly OutboundLink[] {
  return ORDER.flatMap((id: LinkId): OutboundLink[] => {
    const href: string | null = hrefOf(links, id);
    return href === null ? [] : [{ id, label: LABELS[id], href }];
  });
}

function isLinkId(value: string): value is LinkId {
  return ORDER.some((id: LinkId): boolean => id === value);
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const LINKED_ELEMENT: RegExp = /<a\b([^>]*?)\sdata-link="([a-z]+)"([^>]*)>([\s\S]*?)<\/a>/g;
const SITE_TOKEN: string = '%LINK_SITE%';

export function applyLinks(html: string, links: Links): string {
  const linked: string = html.replace(LINKED_ELEMENT, (_match: string, before: string, id: string, after: string, inner: string): string => {
    if (!isLinkId(id)) throw new Error(`unknown data-link "${id}"`);
    const href: string | null = hrefOf(links, id);
    if (href === null) return '';
    return `<a${before} href="${escapeAttribute(href)}" target="_blank" rel="noopener"${after}>${inner}</a>`;
  });
  return linked.replaceAll(SITE_TOKEN, escapeAttribute(links.site));
}
