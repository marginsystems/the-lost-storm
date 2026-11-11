export interface BufferCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  readonly size: number;
  readonly bytes: number;
}

export function createBufferCache<T>(budgetBytes: number, sizeOf: (value: T) => number): BufferCache<T> {
  const entries: Map<string, T> = new Map<string, T>();
  let bytes: number = 0;
  const evict = (): void => {
    for (const key of entries.keys()) {
      if (bytes <= budgetBytes || entries.size <= 1) return;
      const value: T | undefined = entries.get(key);
      if (value !== undefined) bytes -= sizeOf(value);
      entries.delete(key);
    }
  };
  return {
    get(key: string): T | undefined {
      const value: T | undefined = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key: string, value: T): void {
      const old: T | undefined = entries.get(key);
      if (old !== undefined) bytes -= sizeOf(old);
      entries.delete(key);
      entries.set(key, value);
      bytes += sizeOf(value);
      evict();
    },
    has(key: string): boolean {
      return entries.has(key);
    },
    get size(): number {
      return entries.size;
    },
    get bytes(): number {
      return bytes;
    },
  };
}
