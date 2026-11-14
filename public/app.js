'use strict';
/* Hexhaven client: renders the per-player view streamed by the server and posts actions back. */

const RES = ['wood', 'clay', 'fleece', 'wheat', 'iron'];
const RM = {
  wood:   { name: 'Wood',   ico: '🌲', color: '#4f8a4f', card: '#a9d39a', deep: '#2e5e30' },
  clay:   { name: 'Clay',   ico: '🧱', color: '#c46a3c', card: '#eab394', deep: '#8a3f1e' },
  fleece: { name: 'Fleece', ico: '🐑', color: '#a7cf6c', card: '#d8ecb8', deep: '#5c8a2c' },
  wheat:  { name: 'Wheat',  ico: '🌾', color: '#e2bc45', card: '#f4e0a0', deep: '#94700f' },
  iron:   { name: 'Iron',   ico: '🪨', color: '#8b939f', card: '#cfd4db', deep: '#4b535e' },
  desert: { name: 'Dunes',  ico: '🏜️', color: '#dcc697', deep: '#97804d' },
  fog:    { name: 'Fog',    ico: '🌫️', color: '#9aabb4', deep: '#566872' },
  parchment: { name: 'Parchment', ico: '📃', card: '#e9dcc0', deep: '#2f7a46' },
  linen:     { name: 'Linen',     ico: '🧵', card: '#f1e3a6', deep: '#9a7a12' },
  silver:    { name: 'Silver',    ico: '🪙', card: '#d6dcea', deep: '#34558f' },
};
const COMS = ['parchment', 'linen', 'silver'];
const ALLC = [...RES, ...COMS];
const handKinds = (v) => (v && v.crowns ? ALLC : RES); // the cards this game uses
const PC = {
  red: '#d6453d', blue: '#2f6bd6', ivory: '#f3ecd9', orange: '#ec8a1c',
  green: '#2c9a55', brown: '#8b5a2b', purple: '#8e4ec6', teal: '#17a8a8',
};
const SCROLL_INFO = {
  guard: { ico: '🛡️', desc: 'Move the bandit to any tile and steal 1 card from a player with a building there. Played Guards stay in front of you: the first to play 3 earns the Strongest Watch (+2 points).' },
  route: { ico: '🛤️', desc: 'Place 2 roads for free. They follow the normal road rules (connected to your roads or buildings).' },
  plenty: { ico: '🎁', desc: 'Take any 2 resource cards from the bank. They can be the same resource.' },
  monopoly: { ico: '⚖️', desc: 'Name a resource. Every other player must give you all of their cards of that resource.' },
  vp: { ico: '🗿', desc: 'Worth 1 victory point. Keep it hidden — it counts automatically and is revealed at the end.' },
};
const BUILD_ICO = { road: '🛤️', village: '🏠', town: '🏰', scroll: '📜', wall: '🧱', warden: '🛡️' };
// the app mark: a hex island on the sea with a little settlement (same art as the favicon)
const LOGO_SVG = '<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><polygon points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5" fill="#2f7f93" stroke="#f6ecd8" stroke-width="3"/><polygon points="32,13 48.5,22.5 48.5,41.5 32,51 15.5,41.5 15.5,22.5" fill="#e7b545"/><path d="M22 41h20V31l-10-8-10 8z" fill="#b8532a" stroke="#5b2a12" stroke-width="2" stroke-linejoin="round"/></svg>';
const U = 56; // board units -> px

const S = {
  code: null, token: null, pid: null, v: null, mode: null, es: null,
  modal: null, ui: {}, boardKey: null, lastLog: 0, screen: null,
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cnt = (h) => ALLC.reduce((s, r) => s + (h[r] || 0), 0);
const has = (h, c) => ALLC.every((r) => (h[r] || 0) >= (c[r] || 0));
const zero = () => Object.fromEntries(ALLC.map((r) => [r, 0]));
// One icon per card a build needs; each lights up if you hold it (the 2nd iron lights only with 2 iron, etc.)
const costHtml = (c, hand) => ALLC.filter((r) => c[r]).map((r) => Array.from({ length: c[r] }, (_, i) => {
  const ok = (hand[r] || 0) > i;
  return `<span class="c ${ok ? 'have' : 'miss'}" title="${RM[r].name}${ok ? '' : ' — missing'}">${RM[r].ico}</span>`;
}).join('')).join('');
const resList = (c) => ALLC.filter((r) => c[r]).map((r) => `${c[r]} ${RM[r].ico} ${RM[r].name}`).join(', ');

function toast(msg, err) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), err ? 3500 : 2200);
}

async function api(path, body) {
  const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function send(action) {
  if (S.replay) return false; // a replay is read-only
  try { await api('/api/action', { code: S.code, token: S.token, action }); return true; }
  catch (e) { toast(e.message, true); return false; }
}

// ---------- sessions ----------
function store() { try { return JSON.parse(localStorage.getItem('hexhaven:sessions') || '{}'); } catch { return {}; } }
function remember(code, token, pid, name) {
  try {
    sessionStorage.setItem('hexhaven:' + code, JSON.stringify({ token, pid }));
    const all = store(); all[code] = { token, pid, name, at: Date.now() };
    localStorage.setItem('hexhaven:sessions', JSON.stringify(all));
  } catch { /* storage unavailable */ }
}
function forget(code) {
  try { sessionStorage.removeItem('hexhaven:' + code); const all = store(); delete all[code]; localStorage.setItem('hexhaven:sessions', JSON.stringify(all)); } catch {}
}

function enterRoom(code, token, pid, name) {
  S.code = code; S.token = token; S.pid = pid;
  remember(code, token, pid, name);
  history.replaceState(null, '', '?room=' + code);
  connect();
}

function connect() {
  if (S.es) S.es.close();
  S.prev = null;
  const es = new EventSource(`/api/stream?code=${encodeURIComponent(S.code)}&token=${encodeURIComponent(S.token)}`);
  S.es = es;
  es.onopen = () => checkBuild(); // a reconnect after a deploy lands on new server code
  es.onmessage = (ev) => { S.v = JSON.parse(ev.data); setConn(true); render(); };
  es.onerror = async () => {
    setConn(false);
    try { await api(`/api/session?code=${S.code}&token=${S.token}`); }
    catch (e) {
      if (/not found/i.test(e.message)) { es.close(); forget(S.code); S.v = null; toast('That game no longer exists', true); renderHome(); }
    }
  };
}
function stillHere() {
  if (!S.code || !S.token || S.replay) return;
  fetch('/api/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: S.code, token: S.token }) }).catch(() => {});
}
setInterval(stillHere, 25000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') stillHere(); });

function setConn(ok) { const el = $('#conn'); if (el) el.textContent = ok ? '' : 'Reconnecting…'; }

// ---------- build / version (for debugging, and to pick up new deploys) ----------
async function loadBuild() {
  try { const r = await fetch('/api/version', { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}
function buildTag() {
  const b = S.build;
  if (!b) return '';
  const title = `Hexhaven v${b.version} · commit ${b.commit} · revision ${b.revision}${b.built ? ` · built ${b.built}` : ''} · server started ${b.startedAt}`;
  return `<span class="buildtag" title="${esc(title)}">build ${esc(b.commit)}</span>`;
}

// If the server is now running different code than this page (it was redeployed), reload once to pick it up.
// Your seat survives a reload; the guard stops a reload loop if something keeps the versions apart.
async function checkBuild() {
  const b = await loadBuild();
  if (!b || !S.build || b.commit === S.build.commit) return;
  console.warn(`Hexhaven: server is on build ${b.commit}, this page is ${S.build.commit}`);
  let tried = null;
  try { tried = sessionStorage.getItem('hexhaven:reloadedFor'); } catch {}
  if (tried === b.commit) { showUpdateButton(b); return; }
  try { sessionStorage.setItem('hexhaven:reloadedFor', b.commit); } catch {}
  toast(`Updating to the new version (${b.commit})…`);
  setTimeout(() => location.reload(), 1200);
}
function showUpdateButton(b) {
  if ($('#update-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'update-btn'; btn.className = 'btn small primary update-btn';
  btn.textContent = `⟳ New version (${b.commit}) — reload`;
  btn.onclick = () => location.reload();
  document.body.appendChild(btn);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkBuild(); });

// ---------- boot ----------
async function boot() {
  S.build = await loadBuild();
  if (S.build) console.info(`%cHexhaven build ${S.build.commit}%c  v${S.build.version} · revision ${S.build.revision}${S.build.built ? ` · built ${S.build.built}` : ''}`, 'font-weight:bold', '', S.build);
  const code = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  if (code) {
    let sess = null;
    try { sess = JSON.parse(sessionStorage.getItem('hexhaven:' + code) || 'null'); } catch {}
    if (sess) {
      try { await api(`/api/session?code=${code}&token=${sess.token}`); S.code = code; S.token = sess.token; S.pid = sess.pid; return connect(); }
      catch { forget(code); }
    }
  }
  renderHome(code);
}

function renderHome(prefill = '') {
  S.screen = 'home';
  const saved = store();
  const rejoin = prefill && saved[prefill];
  const recent = Object.entries(saved).sort((a, b) => b[1].at - a[1].at).slice(0, 4);
  $('#app').innerHTML = `
  <div class="home">
    <div class="hero">
      ${heroIsland()}
      <div class="hero-text">
        <h1>Hexhaven</h1>
        <p>Settle a hex island, trade with your friends, race to 10 points.</p>
        <div class="hero-tags"><span>👥 2–8 players</span><span>✨ No sign-up</span><span>🌐 Play in the browser</span>${langButton('btn small hero-lang')}${themeToggle('btn small hero-lang')}</div>
      </div>
    </div>
    <div class="home-grid">
      <form class="card" id="f-create">
        <h2>Start a game</h2>
        <label class="field">Your name<input type="text" name="name" maxlength="20" autocomplete="nickname" required></label>
        <button class="btn primary" type="submit">Create room</button>
        <div class="hint">You'll get a room code and a link to send your friends.</div>
      </form>
      <form class="card" id="f-join">
        <h2>Join a game</h2>
        ${rejoin ? `<button class="btn primary" type="button" id="rejoin">Rejoin room ${esc(prefill)} as ${esc(rejoin.name)}</button><div class="hint">…or join as someone new:</div>` : ''}
        <label class="field">Room code<input type="text" name="code" maxlength="4" value="${esc(prefill)}" style="text-transform:uppercase;letter-spacing:3px" required></label>
        <label class="field">Your name<input type="text" name="name" maxlength="20" autocomplete="nickname" required></label>
        <button class="btn ${rejoin ? '' : 'primary'}" type="submit">Join room</button>
        <div id="join-seats"></div>
        <div class="hint">Lost your seat (new device, cleared browser)? Join with the exact same name to take it back.</div>
      </form>
    </div>
    <div class="card rules" id="load-card">
      <h3>Load or replay a saved game</h3>
      <p class="hint" style="margin:-4px 0 12px">Hosts can save a game any time with 💾; everyone can once it's over. Open the file here to watch the replay or keep playing from where it stopped.</p>
      <label class="btn filebtn">📂 Choose a save file<input type="file" id="load-file" accept=".json,application/json" hidden></label>
      <div id="load-info"></div>
    </div>
    ${recent.length ? `<div class="card rules"><h3>Your recent rooms</h3><div class="invite">${recent.map(([c, s]) => `<button class="btn small" data-recent="${esc(c)}">${esc(c)} · ${esc(s.name)}</button>`).join('')}</div></div>` : ''}
    <div class="card rules">
      <h3>How to play</h3>
      <ul class="steps">
        <li><span class="step-ico">🎲</span><span>Everyone rolls to decide who goes first, then places two settlements and two roads. Your second settlement pays out its neighboring tiles.</span></li>
        <li><span class="step-ico">🌾</span><span>Each turn, roll two dice. Every tile showing that number pays its resource to adjacent settlements (1) and cities (2).</span></li>
        <li><span class="step-ico">🤝</span><span>Spend resources to build, trade with other players or the bank (4:1, or better at a harbor ⚓), and buy development cards.</span></li>
        <li><span class="step-ico">🥷</span><span>Rolling a 7 summons the bandit: anyone holding more than 7 cards discards half, then the roller blocks a tile and steals a card.</span></li>
        <li><span class="step-ico">🏆</span><span>Settlement = 1 point, City = 2. The longest road (5+) is the <b>Grand Route</b> (+2), and 3+ Guards played earns the <b>Strongest Watch</b> (+2). First to 10 points on their own turn wins.</span></li>
        <li><span class="step-ico">👥</span><span>With 3+ players, a <b>builder phase</b> after each turn lets everyone else build too, so big games keep moving.</span></li>
      </ul>
      <div class="costs">
        <span><b>🛤️ Road</b> 🌲🧱</span><span><b>🏠 Settlement</b> 🌲🧱🐑🌾</span><span><b>🏰 City</b> 🌾🌾🪨🪨🪨</span><span><b>📜 Development card</b> 🐑🌾🪨</span>
      </div>
    </div>
    <p class="hint" style="text-align:center;margin-top:18px">${buildTag()}</p>
  </div>`;
  $('#f-create').onsubmit = async (e) => {
    e.preventDefault();
    const name = e.target.name.value;
    try { const r = await api('/api/create', { name }); enterRoom(r.code, r.token, r.pid, name); } catch (err) { toast(err.message, true); }
  };
  $('#f-join').onsubmit = async (e) => {
    e.preventDefault();
    const name = e.target.name.value; const code = e.target.code.value.trim().toUpperCase();
    try { const r = await api('/api/join', { code, name }); enterRoom(r.code, r.token, r.pid, name); }
    catch (err) { if (!(/already started/.test(err.message) && await offerSeats(code))) toast(err.message, true); }
  };
  bindLoadCard();
  if (prefill) offerSeats(prefill); // invite link to a running game: show its seats right away (alongside any "Rejoin")
  const rj = $('#rejoin');
  if (rj) rj.onclick = () => enterRoom(prefill, rejoin.token, rejoin.pid, rejoin.name);
  document.querySelectorAll('[data-recent]').forEach((b) => {
    b.onclick = async () => {
      const c = b.dataset.recent; const s = saved[c];
      try { await api(`/api/session?code=${c}&token=${s.token}`); enterRoom(c, s.token, s.pid, s.name); }
      catch { forget(c); toast('That room is gone', true); renderHome(); }
    };
  });
}

// ---------- render dispatch ----------
function render() {
  const v = S.v;
  if (!v) return;
  if (v.status !== 'over') S.hideOver = false;
  if (v.status !== 'lobby') noticeChanges(v);
  if (v.status === 'lobby') { S.boardKey = null; S.prev = null; renderLobby(v); }
  else renderGame(v);
  const needMe = v.status === 'playing' && (v.stalled || []).includes(v.me);
  document.title = needMe ? '● Your move — Hexhaven' : `Hexhaven · ${v.code}`;
}

// ---------- "what just happened" feedback: chime, card gains, fresh pieces ----------
function soundOn() { try { return localStorage.getItem('hexhaven:mute') !== '1'; } catch { return true; } }

// Animations are on by default; the ✨ button in the top bar turns them off (or back on) and the choice is
// stored per device. CSS reads the result as html.reduce-motion.
// ---------- light / dark theme ----------
// Follows the device until the player picks one with a 🌙/☀️ button (top bar, home page, lobby); remembered per device.
const darkDevice = () => !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
const themeNow = () => document.documentElement.dataset.theme || (darkDevice() ? 'dark' : 'light');
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('hexhaven:theme', t); } catch {}
  themeButton();
}
// Every theme button on the page shows what clicking it switches to.
function themeButton() {
  const dark = themeNow() === 'dark';
  document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
    b.textContent = dark ? '☀️' : '🌙';
    b.title = dark ? 'Switch to the light theme' : 'Switch to the dark theme';
    b.setAttribute('aria-label', b.title);
  });
}
const themeToggle = (cls = 'btn small') => {
  const dark = themeNow() === 'dark'; const t = dark ? 'Switch to the light theme' : 'Switch to the dark theme';
  return `<button type="button" class="${cls} themebtn" data-theme-toggle title="${t}" aria-label="${t}">${dark ? '☀️' : '🌙'}</button>`;
};
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('[data-theme-toggle]')) setTheme(themeNow() === 'dark' ? 'light' : 'dark');
});
if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeButton); } catch {} }

function motionOn() { try { return localStorage.getItem('hexhaven:motion') !== 'off'; } catch { return true; } }
function applyMotion() {
  document.documentElement.classList.toggle('reduce-motion', !motionOn());
  const b = $('#motion');
  if (!b) return;
  const on = motionOn();
  b.classList.toggle('off', !on);
  b.title = `Animations ${on ? 'on' : 'off'} — click to turn ${on ? 'off' : 'on'}`;
  b.setAttribute('aria-pressed', String(on));
}
applyMotion();
function chime(kind) {
  if (!soundOn() || S.replay) return;
  try {
    const ctx = S.audio || (S.audio = new (window.AudioContext || window.webkitAudioContext)());
    const notes = kind === 'trade' ? [660, 880] : kind === 'seven' ? [392, 311, 233] : kind === 'raidfall' ? [262, 208, 165, 131]
      : kind === 'raidhold' ? [523, 659, 784, 1047] : kind === 'drum' ? [98, 98, 131] : [523, 659, 784];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.11;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.4);
    });
  } catch { /* audio unavailable */ }
}

