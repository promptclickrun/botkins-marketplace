// Thin WebGL2 helpers: programs, uniforms, float render targets, full-screen passes.
import { FULL_VS, FRAG_HEADER, VERT_HEADER } from './glsl.js';

const DEBUG = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);

export function createGL(canvas, { preserve = false } = {}) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: preserve,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;
  const floatOK = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  return { gl, floatOK, emptyVAO: gl.createVertexArray() };
}

function compile(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh) || '';
    const lines = src.split('\n');
    const m = /ERROR: \d+:(\d+)/.exec(log);
    const at = m ? `\n> ${lines[+m[1] - 1]}` : '';
    throw new Error(`[${label}] shader compile failed:\n${log}${at}`);
  }
  return sh;
}

export function makeProgram(gl, vsBody, fsBody, label = 'program') {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT_HEADER + vsBody, label + '.vs'));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FRAG_HEADER + fsBody, label + '.fs'));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`[${label}] link failed: ${gl.getProgramInfoLog(p)}`);
  }
  p.label = label;
  p.loc = new Map();
  return p;
}

export const fullProgram = (gl, fsBody, label) => makeProgram(gl, FULL_VS, fsBody, label);

// Set uniforms from a plain object. number -> float, [2..4] -> vec, {i:n} -> int,
// {tex} -> sampler2D, {f: [..]} -> float[] (use this for float arrays of any length),
// Float32Array(9|16) -> mat3/mat4.
export function setUniforms(gl, prog, u) {
  let unit = 0;
  for (const name in u) {
    const v = u[name];
    let loc = prog.loc.get(name);
    if (loc === undefined) {
      loc = gl.getUniformLocation(prog, name);
      prog.loc.set(name, loc);
    }
    if (loc === null || v === undefined) continue;
    if (typeof v === 'number') gl.uniform1f(loc, v);
    else if (v && v.tex !== undefined) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, v.tex.tex || v.tex);
      gl.uniform1i(loc, unit++);
    } else if (v && v.i !== undefined) gl.uniform1i(loc, v.i);
    else if (v && v.f !== undefined) gl.uniform1fv(loc, v.f);
    else if (v instanceof Float32Array && v.length === 16) gl.uniformMatrix4fv(loc, false, v);
    else if (v instanceof Float32Array && v.length === 9) gl.uniformMatrix3fv(loc, false, v);
    else if (v.length === 2) gl.uniform2fv(loc, v);
    else if (v.length === 3) gl.uniform3fv(loc, v);
    else if (v.length === 4) gl.uniform4fv(loc, v);
    else gl.uniform1fv(loc, v);
    if (DEBUG) {
      const e = gl.getError();
      if (e) console.warn(`[gl] uniform ${name} in ${prog.label}: error 0x${e.toString(16)}`);
    }
  }
}

// A colour render target. HDR (RGBA16F) when the GPU allows it, RGBA8 otherwise.
export function makeTarget(gl, w, h, { hdr = true, floatOK = true } = {}) {
  const t = { w: 0, h: 0, tex: gl.createTexture(), fbo: gl.createFramebuffer(), hdr: hdr && floatOK };
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  resizeTarget(gl, t, w, h);
  return t;
}

export function resizeTarget(gl, t, w, h) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (t.w === w && t.h === h) return t;
  t.w = w;
  t.h = h;
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  if (t.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return t;
}

export function bindTarget(gl, t, clear = true) {
  if (t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.w, t.h);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }
  if (clear) {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}

// Draw one full-screen triangle with a program.
export function drawFull(gl, vao, prog, uniforms) {
  gl.useProgram(prog);
  setUniforms(gl, prog, uniforms);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function textureFromImage(gl, img) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}
