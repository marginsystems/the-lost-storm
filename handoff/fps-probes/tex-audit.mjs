import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
function webpSize(b) {
  if (b.toString('ascii', 0, 4) !== 'RIFF') return null;
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const n = b.readUInt32LE(21); return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1]; }
  return null;
}
const tex = walk('public/textures').filter((f) => f.endsWith('.webp')).map((f) => { const b = readFileSync(f); const s = webpSize(b) ?? [0, 0]; return { f: f.replace('public/textures/', ''), kb: (b.length / 1024) | 0, w: s[0], h: s[1] }; });
const bySize = {};
for (const t of tex) { const k = `${t.w}x${t.h}`; bySize[k] = bySize[k] ?? { n: 0, kb: 0 }; bySize[k].n++; bySize[k].kb += t.kb; }
console.log('textures by resolution', bySize);
const kind = {};
for (const t of tex) { const k = t.f.replace(/\.webp$/, '').split('_').pop(); kind[k] = kind[k] ?? { n: 0, kb: 0 }; kind[k].n++; kind[k].kb += t.kb; }
console.log('textures by kind', kind);
console.log('subdirs', [...new Set(tex.map((t) => t.f.includes('/') ? t.f.split('/')[0] : '.'))]);
const emb = {};
let rows = [];
for (const file of walk('public/models').filter((f) => f.endsWith('.glb'))) {
  const buf = readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  for (const image of json.images ?? []) {
    const v = (json.bufferViews ?? [])[image.bufferView];
    if (!v) continue;
    const b = buf.subarray(binStart + (v.byteOffset ?? 0), binStart + (v.byteOffset ?? 0) + v.byteLength);
    const s = webpSize(b) ?? [0, 0];
    const k = `${s[0]}x${s[1]}`;
    emb[k] = emb[k] ?? { n: 0, kb: 0 };
    emb[k].n++;
    emb[k].kb += (v.byteLength / 1024) | 0;
    rows.push([file.replace('public/models/', ''), k, (v.byteLength / 1024) | 0]);
  }
}
console.log('embedded images by resolution', emb);
console.log(rows.sort((a, b) => b[2] - a[2]).slice(0, 14).map((r) => r.join(' ')).join('\n'));
const none = [];
for (const file of walk('public/models').filter((f) => f.endsWith('.glb'))) {
  const buf = readFileSync(file);
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  if (!(json.extensionsUsed ?? []).includes('EXT_meshopt_compression')) none.push(`${file.replace('public/models/', '')} ${(buf.length / 1024) | 0}K`);
}
console.log('not meshopt-compressed:', none.join(', '));
