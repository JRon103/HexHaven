'use strict';
/* Hexhaven client: renders the per-player view streamed by the server and posts actions back. */

const RES = ['wood', 'clay', 'fleece', 'wheat', 'iron'];
const RM = {
  wood:   { name: 'Wood',   ico: '🌲', color: '#4f8a4f', card: '#a9d39a', deep: '#2e5e30' },
  clay:   { name: 'Clay',   ico: '🧱', color: '#c46a3c', card: '#eab394', deep: '#8a3f1e' },
  fleece: { name: 'Fleece', ico: '🐑', color: '#a7cf6c', card: '#d8ecb8', deep: '#5c8a2c' },
  wheat:  { name: 'Wheat',  ico: '🌾', color: '#e2bc45', card: '#f4e0a0', deep: '#94700f' },
  iron:   { name: 'Iron',   ico: '⛏️', color: '#8b939f', card: '#cfd4db', deep: '#4b535e' },
  desert: { name: 'Dunes',  ico: '🏜️', color: '#dcc697', deep: '#97804d' },
};
const PC = {
  red: '#d6453d', blue: '#2f6bd6', ivory: '#f3ecd9', orange: '#ec8a1c',
  green: '#2c9a55', brown: '#8b5a2b', purple: '#8e4ec6', teal: '#17a8a8',
};
const SCROLL_INFO = {
  guard: { ico: '🛡️', desc: 'Move the bandit and steal a card. 3+ guards earns the Strongest Watch (+2 VP).' },
  route: { ico: '🛤️', desc: 'Build 2 roads for free.' },
  plenty: { ico: '🎁', desc: 'Take any 2 resources from the bank.' },
  monopoly: { ico: '⚖️', desc: 'Name a resource — every other player gives you all of theirs.' },
  vp: { ico: '🗿', desc: '+1 victory point (kept hidden until the end).' },
};
const BUILD_ICO = { road: '🛤️', village: '🏠', town: '🏰', scroll: '📜' };
const U = 56; // board units -> px

const S = {
  code: null, token: null, pid: null, v: null, mode: null, es: null,
  modal: null, ui: {}, boardKey: null, lastLog: 0, screen: null,
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cnt = (h) => RES.reduce((s, r) => s + (h[r] || 0), 0);
const has = (h, c) => RES.every((r) => (h[r] || 0) >= (c[r] || 0));
const zero = () => ({ wood: 0, clay: 0, fleece: 0, wheat: 0, iron: 0 });
const costStr = (c) => RES.filter((r) => c[r]).map((r) => RM[r].ico.repeat(c[r])).join('');
const resList = (c) => RES.filter((r) => c[r]).map((r) => `${c[r]} ${RM[r].ico} ${RM[r].name}`).join(', ');

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
  es.onmessage = (ev) => { S.v = JSON.parse(ev.data); setConn(true); render(); };
  es.onerror = async () => {
    setConn(false);
    try { await api(`/api/session?code=${S.code}&token=${S.token}`); }
    catch (e) {
      if (/not found/i.test(e.message)) { es.close(); forget(S.code); S.v = null; toast('That game no longer exists', true); renderHome(); }
    }
  };
}
function setConn(ok) { const el = $('#conn'); if (el) el.textContent = ok ? '' : 'Reconnecting…'; }

