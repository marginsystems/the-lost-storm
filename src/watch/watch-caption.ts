import captionCss from './watch-caption.css?inline';

export const WATCH_CAPTION = {
  shownClass: 'on',
  leavingClass: 'out',
} as const;

export interface WatchCaption {
  show(text: string): void;
}

export function createWatchCaption(parent: HTMLElement): WatchCaption {
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = captionCss;
  document.head.append(style);
  const box: HTMLDivElement = document.createElement('div');
  box.className = 'watch-caption';
  box.setAttribute('role', 'status');
  const line: HTMLSpanElement = document.createElement('span');
  line.className = 'watch-caption-text';
  box.append(line);
  parent.append(box);
  let wanted: string = '';
  let leaving: boolean = false;
  line.addEventListener('transitionend', (event: TransitionEvent): void => {
    if (event.propertyName !== 'opacity' || !leaving) return;
    leaving = false;
    line.textContent = wanted;
    line.classList.remove(WATCH_CAPTION.leavingClass);
  });
  return {
    show: (text: string): void => {
      if (text === wanted) return;
      wanted = text;
      if (line.textContent === '') {
        line.textContent = text;
        window.requestAnimationFrame((): void => {
          box.classList.add(WATCH_CAPTION.shownClass);
        });
        return;
      }
      leaving = true;
      line.classList.add(WATCH_CAPTION.leavingClass);
    },
  };
}
