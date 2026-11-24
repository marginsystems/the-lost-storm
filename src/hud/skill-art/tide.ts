import { art, fire, halo, spark } from './kit.ts';

const WAVE = 'M0 60 C 16 58 26 50 31 38 C 35 26 41 16 50 13 C 58 11 63 17 62 23 C 61 28 56 31 53 27 C 51 24 47 26 45 32 C 43 40 48 50 64 54 L64 62 L0 62Z';

type Taper = 'comet' | 'lens';

interface Sweep {
  readonly cx: number;
  readonly cy: number;
  readonly r0: number;
  readonly r1: number;
  readonly a0: number;
  readonly a1: number;
  readonly width: number;
  readonly squash: number;
  readonly taper: Taper;
}

const STEPS = 56;

function n(value: number): string {
  return value.toFixed(2);
}

const TAPERS: Readonly<Record<Taper, (t: number) => number>> = {
  comet: (t: number): number => Math.pow(t, 0.9),
  lens: (t: number): number => Math.sin(Math.PI * t),
};

function point(sweep: Sweep, t: number, inset: number): string {
  const angle: number = ((sweep.a0 + (sweep.a1 - sweep.a0) * t) * Math.PI) / 180;
  const radius: number = sweep.r0 + (sweep.r1 - sweep.r0) * t - inset;
  return `${n(sweep.cx + radius * Math.cos(angle))} ${n(sweep.cy + radius * sweep.squash * Math.sin(angle))}`;
}

function band(sweep: Sweep): string {
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= STEPS; i += 1) {
    const t: number = i / STEPS;
    outer.push(point(sweep, t, 0));
    inner.push(point(sweep, t, sweep.width * TAPERS[sweep.taper](t)));
  }
  return `M${outer.join(' L')} L${inner.toReversed().join(' L')}Z`;
}

function line(sweep: Sweep, from: number, to: number): string {
  const points: string[] = [];
  for (let i = 0; i <= STEPS; i += 1) {
    points.push(point(sweep, from + ((to - from) * i) / STEPS, 0));
  }
  return `M${points.join(' L')}`;
}

function axe(x: number, y: number, angle: number, scale: number, edge: string): string {
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale}) translate(-30 -32)">
<rect x="27.6" y="10" width="4.8" height="50" rx="2.2" fill="url(#wood)"/>
<rect x="27.2" y="50" width="5.6" height="9" rx="1.6" fill="url(#leather)"/>
<path d="M32 12 C 46 6 56 16 55 34 C 50 28 42 26 32 28Z" fill="url(#steel)"/>
<path d="M32 12 C 40 10 46 13 50 18 L 40 22 L32 21Z" fill="#ffffff" opacity="0.35"/>
<path d="M55 34 C 56 18 48 8 38 9" stroke="${edge}" stroke-width="1.6" fill="none" filter="url(#glow)"/>
<path d="M28 14 C 21 13 17 17 16 23 C 20 21.6 24 21.6 28 23Z" fill="url(#iron)"/>
<rect x="26.6" y="11" width="6.8" height="18" rx="1.4" fill="url(#iron)"/>
<circle cx="30" cy="16" r="1.2" fill="#c9d2dc"/><circle cx="30" cy="24" r="1.2" fill="#c9d2dc"/>
</g>`;
}

function wheelAxe(x: number, y: number, angle: number, scale: number): string {
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale}) translate(-30 -60)">
<rect x="27.2" y="10" width="5.6" height="50" rx="2.2" fill="url(#wood)"/>
<path d="M32 12 C 46 6 56 16 55 34 C 50 28 42 26 32 28Z" fill="url(#steel)"/>
<path d="M32 12 C 40 10 46 13 50 18 L 40 22 L32 21Z" fill="#ffffff" opacity="0.35"/>
<path d="M55 34 C 56 18 48 8 38 9" stroke="#dffff8" stroke-width="2" fill="none" filter="url(#glow)"/>
<rect x="26.6" y="11" width="6.8" height="18" rx="1.4" fill="url(#iron)"/>
<circle cx="30" cy="16" r="1.4" fill="#c9d2dc"/><circle cx="30" cy="24" r="1.4" fill="#c9d2dc"/>
</g>`;
}

