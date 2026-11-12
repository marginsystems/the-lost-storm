export function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found: HTMLElement | null = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`Missing #${id}`);
  return found;
}
