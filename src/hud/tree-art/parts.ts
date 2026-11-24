export const TREE_DEFS: string = `<defs>
<radialGradient id="tBlood" cx="0.36" cy="0.3" r="0.82"><stop offset="0" stop-color="#ffd6cc"/><stop offset="0.24" stop-color="#ff4d4a"/><stop offset="0.7" stop-color="#b3101f"/><stop offset="1" stop-color="#3a0208"/></radialGradient>
<radialGradient id="tMana" cx="0.36" cy="0.3" r="0.82"><stop offset="0" stop-color="#e8f9ff"/><stop offset="0.3" stop-color="#5ab6ff"/><stop offset="0.74" stop-color="#1a48cc"/><stop offset="1" stop-color="#08195a"/></radialGradient>
<radialGradient id="tLife" cx="0.4" cy="0.35" r="0.8"><stop offset="0" stop-color="#f0ffe6"/><stop offset="0.35" stop-color="#6ee68e"/><stop offset="1" stop-color="#0e5a2a"/></radialGradient>
<linearGradient id="tGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset="0.45" stop-color="#f0bc4c"/><stop offset="1" stop-color="#7a4610"/></linearGradient>
<linearGradient id="tFrost" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4feff"/><stop offset="0.5" stop-color="#8fe0ff"/><stop offset="1" stop-color="#2a6cb0"/></linearGradient>
<linearGradient id="tBolt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#c8ecff"/><stop offset="1" stop-color="#4aa8ff"/></linearGradient>
<linearGradient id="tBone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbea"/><stop offset="0.55" stop-color="#d9ccb0"/><stop offset="1" stop-color="#6e604a"/></linearGradient>
<linearGradient id="tGlass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.08"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.2"/></linearGradient>
<radialGradient id="tVoid" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#000000"/><stop offset="0.6" stop-color="#05030a"/><stop offset="1" stop-color="#05030a" stop-opacity="0"/></radialGradient>
</defs>`;

export function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function around(cx: number, cy: number, scale: number, inner: string): string {
  return `<g transform="translate(${n(cx - 32 * scale)} ${n(cy - 32 * scale)}) scale(${n(scale)})">${inner}</g>`;
}

export function turned(degrees: number, inner: string): string {
  return `<g transform="rotate(${n(degrees)} 32 32)">${inner}</g>`;
}

export function star(cx: number, cy: number, outer: number, inner: number, points: number, turn: number = 0): string {
  const steps: string[] = [];
  for (let index: number = 0; index < points * 2; index += 1) {
    const radius: number = index % 2 === 0 ? outer : inner;
    const angle: number = ((turn + (index * 180) / points) * Math.PI) / 180;
    steps.push(`${n(cx + Math.sin(angle) * radius)} ${n(cy - Math.cos(angle) * radius)}`);
  }
  return `M${steps.join('L')}Z`;
}

export const HEART: string = 'M32 51C17 41 11 31 14 23C16.5 16.5 25 14.5 32 21.5C39 14.5 47.5 16.5 50 23C53 31 47 41 32 51Z';

export function heartGem(): string {
  return `<path d="${HEART}" fill="url(#tBlood)"/>`
    + '<path d="M32 21.5L27 33L32 51L37 33Z" fill="#fff" opacity="0.1"/>'
    + '<path d="M14 23L27 33L32 21.5C25 14.5 16.5 16.5 14 23Z" fill="#fff" opacity="0.08"/>'
    + '<path d="M50 23L37 33L32 51C47 41 53 31 50 23Z" fill="#000" opacity="0.22"/>'
    + `<path d="${HEART}" fill="none" stroke="#ffb4aa" stroke-opacity="0.45" stroke-width="1"/>`
    + '<ellipse cx="22.5" cy="24.5" rx="4.4" ry="2.4" transform="rotate(-38 22.5 24.5)" fill="#fff" opacity="0.72"/>';
}

export const CRYSTAL: string = 'M32 9L46 28L32 55L18 28Z';

