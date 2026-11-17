import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const [repo, outDir, profile, portText, mode] = process.argv.slice(2);
const port = Number(portText ?? 5473);
const url = `http://localhost:${port}`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const STORED = [
  ['the-lost-storm.audio.v1', { volumes: { master: 0, effects: 0, voice: 0, ambience: 0 }, muted: true }],
  ['the-lost-storm.settings.v1', { graphics: { quality: 'high', showFps: false, lensWater: true }, controls: {} }],
];
const STEPS = ['^enter$', '^(choose for me|take .+)$', '^enter$', '^woman', '^(enter the storm|continue)$'];
const { fightPlan } = await import(join(repo, 'tools/fight-bench-report.ts'));
const PLAN = fightPlan(false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });
mkdirSync(profile, { recursive: true });
const portFile = join(profile, 'DevToolsActivePort');
if (existsSync(portFile)) unlinkSync(portFile);
const started = [];
const stop = () => {
  for (const child of started) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  }
};
process.on('exit', stop);

async function until(what, ms, attempt) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const found = await attempt().catch(() => null);
    if (found !== null && found !== false && found !== undefined) return found;
    await sleep(400);
  }
  throw new Error(`gave up waiting for ${what}`);
}

const taken = await fetch(`${url}/play/`).then(() => true, () => false);
if (taken) throw new Error(`port ${port} is taken`);
started.push(spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: repo, stdio: 'ignore', detached: true }));
await until('dev server', 120000, async () => ((await fetch(`${url}/play/`)).ok ? true : null));
started.push(spawn(CHROME, ['--headless=new', '--use-angle=metal', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--force-device-scale-factor=2', '--window-size=1280,800', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true }));
const wsUrl = await until('chrome', 30000, async () => {
  const p = readFileSync(portFile, 'utf8').split('\n')[0];
  const list = await (await fetch(`http://127.0.0.1:${p}/json/list`)).json();
  return list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null;
});
const socket = new WebSocket(wsUrl);
await new Promise((r, j) => {
  socket.addEventListener('open', r);
  socket.addEventListener('error', j);
});
let nextId = 1;
const waiting = new Map();
socket.addEventListener('message', (event) => {
  const m = JSON.parse(String(event.data));
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m);
    waiting.delete(m.id);
  }
});
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const reply = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails).slice(0, 400));
  return reply.result?.value;
};
const click = (pattern) =>
  until(`button ${pattern}`, 120000, () =>
    evaluate(`(() => { const w = new RegExp(${JSON.stringify(pattern)}, 'i'); const b = [...document.querySelectorAll('button')].find((c) => !c.disabled && c.offsetParent !== null && w.test((c.textContent ?? '').trim())); if (!b) return false; b.click(); return true; })()`),
  );
