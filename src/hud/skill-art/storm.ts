import { art, halo, spark } from './kit.ts';

type Point = readonly [number, number];

const STORM = {
  bloom: '#3fb8ff',
  mid: '#7fd4ff',
  pale: '#bfe9ff',
  white: '#ffffff',
  ghost: '#b3a6ff',
  ghostPale: '#e4ddff',
  heal: '#5fe08a',
  healPale: '#d8ffe2',
} as const;

function fmt(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function polyline(points: readonly Point[]): string {
  return points.map(([x, y]: Point, i: number): string => `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`).join(' ');
}

function jagged(from: Point, to: Point, offsets: readonly number[], bend: number): string {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const dx: number = x1 - x0;
  const dy: number = y1 - y0;
  const length: number = Math.hypot(dx, dy);
  const nx: number = -dy / length;
  const ny: number = dx / length;
  const steps: number = offsets.length + 1;
  const points: Point[] = [from];
  offsets.forEach((offset: number, i: number): void => {
    const t: number = (i + 1) / steps;
    const push: number = offset + bend * Math.sin(Math.PI * t);
    points.push([x0 + dx * t + nx * push, y0 + dy * t + ny * push]);
  });
  points.push(to);
  return polyline(points);
}

function wave(x0: number, x1: number, y: number, amp: number, period: number, phase: number): string {
  const points: Point[] = [];
  const steps: number = Math.ceil((x1 - x0) / 0.8);
  for (let i: number = 0; i <= steps; i += 1) {
    const x: number = x0 + ((x1 - x0) * i) / steps;
    const taper: number = Math.min(1, (x - x0) / 6, (x1 - x) / 6);
    points.push([x, y + Math.sin(((x - x0) / period) * Math.PI * 2 + phase) * amp * Math.max(0, taper)]);
  }
  return polyline(points);
}

function bolt(d: string, width: number, bloom: string, mid: string): string {
  return `<path d="${d}" stroke="${bloom}" stroke-width="${fmt(width * 2.2)}" fill="none" stroke-linejoin="round" stroke-linecap="round" opacity="0.55" filter="url(#bloom)"/>`
    + `<path d="${d}" stroke="${mid}" stroke-width="${fmt(width)}" fill="none" stroke-linejoin="round" stroke-linecap="round" filter="url(#glow)"/>`
    + `<path d="${d}" stroke="${STORM.white}" stroke-width="${fmt(Math.max(0.6, width * 0.38))}" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
}

function thread(d: string, color: string, width: number, opacity: number): string {
  return `<path d="${d}" stroke="${color}" stroke-width="${fmt(width)}" fill="none" stroke-linejoin="round" stroke-linecap="round" opacity="${fmt(opacity)}"/>`;
}

function starPath(x: number, y: number, r: number, waist: number): string {
  const w: number = r * waist;
  return `M${fmt(x)} ${fmt(y - r)}L${fmt(x + w)} ${fmt(y - w)}L${fmt(x + r)} ${fmt(y)}L${fmt(x + w)} ${fmt(y + w)}L${fmt(x)} ${fmt(y + r)}L${fmt(x - w)} ${fmt(y + w)}L${fmt(x - r)} ${fmt(y)}L${fmt(x - w)} ${fmt(y - w)}Z`;
}

function flash(x: number, y: number, r: number, color: string): string {
  return halo(x, y, r * 1.1, color, 0.75)
    + `<path d="${starPath(x, y, r, 0.16)}" fill="${STORM.pale}" filter="url(#glow)"/>`
    + `<path d="${starPath(x, y, r * 0.55, 0.2)}" fill="${STORM.white}" transform="rotate(45 ${fmt(x)} ${fmt(y)})"/>`
    + `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(r * 0.22)}" fill="${STORM.white}"/>`;
}

