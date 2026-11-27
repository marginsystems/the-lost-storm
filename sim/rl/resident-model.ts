import type { Action } from './contract.ts';
import type { PolicyFile } from './policy-file.ts';
import { policyFits, readPolicyFile } from './policy-file.ts';
import { createPolicyNet, greedyAction } from './policy-net.ts';
import type { RivalPilot } from './rival.ts';

export const RESIDENT_MODEL_PATH: string = 'models/rl/resident-pilot.bin';

export function residentPilotFrom(bytes: Uint8Array): RivalPilot {
  const file: PolicyFile = readPolicyFile(bytes);
  if (!policyFits(file)) throw new Error(`the resident's model was trained for contract ${file.contract.fingerprint}, not the one the game speaks`);
  const net = createPolicyNet(file);
  return (obs: Float32Array, mask: Uint8Array): Action => greedyAction(net, obs, mask);
}
