'use strict';
// Hexhaven server: zero dependencies. Clients POST actions and receive their own view over Server-Sent Events.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const G = require('./game');

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
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
};

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 20000) { reject(new Error('Body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Bad JSON')); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && STATIC[url.pathname]) {
      const [file, type] = STATIC[url.pathname];
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
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
  console.log(`\nHexhaven is running!\n  On this computer:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`  Same Wi-Fi:        http://${i.address}:${PORT}`);
  }
  console.log('');
});
