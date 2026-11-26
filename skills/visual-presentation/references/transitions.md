# Transitions

A transition is a shader that combines two **finished frames**: A (the outgoing scene, post and text done) and B (the incoming scene). It is a pure function of `p` in 0..1.

## Contract

```js
defineTransition({
  name: 'wipe',
  dur: 1.1,                 // seconds forward; Back plays it reversed at 60% of this
  sound: 'whoosh',          // optional; null for silence
  uniforms: ({ from, to, fromState, opts, aspect, toUv, frameToUvY }) => ({ uAngle: opts.angle ?? 0.3 }),
  glsl: `
    uniform float uAngle;
    vec4 transition(vec2 uv, float p) { ... return mix(A(uv), B(uv), m); }
  `,
});
```

- `A(uv)` and `B(uv)` sample the two frames; `uv` is 0..1 with y up; `uAspect` = width / height.
- The engine wrapper returns **exactly A when p ≤ 0 and exactly B when p ≥ 1**. Your function only runs in between. So there is never a jump at the start or end.
- Still, design your function so it is A at p→0 and B at p→1. Check this by shooting `seekTransition(a, b, 0.02)` and `0.98`.
- Both scenes **keep animating** during the transition: A runs past its last beat with `s.exit = p`; B is at its first moment with `s.enter = p`. Use them for extra motion (A drifts out, B's light rises).
- Choose the transition per scene with `transitionOut: 'name'` or `{ name, dur, opts }`. In reduced-motion mode every transition becomes a 0.35 s crossfade.
- **Hooks**: a scene can expose geometry to its outgoing transition (`hooks.portal(s) → {x, y, r}` in centred frame units). Use `toUv(x, y)` and `frameToUvY` to convert to uv.

## Rules

1. One family of transitions per talk (2–3 kinds at most). Each kind should mean something: push = "next step", portal = "go inside", dissolve = "zoom into detail".
2. Duration 0.8–1.4 s. Faster for small steps, slower for big shifts.
3. Ease inside the shader (`p*p*(3-2p)` or a cubic). The deck advances `p` linearly.
4. At p=0.5 the frame must still look composed. Shoot it.
5. The best transition is a **match**: the last frame of A already looks like the first frame of B (same colour field, same object position). The shader only finishes the job.

## Recipes

All of these are in `starter/src/transitions/`.

### 1. Crossfade (luminance-biased)

```glsl
vec4 transition(vec2 uv, float p) {
  vec4 a = A(uv), b = B(uv);
  float bias = (luma(b.rgb) - luma(a.rgb)) * 0.35;     // bright parts of B arrive first
  float t = smoothstep(0.0, 1.0, clamp(p + bias * p * (1.0 - p) * 4.0, 0.0, 1.0));
  return mix(a, b, t);
}
```
Bias is zero at both ends (`p(1−p)`), so the endpoints are exact. Use it as the default and for reduced motion.

### 2. Iris / portal

```glsl
uniform vec2 uCenter; uniform float uR0;      // from hooks.portal, in uv
vec4 transition(vec2 uv, float p) {
  float e = p * p * (3.0 - 2.0 * p);
  vec2 d = (uv - uCenter) * vec2(uAspect, 1.0);
  float far = length(max(abs(uCenter), abs(1.0 - uCenter)) * vec2(uAspect, 1.0)) + 0.05;
  float r = mix(uR0, far, e);
  vec4 b = B(uCenter + (uv - uCenter) / mix(1.35, 1.0, e));     // B seen magnified through the hole
  vec4 a = A(uCenter + (uv - uCenter) * mix(1.0, 0.9, e));      // A pulled inward
  float edge = 0.004 + 0.02 * (1.0 - e);
  float m = smoothstep(r + edge, r - edge, length(d));
  float rim = exp(-pow((length(d) - r) / (edge * 2.5 + 0.002), 2.0)) * (1.0 - e) * 0.6;
  return vec4(mix(a.rgb, b.rgb, m) + rim, 1.0);
}
```
Starts at the radius the scene drew, so the door in A becomes the whole frame. Make B's first frame look like the inside of the door (see `05-close.js`, which starts from the same swirl).

### 3. Push / shove with motion smear

```glsl
uniform vec2 uDir;                              // (1,0) left, (0,1) up
vec4 transition(vec2 uv, float p) {
  float e = p < 0.5 ? 4.0*p*p*p : 1.0 - pow(-2.0*p + 2.0, 3.0) / 2.0;
  float speed = 6.0 * p * (1.0 - p);            // 0 at the ends
  vec3 c = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    vec2 q = uv + uDir * (e + (float(i) / 5.0 - 0.5) * 0.012 * speed);
    c += dot(q, uDir) >= 1.0 ? B(q - uDir).rgb : A(q).rgb;
  }
  return vec4(c / 6.0, 1.0);
}
```
Keep the smear small (≈1% of the frame). More looks like a bug, not motion blur.

### 4. Soft-edged wipe

```glsl
uniform float uAngle, uSoft;
vec4 transition(vec2 uv, float p) {
  vec2 dir = vec2(cos(uAngle), sin(uAngle));
  vec2 q = (uv - 0.5) * vec2(uAspect, 1.0);
  float span = abs(dir.x) * uAspect * 0.5 + abs(dir.y) * 0.5;
  float x = dot(q, dir) / span * 0.5 + 0.5 + (fbm(uv * vec2(uAspect, 1.0) * 3.0) - 0.5) * uSoft * 0.8;
  float edge = mix(-uSoft, 1.0 + uSoft, p);       // starts fully off-frame, ends fully past it
  float m = smoothstep(edge + uSoft, edge - uSoft, x);
  float glow = (1.0 - abs(m * 2.0 - 1.0)) * 0.35; // light along the edge
  return vec4(mix(A(uv).rgb, B(uv).rgb, m) + glow, 1.0);
}
```
The edge range `[-soft, 1+soft]` makes sure p=0 and p=1 are clean.

### 5. Pixel dissolve / noise

```glsl
vec4 transition(vec2 uv, float p) {
  float cells = mix(18.0, 140.0, p);                         // chunky → fine
  vec2 g = floor(uv * vec2(cells * uAspect, cells));
  float order = mix(hash12(g + floor(cells)), vnoise(uv * vec2(uAspect, 1.0) * 6.0), 0.55);
  return mix(A(uv), B(uv), step(order, p * 1.08 - 0.04));
}
```
Mixing hash with smooth noise gives clusters instead of TV static. Good for "zoom into detail" or digital topics.

### 6. Zoom-through

```glsl
uniform vec2 uCenter;
vec4 transition(vec2 uv, float p) {
  float e = p * p * (3.0 - 2.0 * p);
  float sA = exp(mix(0.0, log(6.0), e));       // A: 1x → 6x, linear in log space
  float sB = exp(mix(log(0.4), 0.0, e));       // B: 0.4x → 1x
  float blur = sin(PI * p) * 0.12;
  vec3 a = vec3(0.0), b = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float k = 1.0 - blur * float(i) / 7.0;     // radial blur taps
    a += A(uCenter + (uv - uCenter) / (sA / k)).rgb;
    b += B(uCenter + (uv - uCenter) / (sB / k)).rgb;
  }
  float m = smoothstep(0.35, 0.65, p);
  return vec4(mix(a / 8.0, b / 8.0, m) + pow(sin(PI * p), 6.0) * 0.25, 1.0);
}
```
Set `opts.center` to the thing you fly into. Note B is sampled at 0.4× early on; with clamp-to-edge its edges smear. That is hidden by the blur and the crossover at p≈0.5.

### More ideas (write them the same way)

- **Light leak**: add a moving warm gradient (`exp(-length(uv - path(p)) * 3.0) * bump(p)`) over a crossfade.
- **Shatter / cells**: Voronoi cells of A slide out with per-cell delays `hash12(cell)`.
- **Ink / smoke**: threshold an fbm field that advances with p, with a dark edge.
- **Morph**: no shader at all. A's last beat moves its shape to where B's first shape sits, and you crossfade for 0.3 s.

## Testing

```bash
node tools/shoot.mjs          # every transition at p=0.5 is in the contact sheet
```
```js
await deck.seekTransition('portal', 'close', 0.02);   // must look like A
await deck.seekTransition('portal', 'close', 0.98);   // must look like B
```
