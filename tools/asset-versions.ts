import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const ASSET_VERSIONS = {
  algorithm: 'sha256',
  digestLength: 10,
  folders: ['models', 'textures'],
  global: 'LOST_STORM_ASSET_VERSIONS',
} as const;

export interface AssetFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export type AssetVersionMap = Readonly<Record<string, string>>;

export function versionOf(bytes: Uint8Array): string {
  return createHash(ASSET_VERSIONS.algorithm).update(bytes).digest('hex').slice(0, ASSET_VERSIONS.digestLength);
}

function byPath(a: AssetFile, b: AssetFile): number {
  if (a.path === b.path) return 0;
  return a.path < b.path ? -1 : 1;
}

export function versionMap(files: readonly AssetFile[]): AssetVersionMap {
  return Object.fromEntries(files.toSorted(byPath).map((file: AssetFile): [string, string] => [file.path, versionOf(file.bytes)]));
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir)
    .toSorted()
    .flatMap((name: string): string[] => {
      const path: string = join(dir, name);
      return statSync(path).isDirectory() ? filesUnder(path) : [path];
    });
}

export function readAssetFiles(publicDir: string, folders: readonly string[]): AssetFile[] {
  return folders.flatMap((folder: string): AssetFile[] => {
    const root: string = join(publicDir, folder);
    let found: string[];
    try {
      found = filesUnder(root);
    } catch {
      return [];
    }
    return found.map((path: string): AssetFile => ({ path: relative(publicDir, path).split(sep).join('/'), bytes: readFileSync(path) }));
  });
}

export function assetVersionDefine(publicDir: string, building: boolean): Record<string, string> {
  const versions: AssetVersionMap = building ? versionMap(readAssetFiles(publicDir, ASSET_VERSIONS.folders)) : {};
  return { [ASSET_VERSIONS.global]: JSON.stringify(versions) };
}
