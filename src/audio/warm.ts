import type { AssetManifest } from './manifest.ts';

export function warmPaths(ids: readonly string[], manifest: AssetManifest): string[] {
  const seen: Set<string> = new Set<string>();
  const paths: string[] = [];
  for (const id of ids) {
    for (const path of manifest.sfx.get(id) ?? []) {
      if (seen.has(path)) continue;
      seen.add(path);
      paths.push(path);
    }
  }
  return paths;
}