function noticeChanges(v) {
  const now = Date.now();
  const cur = {
    needMe: v.status === 'playing' && (v.stalled || []).includes(v.me),
    trade: v.trade && v.trade.from !== v.me ? v.trade.id : null,
    hand: v.hand ? { ...v.hand } : null,
    pieces: new Set([...Object.keys(v.buildings).map((k) => 'b' + k + v.buildings[k].type), ...Object.keys(v.roads).map((k) => 'r' + k),
      ...(v.crowns ? Object.keys(v.crowns.wardens).map((k) => 'w' + k) : [])]),
    roll: v.lastRoll ? v.lastRoll.id : 0,
    steal: v.lastSteal ? v.lastSteal.id : 0,
    raid: v.crowns && v.crowns.lastRaid ? v.crowns.lastRaid.id : 0,
    bandit: v.bandit,
    logId: v.log.length ? v.log[v.log.length - 1].id : 0,
    // whose go it is: a new player's turn, a new setup placement, or a new builder-phase player
    turnKey: v.status !== 'playing' || v.turn.phase === 'order' ? null
      : v.turn.phase === 'builder' ? `b:${v.turn.number}:${v.turn.builder}` : `t:${v.turn.number}:${v.turn.current}`,
  };
  const prev = S.prev;
  S.prev = cur;
  if (v.deadlineIn !== null && v.deadlineIn !== undefined) S.deadline = now + v.deadlineIn; else S.deadline = null;
  S.deadlineTotal = v.deadlineTotal || null;
  if (!prev) return; // first view after (re)connecting: nothing "just happened"
  if (cur.needMe && !prev.needMe) chime('turn');
  else if (cur.trade && cur.trade !== prev.trade) chime('trade');
  const stole = cur.steal !== prev.steal && v.lastSteal;
  if (cur.turnKey && cur.turnKey !== prev.turnKey) showTurn(v);
  if (cur.roll !== prev.roll && v.lastRoll) showDice(v, v.lastRoll);
  if (stole) showSteal(v, v.lastSteal);
  if (cur.raid && cur.raid !== prev.raid) { const r = v.crowns.lastRaid; setTimeout(() => crShowRaid(S.v || v, r), cur.roll !== prev.roll && motionOn() ? THROW_MS + 500 : 0); }
  if (cur.bandit !== prev.bandit && prev.bandit !== undefined) S.banditMove = { from: prev.bandit, at: now };
  if (cur.hand && prev.hand && !stole) {
    const gained = ALLC.filter((r) => cur.hand[r] > prev.hand[r]).map((r) => RM[r].ico.repeat(cur.hand[r] - prev.hand[r])).join(' ');
    if (gained) setTimeout(() => toast(`+ ${gained}`), cur.roll !== prev.roll ? 900 : 0); // after the dice land
  }
  // private news (e.g. which scroll you drew), except steals, which get their own reveal
  for (const l of v.log) if (l.id > prev.logId && l.private && !/stole/.test(l.msg)) toast(l.msg);
  S.recent = S.recent || new Map();
  for (const k of cur.pieces) if (!prev.pieces.has(k)) S.recent.set(k, now);
  for (const [k, t] of S.recent) if (now - t > 4000) S.recent.delete(k);
}

// ---------- dice throw: two 3D cubes tossed onto the board, seen by everyone ----------
// Faces sit on a cube; to show face n we rotate the cube by FACE_TURN[n] ([x°, y°]).
const CUBE_FACES = [['front', 1], ['back', 6], ['right', 3], ['left', 4], ['top', 2], ['bottom', 5]];
const FACE_TURN = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
const THROW_MS = 1150;

function showDice(v, roll) {
  const fx = $('#fx');
  if (!fx) return;
  fx.querySelectorAll('.dicefx').forEach((e) => e.remove());
  const sum = roll.d[0] + roll.d[1];
  const seven = sum === 7 && roll.kind !== 'order';
  const who = esc(pname(v, roll.by));
  const label = roll.kind === 'order' ? `${who} rolled <b>${sum}</b> for turn order`
    : seven ? `${who} rolled <b>7</b> — 🥷 Bandits!` : `${who} rolled <b>${sum}</b>`;
  const el = document.createElement('div');
  el.className = 'dicefx';
  el.style.setProperty('--c', pcolor(v, roll.by));
  const red = (i) => !!v.crowns && roll.kind !== 'order' && i === 1;
  const faces = roll.d.slice();
  if (v.crowns && roll.event) faces.push(crEventFace(roll));
  el.innerHTML = `<div class="dicefx-dice">${faces.map((_, i) => `<div class="die3d${red(i) ? ' red' : ''}${i === 2 ? ' event' : ''}"><div class="dshadow"></div><div class="cube">${
    CUBE_FACES.map(([f, n]) => `<div class="face ${f}">${i === 2 ? crEventFaceHtml(n) : pipsSvg(n, red(i) ? '#fff' : undefined)}</div>`).join('')}</div></div>`).join('')}</div>
    <div class="fx-label">${label}${v.crowns && roll.event ? crEventLabel(roll.event) : ''}</div>`;
  fx.appendChild(el);

  const land = () => {
    el.classList.add('landed');
    if (seven) { el.classList.add('seven'); banditAlert(); chime('seven'); }
  };
  const dice = [...el.querySelectorAll('.die3d')];
  const reduce = !motionOn();
  dice.forEach((d, i) => {
    const [tx, ty] = FACE_TURN[faces[i]];
    const cube = d.querySelector('.cube');
    const end = `rotateX(${tx}deg) rotateY(${ty}deg)`;
    if (reduce || !cube.animate) { cube.style.transform = end; return; }
    // spin whole turns plus a random extra, ending exactly on the rolled face
    const sx = tx + 360 * (2 + i) + (i ? 37 : -23), sy = ty + 360 * (3 - i) + (i ? -51 : 64);
    const opts = { duration: THROW_MS, delay: i * 70, easing: 'cubic-bezier(.15,.65,.3,1)', fill: 'both' };
    cube.animate([{ transform: `rotateX(${sx}deg) rotateY(${sy}deg)` }, { transform: end }], opts);
    // the throw: in from the lower left, an arc, two small bounces, settle
    const W = fx.clientWidth, H = fx.clientHeight, dy = i ? 24 : -10;
    d.animate([
      { transform: `translate(${-W * 0.5}px, ${H * 0.32 + dy}px) rotate(-220deg)`, offset: 0 },
      { transform: `translate(${-W * 0.14}px, ${-H * 0.06}px) rotate(-70deg)`, offset: 0.45 },
      { transform: `translate(${-W * 0.03}px, 4px) rotate(-14deg)`, offset: 0.68 },
      { transform: 'translate(-6px, -12px) rotate(-5deg)', offset: 0.82 },
      { transform: 'translate(0, 0) rotate(0)', offset: 1 },
    ], { ...opts, easing: 'ease-out' });
    d.querySelector('.dshadow').animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)' }], opts);
  });
  setTimeout(land, reduce ? 0 : THROW_MS + 80);
  setTimeout(() => el.classList.add('out'), (reduce ? 0 : THROW_MS) + 2200);
  setTimeout(() => el.remove(), (reduce ? 0 : THROW_MS) + 2600);
}

// Big "whose turn" card across the top of the board when the turn passes
function showTurn(v) {
  const fx = $('#fx');
  if (!fx) return;
  fx.querySelectorAll('.turnfx').forEach((e) => e.remove());
  const t = v.turn;
  const pid = t.phase === 'builder' ? t.builder : t.current;
  const mine = pid === v.me;
  const name = esc(pname(v, pid));
  let title; let sub = '';
  if (t.phase === 'builder') { title = mine ? 'Builder phase — your chance to build' : `Builder phase: ${name}`; }
  else if (t.phase === 'setup') { title = mine ? 'Your turn to place' : `${name} is placing`; sub = t.setupNeed === 'village' ? 'a settlement' : 'a road'; }
  else { title = mine ? 'Your turn!' : `${name}'s turn`; sub = mine ? 'Roll the dice to start' : `Turn ${t.number}`; }
  const el = document.createElement('div');
  el.className = 'turnfx' + (mine ? ' mine' : '');
  el.style.setProperty('--c', pcolor(v, pid));
  el.innerHTML = `<span class="turnfx-chip"></span><div><div class="turnfx-title">${title}</div>${sub ? `<div class="turnfx-sub">${sub}</div>` : ''}</div>`;
  fx.appendChild(el);
  setTimeout(() => el.classList.add('out'), mine ? 2400 : 1700);
  setTimeout(() => el.remove(), mine ? 2800 : 2100);
}

// A red pulse over the whole board when a 7 lands
function banditAlert() {
  const wrap = $('#boardwrap');
  if (!wrap) return;
  const a = document.createElement('div');
  a.className = 'bandit-flash';
  wrap.appendChild(a);
  setTimeout(() => a.remove(), 1600);
}

