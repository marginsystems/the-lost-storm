import { residentPilotFrom } from '../sim/rl/resident-model.ts';
import type { RivalPilot } from '../sim/rl/rival.ts';

export interface PorterRequest {
  readonly url: string;
  readonly obs: Float32Array;
  readonly mask: Uint8Array;
}

let pilot: RivalPilot | null = null;

const MODEL_TIMEOUT_MS: number = 15_000;

async function reply(request: PorterRequest): Promise<void> {
  try {
    const { url, obs, mask } = request;
    if (pilot === null) {
      const response: Response = await fetch(url, { signal: AbortSignal.timeout(MODEL_TIMEOUT_MS) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      pilot = residentPilotFrom(new Uint8Array(await response.arrayBuffer()));
    }
    self.postMessage(pilot(obs, mask).move, {});
  } catch (error) {
    self.postMessage(String(error), {});
  }
}

self.addEventListener('message', (event: MessageEvent<PorterRequest>): void => {
  void reply(event.data);
});
