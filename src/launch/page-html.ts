import { applyLinks } from './links.ts';
import type { Links } from './links.ts';

const SERVER_ONLY: RegExp = /<(span|button|p)\b([^>]*?)\sdata-server\b([^>]*)>([\s\S]*?)<\/\1>/g;

export function applyServer(html: string, hasServer: boolean): string {
  return html.replace(SERVER_ONLY, (_match: string, tag: string, before: string, after: string, inner: string): string => (hasServer ? `<${tag}${before}${after}>${inner}</${tag}>` : ''));
}

const DESK_KEYS: RegExp = /(<dl\b[^>]*\bclass="[^"]*\btitle-keys-desk\b[^"]*"[^>]*>)[\s\S]*?(<\/dl>)/;

export function applyKeys(html: string, keys: string): string {
  return html.replace(DESK_KEYS, (_match: string, open: string, close: string): string => `${open}${keys}${close}`);
}

export function buildPage(html: string, links: Links, hasServer: boolean, keys: string): string {
  return applyKeys(applyLinks(applyServer(html, hasServer), links), keys);
}