function hammer(transform: string, glowing: boolean): string {
  const inlay: string = glowing
    ? `<path d="M17 14 L47 14" stroke="${STORM.bloom}" stroke-width="3" opacity="0.8" filter="url(#bloom)"/><path d="M17 14 L47 14" stroke="${STORM.pale}" stroke-width="1.3" filter="url(#glow)"/>`
    : '';
  return `<g transform="${transform}">
<rect x="29.4" y="20" width="5.2" height="44" rx="2.2" fill="url(#wood)"/>
<rect x="29" y="50" width="6" height="11" rx="1.6" fill="url(#leather)"/>
<rect x="29" y="22" width="6" height="2.2" rx="0.6" fill="#24140a"/>
<path d="M14 6 L50 6 L53 9 L53 19 L50 22 L14 22 L11 19 L11 9Z" fill="url(#iron)"/>
<path d="M14 6 L50 6 L53 9 L11 9Z" fill="#e6ecf2" opacity="0.85"/>
<path d="M11 19 L53 19 L50 22 L14 22Z" fill="#11161c" opacity="0.7"/>
<rect x="26" y="4" width="12" height="20" rx="1.6" fill="url(#steel)"/>
<rect x="26" y="4" width="12" height="2.4" rx="1" fill="#ffffff" opacity="0.7"/>
<circle cx="32" cy="10" r="1.3" fill="#2a3038"/><circle cx="32" cy="18" r="1.3" fill="#2a3038"/>
${inlay}
</g>`;
}

function plus(x: number, y: number, r: number): string {
  const t: number = r * 0.36;
  const d: string = `M${fmt(x - t)} ${fmt(y - r)}H${fmt(x + t)}V${fmt(y - t)}H${fmt(x + r)}V${fmt(y + t)}H${fmt(x + t)}V${fmt(y + r)}H${fmt(x - t)}V${fmt(y + t)}H${fmt(x - r)}V${fmt(y - t)}H${fmt(x - t)}Z`;
  return halo(x, y, r * 1.6, STORM.heal, 0.7)
    + `<path d="${d}" fill="${STORM.heal}" filter="url(#glow)"/>`
    + `<path d="${d}" fill="${STORM.healPale}" transform="translate(${fmt(x * 0.45)} ${fmt(y * 0.45)}) scale(0.55)"/>`;
}

function ring(cx: number, cy: number, rx: number, ry: number, from: number, to: number, noise: readonly number[]): string {
  const points: Point[] = [];
  const steps: number = noise.length - 1;
  noise.forEach((n: number, i: number): void => {
    const a: number = from + ((to - from) * i) / steps;
    points.push([cx + Math.cos(a) * (rx + n), cy + Math.sin(a) * (ry + n * 0.5)]);
  });
  return polyline(points);
}

const LANCE_ANGLE: number = -45;

const stormBoltLance: string = art('storm', `
${halo(32, 32, 24, STORM.bloom, 0.35)}
${halo(50, 14, 12, STORM.pale, 0.6)}
<g transform="rotate(${LANCE_ANGLE} 32 32)">
<rect x="-16" y="27.5" width="64" height="9" rx="4.5" fill="${STORM.bloom}" opacity="0.6" filter="url(#bloom)"/>
<path d="${jagged([-14, 30], [46, 30], [-3, 1, -4, 0, -3, 1, -4, 0, -2], -1)}" stroke="${STORM.pale}" stroke-width="0.9" fill="none" opacity="0.8"/>
<path d="${jagged([-14, 34], [46, 34], [3, -1, 4, 0, 3, -1, 4, 0, 2], 1)}" stroke="${STORM.pale}" stroke-width="0.9" fill="none" opacity="0.8"/>
<rect x="-16" y="29.6" width="64" height="4.8" rx="2.4" fill="${STORM.mid}" filter="url(#glow)"/>
<rect x="-16" y="31" width="64" height="2" rx="1" fill="${STORM.white}"/>
<path d="M40 32 L47 22 L64 32 L47 42Z" fill="${STORM.bloom}" opacity="0.85" filter="url(#bloom)"/>
<path d="M40 32 L47 23.5 L62 32Z" fill="#eaf9ff"/>
<path d="M40 32 L47 40.5 L62 32Z" fill="#4fb6f2"/>
<path d="M44 32 L62 32" stroke="${STORM.white}" stroke-width="1" filter="url(#glow)"/>
<path d="M38 26 L42 32 L38 38" stroke="${STORM.pale}" stroke-width="2" fill="none" stroke-linejoin="round" filter="url(#glow)"/>
${flash(2, 32, 7, STORM.bloom)}
${flash(18, 32, 6, STORM.bloom)}
${flash(32, 32, 5, STORM.bloom)}
</g>
${spark(58, 6, 0.9, STORM.white)}
${spark(10, 40, 0.7, STORM.pale)}
${spark(40, 38, 0.7, STORM.pale)}
${spark(26, 16, 0.6, STORM.pale)}
`);

