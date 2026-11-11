import { el } from './dom.ts';
import { iconSvg } from './icons.ts';

export function setPicture(target: HTMLElement, image: string | null, icon: string): void {
  if (image === null) {
    target.innerHTML = iconSvg(icon);
    return;
  }
  const picture: HTMLImageElement = el('img', 'item-picture tick', null);
  picture.src = image;
  picture.alt = '';
  picture.draggable = false;
  picture.decoding = 'sync';
  target.replaceChildren(picture);
}
