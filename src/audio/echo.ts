export const ECHO = {
  dry: 0.8,
  taps: [
    { delay: 0.31, gain: 0.5, pan: -0.35 },
    { delay: 0.57, gain: 0.34, pan: 0.4 },
    { delay: 0.86, gain: 0.22, pan: -0.15 },
  ],
  feedback: 0.38,
  loopDelay: 0.42,
  tone: 1700,
  tail: 3.2,
} as const;

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
  const input: GainNode = keep(context.createGain());
  const dry: GainNode = keep(context.createGain());
  dry.gain.value = ECHO.dry;
  input.connect(dry);
  dry.connect(output);
  const tone: BiquadFilterNode = keep(context.createBiquadFilter());
  tone.type = 'lowpass';
  tone.frequency.value = ECHO.tone;
  input.connect(tone);
  for (const tap of ECHO.taps) {
    const delay: DelayNode = keep(context.createDelay(ECHO.tail));
    delay.delayTime.value = tap.delay;
    const gain: GainNode = keep(context.createGain());
    gain.gain.value = tap.gain;
    const pan: StereoPannerNode = keep(context.createStereoPanner());
    pan.pan.value = tap.pan;
    tone.connect(delay);
    delay.connect(gain);
    gain.connect(pan);
    pan.connect(output);
  }
  const loop: DelayNode = keep(context.createDelay(ECHO.tail));
  loop.delayTime.value = ECHO.loopDelay;
  const feedback: GainNode = keep(context.createGain());
  feedback.gain.value = ECHO.feedback;
  tone.connect(loop);
  loop.connect(feedback);
  feedback.connect(loop);
  feedback.connect(output);
  return {
    input,
    tail: ECHO.tail,
    release(): void {
      for (const node of nodes) node.disconnect();
    },
  };
}
