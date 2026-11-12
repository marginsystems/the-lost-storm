export const ECHO = {
  dry: 0.9,
  beatsPerMinute: 150,
  repeats: 5,
  feedback: 0.5,
  wet: 0.72,
  brightest: 5200,
  darkening: 0.62,
  pans: [-0.22, 0.22],
  ring: 0.8,
} as const;

const SECONDS_PER_MINUTE: number = 60;

export interface EchoRepeat {
  readonly delay: number;
  readonly gain: number;
  readonly cutoff: number;
  readonly pan: number;
}

export function echoBeat(): number {
  return SECONDS_PER_MINUTE / ECHO.beatsPerMinute;
}

export function echoRepeats(): readonly EchoRepeat[] {
  const beat: number = echoBeat();
  return Array.from({ length: ECHO.repeats }, (_: unknown, index: number): EchoRepeat => ({
    delay: beat * (index + 1),
    gain: ECHO.wet * ECHO.feedback ** index,
    cutoff: ECHO.brightest * ECHO.darkening ** index,
    pan: ECHO.pans[index % ECHO.pans.length] ?? 0,
  }));
}

export function echoTail(): number {
  return echoBeat() * ECHO.repeats + ECHO.ring;
}

export interface EchoChain {
  readonly input: AudioNode;
  readonly tail: number;
  release(): void;
}

export function createEcho(context: BaseAudioContext, output: AudioNode): EchoChain {
  const nodes: AudioNode[] = [];
  const keep = <T extends AudioNode>(node: T): T => {
    nodes.push(node);
    return node;
  };
  const tail: number = echoTail();
  const input: GainNode = keep(context.createGain());
  const dry: GainNode = keep(context.createGain());
  dry.gain.value = ECHO.dry;
  input.connect(dry);
  dry.connect(output);
  for (const repeat of echoRepeats()) {
    const delay: DelayNode = keep(context.createDelay(tail));
    delay.delayTime.value = repeat.delay;
    const tone: BiquadFilterNode = keep(context.createBiquadFilter());
    tone.type = 'lowpass';
    tone.frequency.value = repeat.cutoff;
    const gain: GainNode = keep(context.createGain());
    gain.gain.value = repeat.gain;
    const pan: StereoPannerNode = keep(context.createStereoPanner());
    pan.pan.value = repeat.pan;
    input.connect(delay);
    delay.connect(tone);
    tone.connect(gain);
    gain.connect(pan);
    pan.connect(output);
  }
  return {
    input,
    tail,
    release(): void {
      for (const node of nodes) node.disconnect();
    },
  };
}
