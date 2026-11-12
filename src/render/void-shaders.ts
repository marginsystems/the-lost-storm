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
  for (int octave = 0; octave < VOID_OCTAVES; octave++) {
    total += voidNoise(p) * amplitude;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;
    amplitude *= 0.5;
  }
  return total;
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
uniform sampler2D uField;
uniform float uSpan;
uniform float uFieldReach;
uniform float uOpen;
uniform vec2 uGroundClear;
uniform vec2 uPocketShade;
varying vec3 vWorld;
${NOISE}
void main() {
  vec2 q = vWorld.xz - uShift;
  vec2 fromCentre = abs(vWorld.xz - uHero);
  float inside = 1.0 - smoothstep(uFieldReach - 1.5, uFieldReach, max(fromCentre.x, fromCentre.y));
  float pocket = max(texture2D(uField, q / uSpan).r * inside, 1.0 - smoothstep(uGroundClear.x, uGroundClear.y, distance(vWorld.xz, uHero))) * uOpen;
  float warp = voidFbm(q * 0.11);
  float ripple = sin(dot(q, vec2(0.83, 0.55)) * 2.4 + warp * 9.0) * 0.5 + 0.5;
  float fine = voidNoise(q * 1.7);
  float mottle = voidFbm(q * 0.035 + 7.0);
  vec3 color = mix(uShade, uColor, 0.82 + mottle * 0.18);
  color *= 1.0 - uRipple * (ripple * 0.7 + fine * 0.3);
  vec2 toHero = vWorld.xz - uHero - vec2(-0.25, 0.1);
  color *= 1.0 - uShadow * exp(-dot(toHero, toHero) / 0.9);
  color *= 1.0 - uPocketShade.x * clamp(pocket * (1.0 - pocket) * 4.0, 0.0, 1.0);
  color *= mix(1.0 - uPocketShade.y, 1.0, smoothstep(0.15, 1.0, pocket));
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
uniform vec2 uDir;
uniform float uFlash;
uniform float uFlashReach;
uniform float uTime;
uniform float uHeight;
uniform float uOpacity;
uniform float uSeed;
uniform float uScale;
uniform float uDrift;
uniform float uSpan;
uniform float uNeed;
uniform float uTear;
uniform float uWarp;
uniform float uFeather;
uniform float uFray;
uniform vec3 uFigure;
uniform vec4 uRest;
uniform float uMotion;
uniform float uRestWall;
uniform float uFieldReach;
uniform float uStreak;
uniform float uWall;
uniform float uEddyRadius;
uniform vec4 uEddies[VOID_EDDIES];
uniform sampler2D uField;
uniform float uOpen;
uniform vec3 uLight;
uniform vec3 uLightColor;
varying vec3 vWorld;
${NOISE}
float figureDistance(vec2 p, vec2 feet, vec2 head) {
  vec2 span = head - feet;
  float t = clamp(dot(p - feet, span) / max(dot(span, span), 0.0001), 0.0, 1.0);
  return distance(p, feet + span * t);
}
vec2 voidSwirl(vec2 q) {
  for (int index = 0; index < VOID_EDDIES; index++) {
    vec4 eddy = uEddies[index];
    vec2 r = q - eddy.xy;
    float turn = eddy.z * eddy.w * exp(-dot(r, r) / (uEddyRadius * uEddyRadius));
    float c = cos(turn);
    float s = sin(turn);
    q = eddy.xy + vec2(c * r.x - s * r.y, s * r.x + c * r.y);
  }
  return q;
}
void main() {
  vec2 p = vWorld.xz - uView * uHeight;
  vec2 q = p - uShift;
  vec2 swirled = voidSwirl(q);
  vec2 roll = vec2(uTime * uDrift, uTime * uDrift * 0.63);
  vec2 side = vec2(-uDir.y, uDir.x);
  vec2 flow = vec2(dot(swirled, uDir) * mix(1.0, 0.32, uStreak), dot(swirled, side));
  vec2 at = mix(swirled, flow, uStreak) * uScale + roll + uSeed;
  float body = voidFbm(at);
  float lit = voidFbm(at + vec2(0.35, 0.22));
  float storm = voidFbm(q * uScale * 0.38 - roll * 0.8 + uSeed * 1.7 + vec2(body * 1.6));
  vec2 warp = vec2(voidFbm(swirled * 0.3 + uSeed + roll * 1.7), voidFbm(swirled * 0.3 - uSeed * 0.7 - roll * 1.3)) - 0.5;
  vec2 rel = p - uHero;
  float breathe = voidFbm(rel * 0.42 + vec2(uTime * 0.06, -uTime * 0.045) + uSeed * 0.31);
  float curl = voidNoise(rel * 1.3 - vec2(uTime * 0.11, uTime * 0.08) + uSeed);
  float reachOut = 1.0 + (breathe - 0.5) * uRest.z * 2.0 + (curl - 0.5) * uRest.w + sin(uTime * 0.55 + uSeed) * 0.04;
  vec2 head = uHero - uView * min(uFigure.x, uHeight);
  float figure = 1.0 - smoothstep(uFigure.y * reachOut, uFigure.z * reachOut, figureDistance(p, uHero, head));
  vec2 fromCentre = abs(p - uHero);
  float inside = 1.0 - smoothstep(uFieldReach - 1.5, uFieldReach, max(fromCentre.x, fromCentre.y));
  float cleared = max(texture2D(uField, (swirled + warp * uWarp) / uSpan).r * inside * uOpen, figure);
  float fray = voidFbm(swirled * uFray + roll * 2.2 + uSeed * 3.1);
  float still = 1.0 - uMotion;
  float need = uNeed + (mix(body, fray, 0.55) - 0.5) * uTear * mix(1.0, uRest.x, still);
  float soft = uFeather * (0.5 + fray) * mix(1.0, uRest.y, still);
  float open = smoothstep(need - soft, need + soft, cleared);
  float wall = clamp(open * (1.0 - open) * 4.0, 0.0, 1.0) * smoothstep(0.02, 0.2, cleared) * mix(1.0, uRestWall, still);
  float away = distance(p, uHero);
  float near = 1.0 - smoothstep(uNear.x, uNear.y, away);
  float puff = smoothstep(0.3, 0.58, body);
  vec2 toLight = uLight.xy - uHero;
  float lightAway = max(length(toLight), 0.001);
  vec2 lightDir = toLight / lightAway;
  vec2 fromHero = p - uHero;
  float along = dot(fromHero, lightDir);
  float across = abs(dot(fromHero, vec2(-lightDir.y, lightDir.x)));
  float lane = smoothstep(-2.0, 3.0, along) * (1.0 - smoothstep(lightAway + 4.0, lightAway + 9.0, along));
  float width = mix(2.5, 7.0, clamp(along / lightAway, 0.0, 1.0));
  float pull = uLight.z * lane * (1.0 - smoothstep(width, width + 3.5, across));
  float density = (1.0 - open) * (1.0 - pull * 0.7) * mix(1.0, 1.35, uLight.z * (1.0 - pull)) * clamp(0.45 + puff * 0.55 + smoothstep(uNear.y * 0.4, uNear.y * 1.3, away) * 0.5, 0.0, 1.0);
  float shade = clamp(0.5 + (lit - body) * 6.0, 0.0, 1.0);
  vec3 color = mix(uStorm, uMist, near * 0.8 + shade * 0.2);
  color *= 0.82 + shade * 0.28;
  color = mix(color, uDeep, smoothstep(0.36, 0.58, storm) * (1.0 - near * 0.8) * (1.0 - open));
  color = mix(color, uMist * 1.06, wall * uWall);
  vec2 toFlash = vWorld.xz - uFlashPos;
  float glow = uFlash * exp(-dot(toFlash, toFlash) / (uFlashReach * uFlashReach));
  color = mix(color, uFlashColor, clamp(glow * (0.35 + storm * 0.9) + uFlash * wall * 0.6, 0.0, 1.0));
  color = mix(color, uDeep * 0.75, uLight.z * 0.72 * (1.0 - near * 0.55) * (1.0 - pull * 0.8));
  vec2 nearLight = vWorld.xz - uLight.xy;
  color = mix(color, uLightColor, uLight.z * 0.85 * exp(-dot(nearLight, nearLight) / 90.0));
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
