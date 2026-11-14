import type { KeyValueStore } from '../backend/backend.ts';

export const MUTE_KEY: string = 'the-lost-storm.muted.v1';

const MUTE_LIMITS: { readonly names: number; readonly nameChars: number } = { names: 500, nameChars: 64 };

export interface Mutes {
  has(name: string): boolean;
  toggle(name: string): boolean;
  list(): readonly string[];
}

function keyOf(name: string): string {
  return name.trim().toLowerCase();
}

export function readMuted(text: string | null): Set<string> {
  if (text === null) return new Set<string>();
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return new Set<string>();
    const list: readonly unknown[] = parsed;
    return new Set<string>(list.flatMap((entry: unknown): string[] => (typeof entry === 'string' && entry !== '' && entry.length <= MUTE_LIMITS.nameChars ? [keyOf(entry)] : [])).slice(-MUTE_LIMITS.names));
  } catch {
    return new Set<string>();
  }
}

export function createMutes(store: KeyValueStore): Mutes {
  const muted: Set<string> = readMuted(store.read(MUTE_KEY));
  return {
    has: (name: string): boolean => muted.has(keyOf(name)),
    toggle(name: string): boolean {
      const key: string = keyOf(name);
      const now: boolean = !muted.has(key);
      if (now) muted.add(key);
      else muted.delete(key);
      store.write(MUTE_KEY, JSON.stringify([...muted].slice(-MUTE_LIMITS.names)));
      return now;
    },
    list: (): readonly string[] => [...muted],
  };
}