const shot = async (name) => {
  const { data } = await call('Page.captureScreenshot', { format: 'jpeg', quality: 60 });
  writeFileSync(join(outDir, `${name}.jpg`), Buffer.from(data, 'base64'));
};
const lines = [];
const note = (text) => {
  lines.push(text);
  console.log(text);
};
const short = (u) => u.replace(url, '').replace(/\?.*$/, '').replace(/^\/node_modules\/\.vite\/deps\//, 'dep:').replace(/^\/@fs.*node_modules\//, 'nm:');

function summarise(prof) {
  const byId = new Map(prof.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (const n of prof.nodes) self.set(n.id, 0);
  const deltas = prof.timeDeltas ?? [];
  for (let i = 0; i < prof.samples.length; i += 1) self.set(prof.samples[i], (self.get(prof.samples[i]) ?? 0) + (deltas[i] ?? 0));
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const keyOf = (n) => `${n.callFrame.functionName || '(anonymous)'} ${short(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`;
  const selfBy = new Map();
  const fileBy = new Map();
  for (const n of prof.nodes) {
    const t = self.get(n.id) ?? 0;
    selfBy.set(keyOf(n), (selfBy.get(keyOf(n)) ?? 0) + t);
    const f = short(n.callFrame.url) || `(${n.callFrame.functionName})`;
    fileBy.set(f, (fileBy.get(f) ?? 0) + t);
  }
  const inclBy = new Map();
  const walk = (n, open) => {
    let sum = self.get(n.id) ?? 0;
    const key = keyOf(n);
    const fresh = !open.has(key);
    if (fresh) open.add(key);
    for (const c of n.children ?? []) sum += walk(byId.get(c), open);
    if (fresh) {
      open.delete(key);
      inclBy.set(key, (inclBy.get(key) ?? 0) + sum);
    }
    return sum;
  };
  walk(prof.nodes[0], new Set());
  const ms = (t) => (t / 1000).toFixed(0).padStart(7);
  const pct = (t) => ((t / total) * 100).toFixed(1).padStart(5) + '%';
  const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, t]) => `${ms(t)} ms ${pct(t)}  ${k}`);
  return [`total sampled ${ms(total)} ms`, '', '== self time by file', ...top(fileBy, 45), '', '== self time by function', ...top(selfBy, 70), '', '== inclusive time by function (game code)', ...top(new Map([...inclBy].filter(([k]) => / \/(src|sim)\//.test(k))), 90)];
}

try {
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
  if (mode === 'gl') await call('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(new URL('./gl-inject.js', import.meta.url), 'utf8') });
  await call('Storage.clearDataForOrigin', { origin: url, storageTypes: 'all' });
  await call('Page.navigate', { url: `${url}/` });
  await sleep(1500);
  await evaluate(STORED.map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))})`).join(';') + '; true');
  await call('Page.navigate', { url: `${url}/play/` });
  for (const step of STEPS) {
    await click(step);
    await sleep(1500);
  }
  await until('the world to run', 180000, async () => {
    const a = await evaluate('window.storm?.world.time ?? null');
    await sleep(1200);
    const b = await evaluate('window.storm?.world.time ?? null');
    return typeof a === 'number' && typeof b === 'number' && b > a ? true : null;
  });
  note('world running');
  if (mode === 'gl') {
    await evaluate("window.__glMark('fight-start'); window.__ticker = setInterval(() => window.__glMark('tick'), 1000); (() => { const sc = window.storm.scene; const prev = sc.onBeforeRender; sc.onBeforeRender = function (r, ...rest) { window.__renderer = r; return prev.call(this, r, ...rest); }; window.__keys = new Map(); window.__lightLog = []; window.__sampler = setInterval(() => { const r = window.__renderer; if (!r) return; const t = Math.round(performance.now()); for (const p of r.info.programs) { const had = window.__keys.get(p.cacheKey); if (had) { had.lastAt = t; had.seen += 1; had.maxUsed = Math.max(had.maxUsed, p.usedTimes); had.ids.add(p.id); } else window.__keys.set(p.cacheKey, { name: p.name, ids: new Set([p.id]), firstAt: t, lastAt: t, seen: 1, maxUsed: p.usedTimes }); } let n = 0, vis = 0; sc.traverse((o) => { if (o.isPointLight) { n += 1; let v = true; for (let a = o; a; a = a.parent) if (!a.visible) { v = false; break; } if (v) vis += 1; } }); const last = window.__lightLog[window.__lightLog.length - 1]; if (!last || last[1] !== n || last[2] !== vis) window.__lightLog.push([t, n, vis]); }, 50); })(); true");
    const raw = await evaluate(`window.storm.bench(${JSON.stringify(PLAN)}).then((r) => ({ kills: r.kills, problems: r.problems, frames: r.frames.length, peakLive: r.peakLive, calls: r.calls.slice(-5) }))`);
    await evaluate("clearInterval(window.__ticker); window.__glMark('fight-end'); true");
    note(`fight: ${JSON.stringify(raw)}`);
    writeFileSync(join(outDir, 'gl.json'), JSON.stringify(await evaluate('window.__gl'), null, 1));
    writeFileSync(join(outDir, 'keys.json'), JSON.stringify(await evaluate("clearInterval(window.__sampler); ({ lights: window.__lightLog, keys: [...window.__keys].map(([key, v]) => ({ key, name: v.name, ids: [...v.ids], firstAt: v.firstAt, lastAt: v.lastAt, seen: v.seen, maxUsed: v.maxUsed })) })"), null, 1));
    throw new Error('gl mode done');
  }
  await call('Profiler.enable');
  await call('Profiler.setSamplingInterval', { interval: 250 });
  await call('Profiler.start');
  const raw = await evaluate(`window.storm.bench(${JSON.stringify(PLAN)}).then((r) => ({ kills: r.kills, drops: r.drops, problems: r.problems, frames: r.frames.length, keys: Object.keys(r) }))`);
  const { profile: prof } = await call('Profiler.stop');
  note(`fight: ${JSON.stringify(raw)}`);
  await shot('after-fight');
  writeFileSync(join(outDir, 'fight.cpuprofile'), JSON.stringify(prof));
  for (const line of summarise(prof)) lines.push(line);
} catch (error) {
  note(`FAILED: ${error.message}`);
  await shot('failed').catch(() => undefined);
} finally {
  writeFileSync(join(outDir, 'summary.txt'), lines.join('\n'));
  socket.close();
  stop();
}
process.exit(0);
