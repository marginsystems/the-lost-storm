import type { ArmShape, Colour } from './chart-storm.ts';

export const CHART_SKY = {
  resolution: 0.5,
  maxArms: 8,
  sway: 0.018,
  swayPeriods: 9,
  flow: 0.035,
  fallbackDriftMs: 5200,
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

export interface ChartSky {
  draw(view: SkyView, seconds: number): void;
}

const VERTEX: string = `#version 300 es
in vec2 corner;
void main() {
  gl_Position = vec4(corner, 0.0, 1.0);
}
`;

const FRAGMENT: string = `#version 300 es
precision highp float;
uniform vec2 size;
uniform float density;
uniform vec2 origin;
uniform float zoom;
uniform vec2 eye;
uniform float unit;
uniform float twist;
uniform float flow;
uniform float sway;
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
  float a = -twist * r - sway;
  return mat2(cos(a), sin(a), -sin(a), cos(a)) * c;
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y) / density;
  vec2 c = ((css - origin) / zoom - eye) / unit;
  float r = length(c);
  float th = atan(c.y, c.x);

  vec2 swirl = untwist(c, r);
  vec2 drift = vec2(-flow, flow * 0.6);
  float billow = fbm(swirl * 0.55 + drift);
  vec2 heading = swirl / max(r, 0.001);
  float streak = fbm(vec2(r * 0.3 - flow * 1.4, 0.0) + heading * 5.5);
  float body = mix(billow, streak, 0.45);
  float lit = fbm(swirl * 0.55 + drift + vec2(0.09, -0.12));
  float eyeClear = smoothstep(0.45, 1.15, r);

  float cloud = 0.0;
  float weight = 0.0;
  vec3 tint = vec3(0.0);
  float under = 0.0;
  for (int i = 0; i < ${CHART_SKY.maxArms}; i++) {
    if (i >= count) break;
    float rch = arms[i].y;
    float t = clamp(r / (rch * 1.2), 0.0, 1.0);
    float hw = mix(3.6, 0.42, pow(t, 1.3));
    float d = wrapAngle(th - arms[i].x - twist * r - sway) * max(r, 0.35);
    float q = abs(d) / hw + (body - 0.5) * 0.9;
    float tail = 1.0 - smoothstep(rch * 0.8, rch * 1.3, r);
    float band = max(1.0 - smoothstep(0.2, 1.0, q), (1.0 - smoothstep(0.4, 2.4, q)) * 0.35) * tail;
    float share = exp(-q * q * 2.0) * tail + 0.0001;
    cloud = max(cloud, band);
    weight += share;
    tint += tints[i] * share;
    under += smoothstep(-0.2, 1.0, sign(d) * clamp(abs(d) / hw, 0.0, 1.0)) * share;
  }
  tint /= weight;
  under /= weight;
  float wall = exp(-pow((r - 1.35) / 0.7, 2.0)) * (0.6 + 0.6 * billow);
  float mass = (1.0 - smoothstep(1.8, 4.2, r)) * (0.35 + 0.65 * billow) * 0.7;
  cloud = max(max(cloud, wall), mass) * eyeClear;
  float top = clamp(0.62 + (body - lit) * 3.2 + (body - 0.5) * 0.7, 0.3, 1.15);
  vec3 base = mix(vec3(0.46, 0.55, 0.68), tint, 0.24);
  vec3 lightCloud = base * top * mix(1.0, 0.62, under);
  float alpha = clamp(cloud * (0.34 + 0.36 * body), 0.0, 0.66);
  float grain = (hash(gl_FragCoord.xy + fract(flow) * 61.0) - 0.5) / 255.0;
  colour = vec4(lightCloud * alpha + grain, alpha + grain);
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
  const fragment: WebGLShader | null = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  if (vertex === null || fragment === null) return null;
  const program: WebGLProgram = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) === true ? program : null;
}

function driftSeconds(host: HTMLElement): number {
  const value: number = Number.parseFloat(getComputedStyle(host).getPropertyValue('--drift-ms'));
  return (Number.isFinite(value) && value > 0 ? value : CHART_SKY.fallbackDriftMs) / 1000;
}

export function createChartSky(host: HTMLElement, shape: SkyShape): ChartSky | null {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.className = 'chart-sky';
  const gl: WebGL2RenderingContext | null = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true });
  if (gl === null) return null;
  const program: WebGLProgram | null = link(gl);
  if (program === null) return null;
  host.prepend(canvas);
  const buffer: WebGLBuffer = gl.createBuffer();
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
  const still: MediaQueryList = window.matchMedia('(prefers-reduced-motion: reduce)');
  const period: number = driftSeconds(host) * CHART_SKY.swayPeriods;
  return {
    draw(view: SkyView, seconds: number): void {
      const box: DOMRect = host.getBoundingClientRect();
      const density: number = Math.min(window.devicePixelRatio, 2) * CHART_SKY.resolution;
      const width: number = Math.max(1, Math.round(box.width * density));
      const height: number = Math.max(1, Math.round(box.height * density));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      const time: number = still.matches ? 0 : seconds;
      gl.uniform2f(at('size'), width, height);
      gl.uniform1f(at('density'), density);
      gl.uniform2f(at('origin'), view.cornerX, view.cornerY);
      gl.uniform1f(at('zoom'), view.scale);
      gl.uniform1f(at('flow'), (time / period) * CHART_SKY.flow * CHART_SKY.swayPeriods);
      gl.uniform1f(at('sway'), Math.sin((time / period) * Math.PI * 2) * CHART_SKY.sway);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
