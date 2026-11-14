import { pixelRatioFor, renderBudget } from '../mobile/quality.ts';
import type { ArmShape, Colour } from './chart-storm.ts';
import { durationMs } from './overlays.ts';

export const CHART_SKY = {
  resolution: 0.75,
  maxArms: 8,
  fallbackDriftMs: 5200,
  minDriftMs: 1000,
  maxDriftMs: 60000,
  flowPerDrift: 0.047,
  streakScale: 0.3,
  streakMix: 0.45,
  warpScale: 0.4,
  warpDepth: 0.9,
  armWarp: 0.5,
  breathScale: 0.28,
  breathDepth: 0.16,
  coreRadius: 1.35,
  coreGlow: 0.85,
  armContinuity: 0.62,
  coreStretch: 1.45,
  coreTilt: 0.5,
  starScale: 26,
  starDensity: 0.022,
  dustDepth: 0.45,
} as const;

export interface SkyArm {
  readonly shape: ArmShape;
  readonly tint: Colour;
}

export interface SkyShape {
  readonly eyeX: number;
  readonly eyeY: number;
  readonly unit: number;
  readonly twist: number;
  readonly arms: readonly SkyArm[];
}

export interface SkyView {
  readonly cornerX: number;
  readonly cornerY: number;
  readonly scale: number;
}

export interface SkyMotion {
  readonly phase: number;
}

export interface ChartSky {
  draw(view: SkyView, seconds: number): void;
}

export function skyMotion(seconds: number, drift: number): SkyMotion {
  return { phase: (seconds / drift) * CHART_SKY.flowPerDrift };
}

export function driftMs(token: string): number {
  const value: number | null = durationMs(token);
  return value !== null && value >= CHART_SKY.minDriftMs && value <= CHART_SKY.maxDriftMs ? value : CHART_SKY.fallbackDriftMs;
}

function driftSeconds(host: HTMLElement): number {
  return driftMs(getComputedStyle(host).getPropertyValue('--drift-ms')) / 1000;
}

const VERTEX: string = `#version 300 es
in vec2 corner;
void main() {
  gl_Position = vec4(corner, 0.0, 1.0);
}
`;