const ECHO_BOLT: string = 'M2 64 L16 48 L12.5 45.5 L27 32 L23.5 29.5 L40 18';

const stormBoltEcho: string = art('storm', `
${halo(48, 30, 14, STORM.ghost, 0.55)}
${halo(36, 14, 15, STORM.bloom, 0.75)}
<g transform="translate(12 12)" opacity="0.85">
${bolt(ECHO_BOLT, 2.2, STORM.ghost, '#cfc6ff')}
<circle cx="40" cy="18" r="7" fill="${STORM.ghost}" opacity="0.6" filter="url(#bloom)"/>
<circle cx="40" cy="18" r="4.2" fill="none" stroke="${STORM.ghostPale}" stroke-width="1.2" filter="url(#glow)"/>
<circle cx="40" cy="18" r="2" fill="${STORM.ghostPale}"/>
</g>
<g transform="translate(-4 -4)">
${bolt(ECHO_BOLT, 2.8, STORM.bloom, STORM.mid)}
<path d="M16 48 L9 45 L5 47" stroke="${STORM.mid}" stroke-width="0.9" fill="none" opacity="0.8"/>
<path d="M27 32 L31 38 L29 42" stroke="${STORM.mid}" stroke-width="0.9" fill="none" opacity="0.8"/>
<circle cx="40" cy="18" r="8.5" fill="url(#core)" filter="url(#glow)"/>
<circle cx="40" cy="18" r="3.6" fill="${STORM.white}"/>
<path d="M40 5v4M53 18h-4M49.2 8.8l-2.8 2.8M30.8 8.8l2.8 2.8" stroke="${STORM.pale}" stroke-width="1.2" stroke-linecap="round" opacity="0.85"/>
</g>
${spark(58, 40, 0.8, STORM.ghostPale)}
${spark(50, 8, 0.7, STORM.pale)}
`);

const FORK_BODY: string = 'M-8.5 13 C -8.5 3 -5.5 -1.5 0 -1.5 C 5.5 -1.5 8.5 3 8.5 13Z';

function forkTarget(x: number, y: number, scale: number): string {
  return `<g transform="translate(${fmt(x)} ${fmt(y)}) scale(${fmt(scale)})">`
    + '<ellipse cx="0" cy="13" rx="11" ry="2.6" fill="#000" opacity="0.5"/>'
    + `<path d="${FORK_BODY}" fill="#050b18"/>`
    + '<circle cx="0" cy="-6.5" r="4" fill="#050b18"/>'
    + `<path d="M-8.5 12 C -8.5 3 -5.5 -1.5 0 -1.5" stroke="${STORM.mid}" stroke-width="1.1" fill="none" opacity="0.9" filter="url(#glow)"/>`
    + `<path d="M-4 -6.5 A 4 4 0 0 1 3 -9" stroke="${STORM.mid}" stroke-width="1" fill="none" opacity="0.9" filter="url(#glow)"/>`
    + '</g>';
}

const forkline: string = art('storm', `
${halo(14, 26, 14, STORM.bloom, 0.6)}
${halo(34, 44, 11, STORM.bloom, 0.45)}
${halo(52, 24, 8, STORM.bloom, 0.35)}
${forkTarget(14, 26, 1)}
${forkTarget(34, 44, 0.8)}
${forkTarget(52, 24, 0.62)}
${bolt(jagged([-2, 0], [14, 26], [2.5, -3, 2.5], 0), 3.4, STORM.bloom, STORM.mid)}
${bolt(jagged([14, 26], [34, 44], [-3, 3, -2.5, 3], -3), 2.4, STORM.bloom, STORM.mid)}
${bolt(jagged([34, 44], [52, 24], [3, -2.5, 3, -2], -4), 1.5, STORM.bloom, STORM.mid)}
${thread(jagged([14, 26], [34, 44], [2, -2, 3, -1], 2), STORM.pale, 0.7, 0.6)}
${flash(14, 26, 8.5, STORM.bloom)}
${flash(34, 44, 6, STORM.bloom)}
${flash(52, 24, 4, STORM.bloom)}
${spark(26, 12, 0.7, STORM.pale)}
${spark(46, 52, 0.6, STORM.pale)}
${spark(60, 12, 0.5, STORM.pale)}
`);

