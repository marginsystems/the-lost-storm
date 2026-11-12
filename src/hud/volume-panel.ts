import type { AudioCategory, AudioControls, AudioSettings } from '../audio/settings.ts';
import { AUDIO_CATEGORIES } from '../audio/settings.ts';
import { el, label, setText } from './dom.ts';

const VOLUME = {
  step: 0.01,
  percent: 100,
  svgNamespace: 'http://www.w3.org/2000/svg',
} as const;

const LABELS: Readonly<Record<AudioCategory, string>> = {
  master: 'Master',
  effects: 'Effects',
  voice: 'Voice',
  ambience: 'Ambience',
};

const SPEAKER: string =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><g class="volume-waves"><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></g><path class="volume-cross" d="M15 9.5l5 5M20 9.5l-5 5"/></svg>';

interface SliderView {
  readonly category: AudioCategory;
  readonly input: HTMLInputElement;
  readonly fill: HTMLElement;
  readonly value: HTMLElement;
}

function sliderRow(parent: HTMLElement, category: AudioCategory, controls: AudioControls): SliderView {
  const row: HTMLDivElement = el('div', 'volume-row', parent);
  label('volume-label', LABELS[category], row);
  const slider: HTMLDivElement = el('div', 'volume-slider', row);
  el('div', 'volume-track', slider);
  const fill: HTMLDivElement = el('div', 'volume-fill', slider);
  const input: HTMLInputElement = el('input', 'volume-input', slider);
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = String(VOLUME.step);
  input.setAttribute('aria-label', `${LABELS[category]} volume`);
  const value: HTMLDivElement = label('volume-value', '', row);
  input.addEventListener('input', (): void => {
    controls.setVolume(category, input.valueAsNumber);
  });
  return { category, input, fill, value };
}

export function mountVolumeSliders(parent: HTMLElement, controls: AudioControls): void {
  const head: HTMLDivElement = el('div', 'volume-head', parent);
  label('volume-mute-label', 'Mute all sound', head);
  const mute: HTMLButtonElement = el('button', 'set-switch', head);
  mute.type = 'button';
  mute.setAttribute('role', 'switch');
  mute.setAttribute('aria-label', 'Mute all sound');
  el('span', 'set-switch-knob', mute);
  const sliders: SliderView[] = AUDIO_CATEGORIES.map((category: AudioCategory): SliderView => sliderRow(parent, category, controls));

  const render = (settings: AudioSettings): void => {
    for (const slider of sliders) {
      const level: number = settings.volumes[slider.category];
      if (slider.input.valueAsNumber !== level) slider.input.value = String(level);
      slider.fill.style.setProperty('--level', String(level));
      setText(slider.value, String(Math.round(level * VOLUME.percent)), true);
    }
    parent.classList.toggle('muted', settings.muted);
    mute.setAttribute('aria-checked', String(settings.muted));
  };
  controls.subscribe(render);
  render(controls.get());
  mute.addEventListener('click', (): void => controls.setMuted(!controls.get().muted));
}

export function createVolumeButton(parent: HTMLElement, controls: AudioControls, track: (element: HTMLElement) => void, onClick: () => void): void {
  const element: HTMLDivElement = el('div', 'hud-volume-wrap', parent);
  const button: HTMLButtonElement = el('button', 'hud-menu-btn hud-volume-btn', element);
  button.type = 'button';
  button.setAttribute('aria-label', 'Sound settings');
  button.innerHTML = SPEAKER;
  track(button);
  controls.subscribe((settings: AudioSettings): void => {
    button.classList.toggle('muted', settings.muted);
  });
  button.classList.toggle('muted', controls.get().muted);
  button.addEventListener('click', onClick);
}
