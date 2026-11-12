import type { LayerUniforms, PixelBox, RadialLayer } from './paint.ts';
import { DITHER_LIMITS, layerUniforms } from './paint.ts';

const VERTEX: string = `#version 300 es
in vec2 corner;
void main() {
  gl_Position = vec4(corner, 0.0, 1.0);
}
`;

const FRAGMENT: string = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 size;
uniform uint seed;
uniform int count;
uniform vec4 shapes[${DITHER_LIMITS.layers}];
uniform float stopCounts[${DITHER_LIMITS.layers}];
uniform float positions[${DITHER_LIMITS.layers * DITHER_LIMITS.stops}];
uniform vec4 colours[${DITHER_LIMITS.layers * DITHER_LIMITS.stops}];
out vec4 colour;

uvec3 scramble(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  return v;
}

vec4 noise(uvec2 pixel) {
  uvec3 first = scramble(uvec3(pixel, seed));
  uvec3 second = scramble(uvec3(pixel, seed ^ 0x9e3779b9u));
  vec4 a = vec4(float(first.x >> 8u), float(first.y >> 8u), float(first.z >> 8u), float((first.x ^ second.z) >> 8u)) / 16777216.0;
  vec4 b = vec4(float(second.x >> 8u), float(second.y >> 8u), float(second.z >> 8u), float((first.y ^ second.x) >> 8u)) / 16777216.0;
  return a + b - 1.0;
}

vec4 ramp(int layer, float t) {
  int stopCount = int(stopCounts[layer]);
  int base = layer * ${DITHER_LIMITS.stops};
  vec4 result = colours[base];
  float previousAt = positions[base];
  vec4 previous = colours[base];
  for (int i = 1; i < ${DITHER_LIMITS.stops}; i++) {
    if (i >= stopCount) break;
    float at = positions[base + i];
    vec4 next = colours[base + i];
    if (t >= at) {
      result = next;
    } else if (t > previousAt) {
      result = mix(previous, next, (t - previousAt) / max(at - previousAt, 1e-6));
    }
    if (t < at) break;
    previousAt = at;
    previous = next;
  }
  return result;
}

void main() {
  vec2 point = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
  vec4 sum = vec4(0.0);
  for (int layer = ${DITHER_LIMITS.layers - 1}; layer >= 0; layer--) {
    if (layer >= count) continue;
    vec4 shape = shapes[layer];
    float t = length((point - shape.xy) / shape.zw);
    vec4 layerColour = ramp(layer, t);
    sum = layerColour + sum * (1.0 - layerColour.a);
  }
  vec4 dithered = floor(sum * 255.0 + noise(uvec2(gl_FragCoord.xy)) + 0.5) / 255.0;
  dithered.a = sum.a * 255.0 > 254.5 ? 1.0 : dithered.a;
  dithered = clamp(dithered, 0.0, 1.0);
  colour = vec4(min(dithered.rgb, vec3(dithered.a)), dithered.a);
}
`;

export interface DitherRenderer {
  draw(layers: readonly RadialLayer[], box: PixelBox, seed: number): HTMLCanvasElement | null;
}

interface Program {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  readonly program: WebGLProgram;
}

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader | null {
  const shader: WebGLShader | null = gl.createShader(kind);
  if (shader === null) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true ? shader : null;
}

function build(): Program | null {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  const gl: WebGL2RenderingContext | null = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
  if (gl === null) return null;
  const vertex: WebGLShader | null = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment: WebGLShader | null = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  if (vertex === null || fragment === null) return null;
  const program: WebGLProgram = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) return null;
  gl.useProgram(program);
  const buffer: WebGLBuffer | null = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const corner: number = gl.getAttribLocation(program, 'corner');
  gl.enableVertexAttribArray(corner);
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
  return { gl, canvas, program };
}

let shared: Program | null | undefined;
let lost: boolean = false;

export function ditherRenderer(): DitherRenderer | null {
  if (shared !== null && shared !== undefined && shared.gl.isContextLost()) lost = true;
  if (shared === undefined || lost) {
    shared = build();
    lost = shared === null || shared.gl.isContextLost();
  }
  const ready: Program | null = shared;
  if (ready === null) return null;
  const { gl, canvas, program } = ready;
  return {
    draw(layers: readonly RadialLayer[], box: PixelBox, seed: number): HTMLCanvasElement | null {
      if (gl.isContextLost()) return null;
      canvas.width = box.width;
      canvas.height = box.height;
      gl.viewport(0, 0, box.width, box.height);
      const uniforms: LayerUniforms = layerUniforms(layers, box);
      gl.uniform2f(gl.getUniformLocation(program, 'size'), box.width, box.height);
      gl.uniform1ui(gl.getUniformLocation(program, 'seed'), seed >>> 0);
      gl.uniform1i(gl.getUniformLocation(program, 'count'), uniforms.count);
      gl.uniform4fv(gl.getUniformLocation(program, 'shapes'), uniforms.shapes);
      gl.uniform1fv(gl.getUniformLocation(program, 'stopCounts'), uniforms.stopCounts);
      gl.uniform1fv(gl.getUniformLocation(program, 'positions'), uniforms.positions);
      gl.uniform4fv(gl.getUniformLocation(program, 'colours'), uniforms.colours);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return canvas;
    },
  };
}
