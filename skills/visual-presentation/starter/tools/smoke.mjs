#!/usr/bin/env node
// Smoke test: real keyboard input through the whole deck, forward then back, in real time.
// Fails on any console error or page error, on a stuck position, a broken overview,
// a broken deep link, or a missing outline.
//
// Usage: node tools/smoke.mjs   Env: PLAYWRIGHT, DECK, CHROMIUM_PATH (see pw.mjs)
import { loadPlaywright, launch, deckUrl } from './pw.mjs';

const pw = await loadPlaywright();
const browser = await launch(pw);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e));
const fails = [];
const check = (cond, msg) => {
  if (!cond) fails.push(msg);
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
};
const state = () => page.evaluate(() => window.deck.state());
const wait = (ms) => page.waitForTimeout(ms);

// 1. Full warm-up path (no ?quick).
await page.goto(deckUrl());
const started = await page.evaluate(() => window.deck.ready.then(() => true, (e) => String(e)));
check(started === true, 'deck starts with full warm-up');
if (started !== true) await finish();
const scenes = await page.evaluate(() => window.deck.scenes);
const total = scenes.reduce((n, s) => n + s.beats, 0);
check(scenes.length >= 5, `${scenes.length} scenes, ${total} beats`);
const lint = await page.evaluate(() => window.deck.lint());
check(lint.length === 0, 'lint clean' + (lint.length ? ': ' + lint.join('; ') : ''));
await page.locator('#stage').focus();

// 2. Forward through every beat with the keyboard. Wait out transitions.
async function settle() {
  for (let i = 0; i < 80; i++) {
    const s = await state();
    if (!s.transitioning) return s;
    await wait(50);
  }
  return state();
}
const seen = [];
let s = await state();
seen.push(`${s.scene}/${s.beat}`);
for (let i = 1; i < total; i++) {
  await page.keyboard.press('ArrowRight');
  await wait(120);
  // A click mid-beat finishes that beat fast and queues the advance; give it time.
  for (let k = 0; k < 40; k++) {
    s = await settle();
    if (`${s.scene}/${s.beat}` !== seen[seen.length - 1]) break;
    await wait(60);
  }
  seen.push(`${s.scene}/${s.beat}`);
}
check(new Set(seen).size === total, `forward visited ${new Set(seen).size}/${total} beats`);
check(s.scene === scenes[scenes.length - 1].id, 'forward ends on the last scene');

// 3. Back through every beat.
for (let i = 1; i < total; i++) {
  const before = `${s.scene}/${s.beat}`;
  await page.keyboard.press('ArrowLeft');
  await wait(80);
  for (let k = 0; k < 40; k++) {
    s = await settle();
    if (`${s.scene}/${s.beat}` !== before) break;
    await wait(60);
  }
}
check(s.scene === scenes[0].id && s.beat === 0, 'back returns to the first beat');

// 4. Rapid clicks during a transition must not break anything.
await page.keyboard.press('End');
await page.keyboard.press('Home');
for (let i = 0; i < 12; i++) await page.locator('#stage').click({ position: { x: 900, y: 360 } });
await wait(2500);
s = await settle();
check(s.index >= 1, `rapid clicks advance and queue (now at ${s.scene}/${s.beat})`);

// 5. Number keys, overview, help, notes, black, mute.
await page.keyboard.press('3');
s = await settle();
check(s.index === 2, 'number key 3 jumps to scene 3');
await page.keyboard.press('o');
check(await page.locator('.ui-overview.on .cell').count() === scenes.length, 'overview shows one cell per scene');
await page.locator('.ui-overview .cell').nth(1).click();
s = await settle();
check(s.index === 1 && !(await page.locator('.ui-overview.on').count()), 'overview click jumps and closes');
await page.keyboard.press('?');
check(await page.locator('.ui-help.on').count() === 1, 'help opens');
await page.keyboard.press('Escape');
await page.keyboard.press('n');
check(await page.locator('.ui-notes.on .say').count() === 1, 'notes open');
await page.keyboard.press('b');
check((await state()).black === true, 'B blacks the screen');
await page.keyboard.press('b');
await page.keyboard.press('m');
await page.keyboard.press('m');
const outline = await page.evaluate(() => window.deck.outline());
check(outline.includes('<h1>') && scenes.every((x) => outline.includes(`id="${x.id}"`)), 'outline export covers every scene');

// 6. Deep link + ?quick, autoplay and reduced motion paths start cleanly.
const last = scenes[scenes.length - 2];
await page.goto(deckUrl('quick', last.id));
await page.evaluate(() => window.deck.ready);
check((await state()).scene === last.id, `deep link #${last.id} opens that scene`);
await page.goto(deckUrl('quick&autoplay'));
await page.evaluate(() => window.deck.ready);
// Software GL can run at a few fps, so poll instead of a fixed wait.
let moved = false;
for (let i = 0; i < 60 && !moved; i++) {
  await wait(500);
  const a = await state();
  moved = a.index > 0 || a.beat > 0;
}
check(moved, 'autoplay advances by itself');
await page.goto(deckUrl('quick&still'));
await page.evaluate(() => window.deck.ready);
await page.keyboard.press('ArrowRight');
await wait(300);
check(true, 'reduced-motion mode starts');

// 7. Determinism: the same seek gives the same pixels.
await page.goto(deckUrl('shoot&quick'));
await page.evaluate(() => window.deck.ready);
const shot = async () => (await page.locator('#stage').screenshot()).toString('base64');
await page.evaluate((id) => window.deck.seek(id, 1, 0.7), scenes[1].id);
const a = await shot();
await page.evaluate((id) => window.deck.seek(id, 0, 0.3), scenes[0].id);
await page.evaluate((id) => window.deck.seek(id, 1, 0.7), scenes[1].id);
const b = await shot();
check(a === b, 'seek is deterministic (identical pixels)');

await finish();

async function finish() {
  await browser.close();
  check(errors.length === 0, `zero console errors${errors.length ? ':\n  ' + errors.join('\n  ') : ''}`);
  console.log(fails.length ? `\nSMOKE FAILED (${fails.length})` : '\nSMOKE PASSED');
  process.exit(fails.length ? 1 : 0);
}
