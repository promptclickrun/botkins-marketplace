// Deck controller: owns the clock, the position (scene, beat, t), transitions, warm-up,
// quality, cues and the headless hooks. Scenes never see the clock directly; they get a state.
import { createGL, makeTarget, resizeTarget, bindTarget, drawFull, fullProgram, makeProgram, setUniforms } from './gl.js';
import { createPost } from './post.js';
import { createText, FRAME_W } from './text.js';
import { createTransitions, getTransition } from './transitions.js';
import { makeState, startPos, endPos, seekPos, beatLen, beatAnimEnd } from './scene.js';
import { damp, clamp } from './math.js';

const MAX_W = 2560;
const MAX_H = 1600;
const BLIT = /* glsl */ `
in vec2 vUv;
uniform sampler2D uSrc;
void main() { o = texture(uSrc, vUv); }`;

export function createDeck({ canvas, scenes, audio, options = {} }) {
  const params = new URLSearchParams(location.search);
  const opt = {
    quick: params.has('quick'),
    autoplay: params.has('autoplay'),
    shoot: params.has('shoot'),
    still: params.has('still') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
    title: document.title || 'Deck',
    ...options,
  };

  const G = createGL(canvas, { preserve: opt.shoot });
  if (!G) throw new Error('WebGL2 is not available in this browser.');
  const { gl } = G;
  const post = createPost(G);
  const text = createText(G);
  const transitions = createTransitions(G);
  const blit = fullProgram(gl, BLIT, 'blit');

  // Two scene slots: HDR scene colour, then display-ready LDR after post + text.
  const slots = [0, 1].map(() => ({
    hdr: makeTarget(gl, 4, 4, { floatOK: G.floatOK }),
    ldr: makeTarget(gl, 4, 4, { hdr: false }),
  }));

  const byId = new Map(scenes.map((s, i) => [s.id, i]));
  const perScene = scenes.map(() => ({ data: null, ready: false, progs: new Map(), own: new Map(), parked: false }));
  const cuePrev = new Map();

  const st = {
    scene: 0,
    pos: startPos(),
    retract: null,
    tr: null,
    queue: 0,
    boost: 1,
    playing: false,
    black: false,
    mouse: [0, 0],
    mouseTarget: [0, 0],
    quality: 1,
    governor: !opt.shoot,
    slow: 0,
    fast: 0,
    autoplay: opt.autoplay,
    autoWait: 0,
    primeCues: true,
  };

  const listeners = new Set();
  const emit = (type) => {
    const info = snapshot();
    for (const f of listeners) f(type, info);
  };

  let W = 4;
  let H = 4;
  let IW = 4;
  let IH = 4;
  let frame = { x: 0, y: 0, w: 4, h: 4 };

  function measure() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    let h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    const k = Math.min(1, MAX_W / w, MAX_H / h);
    w = Math.floor(w * k);
    h = Math.floor(h * k);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    W = w;
    H = h;
    IW = Math.max(16, Math.round(W * st.quality));
    IH = Math.max(16, Math.round(H * st.quality));
    const fa = 16 / 9;
    if (IW / IH > fa) frame = { h: IH, w: IH * fa, x: (IW - IH * fa) / 2, y: 0 };
    else frame = { w: IW, h: IW / fa, x: 0, y: (IH - IW / fa) / 2 };
    for (const s of slots) {
      resizeTarget(gl, s.hdr, IW, IH);
      resizeTarget(gl, s.ldr, IW, IH);
    }
    perScene.forEach((ps, i) => {
      for (const [, o] of ps.own) if (!ps.parked) resizeTarget(gl, o.t, IW * o.scale, IH * o.scale);
    });
  }

  // ---------- scene context ----------
  function ctxFor(i, slot) {
    const ps = perScene[i];
    const base = {
      gl,
      G,
      text,
      audio,
      res: [IW, IH],
      frame,
      frameW: FRAME_W,
      aspect: IW / IH,
      quality: st.quality,
      data: ps.data,
      // Uniforms every full-screen scene shader can use.
      std: () => ({ uRes: [IW, IH], uFrame: [frame.x, frame.y, frame.w, frame.h] }),
      program(key, fs) {
        let p = ps.progs.get(key);
        if (!p) ps.progs.set(key, (p = fullProgram(gl, fs, `${scenes[i].id}.${key}`)));
        return p;
      },
      programVS(key, vs, fs) {
        let p = ps.progs.get(key);
        if (!p) ps.progs.set(key, (p = makeProgram(gl, vs, fs, `${scenes[i].id}.${key}`)));
        return p;
      },
      draw(prog, u = {}) {
        drawFull(gl, G.emptyVAO, prog, { ...base.std(), ...u });
      },
      use(prog, u = {}) {
        gl.useProgram(prog);
        setUniforms(gl, prog, { ...base.std(), ...u });
      },
      // A scene-owned HDR target at a fraction of the internal resolution. Parked when far away.
      target(name, scale = 0.5) {
        let o = ps.own.get(name);
        if (!o) {
          o = { t: makeTarget(gl, IW * scale, IH * scale, { floatOK: G.floatOK }), scale };
          ps.own.set(name, o);
        }
        if (ps.parked) {
          ps.parked = false;
          for (const [, x] of ps.own) resizeTarget(gl, x.t, IW * x.scale, IH * x.scale);
        }
        return o.t;
      },
      bind(t, clear = true) {
        bindTarget(gl, t || slot.hdr, clear);
      },
      blend(mode) {
        if (!mode) return gl.disable(gl.BLEND);
        gl.enable(gl.BLEND);
        if (mode === 'add') gl.blendFunc(gl.ONE, gl.ONE);
        else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      },
    };
    return base;
  }

  function ensureSetup(i) {
    const ps = perScene[i];
    if (ps.ready) return;
    ps.data = scenes[i].setup(ctxFor(i, slots[0])) || {};
    ps.ready = true;
  }

  // Shrink the private targets of scenes more than one step away; they regrow on demand.
  function park() {
    perScene.forEach((ps, i) => {
      const far = Math.abs(i - st.scene) > 1;
      if (far && !ps.parked && ps.own.size) {
        for (const [, o] of ps.own) resizeTarget(gl, o.t, 1, 1);
        ps.parked = true;
      }
    });
  }

  // ---------- cues ----------
  function cueFn(i, live, forward) {
    return (key, value, threshold, sound, opts) => {
      const k = scenes[i].id + '|' + key;
      const prev = cuePrev.get(k);
      if (live) cuePrev.set(k, value);
      if (!live || !forward || st.primeCues || prev === undefined) return false;
      if (prev < threshold && value >= threshold) {
        audio && audio.play(sound, opts || {});
        emit('cue');
        return true;
      }
      return false;
    };
  }

  function fireBeatCues(i, s) {
    const beats = scenes[i].beats;
    beats.forEach((b, bi) => {
      if (!b.cue) return;
      const c = typeof b.cue === 'string' ? { sound: b.cue, at: b.delay || 0 } : { at: b.delay || 0, ...b.cue };
      s.cue('beat' + bi, s.bt[bi], c.at + 1e-4, c.sound, c.opts);
    });
  }

  // ---------- rendering ----------
  function renderScene(i, pos, env, slot) {
    ensureSetup(i);
    const scene = scenes[i];
    const s = makeState(scene, pos, { ...env, mouse: env.mouse || st.mouse, q: st.quality, motion: opt.still ? 0 : 1 });
    const ctx = ctxFor(i, slot);
    if (env.live) fireBeatCues(i, s);
    bindTarget(gl, slot.hdr, true);
    ctx.drawing = false;
    scene.render(ctx, s);
    gl.disable(gl.BLEND);
    // Grain moves at 24 fps but from the scene clock, so screenshots are reproducible.
    const seed = i * 31 + Math.floor((s.t + 100) * 24);
    post.run(slot.hdr, slot.ldr, scene.grade, seed);
    text.begin(slot.ldr, frame);
    ctx.drawing = true;
    if (scene.text) scene.text(ctx, s);
    text.flush();
    return s;
  }

  function present(tex) {
    bindTarget(gl, null, false);
    drawFull(gl, G.emptyVAO, blit, { uSrc: { tex } });
  }

  function trDef(i) {
    const t = scenes[i].transitionOut;
    const spec = typeof t === 'string' ? { name: t } : t || { name: 'crossfade' };
    const def = getTransition(opt.still ? 'crossfade' : spec.name);
    return { def, spec, dur: opt.still ? 0.35 : spec.dur ?? def.dur };
  }

  function renderTransition(from, to, p, env) {
    const { def, spec } = trDef(from);
    const elapsed = p * (env.dur || 1);
    const ePos = endPos(scenes[from]);
    const fromPos = { ...ePos, t: ePos.t + elapsed, sceneT: ePos.sceneT + elapsed };
    const toPos = { beat: 0, t: 0, sceneT: (p - 1) * (env.dur || 1) };
    const sa = renderScene(from, fromPos, { ...env, exit: p, enter: 1, live: false }, slots[0]);
    renderScene(to, toPos, { ...env, enter: p, exit: 0, live: false }, slots[1]);
    const { prog } = transitions.program(def.name);
    bindTarget(gl, null, false);
    const extra = def.uniforms({
      from: scenes[from],
      to: scenes[to],
      fromState: sa,
      opts: spec.opts || {},
      aspect: IW / IH,
      // Centred frame units (y up, frame height 1) -> output uv (y up), and frame-height -> uv-y scale.
      toUv: (x, y) => [(frame.x + (x + FRAME_W / 2) * frame.h) / IW, 1 - (frame.y + (0.5 - y) * frame.h) / IH],
      frameToUvY: frame.h / IH,
    });
    drawFull(gl, G.emptyVAO, prog, {
      uA: { tex: slots[0].ldr },
      uB: { tex: slots[1].ldr },
      uP: clamp(p),
      uAspect: IW / IH,
      uRes: [W, H],
      uFrame: [0, 0, W, H],
      ...extra,
    });
  }

  function renderLive() {
    if (st.black) {
      bindTarget(gl, null, true);
      return;
    }
    if (st.tr) {
      renderTransition(st.tr.from, st.tr.to, st.tr.p, { dir: st.tr.dir, dur: st.tr.dur, live: true });
      return;
    }
    const pos = { ...st.pos, retract: st.retract || undefined };
    const s = renderScene(st.scene, pos, {
      live: true,
      dir: st.retract ? -1 : 1,
      cue: cueFn(st.scene, true, !st.retract),
    }, slots[0]);
    present(slots[0].ldr);
    st.primeCues = false;
    return s;
  }

  // ---------- clock ----------
  let last = 0;
  let raf = 0;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!st.playing) return;
    governor(dt);
    st.mouse = [damp(st.mouse[0], st.mouseTarget[0], 4, dt), damp(st.mouse[1], st.mouseTarget[1], 4, dt)];
    step(dt);
    renderLive();
  }

  function step(dt) {
    if (st.tr) {
      const tr = st.tr;
      tr.p += (dt * tr.speed * tr.dir) / tr.dur;
      if ((tr.dir > 0 && tr.p >= 1) || (tr.dir < 0 && tr.p <= 0)) finishTransition();
      return;
    }
    const scene = scenes[st.scene];
    const beat = scene.beats[st.pos.beat];
    if (st.retract) {
      st.retract.t -= dt * (beatAnimEnd(scene.beats[st.retract.beat]) / 0.35);
      if (st.retract.t <= 0) st.retract = null;
    }
    const speed = st.boost * (opt.still ? 3 : 1);
    st.pos.t += dt * speed;
    st.pos.sceneT += dt * speed;
    const animEnd = beatAnimEnd(beat);
    if (st.boost > 1 && st.pos.t >= animEnd) {
      st.boost = 1;
      if (st.queue > 0) {
        st.queue--;
        next();
      }
    }
    if (st.autoplay) {
      const wait = beatLen(beat) + (beat.hold ? 0 : 2.2);
      if (st.pos.t >= wait) next();
    }
  }

  function governor(dt) {
    if (!st.governor) return;
    if (dt > 1 / 40) st.slow++;
    else st.slow = Math.max(0, st.slow - 1);
    if (dt < 1 / 57) st.fast++;
    else st.fast = 0;
    if (st.slow > 20 && st.quality > 0.5) {
      st.quality = Math.max(0.5, st.quality * 0.85);
      st.slow = 0;
      measure();
      emit('quality');
    } else if (st.fast > 240 && st.quality < 1) {
      st.quality = Math.min(1, st.quality / 0.9);
      st.fast = 0;
      measure();
      emit('quality');
    }
  }

  function finishTransition() {
    const tr = st.tr;
    st.tr = null;
    if (tr.dir > 0) {
      st.scene = tr.to;
      st.pos = startPos();
    } else {
      st.scene = tr.from;
      st.pos = endPos(scenes[tr.from]);
    }
    st.primeCues = true;
    park();
    emit('scene');
    if (st.queue > 0) {
      st.queue--;
      next();
    }
  }

  // ---------- navigation ----------
  function next() {
    if (st.tr) {
      st.tr.speed = Math.min(st.tr.speed * 2, 6);
      if (st.tr.dir > 0) st.queue = Math.min(st.queue + 1, 3);
      return;
    }
    const scene = scenes[st.scene];
    const beat = scene.beats[st.pos.beat];
    if (st.retract) st.retract = null;
    if (st.pos.t < beatAnimEnd(beat) && !st.autoplay) {
      // Mid-beat: finish this one quickly, then advance.
      st.boost = 4;
      st.queue = Math.min(st.queue + 1, 2);
      return;
    }
    st.boost = 1;
    if (st.pos.beat < scene.beats.length - 1) {
      st.pos = { beat: st.pos.beat + 1, t: 0, sceneT: st.pos.sceneT };
      emit('beat');
    } else if (st.scene < scenes.length - 1) {
      const { def, dur } = trDef(st.scene);
      st.tr = { from: st.scene, to: st.scene + 1, p: 0, dir: 1, dur, speed: 1 };
      audio && def.sound !== null && audio.play(def.sound || 'whoosh', { dur });
      emit('transition');
    }
  }

  function prev() {
    st.queue = 0;
    st.boost = 1;
    if (st.tr) {
      // Reverse whatever is running.
      st.tr.dir = -st.tr.dir;
      st.tr.speed = 1.6;
      return;
    }
    if (st.pos.beat > 0) {
      const cur = st.pos.beat;
      const scene = scenes[st.scene];
      st.retract = { beat: cur, t: Math.min(st.pos.t, beatAnimEnd(scene.beats[cur])) };
      st.pos = seekPos(scene, cur - 1, beatLen(scene.beats[cur - 1]));
      st.primeCues = true;
      emit('beat');
    } else if (st.scene > 0) {
      const { dur } = trDef(st.scene - 1);
      // Going back replays the same transition reversed, and shorter.
      st.tr = { from: st.scene - 1, to: st.scene, p: 1, dir: -1, dur: dur * 0.6, speed: 1 };
      emit('transition');
    }
  }

  function jump(target, beat = 0, atEnd = false) {
    const i = typeof target === 'number' ? target : byId.get(target);
    if (i === undefined || i < 0 || i >= scenes.length) return false;
    st.tr = null;
    st.retract = null;
    st.queue = 0;
    st.boost = 1;
    st.scene = i;
    st.pos = atEnd ? endPos(scenes[i]) : seekPos(scenes[i], beat, 0);
    st.primeCues = true;
    park();
    emit('scene');
    return true;
  }

  // ---------- headless hooks ----------
  function freeze() {
    st.playing = false;
    st.governor = false;
    if (st.quality !== 1) {
      st.quality = 1;
      measure();
    }
  }

  function seek(sceneId, beat = 0, t = Infinity) {
    freeze();
    const i = typeof sceneId === 'number' ? sceneId : byId.get(sceneId);
    if (i === undefined) throw new Error('unknown scene ' + sceneId);
    st.scene = i;
    st.tr = null;
    st.retract = null;
    st.pos = seekPos(scenes[i], beat, t);
    renderScene(i, st.pos, { live: false }, slots[0]);
    present(slots[0].ldr);
    gl.finish();
    emit('seek');
    return snapshot();
  }

  function seekTransition(fromId, toId, p = 0.5) {
    freeze();
    const a = typeof fromId === 'number' ? fromId : byId.get(fromId);
    const b = typeof toId === 'number' ? toId : byId.get(toId);
    if (a === undefined || b === undefined) throw new Error('unknown scene');
    const { dur } = trDef(a);
    renderTransition(a, b, p, { dur, dir: 1 });
    gl.finish();
    return snapshot();
  }

  // ---------- warm-up ----------
  // Compiles every program and touches every beat and transition before the audience sees
  // anything, so the first real frame of each moment does not stutter.
  async function warm(onProgress) {
    const jobs = [];
    scenes.forEach((sc, i) => {
      if (opt.quick && i !== st.scene) return;
      sc.beats.forEach((b, bi) => {
        jobs.push(() => renderScene(i, seekPos(sc, bi, beatAnimEnd(b) * 0.5), { live: false }, slots[0]));
        jobs.push(() => renderScene(i, seekPos(sc, bi, Infinity), { live: false }, slots[0]));
      });
      if (i < scenes.length - 1 && !opt.quick) jobs.push(() => renderTransition(i, i + 1, 0.5, { dur: 1 }));
    });
    for (let k = 0; k < jobs.length; k++) {
      jobs[k]();
      gl.finish();
      onProgress && onProgress((k + 1) / jobs.length);
      if (k % 2 === 1) await new Promise((r) => requestAnimationFrame(r));
    }
  }

  // Thumbnail of every scene's last beat, for the overview grid.
  function thumbnails(w = 320) {
    const out = [];
    const h = Math.round((w * 9) / 16);
    scenes.forEach((sc, i) => {
      renderScene(i, endPos(sc), { live: false }, slots[0]);
      present(slots[0].ldr);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const fw = (frame.w / IW) * W;
      const fh = (frame.h / IH) * H;
      c.getContext('2d').drawImage(canvas, (frame.x / IW) * W, (frame.y / IH) * H, fw, fh, 0, 0, w, h);
      out.push(c);
    });
    return out;
  }

  function lint() {
    const issues = [];
    scenes.forEach((sc) => {
      if (!sc.render) issues.push(`${sc.id}: no render()`);
      sc.beats.forEach((b, bi) => {
        const words = (b.say || '').trim().split(/\s+/).filter(Boolean).length;
        if (words > 10) issues.push(`${sc.id} beat ${bi}: headline has ${words} words (max 10)`);
        if (b.dur > 2.5) issues.push(`${sc.id} beat ${bi}: dur ${b.dur}s is long; split it`);
      });
    });
    issues.forEach((m) => console.warn('[deck lint]', m));
    return issues;
  }

  // Plain HTML outline of the whole talk: for accessibility, handouts and review.
  function outline() {
    const esc = (x) => String(x || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const body = scenes.map((sc, i) => {
      const beats = sc.beats.map((b) => `<li>${esc(b.say)}${b.source ? ` <small>(${esc(b.source)})</small>` : ''}</li>`).join('');
      const notes = sc.notes ? `<p class="notes">${esc(sc.notes)}</p>` : '';
      const alt = sc.alt ? `<p class="alt">${esc(sc.alt)}</p>` : '';
      return `<section id="${esc(sc.id)}"><h2>${i + 1}. ${esc(sc.title)}</h2>${alt}<ol>${beats}</ol>${notes}</section>`;
    }).join('\n');
    return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(opt.title)} (outline)</title>` +
      `<style>body{font:18px/1.5 system-ui,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1rem;color:#111}` +
      `.notes{color:#444;border-left:3px solid #ccc;padding-left:.8rem}.alt{font-style:italic}</style>` +
      `<h1>${esc(opt.title)}</h1>\n${body}</html>`;
  }

  function snapshot() {
    const sc = scenes[st.scene];
    return {
      scene: sc.id,
      index: st.scene,
      beat: st.pos.beat,
      beats: sc.beats.length,
      t: st.pos.t,
      title: sc.title,
      say: sc.beats[st.pos.beat].say,
      source: sc.beats[st.pos.beat].source || '',
      notes: sc.notes,
      next: nextLabel(),
      transitioning: !!st.tr,
      quality: st.quality,
      black: st.black,
      autoplay: st.autoplay,
    };
  }

  function nextLabel() {
    const sc = scenes[st.scene];
    if (st.pos.beat < sc.beats.length - 1) return sc.beats[st.pos.beat + 1].say;
    const n = scenes[st.scene + 1];
    return n ? `→ ${n.title}: ${n.beats[0].say}` : '(end)';
  }

  // ---------- lifecycle ----------
  let readyResolve;
  const ready = new Promise((r) => (readyResolve = r));

  async function start(onProgress) {
    measure();
    new ResizeObserver(() => measure()).observe(canvas);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      st.playing = false;
      emit('lost');
    });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    text.reset();
    lint();
    const h = decodeURIComponent(location.hash.slice(1));
    if (h) {
      const [id, b] = h.split('/');
      if (byId.has(id)) jump(id, +b || 0);
    }
    for (let i = 0; i < scenes.length; i++) ensureSetup(i);
    await warm(onProgress);
    const thumbs = thumbnails();
    st.playing = !opt.shoot;
    st.primeCues = true;
    last = 0;
    raf = requestAnimationFrame(tick);
    if (opt.shoot) seek(st.scene, st.pos.beat, 0);
    readyResolve(api);
    emit('ready');
    return thumbs;
  }

  const api = {
    scenes: scenes.map((s) => ({ id: s.id, title: s.title, beats: s.beats.length, says: s.beats.map((b) => b.say) })),
    options: opt,
    ready,
    start,
    next,
    prev,
    jump,
    first: () => jump(0),
    last: () => jump(scenes.length - 1, 0, true),
    seek,
    seekTransition,
    resume() {
      st.playing = true;
      st.governor = !opt.shoot;
      last = 0;
    },
    pause: () => (st.playing = false),
    state: snapshot,
    outline,
    lint,
    thumbnails,
    setBlack(b) {
      st.black = b ?? !st.black;
      emit('black');
    },
    setAutoplay(a) {
      st.autoplay = a ?? !st.autoplay;
      emit('autoplay');
    },
    setPointer(x, y) {
      st.mouseTarget = [x, y];
    },
    on: (f) => listeners.add(f),
    get quality() {
      return st.quality;
    },
  };
  return api;
}
