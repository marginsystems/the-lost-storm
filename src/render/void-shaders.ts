const NOISE: string = `
float voidHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float voidNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = voidHash(i);
  float b = voidHash(i + vec2(1.0, 0.0));
  float c = voidHash(i + vec2(0.0, 1.0));
  float d = voidHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float voidFbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 3; octave++) {
    total += voidNoise(p) * amplitude;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    amplitude *= 0.5;
  }
  return total;
}
`;

const POCKET: string = `
uniform vec2 uPocket;
uniform vec2 uDir;
uniform vec3 uSize;
uniform float uFeather;

float voidOpen(vec2 p) {
  vec2 d = p - uPocket;
  float along = dot(d, uDir);
  float across = dot(d, vec2(-uDir.y, uDir.x));
  float reach = along > 0.0 ? uSize.y : uSize.z;
  float r = length(vec2(across / uSize.x, along / reach));
  return smoothstep(1.0, 1.0 + uFeather, r);
}
`;

export const GROUND_VERTEX: string = `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const GROUND_FRAGMENT: string = `
#include <fog_pars_fragment>
uniform vec3 uColor;
uniform vec3 uShade;
uniform vec3 uFlashColor;
uniform vec2 uShift;
uniform vec2 uHero;
uniform vec2 uFlashPos;
uniform float uFlash;
uniform float uFlashReach;
uniform float uRipple;
uniform float uShadow;
varying vec3 vWorld;
${NOISE}
void main() {
  vec2 q = vWorld.xz - uShift;
  float warp = voidFbm(q * 0.11);
  float ripple = sin(dot(q, vec2(0.83, 0.55)) * 2.4 + warp * 9.0) * 0.5 + 0.5;
  float fine = voidNoise(q * 1.7);
  float mottle = voidFbm(q * 0.035 + 7.0);
  vec3 color = mix(uShade, uColor, 0.82 + mottle * 0.18);
  color *= 1.0 - uRipple * (ripple * 0.7 + fine * 0.3);
  vec2 toHero = vWorld.xz - uHero - vec2(-0.25, 0.1);
  color *= 1.0 - uShadow * exp(-dot(toHero, toHero) / 0.9);
  vec2 toFlash = vWorld.xz - uFlashPos;
  color += uFlashColor * uFlash * 0.18 * exp(-dot(toFlash, toFlash) / (uFlashReach * uFlashReach));
  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
}
`;

export const MIST_VERTEX: string = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const MIST_FRAGMENT: string = `
uniform vec3 uMist;
uniform vec3 uStorm;
uniform vec3 uDeep;
uniform vec3 uFlashColor;
uniform vec2 uShift;
uniform vec2 uView;
uniform vec2 uHero;
uniform vec2 uNear;
uniform vec2 uFlashPos;
uniform float uFlash;
uniform float uFlashReach;
uniform float uTime;
uniform float uHeight;
uniform float uOpacity;
uniform float uSeed;
uniform float uScale;
uniform float uDrift;
varying vec3 vWorld;
${NOISE}
${POCKET}
void main() {
  vec2 p = vWorld.xz - uView * uHeight;
  vec2 q = vWorld.xz - uShift;
  float open = voidOpen(p);
  float away = distance(p, uHero);
  float near = 1.0 - smoothstep(uNear.x, uNear.y, away);
  vec2 roll = vec2(uTime * uDrift, uTime * uDrift * 0.63);
  vec2 at = q * uScale + roll + uSeed;
  float body = voidFbm(at);
  float lit = voidFbm(at + vec2(0.35, 0.22));
  float storm = voidFbm(q * uScale * 0.38 - roll * 0.8 + uSeed * 1.7 + vec2(body * 1.6));
  float puff = smoothstep(0.3, 0.58, body);
  float density = open * clamp(0.45 + puff * 0.55 + smoothstep(uNear.y * 0.4, uNear.y * 1.3, away) * 0.5, 0.0, 1.0);
  float shade = clamp(0.5 + (lit - body) * 6.0, 0.0, 1.0);
  vec3 color = mix(uStorm, uMist, near * 0.8 + shade * 0.2);
  color *= 0.82 + shade * 0.28;
  color = mix(color, uDeep, smoothstep(0.36, 0.58, storm) * (1.0 - near * 0.8) * open);
  vec2 toFlash = vWorld.xz - uFlashPos;
  float glow = uFlash * exp(-dot(toFlash, toFlash) / (uFlashReach * uFlashReach));
  color = mix(color, uFlashColor, clamp(glow * (0.35 + storm * 0.9), 0.0, 1.0));
  gl_FragColor = vec4(color, clamp(density * uOpacity, 0.0, 1.0));
}
`;

export const MOTE_VERTEX: string = `
uniform vec2 uHero;
uniform vec2 uShift;
uniform vec3 uBox;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
attribute vec3 drift;
varying float vFade;
void main() {
  vec3 base = position + drift * uTime;
  vec2 anchored = base.xz + uShift - uHero + uBox.xz * 0.5;
  vec2 wrapped = mod(anchored, uBox.xz) - uBox.xz * 0.5;
  float height = mod(base.y, uBox.y);
  vec3 world = vec3(uHero.x + wrapped.x, height, uHero.y + wrapped.y);
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = uSize * uPixelRatio * (30.0 / -mvPosition.z);
  vec2 edge = abs(wrapped) / (uBox.xz * 0.5);
  vFade = (1.0 - smoothstep(0.7, 1.0, max(edge.x, edge.y))) * smoothstep(0.0, 0.6, height) * (1.0 - smoothstep(uBox.y * 0.7, uBox.y, height));
}
`;

export const MOTE_FRAGMENT: string = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float soft = 1.0 - smoothstep(0.15, 0.5, length(c));
  gl_FragColor = vec4(uColor, soft * vFade * uOpacity);
}
`;