const CLOUD_PUFFS: readonly (readonly [number, number, number])[] = [
  [14, 20, 9], [24, 13, 11], [38, 11, 12], [50, 17, 10], [58, 24, 7], [8, 26, 6], [22, 24, 9], [36, 24, 10], [48, 26, 8],
];

const squall: string = art('storm', `
${halo(32, 56, 20, STORM.bloom, 0.5)}
<ellipse cx="32" cy="57" rx="26" ry="5" fill="${STORM.bloom}" opacity="0.35" filter="url(#bloom)"/>
<path d="M10 40 L6 50 M18 42 L14 52 M40 42 L36 52 M54 40 L50 50 M28 44 L25 51 M60 46 L57 53" stroke="${STORM.pale}" stroke-width="0.8" stroke-linecap="round" opacity="0.35"/>
${bolt(jagged([32, 26], [30, 56], [-4, 3, -3, 4, -2], 0), 2.8, STORM.bloom, STORM.mid)}
${bolt(jagged([16, 28], [11, 54], [3, -3, 2, -2], 0), 1.8, STORM.bloom, STORM.mid)}
${bolt(jagged([48, 28], [53, 54], [-3, 3, -2, 2], 0), 1.8, STORM.bloom, STORM.mid)}
${flash(30, 56, 6, STORM.bloom)}
${flash(11, 54, 4, STORM.bloom)}
${flash(53, 54, 4, STORM.bloom)}
${halo(32, 26, 14, STORM.bloom, 0.6)}
<g>
${CLOUD_PUFFS.map(([x, y, r]: readonly [number, number, number]): string => `<circle cx="${x}" cy="${y}" r="${r}" fill="#070d1e"/>`).join('')}
<g filter="url(#soft)">
${CLOUD_PUFFS.map(([x, y, r]: readonly [number, number, number]): string => `<circle cx="${x}" cy="${fmt(y - 1.2)}" r="${fmt(r - 1.4)}" fill="#1c2a4c"/>`).join('')}
${CLOUD_PUFFS.map(([x, y, r]: readonly [number, number, number]): string => `<circle cx="${fmt(x - r * 0.25)}" cy="${fmt(y - r * 0.35)}" r="${fmt(r * 0.55)}" fill="#4f6796" opacity="0.6"/>`).join('')}
</g>
${halo(26, 20, 7, STORM.bloom, 0.7)}
${halo(44, 18, 5, STORM.bloom, 0.5)}
${thread(jagged([20, 16], [30, 22], [1.5, -1.5], 0), STORM.pale, 0.9, 0.85)}
${thread(jagged([40, 14], [48, 20], [-1.2, 1.2], 0), STORM.pale, 0.8, 0.7)}
<path d="M6 30 C 12 33 18 32 22 32.5 C 28 34.5 34 33.5 38 33.5 C 44 34.5 50 33 56 30.5" stroke="${STORM.mid}" stroke-width="1.4" fill="none" opacity="0.9" filter="url(#glow)"/>
</g>
`);

const thunderhead: string = art('storm', `
${halo(34, 18, 24, STORM.bloom, 0.85)}
${halo(34, 18, 12, STORM.pale, 0.55)}
<path d="M4 34 C 10 34 16 30 22 24" stroke="${STORM.pale}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.6" filter="url(#glow)"/>
<path d="M62 40 C 56 38 52 32 48 26" stroke="${STORM.pale}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.6" filter="url(#glow)"/>
<path d="M2 14 C 8 18 14 18 20 16" stroke="${STORM.pale}" stroke-width="1.1" fill="none" stroke-linecap="round" opacity="0.5" filter="url(#glow)"/>
<path d="M62 6 C 58 10 54 12 48 12" stroke="${STORM.pale}" stroke-width="1.1" fill="none" stroke-linecap="round" opacity="0.5" filter="url(#glow)"/>
${hammer('rotate(16 32 32) translate(0 2)', true)}
<g transform="rotate(16 32 32) translate(0 2)">
<path d="M10 6 L54 6 L56 22 L8 22Z" fill="${STORM.bloom}" opacity="0.35" filter="url(#bloom)"/>
${bolt(jagged([11, 10], [53, 18], [3, -3, 2, -4, 3, -2, 2], 0), 1.3, STORM.bloom, STORM.mid)}
${bolt(jagged([11, 20], [4, 30], [2, -2], 0), 1.4, STORM.bloom, STORM.mid)}
${bolt(jagged([53, 8], [61, -2], [-2, 2], 0), 1.4, STORM.bloom, STORM.mid)}
${bolt(jagged([28, 4], [24, -6], [2, -1.5], 0), 1.2, STORM.bloom, STORM.mid)}
${bolt(jagged([53, 20], [62, 26], [-2, 1.5], 0), 1.2, STORM.bloom, STORM.mid)}
</g>
${spark(6, 30, 0.9, STORM.pale)}
${spark(58, 32, 0.8, STORM.pale)}
${spark(30, 2, 0.7, STORM.white)}
${spark(16, 40, 0.6, STORM.pale)}
${spark(52, 42, 0.6, STORM.pale)}
`);

