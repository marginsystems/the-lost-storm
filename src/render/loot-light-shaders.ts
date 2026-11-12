export const LIGHT_SHAPE = {
  bodySpread: 4.5,
  coreSpread: 30,
  bodyShare: 0.45,
  coreShare: 0.5,
  footRise: 0.05,
  heightFade: 1.5,
  topFrom: 0.6,
  dustScroll: 0.35,
  streakScroll: 0.12,
  motes: 6,
  moteSharpness: 420,
  moteShare: 1.6,
  moteSpeed: 0.09,
  moteSpeedSpread: 0.07,
  moteSpread: 0.55,
  shadeFade: 0.9,
  poolSpread: 4,
  poolEdge: 0.55,
  poolDrift: 0.06,
  boltSegments: 9,
  boltSway: 0.42,
  boltFine: 0.22,
  boltPin: 0.2,
  boltRate: 0.8,
  boltWobble: 0.6,
  boltCore: 0.024,
  boltGlow: 0.11,
  boltGlowShare: 0.3,
  boltHaloShare: 0.07,
  boltHaloLow: 0.3,
  boltBurstChance: 0.45,
  boltBurstFor: 0.12,
  boltBurst: 1.0,
  boltHaloBurst: 0.15,
  boltQuiet: 0.15,
  boltSleeve: 0.16,
} as const;

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`;
}

const S = LIGHT_SHAPE;

const SHARED: string = `
uniform float uTime;
varying vec2 vUv;
varying vec3 vTint;
varying float vGlow;
varying float vShade;
varying float vSeed;
varying vec2 vSize;
float lightHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float lightNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lightHash(i), lightHash(i + vec2(1.0, 0.0)), u.x), mix(lightHash(i + vec2(0.0, 1.0)), lightHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const ATTRIBUTES: string = `
attribute vec3 aTint;
attribute float aGlow;
attribute float aShade;
attribute float aSeed;
attribute vec2 aSize;
varying vec2 vUv;
varying vec3 vTint;
varying float vGlow;
varying float vShade;
varying float vSeed;
varying vec2 vSize;
`;

const PASS_ON: string = `
  vUv = uv;
  vTint = aTint;
  vGlow = aGlow;
  vShade = aShade;
  vSeed = aSeed;
  vSize = aSize;
`;

const FINISH: string = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

export const STANDING_VERTEX: string = `
${ATTRIBUTES}
void main() {
${PASS_ON}
  vec3 base = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCamera = cameraPosition - base;
  vec2 facing = normalize(vec2(toCamera.x, toCamera.z) + vec2(0.0001, 0.0));
  vec3 right = vec3(facing.y, 0.0, -facing.x);
  vec3 world = base + right * position.x * aSize.x + vec3(0.0, (position.y + 0.5) * aSize.y, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const FLOOR_VERTEX: string = `
${ATTRIBUTES}
void main() {
${PASS_ON}
  vec3 base = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 world = base + vec3(position.x * aSize.x, 0.0, position.y * aSize.x);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const SHAFT_FRAGMENT: string = `
${SHARED}
void main() {
  float across = vUv.x * 2.0 - 1.0;
  float h = vUv.y;
  float edge = 1.0 - across * across;
  float body = exp(-across * across * ${glsl(S.bodySpread)}) * edge;
  float core = exp(-across * across * ${glsl(S.coreSpread)});
  float foot = smoothstep(0.0, ${glsl(S.footRise)}, h);
  float fade = exp(-h * ${glsl(S.heightFade)}) * (1.0 - smoothstep(${glsl(S.topFrom)}, 1.0, h));
  float dust = lightNoise(vec2(across * 2.5 + vSeed * 17.0, h * vSize.y * 1.4 - uTime * ${glsl(S.dustScroll)}));
  float streak = lightNoise(vec2(across * 7.0 + vSeed * 5.0, h * vSize.y * 0.35 - uTime * ${glsl(S.streakScroll)}));
  float breakup = mix(0.7, 1.2, dust) * mix(0.8, 1.15, streak);
  float motes = 0.0;
  for (int i = 0; i < ${S.motes}; i++) {
    float fi = float(i);
    float speed = ${glsl(S.moteSpeed)} + ${glsl(S.moteSpeedSpread)} * lightHash(vec2(fi, vSeed));
    float y = fract(lightHash(vec2(vSeed, fi * 1.3)) + uTime * speed);
    float x = (lightHash(vec2(fi * 2.1, vSeed + 3.0)) * 2.0 - 1.0) * ${glsl(S.moteSpread)} + 0.06 * sin(uTime * 0.9 + fi * 2.0);
    vec2 d = vec2((across - x) * 0.5 * vSize.x, (h - y) * vSize.y);
    motes += exp(-dot(d, d) * ${glsl(S.moteSharpness)}) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.55, 0.9, y));
  }
  float light = ((body * ${glsl(S.bodyShare)} + core * ${glsl(S.coreShare)}) * breakup * fade + motes * ${glsl(S.moteShare)}) * foot;
  float shade = body * exp(-h * ${glsl(S.shadeFade)}) * foot * vShade;
  gl_FragColor = vec4(vTint * light * vGlow, clamp(shade, 0.0, 1.0));
${FINISH}
}
`;

export const POOL_FRAGMENT: string = `
${SHARED}
void main() {
  float d = length(vUv * 2.0 - 1.0);
  float glow = exp(-d * d * ${glsl(S.poolSpread)}) * (1.0 - smoothstep(${glsl(S.poolEdge)}, 1.0, d));
  float caustic = lightNoise(vUv * 7.0 + vec2(vSeed * 9.0, uTime * ${glsl(S.poolDrift)})) * lightNoise(vUv * 13.0 - vec2(uTime * ${glsl(S.poolDrift)}, vSeed * 4.0));
  float light = glow * mix(0.7, 1.4, caustic);
  gl_FragColor = vec4(vTint * light * vGlow, clamp(glow * vShade, 0.0, 1.0));
${FINISH}
}
`;

export const BOLT_FRAGMENT: string = `
${SHARED}
float boltOffset(float k, float epoch, float salt) {
  float pin = smoothstep(0.0, ${glsl(S.boltPin)}, k / ${glsl(S.boltSegments)});
  return (lightHash(vec2(k + salt, epoch + vSeed * 31.0)) * 2.0 - 1.0) * pin;
}
void main() {
  float across = vUv.x * 2.0 - 1.0;
  float h = vUv.y;
  float clock = uTime * ${glsl(S.boltRate)} + ${glsl(S.boltWobble)} * sin(uTime * 0.37 + vSeed * 6.28) + vSeed * 11.0;
  float epoch = floor(clock);
  float phase = fract(clock);
  float fy = h * ${glsl(S.boltSegments)};
  float k = floor(fy);
  float f = fract(fy);
  float a0 = boltOffset(k, epoch, 0.0) * ${glsl(S.boltSway)};
  float a1 = boltOffset(k + 1.0, epoch, 0.0) * ${glsl(S.boltSway)};
  float fineY = h * ${glsl(S.boltSegments * 3)};
  float kf = floor(fineY);
  float b0 = boltOffset(kf / 3.0, epoch, 7.0) * ${glsl(S.boltFine)};
  float b1 = boltOffset((kf + 1.0) / 3.0, epoch, 7.0) * ${glsl(S.boltFine)};
  float centre = mix(a0, a1, f) + mix(b0, b1, fract(fineY)) * ${glsl(S.boltSway)};
  float slope = (a1 - a0) * 0.5 * vSize.x / (vSize.y / ${glsl(S.boltSegments)});
  float d = abs((across - centre) * 0.5 * vSize.x) / sqrt(1.0 + slope * slope);
  float core = exp(-pow(d / ${glsl(S.boltCore)}, 2.0));
  float line = exp(-pow(d / ${glsl(S.boltGlow)}, 2.0)) * ${glsl(S.boltGlowShare)};
  float top = 1.0 - smoothstep(0.7, 1.0, h);
  float rim = (1.0 - across * across) * (1.0 - across * across) * top;
  float halo = exp(-(across * across * 4.0 + pow((h - ${glsl(S.boltHaloLow)}) / 0.4, 2.0))) * rim * ${glsl(S.boltHaloShare)};
  float foot = smoothstep(0.0, 0.04, h);
  float quiet = 1.0 - ${glsl(S.boltQuiet)} + ${glsl(S.boltQuiet)} * sin(uTime * 1.3 + vSeed * 5.0);
  float burst = step(${glsl(S.boltBurstChance)}, lightHash(vec2(epoch, vSeed))) * (1.0 - smoothstep(0.0, ${glsl(S.boltBurstFor)}, phase)) * ${glsl(S.boltBurst)};
  float light = (core * 1.6 + line) * (quiet + burst) * top * foot + halo * (0.8 + ${glsl(S.boltHaloBurst)} * burst);
  gl_FragColor = vec4(vTint * light * vGlow, clamp((exp(-pow(d / ${glsl(S.boltSleeve)}, 2.0)) * top * foot + halo * 6.0) * vShade, 0.0, 1.0));
${FINISH}
}
`;
