// Presenter chrome. DOM only for controls: the picture itself is all WebGL.
// Keys: → / Space / click next · ← / Backspace back · Home / End · 1-9 jump · O overview ·
// N notes · S speaker window · B black · F fullscreen · M mute · A autoplay · ? help · Esc close.

const CHANNEL = 'botkins-deck';

export function createUI({ deck, audio, root = document.body }) {
  const $ = (tag, cls, html) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  };

  const loader = root.querySelector('#loader');
  const bar = root.querySelector('#loader .bar i');
  const overview = $('div', 'ui-overview', '');
  const notes = $('aside', 'ui-notes', '');
  const help = $('div', 'ui-help', helpHTML());
  const hud = $('div', 'ui-hud', '');
  const live = $('div', 'ui-live', '');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');
  for (const el of [overview, notes, help, hud, live]) root.appendChild(el);

  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;
  let speakerWin = null;
  let hudTimer = 0;

  const progress = (f) => {
    if (bar) bar.style.transform = `scaleX(${f})`;
  };

  function show(el, on) {
    el.classList.toggle('on', on ?? !el.classList.contains('on'));
  }

  function flash(msg) {
    hud.textContent = msg;
    hud.classList.add('on');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => hud.classList.remove('on'), 1200);
  }

  function renderNotes(info) {
    const parts = [
      `<div class="pos">${info.index + 1}/${deck.scenes.length} · ${esc(info.title)} · beat ${info.beat + 1}/${info.beats}</div>`,
      `<div class="say">${esc(info.say)}</div>`,
      info.notes ? `<div class="body">${esc(info.notes)}</div>` : '',
      `<div class="next">Next: ${esc(info.next)}</div>`,
    ];
    notes.innerHTML = parts.join('');
  }

  function buildOverview(thumbs) {
    overview.innerHTML = '';
    const grid = $('div', 'grid');
    deck.scenes.forEach((s, i) => {
      const cell = $('button', 'cell');
      cell.type = 'button';
      if (thumbs && thumbs[i]) cell.appendChild(thumbs[i]);
      cell.appendChild($('span', '', `${i + 1}. ${esc(s.title)}`));
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        deck.jump(i);
        show(overview, false);
      });
      grid.appendChild(cell);
    });
    overview.appendChild(grid);
  }

  function openSpeaker() {
    const html = speakerHTML();
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    speakerWin = window.open(url, 'deck-speaker', 'width=900,height=600');
    if (!speakerWin) flash('Pop-up blocked: allow pop-ups for the speaker window');
    setTimeout(() => broadcast('state'), 500);
  }

  function broadcast(type) {
    if (!channel) return;
    const info = deck.state();
    channel.postMessage({ type, info, scenes: deck.scenes });
  }

  if (channel) {
    channel.onmessage = (e) => {
      const m = e.data || {};
      if (m.cmd === 'next') deck.next();
      else if (m.cmd === 'prev') deck.prev();
      else if (m.cmd === 'jump') deck.jump(m.scene, m.beat || 0);
      else if (m.cmd === 'hello') broadcast('state');
      else if (m.cmd === 'black') deck.setBlack();
    };
  }

  deck.on((type, info) => {
    if (type === 'beat' || type === 'scene' || type === 'ready') {
      renderNotes(info);
      live.textContent = [info.say, info.source].filter(Boolean).join('. ');
      if (type !== 'ready' && !deck.options.shoot) {
        const h = `#${info.scene}${info.beat ? '/' + info.beat : ''}`;
        if (location.hash !== h) history.replaceState(null, '', h);
      }
    }
    if (type === 'black') flash(info.black ? 'Black (B)' : '');
    if (type === 'autoplay') flash(info.autoplay ? 'Autoplay on' : 'Autoplay off');
    if (type === 'lost') flash('Graphics context lost: reloading when it returns');
    broadcast(type);
  });

  const gesture = () => audio && audio.unlock();
  window.addEventListener('pointerdown', gesture, { once: false });

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    gesture();
    const k = e.key;
    const handled = true;
    if (k === 'ArrowRight' || k === ' ' || k === 'PageDown' || k === 'Enter') deck.next();
    else if (k === 'ArrowLeft' || k === 'Backspace' || k === 'PageUp') deck.prev();
    else if (k === 'Home') deck.first();
    else if (k === 'End') deck.last();
    else if (/^[1-9]$/.test(k)) deck.jump(+k - 1);
    else if (k === 'o' || k === 'O') show(overview);
    else if (k === 'n' || k === 'N') show(notes);
    else if (k === 's' || k === 'S') openSpeaker();
    else if (k === 'b' || k === 'B' || k === '.') deck.setBlack();
    else if (k === 'f' || k === 'F') toggleFullscreen();
    else if (k === 'm' || k === 'M') {
      audio.toggleMute();
      flash(audio.muted ? 'Sound off (M)' : 'Sound on (M)');
    } else if (k === 'a' || k === 'A') deck.setAutoplay();
    else if (k === '?' || k === 'h' || k === 'H') show(help);
    else if (k === 'Escape') [overview, help].forEach((el) => show(el, false));
    else return;
    if (handled) e.preventDefault();
  }
  window.addEventListener('keydown', onKey);

  const canvas = root.querySelector('canvas');
  canvas.addEventListener('click', (e) => {
    gesture();
    if (overview.classList.contains('on')) return;
    if (e.clientX < window.innerWidth * 0.15) deck.prev();
    else deck.next();
  });
  canvas.addEventListener('pointermove', (e) => {
    deck.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  });
  let touchX = null;
  canvas.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) (dx < 0 ? deck.next : deck.prev)();
    touchX = null;
  });
  window.addEventListener('hashchange', () => {
    const [id, b] = decodeURIComponent(location.hash.slice(1)).split('/');
    const cur = deck.state();
    if (id && (id !== cur.scene || (+b || 0) !== cur.beat)) deck.jump(id, +b || 0);
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  }

  return {
    progress,
    done(thumbs) {
      buildOverview(thumbs);
      if (loader) loader.classList.add('gone');
      if (loader && deck.options.shoot) loader.classList.add('instant');
      if (!deck.options.shoot && !deck.options.quick) flash('? for help · S speaker view');
    },
    fail(err) {
      if (loader) {
        loader.classList.add('fail');
        loader.innerHTML = `<p>This deck needs WebGL2.</p><p><a href="#" id="outline-link">Open the plain text outline</a></p><pre>${esc(String(err && err.message || err))}</pre>`;
      }
    },
    overview,
    notes,
    help,
  };
}

