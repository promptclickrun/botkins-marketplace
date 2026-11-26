// Transition contract: a shader that combines two finished frames A and B as a pure function of p.
// The wrapper guarantees the result is exactly A at p <= 0 and exactly B at p >= 1, so a
// transition can never leave a stray pixel behind when it starts or ends.
import { fullProgram } from './gl.js';

const registry = new Map();

// def = { name, dur, glsl, uniforms?(info) }. glsl must define: vec4 transition(vec2 uv, float p)
// It can sample A(uv) and B(uv), and use uAspect (width/height) and uRes.
export function defineTransition(def) {
  if (!def.name || !def.glsl) throw new Error('transition needs name and glsl');
  registry.set(def.name, { dur: 1.0, uniforms: () => ({}), ...def });
  return def;
}

export const getTransition = (name) => registry.get(name) || registry.get('crossfade');
export const transitionNames = () => [...registry.keys()];

const WRAP = (body) => /* glsl */ `
in vec2 vUv;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uP;
uniform float uAspect;
vec4 A(vec2 uv) { return texture(uA, uv); }
vec4 B(vec2 uv) { return texture(uB, uv); }
${body}
void main() {
  if (uP <= 0.0) { o = A(vUv); return; }
  if (uP >= 1.0) { o = B(vUv); return; }
  o = vec4(transition(vUv, uP).rgb, 1.0);
}`;

export function createTransitions(G) {
  const cache = new Map();
  function program(name) {
    const def = getTransition(name);
    let p = cache.get(def.name);
    if (!p) {
      p = fullProgram(G.gl, WRAP(def.glsl), 'transition.' + def.name);
      cache.set(def.name, p);
    }
    return { def, prog: p };
  }
  return { program };
}
