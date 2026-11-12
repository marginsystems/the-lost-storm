export const RAIN_LIGHTS = {
  torches: 6,
} as const;

const COMMON: string = `
#define TORCHES ${RAIN_LIGHTS.torches}
uniform float uTime;
uniform vec2 uWind;
uniform vec3 uCentre;
uniform vec3 uSpan;
uniform float uSpeed;
uniform float uSpeedSpread;
uniform float uSlant;
uniform vec2 uResolution;
uniform vec3 uBase;
uniform vec3 uFlashColor;
uniform float uFlash;
uniform vec4 uTorches[TORCHES];
uniform vec3 uTorchColor;
uniform float uTorchReach;
uniform vec3 uHero;
uniform vec3 uHeroColor;
uniform float uFadeNear;
uniform float uFadeFar;
uniform float uHeroReach;
uniform float fogNear;
uniform float fogFar;
uniform vec3 fogColor;

vec3 rainHash(float p) {
  vec3 q = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}

float rainWrap(float value, float centre, float span) {
  return centre + mod(value - centre + span * 0.5, span) - span * 0.5;
}

void rainDrop(vec4 seed, float shift, out vec3 start, out vec3 velocity, out float cycle, out float along, out float index) {
  float speed = uSpeed * (1.0 + uSpeedSpread * (seed.x * 2.0 - 1.0));
  cycle = uSpan.y / speed;
  float progress = uTime / cycle + seed.y + shift;
  index = floor(progress);
  along = fract(progress);
  vec3 home = rainHash(seed.z * 977.0 + index * 13.7);
  float lean = 1.0 + uSlant * (seed.w * 2.0 - 1.0);
  vec2 side = vec2(-uWind.y, uWind.x) * uSlant * (home.y - 0.5);
  velocity = vec3(uWind.x * lean + side.x, -speed, uWind.y * lean + side.y);
  start = vec3(home.x * uSpan.x, uCentre.y + uSpan.y * 0.5, home.z * uSpan.z);
}

vec3 rainPlace(vec3 point) {
  return vec3(rainWrap(point.x, uCentre.x, uSpan.x), point.y, rainWrap(point.z, uCentre.z, uSpan.z));
}

vec3 rainLight(vec3 point, vec3 toEye) {
  vec3 light = uBase + uFlashColor * uFlash;
  for (int index = 0; index < TORCHES; index++) {
    vec4 torch = uTorches[index];
    if (torch.w <= 0.0) continue;
    vec3 toward = torch.xyz - point;
    float reach = length(toward) / uTorchReach;
    float fall = max(0.0, 1.0 - reach);
    float glint = 0.35 + 0.65 * pow(max(0.0, dot(normalize(toward), -toEye)), 3.0);
    light += uTorchColor * torch.w * fall * fall * glint;
  }
  float hero = max(0.0, 1.0 - length(uHero - point) / uHeroReach);
  light += uHeroColor * hero * hero;
  return light;
}

float rainFog(vec3 point) {
  return 1.0 - smoothstep(uFadeNear, uFadeFar, length(point.xz - uHero.xz));
}

float rainPixels(vec4 clip, float width) {
  return width * projectionMatrix[1][1] * uResolution.y * 0.5 / max(clip.w, 0.001);
}

vec4 rainStreak(vec3 head, vec3 tail, float width, float minPixels, vec2 corner) {
  vec3 viewHead = (modelViewMatrix * vec4(head, 1.0)).xyz;
  vec3 viewTail = (modelViewMatrix * vec4(tail, 1.0)).xyz;
  vec2 dir = normalize(viewHead.xy - viewTail.xy + vec2(0.0, 0.0001));
  vec2 across = vec2(-dir.y, dir.x);
  vec3 point = mix(viewTail, viewHead, corner.y);
  float pixelSize = 2.0 * max(-point.z, 0.001) / (projectionMatrix[1][1] * uResolution.y);
  float halfWidth = max(width, minPixels * pixelSize) * 0.5;
  point.xy += across * corner.x * halfWidth + dir * (corner.y * 2.0 - 1.0) * halfWidth;
  float behind = step(0.6, min(-viewHead.z, -viewTail.z));
  return mix(vec4(2.0, 2.0, 2.0, 1.0), projectionMatrix * vec4(point, 1.0), behind);
}

float rainThin(vec3 head, float width, float minPixels) {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(head, 1.0);
  float pixels = rainPixels(clip, width);
  return pixels / max(pixels, minPixels);
}
`;

