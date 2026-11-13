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

float voidDither(vec2 at) {
  return fract(52.9829189 * fract(dot(at, vec2(0.06711056, 0.00583715)))) - 0.5;
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
uniform float uDither;
uniform vec2 uHaze;
uniform vec3 uMist;
uniform vec4 uShore;
uniform vec3 uShoreLook;
uniform vec3 uRock;
uniform vec3 uRockShade;
uniform vec3 uLight;
uniform vec3 uLightColor;
uniform vec3 uWarmCore;
uniform vec3 uWarmGround;
uniform vec4 uLift;
uniform vec3 uLiftColor;
uniform vec4 uBody;
uniform vec4 uBed;
uniform vec3 uPale;
uniform vec4 uClear;
varying vec3 vWorld;
${NOISE}
float bodyDistance(vec2 p) {
  vec2 span = uBody.xy - uBody.zw;
  float t = clamp(dot(p - uBody.zw, span) / max(dot(span, span), 0.0001), 0.0, 1.0);
  return distance(p, uBody.zw + span * t);
}
void main() {
  vec2 q = vWorld.xz - uShift;
  float warp = voidFbm(q * 0.11);
  float ripple = sin(dot(q, vec2(0.83, 0.55)) * 2.4 + warp * 9.0) * 0.5 + 0.5;
  float fine = voidNoise(q * 1.7);
  float mottle = voidFbm(q * 0.035 + 7.0);
  vec3 color = mix(uShade, uColor, 0.82 + mottle * 0.18);
  color *= 1.0 - uRipple * (ripple * 0.7 + fine * 0.3);
  float clearAway = distance(vWorld.xz, uHero) + (warp - 0.5) * uClear.x * 0.3 + (mottle - 0.5) * uClear.x * 0.2;
  float clearing = uClear.y * (1.0 - smoothstep(uClear.x * 0.3, uClear.x, clearAway));
  float seam = smoothstep(0.62, 0.86, voidNoise(q * 0.8 + warp * 2.5));
  float glint = smoothstep(0.7, 1.0, fine) * ripple;
  vec3 pale = uPale * (1.0 + (fine - 0.5) * uClear.z + (mottle - 0.5) * uClear.z - seam * uClear.z) + glint * uClear.w;
  color = mix(color, pale, clearing);
  float bedAway = distance(vWorld.xz, uHero) + (mottle - 0.5) * uBed.y * 0.5 + (warp - 0.5) * 0.8;
  float bed = uBed.x * (1.0 - smoothstep(uBed.y * 0.3, uBed.y, bedAway));
  vec3 bedStone = uPale * (0.95 + (fine - 0.5) * uClear.z * 1.5 - seam * uClear.z * 1.5) + glint * uClear.w * 2.0;
  color = mix(color, bedStone, bed * 0.6);
  vec2 toHero = vWorld.xz - uHero - vec2(-0.25, 0.1);
  color *= 1.0 - uShadow * exp(-dot(toHero, toHero) / 0.9);
  float touch = bodyDistance(vWorld.xz);
  color *= 1.0 - uBed.x * uBed.z * (1.0 - smoothstep(0.05, uBed.w, touch)) * (0.75 + fine * 0.25);
  float ashore = dot(q - uShore.xy, uShore.zw) + (voidFbm(q * 0.09 + 3.0) - 0.5) * uShoreLook.z;
  float rock = uShoreLook.y * smoothstep(-2.0, 5.0, ashore);
  vec3 stone = mix(uRockShade, uRock, 0.55 + mottle * 0.45) * (0.82 + fine * 0.18 + ripple * 0.08);
  color = mix(color, stone, rock);
  vec2 toPool = vWorld.xz - uHero;
  color += uLiftColor * rock * uLift.y * exp(-dot(toPool, toPool) / (uLift.x * uLift.x));
  vec2 toFire = vWorld.xz - uLight.xy;
  float warm = uLight.z * exp(-dot(toFire, toFire) / (uLift.w * uLift.w));
  vec3 warmLit = mix(uLightColor, uWarmCore, sqrt(warm)) * (uWarmGround.x + glint * uWarmGround.y + ripple * uWarmGround.z);
  color = mix(color, warmLit, pow(warm, uLift.z) * uWarmGround.x);
  vec2 toFlash = vWorld.xz - uFlashPos;
  color += uFlashColor * uFlash * 0.18 * exp(-dot(toFlash, toFlash) / (uFlashReach * uFlashReach));
  color = mix(color, uMist, smoothstep(uHaze.x, uHaze.y, distance(vWorld.xz, uHero)));
  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
  gl_FragColor.rgb += voidDither(gl_FragCoord.xy) * uDither;
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
uniform vec3 uEyeFade;
uniform vec2 uGraze;
uniform vec3 uRim;
uniform vec2 uBodyClear;
uniform float uThick;
uniform vec4 uThickness;
uniform vec4 uBody;
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
uniform float uFieldSize;
uniform float uDither;
uniform vec3 uLight;
uniform vec3 uLightColor;
uniform vec4 uShore;
uniform vec3 uShoreLook;
uniform vec2 uPoolClear;
uniform float uThinMist;
uniform vec3 uHalo;
varying vec3 vWorld;
${NOISE}
float figureDistance(vec2 p, vec2 feet, vec2 head) {
  vec2 span = head - feet;
  float t = clamp(dot(p - feet, span) / max(dot(span, span), 0.0001), 0.0, 1.0);
  return distance(p, feet + span * t);
}
vec2 toGround(vec2 at, float height) {
  return at + (at - cameraPosition.xz) * height / max(cameraPosition.y - height, uEyeFade.z);
}
vec4 splineWeights(float t) {
  float s = 1.0 - t;
  return vec4(s * s * s, 4.0 + 3.0 * t * t * t - 6.0 * t * t, 4.0 + 3.0 * s * s * s - 6.0 * s * s, t * t * t) / 6.0;
}
float fieldAt(vec2 uv) {
  vec2 cell = uv * uFieldSize - 0.5;
  vec2 base = floor(cell);
  vec2 f = cell - base;
  vec4 wx = splineWeights(f.x);
  vec4 wy = splineWeights(f.y);
  vec2 g0 = vec2(wx.x + wx.y, wy.x + wy.y);
  vec2 g1 = vec2(wx.z + wx.w, wy.z + wy.w);
  vec2 h0 = (base - 0.5 + vec2(wx.y, wy.y) / g0) / uFieldSize;
  vec2 h1 = (base + 1.5 + vec2(wx.w, wy.w) / g1) / uFieldSize;
  return g0.y * (g0.x * texture2D(uField, h0).r + g1.x * texture2D(uField, vec2(h1.x, h0.y)).r) + g1.y * (g0.x * texture2D(uField, vec2(h0.x, h1.y)).r + g1.x * texture2D(uField, h1).r);
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
  vec2 p = toGround(vWorld.xz, uHeight);
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
  vec2 head = toGround(uHero, min(uFigure.x, uHeight));
  float figure = 1.0 - smoothstep(uFigure.y * reachOut, uFigure.z * reachOut, figureDistance(p, uHero, head));
  vec2 fromCentre = abs(p - uHero);
  float inside = 1.0 - smoothstep(uFieldReach - 1.5, uFieldReach, max(fromCentre.x, fromCentre.y));
  float aroundBody = 1.0 - smoothstep(uBodyClear.x * reachOut, uBodyClear.y * reachOut, figureDistance(p, uBody.zw, uBody.xy));
  float cleared = max(max(fieldAt((swirled + warp * uWarp) / uSpan) * inside, figure), aroundBody);
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
  float veil = uThick * (1.0 - smoothstep(uThickness.z, uThickness.w, away));
  density = max(density, (1.0 - open) * veil * uThickness.x);
  float rimAt = uRim.x * (1.0 + (fray - 0.5) * 0.3 + (body - 0.5) * 0.25);
  float rimOff = (away - rimAt) / uRim.z;
  float rim = uRim.y * exp(-rimOff * rimOff) * (1.0 - max(aroundBody, figure));
  density = max(density, rim * (0.55 + puff * 0.45));
  float ashore = dot(q - uShore.xy, uShore.zw) + (voidFbm(q * 0.09 + 3.0) - 0.5) * uShoreLook.z + (body - 0.5) * 4.0;
  density *= 1.0 - uShoreLook.y * smoothstep(0.0, uShoreLook.x * 0.6, ashore);
  density *= 1.0 - uShoreLook.y * smoothstep(-1.0, 3.0, ashore) * (1.0 - smoothstep(uPoolClear.x, uPoolClear.y, away));
  float shade = clamp(0.5 + (lit - body) * 6.0, 0.0, 1.0);
  vec3 color = mix(uStorm, uMist, near * 0.8 + shade * 0.2);
  color *= 0.82 + shade * 0.28;
  color = mix(color, uDeep, smoothstep(0.36, 0.58, storm) * (1.0 - near * 0.8) * (1.0 - open));
  color = mix(color, uMist, (1.0 - smoothstep(0.0, uThinMist, density)) * (1.0 - near));
  color = mix(color, uMist * 1.06, wall * uWall);
  color = mix(color, uMist * 1.08, rim * 0.6);
  color = mix(color, uMist, uShoreLook.y * (1.0 - smoothstep(-8.0, 2.0, ashore)) * 0.8);
  vec2 toFlash = vWorld.xz - uFlashPos;
  float glow = uFlash * exp(-dot(toFlash, toFlash) / (uFlashReach * uFlashReach));
  color = mix(color, uFlashColor, clamp(glow * (0.35 + storm * 0.9) + uFlash * wall * 0.6, 0.0, 1.0));
  vec2 nearLight = vWorld.xz - uLight.xy;
  float spared = exp(-dot(nearLight, nearLight) / (uHalo.x * uHalo.x));
  color = mix(color, uDeep * 0.75, uLight.z * 0.72 * (1.0 - near * 0.55) * (1.0 - pull * 0.8) * (1.0 - spared));
  color = mix(color, uLightColor, uLight.z * uHalo.z * exp(-dot(nearLight, nearLight) / (uHalo.y * uHalo.y)));
  float eye = smoothstep(uEyeFade.x, uEyeFade.y, distance(vWorld, cameraPosition)) * smoothstep(0.0, uEyeFade.z, cameraPosition.y - vWorld.y) * smoothstep(uGraze.x, uGraze.y, abs(normalize(vWorld - cameraPosition).y));
  float grain = voidDither(gl_FragCoord.xy + uSeed * 7.0) * uDither;
  gl_FragColor = vec4(color + grain, clamp(density * uOpacity * (1.0 + veil * uThickness.y) * eye + grain, 0.0, 1.0));
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
  float soft = 1.0 - smoothstep(0.0, 0.5, length(c));
  gl_FragColor = vec4(uColor, soft * vFade * uOpacity);
}
`;

export const WISP_VERTEX: string = `
attribute vec3 aCentre;
attribute vec4 aLook;
uniform float uFlatten;
uniform vec4 uEye;
varying vec2 vUv;
varying vec3 vWorld;
varying float vAlpha;
varying float vSeed;
varying float vGlow;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = aCentre + (right * position.x + up * position.y * uFlatten) * aLook.x;
  vUv = position.xy * 2.0;
  vWorld = world;
  vAlpha = aLook.y * smoothstep(uEye.x, uEye.y, distance(aCentre, cameraPosition));
  vSeed = aLook.z;
  vGlow = aLook.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const WISP_FRAGMENT: string = `
uniform float uTime;
uniform vec4 uBody;
uniform float uDither;
uniform vec3 uMist;
uniform vec3 uShade;
uniform vec4 uBodyClear;
uniform vec2 uKeySide;
uniform vec3 uReach;
uniform float uGround;
uniform float uFloorFade;
varying vec2 vUv;
varying vec3 vWorld;
varying float vAlpha;
varying float vSeed;
varying float vGlow;
${NOISE}
float bodyAt(float height) {
  float level = uGround + height;
  if (vWorld.y <= level || cameraPosition.y <= vWorld.y) return 1000.0;
  vec2 behind = vWorld.xz + (vWorld.xz - cameraPosition.xz) * (vWorld.y - level) / (cameraPosition.y - vWorld.y);
  vec2 span = uBody.xy - uBody.zw;
  float t = clamp(dot(behind - uBody.zw, span) / max(dot(span, span), 0.0001), 0.0, 1.0);
  return distance(behind, uBody.zw + span * t);
}
void main() {
  vec2 drift = vec2(uTime * 0.05, -uTime * 0.03);
  float broad = voidFbm(vUv * 1.6 + vSeed * 31.0 + drift);
  float fine = voidFbm(vUv * 4.2 - vSeed * 17.0 + drift * 2.3);
  float reach = length(vUv) + (broad - 0.5) * 0.9;
  float mass = broad * 0.65 + fine * 0.35 + (1.0 - length(vUv)) * 0.3;
  vec2 edge = abs(vUv);
  float window = (1.0 - smoothstep(0.62, 0.98, max(edge.x, edge.y))) * smoothstep(0.0, uFloorFade, vWorld.y - uGround);
  float shape = (1.0 - smoothstep(0.25, 1.0, reach)) * smoothstep(0.3, 0.58, mass) * window;
  float lee = voidFbm(vUv * 1.6 + vSeed * 31.0 + drift - uKeySide * 0.35);
  float lit = clamp(0.5 + (broad - lee) * 5.0 + vUv.y * 0.25, 0.0, 1.0);
  float touch = min(min(bodyAt(uReach.x), bodyAt(uReach.y)), bodyAt(uReach.z)) + (fine - 0.5) * uBodyClear.w;
  float keep = mix(uBodyClear.z, 1.0, smoothstep(uBodyClear.x, uBodyClear.y, touch));
  vec3 color = mix(uShade, uMist * 1.04, lit * 0.75 + smoothstep(0.3, 0.7, mass) * 0.25);
  color = mix(color, uMist * 1.07, vGlow * smoothstep(0.35, 0.75, fine));
  float grain = voidDither(gl_FragCoord.xy + vSeed * 97.0) * uDither;
  gl_FragColor = vec4(color + grain, clamp(shape * vAlpha * keep + grain, 0.0, 1.0));
}
`;
