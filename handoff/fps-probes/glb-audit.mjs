import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const rows = [];
for (const file of walk('public/models').filter((f) => f.endsWith('.glb'))) {
  const buf = readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const acc = json.accessors ?? [];
  let tris = 0;
  let verts = 0;
  for (const mesh of json.meshes ?? []) for (const prim of mesh.primitives ?? []) {
    const count = prim.indices !== undefined ? acc[prim.indices].count : acc[prim.attributes.POSITION].count;
    tris += Math.floor(count / 3);
    verts += acc[prim.attributes.POSITION]?.count ?? 0;
  }
  const views = json.bufferViews ?? [];
  let imageBytes = 0;
  const imgs = [];
  for (const image of json.images ?? []) {
    const v = views[image.bufferView];
    if (v) { imageBytes += v.byteLength; imgs.push(`${(image.mimeType ?? '').replace('image/', '')}:${(v.byteLength / 1024) | 0}K`); }
  }
  let animBytes = 0;
  const animAcc = new Set();
  for (const a of json.animations ?? []) for (const s of a.samplers ?? []) { animAcc.add(s.input); animAcc.add(s.output); }
  const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  for (const i of animAcc) animBytes += acc[i].count * SIZE[acc[i].type] * BYTES[acc[i].componentType];
  rows.push({ file: file.replace('public/models/', ''), kb: (buf.length / 1024) | 0, tris, verts, imageKb: (imageBytes / 1024) | 0, imgs: imgs.join(' '), anims: (json.animations ?? []).length, animKb: (animBytes / 1024) | 0, ext: (json.extensionsUsed ?? []).map((e) => e.replace('KHR_', '').replace('EXT_', '')).join(','), mats: (json.materials ?? []).length, meshes: (json.meshes ?? []).length });
}
const total = rows.reduce((a, r) => ({ kb: a.kb + r.kb, tris: a.tris + r.tris, imageKb: a.imageKb + r.imageKb }), { kb: 0, tris: 0, imageKb: 0 });
console.log('files', rows.length, 'total KB', total.kb, 'tris', total.tris, 'embedded image KB', total.imageKb);
const exts = {};
for (const r of rows) exts[r.ext || '(none)'] = (exts[r.ext || '(none)'] ?? 0) + 1;
console.log('extensions:', exts);
console.log('--- top by size');
for (const r of [...rows].sort((a, b) => b.kb - a.kb).slice(0, 34)) console.log(String(r.kb).padStart(5), 'KB', String(r.tris).padStart(7), 'tris', String(r.imageKb).padStart(4), 'imgKB', String(r.animKb).padStart(5), 'animKB', r.anims ? `${r.anims}clips` : '', r.file, '|', r.ext, '|', r.imgs.slice(0, 60));
console.log('--- top by triangles');
for (const r of [...rows].sort((a, b) => b.tris - a.tris).slice(0, 25)) console.log(String(r.tris).padStart(7), 'tris', String(r.kb).padStart(5), 'KB', `${r.meshes}mesh/${r.mats}mat`, r.file);
const dirs = {};
for (const r of rows) { const d = r.file.split('/')[0]; dirs[d] = dirs[d] ?? { n: 0, kb: 0, tris: 0, imageKb: 0 }; dirs[d].n++; dirs[d].kb += r.kb; dirs[d].tris += r.tris; dirs[d].imageKb += r.imageKb; }
console.log(dirs);
