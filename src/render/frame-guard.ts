import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const FRAME_GUARD = {
  ceiling: 48,
} as const;

export const FRAME_GUARD_VERTEX: string = ['varying vec2 vUv;', 'void main() {', '  vUv = uv;', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);', '}'].join('\n');

export const FRAME_GUARD_FRAGMENT: string = [
  'uniform sampler2D tDiffuse;',
  'uniform float uCeiling;',
  'varying vec2 vUv;',
  'void main() {',
  '  vec4 texel = texture2D(tDiffuse, vUv);',
  '  uvec4 bits = floatBitsToUint(texel) & uvec4(0x7f800000u);',
  '  bool broken = any(equal(bits, uvec4(0x7f800000u)));',
  '  vec4 kept = vec4(clamp(texel.rgb, vec3(0.0), vec3(uCeiling)), clamp(texel.a, 0.0, 1.0));',
  '  gl_FragColor = broken ? vec4(0.0, 0.0, 0.0, 1.0) : kept;',
  '}',
].join('\n');

export function frameGuardPass(): ShaderPass {
  return new ShaderPass({ name: 'FrameGuard', uniforms: { tDiffuse: { value: null }, uCeiling: { value: FRAME_GUARD.ceiling } }, vertexShader: FRAME_GUARD_VERTEX, fragmentShader: FRAME_GUARD_FRAGMENT });
}
