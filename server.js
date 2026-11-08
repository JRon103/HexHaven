'use strict';
// Hexhaven server: zero dependencies. Clients POST actions and receive their own view over Server-Sent Events.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const G = require('./game');
const SAVE = require('./save');

// Which code is running. On Cloud Run the deploy workflow passes APP_COMMIT / APP_BUILT and Cloud Run sets
// K_REVISION; locally we ask git (and flag uncommitted changes as "+dirty").
const BUILD = (() => {
  const git = (cmd) => { try { return execSync(cmd, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  const commit = process.env.APP_COMMIT || git('git rev-parse HEAD');
  const dirty = !process.env.APP_COMMIT && git('git status --porcelain') !== '';
  return {
    version: require('./package.json').version,
    commit: commit ? commit.slice(0, 7) + (dirty ? '+dirty' : '') : 'unknown',
    built: process.env.APP_BUILT || null,
    revision: process.env.K_REVISION || 'local',
    startedAt: new Date().toISOString(),
    node: process.version,
  };
})();

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'rooms.json');
const ROOM_TTL = 7 * 24 * 3600 * 1000;

const rooms = new Map();   // code -> game
const streams = new Map(); // code -> Set<{res, pid}>

// ---------- persistence (so a server restart doesn't wipe running games) ----------
function load() {
  try {
    const list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const g of list) {
      if (Date.now() - g.updatedAt > ROOM_TTL) continue;
      for (const p of g.players) p.connected = false;
      g.settings = { ...G.createGame(g.code).settings, ...g.settings };
      rooms.set(g.code, g);
    }
    console.log(`Loaded ${rooms.size} saved room(s).`);
  } catch { /* first run */ }
}
let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify([...rooms.values()]));
      fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
    } catch (e) { console.error('Save failed:', e.message); }
  }, 1000);
}

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
    if (!rooms.has(c)) return c;
  }
}

function broadcast(code) {
  const g = rooms.get(code);
  const set = streams.get(code);
  if (g && set) {
    for (const c of set) {
      // players who were removed or left lose their live feed
      if (!g.players.some((p) => p.id === c.pid)) { set.delete(c); c.res.end(); continue; }
      c.res.write(`data: ${JSON.stringify(G.viewFor(g, c.pid))}\n\n`);
    }
  }
  save();
}

function auth(code, token) {
  const g = rooms.get(String(code || '').toUpperCase());
  if (!g || !token) return null;
  const p = g.players.find((x) => x.token === token);
  return p ? { g, p } : null;
}

