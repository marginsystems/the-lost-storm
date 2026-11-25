import { art, fire, halo, spark } from './kit.ts';

function bolt(points: string, glow: string, mid: string, width: number): string {
  return `<polyline points="${points}" stroke="${glow}" stroke-width="${width * 2.2}" fill="none" stroke-linejoin="round" stroke-linecap="round" opacity="0.55" filter="url(#bloom)"/>`
    + `<polyline points="${points}" stroke="${mid}" stroke-width="${width}" fill="none" stroke-linejoin="round" stroke-linecap="round" filter="url(#glow)"/>`
    + `<polyline points="${points}" stroke="#ffffff" stroke-width="${width * 0.38}" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
}

function ring(cx: number, cy: number, rx: number, ry: number, glow: string, line: string, width: number): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${glow}" stroke-width="${width * 2.4}" fill="none" opacity="0.6" filter="url(#bloom)"/>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke="${line}" stroke-width="${width}" fill="none" filter="url(#glow)"/>`;
}

function maul(heat: string): string {
  return `<rect x="-2.7" y="-38" width="5.4" height="32" rx="2.2" fill="url(#wood)"/>`
    + `<rect x="-3.1" y="-30" width="6.2" height="2" rx="0.6" fill="#24140a"/>`
    + `<rect x="-3.1" y="-25" width="6.2" height="2" rx="0.6" fill="#24140a"/>`
    + `<rect x="-3.1" y="-20" width="6.2" height="2" rx="0.6" fill="#24140a"/>`
    + `<path d="M-13 -8 h26 l2.4 2.6 v10.8 l-2.4 2.6 h-26 l-2.4 -2.6 v-10.8z" fill="url(#iron)"/>`
    + `<path d="M-13 -8 h26 l2.4 2.6 h-30.8z" fill="#e6ecf2" opacity="0.85"/>`
    + `<rect x="-4.2" y="-5.4" width="8.4" height="10.8" rx="1" fill="#2a3038" opacity="0.65"/>`
    + `<rect x="-15.4" y="-5.4" width="2.4" height="10.8" fill="#1a1f26" opacity="0.7"/>`
    + `<rect x="13" y="-5.4" width="2.4" height="10.8" fill="#1a1f26" opacity="0.7"/>`
    + `<path d="M-15.4 5.4 l2.4 2.6 h26 l2.4 -2.6z" fill="${heat}" opacity="0.95" filter="url(#glow)"/>`
    + `<path d="M1 -4.2 L-1.6 0.4 L1.6 0.4 L-1 4.6" stroke="${heat}" stroke-width="1.2" fill="none" stroke-linejoin="round" filter="url(#glow)"/>`;
}

function arcPoints(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps: number, jag: number): string {
  const points: string[] = [];
  for (let i: number = 0; i <= steps; i += 1) {
    const t: number = from + ((to - from) * i) / steps;
    const push: number = i === 0 || i === steps ? 1 : 1 + (i % 2 === 0 ? jag : -jag);
    points.push(`${(cx + Math.cos(t) * rx * push).toFixed(2)},${(cy + Math.sin(t) * ry * push).toFixed(2)}`);
  }
  return points.join(' ');
}

function rock(x: number, y: number, s: number, fill: string): string {
  return `<path d="M${x} ${y} l${s * 1.2} ${-s} l${s * 1.4} ${s * 0.5} l${-s * 0.4} ${s * 1.1} l${-s * 1.6} ${s * 0.3}z" fill="${fill}"/>`;
}

function coal(x: number, y: number, s: number): string {
  return `<path d="M${x - s} ${y} l${s * 0.5} ${-s * 0.8} l${s * 1.2} ${-s * 0.2} l${s * 0.6} ${s * 0.7} l${-s * 0.6} ${s * 0.6} l${-s * 1.2} 0z" fill="#2a0f06"/>`
    + `<path d="M${x - s * 0.5} ${y - s * 0.1} l${s * 0.7} ${-s * 0.4} l${s * 0.5} ${s * 0.3}" stroke="#ff8a2a" stroke-width="${s * 0.35}" fill="none" stroke-linecap="round" filter="url(#glow)"/>`;
}

