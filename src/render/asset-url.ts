export type AssetVersions = ReadonlyMap<string, string>;

export const ASSET_URL = {
  query: 'v',
  version: /^[0-9a-f]+$/,
} as const;

export function readAssetVersions(raw: unknown): AssetVersions {
  const versions: Map<string, string> = new Map<string, string>();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return versions;
  for (const [path, version] of Object.entries(raw)) {
    if (typeof version === 'string' && ASSET_URL.version.test(version)) versions.set(path, version);
  }
  return versions;
}

function logicalPath(path: string): string {
  return path.replace(/^\.?\/+/, '');
}

export function versionedUrl(base: string, path: string, versions: AssetVersions): string {
  const url: string = `${base}${path}`;
  const version: string | undefined = versions.get(logicalPath(path));
  if (version === undefined) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${ASSET_URL.query}=${version}`;
}

let built: AssetVersions | null = null;

function builtVersions(): AssetVersions {
  built ??= readAssetVersions(typeof LOST_STORM_ASSET_VERSIONS === 'undefined' ? null : LOST_STORM_ASSET_VERSIONS);
  return built;
}

export function assetUrl(path: string): string {
  return versionedUrl(import.meta.env.BASE_URL, path, builtVersions());
}