export const SKY_FRAGMENT: string = `#version 300 es
precision highp float;
uniform vec2 size;
uniform float density;
uniform vec2 origin;
uniform float zoom;
uniform vec2 eye;
uniform float unit;
uniform float twist;
uniform float phase;
uniform int count;
uniform vec2 arms[${CHART_SKY.maxArms}];
uniform vec3 tints[${CHART_SKY.maxArms}];
out vec4 colour;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float total = 0.0;
  float weight = 0.5;
  mat2 spin = mat2(1.6, 1.2, -1.2, 1.6);
  for (int octave = 0; octave < 5; octave++) {
    total += weight * noise(p);
    p = spin * p;
    weight *= 0.5;
  }
  return total;
}

float wrapAngle(float a) {
  return a - 6.2831853 * floor((a + 3.14159265) / 6.2831853);
}

vec2 untwist(vec2 c, float r) {
  float a = -twist * r;
  return mat2(cos(a), sin(a), -sin(a), cos(a)) * c;
}

float armOffset(float th, float r, float base) {
  return wrapAngle(th - base - twist * r) * max(r, 0.35);
}

float streakAt(float r, vec2 heading, vec2 gas, float along) {
  return fbm(vec2(r * ${CHART_SKY.streakScale} - along, 0.0) + heading * 5.5 + gas * ${CHART_SKY.warpDepth});
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y) / density;
  vec2 c = ((css - origin) / zoom - eye) / unit;
  float r = length(c);
  float th = atan(c.y, c.x);

  vec2 swirl = untwist(c, r);
  vec2 gas = vec2(noise(swirl * ${CHART_SKY.warpScale}), noise(swirl * ${CHART_SKY.warpScale} + 31.7)) - 0.5;
  float breath = 1.0 + ${CHART_SKY.breathDepth} * (noise(swirl * ${CHART_SKY.breathScale} + 17.3) * 2.0 - 1.0);
  vec2 warped = swirl + gas * ${CHART_SKY.warpDepth};
  float billow = fbm(warped * 0.55);
  vec2 heading = swirl / max(r, 0.001);
  float shape = mix(billow, streakAt(r, heading, gas, 0.0), ${CHART_SKY.streakMix});
  float body = mix(billow, streakAt(r, heading, gas, phase), ${CHART_SKY.streakMix});
  float lit = fbm(warped * 0.55 + vec2(0.09, -0.12));
  float eyeClear = mix(0.35, 1.0, smoothstep(0.2, 1.6, r));

  float cloud = 0.0;
  float weight = 0.0;
  vec3 tint = vec3(0.0);
  float under = 0.0;
  float dust = 0.0;
  for (int i = 0; i < ${CHART_SKY.maxArms}; i++) {
    if (i >= count) break;
    float rch = arms[i].y;
    float t = clamp(r / (rch * 1.2), 0.0, 1.0);
    float hw = mix(3.6, 0.42, pow(t, 1.3));
    float d = armOffset(th, r, arms[i].x) + gas.x * hw * ${CHART_SKY.armWarp};
    float q = abs(d) / hw + (shape - 0.5) * ${CHART_SKY.armContinuity};
    float tail = 1.0 - smoothstep(rch * 0.8, rch * 1.3, r);
    float band = max(1.0 - smoothstep(0.2, 1.0, q), (1.0 - smoothstep(0.4, 2.4, q)) * 0.35) * tail;
    float share = exp(-q * q * 2.0) * tail + 0.0001;
    cloud = max(cloud, band);
    weight += share;
    tint += tints[i] * share;
    under += smoothstep(-0.2, 1.0, sign(d) * clamp(abs(d) / hw, 0.0, 1.0)) * share;
    float lane = d / hw + 0.38;
    dust = max(dust, exp(-lane * lane * 20.0) * tail * smoothstep(0.9, 2.2, r));
  }
  tint /= weight;
  under /= weight;
  float rim = (r - 1.3) / 0.42;
  float wall = exp(-rim * rim) * (0.85 + 0.5 * billow) * 0.45;
  float mass = (1.0 - smoothstep(1.8, 4.2, r)) * (0.35 + 0.65 * billow) * 0.7;
  cloud = max(max(cloud, wall), mass) * eyeClear;
  float top = clamp(0.62 + (body - lit) * 3.2 + (body - 0.5) * 0.7 + wall * 0.35, 0.3, 1.3);
  vec3 base = mix(vec3(0.46, 0.55, 0.68), tint, 0.24);
  vec3 lightCloud = base * top * mix(1.0, 0.62, under);
  float fine = fbm(swirl * 2.6);
  lightCloud *= mix(1.4, 1.05, smoothstep(1.2, 8.0, r));
  lightCloud *= 1.0 - dust * ${CHART_SKY.dustDepth} * (0.45 + 0.55 * fine);
  float alpha = clamp(cloud * (0.4 + 0.38 * body) * breath, 0.0, 0.76);
  lightCloud *= alpha;
  vec2 tilted = mat2(cos(${CHART_SKY.coreTilt}), sin(${CHART_SKY.coreTilt}), -sin(${CHART_SKY.coreTilt}), cos(${CHART_SKY.coreTilt})) * c;
  float er = max(length(vec2(tilted.x, tilted.y * ${CHART_SKY.coreStretch})) / ${CHART_SKY.coreRadius}, 0.0);
  float core = exp(-pow(er, 1.6));
  float halo = exp(-er * 0.75) * 0.35;
  float bulge = (core + halo) * ${CHART_SKY.coreGlow} * (0.85 + 0.3 * (fine - 0.5));
  vec3 glow = mix(vec3(0.72, 0.8, 1.0), vec3(1.0, 0.94, 0.82), clamp(core * 1.2, 0.0, 1.0));
  lightCloud += glow * bulge * 0.6;
  alpha = alpha + bulge * 0.5 * (1.0 - alpha);
  vec2 sky = c * ${CHART_SKY.starScale}.0;
  vec2 cell = floor(sky);
  float pick = hash(cell + 7.3);
  float star = step(1.0 - ${CHART_SKY.starDensity}, pick) * (1.0 - smoothstep(0.0, 0.22, length(fract(sky) - 0.5))) * (0.35 + 0.65 * hash(cell + 2.1));
  star *= 0.3 + 0.7 * cloud;
  lightCloud += vec3(0.86, 0.9, 1.0) * star * 0.7;
  alpha = alpha + star * 0.6 * (1.0 - alpha);
  float grain = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  colour = vec4(lightCloud + grain, alpha + grain);
}
`;

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader | null {
  const shader: WebGLShader | null = gl.createShader(kind);
  if (shader === null) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true ? shader : null;
}

