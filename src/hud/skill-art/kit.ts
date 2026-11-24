export interface Palette {
  readonly deep: string;
  readonly core: string;
  readonly hot: string;
  readonly light: string;
}

export type Element = 'fire' | 'storm' | 'tide' | 'shadow' | 'stone' | 'echo' | 'mend' | 'steel';

export const PALETTES: Readonly<Record<Element, Palette>> = {
  fire: { deep: '#160504', core: '#6e1606', hot: '#ff6a14', light: '#ffe4a6' },
  storm: { deep: '#040a1a', core: '#10306e', hot: '#3fb8ff', light: '#eaf9ff' },
  tide: { deep: '#03120f', core: '#0b4448', hot: '#2fd0bd', light: '#dffff8' },
  shadow: { deep: '#0a0514', core: '#331a63', hot: '#9a6cff', light: '#f0e8ff' },
  stone: { deep: '#110b05', core: '#4a2f14', hot: '#e8a048', light: '#fff0d2' },
  echo: { deep: '#0b0918', core: '#35306a', hot: '#b3a6ff', light: '#f7f4ff' },
  mend: { deep: '#041208', core: '#145230', hot: '#5fe08a', light: '#eeffef' },
  steel: { deep: '#07090d', core: '#253244', hot: '#9fc4e8', light: '#f4f9ff' },
};

export const ART = {
  size: 64,
  radius: 7,
} as const;

function defs(palette: Palette): string {
  return `<defs>
<radialGradient id="bg" cx="0.5" cy="0.42" r="0.78"><stop offset="0" stop-color="${palette.core}"/><stop offset="1" stop-color="${palette.deep}"/></radialGradient>
<radialGradient id="vig" cx="0.5" cy="0.5" r="0.72"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.62"/></radialGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.35" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="energy" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${palette.core}"/><stop offset="0.45" stop-color="${palette.hot}"/><stop offset="1" stop-color="${palette.light}"/></linearGradient>
<linearGradient id="energyX" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${palette.hot}" stop-opacity="0"/><stop offset="0.6" stop-color="${palette.hot}"/><stop offset="1" stop-color="${palette.light}"/></linearGradient>
<radialGradient id="core" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${palette.light}"/><stop offset="0.35" stop-color="${palette.hot}"/><stop offset="1" stop-color="${palette.hot}" stop-opacity="0"/></radialGradient>
<linearGradient id="flameFill" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff2b8"/><stop offset="0.3" stop-color="#ffb43a"/><stop offset="0.65" stop-color="#ff5a12"/><stop offset="1" stop-color="#b81604" stop-opacity="0.75"/></linearGradient>
<linearGradient id="flameCore" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fffbe6"/><stop offset="0.5" stop-color="#ffe07a"/><stop offset="1" stop-color="#ffb43a" stop-opacity="0"/></linearGradient>
<linearGradient id="edge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f9fc"/><stop offset="0.45" stop-color="#a7b3c2"/><stop offset="1" stop-color="#3b4554"/></linearGradient>
<linearGradient id="iron" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9aa3ae"/><stop offset="0.5" stop-color="#4f5864"/><stop offset="1" stop-color="#1e242c"/></linearGradient>
<linearGradient id="wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3e2412"/><stop offset="0.45" stop-color="#9a6436"/><stop offset="1" stop-color="#4a2a12"/></linearGradient>
<linearGradient id="leather" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a1a10"/><stop offset="0.5" stop-color="#6a4426"/><stop offset="1" stop-color="#2a1a10"/></linearGradient>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.7"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<clipPath id="plate"><rect width="64" height="64" rx="${ART.radius}"/></clipPath>
</defs>`;
}

export function art(element: Element, body: string): string {
  const palette: Palette = PALETTES[element];
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs(palette)}<g clip-path="url(#plate)"><rect width="64" height="64" fill="url(#bg)"/>${body}<rect width="64" height="64" fill="url(#vig)"/><rect width="64" height="64" fill="#fff" filter="url(#grain)"/><rect width="64" height="64" fill="url(#sheen)"/></g></svg>`;
}

export function flame(x: number, y: number, height: number, width: number, lean: number): string {
  const tipX: number = x + lean;
  const tipY: number = y - height;
  return `M${x} ${y}C${x - width} ${y - height * 0.18} ${x - width * 0.75} ${y - height * 0.62} ${tipX} ${tipY}C${x + width * 0.45} ${y - height * 0.6} ${x + width * 1.05} ${y - height * 0.3} ${x} ${y}Z`;
}

export function fire(x: number, y: number, height: number, width: number, lean: number): string {
  const side: number = width * 0.7;
  return `<path d="${flame(x, y + 1, height * 1.1, width * 1.5, lean)}" fill="#ff4a0a" opacity="0.55" filter="url(#bloom)"/>`
    + `<path d="${flame(x - side, y, height * 0.6, width * 0.7, lean - width * 0.5)}" fill="url(#flameFill)"/>`
    + `<path d="${flame(x + side, y, height * 0.5, width * 0.6, lean + width * 0.4)}" fill="url(#flameFill)"/>`
    + `<path d="${flame(x, y, height, width, lean)}" fill="url(#flameFill)"/>`
    + `<path d="${flame(x, y, height * 0.58, width * 0.55, lean * 0.6)}" fill="url(#flameCore)"/>`;
}

export function spark(x: number, y: number, r: number, color: string): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" filter="url(#glow)"/>`;
}

export function halo(x: number, y: number, r: number, color: string, opacity: number): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}" filter="url(#bloom)"/>`;
}
