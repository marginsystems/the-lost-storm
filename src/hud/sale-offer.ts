export interface SaleOffer {
  uid(): number | null;
  set(uid: number | null): void;
  watch(listener: (uid: number | null) => void): void;
}

export function createSaleOffer(): SaleOffer {
  let current: number | null = null;
  const listeners: ((uid: number | null) => void)[] = [];
  return {
    uid(): number | null {
      return current;
    },
    set(uid: number | null): void {
      if (uid === current) return;
      current = uid;
      for (const listener of listeners) listener(uid);
    },
    watch(listener: (uid: number | null) => void): void {
      listeners.push(listener);
    },
  };
}