function spikes(cx: number, cy: number, outer: number, inner: number, count: number, squash: number, turn: number, fill: string): string {
  const points: string[] = [];
  for (let i: number = 0; i < count * 2; i += 1) {
    const angle: number = turn + (Math.PI * i) / count;
    const reach: number = i % 2 === 0 ? outer * (1 - 0.32 * (((i * 37) % 7) / 7)) : inner;
    const x: number = cx + Math.cos(angle) * reach;
    const y: number = cy + Math.sin(angle) * reach * squash;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `<polygon points="${points.join(' ')}" fill="${fill}" stroke-linejoin="round"/>`;
}

function streaks(cx: number, cy: number, from: number, to: number, angles: readonly number[], color: string, width: number): string {
  return angles.map((degrees: number): string => {
    const a: number = (degrees * Math.PI) / 180;
    const x1: string = (cx + Math.cos(a) * from).toFixed(2);
    const y1: string = (cy + Math.sin(a) * from).toFixed(2);
    const x2: string = (cx + Math.cos(a) * to).toFixed(2);
    const y2: string = (cy + Math.sin(a) * to).toFixed(2);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" filter="url(#glow)"/>`;
  }).join('');
}

function bankedFlames(cx: number, cy: number, rx: number, ry: number, from: number, to: number, count: number, scale: number): string {
  let out: string = '';
  for (let i: number = 0; i < count; i += 1) {
    const t: number = from + ((to - from) * i) / Math.max(1, count - 1);
    const x: number = cx + Math.cos(t) * rx;
    const y: number = cy + Math.sin(t) * ry;
    const depth: number = 0.65 + 0.35 * Math.sin(t);
    const height: number = (10 + (i % 2) * 4) * depth * scale;
    out += fire(Number(x.toFixed(2)), Number(y.toFixed(2)), Number(height.toFixed(2)), Number((3.4 * depth * scale).toFixed(2)), (i % 3) - 1);
  }
  return out;
}

function coalRing(cx: number, cy: number, rx: number, ry: number, count: number): string {
  let out: string = '';
  for (let i: number = 0; i < count; i += 1) {
    const t: number = (Math.PI * 2 * i) / count + 0.2;
    const x: number = cx + Math.cos(t) * rx;
    const y: number = cy + Math.sin(t) * ry;
    const s: number = 2 + 0.9 * (0.5 + 0.5 * Math.sin(t));
    out += coal(Number(x.toFixed(2)), Number(y.toFixed(2)), Number(s.toFixed(2)));
  }
  return out;
}

function figure(x: number, y: number, rim: string): string {
  return `<path d="M${x - 5.2} ${y} C${x - 5.6} ${y - 8} ${x - 6} ${y - 14} ${x - 4.4} ${y - 16.5} L${x + 4.4} ${y - 16.5} C${x + 6} ${y - 14} ${x + 5.6} ${y - 8} ${x + 5.2} ${y}Z" fill="#0d0503"/>`
    + `<circle cx="${x}" cy="${y - 20}" r="3.6" fill="#0d0503"/>`
    + `<path d="M${x + 4.4} ${y - 16.5} C${x + 6} ${y - 14} ${x + 5.6} ${y - 8} ${x + 5.2} ${y}" stroke="${rim}" stroke-width="0.9" fill="none" filter="url(#glow)"/>`
    + `<path d="M${x - 4.4} ${y - 16.5} C${x - 6} ${y - 14} ${x - 5.6} ${y - 8} ${x - 5.2} ${y}" stroke="${rim}" stroke-width="0.9" fill="none" filter="url(#glow)"/>`;
}

function lightFigure(x: number, y: number): string {
  const body: string = `M${x - 4.6} ${y} C${x - 5} ${y - 8} ${x - 5.6} ${y - 13} ${x - 4.4} ${y - 16} L${x + 4.4} ${y - 16} C${x + 5.6} ${y - 13} ${x + 5} ${y - 8} ${x + 4.6} ${y}Z`;
  const arms: string = `M${x - 4} ${y - 15} L${x - 11} ${y - 7} M${x + 4} ${y - 15} L${x + 11} ${y - 7}`;
  return `<defs><linearGradient id="mending_pulse_body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#c8ffd6"/><stop offset="1" stop-color="#5fe08a" stop-opacity="0.6"/></linearGradient></defs>`
    + `<path d="${body}" fill="#5fe08a" filter="url(#bloom)"/>`
    + `<path d="${arms}" stroke="#5fe08a" stroke-width="5" stroke-linecap="round" filter="url(#bloom)"/>`
    + `<circle cx="${x}" cy="${y - 20.4}" r="4.6" fill="#5fe08a" filter="url(#bloom)"/>`
    + `<path d="${arms}" stroke="url(#mending_pulse_body)" stroke-width="3" stroke-linecap="round"/>`
    + `<path d="${body}" fill="url(#mending_pulse_body)"/>`
    + `<circle cx="${x}" cy="${y - 20.4}" r="3.7" fill="#ffffff"/>`;
}

function pauldron(): string {
  const outer: string = 'M26 21 C32 15 43 16 48.5 23.5 C52 30 49 36.5 43.5 39';
  return `<path d="${outer} L40.5 35.5 C43 32 43 27.5 40 24.5 C36 21 31 21 28 23.5Z" fill="url(#steel)"/>`
    + `<path d="M30.5 22.6 C35 18.6 41.6 19.6 45 24.6" stroke="#1e242c" stroke-width="1" fill="none" opacity="0.8"/>`
    + `<path d="M42.6 26 C46.6 29 46.6 33.6 44.6 36.6" stroke="#1e242c" stroke-width="1" fill="none" opacity="0.8"/>`
    + `<path d="M30 18.6 C35 15.8 41 16.4 45 20" stroke="#ffffff" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.85"/>`
    + `<path d="M48.5 23.5 C52 30 49 36.5 43.5 39" stroke="#ffb43a" stroke-width="1.6" fill="none" stroke-linecap="round" filter="url(#glow)"/>`;
}

function charger(rim: string): string {
  const front: string = 'M27 22 C33 18 41 19 46 25 C49 31 46 37 41 39';
  return `<path d="M27 31 L16 37 L9 33" stroke="#120604" stroke-width="4.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="${front} L34 43 L40 50 L38 61 L32 61 L33 52 L25 47 L14 54 L5 59 L3 55 L12 48 L19 41 C17 34 20 26 27 22Z" fill="#120604"/>`
    + `<circle cx="31" cy="16" r="5" fill="#120604"/>`
    + `<path d="M32.6 11.3 C35.2 12 36.4 14 36 16.4" stroke="${rim}" stroke-width="1" fill="none" filter="url(#glow)"/>`
    + `<path d="${front}" stroke="${rim}" stroke-width="1.2" fill="none" filter="url(#glow)"/>`
    + `<path d="M41 39 L34 43 L40 50 L38 61" stroke="${rim}" stroke-width="0.9" fill="none" opacity="0.8"/>`;
}

function hourglass(): string {
  return `<path d="M-11 -18 C-11 -6 -2 -3 -2 0 C-2 3 -11 6 -11 18 L11 18 C11 6 2 3 2 0 C2 -3 11 -6 11 -18Z" fill="#cfc6ff" opacity="0.16"/>`
    + `<path d="M-8.4 -11 C-6 -5 -1.6 -3 0 -1.4 C1.6 -3 6 -5 8.4 -11Z" fill="url(#energy)"/>`
    + `<path d="M-9.6 17 C-8 11 -3 9.6 0 9 C3 9.6 8 11 9.6 17Z" fill="url(#energy)"/>`
    + `<path d="M-11 -18 C-11 -6 -2 -3 -2 0 C-2 3 -11 6 -11 18" stroke="#f7f4ff" stroke-width="1" fill="none" opacity="0.75"/>`
    + `<path d="M11 -18 C11 -6 2 -3 2 0 C2 3 11 6 11 18" stroke="#f7f4ff" stroke-width="1" fill="none" opacity="0.45"/>`
    + `<path d="M-8 -14 C-8 -8 -4 -5 -3 -3.6" stroke="#ffffff" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.7"/>`
    + `<rect x="-15" y="-23" width="30" height="5" rx="1.4" fill="url(#wood)"/>`
    + `<rect x="-15" y="18" width="30" height="5" rx="1.4" fill="url(#wood)"/>`
    + `<rect x="-15" y="-23" width="30" height="1.4" rx="0.7" fill="#e8c890" opacity="0.6"/>`
    + `<rect x="-15" y="18" width="30" height="1.4" rx="0.7" fill="#e8c890" opacity="0.6"/>`
    + `<rect x="-13.6" y="-18" width="2.2" height="36" rx="1" fill="url(#iron)"/>`
    + `<rect x="11.4" y="-18" width="2.2" height="36" rx="1" fill="url(#iron)"/>`;
}

function star(cx: number, cy: number, long: number, short: number, fill: string): string {
  return `<path d="M${cx} ${cy - long} Q${cx + short * 0.3} ${cy - short * 0.3} ${cx + long} ${cy} Q${cx + short * 0.3} ${cy + short * 0.3} ${cx} ${cy + long} Q${cx - short * 0.3} ${cy + short * 0.3} ${cx - long} ${cy} Q${cx - short * 0.3} ${cy - short * 0.3} ${cx} ${cy - long}Z" fill="${fill}"/>`;
}

export const HEARTH_ART: ReadonlyMap<string, string> = new Map<string, string>([
  ['fire_burst', art('fire', `
${halo(32, 38, 24, '#ff5a12', 0.7)}
<ellipse cx="32" cy="48" rx="28" ry="8" fill="#0a0302" opacity="0.6"/>
${fire(32, 40, 30, 8, 1.5)}
${fire(20, 44, 16, 4.5, -2)}
${fire(45, 44, 17, 4.5, 2.5)}
<g filter="url(#soft)">${spikes(32, 40, 30, 11, 11, 0.78, -0.2, '#c21c06')}</g>
${spikes(32, 40, 23, 9, 11, 0.78, 0.05, '#ff5a12')}
${spikes(32, 40, 15, 6.5, 9, 0.8, 0.3, '#ffb43a')}
${spikes(32, 40, 8.5, 4, 7, 0.85, 0.1, '#fff2b8')}
<circle cx="32" cy="40" r="5" fill="#fffbe6" filter="url(#glow)"/>
${streaks(32, 40, 26, 31, [-150, -112, -68, -30, 8, 172], '#ffd27a', 1.3)}
${rock(8, 52, 2.4, '#2a1408')}
${rock(54, 54, 2.6, '#2a1408')}
${rock(40, 58, 2, '#3a1c0a')}
${spark(8, 26, 1, '#ffd27a')}
${spark(57, 22, 0.9, '#ffe9b8')}
${spark(16, 10, 0.8, '#ffd27a')}
${spark(50, 8, 0.8, '#ffe9b8')}
`)],
  ['firewall', art('fire', `
${halo(30, 40, 22, '#ff5a12', 0.6)}
<path d="M0 64 L0 34 C 14 30 22 46 34 42 C 46 38 50 24 64 22 L64 64Z" fill="#0a0302" opacity="0.5"/>
<path d="M6 54 C 16 46 22 56 32 50 C 42 44 44 34 56 30" stroke="#ff7a1a" stroke-width="4.5" fill="none" stroke-linecap="round" filter="url(#bloom)"/>
<path d="M6 54 C 16 46 22 56 32 50 C 42 44 44 34 56 30" stroke="#ffd27a" stroke-width="1.5" fill="none" stroke-linecap="round" filter="url(#glow)"/>
${fire(8, 53, 12, 3.6, 1)}
${fire(15, 50, 16, 4.2, 1.5)}
${fire(22, 52, 18, 4.6, 2)}
${fire(29, 51, 20, 5, 2)}
${fire(36, 47, 20, 5, 1.5)}
${fire(43, 41, 17, 4.6, 1)}
${fire(50, 34, 13, 4, 0.5)}
<circle cx="56" cy="30" r="3.2" fill="#fff4d6" filter="url(#glow)"/>
<path d="M56 30 L60 12" stroke="#ffe4a6" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.7"/>
${spark(60, 12, 1.2, '#ffe9b8')}
${spark(12, 30, 0.8, '#ffd27a')}
${spark(34, 26, 0.9, '#ffb43a')}
${spark(46, 18, 0.7, '#ffd27a')}
`)],
  ['bellows', art('fire', `
${halo(32, 34, 24, '#ff5a12', 0.55)}
<ellipse cx="32" cy="50" rx="22" ry="7" fill="#ff7a1a" opacity="0.45" filter="url(#bloom)"/>
${streaks(32, 36, 8, 26, [200, 240, 280, 320, 0, 40], '#ffb43a', 2.6)}
${spikes(32, 36, 11, 4, 9, 0.8, 0.1, '#ff7a1a')}
${spikes(32, 36, 6.5, 2.4, 9, 0.8, 0.3, '#ffe4a6')}
<circle cx="32" cy="36" r="2.4" fill="#ffffff" filter="url(#glow)"/>
${fire(6, 58, 14, 4, 1)}
${fire(58, 58, 14, 4, 1)}
${spark(10, 20, 1, '#ffe9b8')}
${spark(54, 18, 0.9, '#ffd27a')}
`)],
  ['flashover', art('fire', `
${halo(32, 44, 26, '#ff5a12', 0.7)}
<path d="M4 56 C 14 50 20 58 32 54 C 44 50 50 58 60 52" stroke="#ff7a1a" stroke-width="5" fill="none" stroke-linecap="round" filter="url(#bloom)"/>
${fire(8, 55, 24, 5.5, 2)}
${fire(18, 54, 30, 6, 2.5)}
${fire(28, 54, 36, 6.4, 3)}
${fire(38, 53, 34, 6.2, 3)}
${fire(48, 54, 28, 5.8, 2.5)}
${fire(57, 52, 22, 5, 2)}
<circle cx="32" cy="24" r="4" fill="#fff4d6" filter="url(#glow)"/>
${spark(14, 16, 1.1, '#ffe9b8')}
${spark(50, 14, 1, '#ffd27a')}
${spark(32, 8, 0.9, '#ffb43a')}
`)],
  ['dodge_roll_flicker', art('fire', `
${halo(46, 26, 16, '#ff5a12', 0.6)}
<ellipse cx="18" cy="52" rx="13" ry="4.5" fill="#ff6a1c" opacity="0.7" filter="url(#bloom)"/>
${coal(12, 54, 3)}
${coal(22, 52, 2.6)}
${fire(14, 54, 14, 4, 1)}
${fire(22, 53, 10, 3.4, 0.5)}
<path d="M20 44 C 28 36 34 34 44 28" stroke="#ffb43a" stroke-width="2.4" fill="none" stroke-dasharray="3 4" stroke-linecap="round" opacity="0.8" filter="url(#glow)"/>
${fire(46, 32, 20, 5.4, 2)}
<circle cx="46" cy="22" r="3" fill="#fff4d6" filter="url(#glow)"/>
${spark(56, 14, 1, '#ffe9b8')}
${spark(36, 18, 0.8, '#ffd27a')}
`)],
  ['banked_fire', art('fire', `
${halo(32, 44, 22, '#ff5a12', 0.6)}
<ellipse cx="32" cy="46" rx="27" ry="11" fill="#0a0302" opacity="0.55"/>
${ring(32, 46, 22, 8.5, '#ff5a12', '#ffb43a', 1.6)}
${bankedFlames(32, 46, 22, 8.5, Math.PI * 1.05, Math.PI * 1.95, 5, 1)}
${figure(32, 47, '#ffb43a')}
${coalRing(32, 46, 22, 8.5, 12)}
${bankedFlames(32, 46, 22, 8.5, Math.PI * 0.05, Math.PI * 0.95, 5, 1.25)}
${spark(10, 22, 0.9, '#ffd27a')}
${spark(54, 18, 0.9, '#ffe9b8')}
${spark(32, 10, 0.8, '#ffd27a')}
${spark(46, 28, 0.7, '#ffb43a')}
${spark(18, 30, 0.7, '#ffb43a')}
`)],
  ['thunderclap', art('stone', `
${halo(32, 48, 22, '#ff9a3a', 0.6)}
<ellipse cx="32" cy="49" rx="31" ry="11" fill="#0a0602" opacity="0.6"/>
${ring(32, 49, 28, 9.4, '#ff9a3a', '#ffd896', 2)}
${ring(32, 49, 19, 6.2, '#ff7a1a', '#fff0d2', 1.4)}
${bolt('30,49 21,46 15,50 8,46 1,49', '#ff9a3a', '#fff0d2', 2)}
${bolt('34,49 43,46 48,50 56,46 64,49', '#ff9a3a', '#fff0d2', 2)}
${bolt('32,51 28,56 32,59 29,64', '#ff9a3a', '#ffd896', 1.4)}
${fire(6, 49, 10, 3, -1.5)}
${fire(58, 48, 10, 3, 1.5)}
${fire(16, 57, 8, 2.6, -0.8)}
${fire(48, 57, 8, 2.6, 0.8)}
<g transform="translate(32 34) rotate(-8)">${maul('#ffb43a')}</g>
${halo(32, 47, 10, '#fff0d2', 0.9)}
${spikes(32, 47, 24, 5, 12, 0.3, 0.12, '#ff9a3a')}
${spikes(32, 47, 15, 3.4, 10, 0.3, 0.3, '#fff0d2')}
<ellipse cx="32" cy="47" rx="8" ry="2.2" fill="#ffffff" filter="url(#glow)"/>
${rock(11, 34, 2.6, '#2a1a0c')}
${rock(51, 30, 2.8, '#2a1a0c')}
${rock(57, 39, 1.9, '#3a2410')}
${rock(5, 41, 1.9, '#3a2410')}
${spark(16, 26, 0.9, '#fff0d2')}
${spark(48, 20, 0.9, '#ffd896')}
${spark(59, 28, 0.7, '#fff0d2')}
`)],
  ['thunderclap_standing', art('stone', `
${halo(32, 40, 18, '#e8a048', 0.5)}
<circle cx="10" cy="2" r="11" fill="#140c06"/><circle cx="26" cy="-1" r="12" fill="#1a1008"/><circle cx="42" cy="0" r="12" fill="#140c06"/><circle cx="57" cy="3" r="11" fill="#1a1008"/>
<path d="M-1 10 C6 14 14 12 18 10 C24 13 32 13 36 11 C42 13 50 14 54 12 C58 14 62 13 66 11" stroke="#e8a048" stroke-width="1.2" fill="none" opacity="0.7" filter="url(#glow)"/>
<ellipse cx="32" cy="50" rx="30" ry="10" fill="#0a0602" opacity="0.55"/>
${ring(32, 50, 24, 8, '#e8a048', '#ffd896', 1.4)}
${bolt(arcPoints(32, 36, 25, 8, Math.PI * 1.02, Math.PI * 1.98, 12, 0.14), '#e8a048', '#ffd896', 1.3)}
${bolt('12,10 9,18 14,22 7,33 11,38 6,50', '#e8a048', '#fff0d2', 2)}
${bolt('9,18 3,24', '#e8a048', '#ffd896', 0.9)}
${bolt('53,11 57,20 51,25 58,36 54,41 58,50', '#e8a048', '#fff0d2', 2)}
${bolt('51,25 46,29', '#e8a048', '#ffd896', 0.9)}
${halo(6, 50, 5, '#fff0d2', 0.9)}
${halo(58, 50, 5, '#fff0d2', 0.9)}
<g transform="translate(32 44)">${maul('#ffb43a')}</g>
${bolt(arcPoints(32, 36, 25, 8, Math.PI * 0.02, Math.PI * 0.98, 12, 0.14), '#e8a048', '#fff0d2', 1.6)}
${spark(20, 26, 0.9, '#fff0d2')}
${spark(46, 24, 0.9, '#ffd896')}
`)],
  ['thunderclap_gathered', art('stone', `
${halo(32, 24, 18, '#ffb43a', 0.7)}
<ellipse cx="32" cy="52" rx="32" ry="11" fill="#0a0602" opacity="0.6"/>
${ring(32, 52, 29, 9.5, '#ff7a1a', '#ffd896', 2.6)}
${ring(32, 52, 19, 6, '#e8a048', '#ffd896', 1.2)}
${ring(32, 52, 10, 3, '#e8a048', '#fff0d2', 0.9)}
${fire(4, 53, 11, 3, 1.5)}
${fire(60, 53, 11, 3, -1.5)}
${fire(13, 61, 9, 2.8, 1.2)}
${fire(51, 61, 9, 2.8, -1.2)}
${fire(32, 63, 7, 2.6, 0)}
<path d="M2 40 Q4 14 32 24 M62 40 Q60 14 32 24 M6 4 Q26 2 32 24 M58 4 Q38 2 32 24" stroke="#ffb43a" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.5" filter="url(#bloom)"/>
<path d="M2 40 Q4 14 32 24 M62 40 Q60 14 32 24 M6 4 Q26 2 32 24 M58 4 Q38 2 32 24" stroke="#fff0d2" stroke-width="1.1" fill="none" stroke-linecap="round" opacity="0.85" filter="url(#glow)"/>
${halo(32, 25, 13, '#fff0d2', 0.6)}
<g transform="translate(32 25) rotate(180)">${maul('#fff0d2')}</g>
<circle cx="32" cy="25" r="10" fill="url(#core)" opacity="0.55" filter="url(#glow)"/>
${spark(10, 24, 1, '#fff0d2')}
${spark(54, 22, 1, '#fff0d2')}
${spark(20, 8, 0.8, '#ffd896')}
${spark(46, 10, 0.8, '#ffd896')}
`)],
  ['dodge_roll_shoulder', art('fire', `
${halo(54, 36, 18, '#ff5a12', 0.9)}
<path d="M-2 20 L20 22 M-2 30 L16 31 M0 40 L14 41" stroke="#ffb43a" stroke-width="3" stroke-linecap="round" opacity="0.5" filter="url(#bloom)"/>
<path d="M0 20 L20 22 M0 30 L16 31 M2 40 L14 41" stroke="#ffe4a6" stroke-width="1" stroke-linecap="round" opacity="0.75"/>
<ellipse cx="52" cy="58" rx="16" ry="5" fill="#ff7a1a" opacity="0.8" filter="url(#bloom)"/>
${fire(56, 60, 22, 5.5, 2)}
${fire(46, 61, 12, 4, 0)}
${fire(63, 58, 12, 3, 2)}
${spikes(55, 32, 12, 4, 8, 1, 0.2, '#ff7a1a')}
${spikes(55, 32, 7.5, 2.8, 8, 1, 0.4, '#ffe4a6')}
<circle cx="54" cy="32" r="2.6" fill="#ffffff" filter="url(#glow)"/>
${charger('#ffb43a')}
${pauldron()}
${spark(60, 20, 1, '#ffe9b8')}
${spark(62, 44, 0.8, '#ffd27a')}
${spark(48, 14, 0.8, '#ffd27a')}
`)],
  ['held_breath', art('echo', `
${halo(32, 32, 22, '#b3a6ff', 0.55)}
<circle cx="32" cy="32" r="27" stroke="#b3a6ff" stroke-width="1" fill="none" opacity="0.35"/>
<circle cx="32" cy="32" r="22" stroke="#b3a6ff" stroke-width="1.4" fill="none" opacity="0.45" stroke-dasharray="2 4"/>
<path d="M32 5 A27 27 0 0 1 59 32" stroke="#f7f4ff" stroke-width="2" fill="none" stroke-linecap="round" filter="url(#glow)"/>
<g transform="translate(32 32)">${hourglass()}</g>
${spark(32, 3, 0.9, '#ffffff')}
${spark(32, 30.5, 0.9, '#f7f4ff')}
${spark(32, 34, 0.8, '#f7f4ff')}
${spark(32, 37.5, 0.7, '#f7f4ff')}
${spark(9, 18, 0.8, '#d8d0ff')}
${spark(55, 48, 0.8, '#d8d0ff')}
${spark(12, 50, 0.6, '#d8d0ff')}
`)],
  ['mending_pulse', art('mend', `
${halo(32, 38, 22, '#5fe08a', 0.6)}
<ellipse cx="32" cy="47" rx="30" ry="10" fill="#020a04" opacity="0.5"/>
${ring(32, 47, 28, 9.5, '#5fe08a', '#b8f5c8', 1)}
${ring(32, 47, 19.5, 6.6, '#5fe08a', '#d8ffe0', 1.4)}
${ring(32, 47, 11, 3.8, '#5fe08a', '#eeffef', 1.8)}
<path d="M32 47 L32 0" stroke="#5fe08a" stroke-width="12" opacity="0.25" filter="url(#bloom)"/>
${lightFigure(32, 46)}
${star(13, 26, 4.4, 1.6, '#eeffef')}
${star(52, 20, 5, 1.8, '#eeffef')}
${star(20, 10, 3, 1.2, '#b8f5c8')}
${star(46, 36, 3, 1.2, '#b8f5c8')}
${spark(8, 40, 0.8, '#b8f5c8')}
${spark(57, 42, 0.8, '#b8f5c8')}
${spark(40, 8, 0.8, '#eeffef')}
${spark(24, 32, 0.7, '#eeffef')}
`)],
]);

