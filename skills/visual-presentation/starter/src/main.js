// Entry point: list the scenes in order, create the deck and the presenter UI, expose window.deck.
import { createDeck } from './engine/deck.js';
import { createAudio } from './engine/audio.js';
import { createUI } from './engine/ui.js';

// Transitions register themselves on import.
import './transitions/crossfade.js';
import './transitions/portal.js';
import './transitions/push.js';
import './transitions/wipe.js';
import './transitions/dissolve.js';
import './transitions/zoom.js';

import title from './scenes/01-title.js';
import bars from './scenes/02-bars.js';
import crowd from './scenes/03-crowd.js';
import portal from './scenes/04-portal.js';
import close from './scenes/05-close.js';

const SCENES = [title, bars, crowd, portal, close];

// Root note for every synthesized sound (A2). Change it to retune the whole deck.
const audio = createAudio({ root: 110, volume: 0.55 });

const canvas = document.querySelector('#stage');
let deck;
let ui;
try {
  deck = createDeck({ canvas, scenes: SCENES, audio });
  ui = createUI({ deck, audio });
  window.deck = deck;
  deck.start(ui.progress).then((thumbs) => ui.done(thumbs)).catch(fail);
} catch (err) {
  fail(err);
}

function fail(err) {
  console.error(err);
  // Degrade to a readable outline instead of a black screen.
  const loader = document.querySelector('#loader');
  if (loader) {
    loader.classList.add('fail');
    const items = SCENES.map((s) => `<li><b>${s.title}</b><ul>${s.beats.map((b) => `<li>${b.say}</li>`).join('')}</ul></li>`).join('');
    loader.innerHTML = `<div class="fallback"><p>This deck needs WebGL2. Here is the outline.</p><ol>${items}</ol></div>`;
  }
  window.deck = { ready: Promise.reject(err), error: String(err && err.message || err) };
  window.deck.ready.catch(() => {});
}