function roller(x: number, y: number, scale: number, angle: number, opacity: number, light: string, body: string): string {
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})" opacity="${opacity}">
<path d="M2 -23 C -6 -24 -13 -20 -24 -22 C -20 -16 -17 -12 -21 -6 C -13 -8 -8 -8 -3 -6Z" fill="${body}" opacity="0.8"/>
<path d="M-5 -8 L-9 -1.4 L-17 -0.4" stroke="${body}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M-5 -8 L1 -18" stroke="${body}" stroke-width="12" fill="none" stroke-linecap="round"/>
<path d="M-4 -8 L7 -10.4 L8.4 -1.4" stroke="${body}" stroke-width="7.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M8.4 -1 L13.6 -0.6" stroke="${body}" stroke-width="4.4" stroke-linecap="round"/>
<path d="M3 -17 L11 -13 L16 -15.4" stroke="${body}" stroke-width="4.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M0.6 -21 C 0 -27 5 -31 10 -29 C 12.6 -27.4 12.6 -22 10 -19 C 7 -17 2 -17.6 0.6 -21Z" fill="${body}"/>
<path d="M-11 -10 L-4 -23 C -2 -28 4 -32 10.4 -29.8" stroke="${light}" stroke-width="1.6" fill="none" stroke-linecap="round" filter="url(#glow)"/>
<path d="M12.6 -26 C 13.6 -23.6 13 -21 11.6 -19.4" stroke="${light}" stroke-width="1.1" fill="none" stroke-linecap="round"/>
</g>`;
}

function drops(list: readonly (readonly [number, number, number])[], color: string): string {
  return list.map(([x, y, r]: readonly [number, number, number]): string => spark(x, y, r, color)).join('');
}

const whirlBack: Sweep = { cx: 32, cy: 36, r0: 29, r1: 29, a0: 150, a1: 350, width: 6, squash: 0.46, taper: 'comet' };
const whirlFront: Sweep = { cx: 32, cy: 36, r0: 29, r1: 29, a0: -20, a1: 170, width: 9, squash: 0.46, taper: 'comet' };

function whirlArc(sweep: Sweep, opacity: number): string {
  return `<g transform="rotate(-14 32 36)" opacity="${opacity}"><path d="${band({ ...sweep, width: sweep.width + 4 })}" fill="#7fb8e8" opacity="0.5" filter="url(#bloom)"/>
<path d="${band(sweep)}" fill="#cfe6fa" opacity="0.65"/>
<path d="${band({ ...sweep, width: sweep.width * 0.4 })}" fill="#ffffff" opacity="0.85"/>
<path d="${line(sweep, 0.3, 1)}" stroke="#ffffff" stroke-width="1" fill="none" filter="url(#glow)"/></g>`;
}

const cleaveWhirl: string = art('steel', `
${halo(32, 34, 20, '#7fb8e8', 0.4)}
${whirlArc(whirlBack, 0.6)}
${axe(31, 30, -62, 0.8, '#ffffff')}
${whirlArc(whirlFront, 1)}
${spark(5.8, 44.5, 1.4, '#ffffff')}
${halo(5.8, 44.5, 4, '#ffffff', 0.7)}
<path d="M10 22 l-4 -2 M54 14 l4 -3 M58 52 l4 2" stroke="#cfe6fa" stroke-width="1" stroke-linecap="round" opacity="0.6"/>
`);

const millStream: Sweep = { cx: 32, cy: 32, r0: 27, r1: 27, a0: -170, a1: 10, width: 7, squash: 1, taper: 'lens' };
const millStreamB: Sweep = { cx: 32, cy: 32, r0: 27, r1: 27, a0: 10, a1: 150, width: 6, squash: 1, taper: 'comet' };

function waterArc(sweep: Sweep): string {
  return `<path d="${band({ ...sweep, width: sweep.width + 3 })}" fill="#2fd0bd" opacity="0.45" filter="url(#bloom)"/>
