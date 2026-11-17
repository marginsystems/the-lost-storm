import { readFileSync } from 'node:fs';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Map([...B64].map((c, i) => [c, i]));

function decodeLine(line, state, onSegment) {
  let col = 0;
  for (const seg of line.split(',')) {
    if (seg === '') continue;
    const values = [];
    let shift = 0;
    let value = 0;
    for (const ch of seg) {
      const digit = LOOKUP.get(ch);
      value += (digit & 31) << shift;
      if (digit & 32) shift += 5;
      else {
        values.push(value & 1 ? -(value >> 1) : value >> 1);
        shift = 0;
        value = 0;
      }
    }
    col += values[0];
    if (values.length >= 4) state.source += values[1];
    onSegment(col, values.length >= 4 ? state.source : -1);
  }
}

function bucket(source) {
  const s = source.replace(/^(\.\.\/)+/, '');
  if (s.includes('node_modules/three/examples') || s.includes('node_modules/three/addons')) return 'three addons';
  if (s.includes('node_modules/three')) return 'three core';
  if (s.includes('node_modules/')) return 'other deps: ' + s.split('node_modules/')[1].split('/').slice(0, 2).join('/');
  if (s.startsWith('data/zones')) return 'data/zones';
  if (s.startsWith('data/')) return 'data/' + s.split('/')[1];
  const parts = s.split('/');
  if (parts[0] === 'src' || parts[0] === 'sim') return parts.length > 2 ? parts[0] + '/' + parts[1] : parts[0] + ' (root files)';
  return parts[0];
}

const [jsPath, mode] = process.argv.slice(2);
const js = readFileSync(jsPath, 'utf8');
const map = JSON.parse(readFileSync(jsPath + '.map', 'utf8'));
const lines = js.split('\n');
const mapLines = map.mappings.split(';');
const perSource = new Map();
const state = { source: 0 };
let unmapped = 0;
for (let i = 0; i < lines.length; i += 1) {
  const text = lines[i];
  const segs = [];
  decodeLine(mapLines[i] ?? '', state, (col, source) => segs.push([col, source]));
  if (segs.length === 0) {
    unmapped += text.length + 1;
    continue;
  }
  unmapped += segs[0][0];
  for (let k = 0; k < segs.length; k += 1) {
    const end = k + 1 < segs.length ? segs[k + 1][0] : text.length + 1;
    const len = end - segs[k][0];
    if (segs[k][1] < 0) unmapped += len;
    else perSource.set(segs[k][1], (perSource.get(segs[k][1]) ?? 0) + len);
  }
}
const total = js.length;
const byBucket = new Map();
const byFile = [];
for (const [index, bytes] of perSource) {
  const name = map.sources[index] ?? '?';
  byFile.push([name.replace(/^(\.\.\/)+/, ''), bytes]);
  const key = bucket(name);
  byBucket.set(key, (byBucket.get(key) ?? 0) + bytes);
}
const kb = (n) => (n / 1024).toFixed(0).padStart(6) + ' KB';
console.log('total', kb(total), ' unmapped', kb(unmapped));
for (const [key, bytes] of [...byBucket].sort((a, b) => b[1] - a[1]).slice(0, 45)) console.log(kb(bytes), ((bytes / total) * 100).toFixed(1).padStart(5) + '%', key);
if (mode === 'files') {
  console.log('--- top files');
  for (const [name, bytes] of byFile.sort((a, b) => b[1] - a[1]).slice(0, 50)) console.log(kb(bytes), name);
}
