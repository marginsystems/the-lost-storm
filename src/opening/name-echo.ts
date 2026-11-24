import type { GroundItem, World } from '../../sim/world/types.ts';
import type { SpokenName } from '../backend/name-voice.ts';
import echoCss from './name-echo.css?inline';

export const NAME_ECHO = {
  afterRise: 0.35,
  voiceWait: 2.5,
  layers: 3,
  layerDelayMs: 400,
  letterDelayMs: 55,
  lifeMs: 6200,
} as const;

export interface NameEchoDeps {
  readonly root: HTMLElement;
  fetchVoice(): Promise<SpokenName | null>;
  play(audio: ArrayBuffer): Promise<void>;
  nameOf(): string | null;
  refreshName(): Promise<void>;
}

export interface NameEcho {
  update(world: World): void;
  spokenName(): string | null;
  forget(): void;
}

type Moment = 'risen' | 'near';

function showLetters(root: HTMLElement, name: string): void {
  const echo: HTMLDivElement = document.createElement('div');
  echo.className = 'name-echo';
  echo.setAttribute('aria-live', 'polite');
  for (let layer: number = 0; layer < NAME_ECHO.layers; layer += 1) {
    const line: HTMLDivElement = document.createElement('div');
    line.className = 'name-echo-line';
    line.style.setProperty('--layer', `${layer}`);
    line.style.animationDelay = `${layer * NAME_ECHO.layerDelayMs}ms`;
    if (layer > 0) line.setAttribute('aria-hidden', 'true');
    Array.from(new Intl.Segmenter().segment(name), (part: Intl.SegmentData): string => part.segment).forEach((letter: string, index: number): void => {
      const span: HTMLSpanElement = document.createElement('span');
      span.textContent = letter;
      span.style.setProperty('--side', `${index - (name.length - 1) / 2}`);
      span.style.animationDelay = `${layer * NAME_ECHO.layerDelayMs + index * NAME_ECHO.letterDelayMs}ms`;
      line.append(span);
    });
    echo.append(line);
  }
  root.append(echo);
  window.setTimeout((): void => echo.remove(), NAME_ECHO.lifeMs);
}

export function createNameEcho(deps: NameEchoDeps): NameEcho {
  const style: HTMLStyleElement = document.createElement('style');
  style.textContent = echoCss;
  deps.root.append(style);
  const said: Set<Moment> = new Set<Moment>();
  let voice: SpokenName | null = null;
  let asking: boolean = false;
  const asked: Set<Moment> = new Set<Moment>();
  let lying: boolean = false;
  let risenAt: number | null = null;
  let round: number = 0;

  const say = (moment: Moment, waited: number): void => {
    if (said.has(moment) || (asking && waited < NAME_ECHO.voiceWait)) return;
    const name: string | null = voice?.name ?? deps.nameOf();
    if (name === null) return;
    said.add(moment);
    showLetters(deps.root, name);
    if (voice !== null) deps.play(voice.audio).catch((): void => undefined);
  };

  const ask = (moment: Moment): void => {
    if (voice !== null || asking || asked.has(moment)) return;
    asked.add(moment);
    asking = true;
    const mine: number = round;
    const load = async (): Promise<void> => {
      await deps.refreshName();
      const fetched: SpokenName | null = await deps.fetchVoice();
      if (mine === round) voice = fetched;
    };
    load()
      .catch((): void => undefined)
      .finally((): void => {
        if (mine === round) asking = false;
      });
  };

  return {
    spokenName(): string | null {
      return voice?.name ?? null;
    },
    forget(): void {
      round += 1;
      said.clear();
      asked.clear();
      voice = null;
      asking = false;
      lying = false;
      risenAt = null;
    },
    update(world: World): void {
      if (world.zone.void === null) return;
      if (world.wake !== null) lying = true;
      else if (lying && risenAt === null) risenAt = world.time;
      if (risenAt !== null) ask('risen');
      if (world.ground.some((ground: GroundItem): boolean => ground.find !== null)) ask('near');
      if (risenAt !== null && world.time - risenAt >= NAME_ECHO.afterRise) say('risen', world.time - risenAt - NAME_ECHO.afterRise);
    },
  };
}