// The stolen card flips over for the thief and the victim; everyone else just sees it leave
function showSteal(v, st) {
  const fx = $('#fx');
  if (!fx || ![st.thief, st.victim].includes(v.me)) return;
  fx.querySelectorAll('.stealfx').forEach((e) => e.remove());
  const r = RM[st.res];
  const label = st.thief === v.me ? `You stole <b>${r.name}</b> from ${esc(pname(v, st.victim))}`
    : `${esc(pname(v, st.thief))} stole your <b>${r.name}</b>`;
  const el = document.createElement('div');
  el.className = 'stealfx';
  el.innerHTML = `<div class="flip"><div class="face back"></div><div class="face front" style="background:${r.card}"><div class="ico">${r.ico}</div><div class="nm">${r.name}</div></div></div><div class="fx-label">${label}</div>`;
  fx.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

const pname = (v, id) => (v.players.find((p) => p.id === id) || {}).name || '?';
const pcolor = (v, id) => PC[(v.players.find((p) => p.id === id) || {}).color] || '#999';
const chip = (color) => `<span class="chip" style="background:${PC[color] || color}"></span>`;
const inviteUrl = (code) => `${location.origin}/?room=${code}`;

function copyInvite() {
  const url = inviteUrl(S.code);
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Invite link copied')).catch(() => prompt('Copy this link:', url));
}

// ---------- lobby ----------
function renderLobby(v) {
  const host = v.hostId === v.me;
  const me = v.players.find((p) => p.id === v.me);
  const s = v.settings;
  const n = v.players.length;
  const sizeAuto = n <= 4 ? 'small (19 tiles)' : 'large (37 tiles)';
  if (S.screen !== 'lobby') {
    S.screen = 'lobby'; S.lastLog = 0; S.lobbyKey = null; S.draft = {};
    $('#app').innerHTML = `
    <div class="lobby">
      <div class="lobby-head">
        <div><div class="lobby-label">${LOGO_SVG}Room code</div><div class="room-code" aria-label="Room code ${esc(v.code)}">${[...v.code].map((ch) => `<span>${esc(ch)}</span>`).join('')}</div></div>
        <div class="invite"><code id="invite-url"></code><button class="btn" id="copy">Copy invite link</button>${langButton('btn')}${themeToggle('btn')}</div>
      </div>
      <div class="card"><div id="lobby-main"></div></div>
      <div class="card" style="display:flex;flex-direction:column;min-height:320px">
        <h3 style="margin-bottom:8px">Room chat</h3>
        <div class="log" id="log"></div>
        <form class="chatform" id="chat"><input type="text" maxlength="300" placeholder="Say something…" aria-label="Chat message"><button class="btn small">Send</button></form>
      </div>
    </div>`;
    $('#invite-url').textContent = inviteUrl(v.code);
    $('#copy').onclick = copyInvite;
    bindChat();
  }
  renderLog(v);
  closeModal();
  noticeSuggestions(v);
  // Only rebuild the player/settings card when it actually changed, so chat doesn't wipe a half-typed setting.
  const key = JSON.stringify([v.players, v.settings, v.hostId, v.suggestions, S.draft]);
  if (key === S.lobbyKey) return;
  S.lobbyKey = key;
  // Host edits apply directly; everyone else edits a draft they can suggest.
  const draft = S.draft || (S.draft = {});
  for (const k of Object.keys(draft)) if (draft[k] === s[k]) delete draft[k];
  const val = (k) => (!host && k in draft ? draft[k] : s[k]);
  const chg = (k) => (!host && k in draft ? ' changed' : '');
  const hostP = v.players.find((p) => p.id === v.hostId);
  const canClaim = !host && (!hostP || !hostP.connected);
  $('#lobby-main').innerHTML = `
    <h2>Players <span class="hint">(${n}/${v.maxPlayers})</span></h2>
    <ul class="plist">${v.players.map((p) => `
      <li style="--pc:${PC[p.color]}">${chip(p.color)}<b style="flex:1">${esc(p.name)}${p.id === v.me ? ' <span class="hint">(you)</span>' : ''}</b>
        ${p.id === v.hostId ? '<span class="badge">host</span>' : ''}
        <span class="dot ${p.connected ? '' : 'off'}" title="${p.connected ? 'online' : 'offline'}"></span>
        ${host && p.id !== v.me ? `<button class="btn small" data-kick="${p.id}">Remove</button>` : ''}
      </li>`).join('')}
    </ul>
    <h3 style="margin-top:18px">Your color</h3>
    <div class="swatches">${v.colors.map((c) => {
      const taken = v.players.some((p) => p.color === c && p.id !== v.me);
      return `<button class="swatch ${me && me.color === c ? 'sel' : ''}" style="background:${PC[c]}" data-color="${c}" ${taken ? 'disabled' : ''} title="${c}" aria-label="${c}"></button>`;
    }).join('')}</div>
    <h3 style="margin-top:18px">Game settings ${host ? '' : '<span class="hint">change any of these to suggest it to the host</span>'}</h3>
    <div class="settings">
      <label class="field mode-field${chg('mode')}">Game mode
        <select id="s-mode">
          <option value="classic" ${val('mode') !== 'crowns' ? 'selected' : ''}>Classic — settle, trade and build to 10 points</option>
          <option value="crowns" ${val('mode') === 'crowns' ? 'selected' : ''}>👑 Crowns & Raiders — cities, wardens and raids, to 13 points</option>
        </select>
        <span class="hint" style="font-weight:400">${val('mode') === 'crowns'
          ? 'Cities also make commodities (📃 parchment, 🧵 linen, 🪙 silver) that buy city improvements. Raise wardens to fight off the raiders\' ship, or lose a city. A third die opens the Guild, Council and Academy gates and deals edicts. No development cards. Your second setup piece is a city. 2–8 players.'
          : 'The standard game: roads, settlements, cities and development cards. 2–8 players.'}</span></label>
      ${val('mode') === 'crowns' ? `<label class="field${chg('firstRaid')}">First raid
        <select id="s-raid">${[[7, 'After 7 ship steps — standard'], [10, 'After 10 steps — a little more time'], [14, 'After 14 steps — about twice as long'], [21, 'After 21 steps — a slow start']].map(([n, label]) =>
          `<option value="${n}" ${(val('firstRaid') || 7) === n ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <span class="hint" style="font-weight:400">How far the raiders' ship sails before it first lands, so everyone has time to raise wardens. Later raids always come after 7 steps.</span></label>` : ''}
      <label class="field${chg('vpTarget')}">Points to win
        <input type="number" min="5" max="20" id="s-vp" value="${val('vpTarget')}"></label>
      <label class="field${chg('boardSize')}">Island size
        <select id="s-size">
          <option value="auto" ${val('boardSize') === 'auto' ? 'selected' : ''}>Auto — ${sizeAuto} for ${n} players</option>
          <option value="small" ${val('boardSize') === 'small' ? 'selected' : ''}>Small — 19 tiles (best for 2–4)</option>
          <option value="large" ${val('boardSize') === 'large' ? 'selected' : ''}>Large — 37 tiles (best for 5–8)</option>
        </select></label>
      <label class="field${chg('mapStyle')}">Map
        <select id="s-map">
          <option value="balanced" ${val('mapStyle') !== 'random' ? 'selected' : ''}>Balanced — fair numbers, no clumps (recommended)</option>
          <option value="random" ${val('mapStyle') === 'random' ? 'selected' : ''}>Random — anything goes (only 6 and 8 kept apart)</option>
        </select>
        <span class="hint" style="font-weight:400">${val('mapStyle') === 'random'
          ? 'Tiles and numbers are shuffled freely: equal numbers can touch and a resource can end up on weak numbers.'
          : 'Equal numbers never touch, 2 never touches 12, no corner is too strong, at most 2 tiles of a resource together, and every resource gets a fair share of the odds.'}</span></label>
      <label class="field${chg('discardLimit')}">Hand limit when a 7 is rolled
        <input type="number" min="5" max="12" id="s-discard" value="${val('discardLimit')}"></label>
      <h4 class="mods-title">Modifiers <span class="hint">twists you can add to either mode</span></h4>
      <label class="toggle${chg('fog')}"><input type="checkbox" id="s-fog" ${val('fog') ? 'checked' : ''}>
        <span><b>🌫️ Fog</b><br><span class="hint">The island starts hidden: you place your starting pieces seeing only the harbors. The tiles and numbers are dealt when the last starting road is placed, and second settlements collect then.</span></span></label>
      <label class="toggle${chg('builderPhase')}"><input type="checkbox" id="s-builder" ${val('builderPhase') ? 'checked' : ''}>
        <span><b>Builder phase</b><br><span class="hint">After each turn, the other players may build (no trading). Recommended for 5+ players.</span></span></label>
      <label class="field${chg('turnTimer')}">Turn timer
        <select id="s-timer">
          ${[[0, 'Off — wait as long as it takes'], [60, '1 minute'], [90, '1½ minutes'], [120, '2 minutes'], [180, '3 minutes']].map(([sec, label]) =>
            `<option value="${sec}" ${(val('turnTimer') || 0) === sec ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <span class="hint" style="font-weight:400">When time runs out the game plays for you (rolls, discards at random, ends the turn). Short steps like discarding get at most 1 minute.</span></label>
      <label class="toggle${chg('friendlyBandit')}"><input type="checkbox" id="s-friendly" ${val('friendlyBandit') ? 'checked' : ''}>
        <span><b>Friendly bandit</b><br><span class="hint">The bandit can't be placed next to players with 2 or fewer points. Nice for newer players.</span></span></label>
    </div>
    ${!host && Object.keys(draft).length ? `<div class="suggestbar">
        <span style="flex:1">Your suggestion: <b>${describeChanges(s, draft)}</b></span>
        <button class="btn small" id="draft-reset">Reset</button>
        <button class="btn small primary" id="draft-send">Suggest to host</button></div>` : ''}
    ${renderSuggestions(v, host)}
    <div style="margin-top:20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      ${host ? `<button class="btn primary" id="start" ${n < 2 ? 'disabled' : ''}>Start game</button><span class="hint" style="flex:1">${n < 2 ? 'Waiting for at least one more player…' : `Ready with ${n} players.`}</span>`
        : `<span class="hint" style="flex:1">Waiting for the host to start the game…</span>${canClaim ? '<button class="btn" id="claim">Host is offline — become host</button>' : ''}`}
      <button class="btn" id="leave">Leave room</button>
    </div>`;
  document.querySelectorAll('[data-color]').forEach((b) => { b.onclick = () => send({ type: 'setColor', color: b.dataset.color }); });
  document.querySelectorAll('[data-kick]').forEach((b) => { b.onclick = () => send({ type: 'kick', pid: b.dataset.kick }); });
  bindSuggestions(v);
  {
    // host: apply now · others: add to the draft
    const upd = (patch) => {
      if (host) return send({ type: 'settings', settings: patch });
      Object.assign(S.draft, patch);
      renderLobby(S.v);
    };
    $('#s-mode').onchange = (e) => upd({ mode: e.target.value, vpTarget: e.target.value === 'crowns' ? 13 : 10 });
    if ($('#s-raid')) $('#s-raid').onchange = (e) => upd({ firstRaid: Number(e.target.value) });
    $('#s-vp').onchange = (e) => upd({ vpTarget: Math.max(5, Math.min(20, Math.round(Number(e.target.value)) || 10)) });
    $('#s-discard').onchange = (e) => upd({ discardLimit: Math.max(5, Math.min(12, Math.round(Number(e.target.value)) || 7)) });
    $('#s-size').onchange = (e) => upd({ boardSize: e.target.value });
    $('#s-map').onchange = (e) => upd({ mapStyle: e.target.value });
    $('#s-fog').onchange = (e) => upd({ fog: e.target.checked });
    $('#s-builder').onchange = (e) => upd({ builderPhase: e.target.checked });
    $('#s-timer').onchange = (e) => upd({ turnTimer: Number(e.target.value) });
    $('#s-friendly').onchange = (e) => upd({ friendlyBandit: e.target.checked });
  }
  if (host) $('#start').onclick = () => send({ type: 'start' });
  if ($('#draft-reset')) $('#draft-reset').onclick = () => { S.draft = {}; renderLobby(S.v); };
  if ($('#draft-send')) {
    $('#draft-send').onclick = async () => {
      if (await send({ type: 'suggest', settings: S.draft })) { S.draft = {}; renderLobby(S.v); toast('Suggestion sent to the host'); }
    };
  }
  if ($('#claim')) $('#claim').onclick = () => send({ type: 'claimHost' });
  $('#leave').onclick = async () => {
    if (!confirm('Leave this room?')) return;
    S.es.close(); // close first so the server dropping our feed isn't mistaken for a lost room
    if (await send({ type: 'leave' })) { forget(S.code); S.v = null; history.replaceState(null, '', '/'); renderHome(); }
    else connect();
  };
}

// ---------- settings suggestions ----------
const SETTING_TEXT = {
  mode: ['Mode', (x) => (x === 'crowns' ? 'Crowns & Raiders' : 'Classic')],
  firstRaid: ['First raid after', (x) => `${x || 7} steps`],
  mapStyle: ['Map', (x) => (x === 'random' ? 'random' : 'balanced')],
  fog: ['Fog', (x) => (x ? 'on' : 'off')],
  vpTarget: ['Points to win', (x) => x],
  boardSize: ['Island', (x) => x],
  discardLimit: ['Hand limit', (x) => x],
  builderPhase: ['Builder phase', (x) => (x ? 'on' : 'off')],
  turnTimer: ['Turn timer', (x) => (x ? `${x / 60} min` : 'off')],
  friendlyBandit: ['Friendly bandit', (x) => (x ? 'on' : 'off')],
};
function describeChanges(cur, changes) {
  return Object.entries(changes)
    .map(([k, x]) => esc(`${SETTING_TEXT[k][0]} ${SETTING_TEXT[k][1](cur[k])} → ${SETTING_TEXT[k][1](x)}`))
    .join(' · ');
}

function renderSuggestions(v, host) {
  const list = v.suggestions || [];
  if (!list.length) return '';
  const n = v.players.length;
  return `<div class="suggestions"><h3>Suggestions <span class="hint">${host ? 'votes are advice — you decide' : 'the host decides'}</span></h3>${list.map((sg) => {
    const votes = Object.entries(sg.votes);
    const yes = votes.filter(([, x]) => x === 1).map(([id]) => pname(v, id));
    const no = votes.filter(([, x]) => x === -1).map(([id]) => pname(v, id));
    const mine = sg.votes[v.me] || 0;
    const by = v.players.find((p) => p.id === sg.by);
    return `<div class="sugg">
      <div>${chip(by ? by.color : '#999')} <b>${esc(pname(v, sg.by))}</b> suggests</div>
      <div class="sugg-what">${describeChanges(v.settings, sg.changes)}</div>
      <div class="sugg-row">
        <button class="btn small ${mine === 1 ? 'on' : ''}" data-vote="${sg.id}:1" title="${esc(yes.join(', ') || 'No votes yet')}" aria-pressed="${mine === 1}">👍 ${yes.length}</button>
        <button class="btn small ${mine === -1 ? 'on' : ''}" data-vote="${sg.id}:-1" title="${esc(no.join(', ') || 'No votes yet')}" aria-pressed="${mine === -1}">👎 ${no.length}</button>
        <span class="hint" style="flex:1">${yes.length} of ${n} in favor${yes.length > n / 2 ? ' · <b>majority</b>' : ''}</span>
        ${host ? `<button class="btn small" data-sugg-dismiss="${sg.id}">Dismiss</button><button class="btn small primary" data-sugg-apply="${sg.id}">Apply</button>`
          : sg.by === v.me ? `<button class="btn small" data-sugg-dismiss="${sg.id}">Withdraw</button>` : ''}
      </div></div>`;
  }).join('')}</div>`;
}

function bindSuggestions(v) {
  document.querySelectorAll('[data-vote]').forEach((b) => {
    b.onclick = () => {
      const [id, x] = b.dataset.vote.split(':');
      const sg = v.suggestions.find((q) => q.id === id);
      send({ type: 'vote', id, value: sg && sg.votes[v.me] === Number(x) ? 0 : Number(x) }); // clicking your vote again clears it
    };
  });
  document.querySelectorAll('[data-sugg-apply]').forEach((b) => { b.onclick = () => send({ type: 'applySuggestion', id: b.dataset.suggApply }); });
  document.querySelectorAll('[data-sugg-dismiss]').forEach((b) => { b.onclick = () => send({ type: 'dismissSuggestion', id: b.dataset.suggDismiss }); });
}

// toast + chime when someone else posts a new suggestion
function noticeSuggestions(v) {
  const ids = new Set((v.suggestions || []).map((x) => x.id));
  if (S.seenSugg) {
    for (const sg of v.suggestions || []) {
      if (!S.seenSugg.has(sg.id) && sg.by !== v.me) { toast(`💡 ${pname(v, sg.by)} suggested a settings change`); chime('trade'); }
    }
  }
  S.seenSugg = ids;
}

function bindChat() {
  $('#chat').onsubmit = (e) => {
    e.preventDefault();
    const inp = e.target.querySelector('input');
    if (inp.value.trim()) send({ type: 'chat', text: inp.value });
    inp.value = '';
  };
}

function renderLog(v) {
  const el = $('#log');
  if (!el) return;
  const last = v.log.length ? v.log[v.log.length - 1].id : 0;
  if (last === S.lastLog && el.childElementCount) return;
  S.lastLog = last;
  el.innerHTML = v.log.map((l) => {
    if (l.chat) return `<div class="e chat"><b style="color:${pcolor(v, l.from)};filter:brightness(.8)">${esc(pname(v, l.from))}:</b> ${esc(l.msg)}</div>`;
    if (l.data && l.data.type === 'harvest') return harvestLine(v, l.data);
    const seven = /rolled 7 \(|^Bandits!/.test(l.msg);
    const cls = l.private ? 'private' : seven ? 'seven' : (l.msg.startsWith('—') ? 'turn' : '');
    return `<div class="e ${cls}">${decorateLog(v, esc(tr(l.msg)))}</div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

// "who got what": a row per player — their color, their name, then one icon per card
function harvestLine(v, d) {
  const rows = Object.entries(d.gains).map(([pid, c]) => {
    const icons = ALLC.filter((r) => c[r] > 0).map((r) => `<span class="gain" title="${c[r]} ${RM[r].name}">${c[r] <= 3 ? RM[r].ico.repeat(c[r]) : `${RM[r].ico}×${c[r]}`}</span>`).join('');
    return `<span class="hv">${whoTag(v, pid)}${icons || '<span class="hint">nothing</span>'}</span>`;
  });
  return `<div class="e harvest">${d.setup ? '' : '<span class="hv-tag">🎲 Harvest</span>'}${rows.join('')}</div>`;
}

const whoTag = (v, pid) => {
  const p = v.players.find((x) => x.id === pid);
  return `<span class="who">${chip(p ? p.color : '#999')}${esc(p ? p.name : 'Someone')}</span>`;
};

// Put each player's color dot in front of their name and an icon next to resource names.
// Works on already-escaped text; longest names first so "Ana" never splits "Anabel".
function decorateLog(v, html) {
  const players = v.players.map((p) => ({ p, n: esc(p.name) })).sort((a, b) => b.n.length - a.n.length);
  const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const words = [...players.map((x) => reEsc(x.n)), ...ALLC.map((r) => tr(RM[r].name))];
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_])(${words.join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'gu');
  return html.replace(re, (m, pre, w) => {
    const pl = players.find((x) => x.n === w);
    if (pl) return `${pre}<span class="who">${chip(pl.p.color)}${w}</span>`;
    const r = ALLC.find((k) => tr(RM[k].name) === w);
    return `${pre}${RM[r].ico} ${w}`;
  });
}

// ---------- game ----------
function renderGame(v) {
  if (S.screen !== 'game') {
    S.screen = 'game'; S.boardKey = null; S.lastLog = 0; S.mode = null;
    $('#app').innerHTML = `
    <div class="game">
      <header class="topbar">
        <span class="brand">${LOGO_SVG}Hexhaven</span>
        <span class="roomtag" id="roomtag" title="${S.replay ? 'Watching a replay' : 'Copy invite link'}">${S.replay ? '▶ Replay' : 'Room ' + esc(v.code)}</span>
        <div class="status" id="status"></div>
        <span class="conn" id="conn"></span>
        <span class="timer" id="timer" hidden title="Time left before the game auto-plays"></span>
        <div class="dice" id="dice"></div>
        <button class="btn small" id="savebtn" title="Download this game as a save file" hidden>💾 Save</button>
        <button class="btn small" id="endbtn" title="End the game for everyone and go back to the lobby" hidden>🏁 End</button>
        ${langButton()}
        ${themeToggle()}
        <button class="btn small" id="motion" aria-label="Animations">✨</button>
        <button class="btn small" id="mute" title="Sound on/off"></button>
      </header>
      <div class="boardwrap" id="boardwrap">
        <svg id="board" xmlns="http://www.w3.org/2000/svg"><g id="g-static"></g><g id="g-low"></g><g id="g-dyn" filter="url(#piece-shadow)"></g><g id="g-hint"></g></svg>
        <div class="board-legend" id="legend"></div>
        <div class="fx" id="fx" aria-live="polite"></div>
        <div class="timerbar" id="timerbar" hidden aria-hidden="true"><div></div></div>
        <div class="seven-banner" id="seven-banner" role="status" hidden></div>
        <div class="fog-banner" id="fog-banner" role="status" hidden><b>🌫️ Fog</b><span>The island is hidden until everyone has placed their starting pieces — only the harbors show.</span></div>
        <div class="left-stack" id="left-stack">
          <div class="trade-float" id="trade-sec" role="region" aria-label="Trade offer" hidden></div>
          <div class="map-vote" id="map-vote" role="region" aria-label="Map vote" hidden></div>
          <div class="cr-float" id="cr-float" role="region" aria-label="Your cards" hidden></div>
        </div>
        <div class="zoomctl" role="group" aria-label="Map zoom">
          <button class="btn small" data-zoom="in" title="Zoom in (+ / mouse wheel / pinch)" aria-label="Zoom in">+</button>
          <button class="btn small" data-zoom="out" title="Zoom out (−)" aria-label="Zoom out">−</button>
          <button class="btn small" data-zoom="reset" title="Fit whole island (0)" aria-label="Reset zoom">⤢</button>
        </div>
      </div>
      <div class="dock" id="dock"></div>
      <aside class="side">
        <section id="cr-sec" hidden><h3>⛵ Raiders <span class="hint" id="cr-count"></span></h3><div class="cr-track" id="cr-track"></div></section>
        <section><h3>Players <span class="hint" id="vp-target"></span><button class="btn small" id="pts-more" title="Where everyone's points come from">Points</button></h3><div class="players" id="players"></div></section>
        <section><h3>Dice stats <button class="btn small" id="stats-more">Details</button></h3>
          <div class="hint" id="dice-sum" style="margin:-4px 0 6px"></div>
          <div class="stats" id="stats"></div><div class="stats-l" id="stats-l"></div>
          <div class="recent" id="recent-rolls"></div>
          <div class="hint" id="bankinfo" style="margin-top:6px"></div></section>
        <section class="logsec"><h3>Log &amp; chat</h3><div class="log" id="log"></div>
          <form class="chatform" id="chat"><input type="text" maxlength="300" placeholder="Chat…" aria-label="Chat message"><button class="btn small">Send</button></form>
          <div class="buildfoot">${buildTag()}</div>
        </section>
      </aside>
    </div>`;
    $('#roomtag').onclick = () => { if (!S.replay) copyInvite(); };
    $('#savebtn').onclick = downloadSave;
    $('#endbtn').onclick = () => {
      if (confirm("End this game for everyone and go back to the lobby? It can't be resumed — click 💾 Save first if you want to keep it.")) send({ type: 'endGame' });
    };
    $('#stats-more').onclick = () => openModal('dice');
    $('#pts-more').onclick = () => openModal('points');
    $('#board').addEventListener('click', onBoardClick);
    bindZoom();
    const muteLabel = () => { $('#mute').textContent = soundOn() ? '🔔' : '🔕'; };
    $('#mute').onclick = () => {
      try { localStorage.setItem('hexhaven:mute', soundOn() ? '1' : '0'); } catch {}
      muteLabel(); if (soundOn()) chime('turn');
    };
    muteLabel();
    $('#motion').onclick = () => {
      try { localStorage.setItem('hexhaven:motion', motionOn() ? 'off' : 'on'); } catch {}
      applyMotion();
      toast(motionOn() ? '✨ Animations on' : 'Animations off');
    };
    applyMotion();
    themeButton();
    bindChat();
  }
  if (!isBuilding(v) || (CR_MAIN_MODES.includes(S.mode) && !(isMine(v) && v.turn.phase === 'main'))) { S.mode = null; S.cr = null; }
  renderStatus(v);
  renderBoardStatic(v);
  renderBoardDyn(v);
  if (S.replay) renderReplayBar(v); else renderDock(v);
  $('#savebtn').hidden = !!S.replay || !canSave(v);
  $('#endbtn').hidden = !!S.replay || v.status !== 'playing' || v.hostId !== v.me;
  $('#chat').hidden = !!S.replay;
  renderPlayers(v);
  renderTrade(v);
  renderMapVote(v);
  $('#fog-banner').hidden = !(v.fog && v.status === 'playing');
  renderStats(v);
  renderLog(v);
  renderModal(v);
}

const isMine = (v) => v.turn.current === v.me;
const isBuilding = (v) => v.status === 'playing' && ((isMine(v) && v.turn.phase === 'main') || (v.turn.phase === 'builder' && v.turn.builder === v.me));
const CR_MAIN_MODES = ['wmove', 'wpush', 'edict']; // board picks only for your own main phase

function boardMode(v) {
  const t = v.turn; const mine = isMine(v);
  if (v.status !== 'playing') return null;
  if (t.phase === 'setup' && mine) return t.setupNeed;
  if (t.phase === 'roadbuilding' && mine) return 'road';
  if (t.phase === 'robber' && mine) return 'bandit';
  if (v.crowns && t.phase === 'raid' && v.hints.raidCities.length) return 'raid';
  return isBuilding(v) ? S.mode : null;
}

function statusText(v) {
  const t = v.turn; const mine = isMine(v); const cur = esc(pname(v, t.current));
  if (v.status === 'over') return `🏆 ${esc(pname(v, v.winner))} wins!`;
  if (v.crowns) { const c = crStatus(v); if (c) return c; }
  switch (t.phase) {
    case 'order': {
      const o = v.order;
      const waiting = o.contenders.filter((id) => o.rolls[id] === undefined);
      if (waiting.includes(v.me)) return o.round > 1 ? 'Tie! Roll again to break it' : 'Roll the dice — highest roll goes first';
      return `Rolling for turn order… waiting for ${waiting.map((id) => esc(pname(v, id))).join(', ')}`;
    }
    case 'setup': {
      const second = t.setupRound === 2;
      const piece = v.crowns && second ? 'city' : 'settlement';
      const what = t.setupNeed === 'village' ? (second ? `second piece: a ${piece} (it pays out right away)` : 'first settlement') : 'road next to it';
      return mine ? `Place your ${what} — click a glowing spot` : `${cur} is placing their ${t.setupNeed === 'village' ? piece : 'road'}…`;
    }
    case 'preroll': return mine ? 'Your turn — roll the dice' : `${cur} is about to roll…`;
    case 'discard': {
      const need = v.pendingDiscard[v.me];
      if (need) return `Bandits! Discard ${need} cards`;
      return `Waiting for ${Object.keys(v.pendingDiscard).map((id) => esc(pname(v, id))).join(', ')} to discard…`;
    }
    case 'robber': return mine ? 'Move the bandit — click any tile' : `${cur} is moving the bandit…`;
    case 'steal': return mine ? 'Choose who to rob' : `${cur} is choosing who to rob…`;
    case 'roadbuilding': return mine ? `Place ${t.freeRoads} free road${t.freeRoads > 1 ? 's' : ''}` : `${cur} is building free roads…`;
    case 'main': return mine ? 'Build, trade, or end your turn' : `${cur}'s turn`;
    case 'builder': return t.builder === v.me ? 'Builder phase — build something or pass' : `Builder phase: ${esc(pname(v, t.builder))} may build…`;
  }
  return '';
}

function renderStatus(v) {
  const el = $('#status');
  const needMe = v.status === 'playing' && (v.stalled || []).includes(v.me);
  el.className = 'status' + (needMe ? ' mine' : '');
  el.innerHTML = `<span class="turnchip" style="background:${pcolor(v, v.turn.phase === 'builder' ? v.turn.builder : v.turn.current)}"></span><span>${statusText(v)}</span>`;
  $('#dice').innerHTML = v.turn.dice ? v.turn.dice.map((n, i) => dieSvg(n, v.crowns && i === 1)).join('') + (v.crowns && v.turn.event ? crEventDieSvg(v.turn.event) : '') : '';
  if (v.crowns) crRenderTrack(v); else $('#cr-sec').hidden = true;
  // a 7 keeps a red banner on the board until the discards, the bandit move and the steal are done
  const t = v.turn;
  const rolledSeven = !!(t.dice && t.dice[0] + t.dice[1] === 7);
  const banditTime = v.status === 'playing' && rolledSeven && ['discard', 'robber', 'steal'].includes(t.phase);
  $('#dice').classList.toggle('seven', rolledSeven);
  const banner = $('#seven-banner');
  banner.hidden = !banditTime;
  banner.classList.remove('raid');
  if (v.crowns && v.status === 'playing' && t.phase === 'raid') {
    banner.hidden = false; banner.classList.add('raid');
    const waiting = Object.keys(v.crowns.pendingRaid);
    banner.innerHTML = `<b>⚔️ The raiders won!</b><span>${v.hints.raidCities.length ? 'click one of your cities to lose — it becomes a settlement'
      : `waiting for ${waiting.map((id) => esc(pname(v, id))).join(', ')} to choose a city`}</span>`;
  }
  if (banditTime) {
    const cur = esc(pname(v, t.current)); const mine = isMine(v);
    let what;
    if (t.phase === 'discard') {
      what = v.pendingDiscard[v.me] ? `you must discard ${v.pendingDiscard[v.me]} cards`
        : `waiting for ${Object.keys(v.pendingDiscard).map((id) => esc(pname(v, id))).join(', ')} to discard`;
    } else if (t.phase === 'robber') what = mine ? 'click a tile to move the bandit' : `${cur} is moving the bandit`;
    else what = mine ? 'pick a card to steal' : `${cur} is choosing a card to steal`;
    banner.innerHTML = `<b>🥷 7 rolled — Bandits!</b><span>${what}</span>`;
  }
  $('#vp-target').textContent = `first to ${v.settings.vpTarget}`;
}

const PIP_SPOTS = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] };

// flat die (top bar): a rounded square with pips
function dieSvg(n, red) {
  return `<svg viewBox="0 0 40 40" aria-label="${red ? 'red ' : ''}die ${n}"><rect x="2" y="2" width="36" height="36" rx="8" fill="${red ? '#c8372d' : '#fffaf0'}" stroke="#2b2118" stroke-width="2"/>${PIP_SPOTS[n].map(([x, y]) => `<circle cx="${x * 10}" cy="${y * 10}" r="3.6" fill="${red ? '#fff' : '#2b2118'}"/>`).join('')}</svg>`;
}

// pips only, for the faces of the 3D dice — the face itself is a solid square so the cube has no gaps
function pipsSvg(n, color = '#2b2118') {
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${PIP_SPOTS[n].map(([x, y]) => `<circle cx="${x * 10}" cy="${y * 10}" r="3.8" fill="${color}"/>`).join('')}</svg>`;
}

// ---------- board ----------
function hexPoints(v, h) { return h.v.map((id) => `${v.board.vertices[id].x * U},${v.board.vertices[id].y * U}`).join(' '); }
const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

// mix two #rrggbb colors (t = 0 → a, 1 → b)
function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((c, i) => Math.round(c + (y[i] - c) * t).toString(16).padStart(2, '0')).join('');
}

// Board art, defined once: light-from-above shading per terrain, a faint texture per terrain
// (trees, bricks, tufts, furrows, peaks, ripples), sand, token finish and soft shadows.
const TERRAIN_TEXTURE = {
  wood: [18, 16, '<path d="M5 3 9 10H1Z M14 9 18 16H10Z" fill="#1d4620" opacity=".38"/><path d="M5 10v2 M14 16v1" stroke="#3b2a14" stroke-width="1" opacity=".3"/>'],
  clay: [16, 9, '<path d="M0 .5H16 M0 4.5H16 M4 .5V4.5 M12 4.5V8.5" stroke="#6e2c12" stroke-width=".9" opacity=".32"/>'],
  fleece: [16, 14, '<path d="M3 6q1-3 2 0 M10 12q1-3 2 0" stroke="#4d7a25" stroke-width="1.1" fill="none" opacity=".45"/><circle cx="12" cy="4" r="1.3" fill="#fff" opacity=".45"/>'],
  wheat: [10, 10, '<path d="M0 10 10 0 M-2 2 2 -2 M8 12 12 8" stroke="#8a6608" stroke-width="1.1" opacity=".3"/>'],
  iron: [20, 16, '<path d="M2 14 8 6l6 8 M11 14l4-5 4 5" fill="none" stroke="#2c333c" stroke-width="1.3" opacity=".38"/><path d="M6.5 8 8 6l1.5 2" stroke="#fff" stroke-width="1.2" fill="none" opacity=".55"/>'],
  desert: [20, 10, '<path d="M0 7q5-4 10 0t10 0" fill="none" stroke="#86703d" stroke-width="1" opacity=".42"/>'],
};
const BOARD_DEFS = [
  '<filter id="plate-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.1" flood-color="#000" flood-opacity=".38"/></filter>',
  '<filter id="island-shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/><feOffset dy="8"/></filter>',
  '<filter id="piece-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.2" flood-color="#000" flood-opacity=".45"/></filter>',
  '<radialGradient id="token" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#ecdcb8"/></radialGradient>',
  '<radialGradient id="sand" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#f3e2b4"/><stop offset="1" stop-color="#dcc188"/></radialGradient>',
  ...Object.keys(RM).filter((r) => RM[r].color).map((r) => `<linearGradient id="g-${r}" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${mixHex(RM[r].color, '#ffffff', 0.2)}"/><stop offset=".55" stop-color="${RM[r].color}"/><stop offset="1" stop-color="${mixHex(RM[r].color, RM[r].deep, 0.35)}"/></linearGradient>`),
  ...Object.entries(TERRAIN_TEXTURE).map(([r, [w, h, d]]) => `<pattern id="p-${r}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${d}</pattern>`),
].join('');

// A little seven-tile island for the home page, drawn with the same art as the board.
function heroIsland() {
  const S = 36, SQ3 = Math.sqrt(3);
  const tiles = [[0, 0, 'wheat', 8], [1, 0, 'wood', 6], [1, -1, 'iron', 5], [0, -1, 'fleece', 10], [-1, 0, 'clay', 9], [-1, 1, 'wood', 4], [0, 1, 'desert', null]];
  const corners = (cx, cy, k) => [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return [cx + S * k * Math.cos(a), cy + S * k * Math.sin(a)];
  });
  const pts = (arr) => arr.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const at = tiles.map(([q, r, res, num]) => ({ x: S * SQ3 * (q + r / 2), y: S * 1.5 * r, res, num }));
  let g = `<g filter="url(#island-shadow)">${at.map((t) => `<polygon points="${pts(corners(t.x, t.y, 1.22))}" fill="#0b2f40" opacity=".5"/>`).join('')}</g>`;
  g += at.map((t) => `<polygon points="${pts(corners(t.x, t.y, 1.45))}" fill="#7cc4c9" opacity=".22"/>`).join('');
  g += at.map((t) => `<polygon points="${pts(corners(t.x, t.y, 1.18))}" fill="url(#sand)" stroke="#e2c58c" stroke-width="2"/>`).join('');
  for (const t of at) {
    const p = pts(corners(t.x, t.y, 1));
    g += `<polygon points="${p}" fill="url(#g-${t.res})" stroke="#f1dfb0" stroke-width="3" stroke-linejoin="round"/><polygon points="${p}" fill="url(#p-${t.res})"/>`;
    g += `<circle cx="${t.x}" cy="${t.y - (t.num ? 9 : 0)}" r="11" fill="#fffaf0" stroke="${RM[t.res].deep}" stroke-width="2" filter="url(#plate-shadow)"/>`;
    g += `<text x="${t.x}" y="${t.y - (t.num ? 9 : 0) + 1}" font-size="13" text-anchor="middle" dominant-baseline="central">${RM[t.res].ico}</text>`;
    if (t.num) {
      const red = t.num === 6 || t.num === 8;
      g += `<circle cx="${t.x}" cy="${t.y + 14}" r="10" fill="url(#token)" stroke="#9c825a" stroke-width="1.2" filter="url(#plate-shadow)"/>`;
      g += `<text x="${t.x}" y="${t.y + 14.5}" font-size="11" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="${red ? '#c0281c' : '#2b2118'}" class="tok-num">${t.num}</text>`;
    }
  }
  // a road and a settlement where wheat, wood and iron meet
  const [w0] = [corners(at[0].x, at[0].y, 1)];
  const v = w0[1]; const v2 = w0[0];
  g += `<g filter="url(#piece-shadow)"><line x1="${v[0]}" y1="${v[1]}" x2="${(v[0] + v2[0]) / 2 + 2}" y2="${(v[1] + v2[1]) / 2 + 1}" stroke="#1d150e" stroke-width="8" stroke-linecap="round"/>`
    + `<line x1="${v[0]}" y1="${v[1]}" x2="${(v[0] + v2[0]) / 2 + 2}" y2="${(v[1] + v2[1]) / 2 + 1}" stroke="${PC.red}" stroke-width="5" stroke-linecap="round"/>`
    + villageShape(v[0], v[1], PC.red) + '</g>';
  return `<svg class="hero-art" viewBox="-140 -118 280 236" aria-hidden="true"><defs>${BOARD_DEFS}</defs>${g}</svg>`;
}

function renderBoardStatic(v) {
  const b = v.board;
  const key = v.code + ':' + b.hexes.map((h) => h.res + h.num).join(',') + ':' + b.harbors.map((h) => h.edge + h.type).join(',');
  if (S.boardKey === key) return;
  S.boardKey = key;
  const xs = b.vertices.map((p) => p.x).concat(b.harbors.map((h) => h.x));
  const ys = b.vertices.map((p) => p.y).concat(b.harbors.map((h) => h.y));
  const pad = 0.55;
  const minX = (Math.min(...xs) - pad) * U, minY = (Math.min(...ys) - pad) * U;
  const w = (Math.max(...xs) - Math.min(...xs) + 2 * pad) * U, h = (Math.max(...ys) - Math.min(...ys) + 2 * pad) * U;
  S.vb0 = [minX, minY, w, h]; S.vb = S.vb0.slice();
  // on smaller screens start a little zoomed in so tiles are big and the map can be dragged right away;
  // on big screens (1080p and up) the whole island already fits nicely. ⤢ always shows the whole island.
  const wrapH = ($('#boardwrap') || {}).clientHeight || 0;
  if (wrapH < 720) zoomBy(b.radius >= 3 ? 1.45 : 1.25); else applyVB();
  // hex corners pushed out (k > 1) or pulled in (k < 1) around the tile's center
  const ring = (hx, k) => hx.v.map((id) => {
    const p = b.vertices[id];
    return `${(hx.x + (p.x - hx.x) * k) * U},${(hx.y + (p.y - hx.y) * k) * U}`;
  }).join(' ');
  let out = `<defs>${BOARD_DEFS}</defs>`;

  // the island: a soft shadow, a ring of shallow water, then the beach — each tile's hex grown a little
  out += `<g filter="url(#island-shadow)">${b.hexes.map((hx) => `<polygon points="${ring(hx, 1.2)}" fill="#0b2f40" opacity=".55"/>`).join('')}</g>`;
  out += `<g>${b.hexes.map((hx) => `<polygon points="${ring(hx, 1.42)}" fill="#7cc4c9" opacity=".22"/>`).join('')}</g>`;
  out += `<g>${b.hexes.map((hx) => `<polygon points="${ring(hx, 1.17)}" fill="url(#sand)" stroke="#e2c58c" stroke-width="2" stroke-linejoin="round"/>`).join('')}</g>`;

  // harbor docks: wooden planks from the badge to the two coast corners
  for (const hb of b.harbors) {
    const E = b.edges[hb.edge]; const A = b.vertices[E.a]; const B = b.vertices[E.b];
    for (const P of [A, B]) {
      const c = `x1="${hb.x * U}" y1="${hb.y * U}" x2="${P.x * U}" y2="${P.y * U}"`;
      out += `<line ${c} stroke="#5b3a1c" stroke-width="7" stroke-linecap="round"/><line ${c} stroke="#a8743f" stroke-width="4" stroke-linecap="round" stroke-dasharray="5 2"/>`;
    }
  }

  for (const hx of b.hexes) {
    const pts = hexPoints(v, hx);
    // base color with a little light from the top, the terrain texture, then a thin inner highlight
    out += `<polygon points="${pts}" fill="url(#g-${hx.res})" stroke="#f1dfb0" stroke-width="3.5" stroke-linejoin="round"/>`;
    out += `<polygon points="${pts}" fill="url(#p-${hx.res})" pointer-events="none"/>`;
    out += `<polygon points="${ring(hx, 0.9)}" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.5" stroke-linejoin="round" pointer-events="none"/>`;
    const cx = hx.x * U, cy = hx.y * U;
    out += `<circle cx="${cx}" cy="${cy - 24}" r="14" fill="#fffaf0" stroke="${RM[hx.res].deep}" stroke-width="2.5" filter="url(#plate-shadow)"/>`;
    out += `<text x="${cx}" y="${cy - 23}" font-size="17" text-anchor="middle" dominant-baseline="central">${RM[hx.res].ico}</text>`;
    if (hx.res === 'fog') { // hidden until the fog lifts
      out += `<circle cx="${cx}" cy="${cy + 9}" r="17.5" fill="#dfe6ea" stroke="#566872" stroke-width="1.5" filter="url(#plate-shadow)"/>`;
      out += `<text x="${cx}" y="${cy + 10}" font-size="18" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#566872">?</text>`;
    }
    if (hx.num) {
      const red = hx.num === 6 || hx.num === 8;
      out += `<circle cx="${cx}" cy="${cy + 9}" r="17.5" fill="url(#token)" stroke="#9c825a" stroke-width="1.5" filter="url(#plate-shadow)"/>`;
      out += `<circle cx="${cx}" cy="${cy + 9}" r="14.5" fill="none" stroke="#c9b48e" stroke-width=".8"/>`;
      out += `<text x="${cx}" y="${cy + 6}" font-size="${red ? 18 : 16}" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="${red ? '#c0281c' : '#2b2118'}" class="tok-num">${hx.num}</text>`;
      const n = PIPS[hx.num];
      for (let i = 0; i < n; i++) out += `<circle cx="${cx + (i - (n - 1) / 2) * 4}" cy="${cy + 19}" r="1.5" fill="${red ? '#c0281c' : '#2b2118'}"/>`;
    }
  }
  for (const hb of b.harbors) {
    const label = hb.type === 'any' ? '3:1' : '2:1';
    out += `<circle cx="${hb.x * U}" cy="${hb.y * U}" r="17" fill="url(#token)" stroke="#5b3a1c" stroke-width="2.5" filter="url(#plate-shadow)"/>`;
    if (hb.type === 'any') out += `<text x="${hb.x * U}" y="${hb.y * U}" font-size="12" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#2b2118">${label}</text>`;
    else {
      out += `<text x="${hb.x * U}" y="${hb.y * U - 5}" font-size="12" text-anchor="middle" dominant-baseline="central">${RM[hb.type].ico}</text>`;
      out += `<text x="${hb.x * U}" y="${hb.y * U + 8}" font-size="9" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#2b2118">${label}</text>`;
    }
  }
  $('#g-static').innerHTML = out;
  if (S.wasFog === v.code && !v.fog && motionOn()) { const g = $('#g-static'); g.classList.remove('reveal'); void g.getBBox(); g.classList.add('reveal'); }
  if (S.wasFog === v.code && !v.fog && !S.replay) toast('🌫️ The fog lifts! The island is revealed.');
  S.wasFog = v.fog ? v.code : null; // remember per room, so another room never "lifts"
  $('#legend').innerHTML = RES.map((r) => `<span>${RM[r].ico} ${RM[r].name}</span>`).join('') + '<span>⚓ 3:1 any · 2:1 shown</span>';
}

function villageShape(x, y, color) {
  return `<g transform="translate(${x},${y}) scale(1.35)"><path d="M-9,7 L9,7 L9,-2 L0,-11 L-9,-2 Z" fill="${color}" stroke="#1d150e" stroke-width="1.8" stroke-linejoin="round"/></g>`;
}
function townShape(x, y, color) {
  return `<g transform="translate(${x},${y}) scale(1.35)"><path d="M-14,9 L14,9 L14,-4 L3,-4 L3,-9 L-5.5,-17 L-14,-9 Z" fill="${color}" stroke="#1d150e" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="6" y="1" width="4" height="4" fill="#1d150e" opacity=".55"/></g>`;
}

function renderBoardDyn(v) {
  const b = v.board;
  let out = '';
  // highlight tiles that just produced
  if (v.turn.dice && v.status === 'playing') {
    const sum = v.turn.dice[0] + v.turn.dice[1];
    for (const hx of b.hexes) if (hx.num === sum) out += `<circle cx="${hx.x * U}" cy="${hx.y * U + 9}" r="20" fill="none" stroke="#ffe08a" stroke-width="4" opacity="${hx.id === v.bandit ? .35 : .95}"/>`;
  }
  // pieces placed in the last moment get an entrance animation; a negative delay keeps it
  // in step across re-renders so it never restarts
  const anim = (key, cls) => {
    const at = S.recent && S.recent.get(key);
    const age = at ? Date.now() - at : Infinity;
    return age < 900 ? ` class="${cls}" style="animation-delay:-${age}ms"` : '';
  };
  for (const [e, owner] of Object.entries(v.roads)) {
    const E = b.edges[e]; const A = b.vertices[E.a]; const B = b.vertices[E.b];
    const x1 = A.x * U + (B.x - A.x) * U * 0.2, y1 = A.y * U + (B.y - A.y) * U * 0.2;
    const x2 = B.x * U - (B.x - A.x) * U * 0.2, y2 = B.y * U - (B.y - A.y) * U * 0.2;
    out += `<g${anim('r' + e, 'grow')}><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1d150e" stroke-width="10" stroke-linecap="round"/>`;
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${pcolor(v, owner)}" stroke-width="6" stroke-linecap="round"/></g>`;
  }
  if (v.crowns) out += crBoardUnder(v);
  for (const [vid, bd] of Object.entries(v.buildings)) {
    const V = b.vertices[vid];
    out += `<g${anim('b' + vid + bd.type, 'drop')}>${bd.type === 'town' ? townShape(V.x * U, V.y * U, pcolor(v, bd.owner)) : villageShape(V.x * U, V.y * U, pcolor(v, bd.owner))}</g>`;
  }
  if (v.crowns) out += crBoardOver(v, anim);
  // fading rings around pieces built in the last few seconds
  for (const [k, at] of S.recent || []) {
    const age = Date.now() - at;
    let x, y;
    if (k[0] === 'b' || k[0] === 'w') { const V = b.vertices[parseInt(k.slice(1), 10)]; x = V.x * U; y = V.y * U - 2; }
    else { const E = b.edges[k.slice(1)]; x = (b.vertices[E.a].x + b.vertices[E.b].x) / 2 * U; y = (b.vertices[E.a].y + b.vertices[E.b].y) / 2 * U; }
    out += `<circle class="fresh" cx="${x}" cy="${y}" r="20" style="animation-delay:-${age}ms"/>`;
  }
  const bh = b.hexes[v.bandit];
  if (bh) {
    const x = bh.x * U - 25, y = bh.y * U + 8;
    // slide in from the tile it just left
    const mv = S.banditMove; const age = mv ? Date.now() - mv.at : Infinity;
    const from = mv && b.hexes[mv.from];
    const slide = age < 800 && from ? ` class="slide" style="--dx:${(from.x - bh.x) * U}px;--dy:${(from.y - bh.y) * U}px;animation-delay:-${age}ms"` : '';
    if (v.status === 'playing' && v.turn.phase === 'robber') out += `<circle class="bandit-ring" cx="${x}" cy="${y - 2}" r="18"/>`;
    out += `<g aria-label="bandit"${slide}><ellipse cx="${x}" cy="${y + 12}" rx="10" ry="3.5" fill="rgba(0,0,0,.35)"/>
      <path d="M${x - 8},${y + 12} Q${x},${y - 16} ${x + 8},${y + 12} Z" fill="#2a2420" stroke="#000" stroke-width="1.5"/>
      <circle cx="${x}" cy="${y - 9}" r="6.5" fill="#2a2420" stroke="#000" stroke-width="1.5"/></g>`;
  }
  $('#g-dyn').innerHTML = out;

  // road + tile targets sit under the pieces; village/town targets sit on top
  let hint = ''; let low = '';
  const mode = boardMode(v);
  if (mode === 'road') {
    for (const e of v.hints.roads) {
      const E = b.edges[e]; const A = b.vertices[E.a]; const B = b.vertices[E.b];
      const c = `x1="${A.x * U}" y1="${A.y * U}" x2="${B.x * U}" y2="${B.y * U}"`;
      low += `<line class="hit-e" data-edge="${e}" ${c}/><line class="hint-e" ${c}/>`;
    }
  } else if (mode === 'village') {
    for (const vid of v.hints.villages) { const V = b.vertices[vid]; hint += `<circle class="hint-v" data-vertex="${vid}" cx="${V.x * U}" cy="${V.y * U}" r="8"/>`; }
  } else if (mode === 'town') {
    for (const vid of v.hints.towns) { const V = b.vertices[vid]; hint += `<circle class="hint-t" data-vertex="${vid}" cx="${V.x * U}" cy="${V.y * U - 2}" r="16"/>`; }
  } else if (mode === 'bandit') {
    for (const hx of v.hints.hexes.map((id) => b.hexes[id])) low +=`<polygon class="hex-hit" data-hex="${hx.id}" points="${hexPoints(v, hx)}"/>`;
  } else if (v.crowns && mode) {
    const h = crBoardHints(v, mode); low += h.low; hint += h.hint;
  }
  $('#g-low').innerHTML = low;
  $('#g-hint').innerHTML = hint;
}

function onBoardClick(e) {
  if (S.dragged) { S.dragged = false; return; } // that was a pan, not a click
  const v = S.v; const t = e.target;
  if (!v || !t.dataset) return;
  const mode = boardMode(v);
  const done = (ok) => { if (ok) { S.mode = null; render(); } };
  if (v.crowns && crBoardClick(v, mode, e)) return;
  if (t.dataset.edge !== undefined && mode === 'road') {
    send({ type: 'buildRoad', edge: Number(t.dataset.edge) }).then(done);
  } else if (t.dataset.vertex !== undefined && mode === 'village') {
    send({ type: 'buildVillage', vertex: Number(t.dataset.vertex) }).then(done);
  } else if (t.dataset.vertex !== undefined && mode === 'town') {
    send({ type: 'buildTown', vertex: Number(t.dataset.vertex) }).then(done);
  } else if (t.dataset.hex !== undefined && mode === 'bandit') {
    send({ type: 'moveBandit', hex: Number(t.dataset.hex) });
  }
}

// ---------- map zoom & pan (edits the SVG viewBox) ----------
function applyVB() {
  const svg = $('#board');
  if (!svg || !S.vb) return;
  svg.setAttribute('viewBox', S.vb.join(' '));
  $('#boardwrap').classList.toggle('zoomed', S.vb[2] < S.vb0[2] - 0.5);
}
function clampVB() {
  const [x0, y0, w0, h0] = S.vb0;
  let [x, y, w] = S.vb;
  w = Math.min(w0, Math.max(w0 / 4, w));
  const h = (w * h0) / w0;
  x = Math.min(x0 + w0 - w, Math.max(x0, x));
  y = Math.min(y0 + h0 - h, Math.max(y0, y));
  S.vb = [x, y, w, h];
}
function svgPoint(cx, cy) {
  const svg = $('#board'); const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}
function zoomBy(factor, at) {
  if (!S.vb) return;
  const [x, y, w, h] = S.vb;
  // Limit the zoom first (between the whole island and 4× in), then place the view. Placing it with the
  // unlimited factor and clamping afterwards made each extra click at the limit slide the map to a corner.
  const w0 = S.vb0[2];
  const f = w / Math.min(w0, Math.max(w0 / 4, w / factor));
  if (Math.abs(f - 1) < 1e-6) return; // already at the limit: nothing moves
  const c = at || { x: x + w / 2, y: y + h / 2 };
  S.vb = [c.x - (c.x - x) / f, c.y - (c.y - y) / f, w / f, h / f];
  clampVB(); applyVB();
}
function bindZoom() {
  const svg = $('#board');
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, svgPoint(e.clientX, e.clientY));
  }, { passive: false });
  const pts = new Map(); let pinch = null; let start = null;
  svg.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    S.dragged = false; start = { x: e.clientX, y: e.clientY };
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    const last = pts.get(e.pointerId);
    if (!last) return;
    const now = { x: e.clientX, y: e.clientY };
    pts.set(e.pointerId, now);
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.d > 0) zoomBy(d / pinch.d, svgPoint((a.x + b.x) / 2, (a.y + b.y) / 2));
      pinch.d = d; S.dragged = true;
      return;
    }
    if (!$('#boardwrap').classList.contains('zoomed')) return;
    if (!S.dragged && Math.hypot(now.x - start.x, now.y - start.y) < 6) return;
    if (!S.dragged) { S.dragged = true; try { svg.setPointerCapture(e.pointerId); } catch {} }
    const scale = svg.getScreenCTM().a;
    S.vb[0] -= (now.x - last.x) / scale; S.vb[1] -= (now.y - last.y) / scale;
    clampVB(); applyVB();
  });
  const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  document.querySelectorAll('[data-zoom]').forEach((b) => {
    b.onclick = () => {
      const z = b.dataset.zoom;
      if (z === 'reset') { S.vb = S.vb0.slice(); applyVB(); } else zoomBy(z === 'in' ? 1.4 : 1 / 1.4);
    };
  });
}