<path d="${band(sweep)}" fill="url(#energy)" opacity="0.85"/>
<path d="${line(sweep, 0.15, 0.95)}" stroke="#dffff8" stroke-width="1.1" fill="none" filter="url(#glow)"/>`;
}

const cleaveMillwheel: string = art('tide', `
${halo(32, 32, 20, '#2fd0bd', 0.5)}
${waterArc(millStream)}
${waterArc(millStreamB)}
${wheelAxe(32, 32, 15, 0.46)}
${wheelAxe(32, 32, 105, 0.46)}
${wheelAxe(32, 32, 195, 0.46)}
${wheelAxe(32, 32, 285, 0.46)}
<circle cx="32" cy="32" r="5.4" fill="url(#iron)"/>
<circle cx="32" cy="32" r="2" fill="#c9d2dc"/>
${drops([[11, 52, 1.2], [7, 46, 0.9], [15, 58, 0.8], [52, 9, 1.1], [57, 14, 0.8]], '#dffff8')}
`);

const heaveArc: Sweep = { cx: 32, cy: 30, r0: 22, r1: 28, a0: 150, a1: -40, width: 13, squash: 0.95, taper: 'comet' };

const cleaveHeave: string = art('fire', `
${halo(26, 40, 20, '#ff5a12', 0.7)}
<path d="M0 54 C 20 50 44 50 64 54 L64 64 L0 64Z" fill="#0a0302" opacity="0.6"/>
<path d="${band({ ...heaveArc, width: 18 })}" fill="#ff4a0a" opacity="0.6" filter="url(#bloom)"/>
<path d="${band(heaveArc)}" fill="url(#flameFill)"/>
<path d="${band({ ...heaveArc, width: 6 })}" fill="#ffe07a"/>
<path d="${line(heaveArc, 0.25, 1)}" stroke="#fffbe6" stroke-width="1.4" fill="none" filter="url(#glow)"/>
${fire(10, 46, 12, 3.4, -3)}
${fire(20, 55, 12, 3.6, -2)}
${fire(34, 57, 9, 3, 0)}
${axe(36, 28, 40, 0.92, '#ffb43a')}
${spark(4, 26, 0.9, '#ffd27a')}
${spark(8, 16, 0.7, '#ffe9b8')}
${spark(58, 50, 0.8, '#ffb43a')}
${spark(50, 58, 0.6, '#ffd27a')}
`);

const millrace: string = art('tide', `
<defs><linearGradient id="millraceTube" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#03120f" stop-opacity="0"/><stop offset="1" stop-color="#03120f" stop-opacity="0.75"/></linearGradient></defs>
${halo(42, 28, 18, '#2fd0bd', 0.55)}
<path d="M0 58 C 20 56 40 54 64 56 L64 64 L0 64Z" fill="#010806" opacity="0.6"/>
<path d="M0 58 C 10 56 16 52 20 46 C 23 42 28 42 30 46 C 26 46 24 50 26 56Z" fill="#1aa597" opacity="0.7"/>
<path d="${WAVE}" fill="#2fd0bd" opacity="0.5" filter="url(#bloom)"/>
<path d="${WAVE}" fill="url(#energy)"/>
<path d="M45 32 C 43 40 48 50 64 54 L64 58 C 50 56 42 48 45 32Z" fill="url(#millraceTube)"/>
<path d="M51 24 C 49 22 46 25 45 31 C 48 27 50 26 53 27Z" fill="#03120f" opacity="0.6"/>
<path d="M26 44 C 30 34 34 22 44 15 C 50 11 58 12 61 18 C 63 23 60 28 55 28" stroke="#f4fffc" stroke-width="2.4" fill="none" stroke-linecap="round" filter="url(#glow)"/>
<path d="M8 55 C 16 52 22 46 26 40" stroke="#dffff8" stroke-width="1" fill="none" opacity="0.55"/>
${drops([[62, 9, 1.2], [58, 5, 0.9], [63, 32, 1.1], [60, 38, 0.8], [52, 6, 0.7], [36, 14, 0.8]], '#dffff8')}
<path d="M3 40 h9 M1 34 h6 M6 46 h7" stroke="#9ff0e2" stroke-width="1.1" stroke-linecap="round" opacity="0.55"/>
`);

const rollPath: Sweep = { cx: 30, cy: 72, r0: 38, r1: 35, a0: 196, a1: 305, width: 8, squash: 1, taper: 'comet' };

const dodgeRoll: string = art('steel', `
<path d="M0 57 C 20 54 44 54 64 57 L64 64 L0 64Z" fill="#000" opacity="0.55"/>
${halo(38, 30, 17, '#9fc4e8', 0.55)}
${halo(40, 27, 8, '#f4f9ff', 0.4)}
<path d="${band({ ...rollPath, width: 13 })}" fill="#7fb8e8" opacity="0.45" filter="url(#bloom)"/>
<path d="${band(rollPath)}" fill="#eaf6ff" opacity="0.9"/>
<path d="${line(rollPath, 0.25, 1)}" stroke="#ffffff" stroke-width="1.2" fill="none" filter="url(#glow)"/>
${roller(19, 47, 0.62, -6, 0.2, '#cfe6fa', '#9fc4e8')}
${roller(28, 42, 0.7, 6, 0.38, '#cfe6fa', '#9fc4e8')}
${roller(39, 40, 0.8, 20, 1, '#f4f9ff', '#0b1016')}
<path d="M2 28 h8 M1 35 h6" stroke="#cfe6fa" stroke-width="1.3" stroke-linecap="round" opacity="0.4"/>
<circle cx="8" cy="57" r="3.2" fill="#8a96a8" opacity="0.45" filter="url(#soft)"/>
<circle cx="14" cy="58.5" r="2.4" fill="#8a96a8" opacity="0.4" filter="url(#soft)"/>
<circle cx="3" cy="59" r="1.8" fill="#8a96a8" opacity="0.35" filter="url(#soft)"/>
${spark(57, 24, 0.9, '#ffffff')}
${spark(52, 12, 0.6, '#eaf6ff')}
`);

const ripSpiral: Sweep = { cx: 46, cy: 52, r0: 16, r1: 2, a0: 0, a1: 620, width: 3.4, squash: 0.4, taper: 'lens' };
const surge: Sweep = { cx: 34, cy: 66, r0: 32, r1: 30, a0: 186, a1: 282, width: 10, squash: 1, taper: 'comet' };

const dodgeRollRiptide: string = art('tide', `
${halo(46, 52, 14, '#2fd0bd', 0.65)}
${halo(30, 26, 13, '#dffff8', 0.55)}
${halo(30, 28, 18, '#2fd0bd', 0.5)}
<path d="${band({ ...ripSpiral, width: 5 })}" fill="#2fd0bd" opacity="0.5" filter="url(#bloom)"/>
<path d="${band(ripSpiral)}" fill="#9ff5e6"/>
<ellipse cx="46" cy="52" rx="2.4" ry="1.2" fill="#03120f"/>
<path d="${band({ ...surge, width: 14 })}" fill="#2fd0bd" opacity="0.45" filter="url(#bloom)"/>
<path d="${band(surge)}" fill="url(#energy)"/>
<path d="${line(surge, 0.2, 1)}" stroke="#f4fffc" stroke-width="1.4" fill="none" filter="url(#glow)"/>
${roller(30, 35, 1, 8, 1, '#dffff8', '#0b1016')}
${drops([[8, 30, 1], [6, 40, 0.8], [14, 22, 0.8], [22, 12, 0.7], [56, 30, 0.8], [58, 40, 0.7]], '#dffff8')}
`);

function spiralArm(offset: number): string {
  const sweep: Sweep = { cx: 32, cy: 34, r0: 28, r1: 3, a0: offset, a1: offset + 420, width: 6, squash: 0.7, taper: 'lens' };
  return `<path d="${band({ ...sweep, width: 8 })}" fill="#2fd0bd" opacity="0.35" filter="url(#bloom)"/>