function esc(x) {
  return String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function helpHTML() {
  const rows = [
    ['→ Space click', 'next beat'],
    ['← Backspace', 'back'],
    ['Home / End', 'first / last scene'],
    ['1–9', 'jump to scene'],
    ['O', 'overview'],
    ['N', 'notes'],
    ['S', 'speaker window'],
    ['B', 'black screen'],
    ['F', 'fullscreen'],
    ['M', 'sound on/off'],
    ['A', 'autoplay'],
    ['?', 'this help'],
  ];
  return `<div class="box"><h2>Controls</h2><table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>` +
    `<p>Links: <code>#scene</code> opens a scene, <code>?quick</code> skips warm-up, <code>?autoplay</code> runs hands-free, <code>?still</code> reduces motion.</p></div>`;
}

// The speaker window is its own tiny page, synced over BroadcastChannel.
function speakerHTML() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Speaker view</title><style>
body{margin:0;font:18px/1.45 system-ui,sans-serif;background:#0d0f14;color:#e9e6df;display:grid;grid-template-rows:auto 1fr auto;height:100vh}
header{display:flex;gap:1rem;align-items:center;padding:.8rem 1.2rem;border-bottom:1px solid #2a2e38}
#clock{font:600 28px ui-monospace,monospace;margin-left:auto}#pos{color:#9aa}
main{padding:1.2rem 1.6rem;overflow:auto}#say{font-size:32px;font-weight:700;margin:.2rem 0 1rem}
#notes{white-space:pre-wrap;color:#cfcac0}#next{color:#8fb3ff;margin-top:1.4rem}
footer{display:flex;gap:.6rem;padding:.8rem 1.2rem;border-top:1px solid #2a2e38}
button{font:inherit;background:#1f2430;color:inherit;border:1px solid #39404f;border-radius:6px;padding:.45rem 1rem;cursor:pointer}
</style></head><body><header><b>Speaker view</b><span id="pos"></span><span id="clock">00:00</span><button id="reset">reset</button></header>
<main><div id="say"></div><div id="notes"></div><div id="next"></div></main>
<footer><button id="prev">← back</button><button id="nextb">next →</button><button id="black">black</button></footer>
<script>
const ch=new BroadcastChannel(${JSON.stringify(CHANNEL)});let t0=performance.now();
const $=id=>document.getElementById(id);
ch.onmessage=e=>{const i=e.data&&e.data.info;if(!i)return;$('pos').textContent=(i.index+1)+'/'+e.data.scenes.length+' · '+i.title+' · beat '+(i.beat+1)+'/'+i.beats;
$('say').textContent=i.say;$('notes').textContent=i.notes||'';$('next').textContent='Next: '+i.next;};
ch.postMessage({cmd:'hello'});
$('prev').onclick=()=>ch.postMessage({cmd:'prev'});$('nextb').onclick=()=>ch.postMessage({cmd:'next'});$('black').onclick=()=>ch.postMessage({cmd:'black'});
$('reset').onclick=()=>t0=performance.now();
addEventListener('keydown',e=>{if(['ArrowRight',' ','PageDown'].includes(e.key)){ch.postMessage({cmd:'next'});e.preventDefault()}if(['ArrowLeft','PageUp','Backspace'].includes(e.key)){ch.postMessage({cmd:'prev'});e.preventDefault()}});
setInterval(()=>{const s=Math.floor((performance.now()-t0)/1000);$('clock').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')},500);
<\/script></body></html>`;
}