// ---------- dock (hand + actions) ----------
function renderDock(v) {
  const me = v.players.find((p) => p.id === v.me);
  const hand = v.hand || zero();
  const t = v.turn; const mine = isMine(v); const building = isBuilding(v);
  const can = {
    road: building && has(hand, v.cost.road) && me.pieces.road > 0 && v.hints.roads.length > 0,
    village: building && has(hand, v.cost.village) && me.pieces.village > 0 && v.hints.villages.length > 0,
    town: building && has(hand, v.cost.town) && me.pieces.town > 0 && v.hints.towns.length > 0,
    scroll: building && has(hand, v.cost.scroll) && v.deckCount > 0,
  };
  const left = { road: me.pieces.road, village: me.pieces.village, town: me.pieces.town, scroll: v.deckCount };
  const label = { road: 'Road', village: 'Settlement', town: 'City', scroll: 'Dev card' };
  const what = {
    road: 'Road', village: 'Settlement (1 point)', town: 'City — upgrades a settlement (2 points)',
    scroll: 'Development card — draw a random card from the deck',
  };
  const kinds = v.crowns ? ['road', 'village', 'town', 'wall', 'warden'] : ['road', 'village', 'town', 'scroll'];
  if (v.crowns) crDockCan(v, me, hand, building, can, left, label, what);
  const buildBtns = kinds.map((k) => `
    <button class="btn build ${S.mode === k ? 'on' : ''}" data-build="${k}" ${can[k] ? '' : 'disabled'} title="${what[k]} — ${left[k]} left · shortcut ${kinds.indexOf(k) + 1}">
      <span>${BUILD_ICO[k]} ${label[k]}</span><span class="cost">${costHtml(v.crowns && v.crowns.costs[k] ? v.crowns.costs[k] : v.cost[k], hand)}</span></button>`).join('')
    + (v.crowns ? '<button class="btn small" data-act="crref" title="How Crowns & Raiders works, and every edict" aria-label="Crowns and Raiders rules">ℹ️</button>'
      : '<button class="btn small" data-act="cardref" title="What do development cards do?" aria-label="Development card reference">ℹ️</button>');
  let main = '';
  if (v.status === 'playing') {
    if (t.phase === 'order' && (v.stalled || []).includes(v.me)) main += '<button class="btn primary pulse" data-act="roll" title="Shortcut: R">🎲 Roll for turn order</button>';
    if (mine && t.phase === 'preroll') main += '<button class="btn primary pulse" data-act="roll" title="Shortcut: R">🎲 Roll dice</button>';
    if (mine && t.phase === 'main') main += '<button class="btn" data-act="trade" title="Trade with players (shortcut: T)">🤝 Trade</button><button class="btn" data-act="bank" title="Trade with the bank (shortcut: B)">🏦 Bank</button><button class="btn primary" data-act="end" title="Shortcut: E">End turn ➜</button>';
    if (t.phase === 'builder' && t.builder === v.me) main += '<button class="btn primary pulse" data-act="pass" title="Shortcut: E">Done building</button>';
    if (mine && t.phase === 'roadbuilding') main += '<button class="btn" data-act="skipRoads">Skip free roads</button>';
    if (v.crowns) main += crDockExtraButtons(v);
    if (v.map && v.map.canReroll) {
      if (v.hostId === v.me) main += '<button class="btn" data-act="reroll" title="Deal a new island (only before anyone places a piece)">🗺️ New map</button>';
      else if (!v.map.vote) main += '<button class="btn" data-act="mapvote" title="Ask everyone to vote for a new island">🗳️ Ask for a new map</button>';
    }
  } else if (v.status === 'over' && S.hideOver) {
    main += '<button class="btn primary" data-act="results">🏆 Show results</button>';
  }
  const canPlay = v.status === 'playing' && mine && ['preroll', 'main'].includes(t.phase) && !t.devPlayed;
  const groups = {};
  for (const s of v.myScrolls) { const g = groups[s.type] = groups[s.type] || { n: 0, ready: 0 }; g.n++; if (!s.fresh) g.ready++; }
  // your development cards, each with its rules text on the card
  const scrolls = Object.entries(groups).map(([k, g]) => {
    let foot;
    if (k === 'vp') foot = '<span class="dc-note">Counts automatically · never played</span>';
    else if (!g.ready) foot = '<span class="dc-note">New — playable next turn</span>';
    else foot = `<button class="btn small primary" data-play="${k}" ${canPlay ? '' : 'disabled'}
      title="${canPlay ? '' : t.devPlayed ? 'You already played a development card this turn' : 'Play it on your own turn'}">Play</button>`;
    return `<div class="devcard ${k}">
      <div class="dc-head"><span class="dc-ico">${SCROLL_INFO[k].ico}</span><b>${esc(v.scrollNames[k])}</b>${g.n > 1 ? `<span class="dc-n">×${g.n}</span>` : ''}</div>
      <p>${esc(SCROLL_INFO[k].desc)}</p>
      <div class="dc-foot">${foot}</div></div>`;
  }).join('');
  $('#dock').innerHTML = `
    <div class="hand">${handKinds(v).map((r) => `<div class="rcard ${hand[r] ? '' : 'zero'}" style="background-color:${RM[r].card};--deep:${RM[r].deep}" title="${RM[r].name}${v.rates ? ` · trades ${v.rates[r]}:1` : ''}">
      <div class="ico">${RM[r].ico}</div><div class="n">${hand[r]}</div><div class="nm">${RM[r].name}</div></div>`).join('')}</div>
    <div class="actions">${buildBtns}<span class="sep"></span>${main}</div>
    ${v.crowns && !crFloatOn() ? crDockPanel(v, hand) : ''}
    ${scrolls && !crFloatOn() ? `<div class="devcards"><div class="dc-title">Your development cards <span class="hint">· one per turn, not the turn you bought it</span></div><div class="dc-row">${scrolls}</div></div>` : ''}`;
  $('#dock').querySelectorAll('[data-build]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.build;
      if (k === 'scroll') return send({ type: 'buyScroll' });
      S.cr = null;
      S.mode = S.mode === k ? null : k;
      renderStatus(S.v); renderDock(S.v); renderBoardDyn(S.v);
    };
  });
  $('#dock').querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'roll') send({ type: 'roll' });
      else if (a === 'end') { S.mode = null; send({ type: 'endTurn' }); }
      else if (a === 'pass') { S.mode = null; send({ type: 'builderDone' }); }
      else if (a === 'skipRoads') send({ type: 'skipRoads' });
      else if (a === 'trade') openModal('trade');
      else if (a === 'bank') openModal('bank');
      else if (a === 'results') { S.hideOver = false; renderGame(S.v); }
      else if (a === 'cardref') openModal('cardref');
      else if (a === 'crref') openModal('crref');
      else if (a === 'reroll') send({ type: 'rerollMap' });
      else if (a === 'mapvote') send({ type: 'mapVote', value: 1 });
    };
  });
  if (v.crowns) crRenderFloat(v, hand); else devRenderFloat(v, scrolls, Object.values(groups).reduce((n, g) => n + g.n, 0));
  if (v.crowns) crBindDock(v);
  document.querySelectorAll('#dock [data-play], #cr-float [data-play]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.play;
      if (k === 'plenty' || k === 'monopoly') openModal(k);
      else send({ type: 'playScroll', kind: k });
    };
  });
}