// ---------- boot ----------
async function boot() {
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
      <h1>Hexhaven</h1>
      <p>Settle a hex island, trade with your friends, race to ${10} points. 2–8 players.</p>
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
        <div class="hint">Lost your seat (new device, cleared browser)? Join with the exact same name to take it back.</div>
      </form>
    </div>
    ${recent.length ? `<div class="card rules"><h3>Your recent rooms</h3><div class="invite">${recent.map(([c, s]) => `<button class="btn small" data-recent="${esc(c)}">${esc(c)} · ${esc(s.name)}</button>`).join('')}</div></div>` : ''}
    <div class="card rules">
      <h3>How to play</h3>
      <ul>
        <li>Everyone places two villages and two roads to start. Your second village pays out its neighboring tiles.</li>
        <li>Each turn, roll two dice. Every tile showing that number pays its resource to adjacent villages (1) and towns (2).</li>
        <li>Spend resources to build, trade with other players or the bank (4:1, or better at a harbor), and buy scrolls.</li>
        <li>Rolling a 7 summons the bandit: anyone holding more than 7 cards discards half, then the roller blocks a tile and steals a card.</li>
        <li>Village = 1 point, Town = 2. The longest road (5+) is the <b>Grand Route</b> (+2), and 3+ Guards played earns the <b>Strongest Watch</b> (+2). First to 10 points on their own turn wins.</li>
        <li>With 3+ players, a <b>builder phase</b> after each turn lets everyone else build too, so big games keep moving.</li>
      </ul>
      <div class="costs">
        <span>🛤️ Road: 🌲🧱</span><span>🏠 Village: 🌲🧱🐑🌾</span><span>🏰 Town: 🌾🌾⛏️⛏️⛏️</span><span>📜 Scroll: 🐑🌾⛏️</span>
      </div>
    </div>
  </div>`;
  $('#f-create').onsubmit = async (e) => {
    e.preventDefault();
    const name = e.target.name.value;
    try { const r = await api('/api/create', { name }); enterRoom(r.code, r.token, r.pid, name); } catch (err) { toast(err.message, true); }
  };
  $('#f-join').onsubmit = async (e) => {
    e.preventDefault();
    const name = e.target.name.value; const code = e.target.code.value.trim().toUpperCase();
    try { const r = await api('/api/join', { code, name }); enterRoom(r.code, r.token, r.pid, name); } catch (err) { toast(err.message, true); }
  };
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
function chime(kind) {
  if (!soundOn()) return;
  try {
    const ctx = S.audio || (S.audio = new (window.AudioContext || window.webkitAudioContext)());
    const notes = kind === 'trade' ? [660, 880] : [523, 659, 784];
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
    pieces: new Set([...Object.keys(v.buildings).map((k) => 'b' + k + v.buildings[k].type), ...Object.keys(v.roads).map((k) => 'r' + k)]),
    roll: v.lastRoll ? v.lastRoll.id : 0,
    steal: v.lastSteal ? v.lastSteal.id : 0,
    bandit: v.bandit,
    logId: v.log.length ? v.log[v.log.length - 1].id : 0,
  };
  const prev = S.prev;
  S.prev = cur;
  if (v.deadlineIn !== null && v.deadlineIn !== undefined) S.deadline = now + v.deadlineIn; else S.deadline = null;
  if (!prev) return; // first view after (re)connecting: nothing "just happened"
  if (cur.needMe && !prev.needMe) chime('turn');
  else if (cur.trade && cur.trade !== prev.trade) chime('trade');
  const stole = cur.steal !== prev.steal && v.lastSteal;
  if (cur.roll !== prev.roll && v.lastRoll) showDice(v, v.lastRoll);
  if (stole) showSteal(v, v.lastSteal);
  if (cur.bandit !== prev.bandit && prev.bandit !== undefined) S.banditMove = { from: prev.bandit, at: now };
  if (cur.hand && prev.hand && !stole) {
    const gained = RES.filter((r) => cur.hand[r] > prev.hand[r]).map((r) => RM[r].ico.repeat(cur.hand[r] - prev.hand[r])).join(' ');
    if (gained) setTimeout(() => toast(`+ ${gained}`), cur.roll !== prev.roll ? 900 : 0); // after the dice land
  }
  // private news (e.g. which scroll you drew), except steals, which get their own reveal
  for (const l of v.log) if (l.id > prev.logId && l.private && !/stole/.test(l.msg)) toast(l.msg);
  S.recent = S.recent || new Map();
  for (const k of cur.pieces) if (!prev.pieces.has(k)) S.recent.set(k, now);
  for (const [k, t] of S.recent) if (now - t > 4000) S.recent.delete(k);
}

// Big tumbling dice over the board, seen by everyone
function showDice(v, roll) {
  const fx = $('#fx');
  if (!fx) return;
  fx.querySelectorAll('.dicefx').forEach((e) => e.remove());
  const sum = roll.d[0] + roll.d[1];
  const who = esc(pname(v, roll.by));
  const label = roll.kind === 'order' ? `${who} rolled <b>${sum}</b> for turn order`
    : `${who} rolled <b>${sum}</b>${sum === 7 ? ' — bandits!' : ''}`;
  const el = document.createElement('div');
  el.className = 'dicefx';
  el.style.setProperty('--c', pcolor(v, roll.by));
  el.innerHTML = `<div class="dicefx-dice"><span class="die3">${dieSvg(1 + Math.floor(Math.random() * 6))}</span><span class="die3">${dieSvg(1 + Math.floor(Math.random() * 6))}</span></div><div class="fx-label">${label}</div>`;
  fx.appendChild(el);
  const dice = el.querySelectorAll('.die3');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let k = reduce ? 99 : 0;
  const land = () => { dice.forEach((d, i) => { d.innerHTML = dieSvg(roll.d[i]); }); el.classList.add('landed'); };
  if (reduce) land();
  else {
    const spin = setInterval(() => {
      dice.forEach((d) => { d.innerHTML = dieSvg(1 + Math.floor(Math.random() * 6)); });
      if (++k >= 10) { clearInterval(spin); land(); }
    }, 70);
  }
  setTimeout(() => el.classList.add('out'), 2400);
  setTimeout(() => el.remove(), 2800);
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
    S.screen = 'lobby'; S.lastLog = 0; S.lobbyKey = null;
    $('#app').innerHTML = `
    <div class="lobby">
      <div class="lobby-head">
        <div><div class="hint">Room code</div><div class="room-code">${esc(v.code)}</div></div>
        <div class="invite"><code id="invite-url"></code><button class="btn" id="copy">Copy invite link</button></div>
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
  // Only rebuild the player/settings card when it actually changed, so chat doesn't wipe a half-typed setting.
  const key = JSON.stringify([v.players, v.settings, v.hostId]);
  if (key === S.lobbyKey) return;
  S.lobbyKey = key;
  const hostP = v.players.find((p) => p.id === v.hostId);
  const canClaim = !host && (!hostP || !hostP.connected);
  $('#lobby-main').innerHTML = `
    <h2>Players <span class="hint">(${n}/${v.maxPlayers})</span></h2>
    <ul class="plist">${v.players.map((p) => `
      <li>${chip(p.color)}<b style="flex:1">${esc(p.name)}${p.id === v.me ? ' <span class="hint">(you)</span>' : ''}</b>
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
    <h3 style="margin-top:18px">Game settings ${host ? '' : '<span class="hint">set by host</span>'}</h3>
    <div class="settings">
      <label class="field">Points to win
        <input type="number" min="5" max="20" id="s-vp" value="${s.vpTarget}" ${host ? '' : 'disabled'}></label>
      <label class="field">Island size
        <select id="s-size" ${host ? '' : 'disabled'}>
          <option value="auto" ${s.boardSize === 'auto' ? 'selected' : ''}>Auto — ${sizeAuto} for ${n} players</option>
          <option value="small" ${s.boardSize === 'small' ? 'selected' : ''}>Small — 19 tiles (best for 2–4)</option>
          <option value="large" ${s.boardSize === 'large' ? 'selected' : ''}>Large — 37 tiles (best for 5–8)</option>
        </select></label>
      <label class="field">Hand limit when a 7 is rolled
        <input type="number" min="5" max="12" id="s-discard" value="${s.discardLimit}" ${host ? '' : 'disabled'}></label>
      <label class="toggle"><input type="checkbox" id="s-builder" ${s.builderPhase ? 'checked' : ''} ${host ? '' : 'disabled'}>
        <span><b>Builder phase</b><br><span class="hint">After each turn, the other players may build (no trading). Recommended for 5+ players.</span></span></label>
      <label class="field">Turn timer
        <select id="s-timer" ${host ? '' : 'disabled'}>
          ${[[0, 'Off — wait as long as it takes'], [60, '1 minute'], [90, '1½ minutes'], [120, '2 minutes'], [180, '3 minutes']].map(([sec, label]) =>
            `<option value="${sec}" ${(s.turnTimer || 0) === sec ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <span class="hint" style="font-weight:400">When time runs out the game plays for you (rolls, discards at random, ends the turn). Short steps like discarding get at most 1 minute.</span></label>
      <label class="toggle"><input type="checkbox" id="s-friendly" ${s.friendlyBandit ? 'checked' : ''} ${host ? '' : 'disabled'}>
        <span><b>Friendly bandit</b><br><span class="hint">The bandit can't be placed next to players with 2 or fewer points. Nice for newer players.</span></span></label>
    </div>
    <div style="margin-top:20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      ${host ? `<button class="btn primary" id="start" ${n < 2 ? 'disabled' : ''}>Start game</button><span class="hint" style="flex:1">${n < 2 ? 'Waiting for at least one more player…' : `Ready with ${n} players.`}</span>`
        : `<span class="hint" style="flex:1">Waiting for the host to start the game…</span>${canClaim ? '<button class="btn" id="claim">Host is offline — become host</button>' : ''}`}
      <button class="btn" id="leave">Leave room</button>
    </div>`;
  document.querySelectorAll('[data-color]').forEach((b) => { b.onclick = () => send({ type: 'setColor', color: b.dataset.color }); });
  document.querySelectorAll('[data-kick]').forEach((b) => { b.onclick = () => send({ type: 'kick', pid: b.dataset.kick }); });
  if (host) {
    const upd = (patch) => send({ type: 'settings', settings: patch });
    $('#s-vp').onchange = (e) => upd({ vpTarget: e.target.value });
    $('#s-discard').onchange = (e) => upd({ discardLimit: e.target.value });
    $('#s-size').onchange = (e) => upd({ boardSize: e.target.value });
    $('#s-builder').onchange = (e) => upd({ builderPhase: e.target.checked });
    $('#s-timer').onchange = (e) => upd({ turnTimer: Number(e.target.value) });
    $('#s-friendly').onchange = (e) => upd({ friendlyBandit: e.target.checked });
    $('#start').onclick = () => send({ type: 'start' });
  }
  if ($('#claim')) $('#claim').onclick = () => send({ type: 'claimHost' });
  $('#leave').onclick = async () => {
    if (!confirm('Leave this room?')) return;
    S.es.close(); // close first so the server dropping our feed isn't mistaken for a lost room
    if (await send({ type: 'leave' })) { forget(S.code); S.v = null; history.replaceState(null, '', '/'); renderHome(); }
    else connect();
  };
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
    const cls = l.private ? 'private' : (l.msg.startsWith('—') ? 'turn' : '');
    return `<div class="e ${cls}">${esc(l.msg)}</div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

// ---------- game ----------
function renderGame(v) {
  if (S.screen !== 'game') {
    S.screen = 'game'; S.boardKey = null; S.lastLog = 0; S.mode = null;
    $('#app').innerHTML = `
    <div class="game">
      <header class="topbar">
        <span class="brand">Hexhaven</span>
        <span class="roomtag" id="roomtag" title="Copy invite link">Room ${esc(v.code)}</span>
        <div class="status" id="status"></div>
        <span class="conn" id="conn"></span>
        <span class="timer" id="timer" hidden title="Time left before the game auto-plays"></span>
        <div class="dice" id="dice"></div>
        <button class="btn small" id="mute" title="Sound on/off"></button>
      </header>
      <div class="boardwrap" id="boardwrap">
        <svg id="board" xmlns="http://www.w3.org/2000/svg"><g id="g-static"></g><g id="g-low"></g><g id="g-dyn"></g><g id="g-hint"></g></svg>
        <div class="board-legend" id="legend"></div>
        <div class="fx" id="fx" aria-live="polite"></div>
        <div class="zoomctl" role="group" aria-label="Map zoom">
          <button class="btn small" data-zoom="in" title="Zoom in (+ / mouse wheel / pinch)" aria-label="Zoom in">+</button>
          <button class="btn small" data-zoom="out" title="Zoom out (−)" aria-label="Zoom out">−</button>
          <button class="btn small" data-zoom="reset" title="Fit whole island (0)" aria-label="Reset zoom">⤢</button>
        </div>
      </div>
      <div class="dock" id="dock"></div>
      <aside class="side">
        <section><h3>Players <span class="hint" id="vp-target"></span></h3><div class="players" id="players"></div></section>
        <section id="trade-sec" hidden></section>
        <section><h3>Dice stats <button class="btn small" id="stats-more">Details</button></h3>
          <div class="hint" id="dice-sum" style="margin:-4px 0 6px"></div>
          <div class="stats" id="stats"></div><div class="stats-l" id="stats-l"></div>
          <div class="recent" id="recent-rolls"></div>
          <div class="hint" id="bankinfo" style="margin-top:6px"></div></section>
        <section class="logsec"><h3>Log &amp; chat</h3><div class="log" id="log"></div>
          <form class="chatform" id="chat"><input type="text" maxlength="300" placeholder="Chat…" aria-label="Chat message"><button class="btn small">Send</button></form>
        </section>
      </aside>
    </div>`;
    $('#roomtag').onclick = copyInvite;
    $('#stats-more').onclick = () => openModal('dice');
    $('#board').addEventListener('click', onBoardClick);
    bindZoom();
    const muteLabel = () => { $('#mute').textContent = soundOn() ? '🔔' : '🔕'; };
    $('#mute').onclick = () => {
      try { localStorage.setItem('hexhaven:mute', soundOn() ? '1' : '0'); } catch {}
      muteLabel(); if (soundOn()) chime('turn');
    };
    muteLabel();
    bindChat();
  }
  if (!isBuilding(v)) S.mode = null;
  renderStatus(v);
  renderBoardStatic(v);
  renderBoardDyn(v);
  renderDock(v);
  renderPlayers(v);
  renderTrade(v);
  renderStats(v);
  renderLog(v);
  renderModal(v);
}

const isMine = (v) => v.turn.current === v.me;
const isBuilding = (v) => v.status === 'playing' && ((isMine(v) && v.turn.phase === 'main') || (v.turn.phase === 'builder' && v.turn.builder === v.me));

function boardMode(v) {
  const t = v.turn; const mine = isMine(v);
  if (v.status !== 'playing') return null;
  if (t.phase === 'setup' && mine) return t.setupNeed;
  if (t.phase === 'roadbuilding' && mine) return 'road';
  if (t.phase === 'robber' && mine) return 'bandit';
  return isBuilding(v) ? S.mode : null;
}

function statusText(v) {
  const t = v.turn; const mine = isMine(v); const cur = esc(pname(v, t.current));
  if (v.status === 'over') return `🏆 ${esc(pname(v, v.winner))} wins!`;
  switch (t.phase) {
    case 'order': {
      const o = v.order;
      const waiting = o.contenders.filter((id) => o.rolls[id] === undefined);
      if (waiting.includes(v.me)) return o.round > 1 ? 'Tie! Roll again to break it' : 'Roll the dice — highest roll goes first';
      return `Rolling for turn order… waiting for ${waiting.map((id) => esc(pname(v, id))).join(', ')}`;
    }
    case 'setup': {
      const what = t.setupNeed === 'village' ? (t.setupRound === 1 ? 'first village' : 'second village (it pays out right away)') : 'road next to it';
      return mine ? `Place your ${what} — click a glowing spot` : `${cur} is placing their ${t.setupNeed}…`;
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
  $('#dice').innerHTML = v.turn.dice ? v.turn.dice.map(dieSvg).join('') : '';
  $('#vp-target').textContent = `first to ${v.settings.vpTarget}`;
}

function dieSvg(n) {
  const P = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] }[n];
  return `<svg viewBox="0 0 40 40" aria-label="die ${n}"><rect x="2" y="2" width="36" height="36" rx="8" fill="#fffaf0" stroke="#2b2118" stroke-width="2"/>${P.map(([x, y]) => `<circle cx="${x * 10}" cy="${y * 10}" r="3.6" fill="#2b2118"/>`).join('')}</svg>`;
}

// ---------- board ----------
function hexPoints(v, h) { return h.v.map((id) => `${v.board.vertices[id].x * U},${v.board.vertices[id].y * U}`).join(' '); }
const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

function renderBoardStatic(v) {
  const b = v.board;
  const key = v.code + ':' + b.hexes.map((h) => h.res + h.num).join(',');
  if (S.boardKey === key) return;
  S.boardKey = key;
  const xs = b.vertices.map((p) => p.x).concat(b.harbors.map((h) => h.x));
  const ys = b.vertices.map((p) => p.y).concat(b.harbors.map((h) => h.y));
  const pad = 0.55;
  const minX = (Math.min(...xs) - pad) * U, minY = (Math.min(...ys) - pad) * U;
  const w = (Math.max(...xs) - Math.min(...xs) + 2 * pad) * U, h = (Math.max(...ys) - Math.min(...ys) + 2 * pad) * U;
  S.vb0 = [minX, minY, w, h]; S.vb = S.vb0.slice();
  applyVB();
  let out = '<defs><filter id="plate-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity=".35"/></filter></defs>';
  // harbors (behind tiles so docks tuck under the coast)
  for (const hb of b.harbors) {
    const E = b.edges[hb.edge]; const A = b.vertices[E.a]; const B = b.vertices[E.b];
    out += `<line x1="${hb.x * U}" y1="${hb.y * U}" x2="${A.x * U}" y2="${A.y * U}" stroke="#8b5a2b" stroke-width="5" stroke-linecap="round"/>`;
    out += `<line x1="${hb.x * U}" y1="${hb.y * U}" x2="${B.x * U}" y2="${B.y * U}" stroke="#8b5a2b" stroke-width="5" stroke-linecap="round"/>`;
  }
  for (const hx of b.hexes) {
    out += `<polygon points="${hexPoints(v, hx)}" fill="${RM[hx.res].color}" stroke="#efdcae" stroke-width="4" stroke-linejoin="round"/>`;
    const cx = hx.x * U, cy = hx.y * U;
    out += `<circle cx="${cx}" cy="${cy - 24}" r="14" fill="#fffaf0" stroke="${RM[hx.res].deep}" stroke-width="2.5" filter="url(#plate-shadow)"/>`;
    out += `<text x="${cx}" y="${cy - 23}" font-size="17" text-anchor="middle" dominant-baseline="central">${RM[hx.res].ico}</text>`;
    if (hx.num) {
      const red = hx.num === 6 || hx.num === 8;
      out += `<circle cx="${cx}" cy="${cy + 9}" r="17" fill="#f8efd8" stroke="#8a7350" stroke-width="1.5"/>`;
      out += `<text x="${cx}" y="${cy + 6}" font-size="${red ? 17 : 15}" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="${red ? '#c0281c' : '#2b2118'}" font-family="Georgia,serif">${hx.num}</text>`;
      const n = PIPS[hx.num];
      for (let i = 0; i < n; i++) out += `<circle cx="${cx + (i - (n - 1) / 2) * 4}" cy="${cy + 19}" r="1.5" fill="${red ? '#c0281c' : '#2b2118'}"/>`;
    }
  }
  for (const hb of b.harbors) {
    const label = hb.type === 'any' ? '3:1' : '2:1';
    out += `<circle cx="${hb.x * U}" cy="${hb.y * U}" r="16" fill="#fffaf0" stroke="#8b5a2b" stroke-width="2"/>`;
    if (hb.type === 'any') out += `<text x="${hb.x * U}" y="${hb.y * U}" font-size="12" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#2b2118">${label}</text>`;
    else {
      out += `<text x="${hb.x * U}" y="${hb.y * U - 5}" font-size="12" text-anchor="middle" dominant-baseline="central">${RM[hb.type].ico}</text>`;
      out += `<text x="${hb.x * U}" y="${hb.y * U + 8}" font-size="9" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#2b2118">${label}</text>`;
    }
  }
  $('#g-static').innerHTML = out;
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
  for (const [vid, bd] of Object.entries(v.buildings)) {
    const V = b.vertices[vid];
    out += `<g${anim('b' + vid + bd.type, 'drop')}>${bd.type === 'town' ? townShape(V.x * U, V.y * U, pcolor(v, bd.owner)) : villageShape(V.x * U, V.y * U, pcolor(v, bd.owner))}</g>`;
  }
  // fading rings around pieces built in the last few seconds
  for (const [k, at] of S.recent || []) {
    const age = Date.now() - at;
    let x, y;
    if (k[0] === 'b') { const V = b.vertices[parseInt(k.slice(1), 10)]; x = V.x * U; y = V.y * U - 2; }
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
  const c = at || { x: x + w / 2, y: y + h / 2 };
  S.vb = [c.x - (c.x - x) / factor, c.y - (c.y - y) / factor, w / factor, h / factor];
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
  const label = { road: 'Road', village: 'Village', town: 'Town', scroll: 'Scroll' };
  const buildBtns = ['road', 'village', 'town', 'scroll'].map((k) => `
    <button class="btn build ${S.mode === k ? 'on' : ''}" data-build="${k}" ${can[k] ? '' : 'disabled'} title="${label[k]} — ${left[k]} left · shortcut ${['road', 'village', 'town', 'scroll'].indexOf(k) + 1}">
      <span>${BUILD_ICO[k]} ${label[k]}</span><span class="cost">${costStr(v.cost[k])}</span></button>`).join('');
  let main = '';
  if (v.status === 'playing') {
    if (t.phase === 'order' && (v.stalled || []).includes(v.me)) main += '<button class="btn primary pulse" data-act="roll" title="Shortcut: R">🎲 Roll for turn order</button>';
    if (mine && t.phase === 'preroll') main += '<button class="btn primary pulse" data-act="roll" title="Shortcut: R">🎲 Roll dice</button>';
    if (mine && t.phase === 'main') main += '<button class="btn" data-act="trade" title="Shortcut: T">🤝 Trade</button><button class="btn primary" data-act="end" title="Shortcut: E">End turn ➜</button>';
    if (t.phase === 'builder' && t.builder === v.me) main += '<button class="btn primary pulse" data-act="pass" title="Shortcut: E">Done building</button>';
    if (mine && t.phase === 'roadbuilding') main += '<button class="btn" data-act="skipRoads">Skip free roads</button>';
  } else if (v.status === 'over' && S.hideOver) {
    main += '<button class="btn primary" data-act="results">🏆 Show results</button>';
  }
  const canPlay = v.status === 'playing' && mine && ['preroll', 'main'].includes(t.phase) && !t.devPlayed;
  const groups = {};
  for (const s of v.myScrolls) { const g = groups[s.type] = groups[s.type] || { n: 0, ready: 0 }; g.n++; if (!s.fresh) g.ready++; }
  const scrolls = Object.entries(groups).map(([k, g]) => `
    <span class="scroll" title="${esc(SCROLL_INFO[k].desc)}">${SCROLL_INFO[k].ico} ${esc(v.scrollNames[k])}${g.n > 1 ? ' ×' + g.n : ''}
      ${k === 'vp' ? '<span class="hint">+1 VP</span>' : `<button class="btn small" data-play="${k}" ${canPlay && g.ready ? '' : 'disabled'} title="${g.ready ? '' : 'Bought this turn — play it next turn'}">Play</button>`}
    </span>`).join('');
  $('#dock').innerHTML = `
    <div class="hand">${RES.map((r) => `<div class="rcard ${hand[r] ? '' : 'zero'}" style="background:${RM[r].card};--deep:${RM[r].deep}" title="${RM[r].name}${v.rates ? ` · trades ${v.rates[r]}:1` : ''}">
      <div class="ico">${RM[r].ico}</div><div class="n">${hand[r]}</div><div class="nm">${RM[r].name}</div></div>`).join('')}</div>
    <div class="actions">${buildBtns}<span class="sep"></span>${main}</div>
    ${scrolls ? `<div class="scrolls">${scrolls}</div>` : ''}`;
  $('#dock').querySelectorAll('[data-build]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.build;
      if (k === 'scroll') return send({ type: 'buyScroll' });
      S.mode = S.mode === k ? null : k;
      renderDock(S.v); renderBoardDyn(S.v);
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
      else if (a === 'results') { S.hideOver = false; renderGame(S.v); }
    };
  });
  $('#dock').querySelectorAll('[data-play]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.play;
      if (k === 'plenty' || k === 'monopoly') openModal(k);
      else send({ type: 'playScroll', kind: k });
    };
  });
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
    return `<div class="pl ${turnOf ? 'cur' : ''} ${p.connected ? '' : 'off'}">
      <div class="pl-top">${chip(p.color)}<span class="pl-name">${esc(p.name)}${p.id === v.me ? ' <span class="hint">(you)</span>' : ''}</span>
        ${p.id === v.hostId ? '<span class="badge">host</span>' : ''}
        ${p.connected ? '' : '<span class="badge">offline</span>'}
        <span class="pl-vp" title="victory points">${vpTxt}</span></div>
      <div class="pl-stats">
        <span title="resource cards">🃏 ${p.cards}</span><span title="scrolls">📜 ${p.scrolls}</span>
        <span title="guards played">🛡️ ${p.guards}</span><span title="longest road">🛤️ ${p.roadLen}</span>
        ${p.longest ? '<span class="badge award">Grand Route +2</span>' : ''}${p.army ? '<span class="badge award">Strongest Watch +2</span>' : ''}
        ${v.turn.phase === 'order' && v.order.rolls[p.id] !== undefined ? `<span class="badge award">🎲 ${v.order.rolls[p.id]}</span>` : ''}
        ${waiting ? '<span class="badge">⏳ acting</span>' : ''}
        ${canSkip ? '<button class="btn small" data-skip>Skip</button>' : ''}
      </div></div>`;
  }).join('');
  const hostP = v.players.find((p) => p.id === v.hostId);
  if (!host && (!hostP || !hostP.connected)) {
    $('#players').insertAdjacentHTML('beforeend', '<button class="btn small" data-claim>Host is offline — become host</button>');
    $('#players [data-claim]').onclick = () => send({ type: 'claimHost' });
  }
  const sk = $('#players [data-skip]');
  if (sk) sk.onclick = () => { if (confirm('Skip ahead for the player(s) holding up the game? (Random discards / auto-roll / end their turn)')) send({ type: 'skip' }); };
  $('#bankinfo').textContent = v.bank ? `bank: ${RES.map((r) => RM[r].ico + v.bank[r]).join(' ')} · 📜${v.deckCount}` : '';
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
      <td>${mineRolls.filter((r) => r.n === 7).length}</td><td><b>${(v.produced || {})[p.id] || 0}</b></td></tr>`;
  }).join('');
  return `<h2>🎲 Dice statistics</h2>
    <p class="hint" style="margin:0">${st.total} rolls so far. "Expected" is how often each number should come up with fair dice. ★ marks numbers your buildings sit on.</p>
    <table class="stat-table"><thead><tr><th>Roll</th><th>Times</th><th>Expected</th><th>±</th><th>Share / odds</th><th>Last seen</th></tr></thead><tbody>${rows}</tbody></table>
    <h3 style="font-size:16px">By player</h3>
    <table class="stat-table"><thead><tr><th>Player</th><th>Rolls</th><th>Avg</th><th>7s</th><th title="Cards collected from dice rolls">Harvested</th></tr></thead><tbody>${people}</tbody></table>
    <div class="foot"><button class="btn" data-do="close">Close</button></div>`;
}

// ---------- modals ----------
function openModal(kind) {
  S.modal = kind;
  if (kind === 'trade') S.ui = { give: zero(), get: zero(), bankGive: null, bankGet: null };
  if (kind === 'plenty') S.ui = { picks: [] };
  if (kind === 'monopoly') S.ui = { pick: null };
  if (kind === 'counter') {
    // start from the mirror of the current offer
    const tr = S.v.trade;
    S.ui = { give: { ...zero(), ...tr.get }, get: { ...zero(), ...tr.give }, tradeId: tr.id };
  }
  renderModal(S.v);
}
function closeModal() { S.modal = null; $('#modal-root').innerHTML = ''; }

function stepperGrid(prefix, counts, limits) {
  return `<div class="steppers">${RES.map((r) => `<div class="stepper">
    <div class="ico">${RM[r].ico}</div><div class="n">${counts[r]}</div>
    ${limits ? `<div class="have">of ${limits[r]}</div>` : ''}
    <div class="ctl"><button class="btn small" data-step="${prefix}:${r}:-1" ${counts[r] <= 0 ? 'disabled' : ''} aria-label="less ${RM[r].name}">−</button>
    <button class="btn small" data-step="${prefix}:${r}:1" ${limits && counts[r] >= limits[r] ? 'disabled' : ''} aria-label="more ${RM[r].name}">+</button></div></div>`).join('')}</div>`;
}

function renderModal(v) {
  const root = $('#modal-root');
  const t = v.turn; const hand = v.hand || zero();
  // forced modals take priority
  let kind = S.modal;
  if (v.status === 'over') kind = 'over';
  else if (t.phase === 'discard' && v.pendingDiscard[v.me]) { if (S.modal !== 'discard') { S.modal = 'discard'; S.ui = { cards: zero() }; } kind = 'discard'; }
  else if (t.phase === 'steal' && isMine(v)) kind = 'steal';
  else if (kind === 'discard') kind = null;
  if (kind === 'trade' && !(isMine(v) && t.phase === 'main')) kind = null;
  if (kind === 'counter' && !(v.trade && v.trade.id === S.ui.tradeId && v.trade.from !== v.me)) kind = null;
  if ((kind === 'plenty' || kind === 'monopoly') && !(isMine(v) && ['preroll', 'main'].includes(t.phase) && !t.devPlayed)) kind = null;
  if (!kind) { root.innerHTML = ''; S.modal = null; return; }
  if (S.modal !== kind && kind !== 'over' && kind !== 'steal') S.modal = kind;

  let html = '';
  if (kind === 'discard') {
    const need = v.pendingDiscard[v.me]; const c = S.ui.cards; const n = cnt(c);
    html = `<h2>The bandits strike!</h2><p>You hold more than ${v.settings.discardLimit} cards. Choose <b>${need}</b> to discard.</p>
      ${stepperGrid('cards', c, hand)}
      <div class="foot"><span class="hint" style="flex:1">${n} / ${need} selected</span><button class="btn primary" data-do="discard" ${n === need ? '' : 'disabled'}>Discard</button></div>`;
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
    const gN = cnt(u.give), rN = cnt(u.get);
    const clash = RES.some((r) => u.give[r] && u.get[r]);
    const rateG = u.bankGive ? v.rates[u.bankGive] : null;
    const bankOk = u.bankGive && u.bankGet && u.bankGive !== u.bankGet && hand[u.bankGive] >= rateG && v.bank[u.bankGet] > 0;
    html = `<h2>Trade</h2>
      <div><h3 style="font-size:16px">With other players</h3><p class="hint" style="margin:2px 0 8px">Everyone sees your offer and can accept; you choose who to trade with.</p>
        <b>You give</b>${stepperGrid('give', u.give, hand)}
        <b style="display:block;margin-top:10px">You want</b>${stepperGrid('get', u.get, null)}
        <div class="foot" style="margin-top:10px">${clash ? '<span class="hint" style="flex:1">Same resource on both sides</span>' : ''}<button class="btn primary" data-do="propose" ${gN && rN && !clash ? '' : 'disabled'}>Offer to everyone</button></div>
      </div>
      <hr style="border:0;border-top:1px solid var(--line);width:100%">
      <div><h3 style="font-size:16px">With the bank</h3><p class="hint" style="margin:2px 0 8px">Your rates: ${RES.map((r) => `${RM[r].ico} ${v.rates[r]}:1`).join(' · ')}</p>
        <div class="split">
          <div><b>Give</b><div class="respick">${RES.map((r) => `<button class="btn small ${u.bankGive === r ? 'on' : ''}" data-bg="${r}" ${hand[r] >= v.rates[r] ? '' : 'disabled'}>${RM[r].ico} ${v.rates[r]}</button>`).join('')}</div></div>
          <div><b>Get</b><div class="respick">${RES.map((r) => `<button class="btn small ${u.bankGet === r ? 'on' : ''}" data-bt="${r}" ${v.bank[r] > 0 && r !== u.bankGive ? '' : 'disabled'}>${RM[r].ico} 1</button>`).join('')}</div></div>
        </div>
        <div class="foot" style="margin-top:10px"><button class="btn primary" data-do="bank" ${bankOk ? '' : 'disabled'}>${bankOk ? `Trade ${rateG} ${RM[u.bankGive].ico} → 1 ${RM[u.bankGet].ico}` : 'Bank trade'}</button></div>
      </div>
      <div class="foot"><button class="btn" data-do="close">Close</button></div>`;
  } else if (kind === 'dice') {
    html = diceModal(v);
  } else if (kind === 'counter') {
    const u = S.ui; const gN = cnt(u.give), rN = cnt(u.get);
    const clash = RES.some((r) => u.give[r] && u.get[r]);
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
      <div class="scoreboard">${ranked.map((p) => `<div>${chip(p.color)}<b style="flex:1">${esc(p.name)}</b>
        ${p.longest ? '<span class="badge award">Route</span>' : ''}${p.army ? '<span class="badge award">Watch</span>' : ''}
        <span class="pl-vp">${p.vpTotal}</span></div>`).join('')}</div>
      <div class="foot">${v.hostId === v.me ? '<button class="btn primary" data-do="rematch">Back to lobby for a rematch</button>' : '<span class="hint">The host can start a rematch.</span>'}
        <button class="btn" data-do="hide">View board</button></div>`;
    if (S.hideOver) { root.innerHTML = ''; return; }
  }
  root.innerHTML = `<div class="backdrop" data-backdrop><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;

  root.querySelectorAll('[data-step]').forEach((b) => {
    b.onclick = () => {
      const [k, r, d] = b.dataset.step.split(':');
      const obj = k === 'cards' ? S.ui.cards : S.ui[k];
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
  root.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => { S.ui.picks.push(b.dataset.pick); renderModal(S.v); }; });
  root.querySelectorAll('[data-mono]').forEach((b) => { b.onclick = () => { S.ui.pick = b.dataset.mono; renderModal(S.v); }; });
  root.querySelectorAll('[data-bg]').forEach((b) => { b.onclick = () => { S.ui.bankGive = b.dataset.bg; if (S.ui.bankGet === S.ui.bankGive) S.ui.bankGet = null; renderModal(S.v); }; });
  root.querySelectorAll('[data-bt]').forEach((b) => { b.onclick = () => { S.ui.bankGet = b.dataset.bt; renderModal(S.v); }; });
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
      if (d === 'bank') { await send({ type: 'bankTrade', give: S.ui.bankGive, get: S.ui.bankGet }); }
      if (d === 'rematch') { closeModal(); send({ type: 'rematch' }); }
    };
  });
  const bd = root.querySelector('[data-backdrop]');
  bd.onclick = (e) => { if (e.target === bd && ['trade', 'plenty', 'monopoly', 'counter', 'dice'].includes(kind)) closeModal(); };
}

setInterval(() => {
  const el = $('#timer');
  if (!el) return;
  if (!S.deadline || !S.v || S.v.status !== 'playing') { el.hidden = true; return; }
  const left = Math.max(0, Math.ceil((S.deadline - Date.now()) / 1000));
  el.hidden = false;
  el.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  el.classList.toggle('low', left <= 10 && (S.v.stalled || []).includes(S.v.me));
}, 250);

// Shortcuts: R roll · E end turn / done building · T trade · 1–4 road/village/town/scroll · Esc cancel
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (['trade', 'plenty', 'monopoly', 'counter', 'dice'].includes(S.modal)) closeModal();
    else if (S.mode) { S.mode = null; if (S.v) { renderDock(S.v); renderBoardDyn(S.v); } }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || S.modal) return;
  const key = { r: 'roll', e: 'end', t: 'trade', 1: 'b-road', 2: 'b-village', 3: 'b-town', 4: 'b-scroll' }[e.key.toLowerCase()];
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

boot();
