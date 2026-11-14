import type { Camera } from 'three';
import { AdditiveBlending, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from 'three';

export const LOBBY_SHAFT = {
  foot: [0, 0, 0],
  behind: 0.45,
  across: 3.4,
  below: 0.5,
  tall: 9,
  order: 5,
} as const;

export const SHAFT_VERTEX: string = `
varying vec2 vAt;

void main() {
  vAt = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SHAFT_FRAGMENT: string = `
uniform float uTime;
varying vec2 vAt;

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
  float amp = 0.5;
  float sum = 0.0;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p = p * 2.02 + vec2(17.1, 9.2);
    amp *= 0.5;
  }
  return sum;
}

float motes(vec2 p, float t, float scale, float speed) {
  vec2 g = p * scale;
  g.y -= t * speed;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float r = hash(id);
  vec2 o = vec2(hash(id + 3.1) - 0.5, hash(id + 7.7) - 0.5) * 0.7;
  o.x += sin(t * 0.6 + r * 40.0) * 0.12;
  float twinkle = 0.6 + 0.4 * sin(t * 1.7 + r * 50.0);
  return step(0.6, r) * twinkle * (1.0 - smoothstep(0.0, 0.08, length(f - o)));
}

void main() {
  float t = uTime;
  float high = vAt.y;
  float wide = mix(1.3, 0.85, clamp(high / 6.0, 0.0, 1.0));
  float angle = vAt.x / wide;
  float cone = (1.0 - smoothstep(0.0, 1.0, abs(angle))) * smoothstep(-0.4, 0.35, high) * (1.0 - smoothstep(6.4, 8.3, high));
  float streak = 0.62 + 0.38 * noise(vec2(angle * 9.0 + t * 0.05, t * 0.06));
  streak *= 0.8 + 0.2 * noise(vec2(angle * 23.0 - t * 0.04, 3.0));
  float veil = fbm(vec2(angle * 2.2, high * 0.9 - t * 0.05));
  float shaft = cone * streak * exp(-max(0.0, 3.2 - high) * 0.3) * 1.7;

  vec3 storm = vec3(0.56, 0.68, 0.92);
  vec3 pale = vec3(0.88, 0.93, 1.0);
  vec3 col = storm * shaft * (0.16 + 0.6 * veil);
  col += pale * shaft * shaft * 0.3;
  vec2 air = vAt * 0.37;
  float dust = motes(air, t, 13.0, 0.35) + 0.6 * motes(air + 4.7, t, 23.0, 0.22);
  col += pale * dust * 1.6 * shaft;
  gl_FragColor = vec4(col * col, 1.0);
}
`;

export interface ShaftPlace {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export function shaftPlace(cameraX: number, cameraZ: number): ShaftPlace {
  const [footX, , footZ] = LOBBY_SHAFT.foot;
  const awayX: number = footX - cameraX;
  const awayZ: number = footZ - cameraZ;
  const far: number = Math.hypot(awayX, awayZ);
  if (far <= 0) return { x: footX, z: footZ, yaw: 0 };
  return { x: footX + (awayX / far) * LOBBY_SHAFT.behind, z: footZ + (awayZ / far) * LOBBY_SHAFT.behind, yaw: Math.atan2(-awayX, -awayZ) };
}

export interface LobbyShaft {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  step(dt: number, camera: Camera): void;
}

export function createLobbyShaft(): LobbyShaft {
  const geometry: PlaneGeometry = new PlaneGeometry(LOBBY_SHAFT.across, LOBBY_SHAFT.tall);
  geometry.translate(0, LOBBY_SHAFT.tall / 2 - LOBBY_SHAFT.below, 0);
  const time: { value: number } = { value: 0 };
  const material: ShaderMaterial = new ShaderMaterial({
    vertexShader: SHAFT_VERTEX,
    fragmentShader: SHAFT_FRAGMENT,
    uniforms: { uTime: time },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  const mesh: Mesh<PlaneGeometry, ShaderMaterial> = new Mesh(geometry, material);
  mesh.renderOrder = LOBBY_SHAFT.order;
  mesh.frustumCulled = false;
  return {
    mesh,
    step(dt: number, camera: Camera): void {
      time.value += dt;
      const place: ShaftPlace = shaftPlace(camera.position.x, camera.position.z);
      mesh.position.set(place.x, LOBBY_SHAFT.foot[1], place.z);
      mesh.rotation.y = place.yaw;
    },
  };
}
