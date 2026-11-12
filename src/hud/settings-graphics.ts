import type { GraphicsPreset, Quality } from '../settings/settings.ts';
import { describePreset, QUALITIES } from '../settings/settings.ts';
import type { SettingsStore } from '../settings/store.ts';
import { el, label, setText } from './dom.ts';

const QUALITY_LABELS: Readonly<Record<Quality, string>> = { low: 'Low', medium: 'Medium', high: 'High' };

export function mountGraphics(page: HTMLElement, settings: SettingsStore): void {
  const quality: HTMLDivElement = el('div', 'set-row', page);
  label('set-name', 'Quality', quality);
  const segment: HTMLDivElement = el('div', 'set-seg', quality);
  segment.setAttribute('role', 'radiogroup');
  segment.style.setProperty('--count', String(QUALITIES.length));
  el('div', 'set-seg-thumb', segment);
  const buttons: Map<Quality, HTMLButtonElement> = new Map<Quality, HTMLButtonElement>();
  for (const level of QUALITIES) {
    const button: HTMLButtonElement = el('button', 'set-seg-btn', segment);
    button.type = 'button';
    button.textContent = QUALITY_LABELS[level];
    button.setAttribute('role', 'radio');
    button.addEventListener('click', (): void => settings.setQuality(level));
    buttons.set(level, button);
  }
  const detail: HTMLDivElement = label('set-detail', '', page);

  const fps: HTMLDivElement = el('div', 'set-row', page);
  label('set-name', 'Show FPS', fps);
  const toggle: HTMLButtonElement = el('button', 'set-switch', fps);
  toggle.type = 'button';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', 'Show FPS');
  el('span', 'set-switch-knob', toggle);
  toggle.addEventListener('click', (): void => settings.setShowFps(!settings.get().graphics.showFps));

  const render = (): void => {
    const current: Quality = settings.get().graphics.quality;
    segment.style.setProperty('--index', String(QUALITIES.indexOf(current)));
    for (const [level, button] of buttons) button.setAttribute('aria-checked', String(level === current));
    const preset: GraphicsPreset = settings.preset();
    setText(detail, describePreset(preset), true);
    toggle.setAttribute('aria-checked', String(settings.get().graphics.showFps));
  };
  settings.subscribe(render);
  render();
}
