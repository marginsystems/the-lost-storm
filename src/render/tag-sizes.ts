export interface TagSize {
  readonly width: number;
  readonly height: number;
}

export interface TagSizes<T extends object> {
  size(tag: T): TagSize;
}

export interface TagMeasure<T extends object> {
  measure(tag: T): TagSize;
  watch(tag: T, changed: () => void): void;
}

export function createTagSizes<T extends object>(how: TagMeasure<T>): TagSizes<T> {
  const known: WeakMap<T, TagSize> = new WeakMap<T, TagSize>();
  const stale: WeakSet<T> = new WeakSet<T>();
  return {
    size(tag: T): TagSize {
      const cached: TagSize | undefined = known.get(tag);
      if (cached !== undefined && !stale.has(tag)) return cached;
      const measured: TagSize = how.measure(tag);
      known.set(tag, measured);
      stale.delete(tag);
      if (cached === undefined) how.watch(tag, (): void => {
        stale.add(tag);
      });
      return measured;
    },
  };
}

export type BoxRead = (tag: HTMLElement) => TagSize;

export function borderBox(tag: HTMLElement): TagSize {
  return { width: tag.offsetWidth, height: tag.offsetHeight };
}

export function clientBox(tag: HTMLElement): TagSize {
  return { width: tag.clientWidth, height: tag.clientHeight };
}

export function browserTagMeasure(read: BoxRead = borderBox): TagMeasure<HTMLElement> {
  const listeners: WeakMap<Element, () => void> = new WeakMap<Element, () => void>();
  const observer: ResizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]): void => {
    for (const entry of entries) listeners.get(entry.target)?.();
  });
  return {
    measure(tag: HTMLElement): TagSize {
      return read(tag);
    },
    watch(tag: HTMLElement, changed: () => void): void {
      listeners.set(tag, changed);
      observer.observe(tag, { box: 'border-box' });
    },
  };
}