const thunderheadLeap: string = art('storm', `
${halo(34, 52, 24, STORM.bloom, 0.85)}
<path d="M0 64 L0 52 C 20 46 48 46 64 52 L64 64Z" fill="#03060e" opacity="0.7"/>
<path d="M-2 40 C 0 6 30 -4 38 40 C 28 8 6 10 3 42Z" fill="${STORM.bloom}" opacity="0.6" filter="url(#bloom)"/>
<path d="M-2 40 C 0 6 30 -4 38 40 C 28 10 6 12 2 41Z" fill="${STORM.mid}" opacity="0.55"/>
<path d="M1 36 C 4 10 26 4 34 34" stroke="${STORM.white}" stroke-width="0.9" fill="none" opacity="0.8"/>
${bolt(jagged([56, -2], [38, 50], [-4, 4, -3, 4, -3, 2], 0), 2.6, STORM.bloom, STORM.mid)}
${bolt(jagged([34, 52], [2, 58], [-2, 2.5, -1.5, 2], 0), 1.6, STORM.bloom, STORM.mid)}
${bolt(jagged([34, 52], [63, 58], [2, -2.5, 1.5, -2], 0), 1.6, STORM.bloom, STORM.mid)}
${hammer('translate(34 44) rotate(160) translate(-32 -14)', true)}
${flash(34, 52, 11, STORM.bloom)}
<path d="M10 44 l3.4 -2.4 2.4 2.4 -3.6 2z M56 40 l3 -2.6 2.6 2.2 -3.4 2z M18 36 l2 -1.6 1.6 1.6 -2 1.2z M50 30 l2 -1.4 1.4 1.6 -2 1.2z" fill="#0a1222"/>
${spark(14, 50, 0.8, STORM.pale)}
${spark(54, 48, 0.8, STORM.pale)}
${spark(44, 36, 0.6, STORM.white)}
`);

const BRAND_GLYPH: string = 'M36 14 L22 35 L30.5 35 L27 50 L42 28 L33.5 28 Z';

const staticBrand: string = art('storm', `
<defs><radialGradient id="brandFace" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stop-color="#1c3f7a"/><stop offset="1" stop-color="#050b1a"/></radialGradient></defs>
${halo(32, 32, 26, STORM.bloom, 0.55)}
${bolt(jagged([32, 6], [32, -4], [2], 0), 1.4, STORM.bloom, STORM.mid)}
${bolt(jagged([58, 32], [66, 26], [-2], 0), 1.4, STORM.bloom, STORM.mid)}
${bolt(jagged([32, 58], [36, 66], [2], 0), 1.4, STORM.bloom, STORM.mid)}
${bolt(jagged([6, 32], [-2, 38], [-2], 0), 1.4, STORM.bloom, STORM.mid)}
${bolt(jagged([48, 14], [58, 4], [2, -2], 0), 1.1, STORM.bloom, STORM.mid)}
${bolt(jagged([16, 50], [6, 60], [-2, 2], 0), 1.1, STORM.bloom, STORM.mid)}
${bolt(jagged([49, 49], [58, 60], [2, -2], 0), 1.1, STORM.bloom, STORM.mid)}
${bolt(jagged([15, 15], [5, 5], [-2, 2], 0), 1.1, STORM.bloom, STORM.mid)}
<path d="M32 5 L59 32 L32 59 L5 32Z" fill="#05080f" opacity="0.6" transform="translate(1.5 2)"/>
<path d="M32 5 L59 32 L32 59 L5 32Z" fill="url(#iron)"/>
<path d="M32 5 L59 32 L54 32 L32 10Z" fill="#e6ecf2" opacity="0.75"/>
<path d="M32 5 L5 32 L10 32 L32 10Z" fill="#b8c4d2" opacity="0.6"/>
<path d="M32 59 L5 32 L10 32 L32 54Z" fill="#1b222b" opacity="0.8"/>
<path d="M32 59 L59 32 L54 32 L32 54Z" fill="#0f141a" opacity="0.9"/>
<path d="M32 10 L54 32 L32 54 L10 32Z" fill="url(#brandFace)"/>
<path d="M32 10 L54 32 L32 54 L10 32Z" fill="none" stroke="${STORM.bloom}" stroke-width="1" opacity="0.7" filter="url(#glow)"/>
<path d="${BRAND_GLYPH}" fill="${STORM.bloom}" opacity="0.9" filter="url(#bloom)"/>
<path d="${BRAND_GLYPH}" fill="${STORM.mid}" filter="url(#glow)"/>
<path d="${BRAND_GLYPH}" fill="${STORM.white}" transform="translate(32 32) scale(0.62) translate(-32 -32)"/>
${spark(32, 5, 1, STORM.white)}
${spark(59, 32, 1, STORM.white)}
${spark(32, 59, 1, STORM.white)}
${spark(5, 32, 1, STORM.white)}
`);