function link(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vertex: WebGLShader | null = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment: WebGLShader | null = compile(gl, gl.FRAGMENT_SHADER, SKY_FRAGMENT);
  if (vertex === null || fragment === null) return null;
  const program: WebGLProgram = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) === true ? program : null;
}

export function createChartSky(host: HTMLElement, shape: SkyShape): ChartSky | null {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.className = 'chart-sky';
  const gl: WebGL2RenderingContext | null = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true });
  if (gl === null) return null;
  const program: WebGLProgram | null = link(gl);
  if (program === null) return null;
  host.prepend(canvas);
  const buffer: WebGLBuffer | null = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position: number = gl.getAttribLocation(program, 'corner');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);
  const at = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name);
  const arms: readonly SkyArm[] = shape.arms.slice(0, CHART_SKY.maxArms);
  gl.uniform1i(at('count'), arms.length);
  gl.uniform2fv(at('arms'), arms.flatMap((arm: SkyArm): number[] => [arm.shape.base, arm.shape.reach]));
  gl.uniform3fv(at('tints'), arms.flatMap((arm: SkyArm): number[] => Array.from(arm.tint)));
  gl.uniform2f(at('eye'), shape.eyeX, shape.eyeY);
  gl.uniform1f(at('unit'), shape.unit);
  gl.uniform1f(at('twist'), shape.twist);
  const drift: number = driftSeconds(host);
  const still: MediaQueryList = window.matchMedia('(prefers-reduced-motion: reduce)');
  let drawn: string = '';
  let box: { readonly width: number; readonly height: number } = { width: 0, height: 0 };
  let boxStale: boolean = true;
  const watcher: ResizeObserver = new ResizeObserver((): void => {
    boxStale = true;
  });
  watcher.observe(host);
  return {
    draw(view: SkyView, seconds: number): void {
      if (boxStale) {
        const measured: DOMRect = host.getBoundingClientRect();
        box = { width: measured.width, height: measured.height };
        boxStale = false;
      }
      const density: number = pixelRatioFor(renderBudget(), window.devicePixelRatio, box.width, box.height) * CHART_SKY.resolution;
      const width: number = Math.max(1, Math.round(box.width * density));
      const height: number = Math.max(1, Math.round(box.height * density));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      const time: number = still.matches ? 0 : seconds;
      const frame: string = `${width}x${height} ${view.cornerX} ${view.cornerY} ${view.scale} ${time}`;
      if (frame === drawn) return;
      drawn = frame;
      gl.uniform2f(at('size'), width, height);
      gl.uniform1f(at('density'), density);
      gl.uniform2f(at('origin'), view.cornerX, view.cornerY);
      gl.uniform1f(at('zoom'), view.scale);
      const motion: SkyMotion = skyMotion(time, drift);
      gl.uniform1f(at('phase'), motion.phase);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