export function crystalGem(): string {
  return `<path d="${CRYSTAL}" fill="url(#tMana)"/>`
    + '<path d="M32 9L46 28L32 55Z" fill="#000" opacity="0.2"/>'
    + '<path d="M32 9L26 28L32 55L18 28Z" fill="#fff" opacity="0.1"/>'
    + '<path d="M18 28H46M26 28L32 9L38 28L32 55Z" fill="none" stroke="#dff4ff" stroke-opacity="0.5" stroke-width="0.8"/>'
    + `<path d="${CRYSTAL}" fill="none" stroke="#bfe6ff" stroke-opacity="0.55" stroke-width="1"/>`
    + '<path d="M30 14L22.5 26.5H27.5Z" fill="#fff" opacity="0.7"/>';
}

export const SHIELD: string = 'M32 9L50 15V29C50 41.5 42.5 50 32 55.5C21.5 50 14 41.5 14 29V15Z';

export function shieldPlate(): string {
  return `<path d="${SHIELD}" fill="url(#steel)"/>`
    + '<path d="M32 12.5L47 17.5V29C47 39.8 40.6 47.2 32 52C23.4 47.2 17 39.8 17 29V17.5Z" fill="url(#iron)"/>'
    + '<path d="M32 12.5V52M17 27H47" stroke="url(#steel)" stroke-width="3.6"/>'
    + '<circle cx="32" cy="27" r="4.6" fill="url(#steel)" stroke="#1e242c" stroke-width="0.8"/>'
    + '<circle cx="21" cy="20" r="1.1" fill="#dfe6ee"/><circle cx="43" cy="20" r="1.1" fill="#dfe6ee"/><circle cx="22" cy="38" r="1.1" fill="#dfe6ee"/><circle cx="42" cy="38" r="1.1" fill="#dfe6ee"/>'
    + '<path d="M17.5 17.6L32 12.6V19L18.5 23.4Z" fill="#fff" opacity="0.2"/>';
}

export function sword(): string {
  return '<path d="M32 6L35.4 12V40H28.6V12Z" fill="url(#steel)"/>'
    + '<path d="M32 6L35.4 12V40H32Z" fill="#1e242c" opacity="0.35"/>'
    + '<path d="M32 12V38" stroke="#fff" stroke-opacity="0.55" stroke-width="0.8"/>'
    + '<rect x="21.5" y="40" width="21" height="3.8" rx="1.6" fill="url(#tGold)"/>'
    + '<rect x="30.4" y="43.8" width="3.2" height="8" rx="1" fill="url(#leather)"/>'
    + '<circle cx="32" cy="53.6" r="2.7" fill="url(#tGold)"/>';
}

export function bolt(x1: number, y1: number, x2: number, y2: number): string {
  const length: number = Math.hypot(x2 - x1, y2 - y1);
  const ux: number = (x2 - x1) / length;
  const uy: number = (y2 - y1) / length;
  const vx: number = -uy;
  const vy: number = ux;
  const p = (along: number, side: number): string => `${n(x2 - ux * along + vx * side)} ${n(y2 - uy * along + vy * side)}`;
  const q = (along: number, side: number): string => `${n(x1 + ux * along + vx * side)} ${n(y1 + uy * along + vy * side)}`;
  return `<path d="M${q(0, 0)}L${p(5.5, 0)}" stroke="#6a3e1c" stroke-width="2.8" stroke-linecap="round"/>`
    + `<path d="M${q(0, 0)}L${p(5.5, 0)}" stroke="#c89060" stroke-width="0.9" stroke-linecap="round"/>`
    + `<path d="M${p(0, 0)}L${p(7.5, 3.2)}L${p(5.6, 0)}L${p(7.5, -3.2)}Z" fill="url(#steel)" stroke="#1e242c" stroke-width="0.5"/>`
    + `<path d="M${q(0, 0)}L${q(-1, 3.4)}L${q(6.5, 1)}L${q(6.5, 0)}Z" fill="#ece4d2"/>`
    + `<path d="M${q(0, 0)}L${q(-1, -3.4)}L${q(6.5, -1)}L${q(6.5, 0)}Z" fill="#c8463a"/>`;
}

export function chevron(x: number, y: number, width: number, height: number, stroke: string, opacity: number, turn: number = 0): string {
  return `<path transform="rotate(${n(turn)} ${n(x)} ${n(y)})" d="M${n(x - width / 2)} ${n(y + height / 2)}L${n(x)} ${n(y - height / 2)}L${n(x + width / 2)} ${n(y + height / 2)}" fill="none" stroke="${stroke}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" opacity="${n(opacity)}"/>`;
}