const WIRE_ANGLE: number = -24;

const livingWire: string = art('storm', `
${halo(10, 44, 12, STORM.bloom, 0.8)}
${halo(54, 22, 13, STORM.bloom, 0.8)}
<g transform="rotate(${WIRE_ANGLE} 32 32)">
<rect x="4" y="26" width="58" height="12" rx="6" fill="${STORM.bloom}" opacity="0.35" filter="url(#bloom)"/>
<path d="${wave(6, 58, 32, 6, 14, 0)}" stroke="${STORM.bloom}" stroke-width="4.4" fill="none" opacity="0.6" filter="url(#bloom)"/>
<path d="${wave(6, 58, 32, 6, 14, Math.PI)}" stroke="${STORM.bloom}" stroke-width="4.4" fill="none" opacity="0.6" filter="url(#bloom)"/>
<path d="${wave(6, 58, 32, 6, 14, 0)}" stroke="${STORM.mid}" stroke-width="2.3" fill="none" filter="url(#glow)"/>
<path d="${wave(6, 58, 32, 6, 14, Math.PI)}" stroke="${STORM.mid}" stroke-width="2.3" fill="none" filter="url(#glow)"/>
<path d="${wave(6, 58, 32, 6, 14, 0)}" stroke="${STORM.white}" stroke-width="0.9" fill="none"/>
<path d="${wave(6, 58, 32, 6, 14, Math.PI)}" stroke="${STORM.white}" stroke-width="0.9" fill="none"/>
<path d="M6 32 L58 32" stroke="${STORM.white}" stroke-width="1.4" filter="url(#glow)"/>
${spark(19, 32, 1.4, STORM.white)}
${spark(32, 32, 1.4, STORM.white)}
${spark(45, 32, 1.4, STORM.white)}
<circle cx="6" cy="32" r="7.5" fill="url(#core)" filter="url(#glow)"/>
<circle cx="6" cy="32" r="3" fill="${STORM.white}"/>
<path d="M6 22 v4 M6 38 v4 M-4 32 h4" stroke="${STORM.pale}" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/>
</g>
${flash(54, 22, 10, STORM.bloom)}
${bolt(jagged([54, 22], [62, 10], [2, -2], 0), 1.1, STORM.bloom, STORM.mid)}
${bolt(jagged([54, 22], [63, 30], [-2, 1.5], 0), 1.1, STORM.bloom, STORM.mid)}
${spark(26, 46, 0.7, STORM.pale)}
${spark(38, 18, 0.7, STORM.pale)}
${spark(46, 40, 0.6, STORM.pale)}
`);

const HERO: string = 'M32 25 C 36 25 40 26 41 29 L45 41 L43 42 L39.5 33 C 40 40 42 48 44 55 L20 55 C 22 48 24 40 24.5 33 L21 42 L19 41 L23 29 C 24 26 28 25 32 25Z';

