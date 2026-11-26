// Synthesized sound. No files, no timers: the deck calls play() when a beat crosses a cue
// threshold while playing forward. Everything is tuned to one root note so cues never clash.
// The context is created on the first user gesture (browsers require it) and starts muted
// until then; M toggles mute.

const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24]; // minor pentatonic degrees, in semitones

export function createAudio({ root = 110, volume = 0.5 } = {}) {
  let ctx = null;
  let master = null;
  let verb = null;
  let muted = false;
  let unlocked = false;
  const listeners = new Set();

  const note = (deg = 0, oct = 0) => {
    const i = ((deg % SCALE.length) + SCALE.length) % SCALE.length;
    const extra = Math.floor(deg / SCALE.length);
    return root * Math.pow(2, (SCALE[i] + 12 * (oct + extra)) / 12);
  };

  function unlock() {
    if (unlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    // Cheap reverb: a decaying noise impulse, generated from a seeded hash, not Math.random.
    verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let x = 0x1234567 + c * 977;
      for (let i = 0; i < len; i++) {
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        d[i] = (((x >>> 0) / 4294967296) * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
    }
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    verb.connect(wet).connect(master);
    master.connect(ctx.destination);
    unlocked = true;
    emit();
  }

  function out() {
    const g = ctx.createGain();
    g.connect(master);
    g.connect(verb);
    return g;
  }

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function tone(freq, { type = 'sine', a = 0.005, d = 0.4, peak = 0.3, at = 0, detune = 0 } = {}) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    env(g, t, a, peak, d);
    o.connect(g).connect(out());
    o.start(t);
    o.stop(t + a + d + 0.05);
  }

  function noise({ d = 0.6, from = 400, to = 4000, q = 1.2, peak = 0.25, at = 0 } = {}) {
    const t = ctx.currentTime + at;
    const len = Math.floor(ctx.sampleRate * (d + 0.1));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let x = 0x2545f491;
    for (let i = 0; i < len; i++) {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      data[i] = ((x >>> 0) / 4294967296) * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + d);
    const g = ctx.createGain();
    env(g, t, d * 0.45, peak, d * 0.55);
    src.connect(f).connect(g).connect(out());
    src.start(t);
    src.stop(t + d + 0.1);
  }

  const SOUNDS = {
    // A soft chord that rises in. Use under titles.
    swell: (o) => [0, 2, 4, 6].forEach((deg, i) =>
      tone(note(deg + (o.deg || 0), 1), { type: 'triangle', a: 0.6 + i * 0.08, d: 2.4, peak: 0.07, detune: (i - 1.5) * 6 })),
    // A short pitched tick. o.deg picks a scale degree: rising counters climb the scale.
    tick: (o) => tone(note(o.deg || 0, 3), { type: 'sine', a: 0.002, d: 0.09, peak: 0.12 }),
    // A low hit for a reveal or a big number.
    hit: (o) => {
      tone(note(o.deg || 0, -1), { type: 'sine', a: 0.004, d: 0.9, peak: 0.45 });
      tone(note((o.deg || 0) + 4, 1), { type: 'triangle', a: 0.004, d: 0.5, peak: 0.06 });
      noise({ d: 0.25, from: 2000, to: 300, q: 0.7, peak: 0.08 });
    },
    // A bright, airy bell for the payoff.
    chime: (o) => [0, 4, 7].forEach((deg, i) =>
      tone(note(deg + (o.deg || 0), 2), { type: 'sine', a: 0.003, d: 1.6 - i * 0.3, peak: 0.09, at: i * 0.06 })),
    // Filtered noise rising: under transitions.
    whoosh: (o) => noise({ d: o.dur || 0.9, from: 250, to: 5000, q: 1.6, peak: 0.12 }),
  };

  function play(name, opts = {}) {
    if (!unlocked || muted || !ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    const fn = SOUNDS[name];
    if (!fn) return false;
    fn(opts);
    return true;
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : volume, ctx.currentTime, 0.03);
    emit();
  }

  function emit() {
    for (const f of listeners) f({ muted, unlocked });
  }

  return {
    unlock,
    play,
    note,
    define: (name, fn) => (SOUNDS[name] = fn),
    get muted() { return muted; },
    get unlocked() { return unlocked; },
    toggleMute: () => setMuted(!muted),
    setMuted,
    onChange: (f) => listeners.add(f),
  };
}