// ---------- points ----------
const POINT_COLS = [
  ['settlements', '🏠', 'Settlements'], ['cities', '🏰', 'Cities'], ['route', '🛤️', 'Grand Route'], ['watch', '🛡️', 'Strongest Watch'],
  ['monuments', '🗿', 'Monuments'], ['capitals', '👑', 'Capitals'], ['defender', '⚔️', 'Defender of the Isle'], ['merchant', '💰', 'Merchant'], ['edicts', '📜', 'Point edicts'],
];
const pointsTitle = (p) => (p.points || []).map((x) => `${tr(x.label)}: ${x.count > 1 || x.each > 1 ? `${x.count}×${x.each} = ` : ''}${x.n}`).join(' · ') || tr('No points yet');
// One row per player, one column per kind of point anyone has; each cell shows count × value.
function pointsTable(v, ranked) {
  const rows = ranked || v.players.slice().sort((a, b) => (b.vpTotal ?? b.vp) - (a.vpTotal ?? a.vp));
  const cols = POINT_COLS.filter(([k]) => rows.some((p) => (p.points || []).some((x) => x.key === k)));
  const cell = (p, k) => {
    const x = (p.points || []).find((q) => q.key === k);
    if (!x) return '<td class="hint">—</td>';
    return `<td title="${esc(x.label)}"><b>${x.n}</b>${x.count > 1 || x.each > 1 ? `<span class="hint"> ${x.count}×${x.each}</span>` : ''}</td>`;
  };
  return `<div class="pts-wrap"><table class="stat-table pts"><thead><tr><th>Player</th>${cols.map(([, ico, name]) => `<th title="${name}">${ico}<span class="pts-h"> ${name}</span></th>`).join('')}<th>Total</th></tr></thead>
    <tbody>${rows.map((p) => `<tr class="${p.id === v.winner ? 'win' : ''} ${p.id === v.me ? 'mine' : ''}"><td>${chip(p.color)} ${esc(p.name)}${p.id === v.winner ? ' 🏆' : ''}</td>${cols.map(([k]) => cell(p, k)).join('')}
      <td class="pts-total">${p.vpTotal ?? p.vp}${!v.crowns && (p.vpTotal === null || p.vpTotal === undefined) ? '<span class="hint" title="plus any hidden Monuments">+?</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
function pointsRules(v) {
  const r = ['🏠 Settlement: 1 point', '🏰 City: 2 points', '🛤️ Grand Route: 2 points for the longest road (5 or more), until someone builds a longer one'];
  if (v.crowns) {
    r.push('👑 Capital: 2 points each — the first to level 4 of a city track founds it; the first to level 5 takes it over. Capitals can\'t be sacked',
      '⚔️ Defender of the Isle: 1 point each time you alone have the strongest wardens when the island holds',
      '💰 Merchant: 1 point while the merchant is yours (until someone plays another Merchant)',
      '📜 Point edicts (Printing Press, Charter): 1 point each, counted as soon as they\'re drawn');
  } else {
    r.push('🛡️ Strongest Watch: 2 points for the first to play 3 Guards, until someone plays more', '🗿 Monument card: 1 point, hidden until the end (it counts for you right away)');
  }
  return r.map((x) => `<li>${x}</li>`).join('');
}

// Classic: your development cards in the see-through panel on the left of the board (wide screens), foldable.
const devFolded = () => { try { return localStorage.getItem('hexhaven:devpanel') === 'min'; } catch { return false; } };
function devRenderFloat(v, scrolls, count) {
  const f = $('#cr-float');
  if (!f) return;
  if (!crFloatOn() || !scrolls || v.status !== 'playing') { f.hidden = true; f.innerHTML = ''; return; }
  f.hidden = false;
  const folded = devFolded();
  f.classList.toggle('folded', folded);
  f.innerHTML = `<button class="crf-head" data-devfold aria-expanded="${!folded}" title="${folded ? 'Show' : 'Hide'} your development cards">
      <b>📜 Your cards</b><span class="crf-sum">${count} card${count === 1 ? '' : 's'} · one per turn</span><span class="crf-chev">${folded ? '▸' : '▾'}</span></button>
    ${folded ? '' : `<div class="devcards"><div class="dc-row">${scrolls}</div></div>`}`;
  f.querySelector('[data-devfold]').onclick = () => { try { localStorage.setItem('hexhaven:devpanel', folded ? 'open' : 'min'); } catch {} renderDock(S.v); };
}

// ---------- side panels ----------
function renderPlayers(v) {
  const t = v.turn; const stalled = v.stalled || [];
  const host = v.hostId === v.me;
  $('#players').innerHTML = v.players.map((p) => {
    const turnOf = v.status === 'playing' && t.phase !== 'order' && (t.phase === 'builder' ? t.builder === p.id : t.current === p.id);
    const waiting = v.status === 'playing' && stalled.includes(p.id);
    const canSkip = waiting && p.id !== v.me && (host || !p.connected);
    const vpTxt = p.vpTotal !== null && p.vpTotal !== p.vp ? `${p.vpTotal}<span class="hint" title="includes hidden Monuments"> (${p.vp} shown)</span>` : p.vp;
    return `<div class="pl ${turnOf ? 'cur' : ''} ${p.connected || S.replay ? '' : 'off'}" style="--pc:${PC[p.color]}">
      <div class="pl-top">${chip(p.color)}<span class="pl-name">${esc(p.name)}${p.id === v.me ? ' <span class="hint">(you)</span>' : ''}</span>
        ${p.id === v.hostId ? '<span class="badge">host</span>' : ''}
        ${p.connected || S.replay ? '' : '<span class="badge">offline</span>'}
        <span class="pl-vp" title="${esc(pointsTitle(p))} — click for the breakdown" data-points role="button" tabindex="0">${vpTxt}</span></div>
      <div class="pl-stats">
        <span title="cards in hand">🃏 ${p.cards}</span>${p.cr ? crPlayerStats(v, p) : `<span title="scrolls">📜 ${p.scrolls}</span>
        <span title="guards played">🛡️ ${p.guards}</span>`}<span title="longest road">🛤️ ${p.roadLen}</span>
        ${p.longest ? '<span class="badge award">Grand Route +2</span>' : ''}${p.army ? '<span class="badge award">Strongest Watch +2</span>' : ''}
        ${v.turn.phase === 'order' && v.order.rolls[p.id] !== undefined ? `<span class="badge award">🎲 ${v.order.rolls[p.id]}</span>` : ''}
        ${waiting ? '<span class="badge">⏳ acting</span>' : ''}
        ${canSkip ? '<button class="btn small" data-skip>Skip</button>' : ''}
      </div>
      ${S.replay && p.hand ? `<div class="pl-hand" title="Cards in hand">${handKinds(v).filter((r) => p.hand[r]).map((r) => `<span>${RM[r].ico}<b>${p.hand[r]}</b></span>`).join('') || '<span class="hint">no cards</span>'}</div>` : ''}
      </div>`;
  }).join('');
  const hostP = v.players.find((p) => p.id === v.hostId);
  if (!S.replay && !host && (!hostP || !hostP.connected)) {
    $('#players').insertAdjacentHTML('beforeend', '<button class="btn small" data-claim>Host is offline — become host</button>');
    $('#players [data-claim]').onclick = () => send({ type: 'claimHost' });
  }
  $('#players').querySelectorAll('[data-points]').forEach((x) => { x.onclick = () => openModal('points'); x.onkeydown = (e) => { if (e.key === 'Enter') openModal('points'); }; });
  const sk = $('#players [data-skip]');
  if (sk) sk.onclick = () => { if (confirm('Skip ahead for the player(s) holding up the game? (Random discards / auto-roll / end their turn)')) send({ type: 'skip' }); };
  $('#bankinfo').textContent = v.bank ? `bank: ${handKinds(v).map((r) => RM[r].ico + v.bank[r]).join(' ')}${v.crowns ? '' : ` · 📜${v.deckCount}`}` : '';
}

function renderTrade(v) {
  const sec = $('#trade-sec'); const tr = v.trade;
  if (!tr || v.status !== 'playing') { sec.hidden = true; sec.innerHTML = ''; return; }
  sec.hidden = false;
  const mineOffer = tr.from === v.me;
  const hand = v.hand || zero();
  if (mineOffer) {
    const rows = v.players.filter((p) => p.id !== v.me).map((p) => {
      const r = tr.responses[p.id];
      if (r === 'counter') {
        const c = tr.counters[p.id];
        const ok = has(hand, c.get);
        return `<div class="resp" style="flex-wrap:wrap">${chip(p.color)}<span style="flex:1">${esc(p.name)} <span class="hint">counters</span><br>
          <span class="hint">you give ${resList(c.get)} · you get ${resList(c.give)}</span></span>
          <button class="btn small primary" data-with="${p.id}" ${ok ? '' : 'disabled title="You don\'t have those cards"'}>Accept counter</button></div>`;
      }
      return `<div class="resp">${chip(p.color)}<span style="flex:1">${esc(p.name)}</span>
        ${r === 'accept' ? `<button class="btn small primary" data-with="${p.id}">Trade with ${esc(p.name)}</button>` : `<span class="hint">${r === 'decline' ? 'declined' : 'thinking…'}</span>`}</div>`;
    }).join('');
    sec.innerHTML = `<div class="tradebox"><b>Your offer</b>
      <div>You give: ${resList(tr.give)}<br>You get: ${resList(tr.get)}</div>${rows}
      <div class="row"><button class="btn small" data-cancel>Cancel offer</button></div></div>`;
  } else {
    const r = tr.responses[v.me];
    const able = has(hand, tr.get);
    sec.innerHTML = `<div class="tradebox"><b>${esc(pname(v, tr.from))} wants to trade</b>
      <div>You give: ${resList(tr.get)}<br>You get: ${resList(tr.give)}</div>
      <div class="row">
        <button class="btn small primary" data-resp="1" ${able ? '' : 'disabled'} ${r === 'accept' ? 'style="outline:2px solid var(--good)"' : ''}>${r === 'accept' ? '✓ Accepted' : 'Accept'}</button>
        <button class="btn small" data-resp="0">${r === 'decline' ? '✗ Declined' : 'Decline'}</button>
        <button class="btn small" data-counter>${r === 'counter' ? 'Edit counter' : 'Counter…'}</button>
        ${able ? '' : '<span class="hint">You don\'t have those cards</span>'}
      </div>
      ${r === 'counter' ? `<div class="hint">Your counter: you give ${resList(tr.counters[v.me].give)} · you get ${resList(tr.counters[v.me].get)}</div>` : ''}
      </div>`;
  }
  const ctr = sec.querySelector('[data-counter]');
  if (ctr) ctr.onclick = () => openModal('counter');
  sec.querySelectorAll('[data-with]').forEach((b) => { b.onclick = () => send({ type: 'confirmTrade', with: b.dataset.with }); });
  sec.querySelectorAll('[data-resp]').forEach((b) => { b.onclick = () => send({ type: 'respondTrade', id: tr.id, accept: b.dataset.resp === '1' }); });
  const c = sec.querySelector('[data-cancel]');
  if (c) c.onclick = () => send({ type: 'cancelTrade' });
}

// ---------- a new map: the vote box (top left, under any trade offer) ----------
function renderMapVote(v) {
  const box = $('#map-vote');
  if (!box) return;
  const mv = v.map && v.map.vote;
  if (!mv || S.replay || v.status !== 'playing') { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  const mine = mv.votes[v.me] || 0; const host = v.hostId === v.me;
  const need = Math.floor(mv.n / 2) + 1;
  const names = (x) => Object.entries(mv.votes).filter(([, val]) => val === x).map(([id]) => pname(v, id)).join(', ');
  box.innerHTML = `<div class="tradebox">
    <b>🗳️ ${esc(pname(v, mv.by))} wants a new map</b>
    <div class="hint">${mv.yes} yes · ${mv.no} no · ${need} of ${mv.n} decide${mv.tie ? '' : ' (a tie goes to the host)'}</div>
    ${mv.tie ? `<div class="mv-tie">${host ? 'Tied — you decide:' : 'Tied — the host decides.'}</div>` : ''}
    <div class="row">
      ${mv.tie && host ? '<button class="btn small primary" data-mv="new">🗺️ New map</button><button class="btn small" data-mv="keep">Keep this map</button>'
        : `<button class="btn small ${mine === 1 ? 'on' : ''}" data-mv="1" title="${esc(names(1) || 'No votes yet')}" aria-pressed="${mine === 1}">👍 Yes</button>
           <button class="btn small ${mine === -1 ? 'on' : ''}" data-mv="-1" title="${esc(names(-1) || 'No votes yet')}" aria-pressed="${mine === -1}">👎 No</button>`}
    </div></div>`;
  box.querySelectorAll('[data-mv]').forEach((b) => {
    b.onclick = () => {
      const x = b.dataset.mv;
      if (x === 'new' || x === 'keep') send({ type: 'mapDecide', reroll: x === 'new' });
      else send({ type: 'mapVote', value: mine === Number(x) ? 0 : Number(x) }); // clicking your vote again takes it back
    };
  });
}

// ---------- titles & per-player stats ----------
function statCells(v, pid) {
  const s = (v.stats || {})[pid];
  if (!s) return '<td>—</td><td>—</td><td>—</td>';
  const luck = s.luck === null ? '—' : `<span class="${s.luck >= 115 ? 'up' : s.luck <= 85 ? 'down' : ''}" title="${s.harvested} cards where ${s.expected} were expected">${s.luck}%</span>`;
  return `<td>${luck}</td><td>${s.robbed}</td><td title="${s.blockedRolls} roll${s.blockedRolls === 1 ? '' : 's'}">${s.blocked}</td>`;
}
// End-of-game titles ("behavior tags"), one row per player.
function titlesHtml(v, ranked) {
  if (!v.tags) return '';
  const rows = ranked.filter((p) => (v.tags[p.id] || []).length).map((p) => `<div class="title-row">${chip(p.color)}<b>${esc(p.name)}</b>
    <span class="title-chips">${v.tags[p.id].map((t) => `<span class="title-chip" title="${esc(t.desc)}">${t.ico} ${esc(t.label)}<small>${esc(t.desc)}</small></span>`).join('')}</span></div>`);
  return rows.length ? `<h3 class="titles-head">🏷️ Titles</h3><div class="titles">${rows.join('')}</div>` : '';
}

// ---------- dice statistics ----------
const NUMS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WAYS = (n) => 6 - Math.abs(7 - n); // ways to roll n with two dice, out of 36

function diceStats(v) {
  const hist = v.rollHistory || [];
  const total = hist.length;
  const count = Object.fromEntries(NUMS.map((n) => [n, 0]));
  const lastSeen = {};
  hist.forEach((r, i) => { count[r.n]++; lastSeen[r.n] = i; });
  const expected = Object.fromEntries(NUMS.map((n) => [n, (total * WAYS(n)) / 36]));
  // numbers on tiles where I have a village or town
  const mine = new Set();
  for (const [vid, b] of Object.entries(v.buildings || {})) {
    if (b.owner !== v.me) continue;
    for (const hid of v.board.vertices[vid].hexes) { const h = v.board.hexes[hid]; if (h.num) mine.add(h.num); }
  }
  // hot / cold: biggest surplus and deficit vs. expectation (ignoring 7, which produces nothing)
  const dev = NUMS.filter((n) => n !== 7).map((n) => [n, count[n] - expected[n]]).sort((a, b) => b[1] - a[1]);
  return { hist, total, count, lastSeen, expected, mine, hot: dev[0], cold: dev[dev.length - 1] };
}

function renderStats(v) {
  const st = diceStats(v);
  const max = Math.max(1, ...NUMS.map((n) => Math.max(st.count[n], st.expected[n])));
  $('#stats').innerHTML = NUMS.map((n) => {
    const c = st.count[n]; const e = st.expected[n];
    return `<div class="col" title="${n}: rolled ${c}× · expected ${e.toFixed(1)}">
      <span class="cnt">${c || ''}</span>
      <div class="bar ${n === 7 ? 'seven' : ''} ${st.mine.has(n) ? 'mine' : ''}" style="height:${(c / max) * 100}%"></div>
      ${st.total ? `<div class="exp" style="bottom:${(e / max) * 100}%"></div>` : ''}
    </div>`;
  }).join('');
  $('#stats-l').innerHTML = NUMS.map((n) => `<span class="${st.mine.has(n) ? 'mine' : ''}" title="${st.mine.has(n) ? 'You have a building on this number' : ''}">${n}</span>`).join('');
  const sevens = st.count[7];
  $('#dice-sum').innerHTML = st.total
    ? `${st.total} roll${st.total > 1 ? 's' : ''} · 7s: ${sevens} <span title="expected">(~${st.expected[7].toFixed(1)})</span>`
      + (st.total >= 6 && st.hot[1] >= 1 ? ` · 🔥 ${st.hot[0]}` : '') + (st.total >= 6 && st.cold[1] <= -1 ? ` · 🧊 ${st.cold[0]}` : '')
    : 'No rolls yet';
  $('#recent-rolls').innerHTML = st.hist.slice(-14).reverse().map((r, i) =>
    `<span class="rr ${i === 0 ? 'latest' : ''} ${r.n === 7 ? 'seven' : ''}" style="border-color:${pcolor(v, r.by)}" title="${esc(pname(v, r.by))} rolled ${r.n} (${r.d[0]}+${r.d[1]})">${r.n}</span>`).join('');
}

function diceModal(v) {
  const st = diceStats(v);
  const rows = NUMS.map((n) => {
    const c = st.count[n]; const e = st.expected[n];
    const gap = st.lastSeen[n] === undefined ? null : st.total - 1 - st.lastSeen[n];
    const ago = gap === null ? 'never' : gap === 0 ? 'last roll' : `${gap} roll${gap > 1 ? 's' : ''} ago`;
    const d = c - e;
    return `<tr class="${st.mine.has(n) ? 'mine' : ''}"><td><b>${n}</b>${st.mine.has(n) ? ' <span title="You have a building on this number">★</span>' : ''}</td>
      <td>${c}</td><td>${e.toFixed(1)}</td>
      <td class="${d >= 1 ? 'up' : d <= -1 ? 'down' : ''}">${st.total ? (d > 0 ? '+' : '') + d.toFixed(1) : '—'}</td>
      <td>${st.total ? ((c / st.total) * 100).toFixed(0) + '%' : '—'} <span class="hint">/ ${((WAYS(n) / 36) * 100).toFixed(0)}%</span></td>
      <td class="hint">${ago}</td></tr>`;
  }).join('');
  const people = v.players.map((p) => {
    const mineRolls = st.hist.filter((r) => r.by === p.id);
    const avg = mineRolls.length ? (mineRolls.reduce((s, r) => s + r.n, 0) / mineRolls.length).toFixed(1) : '—';
    return `<tr><td>${chip(p.color)} ${esc(p.name)}</td><td>${mineRolls.length}</td><td>${avg}</td>
      <td>${mineRolls.filter((r) => r.n === 7).length}</td><td><b>${(v.produced || {})[p.id] || 0}</b></td>
      ${statCells(v, p.id)}</tr>`;
  }).join('');
  return `<h2>🎲 Dice statistics</h2>
    <p class="hint" style="margin:0">${st.total} rolls so far. "Expected" is how often each number should come up with fair dice. ★ marks numbers your buildings sit on.</p>
    <table class="stat-table"><thead><tr><th>Roll</th><th>Times</th><th>Expected</th><th>±</th><th>Share / odds</th><th>Last seen</th></tr></thead><tbody>${rows}</tbody></table>
    <h3 style="font-size:16px">By player</h3>
    <table class="stat-table"><thead><tr><th>Player</th><th>Rolls</th><th>Avg</th><th>7s</th><th title="Cards collected from dice rolls">Harvested</th><th title="Cards the dice gave compared with what your tiles should give on average (100% = exactly average)">🍀 Luck</th><th title="Times a card was stolen from you">🥷 Robbed</th><th title="Cards you lost because the bandit sat on your tile when its number was rolled">🚧 Bandit kept</th></tr></thead><tbody>${people}</tbody></table>
    <div class="foot"><button class="btn" data-do="close">Close</button></div>`;
}

// ---------- modals ----------
function openModal(kind) {
  S.modal = kind;
  if (kind === 'trade' || kind === 'bank') { S.ui = { tab: kind === 'bank' ? 'bank' : 'players', give: zero(), get: zero(), bgive: zero(), bget: zero() }; S.modal = kind = 'trade'; }
  if (kind === 'plenty') S.ui = { picks: [] };
  if (kind === 'monopoly') S.ui = { pick: null };
  if (kind === 'counter') {
    // start from the mirror of the current offer
    const tr = S.v.trade;
    S.ui = { give: { ...zero(), ...tr.get }, get: { ...zero(), ...tr.give }, tradeId: tr.id };
  }
  renderModal(S.v);
}
function closeModal() {
  S.modal = null; $('#modal-root').innerHTML = '';
  // after the game, closing e.g. the dice stats goes back to the winner window (no server update will redraw it)
  if (S.v && S.v.status === 'over' && S.screen === 'game' && !S.replay) renderModal(S.v);
}

// limits: most you can pick of each resource (your hand) · cap: most you can pick in total (e.g. cards owed in a discard)
function stepperGrid(prefix, counts, limits, cap) {
  const full = cap !== undefined && cnt(counts) >= cap;
  return `<div class="steppers">${handKinds(S.v).map((r) => `<div class="stepper ${counts[r] ? 'set' : ''}">
    <div class="ico">${RM[r].ico}</div><div class="n">${counts[r]}</div>
    ${limits ? `<div class="have">of ${limits[r]}</div>` : ''}
    <div class="ctl"><button class="btn small" data-step="${prefix}:${r}:-1" ${counts[r] <= 0 ? 'disabled' : ''} aria-label="less ${RM[r].name}">−</button>
    <button class="btn small" data-step="${prefix}:${r}:1" ${(limits && counts[r] >= limits[r]) || full ? 'disabled' : ''} aria-label="more ${RM[r].name}">+</button></div></div>`).join('')}</div>`;
}

// Bank steppers: the give side moves in whole lots at your rate; the want side is limited by
// how many lots you've given and by what the bank still holds.
function bankGrid(v, side) {
  const u = S.ui; const hand = v.hand || zero();
  const lots = ALLC.reduce((s, r) => s + (u.bgive[r] || 0) / v.rates[r], 0);
  const counts = u[side];
  return `<div class="steppers">${handKinds(v).map((r) => {
    const step = side === 'bgive' ? v.rates[r] : 1;
    const other = side === 'bgive' ? u.bget[r] : u.bgive[r];
    const canAdd = side === 'bgive' ? counts[r] + step <= hand[r] && !other
      : cnt(u.bget) < lots && counts[r] < v.bank[r] && !other;
    const sub = side === 'bgive' ? `${v.rates[r]}:1 · have ${hand[r]}` : `bank ${v.bank[r]}`;
    return `<div class="stepper ${other ? 'locked' : ''} ${counts[r] ? 'set' : ''}">
      <div class="ico">${RM[r].ico}</div><div class="n">${counts[r]}</div><div class="have">${sub}</div>
      <div class="ctl"><button class="btn small" data-step="${side}:${r}:-${step}" ${counts[r] <= 0 ? 'disabled' : ''} aria-label="less ${RM[r].name}">−</button>
      <button class="btn small" data-step="${side}:${r}:${step}" ${canAdd ? '' : 'disabled'} aria-label="more ${RM[r].name}">+${step > 1 ? step : ''}</button></div></div>`;
  }).join('')}</div>`;
}

function renderModal(v) {
  const root = $('#modal-root');
  const t = v.turn; const hand = v.hand || zero();
  // forced modals take priority
  let kind = S.modal;
  // after the game, the winner window shows unless the player opened something to look at (dice stats, card reference)
  if (v.status === 'over' && !S.replay && !['dice', 'cardref', 'points', 'crref'].includes(S.modal)) kind = 'over';
  else if (t.phase === 'discard' && v.pendingDiscard[v.me]) { if (S.modal !== 'discard') { S.modal = 'discard'; S.ui = { cards: zero() }; } kind = 'discard'; }
  else if (t.phase === 'steal' && isMine(v)) kind = 'steal';
  else if (v.crowns && v.status === 'playing' && v.crowns.me && v.crowns.me.freePicks > 0) kind = 'freepick';
  else if (v.crowns && v.status === 'playing' && v.crowns.me && v.crowns.me.edictPicks > 0) kind = 'edictpick';
  else if (kind === 'discard' || kind === 'freepick' || kind === 'edictpick') kind = null;
  if (kind && kind.startsWith('cr-') && !crModalValid(v, kind)) kind = null;
  if (kind === 'trade' && !(isMine(v) && t.phase === 'main')) kind = null;
  if (kind === 'counter' && !(v.trade && v.trade.id === S.ui.tradeId && v.trade.from !== v.me)) kind = null;
  if ((kind === 'plenty' || kind === 'monopoly') && !(isMine(v) && ['preroll', 'main'].includes(t.phase) && !t.devPlayed)) kind = null;
  if (!kind) { root.innerHTML = ''; S.modal = null; return; }
  if (S.modal !== kind && !['over', 'steal', 'freepick', 'edictpick'].includes(kind)) S.modal = kind;

  let html = '';
  if (kind === 'discard') {
    const need = v.pendingDiscard[v.me]; const c = S.ui.cards; const n = cnt(c);
    html = `<h2>The bandits strike!</h2><p>You hold more than ${v.handLimit || v.settings.discardLimit} cards${v.crowns && v.handLimit > v.settings.discardLimit ? ` (${v.settings.discardLimit} + 2 for each city wall)` : ''}. Choose <b>${need}</b> to discard.</p>
      ${stepperGrid('cards', c, hand, need)}
      <div class="foot"><span class="hint" style="flex:1">${n === need ? `<b>${n} / ${need}</b> selected — ready` : `${n} / ${need} selected`}</span><button class="btn primary" data-do="discard" ${n === need ? '' : 'disabled'}>Discard</button></div>`;
  } else if (kind === 'cardref') {
    html = `<h2>📜 Development cards</h2>
      <p class="hint" style="margin:0">Cost 🐑🌾🪨. You draw a random card. You may play one per turn, before or after rolling, but not on the turn you bought it.</p>
      <div class="dc-row">${Object.keys(SCROLL_INFO).map((k) => `<div class="devcard ${k}">
        <div class="dc-head"><span class="dc-ico">${SCROLL_INFO[k].ico}</span><b>${esc(v.scrollNames[k])}</b></div>
        <p>${esc(SCROLL_INFO[k].desc)}</p></div>`).join('')}</div>
      <div class="foot"><button class="btn" data-do="close">Close</button></div>`;
  } else if (kind === 'steal') {
    html = `<h2>🥷 Pick a card to steal</h2>
      <p class="hint" style="margin:0">Cards are face down and shuffled. Choose one from ${t.victims.length > 1 ? 'any player next to the bandit' : 'their hand'}.</p>
      ${t.victims.map((id) => {
        const p = v.players.find((x) => x.id === id);
        const n = Math.min(p.cards, 30);
        return `<div class="victim"><div class="victim-name">${chip(p.color)} <b>${esc(p.name)}</b> <span class="hint">${p.cards} card${p.cards === 1 ? '' : 's'}</span></div>
          <div class="fan" style="--n:${n}">${Array.from({ length: n }, (_, i) =>
            `<button class="facedown" data-steal="${id}:${i}" style="--i:${i};--c:${PC[p.color]}" aria-label="Steal card ${i + 1} from ${esc(p.name)}"></button>`).join('')}</div></div>`;
      }).join('')}`;
  } else if (kind === 'plenty') {
    const picks = S.ui.picks;
    html = `<h2>${SCROLL_INFO.plenty.ico} Bounty</h2><p>Take any 2 resources from the bank. Picked: ${picks.map((r) => RM[r].ico).join(' ') || '—'}</p>
      <div class="respick">${RES.map((r) => `<button class="btn" data-pick="${r}" ${picks.length >= 2 || v.bank[r] <= picks.filter((x) => x === r).length ? 'disabled' : ''}><span class="ico">${RM[r].ico}</span>${RM[r].name}<span class="hint">bank ${v.bank[r]}</span></button>`).join('')}</div>
      <div class="foot"><button class="btn" data-do="reset">Reset</button><button class="btn" data-do="close">Cancel</button><button class="btn primary" data-do="plenty" ${picks.length === 2 ? '' : 'disabled'}>Take them</button></div>`;
  } else if (kind === 'monopoly') {
    html = `<h2>${SCROLL_INFO.monopoly.ico} Embargo</h2><p>Name a resource. Every other player hands you all of theirs.</p>
      <div class="respick">${RES.map((r) => `<button class="btn ${S.ui.pick === r ? 'on' : ''}" data-mono="${r}"><span class="ico">${RM[r].ico}</span>${RM[r].name}</button>`).join('')}</div>
      <div class="foot"><button class="btn" data-do="close">Cancel</button><button class="btn primary" data-do="monopoly" ${S.ui.pick ? '' : 'disabled'}>Seize it</button></div>`;
  } else if (kind === 'trade') {
    const u = S.ui;
    const tabs = `<div class="tabs" role="tablist">
      <button class="tab ${u.tab === 'players' ? 'on' : ''}" data-tab="players" role="tab" aria-selected="${u.tab === 'players'}">🤝 Players</button>
      <button class="tab ${u.tab === 'bank' ? 'on' : ''}" data-tab="bank" role="tab" aria-selected="${u.tab === 'bank'}">🏦 Bank</button></div>`;
    let body;
    if (u.tab === 'players') {
      const gN = cnt(u.give), rN = cnt(u.get);
      const clash = ALLC.some((r) => u.give[r] && u.get[r]);
      body = `<p class="hint" style="margin:0">Everyone sees your offer and can accept or counter; you choose who to trade with.</p>
        <b>You give</b>${stepperGrid('give', u.give, hand)}
        <b>You want</b>${stepperGrid('get', u.get, null)}
        <div class="foot">${clash ? '<span class="hint" style="flex:1">Same resource on both sides</span>' : ''}
          <button class="btn primary" data-do="propose" ${gN && rN && !clash ? '' : 'disabled'}>Offer to everyone</button></div>`;
    } else {
      // every lot you give (4, or 3/2 at a harbor) buys one card of your choice
      const lots = ALLC.reduce((s, r) => s + (u.bgive[r] || 0) / v.rates[r], 0);
      const picked = cnt(u.bget);
      const ok = lots > 0 && picked === lots;
      const status = !lots ? 'Add what you give — each + adds one full lot at your rate.'
        : picked < lots ? `You can take <b>${lots - picked}</b> more card${lots - picked === 1 ? '' : 's'}.`
        : picked > lots ? `Too many — remove ${picked - lots}.` : 'Ready.';
      body = `<p class="hint" style="margin:0">Your rates: ${handKinds(v).map((r) => `${RM[r].ico} <b>${v.rates[r]}:1</b>${v.rates[r] < 4 ? '<span title="harbor rate"> ⚓</span>' : ''}`).join(' · ')}${
        RES.some((r) => v.rates[r] < 4) || v.crowns ? '' : ' — build on a harbor ⚓ for better rates'}</p>
        <b>You give</b>${bankGrid(v, 'bgive')}
        <b>You want</b>${bankGrid(v, 'bget')}
        <div class="foot"><span class="hint" style="flex:1">${status}</span>
          <button class="btn primary" data-do="bank" ${ok ? '' : 'disabled'}>${ok ? `Trade with the bank: ${ALLC.filter((r) => u.bgive[r]).map((r) => RM[r].ico + '×' + u.bgive[r]).join(' ')} → ${ALLC.filter((r) => u.bget[r]).map((r) => RM[r].ico + '×' + u.bget[r]).join(' ')}` : 'Trade with the bank'}</button></div>`;
    }
    html = `<h2>Trade</h2>${tabs}${body}<div class="foot"><button class="btn" data-do="close">Close</button></div>`;
  } else if (kind === 'dice') {
    html = diceModal(v);
  } else if (kind === 'points') {
    html = `<h2>🏆 How the points add up</h2>
      <p class="hint" style="margin:0">First to <b>${v.settings.vpTarget}</b> points wins, on their own turn.${v.status === 'over' || v.crowns ? '' : ' Other players\' hidden Monuments only show at the end.'}</p>
      ${pointsTable(v)}
      <h3 style="font-size:16px">What scores</h3><ul class="pts-rules">${pointsRules(v)}</ul>
      <div class="foot"><button class="btn" data-do="close">Close</button></div>`;
  } else if (kind === 'crref' || kind === 'freepick' || kind === 'edictpick' || kind.startsWith('cr-')) {
    html = crModalHtml(v, kind);
  } else if (kind === 'counter') {
    const u = S.ui; const gN = cnt(u.give), rN = cnt(u.get);
    const clash = ALLC.some((r) => u.give[r] && u.get[r]);
    html = `<h2>Counter-offer to ${esc(pname(v, v.trade.from))}</h2>
      <p class="hint" style="margin:0">They see your terms and can accept them instead of their original offer.</p>
      <b>You give</b>${stepperGrid('give', u.give, hand)}
      <b>You want</b>${stepperGrid('get', u.get, null)}
      <div class="foot">${clash ? '<span class="hint" style="flex:1">Same resource on both sides</span>' : ''}
        <button class="btn" data-do="close">Cancel</button>
        <button class="btn primary" data-do="counter" ${gN && rN && !clash ? '' : 'disabled'}>Send counter</button></div>`;
  } else if (kind === 'over') {
    const ranked = v.players.slice().sort((a, b) => (b.vpTotal || 0) - (a.vpTotal || 0));
    html = `<h2>🏆 ${esc(pname(v, v.winner))} wins!</h2>
      ${pointsTable(v, ranked)}
      ${titlesHtml(v, ranked)}
      <div class="foot" style="justify-content:flex-start">
        <button class="btn" data-do="replay">▶ Watch replay</button>
        <button class="btn" data-do="dicestats">🎲 Dice stats</button>
        <button class="btn" data-do="download">💾 Download game</button></div>
      <div class="foot">${v.hostId === v.me ? '<button class="btn primary" data-do="rematch">Back to lobby for a rematch</button>' : '<span class="hint">The host can start a rematch.</span>'}
        <button class="btn" data-do="hide">View board</button></div>`;
    if (S.hideOver) { root.innerHTML = ''; return; }
  }
  // Same dialog still open (e.g. clicking + while discarding): swap only its contents so the window
  // doesn't replay its entrance animation (or lose its scroll position) on every click.
  const open = root.querySelector('.modal');
  if (open && root.dataset.kind === kind) open.innerHTML = html;
  else {
    root.innerHTML = `<div class="backdrop" data-backdrop><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    root.dataset.kind = kind;
  }

  root.querySelectorAll('[data-step]').forEach((b) => {
    b.onclick = () => {
      const [k, r, d] = b.dataset.step.split(':');
      const obj = k === 'cards' ? S.ui.cards : S.ui[k];
      // discarding: never pick more than you owe or more than you hold
      if (k === 'cards' && Number(d) > 0 && (cnt(obj) >= (S.v.pendingDiscard[S.v.me] || 0) || obj[r] >= (S.v.hand || {})[r])) return;
      obj[r] = Math.max(0, obj[r] + Number(d));
      renderModal(S.v);
    };
  });
  root.querySelectorAll('[data-steal]').forEach((b) => {
    b.onclick = () => {
      const [victim, card] = b.dataset.steal.split(':');
      b.classList.add('picked');
      root.querySelectorAll('[data-steal]').forEach((x) => { x.disabled = true; });
      setTimeout(() => send({ type: 'steal', victim, card: Number(card) }), 250);
    };
  });
  if (v.crowns || kind === 'crref') crBindModal(v, root, kind);
  root.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => { S.ui.picks.push(b.dataset.pick); renderModal(S.v); }; });
  root.querySelectorAll('[data-mono]').forEach((b) => { b.onclick = () => { S.ui.pick = b.dataset.mono; renderModal(S.v); }; });
  root.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { S.ui.tab = b.dataset.tab; renderModal(S.v); }; });
  root.querySelectorAll('[data-do]').forEach((b) => {
    b.onclick = async () => {
      const d = b.dataset.do;
      if (d === 'close') return closeModal();
      if (d === 'hide') { S.hideOver = true; renderGame(S.v); return; }
      if (d === 'reset') { S.ui.picks = []; return renderModal(S.v); }
      if (d === 'discard') { if (await send({ type: 'discard', cards: S.ui.cards })) S.modal = null; }
      if (d === 'plenty') { if (await send({ type: 'playScroll', kind: 'plenty', res: S.ui.picks[0], res2: S.ui.picks[1] })) closeModal(); }
      if (d === 'monopoly') { if (await send({ type: 'playScroll', kind: 'monopoly', res: S.ui.pick })) closeModal(); }
      if (d === 'propose') { if (await send({ type: 'proposeTrade', give: S.ui.give, get: S.ui.get })) closeModal(); }
      if (d === 'counter') { if (await send({ type: 'respondTrade', id: S.ui.tradeId, counter: { give: S.ui.give, get: S.ui.get } })) closeModal(); }
      if (d === 'bank') { if (await send({ type: 'bankTrade', give: S.ui.bgive, get: S.ui.bget })) { S.ui.bgive = zero(); S.ui.bget = zero(); toast('Traded with the bank'); renderModal(S.v); } }
      if (d === 'replay') { closeModal(); replayThisGame(); return; }
      if (d === 'download') { downloadSave(); return; }
      if (d === 'dicestats') { openModal('dice'); return; }
      if (d === 'rematch') { closeModal(); send({ type: 'rematch' }); }
    };
  });
  const bd = root.querySelector('[data-backdrop]');
  bd.onclick = (e) => { if (e.target === bd && (['trade', 'plenty', 'monopoly', 'counter', 'dice', 'cardref', 'crref', 'points'].includes(kind) || kind.startsWith('cr-'))) closeModal(); };
}

// Turn timer: a countdown pill in the top bar ("0:42 · Marlo") plus a bar draining across the top of
// the board in the color of whoever the clock is running for. Both go red in the last 10 seconds.
setInterval(() => {
  const el = $('#timer'); const bar = $('#timerbar');
  if (!el || !bar) return;
  const v = S.v;
  if (!S.deadline || !v || v.status !== 'playing') { el.hidden = true; bar.hidden = true; return; }
  const ms = Math.max(0, S.deadline - Date.now());
  const left = Math.ceil(ms / 1000);
  const waiting = v.stalled || [];
  const mine = waiting.includes(v.me);
  const who = mine ? 'your time' : waiting.length === 1 ? esc(pname(v, waiting[0])) : `${waiting.length} players`;
  const low = left <= 10;
  el.hidden = false; bar.hidden = false;
  el.innerHTML = `<span class="t">⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span><span class="who">${who}</span>`;
  el.classList.toggle('mine', mine);
  el.classList.toggle('low', low);
  bar.classList.toggle('low', low);
  const pct = S.deadlineTotal ? Math.min(100, (ms / S.deadlineTotal) * 100) : 100;
  bar.firstElementChild.style.width = `${pct}%`;
  bar.style.setProperty('--c', mine ? 'var(--accent)' : waiting.length === 1 ? pcolor(v, waiting[0]) : '#c9b48e');
}, 200);

// Shortcuts: R roll · E end turn / done building · T trade · B bank · 1–4 road/settlement/city/dev card · Esc cancel
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (['trade', 'plenty', 'monopoly', 'counter', 'dice', 'cardref', 'crref', 'points'].includes(S.modal) || (S.modal && S.modal.startsWith('cr-'))) closeModal();
    else if (S.mode) { S.mode = null; S.cr = null; if (S.v) { renderStatus(S.v); renderDock(S.v); renderBoardDyn(S.v); } }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || S.modal) return;
  // replay: ← → step, Space play/pause, Home / End jump
  if (S.replay) {
    const R = S.replay;
    const keys = { ArrowLeft: () => { replayPlay(false); replayTo(R.n - 1, true); }, ArrowRight: () => { replayPlay(false); replayTo(R.n + 1); },
      ' ': () => replayPlay(!R.playing), Home: () => { replayPlay(false); replayTo(0, true); }, End: () => { replayPlay(false); replayTo(R.rp.length, true); } };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); return; }
  }
  const crowns = S.v && S.v.crowns;
  const key = { r: 'roll', e: 'end', t: 'trade', b: 'bank', 1: 'b-road', 2: 'b-village', 3: 'b-town', 4: crowns ? 'b-wall' : 'b-scroll', ...(crowns ? { 5: 'b-warden' } : {}) }[e.key.toLowerCase()];
  if (S.screen === 'game' && ['+', '=', '-', '_', '0'].includes(e.key)) {
    e.preventDefault();
    if (e.key === '0') { S.vb = S.vb0.slice(); applyVB(); } else zoomBy(e.key === '-' || e.key === '_' ? 1 / 1.4 : 1.4);
    return;
  }
  if (!key || S.screen !== 'game') return;
  const btn = key.startsWith('b-') ? $(`[data-build="${key.slice(2)}"]`)
    : key === 'end' ? ($('[data-act="end"]') || $('[data-act="pass"]')) : $(`[data-act="${key}"]`);
  if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
});

// ---------- saves & replays ----------
// The replay viewer runs the real rules engine in the browser: game.js, notation.js and save.js are served
// from /lib and loaded with a tiny CommonJS shim (crypto is replaced by the browser's own).
async function loadEngine() {
  if (S.engine) return S.engine;
  const v = encodeURIComponent((S.build && S.build.commit) || '');
  const files = ['notation', 'crowns', 'stats', 'game', 'save'];
  const srcs = await Promise.all(files.map((f) => fetch(`/lib/${f}.js?v=${v}`).then((r) => {
    if (!r.ok) throw new Error('Could not load the replay engine');
    return r.text();
  })));
  const bytes = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; };
  const cryptoShim = {
    randomInt: (a, b) => { const [lo, hi] = b === undefined ? [0, a] : [a, b]; return lo + Math.floor(Math.random() * (hi - lo)); },
    randomBytes: (n) => {
      const b = bytes(n);
      return { toString: () => [...b].map((x) => x.toString(16).padStart(2, '0')).join(''), readUInt32LE: (o = 0) => new DataView(b.buffer).getUint32(o, true) };
    },
  };
  const mods = {};
  const req = (name) => (name === 'crypto' ? cryptoShim : mods[name.replace('./', '')]);
  files.forEach((f, i) => {
    const module = { exports: {} };
    new Function('module', 'exports', 'require', srcs[i])(module, module.exports, req); // eslint-disable-line no-new-func
    mods[f] = module.exports;
  });
  return (S.engine = mods);
}

// Fetch the current game's save file (host any time, everyone once it's over).
async function fetchSave() {
  const r = await fetch(`/api/save?code=${encodeURIComponent(S.code)}&token=${encodeURIComponent(S.token)}`);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not save the game');
  const name = (/filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '') || [])[1] || `hexhaven-${S.code}.json`;
  return { name, text: await r.text() };
}
async function downloadSave() {
  try {
    const { name, text } = await fetchSave();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast(`💾 Saved ${name}`);
  } catch (e) { toast(e.message, true); }
}
const canSave = (v) => v && v.board && (v.status === 'over' || v.hostId === v.me);

// A short description of a save file for the load card.
function saveSummary(file) {
  const status = file.status === 'over' || file.winner ? `finished — ${esc((file.players.find((p) => p.seat === file.winner) || {}).name || '?')} won` : 'in progress';
  const when = file.saved ? new Date(file.saved).toLocaleString() : '';
  return `<div class="loadsum">
    <div><b>Turn ${Number(file.turn && file.turn.number) || 0}</b> · ${file.players.length} players · ${status}${when ? ` · <span class="hint">saved ${esc(when)}</span>` : ''}</div>
    <div class="loadsum-players">${file.players.map((p) => `<span style="--pc:${PC[p.color] || '#999'}">${chip(p.color)}${esc(p.name)} <span class="hint">seat ${p.seat}</span></span>`).join('')}</div>
  </div>`;
}

// Home page: pick a save file, then watch it or continue it.
function bindLoadCard() {
  const input = $('#load-file');
  if (!input) return;
  input.onchange = async () => {
    const f = input.files[0];
    if (!f) return;
    let file;
    try { file = JSON.parse(await f.text()); } catch { return toast('That file is not valid JSON', true); }
    if (!file || !file.hexhaven || !Array.isArray(file.players)) return toast('That file is not a Hexhaven save', true);
    showLoadedFile(file);
  };
}
function showLoadedFile(file) {
  const box = $('#load-info');
  const hasHistory = file.history && Array.isArray(file.history.moves) && file.history.start;
  box.innerHTML = `${saveSummary(file)}
    <div class="loadsum-actions">
      <button class="btn" id="ld-replay" ${hasHistory ? '' : 'disabled title="This save has no history"'}>▶ Watch replay</button>
      <button class="btn primary" id="ld-continue">Continue this game…</button>
    </div>
    <div id="ld-seats"></div>`;
  $('#ld-replay').onclick = () => openReplay(file, { from: 'home' });
  $('#ld-continue').onclick = () => {
    $('#ld-seats').innerHTML = `<div class="hint" style="margin:8px 0 6px">Which seat are you? You'll be the host; friends join with the new room code and click their seat.</div>
      <div class="seatpick">${file.players.map((p) => `<button class="btn" data-ldseat="${p.seat}" style="--pc:${PC[p.color] || '#999'}">${chip(p.color)} ${esc(p.name)}</button>`).join('')}</div>`;
    document.querySelectorAll('[data-ldseat]').forEach((b) => { b.onclick = () => continueSave(file, Number(b.dataset.ldseat)); });
  };
}
async function continueSave(file, seat) {
  try {
    const r = await api('/api/load', { seat, save: file });
    const me = file.players.find((p) => p.seat === seat);
    leaveReplayState();
    enterRoom(r.code, r.token, r.pid, me ? me.name : 'Host');
    (r.notes || []).forEach((n) => toast(n));
  } catch (e) { toast(e.message, true); }
}

// Join screen: for a game already in progress, offer its seats (click yours) instead of a name field.
async function offerSeats(code) {
  let info;
  try { info = await api(`/api/room?code=${encodeURIComponent(code)}`); } catch { return false; }
  if (info.status === 'lobby') return false;
  const busy = info.players.some((p) => p.connected);
  $('#join-seats').innerHTML = `<div class="hint" style="margin:6px 0">This game is already running — pick your seat:</div>
    <div class="seatpick">${info.players.map((p) => `<button type="button" class="btn" data-joinseat="${esc(p.name)}" style="--pc:${PC[p.color] || '#999'}" ${p.connected ? 'disabled title="This seat is online on another device"' : ''}>${chip(p.color)} ${esc(p.name)}${p.connected ? ' <span class="hint">· online</span>' : ''}</button>`).join('')}</div>
    ${busy ? '<div class="hint" style="margin-top:6px">A seat marked online is still open on another device. Close the game there, or wait about a minute after that device locked or went offline — then refresh this page.</div>' : ''}`;
  document.querySelectorAll('[data-joinseat]').forEach((b) => {
    b.onclick = async () => {
      try { const r = await api('/api/join', { code, name: b.dataset.joinseat }); enterRoom(r.code, r.token, r.pid, b.dataset.joinseat); }
      catch (e) { toast(e.message, true); }
    };
  });
  return true;
}

// ---------- replay viewer ----------
const MOVE_TEXT = {
  roll: 'rolled the dice', discard: 'discarded', moveBandit: 'moved the bandit', steal: 'stole a card', buildVillage: 'built a settlement',
  buildTown: 'built a city', buildRoad: 'built a road', skipRoads: 'skipped free roads', buyScroll: 'bought a development card',
  playScroll: 'played a development card', bankTrade: 'traded with the bank', proposeTrade: 'offered a trade', respondTrade: 'answered a trade',
  confirmTrade: 'completed a trade', cancelTrade: 'withdrew a trade', endTurn: 'ended their turn', builderDone: 'finished building', skip: 'skipped a stalled player',
  buildWall: 'built a city wall', buildWarden: 'raised a warden', activateWarden: 'activated a warden', promoteWarden: 'promoted a warden',
  wardenMove: 'moved a warden', wardenDisplace: 'pushed a warden away', wardenChase: 'chased the bandit', improve: 'improved a city track',
  raidLose: 'lost a city to the raiders', takeFree: 'took a free resource', drawEdict: 'drew an edict', playEdict: 'played an edict',
  rerollMap: 'rerolled the map', mapVote: 'voted on the map', mapDecide: 'decided the map vote',
};

async function openReplay(file, opts = {}) {
  let engine;
  try { engine = await loadEngine(); } catch (e) { return toast(e.message, true); }
  let rp;
  try { rp = engine.save.replayer(file); } catch (e) { return toast(e.message, true); }
  if (S.es) { S.es.close(); S.es = null; }
  stopReplay();
  S.replay = { file, rp, n: 0, playing: false, speed: 900, timer: null, from: opts.from || 'home', game: null };
  S.screen = null; S.boardKey = null; S.prev = null; S.hideOver = true;
  history.replaceState(null, '', '/?replay');
  replayTo(opts.at === 'end' ? rp.length : 0, true);
}

function stopReplay() {
  if (S.replay && S.replay.timer) clearInterval(S.replay.timer);
  if (S.replay) S.replay.timer = null;
}

// Build what the screen shows from a replayed game: a spectator's view, plus everyone's hand and score.
function replayView(game) {
  const G2 = S.engine.game;
  const v = G2.viewFor(game, '__replay');
  v.me = '__replay';
  for (const p of v.players) {
    const real = game.players.find((x) => x.id === p.id);
    p.hand = real.hand;
    const own = G2.viewFor(game, p.id).players.find((x) => x.id === p.id);
    p.vpTotal = own.vpTotal; p.points = own.points;
  }
  v.stalled = [];
  v.deadlineIn = null;
  return v;
}

function replayTo(n, jump) {
  const R = S.replay;
  if (!R) return;
  const target = Math.max(0, Math.min(R.rp.length, n));
  const res = R.rp.stateAt(target);
  R.n = res.reached; R.game = res.game; R.error = res.error;
  if (jump || Math.abs(target - (R.shown || 0)) > 1) S.prev = null; // no dice/turn effects when jumping around
  R.shown = R.n;
  S.v = replayView(R.game);
  render();
  if (R.error) { stopReplay(); R.playing = false; toast(`The history stops making sense at move ${R.error.at + 1} ("${R.error.line}")`, true); }
}

function replayPlay(on) {
  const R = S.replay;
  if (!R) return;
  R.playing = on && R.n < R.rp.length;
  stopReplay();
  if (R.playing) {
    R.timer = setInterval(() => {
      if (!S.replay || S.replay.n >= S.replay.rp.length) { replayPlay(false); renderReplayBar(S.v); return; }
      replayTo(S.replay.n + 1);
    }, R.speed);
  }
  renderReplayBar(S.v);
}

function describeReplayMove(R) {
  if (R.n === 0) return 'Start of the game';
  const line = R.rp.moves[R.n - 1];
  const tok = line.split(' ');
  if (tok[0] === '-') return tok[1] === 'timeout' ? '⏱️ The turn timer ran out' : '🎲 New dice seed (a save was downloaded)';
  const p = R.game.players.find((x) => x.seat === Number(tok[0]));
  return `${p ? chip(p.color) + ' <b>' + esc(p.name) + '</b>' : 'Seat ' + esc(tok[0])} ${esc(MOVE_TEXT[tok[1]] || tok[1])}`;
}

function renderReplayBar(v) {
  const R = S.replay;
  const dock = $('#dock');
  if (!R || !dock) return;
  const len = R.rp.length;
  dock.innerHTML = `<div class="replaybar">
    <div class="rp-row">
      <span class="rp-badge">▶ Replay</span>
      <div class="rp-controls">
        <button class="btn" data-rp="start" title="Start (Home)" aria-label="Go to start">⏮</button>
        <button class="btn" data-rp="back" title="Previous move (←)" aria-label="Previous move">◀</button>
        <button class="btn primary rp-play" data-rp="play" title="Play / pause (Space)">${R.playing ? '⏸ Pause' : '▶ Play'}</button>
        <button class="btn" data-rp="fwd" title="Next move (→)" aria-label="Next move">▶</button>
        <button class="btn" data-rp="end" title="End (End)" aria-label="Go to end">⏭</button>
      </div>
      <label class="rp-speed">Speed <select data-rp="speed">${[[1800, '½×'], [900, '1×'], [450, '2×'], [200, '4×']].map(([ms, l]) => `<option value="${ms}" ${R.speed === ms ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <input class="rp-slider" type="range" min="0" max="${len}" value="${R.n}" aria-label="Move ${R.n} of ${len}">
    <div class="rp-row">
      <div class="rp-info"><span class="rp-count">Move ${R.n} / ${len} · Turn ${v.turn.number}</span> <span>${describeReplayMove(R)}</span></div>
      <div class="rp-actions">
        <button class="btn" data-rp="from-here" title="Start a new game from this exact moment">Play from here…</button>
        <button class="btn" data-rp="download" title="Save this replay to your device">💾</button>
        <button class="btn" data-rp="exit">Exit replay</button>
      </div>
    </div>
    <div id="rp-seats"></div>
  </div>`;
  dock.querySelectorAll('[data-rp]').forEach((el) => {
    const k = el.dataset.rp;
    if (k === 'speed') { el.onchange = () => { R.speed = Number(el.value); if (R.playing) replayPlay(true); }; return; }
    el.onclick = () => {
      if (k === 'start') { replayPlay(false); replayTo(0, true); }
      else if (k === 'back') { replayPlay(false); replayTo(R.n - 1, true); }
      else if (k === 'fwd') { replayPlay(false); replayTo(R.n + 1); }
      else if (k === 'end') { replayPlay(false); replayTo(len, true); }
      else if (k === 'play') replayPlay(!R.playing);
      else if (k === 'exit') exitReplay();
      else if (k === 'download') downloadReplayFile();
      else if (k === 'from-here') pickSeatFromHere();
    };
  });
  const slider = dock.querySelector('.rp-slider');
  slider.oninput = () => { replayPlay(false); replayTo(Number(slider.value), true); };
}

// "Play from here": a save of this exact moment whose history runs up to it, loaded as a new room.
function fileAtMove() {
  const R = S.replay; const eng = S.engine.save;
  const snap = eng.exportSave(R.game);
  return { ...snap, room: R.file.room, history: { seed: R.file.history.seed, start: R.file.history.start, moves: R.rp.moves.slice(0, R.n) } };
}
function pickSeatFromHere() {
  const R = S.replay;
  const file = fileAtMove();
  $('#rp-seats').innerHTML = `<div class="hint" style="margin:8px 0 6px">Start a new room from move ${R.n}. Which seat are you? Friends join with the new code and click their seat.</div>
    <div class="seatpick">${file.players.map((p) => `<button class="btn" data-rpseat="${p.seat}" style="--pc:${PC[p.color] || '#999'}">${chip(p.color)} ${esc(p.name)}</button>`).join('')}</div>`;
  document.querySelectorAll('[data-rpseat]').forEach((b) => { b.onclick = () => continueSave(file, Number(b.dataset.rpseat)); });
}
function downloadReplayFile() {
  const R = S.replay;
  const text = S.engine.save.stringifySave(R.file);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = `hexhaven-${R.file.room || 'replay'}-replay.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
// Leave replay mode completely (playback, read-only actions, replay controls) so a live game can take over.
function leaveReplayState() {
  stopReplay();
  S.replay = null; S.v = null; S.screen = null; S.boardKey = null; S.prev = null; S.hideOver = false;
}
function exitReplay() {
  const from = S.replay && S.replay.from;
  leaveReplayState();
  if (from === 'game' && S.code && S.token) { history.replaceState(null, '', '?room=' + S.code); connect(); }
  else { history.replaceState(null, '', '/'); renderHome(); }
}
// From the end-of-game window: fetch this game's save and watch it.
async function replayThisGame() {
  try {
    const { text } = await fetchSave();
    await openReplay(JSON.parse(text), { from: 'game', at: 'end' });
  } catch (e) { toast(e.message, true); }
}

boot();