<path d="${band(sweep)}" fill="url(#energy)"/>
<path d="${line(sweep, 0.1, 0.85)}" stroke="#dffff8" stroke-width="0.9" fill="none" opacity="0.85"/>`;
}

const downdraught: string = art('tide', `
<ellipse cx="32" cy="34" rx="29" ry="21" fill="#010806" opacity="0.55"/>
${spiralArm(0)}
${spiralArm(120)}
${spiralArm(240)}
<ellipse cx="32" cy="34" rx="5" ry="3.4" fill="#000"/>
<ellipse cx="32" cy="34" rx="6" ry="4.2" fill="none" stroke="#dffff8" stroke-width="0.8" opacity="0.7" filter="url(#glow)"/>
${drops([[10, 20, 0.9], [54, 18, 0.8], [56, 48, 0.9], [8, 44, 0.7]], '#dffff8')}
`);

const breaker: string = art('tide', `
${halo(32, 40, 22, '#2fd0bd', 0.75)}
<path d="M0 54 C 20 50 44 50 64 54 L64 64 L0 64Z" fill="#010806" opacity="0.6"/>
<path d="M32 42 L4 22 M32 42 L60 22 M32 42 L18 4 M32 42 L46 4" stroke="#9ff5e6" stroke-width="1" opacity="0.4" filter="url(#glow)"/>
<g transform="translate(29 9.6) scale(0.52 0.72)">
<path d="${WAVE}" fill="#2fd0bd" opacity="0.5" filter="url(#bloom)"/>
<path d="${WAVE}" fill="url(#energy)"/>
<path d="M26 44 C 30 34 34 22 44 15 C 50 11 58 12 61 18 C 63 23 60 28 55 28" stroke="#f4fffc" stroke-width="3" fill="none" stroke-linecap="round"/>
</g>
<g transform="translate(35 9.6) scale(-0.52 0.72)">
<path d="${WAVE}" fill="#2fd0bd" opacity="0.5" filter="url(#bloom)"/>
<path d="${WAVE}" fill="url(#energy)"/>
<path d="M26 44 C 30 34 34 22 44 15 C 50 11 58 12 61 18 C 63 23 60 28 55 28" stroke="#f4fffc" stroke-width="3" fill="none" stroke-linecap="round"/>
</g>
<path d="M28 52 C 28 38 30 24 32 12 C 34 24 36 38 36 52Z" fill="url(#energy)" filter="url(#glow)"/>
<ellipse cx="32" cy="50" rx="20" ry="5" fill="#2fd0bd" opacity="0.65" filter="url(#bloom)"/>
<ellipse cx="32" cy="48" rx="8" ry="5" fill="url(#core)" filter="url(#glow)"/>
${drops([[3, 16, 1], [61, 16, 1], [10, 8, 0.8], [54, 8, 0.8], [32, 6, 1.1], [24, 10, 0.7], [40, 10, 0.7]], '#dffff8')}
`);

export const TIDE_ART: ReadonlyMap<string, string> = new Map<string, string>([
  ['cleave_whirl', cleaveWhirl],
  ['cleave_millwheel', cleaveMillwheel],
  ['cleave_heave', cleaveHeave],
  ['millrace', millrace],
  ['dodge_roll', dodgeRoll],
  ['dodge_roll_riptide', dodgeRollRiptide],
  ['downdraught', downdraught],
  ['downdraught_updraught', breaker],
]);
