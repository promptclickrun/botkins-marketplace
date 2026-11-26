// Scene definition and the pure state builder.
// A scene is a function of its state: render(ctx, s) must draw the same picture for the same s.
import { clamp, unmix, ease as E, hash } from './math.js';

export const beatAnimEnd = (b) => (b.delay || 0) + (b.dur ?? 1);
export const beatLen = (b) => beatAnimEnd(b) + (b.hold || 0);

export function defineScene(def) {
  if (!def.id) throw new Error('scene needs an id');
  if (!def.beats || !def.beats.length) throw new Error(`scene ${def.id} needs at least one beat`);
  const beats = def.beats.map((b) => ({ delay: 0, dur: 1, hold: 0, say: '', ...b }));
  return {
    title: def.id,
    notes: '',
    transitionOut: 'crossfade',
    grade: {},
    hooks: {},
    setup: () => ({}),
    render: null,
    text: null,
    ...def,
    beats,
  };
}

const NO_CUE = () => {};

// pos = { beat, t, sceneT?, retract?: { beat, t } }; env carries enter/exit/dir/mouse/q/motion.
export function makeState(scene, pos, env = {}) {
  const n = scene.beats.length;
  const beat = Math.max(0, Math.min(n - 1, pos.beat | 0));
  const bt = new Array(n).fill(0);
  const p = new Array(n).fill(0);
  let sceneT = 0;
  for (let i = 0; i < n; i++) {
    const B = scene.beats[i];
    if (i < beat) bt[i] = beatLen(B);
    else if (i === beat) bt[i] = Math.max(0, Math.min(pos.t ?? 0, beatLen(B)));
    if (pos.retract && i === pos.retract.beat) bt[i] = Math.max(0, pos.retract.t);
    p[i] = B.dur > 0 ? unmix(B.delay, B.delay + B.dur, bt[i]) : bt[i] >= B.delay ? 1 : 0;
    if (i < beat) sceneT += beatLen(B);
  }
  sceneT += Math.max(0, pos.t ?? 0);
  const s = {
    scene: scene.id,
    beat,
    n,
    p,
    bt,
    t: pos.sceneT ?? sceneT,
    enter: env.enter ?? 1,
    exit: env.exit ?? 0,
    dir: env.dir ?? 1,
    mouse: env.mouse || [0, 0],
    q: env.q ?? 1,
    motion: env.motion ?? 1,
    live: !!env.live,
    cue: env.cue || NO_CUE,
    hash,
    // Eased progress of beat i between t0 and t1 seconds of that beat's own clock.
    k(i, t0, t1, easeFn = E.inOutCubic) {
      if (i < 0 || i >= n) return 0;
      return easeFn(clamp(unmix(t0, t1, bt[i])));
    },
    // Eased sub-range of beat i's normalised progress p[i].
    kp(i, a = 0, b = 1, easeFn = E.inOutCubic) {
      if (i < 0 || i >= n) return 0;
      return easeFn(unmix(a, b, p[i]));
    },
  };
  return s;
}

// Position helpers.
export const startPos = () => ({ beat: 0, t: 0, sceneT: 0 });
export function endPos(scene) {
  const last = scene.beats.length - 1;
  let total = 0;
  for (const b of scene.beats) total += beatLen(b);
  return { beat: last, t: beatLen(scene.beats[last]), sceneT: total };
}
export function seekPos(scene, beat, t) {
  const b = Math.max(0, Math.min(scene.beats.length - 1, beat | 0));
  const len = beatLen(scene.beats[b]);
  // t may run past the beat's length: p stays at 1 but s.t keeps moving (idle drift in holds).
  const tt = t == null || t === Infinity ? len : Math.max(0, t);
  let sceneT = tt;
  for (let i = 0; i < b; i++) sceneT += beatLen(scene.beats[i]);
  return { beat: b, t: tt, sceneT };
}