export const STREAK_VERTEX: string = `
${COMMON}
uniform float uExposure;
uniform float uLengthSpread;
uniform float uWidth;
uniform float uMinPixels;
uniform float uBright;
attribute vec4 aSeed;
attribute vec2 aCorner;
varying vec2 vCorner;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 dropStart;
  vec3 dropVelocity;
  float dropCycle;
  float dropAlong;
  float dropIndex;
  rainDrop(aSeed, 0.0, dropStart, dropVelocity, dropCycle, dropAlong, dropIndex);
  vec3 head = rainPlace(dropStart + dropVelocity * dropAlong * dropCycle);
  float stretch = 1.0 + uLengthSpread * (rainHash(aSeed.w * 311.0 + dropIndex).x * 2.0 - 1.0);
  vec3 tail = head - dropVelocity * uExposure * stretch;
  float thin = rainThin(head, uWidth, uMinPixels);
  gl_Position = rainStreak(head, tail, uWidth, uMinPixels, aCorner);
  vec3 toEye = normalize(cameraPosition - head);
  float bright = uBright * (0.45 + 0.9 * rainHash(aSeed.z * 53.0 + dropIndex).y);
  float edges = smoothstep(0.0, 0.04, dropAlong) * (1.0 - smoothstep(0.96, 1.0, dropAlong));
  vColor = rainLight(head, toEye);
  vAlpha = bright * thin * edges * rainFog(head);
  vCorner = aCorner;
}
`;

export const STREAK_FRAGMENT: string = `
varying vec2 vCorner;
varying vec3 vColor;
varying float vAlpha;

void main() {
  float across = exp(-vCorner.x * vCorner.x * 3.2);
  float along = smoothstep(0.0, 0.55, vCorner.y) * (1.0 - smoothstep(0.82, 1.0, vCorner.y));
  float alpha = vAlpha * across * along;
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(vColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const RING_VERTEX: string = `
${COMMON}
uniform float uLife;
uniform float uRadius;
uniform float uBright;
attribute vec4 aSeed;
attribute vec2 aCorner;
varying vec2 vCorner;
varying vec3 vColor;
varying float vAlpha;
varying float vAge;

void main() {
  vec2 corner = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);
  vec3 dropStart;
  vec3 dropVelocity;
  float dropCycle;
  float dropAlong;
  float dropIndex;
  rainDrop(aSeed, -1.0, dropStart, dropVelocity, dropCycle, dropAlong, dropIndex);
  float age = dropAlong * dropCycle;
  float life = uLife * (0.7 + 0.6 * rainHash(aSeed.x * 71.0 + dropIndex).x);
  float shown = age / life;
  vec3 land = dropStart + dropVelocity * dropCycle;
  land = rainPlace(vec3(land.x, 0.02, land.z));
  if (shown >= 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    vCorner = corner;
    vColor = vec3(0.0);
    vAge = 1.0;
    return;
  }
  float grow = 1.0 - (1.0 - shown) * (1.0 - shown);
  float radius = uRadius * (0.6 + 0.8 * rainHash(aSeed.y * 37.0 + dropIndex).y) * (0.25 + 0.75 * grow);
  vec3 point = land + vec3(corner.x, 0.0, corner.y) * radius * 1.35;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 1.0);
  vec3 toEye = normalize(cameraPosition - land);
  vColor = rainLight(land + vec3(0.0, 0.3, 0.0), toEye);
  vAlpha = uBright * pow(1.0 - shown, 1.6) * rainFog(land);
  vCorner = corner;
  vAge = shown;
}
`;

export const RING_FRAGMENT: string = `
uniform float uThickness;
varying vec2 vCorner;
varying vec3 vColor;
varying float vAlpha;
varying float vAge;