// ---------- http ----------
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/crowns-ui.js': ['crowns-ui.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
  // the rules, notation and save code, so the browser's replay viewer runs the real engine
  '/lib/notation.js': ['../notation.js', 'text/javascript; charset=utf-8'],
  '/lib/crowns.js': ['../crowns.js', 'text/javascript; charset=utf-8'],
  '/lib/game.js': ['../game.js', 'text/javascript; charset=utf-8'],
  '/lib/save.js': ['../save.js', 'text/javascript; charset=utf-8'],
};

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Hexhaven-Build': BUILD.commit });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > limit) { reject(new Error('Body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Bad JSON')); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && STATIC[url.pathname]) {
      const [file, type] = STATIC[url.pathname];
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Hexhaven-Build': BUILD.commit });
      if (file === 'index.html') {
        // stamp the build onto the script/style URLs so no browser keeps a cached copy from an older deploy
        const v = encodeURIComponent(BUILD.commit);
        const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8')
          .replace('href="/style.css"', `href="/style.css?v=${v}"`).replace('src="/app.js"', `src="/app.js?v=${v}"`).replace('src="/crowns-ui.js"', `src="/crowns-ui.js?v=${v}"`);
        return res.end(html);
      }
      return fs.createReadStream(path.join(PUBLIC, file)).pipe(res);
    }

    if (req.method === 'POST' && url.pathname === '/api/create') {
      const body = await readBody(req);
      const g = G.createGame(newCode());
      const p = G.addPlayer(g, body.name);
      rooms.set(g.code, g); save();
      return json(res, 200, { code: g.code, token: p.token, pid: p.id });
    }

    if (req.method === 'POST' && url.pathname === '/api/join') {
      const body = await readBody(req);
      const g = rooms.get(String(body.code || '').trim().toUpperCase());
      if (!g) return json(res, 404, { error: 'No room with that code' });
      const p = G.addPlayer(g, body.name);
      broadcast(g.code);
      return json(res, 200, { code: g.code, token: p.token, pid: p.id });
    }

    if (req.method === 'GET' && url.pathname === '/api/version') return json(res, 200, BUILD);

    // Download the game as a save file: the host any time, everyone once the game is over.
    if (req.method === 'GET' && url.pathname === '/api/save') {
      const a = auth(url.searchParams.get('code'), url.searchParams.get('token'));
      if (!a) return json(res, 404, { error: 'Session not found' });
      const g = a.g;
      if (g.status === 'lobby' || !g.board) return json(res, 400, { error: 'The game has not started yet' });
      if (g.status !== 'over' && g.hostId !== a.p.id) return json(res, 403, { error: 'Only the host can save before the game ends' });
      const text = SAVE.stringifySave(SAVE.exportSave(g, { build: BUILD.commit }));
      if (g.status === 'playing') {
        // the file holds the current seed: switch the live game to a fresh one so it can't predict the coming dice
        G.reseed(g); save();
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Hexhaven-Build': BUILD.commit,
        'Content-Disposition': `attachment; filename="hexhaven-${g.code}-turn${g.turn.number}${g.status === 'over' ? '-final' : ''}.json"`,
      });
      return res.end(text);
    }

    // Start a new room from a save file; the uploader takes the seat they pick and becomes host.
    if (req.method === 'POST' && url.pathname === '/api/load') {
      const body = await readBody(req, 3_000_000);
      const code = newCode();
      const { game, notes } = SAVE.importSave(body.save, code);
      const me = game.players.find((p) => p.seat === Number(body.seat));
      if (!me) return json(res, 400, { error: 'Pick the seat you want to play' });
      game.hostId = me.id;
      game.code = code;
      game.log.push({ id: ++game.logSeq, t: Date.now(), msg: `💾 Game loaded from a save (turn ${game.turn.number}). Others rejoin with this room code by picking their seat.` });
      for (const n of notes) game.log.push({ id: ++game.logSeq, t: Date.now(), msg: n });
      rooms.set(code, game); save();
      return json(res, 200, { code, token: me.token, pid: me.id, notes });
    }

    // Public room info, so the join screen can offer the seats of a game in progress.
    if (req.method === 'GET' && url.pathname === '/api/room') {
      const g = rooms.get(String(url.searchParams.get('code') || '').trim().toUpperCase());
      if (!g) return json(res, 404, { error: 'No room with that code' });
      return json(res, 200, { code: g.code, status: g.status, players: g.players.map((p) => ({ name: p.name, color: p.color, connected: p.connected })) });
    }

    if (req.method === 'GET' && url.pathname === '/api/session') {
      const a = auth(url.searchParams.get('code'), url.searchParams.get('token'));
      return a ? json(res, 200, { ok: true, name: a.p.name, pid: a.p.id }) : json(res, 404, { error: 'Session not found' });
    }

    if (req.method === 'GET' && url.pathname === '/api/stream') {
      const a = auth(url.searchParams.get('code'), url.searchParams.get('token'));
      if (!a) return json(res, 404, { error: 'Session not found' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 2000\n\n');
      const client = { res, pid: a.p.id };
      if (!streams.has(a.g.code)) streams.set(a.g.code, new Set());
      streams.get(a.g.code).add(client);
      G.setConnected(a.g, a.p.id, true);
      broadcast(a.g.code);
      req.on('close', () => {
        const set = streams.get(a.g.code);
        set.delete(client);
        const still = [...set].some((c) => c.pid === a.p.id);
        if (!still && G.setConnected(a.g, a.p.id, false)) broadcast(a.g.code);
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/action') {
      const body = await readBody(req);
      const a = auth(body.code, body.token);
      if (!a) return json(res, 404, { error: 'Session not found' });
      G.act(a.g, a.p.id, body.action);
      broadcast(a.g.code);
      return json(res, 200, { ok: true });
    }

    json(res, 404, { error: 'Not found' });
  } catch (e) {
    if (!e.user) console.error(e);
    json(res, e.user ? 400 : 500, { error: e.user ? e.message : 'Server error' });
  }
});

setInterval(() => {
  for (const set of streams.values()) for (const c of set) c.res.write(': ping\n\n');
  for (const [code, g] of rooms) {
    if (Date.now() - g.updatedAt > ROOM_TTL && !(streams.get(code) || new Set()).size) rooms.delete(code);
  }
}, 20000);

// turn timer
setInterval(() => {
  for (const [code, g] of rooms) {
    try { if (G.tick(g)) broadcast(code); } catch (e) { console.error('Timer error in', code, e); g.deadline = null; }
  }
}, 1000);

load();
server.listen(PORT, () => {
  console.log(`\nHexhaven is running!  build ${BUILD.commit} · v${BUILD.version} · revision ${BUILD.revision}${BUILD.built ? ` · built ${BUILD.built}` : ''} · node ${BUILD.node}`);
  console.log(`  On this computer:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`  Same Wi-Fi:        http://${i.address}:${PORT}`);
  }
  console.log('');
});
