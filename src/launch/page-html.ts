import { applyLinks } from './links.ts';
import type { Links } from './links.ts';

const SERVER_ONLY: RegExp = /<(span|button|p)\b([^>]*?)\sdata-server\b([^>]*)>([\s\S]*?)<\/\1>/g;

export function applyServer(html: string, hasServer: boolean): string {
  return html.replace(SERVER_ONLY, (_match: string, tag: string, before: string, after: string, inner: string): string => (hasServer ? `<${tag}${before}${after}>${inner}</${tag}>` : ''));
}

export function buildPage(html: string, links: Links, hasServer: boolean): string {
  return applyLinks(applyServer(html, hasServer), links);
}
