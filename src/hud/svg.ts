export type SvgAttributes = Readonly<Record<string, string | number>>;

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, className: string, parent: Element | null, attributes: SvgAttributes): SVGElementTagNameMap[K] {
  const node: SVGElementTagNameMap[K] = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (className !== '') node.setAttribute('class', className);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (parent !== null) parent.appendChild(node);
  return node;
}