const standingStorm: string = art('storm', `
${halo(32, 40, 24, STORM.bloom, 0.55)}
${bolt(ring(32, 42, 25, 10, Math.PI * 1.02, Math.PI * 1.98, [0, 1.5, -1, 2, -1.5, 1, -2, 1.5, -1, 2, 0]), 1.6, STORM.bloom, STORM.mid)}
${bolt(ring(32, 30, 18, 7, Math.PI * 1.1, Math.PI * 1.9, [0, -1.5, 1, -1, 1.5, -1, 1, 0]), 1.1, STORM.bloom, STORM.mid)}
${plus(14, 16, 4)}
${plus(50, 12, 3.2)}
<ellipse cx="32" cy="55" rx="12" ry="2.8" fill="#000" opacity="0.55"/>
<path d="${HERO}" fill="#040914"/>
<path d="M23 29 L19 41 M24.5 33 C 24 40 22 48 20 55" stroke="${STORM.mid}" stroke-width="1" fill="none" opacity="0.9" filter="url(#glow)"/>
<path d="M41 29 L45 41 M39.5 33 C 40 40 42 48 44 55" stroke="${STORM.mid}" stroke-width="1" fill="none" opacity="0.9" filter="url(#glow)"/>
<circle cx="32" cy="20" r="4.4" fill="#040914"/>
<path d="M27.8 18.6 A 4.4 4.4 0 0 1 36.2 18.6" stroke="${STORM.pale}" stroke-width="0.9" fill="none" opacity="0.85" filter="url(#glow)"/>
${halo(32, 34, 4.5, STORM.heal, 0.75)}
${spark(32, 34, 1.1, STORM.healPale)}
${bolt(ring(32, 42, 25, 10, Math.PI * 0.02, Math.PI * 0.98, [0, -1.5, 1, -2, 1.5, -1, 2, -1.5, 1, -2, 0]), 2.4, STORM.bloom, STORM.mid)}
${bolt(jagged([10, 46], [2, 58], [2, -2], 0), 1.2, STORM.bloom, STORM.mid)}
${bolt(jagged([54, 46], [62, 58], [-2, 2], 0), 1.2, STORM.bloom, STORM.mid)}
${flash(32, 52, 4.5, STORM.bloom)}
${flash(8, 40, 3.6, STORM.bloom)}
${flash(56, 40, 3.6, STORM.bloom)}
${plus(56, 26, 2.6)}
`);

const AIR_MOTES: readonly (readonly [number, number, number])[] = [
  [11, 21, 0.9],
  [19, 12, 0.7],
  [29, 9, 0.55],
  [45, 12, 0.8],
  [54, 23, 1],
  [8, 36, 0.7],
  [57, 37, 0.8],
  [14, 47, 0.6],
  [51, 47, 0.7],
];

const staticField: string = art('storm', `
${halo(32, 36, 30, STORM.bloom, 0.3)}
${halo(32, 30, 17, STORM.mid, 0.28)}
<ellipse cx="32" cy="55" rx="25" ry="5.5" fill="${STORM.bloom}" opacity="0.3" filter="url(#bloom)"/>
${thread(wave(3, 61, 17, 1.1, 15, 0), STORM.pale, 0.7, 0.32)}
${thread(wave(2, 62, 30, 1.3, 17, 1.4), STORM.pale, 0.8, 0.38)}
${thread(wave(4, 60, 43, 1.1, 13, 2.6), STORM.pale, 0.7, 0.3)}
${thread(jagged([11, 21], [19, 12], [0.9, -0.7], 0), STORM.mid, 0.7, 0.75)}
${thread(jagged([45, 12], [54, 23], [-0.8, 0.9], 0), STORM.mid, 0.7, 0.75)}
${thread(jagged([8, 36], [14, 47], [0.7, -0.8], 0), STORM.mid, 0.6, 0.6)}
${thread(jagged([57, 37], [51, 47], [-0.7, 0.8], 0), STORM.mid, 0.6, 0.6)}
${AIR_MOTES.map(([x, y, r]: readonly [number, number, number]): string => spark(x, y, r, STORM.pale)).join('')}
<ellipse cx="32" cy="55" rx="12" ry="2.8" fill="#000" opacity="0.55"/>
<path d="${HERO}" fill="#040914"/>
<path d="M23 29 L19 41 M24.5 33 C 24 40 22 48 20 55" stroke="${STORM.mid}" stroke-width="0.9" fill="none" opacity="0.8" filter="url(#glow)"/>
<path d="M41 29 L45 41 M39.5 33 C 40 40 42 48 44 55" stroke="${STORM.mid}" stroke-width="0.9" fill="none" opacity="0.8" filter="url(#glow)"/>
<circle cx="32" cy="20" r="4.4" fill="#040914"/>
<path d="M27.8 18.6 A 4.4 4.4 0 0 1 36.2 18.6" stroke="${STORM.pale}" stroke-width="0.9" fill="none" opacity="0.85" filter="url(#glow)"/>
${halo(32, 34, 3.6, STORM.bloom, 0.7)}
${spark(32, 34, 1, STORM.white)}
`);

