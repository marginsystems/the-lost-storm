import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const DITHER = {
  spread: 0.5,
  levels: 255,
  scaleA: [0.1031, 0.1030],
  scaleB: [0.0973, 0.1099],
  mix: 33.33,
} as const;

const OUTPUT_LINE: string = 'gl_FragColor = sRGBTransferOETF( gl_FragColor );';

function fract(value: number): number {
  return value - Math.floor(value);
}

export function pixelHash(x: number, y: number, scaleX: number, scaleY: number): number {
  const px: number = fract(x * scaleX);
  const py: number = fract(y * scaleY);
  const sum: number = px * (py + DITHER.mix) + py * (px + DITHER.mix);
  return fract((px + sum) * (py + sum));
}

export function ditherOffset(x: number, y: number): number {
  const a: number = pixelHash(x, y, DITHER.scaleA[0], DITHER.scaleA[1]);
  const b: number = pixelHash(x, y, DITHER.scaleB[0], DITHER.scaleB[1]);
  return ((a + b - 1) * DITHER.spread) / DITHER.levels;
}

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

export function ditherChunk(): string {
  return [
    'float ditherHash( vec2 p, vec2 scale ) {',
    '  vec2 f = fract( p * scale );',
    `  float sum = f.x * ( f.y + ${glsl(DITHER.mix)} ) + f.y * ( f.x + ${glsl(DITHER.mix)} );`,
    '  return fract( ( f.x + sum ) * ( f.y + sum ) );',
    '}',
    'vec3 ditherOutput( vec3 colour ) {',
    `  float a = ditherHash( floor( gl_FragCoord.xy ), vec2( ${glsl(DITHER.scaleA[0])}, ${glsl(DITHER.scaleA[1])} ) );`,
    `  float b = ditherHash( floor( gl_FragCoord.xy ), vec2( ${glsl(DITHER.scaleB[0])}, ${glsl(DITHER.scaleB[1])} ) );`,
    `  return colour + ( a + b - 1.0 ) * ${glsl(DITHER.spread / DITHER.levels)};`,
    '}',
  ].join('\n');
}

export function ditherFragment(fragment: string): string {
  if (!fragment.includes(OUTPUT_LINE)) throw new Error('The output shader has no sRGB conversion to dither after');
  return fragment
    .replace('varying vec2 vUv;', `varying vec2 vUv;\n${ditherChunk()}`)
    .replace(OUTPUT_LINE, `${OUTPUT_LINE}\n\t\t\t\tgl_FragColor.rgb = ditherOutput( gl_FragColor.rgb );`);
}

export function ditheredOutputPass(): OutputPass {
  const pass: OutputPass = new OutputPass();
  pass.material.fragmentShader = ditherFragment(pass.material.fragmentShader);
  return pass;
}
