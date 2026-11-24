import { art, halo, spark } from './kit.ts';

interface Point {
  readonly x: number;
  readonly y: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function polyline(points: readonly Point[]): string {
  return points.map((point: Point, index: number): string => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`).join(' ');
}

function spiral(cx: number, cy: number, outer: number, inner: number, turns: number, start: number): readonly Point[] {
  const steps: number = Math.round(turns * 36);
  const points: Point[] = [];
  for (let step: number = 0; step <= steps; step += 1) {
    const t: number = step / steps;
    const angle: number = start + t * turns * Math.PI * 2;
    const radius: number = outer + (inner - outer) * t;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return points;
}

function bolt(x: number, y: number, angle: number, length: number, thick: number, trail: number): string {
  const h: number = thick;
  const tip: number = round(length + h * 5);
  const shaft: string = `<rect x="0" y="${round(-h * 0.45)}" width="${length}" height="${round(h * 0.9)}" rx="${round(h * 0.4)}" fill="#5a3820"/>`
    + `<rect x="0" y="${round(-h * 0.45)}" width="${length}" height="${round(h * 0.32)}" fill="#d0a070" opacity="0.75"/>`;
  const head: string = `<path d="M${round(length - h * 0.4)} ${round(-h * 1.9)} L${tip} 0 L${round(length - h * 0.4)} ${round(h * 1.9)} L${round(length + h * 0.9)} 0Z" fill="#1a1426"/>`
    + `<path d="M${round(length - h * 0.2)} ${round(-h * 1.6)} L${tip} 0 L${round(length + h * 0.9)} 0Z" fill="url(#steel)"/>`
    + `<path d="M${round(length - h * 0.2)} ${round(h * 1.6)} L${tip} 0 L${round(length + h * 0.9)} 0Z" fill="#6a7486"/>`;
  const fletch: string = `<path d="M${round(h * 0.4)} ${round(-h * 0.45)} L${round(-h * 1.2)} ${round(-h * 2.4)} C ${round(h * 1.5)} ${round(-h * 2.3)} ${round(h * 4)} ${round(-h * 1.4)} ${round(h * 5.6)} ${round(-h * 0.45)}Z" fill="#a47cff"/>`
    + `<path d="M${round(h * 0.4)} ${round(h * 0.45)} L${round(-h * 1.2)} ${round(h * 2.4)} C ${round(h * 1.5)} ${round(h * 2.3)} ${round(h * 4)} ${round(h * 1.4)} ${round(h * 5.6)} ${round(h * 0.45)}Z" fill="#4a2894"/>`;
  const streak: string = trail > 0
    ? `<path d="M${round(h * 3)} ${round(-h * 1.5)} L${-trail} 0 L${round(h * 3)} ${round(h * 1.5)}Z" fill="url(#energyX)" opacity="0.8" filter="url(#glow)"/>`
      + `<path d="M${length} ${round(-h * 0.3)} L${-trail * 0.6} 0 L${length} ${round(h * 0.3)}Z" fill="#f0e8ff" opacity="0.5"/>`
    : '';
  return `<g transform="translate(${x} ${y}) rotate(${angle})">${streak}${shaft}${fletch}${head}</g>`;
}

function crossbow(x: number, y: number, angle: number, scale: number, drawn: boolean, loaded: string): string {
  const string: string = drawn
    ? `<path d="M5 -21 L-9 0 L5 21" stroke="#2a1848" stroke-width="1.8" fill="none"/><path d="M5 -21 L-9 0 L5 21" stroke="#efe6ff" stroke-width="0.8" fill="none"/>`
    : `<path d="M5 -21 Q 9 0 5 21" stroke="#2a1848" stroke-width="1.8" fill="none"/><path d="M5 -21 Q 9 0 5 21" stroke="#efe6ff" stroke-width="0.8" fill="none"/>`;
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})">
<path d="M-26 -4.6 C -22 -4.2 -16 -3.2 -10 -3 L 22 -2.4 L 22 2.4 L -10 3 C -16 3.2 -22 4.2 -26 4.6 C -28 2 -28 -2 -26 -4.6Z" fill="#1a0e08"/>
<path d="M-25.4 -3.8 C -22 -3.6 -16 -2.6 -10 -2.4 L 21.4 -1.8 L 21.4 1.8 L -10 2.4 C -16 2.6 -22 3.6 -25.4 3.8 C -26.8 1.6 -26.8 -1.6 -25.4 -3.8Z" fill="url(#wood)"/>
<path d="M-25 -3.4 C -20 -3 -14 -2.2 -10 -2.1 L 21 -1.6 L 21 -0.7 L -25.6 -1.2Z" fill="#e0b080" opacity="0.45"/>
<path d="M-8 -0.5 L 21 -0.4 L 21 0.4 L -8 0.5Z" fill="#1a0e08" opacity="0.7"/>
<path d="M-13 -3.8 h6 v7.6 h-6z" fill="url(#iron)"/>
<path d="M-13 -3.8 h6 v1.4 h-6z" fill="#e6ecf2" opacity="0.6"/>
<path d="M5 -21 C 14 -18 21 -8 21 0 C 21 8 14 18 5 21" stroke="#120a1e" stroke-width="5.6" fill="none" stroke-linecap="round"/>
<path d="M5 -21 C 14 -18 21 -8 21 0 C 21 8 14 18 5 21" stroke="url(#steel)" stroke-width="3.8" fill="none" stroke-linecap="round"/>
<path d="M7 -19 C 15 -15 19.6 -7 19.8 0" stroke="#f4f8ff" stroke-width="0.9" fill="none" opacity="0.8"/>
<rect x="15" y="-4.4" width="8" height="8.8" rx="1.4" fill="url(#iron)"/>
<rect x="15" y="-4.4" width="8" height="2" rx="1" fill="#e6ecf2" opacity="0.55"/>
${string}
${loaded}
</g>`;
}

function wisp(x: number, y: number, angle: number, length: number, size: number, bend: number): string {
  const tail: string = `M0 ${-size} C ${round(-length * 0.3)} ${round(-size * 1.7)} ${round(-length * 0.6)} ${round(bend - size)} ${-length} ${bend} C ${round(-length * 0.6)} ${round(bend + size * 0.8)} ${round(-length * 0.3)} ${round(size * 1.3)} 0 ${size}Z`;
  const motes: string = [0.35, 0.6, 0.85].map((t: number, index: number): string => spark(round(-length * t), round(bend * t * t + (index % 2 === 0 ? 2.2 : -2.2)), 0.45, '#e4d4ff')).join('');
  return `<g transform="translate(${x} ${y}) rotate(${angle})">
<path d="${tail}" fill="#9a6cff" opacity="0.6" filter="url(#bloom)"/>
<path d="${tail}" fill="url(#energyX)" filter="url(#glow)"/>
${motes}
<circle cx="0" cy="0" r="${round(size * 1.5)}" fill="url(#core)" filter="url(#glow)"/>
<circle cx="0" cy="0" r="${round(size * 0.6)}" fill="#ffffff"/>
</g>`;
}

function dust(points: readonly Point[], color: string): string {
  return points.map((point: Point, index: number): string => spark(point.x, point.y, index % 2 === 0 ? 0.6 : 0.45, color)).join('');
}

const strider: string = 'M31 13 C 35 9.6 41 7.4 45.6 9.6 L 49 14.6 C 47.4 15 46.4 17 46 20 C 48 23 51 25 54 27 L 58.5 29.6 C 60 30.6 59.4 33 57.4 32.6 L 50 30.5 C 48 33 47 36 47 39 C 50 41 52 44 53 47 L 57 54 C 59 55 60 57 58 58 L 52 58 C 51 56 50 54 49 51 L 45 46 C 43 45 41 45 39 46 L 33 51 L 27 57 C 25 58 22 57 23 55 L 29 48 C 31 45 32 42 33 39 C 29 38 25 40 19 41 C 23 38 24 36 21 34 C 25 33 27 31 19 28 C 25 27 27 25 20 21 C 26 21 29 19 31 16Z';

const shadowStep: string = art('shadow', `
${halo(20, 34, 18, '#9a6cff', 0.8)}
${halo(46, 36, 15, '#7a4ae0', 0.55)}
<path d="M21 2 C 31 16 31 44 18 64 C 11 44 11 18 21 2Z" fill="#b48cff" opacity="0.85" filter="url(#bloom)"/>
<path d="M21 4 C 28 18 28 44 18 62 C 13 44 13 20 21 4Z" fill="#e4d4ff" filter="url(#glow)"/>
<path d="M21 7 C 26 20 26 42 18.6 59 C 15 44 15 22 21 7Z" fill="#06030c"/>
<path d="${strider}" fill="#c9a8ff" filter="url(#glow)"/>
<path d="${strider}" fill="#07040e"/>
<path d="M40 10.6 C 43 10 46 11.4 47.6 14.6 C 45 15 43 16.6 42 19 C 41.4 16 40.8 13 40 10.6Z" fill="#241440"/>
<path d="M44 16.6 L 46.8 16" stroke="#f0e8ff" stroke-width="1.1" stroke-linecap="round" filter="url(#glow)"/>
<path d="M56.6 32.4 L 59.4 32.8 L 57.4 43 Z" fill="url(#steel)"/>
<path d="M58.9 33 L 57.4 43" stroke="#d8c4ff" stroke-width="0.7" filter="url(#glow)"/>
<path d="M49 22 l6 -3 M50 38 l8 1 M57 47 l6 1" stroke="#e4d4ff" stroke-width="1" stroke-linecap="round" opacity="0.75"/>
<path d="M58.6 15 l3.6 -2.8 1.6 2.2 -3.4 2.2z M60 50 l3.2 1.6 -1.2 2.4 -3.2 -1.6z" fill="#3a2264" stroke="#c9a8ff" stroke-width="0.5"/>
`);

const mistStep: string = art('echo', `
${halo(41, 24, 18, '#b3a6ff', 0.85)}
${halo(12, 52, 12, '#b3a6ff', 0.55)}
${[{ x: 8, y: 54, r: 7 }, { x: 16, y: 50, r: 5.5 }, { x: 5, y: 45, r: 4.5 }, { x: 18, y: 58, r: 5 }, { x: 10, y: 61, r: 6 }, { x: 24, y: 46, r: 3.6 }].map((puff: { readonly x: number; readonly y: number; readonly r: number }): string => `<circle cx="${puff.x}" cy="${puff.y}" r="${puff.r}" fill="#e2dcff" opacity="0.5" filter="url(#soft)"/>`).join('')}
<path d="M10 54 C 14 44 20 40 28 40 C 35 40 38 35 38 30" stroke="#b3a6ff" stroke-width="12" fill="none" stroke-linecap="round" opacity="0.35" filter="url(#bloom)"/>
<path d="M10 54 C 14 44 20 40 28 40 C 35 40 38 35 38 30" stroke="#e6e0ff" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.55" filter="url(#soft)"/>
<path d="${polyline(spiral(41, 24, 16, 2, 1.6, 2.4))}" stroke="#b3a6ff" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.5" filter="url(#bloom)"/>
<path d="${polyline(spiral(41, 24, 15, 2, 1.6, 2.4))}" stroke="#f7f4ff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85" filter="url(#soft)"/>
<path d="${polyline(spiral(41, 24, 11, 1, 1.3, 5.2))}" stroke="#ffffff" stroke-width="1.4" fill="none" stroke-linecap="round" filter="url(#glow)"/>
<circle cx="41" cy="24" r="7" fill="url(#core)" filter="url(#glow)"/>
<circle cx="41" cy="24" r="2.4" fill="#ffffff"/>
<path d="M56 6 C 60 8 62 12 62 16 M62 32 C 61 38 58 42 54 44" stroke="#f7f4ff" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.7" filter="url(#glow)"/>
<path d="M59 3 l3 -1.4 0.8 2 -3 1z M61 45 l2.4 1.6 -1.2 1.6 -2.2 -1.4z M26 6 l-2.6 -1.6 -1 1.8 2.6 1.2z" fill="#2a2450" stroke="#d8d0ff" stroke-width="0.4"/>
${dust([{ x: 22, y: 36 }, { x: 4, y: 38 }, { x: 28, y: 50 }, { x: 30, y: 44 }], '#f7f4ff')}
`);

function tendril(deg: number, reach: number, bend: number): string {
  const tip: number = 20 - reach;
  return `<g transform="rotate(${deg} 32 32)"><path d="M26.5 21 C 26.5 ${round(20 - reach * 0.45)} ${round(32 + bend * 0.2)} ${round(20 - reach * 0.55)} ${round(32 + bend * 1.6)} ${tip} C ${round(34 + bend * 0.5)} ${round(20 - reach * 0.5)} 37.5 ${round(20 - reach * 0.3)} 37.5 21Z" fill="#0a0614" stroke="#a47cff" stroke-width="0.6"/></g>`;
}

const umbra: string = art('shadow', `
<defs><radialGradient id="umbra_throat" cx="0.5" cy="0.55" r="0.5"><stop offset="0" stop-color="#7a4ae0"/><stop offset="0.55" stop-color="#2a1250"/><stop offset="1" stop-color="#05020a"/></radialGradient>
<linearGradient id="umbra_fang" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b9a0f0"/></linearGradient></defs>
${halo(32, 32, 26, '#9a6cff', 0.95)}
${tendril(0, 17, 5)}${tendril(38, 11, -4)}${tendril(78, 16, 6)}${tendril(122, 12, 4)}${tendril(160, 17, -6)}${tendril(204, 11, 5)}${tendril(242, 16, 5)}${tendril(288, 12, -4)}${tendril(322, 15, 6)}
<circle cx="32" cy="32" r="16" fill="#0a0614"/>
<circle cx="32" cy="32" r="14.6" fill="none" stroke="#c9a8ff" stroke-width="1.2" filter="url(#glow)"/>
<path d="M18.6 32 C 18.6 22 26 19 32 19 C 38 19 45.4 22 45.4 32 C 45.4 42 38 45 32 45 C 26 45 18.6 42 18.6 32Z" fill="url(#umbra_throat)"/>
<path d="M21 26 L 22.6 27.4 L 24.6 34.4 L 26.6 25 L 28.4 29.6 L 30.2 23.6 L 32 30.4 L 33.8 23.6 L 35.6 29.6 L 37.4 25 L 39.4 34.4 L 41.4 27.4 L 43 26 C 40 20.6 24 20.6 21 26Z" fill="url(#umbra_fang)"/>
<path d="M22 38.6 L 24 37 L 26.2 31 L 27.8 39.6 L 29.6 35.2 L 31 41.4 L 32.4 34.6 L 33.8 41.4 L 35.4 35.2 L 37 39.6 L 38.4 31 L 40.6 37 L 42.4 38.6 C 39 44.6 25 44.6 22 38.6Z" fill="url(#umbra_fang)" opacity="0.85"/>
`);

const quarrel: string = art('shadow', `
${halo(46, 20, 16, '#9a6cff', 0.75)}
${halo(16, 48, 12, '#7a4ae0', 0.5)}
<g transform="translate(16 49) rotate(-40)">
${crossbow(0, 0, 0, 0.66, false, '')}
<ellipse cx="34" cy="0" rx="3" ry="10" fill="#07040e" stroke="#9a6cff" stroke-width="0.8"/>
${bolt(22, 0, 0, 20, 2, 18)}
<ellipse cx="34" cy="0" rx="3.4" ry="11" fill="none" stroke="#b48cff" stroke-width="3" opacity="0.7" filter="url(#bloom)"/>
<path d="M34 -10 A 3 10 0 0 1 34 10" fill="none" stroke="#f0e8ff" stroke-width="1.1" filter="url(#glow)"/>
<path d="M40 -6 l4 -3.4 1 1.6z M41 6 l5 2.4 -1.4 1.2z M46 -1.6 l4 -1 0 1.6z" fill="#d8c4ff"/>
${spark(52, 0, 1.4, '#ffffff')}
</g>
`);

function fanBolt(angle: number, radius: number): string {
  const rad: number = angle * Math.PI / 180;
  return bolt(round(Math.cos(rad) * radius), round(Math.sin(rad) * radius), angle, 13, 1.8, 18);
}

const quarrelFan: string = art('shadow', `
${halo(40, 26, 20, '#9a6cff', 0.6)}
<g transform="translate(12 52) rotate(-42)">
${crossbow(0, 0, 0, 0.62, false, '')}
${fanBolt(-34, 30)}
${fanBolt(0, 32)}
${fanBolt(34, 30)}
</g>
`);

const quarrelHeave: string = art('shadow', `
${halo(36, 30, 24, '#9a6cff', 0.95)}
<g transform="translate(15 49) rotate(-40)">
<path d="M5 -21 L-9 0 L5 21" stroke="#b48cff" stroke-width="3.4" fill="none" opacity="0.8" filter="url(#bloom)"/>
${crossbow(0, 0, 0, 0.98, true, '')}
<path d="M-9 0 L 36 0" stroke="#9a6cff" stroke-width="9" stroke-linecap="round" opacity="0.7" filter="url(#bloom)"/>
${bolt(-9, 0, 0, 30, 3.2, 0)}
<path d="M-6 -0.6 L 28 -0.6" stroke="#f0e8ff" stroke-width="0.9" opacity="0.8" filter="url(#glow)"/>
<ellipse cx="25" cy="0" rx="2" ry="7" fill="none" stroke="#e4d4ff" stroke-width="1.1" filter="url(#glow)"/>
<ellipse cx="17" cy="0" rx="1.6" ry="5.4" fill="none" stroke="#b48cff" stroke-width="0.9" opacity="0.8" filter="url(#glow)"/>
<circle cx="40" cy="0" r="9" fill="url(#core)" filter="url(#glow)"/>
<path d="M33 -4 L 44 0 L 33 4 L 35.4 0Z" fill="#ffffff"/>
<path d="M42 -16 Q 56 0 42 16" stroke="#9a6cff" stroke-width="4.4" fill="none" stroke-linecap="round" opacity="0.6" filter="url(#bloom)"/>
<path d="M42 -16 Q 56 0 42 16" stroke="#f0e8ff" stroke-width="2" fill="none" stroke-linecap="round" filter="url(#glow)"/>
<path d="M48 -19 Q 62 0 48 19" stroke="#b48cff" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.65" filter="url(#glow)"/>
</g>
`);

function curl(x: number, y: number, scale: number, opacity: number, id: string): string {
  const path: string = 'M0 0 C 12 -2 20 -12 24 -24 C 28 -36 40 -44 48 -40 C 54 -37 54 -28 48 -26 C 44 -25 41 -28 43 -31 C 38 -30 37 -24 39 -18 C 41 -10 46 -4 52 0 Z';
  return `<g transform="translate(${x} ${y}) scale(${scale})" opacity="${opacity}">
<path d="${path}" fill="#b3a6ff" opacity="0.6" filter="url(#bloom)"/>
<path d="${path}" fill="url(#${id})"/>
<path d="M14 -6 C 20 -12 24 -20 27 -28 M30 -6 C 31 -14 32 -22 36 -30" stroke="#ffffff" stroke-width="0.8" fill="none" opacity="0.45"/>
<path d="M24 -24 C 28 -36 40 -44 48 -40 C 54 -37 54 -28 48 -26" stroke="#ffffff" stroke-width="1.6" fill="none" stroke-linecap="round" filter="url(#glow)"/>
</g>`;
}

const ghostWave: string = art('echo', `
<defs><linearGradient id="ghost_wave_bone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf6ea"/><stop offset="0.5" stop-color="#c8bca2"/><stop offset="1" stop-color="#5e5242"/></linearGradient>
<linearGradient id="ghost_wave_mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#d8d0ff" stop-opacity="0.85"/><stop offset="1" stop-color="#7a6ed0" stop-opacity="0.1"/></linearGradient></defs>
${halo(40, 30, 18, '#b3a6ff', 0.75)}
${curl(0, 50, 0.55, 0.3, 'ghost_wave_mist')}
${curl(6, 54, 0.75, 0.5, 'ghost_wave_mist')}
${curl(12, 60, 1, 1, 'ghost_wave_mist')}
${dust([{ x: 60, y: 12 }, { x: 56, y: 8 }, { x: 62, y: 20 }, { x: 52, y: 4 }], '#ffffff')}
<path d="M3 36 C 0 48 8 61 22 59 C 26 58.4 29 56 30.6 52.4 L 23.4 45.6 C 20 50 15 50 12 46 C 10 43 9 40 9 35Z" fill="#1c1630"/>
<path d="M4 36 C 1 48 8 60 22 58 C 26 57 28 55 29 52 L 24 47 C 20 51 14 51 11 46 C 9 43 8 40 8 35Z" fill="url(#ghost_wave_bone)"/>
<path d="M4 37 C 2 45 4 52 10 56" stroke="#ffffff" stroke-width="0.9" fill="none" opacity="0.65"/>
<ellipse cx="26.6" cy="49.6" rx="3" ry="5.4" transform="rotate(45 26.6 49.6)" fill="url(#iron)"/>
<ellipse cx="26.9" cy="49.3" rx="2" ry="4" transform="rotate(45 26.9 49.3)" fill="#ffffff" filter="url(#glow)"/>
<path d="M4.4 42 l4.6 -1 M7.6 51.6 l4 -3.2 M15 56.6 l2 -4.4" stroke="#3a3024" stroke-width="2.2" stroke-linecap="round"/>
<path d="M4.4 42 l4.6 -1 M7.6 51.6 l4 -3.2 M15 56.6 l2 -4.4" stroke="#c8baa0" stroke-width="0.6" stroke-linecap="round"/>
<rect x="3.6" y="32.6" width="5.6" height="3.2" rx="1" fill="url(#iron)"/>
`);

function volleyWisp(angle: number, distance: number, size: number, bend: number): string {
  const rad: number = angle * Math.PI / 180;
  return wisp(round(16 + Math.cos(rad) * distance), round(50 + Math.sin(rad) * distance), angle, distance - 8, size, bend);
}

const wispVolley: string = art('shadow', `
${halo(16, 50, 16, '#9a6cff', 0.95)}
${halo(40, 26, 18, '#9a6cff', 0.45)}
${volleyWisp(-78, 34, 2.2, 5)}
${volleyWisp(-58, 46, 2.8, -6)}
${volleyWisp(-40, 30, 2.2, 5)}
${volleyWisp(-28, 48, 2.7, -5)}
${volleyWisp(-8, 36, 2.3, 4)}
<circle cx="16" cy="50" r="14" fill="url(#core)" filter="url(#glow)"/>
<path d="M16 37 v4 M5 43 l3.4 2 M27 43 l-3.4 2 M7 59 l2.6 -2.4 M25 59 l-2.6 -2.4" stroke="#f0e8ff" stroke-width="1" stroke-linecap="round" filter="url(#glow)"/>
<circle cx="16" cy="50" r="5.4" fill="#ffffff"/>
`);

export const SHADOW_ART: ReadonlyMap<string, string> = new Map<string, string>([
  ['dodge_roll_slip', shadowStep],
  ['mist_step', mistStep],
  ['umbra', umbra],
  ['quarrel', quarrel],
  ['quarrel_fan', quarrelFan],
  ['quarrel_heave', quarrelHeave],
  ['ghost_wave', ghostWave],
  ['wisp_volley', wispVolley],
]);
