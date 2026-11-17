import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const [site, outDir, profile] = process.argv.slice(2);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const STORED = [
  ['the-lost-storm.audio.v1', { volumes: { master: 0, effects: 0, voice: 0, ambience: 0 }, muted: true }],
  ['the-lost-storm.settings.v1', { graphics: { quality: 'high', showFps: false, lensWater: true }, controls: {} }],
];
const STAGES = [
  ['lobby', ['^enter$']],
  ['hero', ['^(choose for me|take .+)$', '^enter$']],
  ['play', ['^woman', '^(enter the storm|continue)$']],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });
mkdirSync(profile, { recursive: true });
const portFile = join(profile, 'DevToolsActivePort');
if (existsSync(portFile)) unlinkSync(portFile);
const chrome = spawn(CHROME, ['--headless=new', '--use-angle=metal', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', '--window-size=1280,800', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: true });
const stop = () => {
  try {
    process.kill(-chrome.pid, 'SIGKILL');
  } catch {}
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

const wsUrl = await until('chrome', 20000, async () => {
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  return list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null;
});
const socket = new WebSocket(wsUrl);
await new Promise((r, j) => {
  socket.addEventListener('open', r);
  socket.addEventListener('error', j);
});
let nextId = 1;
const waiting = new Map();
const requests = new Map();
let stage = 'title';
let lastActivity = Date.now();
let inflight = 0;
socket.addEventListener('message', (event) => {
  const m = JSON.parse(String(event.data));
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m);
    waiting.delete(m.id);
    return;
  }
  const p = m.params ?? {};
  if (m.method === 'Network.requestWillBeSent') {
    if (!requests.has(p.requestId)) inflight += 1;
    requests.set(p.requestId, { url: p.request.url, method: p.request.method, type: p.type, stage, wire: 0, done: false });
    lastActivity = Date.now();
  } else if (m.method === 'Network.responseReceived') {
    const r = requests.get(p.requestId);
    if (r) {
      r.status = p.response.status;
      r.mime = p.response.mimeType;
      r.encoding = p.response.headers['content-encoding'] ?? p.response.headers['Content-Encoding'] ?? '';
      r.cache = p.response.headers['cache-control'] ?? '';
      r.fromCache = p.response.fromDiskCache === true;
    }
  } else if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') {
    const r = requests.get(p.requestId);
    if (r && !r.done) {
      r.done = true;
      r.wire = p.encodedDataLength ?? 0;
      r.failed = m.method === 'Network.loadingFailed';
      inflight -= 1;
    }
    lastActivity = Date.now();
  } else if (m.method === 'Network.dataReceived') lastActivity = Date.now();
  else if (m.method === 'Network.webSocketCreated') requests.set(`ws-${p.requestId}`, { url: p.url, method: 'WS', type: 'WebSocket', stage, wire: 0, done: true });
});
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
const idle = async (quietMs, maxMs) => {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    if (Date.now() - lastActivity > quietMs && inflight <= 0) return true;
    await sleep(300);
  }
  return false;
};
const buttons = () => evaluate("[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => (b.disabled ? '(off) ' : '') + (b.textContent ?? '').trim()).join(' | ')");
const click = (pattern) =>
  until(`button ${pattern}`, 60000, () =>
    evaluate(`(() => { const w = new RegExp(${JSON.stringify(pattern)}, 'i'); const b = [...document.querySelectorAll('button')].find((c) => !c.disabled && c.offsetParent !== null && w.test((c.textContent ?? '').trim())); if (!b) return false; b.click(); return true; })()`),
  );
const shot = async (name) => {
  const { data } = await call('Page.captureScreenshot', { format: 'jpeg', quality: 60 });
  writeFileSync(join(outDir, `${name}.jpg`), Buffer.from(data, 'base64'));
};
const log = [];
const note = (text) => {
  log.push(text);
  console.log(text);
};

try {
  await call('Network.enable', { maxTotalBufferSize: 1000000, maxResourceBufferSize: 100000 });
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.setCacheDisabled', { cacheDisabled: false });
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: STORED.map(([k, v]) => `try { if (!localStorage.getItem(${JSON.stringify(k)})) localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))}); } catch {}`).join(';') });
  const t0 = Date.now();
  await call('Page.navigate', { url: `${site}/play/` });
  note(`title idle=${await idle(3000, 45000)} after ${Date.now() - t0} ms; buttons: ${await buttons()}`);
  await shot('1-title');
  for (const [name, steps] of STAGES) {
    stage = name;
    const started = Date.now();
    for (const step of steps) {
      await click(step);
      await sleep(1500);
    }
    if (name === 'play') {
      await until('the world to run', 90000, async () => {
        const a = await evaluate('window.storm?.world.time ?? document.querySelector("canvas") !== null');
        return a ? true : null;
      }).catch(() => null);
      await sleep(8000);
    }
    note(`${name} idle=${await idle(3000, 60000)} after ${Date.now() - started} ms; buttons: ${await buttons()}`);
    await shot(`${STAGES.findIndex((s) => s[0] === name) + 2}-${name}`);
  }
} catch (error) {
  note(`FAILED at stage ${stage}: ${error.message}; buttons: ${await buttons().catch(() => '?')}`);
  await shot('failed').catch(() => undefined);
} finally {
  writeFileSync(join(outDir, 'requests.json'), JSON.stringify({ log, requests: [...requests.values()] }, null, 1));
  socket.close();
  stop();
}
process.exit(0);