function streak(tail: Point, bendAt: Point, head: Point, width: number, color: string, opacity: number): string {
  const [hx, hy] = head;
  const [cx, cy] = bendAt;
  const dx: number = hx - cx;
  const dy: number = hy - cy;
  const length: number = Math.hypot(dx, dy);
  const px: number = (-dy / length) * width;
  const py: number = (dx / length) * width;
  const [tx, ty] = tail;
  const d: string = `M${fmt(tx)} ${fmt(ty)}Q${fmt(cx + px)} ${fmt(cy + py)} ${fmt(hx + px)} ${fmt(hy + py)}L${fmt(hx - px)} ${fmt(hy - py)}Q${fmt(cx - px)} ${fmt(cy - py)} ${fmt(tx)} ${fmt(ty)}Z`;
  return `<path d="${d}" fill="${color}" opacity="${fmt(opacity)}" filter="url(#glow)"/>`;
}

const spellStrike: string = art('storm', `
<defs><radialGradient id="strikeDust" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#b59a78"/><stop offset="0.6" stop-color="#6e5a44" stop-opacity="0.8"/><stop offset="1" stop-color="#3a2e22" stop-opacity="0"/></radialGradient></defs>
${halo(40, 38, 18, STORM.bloom, 0.7)}
<path d="M0 62 L64 50 L64 64 L0 64Z" fill="#05070c" opacity="0.6"/>
<ellipse cx="30" cy="56" rx="12" ry="6" fill="url(#strikeDust)" filter="url(#soft)"/>
<ellipse cx="50" cy="54" rx="11" ry="6.5" fill="url(#strikeDust)" filter="url(#soft)"/>
<ellipse cx="40" cy="52" rx="10" ry="7" fill="url(#strikeDust)" filter="url(#soft)"/>
${streak([2, 12], [16, 34], [40, 38], 3.2, STORM.bloom, 0.75)}
${streak([4, 12], [18, 32], [40, 38], 1.6, STORM.pale, 0.95)}
${streak([12, 2], [26, 24], [40, 38], 1.8, STORM.mid, 0.6)}
${streak([0, 30], [18, 40], [40, 38], 1.4, STORM.mid, 0.5)}
<ellipse cx="40" cy="38" rx="11" ry="3.6" fill="none" stroke="${STORM.pale}" stroke-width="1.4" transform="rotate(-30 40 38)" filter="url(#glow)"/>
<ellipse cx="40" cy="38" rx="11" ry="3.6" fill="none" stroke="${STORM.mid}" stroke-width="1.4" transform="rotate(40 40 38)" filter="url(#glow)"/>
<ellipse cx="40" cy="38" rx="9" ry="3" fill="none" stroke="${STORM.white}" stroke-width="1" transform="rotate(95 40 38)"/>
${flash(40, 38, 10, STORM.bloom)}
<path d="M30 60 l-6 -5 M36 56 l-3 -8 M46 56 l4 -8 M52 58 l7 -4" stroke="#c7ad86" stroke-width="1.1" stroke-linecap="round" opacity="0.7"/>
<path d="M22 50 l2.4 -1.6 1.4 1.8 -2.4 1.2z M56 48 l2.2 -1.8 1.6 1.6 -2.2 1.4z M44 47 l1.6 -1.2 1.2 1.2 -1.6 1z" fill="#2a2016"/>
${spark(54, 26, 0.8, STORM.pale)}
${spark(28, 40, 0.7, STORM.pale)}
${spark(58, 40, 0.6, STORM.pale)}
`);

export const STORM_ART: ReadonlyMap<string, string> = new Map<string, string>([
  ['storm_bolt_lance', stormBoltLance],
  ['storm_bolt_echo', stormBoltEcho],
  ['forkline', forkline],
  ['squall', squall],
  ['thunderhead', thunderhead],
  ['thunderhead_leap', thunderheadLeap],
  ['static_brand', staticBrand],
  ['living_wire', livingWire],
  ['standing_storm', standingStorm],
  ['static_field', staticField],
  ['spell_strike', spellStrike],
]);
