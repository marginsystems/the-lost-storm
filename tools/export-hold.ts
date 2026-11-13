import { readFileSync, writeFileSync } from 'node:fs';
import { exportHold, formatRigs, readSavedPose, sideOf, withHold } from './hold-pose.ts';
import type { ExportedHold, SavedPose } from './hold-pose.ts';

const RIGS_PATH: string = 'data/rigs.json';
const ATTACHMENTS_PATH: string = 'data/attachments.json';

function main(): void {
  const [posePath, rigId, attachment, flag] = process.argv.slice(2);
  if (posePath === undefined || rigId === undefined || attachment === undefined) throw new Error('usage: node tools/export-hold.ts <saved-pose.json> <rig id> <attachment id> [--seat]');
  const rigs: unknown = JSON.parse(readFileSync(RIGS_PATH, 'utf8'));
  const attachments: unknown = JSON.parse(readFileSync(ATTACHMENTS_PATH, 'utf8'));
  const pose: SavedPose = readSavedPose(JSON.parse(readFileSync(posePath, 'utf8')));
  const seat: boolean = flag === '--seat';
  const hold: ExportedHold = exportHold(pose, sideOf(rigs, attachments, rigId, attachment), seat);
  if (seat && hold.seat === null) throw new Error('--seat needs a weapon in the saved pose (gun.matrix_world)');
  writeFileSync(RIGS_PATH, `${formatRigs(withHold(rigs, rigId, attachment, hold, seat))}\n`);
  process.stdout.write(`${rigId}.holds.${attachment}: ${Object.keys(hold.bones).length} bones${seat && hold.seat !== null ? `; seat ${JSON.stringify(hold.seat)}` : ''}\n`);
}

main();
