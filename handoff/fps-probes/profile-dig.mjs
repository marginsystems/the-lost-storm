import { readFileSync } from 'node:fs';

const [file, ...asks] = process.argv.slice(2);
const prof = JSON.parse(readFileSync(file, 'utf8'));
const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map(prof.nodes.map((n) => [n.id, 0]));
const stamps = [];
let clock = prof.startTime;
for (let i = 0; i < prof.samples.length; i += 1) {
  clock += prof.timeDeltas[i] ?? 0;
  self.set(prof.samples[i], self.get(prof.samples[i]) + (prof.timeDeltas[i] ?? 0));
  stamps.push([clock, prof.samples[i], prof.timeDeltas[i] ?? 0]);
}
const short = (u) => u.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '').replace(/^\/node_modules\/\.vite\/deps\//, 'dep:');
const name = (n) => `${n.callFrame.functionName || '(anon)'} ${short(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`;
const incl = new Map();
const total = (id) => {
  if (incl.has(id)) return incl.get(id);
  let sum = self.get(id);
  for (const c of byId.get(id).children ?? []) sum += total(c);
  incl.set(id, sum);
  return sum;
};
total(prof.nodes[0].id);
const ms = (t) => (t / 1000).toFixed(0).padStart(7);
const chain = (id, limit) => {
  const out = [];
  let at = parent.get(id);
  while (at !== undefined && out.length < limit) {
    out.push(name(byId.get(at)));
    at = parent.get(at);
  }
  return out;
};
const gameAncestor = (id) => {
  let at = parent.get(id);
  while (at !== undefined) {
    const n = byId.get(at);
    if (/\/(src|sim)\//.test(n.callFrame.url)) return name(n);
    at = parent.get(at);
  }
  return '(none)';
};

for (const ask of asks) {
  const [kind, what, extra] = ask.split('=');
  console.log(`\n##### ${ask}`);
  if (kind === 'callers') {
    const by = new Map();
    const chains = new Map();
    for (const n of prof.nodes) {
      if (!name(n).startsWith(what)) continue;
      const t = total(n.id);
      const g = gameAncestor(n.id);
      by.set(g, (by.get(g) ?? 0) + t);
      const c = chain(n.id, Number(extra ?? 5)).join(' < ');
      chains.set(c, (chains.get(c) ?? 0) + t);
    }
    console.log('-- by nearest game code');
    for (const [k, t] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(ms(t), k);
    console.log('-- by chain');
    for (const [k, t] of [...chains].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(ms(t), k);
  } else if (kind === 'tree') {
    const depth = Number(extra ?? 2);
    const merged = (ids) => {
      const by = new Map();
      for (const id of ids) for (const c of byId.get(id).children ?? []) {
        const k = name(byId.get(c));
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(c);
      }
      return by;
    };
    const show = (ids, level) => {
      const kids = [...merged(ids)].map(([k, list]) => [k, list, list.reduce((s, id) => s + total(id), 0)]).sort((a, b) => b[2] - a[2]);
      for (const [k, list, t] of kids.slice(0, level === 0 ? 30 : 12)) {
        if (t < 60000) continue;
        console.log(`${'  '.repeat(level)}${ms(t)} ${k}`);
        if (level + 1 < depth) show(list, level + 1);
      }
    };
    const roots = prof.nodes.filter((n) => name(n).startsWith(what)).map((n) => n.id);
    console.log(ms(roots.reduce((s, id) => s + total(id), 0)), what, `(${roots.length} nodes)`);
    show(roots, 0);
  } else if (kind === 'flat') {
    const roots = prof.nodes.filter((n) => name(n).startsWith(what)).map((n) => n.id);
    const by = new Map();
    const walk = (id) => {
      const n = byId.get(id);
      by.set(name(n), (by.get(name(n)) ?? 0) + self.get(id));
      for (const c of n.children ?? []) walk(c);
    };
    for (const id of roots) walk(id);
    for (const [k, t] of [...by].sort((a, b) => b[1] - a[1]).slice(0, Number(extra ?? 25))) console.log(ms(t), k);
  } else if (kind === 'when') {
    const ids = new Set(prof.nodes.filter((n) => name(n).startsWith(what)).map((n) => n.id));
    const buckets = new Map();
    for (const [at, id, dt] of stamps) {
      if (!ids.has(id)) continue;
      const b = Math.floor((at - prof.startTime) / 1e6);
      buckets.set(b, (buckets.get(b) ?? 0) + dt);
    }
    console.log([...buckets].sort((a, b) => a[0] - b[0]).map(([b, t]) => `${b}s:${(t / 1000).toFixed(0)}ms`).join('  '));
  }
}
