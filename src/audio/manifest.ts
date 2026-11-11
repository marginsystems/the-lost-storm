export interface AssetManifest {
  readonly sfx: ReadonlyMap<string, readonly string[]>;
  readonly voice: ReadonlyMap<string, string>;
}

const RELATIVE_PATH: RegExp = /^[A-Za-z0-9_\-./]+$/;

export function readAssetBase(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed: string = raw.trim();
  if (trimmed === '') return null;
  try {
    const url: URL = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.search = '';
    url.hash = '';
    return url.href.endsWith('/') ? url.href : `${url.href}/`;
  } catch {
    return null;
  }
}

export function assetUrl(base: string, path: string): string | null {
  if (!RELATIVE_PATH.test(path) || path.startsWith('/') || path.split('/').includes('..')) return null;
  const url: string = new URL(path, base).href;
  return url.startsWith(base) ? url : null;
}

function fieldOf(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  return Object.entries(source).find(([name]: [string, unknown]): boolean => name === key)?.[1];
}

function entriesOf(source: unknown): [string, unknown][] | null {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return null;
  return Object.entries(source);
}

function pathsOf(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const list: readonly unknown[] = value;
  const paths: string[] = [];
  for (const entry of list) {
    if (typeof entry !== 'string') return null;
    paths.push(entry);
  }
  return paths.length > 0 ? paths : null;
}

export function parseManifest(value: unknown): AssetManifest | null {
  const sfxEntries: [string, unknown][] | null = entriesOf(fieldOf(value, 'sfx'));
  if (sfxEntries === null) return null;
  const sfx: Map<string, readonly string[]> = new Map<string, readonly string[]>();
  for (const [id, list] of sfxEntries) {
    const paths: string[] | null = pathsOf(list);
    if (paths !== null) sfx.set(id, paths);
  }
  const voice: Map<string, string> = new Map<string, string>();
  for (const [id, path] of entriesOf(fieldOf(value, 'voice')) ?? []) {
    if (typeof path === 'string') voice.set(id, path);
  }
  return { sfx, voice };
}
