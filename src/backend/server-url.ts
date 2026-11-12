export type ServerUrl =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'ok'; readonly url: string };

export function readServerUrl(raw: string | undefined): ServerUrl {
  const text: string = raw?.trim() ?? '';
  if (text === '') return { kind: 'none' };
  try {
    const url: URL = new URL(text);
    const secure: boolean = url.protocol === 'https:' || url.protocol === 'http:';
    if (!secure || url.username !== '' || url.password !== '') return { kind: 'invalid' };
    return { kind: 'ok', url: `${url.origin}${url.pathname.replace(/\/+$/, '')}` };
  } catch {
    return { kind: 'invalid' };
  }
}
