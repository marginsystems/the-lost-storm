(() => {
  const P = WebGL2RenderingContext.prototype;
  const g = (window.__gl = { links: [], use: 0, draws: 0, uniforms: 0, tex: 0, vao: 0, frames: 0, marks: [] });
  const wrap = (name, onCall) => {
    const original = P[name];
    if (typeof original !== 'function') return;
    P[name] = function (...args) {
      onCall(this, args);
      return original.apply(this, args);
    };
  };
  wrap('linkProgram', (gl, [program]) => {
    const shaders = gl.getAttachedShaders(program) ?? [];
    const sources = shaders.map((s) => gl.getShaderSource(s) ?? '');
    const all = sources.join('\n');
    const pick = (re) => (all.match(re) ?? [])[1] ?? '';
    const defines = [...new Set((all.match(/#define (USE_SKINNING|USE_INSTANCING|USE_MAP|USE_NORMALMAP|USE_SHADOWMAP|USE_FOG|USE_ALPHAMAP|USE_EMISSIVEMAP|USE_ROUGHNESSMAP|USE_METALNESSMAP|USE_AOMAP|USE_COLOR|USE_ALPHATEST|DOUBLE_SIDED|FLIP_SIDED|USE_BATCHING|USE_ENVMAP|USE_TANGENT|USE_INSTANCING_COLOR|DEPTH_PACKING \d+|TONE_MAPPING|OPAQUE|USE_CLEARCOAT|USE_SPECULAR|USE_TRANSMISSION)\b/g) ?? []).map((d) => d.replace('#define ', '')))];
    const uniforms = [...new Set((sources[1] ?? sources[0] ?? '').match(/uniform \w+ (u[A-Z]\w+)/g) ?? [])].slice(0, 6).map((u) => u.split(' ').pop());
    g.links.push({ at: Math.round(performance.now()), frame: g.frames, name: pick(/#define SHADER_NAME (\S+)/), lights: [pick(/#define NUM_DIR_LIGHTS (\d+)/), pick(/#define NUM_POINT_LIGHTS (\d+)/), pick(/#define NUM_SPOT_LIGHTS (\d+)/), pick(/#define NUM_HEMI_LIGHTS (\d+)/), pick(/#define NUM_DIR_LIGHT_SHADOWS (\d+)/), pick(/#define NUM_POINT_LIGHT_SHADOWS (\d+)/)].join('/'), defines: defines.join(','), uniforms: uniforms.join(','), size: all.length });
  });
  wrap('useProgram', () => { g.use += 1; });
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) wrap(name, () => { g.draws += 1; });
  for (const name of Object.getOwnPropertyNames(P)) if (/^uniform(\d|Matrix)/.test(name)) wrap(name, () => { g.uniforms += 1; });
  wrap('bindTexture', () => { g.tex += 1; });
  wrap('bindVertexArray', () => { g.vao += 1; });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => raf((time) => { g.frames += 1; callback(time); });
  window.__glMark = (label) => { g.marks.push({ label, at: Math.round(performance.now()), frames: g.frames, use: g.use, draws: g.draws, uniforms: g.uniforms, tex: g.tex, vao: g.vao, links: g.links.length }); };
})();
