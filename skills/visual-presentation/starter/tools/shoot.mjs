#!/usr/bin/env node
// Screenshot every beat of every scene (at the end of the beat, and mid-beat with --mid),
// plus every transition at p=0.5, into shots/. Then builds shots/contact.png in the browser.
//
// Usage: node tools/shoot.mjs [--mid] [--size 1280x720] [--scene id]
// Env: PLAYWRIGHT=/path/to/playwright  DECK=dist/deck.html  CHROMIUM_PATH=/usr/bin/chromium
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadPlaywright, launch, deckUrl, ROOT } from './pw.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
const [W, H] = val('--size', '1280x720').split('x').map(Number);
const only = val('--scene', null);
const OUT = join(ROOT, 'shots');

const pw = await loadPlaywright();
const browser = await launch(pw);
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(deckUrl('shoot&quick'));
const ok = await page.evaluate(() => window.deck.ready.then(() => true, (e) => String(e)));
if (ok !== true) {
  console.error('deck failed to start:', ok, errors.join('\n'));
  await browser.close();
  process.exit(1);
}
const scenes = await page.evaluate(() => window.deck.scenes);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const shots = [];
async function grab(name, label) {
  const buf = await page.locator('#stage').screenshot({ type: 'png' });
  writeFileSync(join(OUT, name), buf);
  shots.push({ name, label, data: buf.toString('base64') });
}

for (const [si, sc] of scenes.entries()) {
  if (only && sc.id !== only) continue;
  for (let b = 0; b < sc.beats; b++) {
    const tag = `${String(si + 1).padStart(2, '0')}-${sc.id}-b${b + 1}`;
    if (flag('--mid')) {
      await page.evaluate(([id, b]) => window.deck.seek(id, b, 0.5), [sc.id, b]);
      await grab(`${tag}-mid.png`, `${sc.id} · beat ${b + 1} · 0.5 s`);
    }
    await page.evaluate(([id, b]) => window.deck.seek(id, b, Infinity), [sc.id, b]);
    await grab(`${tag}.png`, `${sc.id} · beat ${b + 1}`);
  }
  const next = scenes[si + 1];
  if (next && !only) {
    await page.evaluate(([a, b]) => window.deck.seekTransition(a, b, 0.5), [sc.id, next.id]);
    await grab(`${String(si + 1).padStart(2, '0')}-${sc.id}-to-${next.id}.png`, `${sc.id} → ${next.id} · p 0.5`);
  }
}

// Contact sheet, composed on a 2D canvas inside the same browser.
const sheet = await page.evaluate(async (shots) => {
  const cols = 4;
  const tw = 400;
  const th = 225;
  const pad = 10;
  const lab = 22;
  const rows = Math.ceil(shots.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * (tw + pad) + pad;
  c.height = rows * (th + lab + pad) + pad;
  const g = c.getContext('2d');
  g.fillStyle = '#111318';
  g.fillRect(0, 0, c.width, c.height);
  g.font = '13px system-ui, sans-serif';
  for (const [i, s] of shots.entries()) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + s.data;
    await img.decode();
    const x = pad + (i % cols) * (tw + pad);
    const y = pad + Math.floor(i / cols) * (th + lab + pad);
    g.drawImage(img, x, y, tw, th);
    g.fillStyle = '#c9c4ba';
    g.fillText(s.label, x + 2, y + th + 16);
  }
  return c.toDataURL('image/png').split(',')[1];
}, shots);
writeFileSync(join(OUT, 'contact.png'), Buffer.from(sheet, 'base64'));

// Cheap automated look: flag frames that are (almost) entirely black.
const dark = await page.evaluate(async (shots) => {
  const bad = [];
  for (const s of shots) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + s.data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 36;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, 64, 36);
    const d = g.getImageData(0, 0, 64, 36).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    if (sum / (d.length / 4) / 3 < 3) bad.push(s.name);
  }
  return bad;
}, shots);

await browser.close();
console.log(`${shots.length} shots + contact.png in shots/`);
if (dark.length) console.warn('near-black frames:', dark.join(', '));
if (errors.length) {
  console.error('console errors:\n' + errors.join('\n'));
  process.exit(1);
}
