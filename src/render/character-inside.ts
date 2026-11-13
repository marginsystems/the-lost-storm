export const INSIDE_LIGHT = {
  direct: 0.2,
} as const;

export const CHARACTER_INSIDE: string = `#include <lights_fragment_end>\nif ( ! gl_FrontFacing ) {\n  reflectedLight.directDiffuse *= ${INSIDE_LIGHT.direct.toFixed(2)};\n  reflectedLight.directSpecular *= ${INSIDE_LIGHT.direct.toFixed(2)};\n}`;
