export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement | null): HTMLElementTagNameMap[K] {
  const node: HTMLElementTagNameMap[K] = document.createElement(tag);
  if (className !== '') node.className = className;
  if (parent !== null) parent.appendChild(node);
  return node;
}

export function retrigger(node: HTMLElement, className: string): void {
  node.classList.remove(className);
  node.getBoundingClientRect();
  node.classList.add(className);
}

export function label(className: string, content: string, parent: HTMLElement | null): HTMLDivElement {
  const node: HTMLDivElement = el('div', className, parent);
  node.textContent = content;
  return node;
}

export function setText(node: HTMLElement, value: string, animate: boolean): boolean {
  if (node.textContent === value) return false;
  node.textContent = value;
  if (animate) retrigger(node, 'tick');
  return true;
}

export function pulseClass(node: HTMLElement, className: string, ms: number): void {
  node.classList.add(className);
  window.setTimeout((): void => {
    node.classList.remove(className);
  }, ms);
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function approach(current: number, target: number, dt: number, rate: number): number {
  const next: number = current + (target - current) * (1 - Math.exp(-rate * dt));
  return Math.abs(target - next) < 0.5 ? target : next;
}