void main() {
  float distance_ = length(vCorner) * 1.35;
  float ring = exp(-pow((distance_ - 1.0) / uThickness, 2.0));
  float inner = exp(-pow((distance_ - 0.55) / (uThickness * 1.4), 2.0)) * 0.35 * (1.0 - vAge);
  float impact = exp(-distance_ * distance_ * 9.0) * (1.0 - smoothstep(0.0, 0.25, vAge));
  float alpha = vAlpha * (ring + inner + impact);
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(vColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const SPRAY_VERTEX: string = `
${COMMON}
uniform float uGravity;
uniform vec2 uKick;
uniform float uRise;
uniform float uExposure;
uniform float uWidth;
uniform float uMinPixels;
uniform float uBright;
attribute vec4 aSeed;
attribute vec2 aCorner;
attribute float aPiece;
varying vec2 vCorner;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 dropStart;
  vec3 dropVelocity;
  float dropCycle;
  float dropAlong;
  float dropIndex;
  rainDrop(aSeed, -1.0, dropStart, dropVelocity, dropCycle, dropAlong, dropIndex);
  float age = dropAlong * dropCycle;
  vec3 pick = rainHash(aSeed.z * 401.0 + dropIndex * 3.1 + aPiece * 17.0);
  vec3 land = dropStart + dropVelocity * dropCycle;
  land = rainPlace(vec3(land.x, 0.0, land.z));
  float angle = pick.x * 6.2831853;
  float outward = mix(uKick.x, uKick.y, pick.y);
  float up = uRise * (0.6 + 0.8 * pick.z);
  vec3 velocity = vec3(cos(angle) * outward, up - uGravity * age, sin(angle) * outward);
  vec3 head = land + vec3(cos(angle) * outward * age, up * age - 0.5 * uGravity * age * age, sin(angle) * outward * age);
  if (head.y <= 0.0 || pick.y > 0.92) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vAlpha = 0.0;
    vCorner = aCorner;
    vColor = vec3(0.0);
    return;
  }
  vec3 tail = head - velocity * uExposure;
  float thin = rainThin(head, uWidth, uMinPixels);
  gl_Position = rainStreak(head, tail, uWidth, uMinPixels, aCorner);
  vColor = rainLight(head + vec3(0.0, 0.3, 0.0), normalize(cameraPosition - head));
  vAlpha = uBright * thin * smoothstep(0.0, 0.03, head.y) * rainFog(head);
  vCorner = aCorner;
}
`;

export const MIST_VERTEX: string = `
${COMMON}
uniform float uSize;
uniform float uDrift;
attribute vec4 aSeed;
attribute vec2 aCorner;
varying vec2 vCorner;
varying vec3 vWorld;
varying vec3 vColor;
varying float vFade;
varying float vSeed;

void main() {
  vec2 corner = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);
  vec2 home = vec2(aSeed.x * uSpan.x, aSeed.y * uSpan.z) + uWind * uDrift * uTime;
  vec3 centre = vec3(rainWrap(home.x, uCentre.x, uSpan.x), uCentre.y + aSeed.z * uSpan.y, rainWrap(home.y, uCentre.z, uSpan.z));
  vec3 point = centre + vec3(corner.x, 0.0, corner.y) * uSize * (0.7 + 0.6 * aSeed.w);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 1.0);
  vec2 edge = abs(vec2(centre.x - uCentre.x, centre.z - uCentre.z)) / (uSpan.xz * 0.5);
  vFade = (1.0 - smoothstep(0.7, 1.0, max(edge.x, edge.y))) * rainFog(point);
  vColor = rainLight(point + vec3(0.0, 0.6, 0.0), normalize(cameraPosition - point));
  vWorld = point;
  vCorner = corner;
  vSeed = aSeed.w;
}
`;

export const MIST_FRAGMENT: string = `
uniform float uTime;
uniform float uStrength;
uniform vec2 uWind;
uniform float uDrift;
varying vec2 vCorner;
varying vec3 vWorld;
varying vec3 vColor;
varying float vFade;
varying float vSeed;

float mistNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(cell + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(cell + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(cell + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 flow = vWorld.xz * 0.22 - uWind * uDrift * uTime * 0.35 + vSeed * 19.0;
  float cloud = mistNoise(flow) * 0.65 + mistNoise(flow * 2.3 + 7.0) * 0.35;
  float round_ = 1.0 - smoothstep(0.35, 1.0, length(vCorner));
  float alpha = uStrength * vFade * round_ * smoothstep(0.3, 0.8, cloud);
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(vColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
