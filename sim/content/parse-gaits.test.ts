import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rigGaits } from './parse-gaits.ts';

void test('a rig lists its gaits from the slowest to the fastest, each with a positive ground speed', (): void => {
  assert.deepEqual(rigGaits([{ clip: 'Walk_Loop', groundSpeed: 1.1 }, { clip: 'Jog_Fwd_Loop', groundSpeed: 7 }], 'gaits'), [{ clip: 'Walk_Loop', groundSpeed: 1.1 }, { clip: 'Jog_Fwd_Loop', groundSpeed: 7 }]);
  assert.throws((): unknown => rigGaits([], 'gaits'), /a rig needs at least one gait/);
  assert.throws((): unknown => rigGaits([{ clip: 'Walk_Loop', groundSpeed: 0 }], 'gaits'), /groundSpeed/);
  assert.throws((): unknown => rigGaits([{ clip: 'Jog_Fwd_Loop', groundSpeed: 7 }, { clip: 'Walk_Loop', groundSpeed: 1 }], 'gaits'), /slowest to the fastest/);
});
