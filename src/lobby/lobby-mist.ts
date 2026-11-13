import type { Camera, Object3D, Texture, WebGLRenderer } from 'three';
import { BufferAttribute, BufferGeometry, LinearFilter, Mesh, OrthographicCamera, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget } from 'three';

export const LOBBY_MIST = {
  lightAboveTop: 0.14,
  lightLean: 0.03,
  aimHeight: 1.7,
  renderScale: 0.5,
  maxPixelRatio: 2,
  maxPixels: 900_000,
} as const;

export interface MistAnchor {
  readonly light: readonly [x: number, y: number];
  readonly target: readonly [x: number, y: number];
}

export interface MistSize {
  readonly width: number;
  readonly height: number;
}

export interface LobbyMist {
  readonly texture: Texture;
  draw(renderer: WebGLRenderer, dt: number, cssWidth: number, cssHeight: number, pixelRatio: number, camera: Camera, head: Object3D | null): void;
}

export const MIST_VERTEX: string = `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const MIST_FRAGMENT: string = `
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uLight;
uniform vec2 uTarget;

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
  for (int i = 0; i < 5; i++) {
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
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 lightAt = vec2(uLight.x * aspect, uLight.y);
  vec2 targetAt = vec2(uTarget.x * aspect, uTarget.y);
  float t = uTime;

  float warp = fbm(p * 1.5 + vec2(t * 0.021, -t * 0.013));
  float fog = fbm(p * 2.3 + warp * 1.9 + vec2(-t * 0.034, t * 0.011));
  float low = 1.0 - smoothstep(0.05, 1.0, uv.y);
  float mist = smoothstep(0.3, 0.9, fog) * (0.22 + 0.78 * low);

  vec2 axis = normalize(targetAt - lightAt);
  vec2 d = p - lightAt;
  float along = dot(d, axis);
  float across = dot(d, vec2(-axis.y, axis.x));
  float reachIn = max(along, 0.0);
  float spread = (0.06 + reachIn * 0.36) * clamp(aspect, 0.5, 1.0);
  float cone = (1.0 - smoothstep(0.0, spread, abs(across))) * smoothstep(-0.02, 0.14, along);
  float angle = across / (along + 0.3);
  float streak = 0.62 + 0.38 * noise(vec2(angle * 24.0 + t * 0.05, t * 0.06));
  streak *= 0.8 + 0.2 * noise(vec2(angle * 63.0 - t * 0.04, 3.0));
  float shaft = cone * streak * exp(-reachIn * 1.05);
  float halo = exp(-dot(d, d) * 4.5);

  vec3 nightLow = vec3(0.020, 0.024, 0.034);
  vec3 nightHigh = vec3(0.036, 0.050, 0.074);
  vec3 storm = vec3(0.56, 0.68, 0.92);
  vec3 pale = vec3(0.88, 0.93, 1.0);
  vec3 ember = vec3(0.62, 0.48, 0.36);

  vec3 col = mix(nightLow, nightHigh, smoothstep(0.25, 1.0, uv.y));
  col += ember * 0.04 * (1.0 - smoothstep(0.0, 0.45, uv.y)) * (0.4 + fog);
  col += vec3(0.42, 0.50, 0.62) * mist * 0.17;
  col += storm * shaft * (0.16 + 0.6 * fog);
  col += pale * shaft * shaft * 0.3;
  col += storm * halo * 0.16;

  float dust = motes(p, t, 13.0, 0.35) + 0.6 * motes(p + 4.7, t, 23.0, 0.22);
  col += pale * dust * (0.1 + 1.6 * shaft);

  col += (hash(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) * (1.5 / 255.0);
  gl_FragColor = vec4(col * col, 1.0);
}
`;

export function mistAnchor(target: readonly [x: number, y: number]): MistAnchor {
  return { light: [target[0] + LOBBY_MIST.lightLean, 1 + LOBBY_MIST.lightAboveTop], target };
}

export function mistSize(cssWidth: number, cssHeight: number, pixelRatio: number): MistSize {
  const ratio: number = Math.min(Math.max(pixelRatio, 1), LOBBY_MIST.maxPixelRatio) * LOBBY_MIST.renderScale;
  const wanted: number = cssWidth * ratio * cssHeight * ratio;
  const shrink: number = wanted > LOBBY_MIST.maxPixels ? Math.sqrt(LOBBY_MIST.maxPixels / wanted) : 1;
  return { width: Math.max(1, Math.round(cssWidth * ratio * shrink)), height: Math.max(1, Math.round(cssHeight * ratio * shrink)) };
}

export function createLobbyMist(): LobbyMist {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const resolution: Vector2 = new Vector2(1, 1);
  const light: Vector2 = new Vector2();
  const target: Vector2 = new Vector2();
  const time: { value: number } = { value: 0 };
  const material: ShaderMaterial = new ShaderMaterial({
    vertexShader: MIST_VERTEX,
    fragmentShader: MIST_FRAGMENT,
    uniforms: { uRes: { value: resolution }, uTime: time, uLight: { value: light }, uTarget: { value: target } },
    depthTest: false,
    depthWrite: false,
  });
  const quad: Mesh = new Mesh(geometry, material);
  quad.frustumCulled = false;
  const stage: Scene = new Scene();
  stage.add(quad);
  const flat: OrthographicCamera = new OrthographicCamera();
  const surface: WebGLRenderTarget = new WebGLRenderTarget(1, 1, { depthBuffer: false, magFilter: LinearFilter, minFilter: LinearFilter });
  const aim: Vector3 = new Vector3();
  return {
    texture: surface.texture,
    draw(renderer: WebGLRenderer, dt: number, cssWidth: number, cssHeight: number, pixelRatio: number, camera: Camera, head: Object3D | null): void {
      time.value += dt;
      const size: MistSize = mistSize(cssWidth, cssHeight, pixelRatio);
      if (surface.width !== size.width || surface.height !== size.height) surface.setSize(size.width, size.height);
      resolution.set(size.width, size.height);
      if (head === null) aim.set(0, LOBBY_MIST.aimHeight, 0);
      else head.getWorldPosition(aim);
      aim.project(camera);
      const anchor: MistAnchor = mistAnchor([(aim.x + 1) / 2, (aim.y + 1) / 2]);
      light.set(anchor.light[0], anchor.light[1]);
      target.set(anchor.target[0], anchor.target[1]);
      const previous: WebGLRenderTarget | null = renderer.getRenderTarget();
      renderer.setRenderTarget(surface);
      renderer.render(stage, flat);
      renderer.setRenderTarget(previous);
    },
  };
}
