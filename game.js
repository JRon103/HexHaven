'use strict';
// Hexhaven rules engine. Pure state + actions; the server owns one game object per room.
const crypto = require('crypto');
const { encodeMove, CROWNS_MOVES } = require('./notation');
const CR = require('./crowns');

const RES = ['wood', 'clay', 'fleece', 'wheat', 'iron'];
const COM = CR.COM; // commodities (Crowns & Raiders only): parchment, linen, silver
const CARDS = [...RES, ...COM]; // everything that can sit in a hand
const RES_NAME = { wood: 'Wood', clay: 'Clay', fleece: 'Fleece', wheat: 'Wheat', iron: 'Iron', parchment: 'Parchment', linen: 'Linen', silver: 'Silver' };
const COST = {
  road: { wood: 1, clay: 1 },
  village: { wood: 1, clay: 1, fleece: 1, wheat: 1 },
  town: { wheat: 2, iron: 3 },
  scroll: { fleece: 1, wheat: 1, iron: 1 },
};
const PIECES = { road: 15, village: 5, town: 4 };
const SCROLL_NAME = { guard: 'Guard', route: 'Road Crew', plenty: 'Bounty', monopoly: 'Embargo', vp: 'Monument' };
const COLORS = ['red', 'blue', 'ivory', 'orange', 'green', 'brown', 'purple', 'teal'];
const MAX_PLAYERS = 8;
const BASE_NUMS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

// All gameplay randomness (board, deck, dice, steals, auto-play) comes from the game's own seeded
// generator (mulberry32 over game.rng.s), so a game is exactly reproducible from its seed and moves.
// act()/tick() point CUR_RNG at the game being changed. Ids and tokens are not gameplay and stay random.
let CUR_RNG = null;
const newSeed = () => crypto.randomBytes(4).readUInt32LE(0);
function rint(n) {
  if (!CUR_RNG) return crypto.randomInt(n);
  let t = (CUR_RNG.s = (CUR_RNG.s + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
}
const rid = (bytes) => crypto.randomBytes(bytes).toString('hex');
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const emptyHand = () => ({ wood: 0, clay: 0, fleece: 0, wheat: 0, iron: 0, parchment: 0, linen: 0, silver: 0 });
const handCount = (h) => CARDS.reduce((s, r) => s + (h[r] || 0), 0);
const hasRes = (h, cost) => CARDS.every((r) => (h[r] || 0) >= (cost[r] || 0));
function move(from, to, cost) {
  for (const r of CARDS) { const c = cost[r] || 0; if (!c) continue; from[r] = (from[r] || 0) - c; to[r] = (to[r] || 0) + c; }
}
function fmtRes(cost) {
  return CARDS.filter((r) => cost[r]).map((r) => `${cost[r]} ${RES_NAME[r]}`).join(', ') || 'nothing';
}
function fail(msg) { const e = new Error(msg); e.user = true; throw e; }

// ---------- board ----------

function boardConfig(size, n) {
  const small = size === 'small' || (size === 'auto' && n <= 4);
  if (small) {
    return {
      radius: 2, res: { wood: 4, clay: 3, fleece: 4, wheat: 4, iron: 3 }, deserts: 1,
      harbors: ['any', 'any', 'any', 'any', ...RES], bank: 19,
      deck: { guard: 14, vp: 5, route: 2, plenty: 2, monopoly: 2 },
    };
  }
  return {
    radius: 3, res: { wood: 8, clay: 6, fleece: 8, wheat: 7, iron: 6 }, deserts: 2,
    harbors: ['any', 'any', 'any', 'any', 'any', ...RES, 'fleece'], bank: n >= 7 ? 30 : 24,
    deck: n >= 7 ? { guard: 24, vp: 6, route: 4, plenty: 4, monopoly: 4 } : { guard: 20, vp: 5, route: 3, plenty: 3, monopoly: 3 },
  };
}

function numberPool(count) {
  let pool = [];
  while (pool.length < count) pool = pool.concat(BASE_NUMS);
  const dropOrder = [12, 2, 11, 3, 10, 4, 9, 5];
  let i = 0;
  while (pool.length > count) {
    const k = pool.indexOf(dropOrder[i++ % dropOrder.length]);
    if (k >= 0) pool.splice(k, 1);
  }
  return pool;
}

function buildBoard(cfg) {
  const SQ3 = Math.sqrt(3);
  const R = cfg.radius;
  const coords = [];
  for (let q = -R; q <= R; q++) {
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) coords.push({ q, r });
  }
  const vmap = new Map(); const vertices = [];
  const emap = new Map(); const edges = [];
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const getV = (x, y) => {
    const k = `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
    let id = vmap.get(k);
    if (id === undefined) {
      id = vertices.length; vmap.set(k, id);
      vertices.push({ id, x: r3(x), y: r3(y), hexes: [], adj: [], edges: [], harbor: null });
    }
    return id;
  };
  const getE = (a, b) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    let id = emap.get(k);
    if (id === undefined) {
      id = edges.length; emap.set(k, id);
      edges.push({ id, a, b, hexes: [] });
      vertices[a].edges.push(id); vertices[b].edges.push(id);
      vertices[a].adj.push(b); vertices[b].adj.push(a);
    }
    return id;
  };
  const hexes = coords.map((c, i) => {
    const x = SQ3 * (c.q + c.r / 2); const y = 1.5 * c.r;
    const v = [];
    for (let k = 0; k < 6; k++) {
      const ang = (Math.PI / 180) * (60 * k - 90);
      v.push(getV(x + Math.cos(ang), y + Math.sin(ang)));
    }
    return { id: i, q: c.q, r: c.r, x: r3(x), y: r3(y), v, res: 'desert', num: null };
  });
  for (const h of hexes) {
    for (let k = 0; k < 6; k++) {
      vertices[h.v[k]].hexes.push(h.id);
      edges[getE(h.v[k], h.v[(k + 1) % 6])].hexes.push(h.id);
    }
  }

  // resources + numbers (no two red numbers touching)
  const tiles = [];
  for (const r of RES) for (let i = 0; i < cfg.res[r]; i++) tiles.push(r);
  for (let i = 0; i < cfg.deserts; i++) tiles.push('desert');
  shuffle(tiles);
  hexes.forEach((h, i) => { h.res = tiles[i]; });
  const key = (q, r) => `${q},${r}`;
  const byCoord = new Map(hexes.map((h) => [key(h.q, h.r), h]));
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const neighbors = (h) => DIRS.map(([dq, dr]) => byCoord.get(key(h.q + dq, h.r + dr))).filter(Boolean);
  const land = hexes.filter((h) => h.res !== 'desert');
  const nums = numberPool(land.length);
  for (let attempt = 0; attempt < 2000; attempt++) {
    shuffle(nums);
    land.forEach((h, i) => { h.num = nums[i]; });
    const bad = land.some((h) => (h.num === 6 || h.num === 8) &&
      neighbors(h).some((o) => o.num === 6 || o.num === 8));
    if (!bad) break;
  }

  // harbors spaced evenly around the coast
  const outer = edges.filter((e) => e.hexes.length === 1).map((e) => {
    const A = vertices[e.a]; const B = vertices[e.b];
    return { e, mx: (A.x + B.x) / 2, my: (A.y + B.y) / 2 };
  }).sort((p, q) => Math.atan2(p.my, p.mx) - Math.atan2(q.my, q.mx));
  const types = shuffle(cfg.harbors.slice());
  const offset = rint(outer.length);
  const harbors = types.map((type, i) => {
    const o = outer[(offset + Math.floor((i * outer.length) / types.length)) % outer.length];
    const h = hexes[o.e.hexes[0]];
    vertices[o.e.a].harbor = type; vertices[o.e.b].harbor = type;
    return { edge: o.e.id, type, x: r3(h.x + (o.mx - h.x) * 1.55), y: r3(h.y + (o.my - h.y) * 1.55) };
  });
  return { radius: R, hexes, vertices, edges, harbors };
}

// ---------- lobby ----------

function createGame(code) {
  return {
    code, createdAt: Date.now(), updatedAt: Date.now(), status: 'lobby', hostId: null,
    settings: { mode: 'classic', vpTarget: 10, builderPhase: false, discardLimit: 7, boardSize: 'auto', turnTimer: 0, friendlyBandit: false, firstRaid: 7 },
    players: [], log: [], logSeq: 0, version: 0, rng: { s: newSeed() },
  };
}

function cleanName(name) {
  const n = String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 20);
  if (!n) fail('Please enter a name');
  return n;
}

function addPlayer(game, name) {
  name = cleanName(name);
  // Joining with the exact name of an offline seat reclaims it (new device, cleared browser, etc.)
  const same = game.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (same && !same.connected) { log(game, `${same.name} rejoined.`); return same; }
  if (same) fail('That name is taken in this room');
  if (game.status !== 'lobby') fail('That game has already started. To get your seat back, join with the exact name you used.');
  if (game.players.length >= MAX_PLAYERS) fail(`Room is full (${MAX_PLAYERS} players max)`);
  const color = COLORS.find((c) => !game.players.some((p) => p.color === c));
  const p = { id: 'p' + rid(4), token: rid(24), name, color, connected: false };
  game.players.push(p);
  if (!game.hostId) game.hostId = p.id;
  log(game, `${name} joined the room.`);
  return p;
}

// data: optional structured detail the client can render richly (e.g. harvest icons); msg stays the plain-text fallback
function log(game, msg, to, data) {
  game.log.push({ id: ++game.logSeq, t: Date.now(), msg, ...(to ? { to } : {}), ...(data ? { data } : {}) });
  if (game.log.length > 300) game.log.splice(0, game.log.length - 300);
}

function startGame(game) {
  const n = game.players.length;
  if (n < 2) fail('Need at least 2 players to start');
  const cfg = boardConfig(game.settings.boardSize, n);
  game.players.forEach((p, i) => { p.seat = i + 1; }); // permanent seat numbers (turn order is the array order)
  // seats stay in lobby order; a roll-off decides who goes first, then play goes around the table
  for (const p of game.players) {
    p.hand = emptyHand(); p.scrolls = []; p.guards = 0; p.roadLen = 0;
    p.pieces = { ...PIECES };
  }
  game.board = buildBoard(cfg);
  game.bank = emptyHand(); for (const r of RES) game.bank[r] = cfg.bank;
  if (game.settings.mode === 'crowns') CR.setup(game, cfg); else delete game.cr;
  game.deck = [];
  for (const [k, c] of Object.entries(cfg.deck)) for (let i = 0; i < c; i++) game.deck.push(k);
  shuffle(game.deck);
  game.bandit = game.board.hexes.find((h) => h.res === 'desert').id;
  game.buildings = {}; game.roads = {};
  game.longestHolder = null; game.armyHolder = null;
  game.pendingDiscard = {}; game.trade = null; game.winner = null;
  game.rollStats = Array(13).fill(0);
  game.rollHistory = []; // { n, d: [d1, d2], by, turn }
  game.produced = {};    // pid -> cards collected from dice rolls
  game.turn = {
    idx: 0, number: 0, phase: 'order', setup: { pos: 0, need: 'village', last: null },
    dice: null, devPlayed: false, freeRoads: 0, victims: [], afterRobber: null, afterRoads: null,
    builder: null, builderQueue: [],
  };
  game.order = { contenders: game.players.map((p) => p.id), rolls: {}, round: 1 };
  game.lastRoll = null; game.rollSeq = 0;
  game.mapVote = null;
  game.status = 'playing';
  log(game, 'Game started! Everyone rolls — highest roll goes first.');
  startHistory(game);
}

// ---------- a new map before anyone builds ----------
// Until the first settlement is placed the island can be rerolled: the host directly, or anyone by calling a
// vote. More than half saying yes rerolls it, more than half saying no keeps it; a tie leaves it to the host.
const canRerollMap = (game) => game.status === 'playing' && ['order', 'setup'].includes(game.turn.phase)
  && !Object.keys(game.buildings).length && !Object.keys(game.roads).length;
function rerollMap(game) {
  game.board = buildBoard(boardConfig(game.settings.boardSize, game.players.length));
  game.bandit = game.board.hexes.find((h) => h.res === 'desert').id;
  game.mapVote = null;
  game.mapSeq = (game.mapSeq || 0) + 1;
}
function mapTally(game) {
  const v = game.mapVote; const n = game.players.length;
  const yes = Object.values(v.votes).filter((x) => x === 1).length;
  const no = Object.values(v.votes).filter((x) => x === -1).length;
  return { yes, no, n, tie: yes + no === n && yes === no };
}
function mapAction(game, p, a) {
  if (!canRerollMap(game)) fail('The map can only change before anyone places a piece');
  const host = p.id === game.hostId;
  if (a.type === 'rerollMap') {
    if (!host) fail('Only the host can do that');
    rerollMap(game);
    log(game, `🗺️ ${p.name} rerolled the map.`);
    return;
  }
  if (a.type === 'mapDecide') {
    if (!host) fail('Only the host can do that');
    if (!game.mapVote || !mapTally(game).tie) fail('There is no tied vote to decide');
    if (a.reroll) { rerollMap(game); log(game, `🗺️ The vote was tied; ${p.name} chose a new map.`); }
    else { game.mapVote = null; log(game, `🗺️ The vote was tied; ${p.name} kept this map.`); }
    return;
  }
  // mapVote: value 1 (yes, or call a vote), -1 (no), 0 (take your vote back)
  const value = Number(a.value);
  if (![1, -1, 0].includes(value)) fail('Bad action');
  if (!game.mapVote) {
    if (value !== 1) fail('There is no vote right now');
    game.mapVote = { by: p.id, votes: {} };
    log(game, `🗳️ ${p.name} asks for a new map — vote yes or no.`);
  }
  if (value === 0) delete game.mapVote.votes[p.id]; else game.mapVote.votes[p.id] = value;
  const { yes, no, n } = mapTally(game);
  if (yes > n / 2) { rerollMap(game); log(game, `🗺️ The majority voted for a new map (${yes} of ${n}).`); }
  else if (no > n / 2) { game.mapVote = null; log(game, `🗺️ The majority kept this map (${no} of ${n} said no).`); }
  else if (!yes && !no) game.mapVote = null;
}

// History = the game as it stood at the start + every move since, so it can be replayed exactly.
function startHistory(game) {
  game.history = { start: historyStart(game), moves: [] };
}
// a copy of the game good for replaying from: no secrets (tokens), no chat log, no nested history
function historyStart(game) {
  const { history, log: _log, ...rest } = game;
  const copy = JSON.parse(JSON.stringify(rest));
  for (const p of copy.players) { p.token = ''; p.connected = false; }
  copy.log = []; copy.logSeq = 0;
  return copy;
}

// After the dice (and any raid): harvest, or the 7 — discards, then the bandit.
function afterRoll(game, sum) {
  const t = game.turn; const p = current(game);
  if (sum !== 7) { produce(game, sum); t.phase = 'main'; return; }
  game.pendingDiscard = {};
  for (const o of game.players) {
    const c = handCount(o.hand);
    if (c > discardLimit(game, o)) game.pendingDiscard[o.id] = Math.floor(c / 2);
  }
  t.afterRobber = 'main';
  const names = Object.keys(game.pendingDiscard).map((id) => P(game, id).name);
  if (names.length) { t.phase = 'discard'; log(game, `Bandits! ${names.join(', ')} must discard half their cards.`); }
  else afterDiscards(game);
}
// once everyone has discarded: the roller moves the bandit (crowns: not until the raiders have come once)
function afterDiscards(game) {
  const t = game.turn;
  if (CR.on(game) && !CR.banditFree(game)) {
    t.phase = t.afterRobber || 'main';
    log(game, '🏜️ The bandit stays in the dunes until the raiders first reach the island.');
    return;
  }
  t.phase = 'robber';
  log(game, `Bandits! ${current(game).name} moves the bandit.`);
}
const discardLimit = (game, p) => game.settings.discardLimit + (CR.on(game) ? CR.wallBonus(game, p) : 0);

function rollDice(game, pid, kind, fixed) {
  const d = fixed ? [fixed[0], fixed[1]] : [1 + rint(6), 1 + rint(6)];
  game.rollSeq = (game.rollSeq || 0) + 1;
  game.lastRoll = { id: game.rollSeq, d, by: pid, kind };
  if (kind === 'turn' && fixed) game.lastRoll.fixed = true;
  return d;
}

function orderRoll(game, p) {
  const o = game.order;
  if (!o.contenders.includes(p.id)) fail(o.round > 1 ? 'Only tied players re-roll' : 'You are not in this roll-off');
  if (o.rolls[p.id] !== undefined) fail('You already rolled');
  const d = rollDice(game, p.id, 'order');
  o.rolls[p.id] = d[0] + d[1];
  log(game, `🎲 ${p.name} rolled ${d[0] + d[1]} for turn order.`);
  if (o.contenders.some((id) => o.rolls[id] === undefined)) return;
  const best = Math.max(...o.contenders.map((id) => o.rolls[id]));
  const top = o.contenders.filter((id) => o.rolls[id] === best);
  if (top.length > 1) {
    o.contenders = top; o.round++;
    for (const id of top) delete o.rolls[id];
    log(game, `Tie at ${best} between ${top.map((id) => P(game, id).name).join(', ')} — roll again!`);
    return;
  }
  // winner goes first, then around the table
  const i = game.players.findIndex((x) => x.id === top[0]);
  game.players = game.players.slice(i).concat(game.players.slice(0, i));
  game.order.final = game.players.map((x) => x.id);
  game.turn.idx = 0; game.turn.phase = 'setup';
  log(game, `${game.players[0].name} goes first! Turn order: ${game.players.map((x) => x.name).join(' → ')}.`);
  log(game, `${game.players[0].name}, place your first settlement.`);
}

function resetToLobby(game) {
  for (const k of ['board', 'bank', 'deck', 'bandit', 'buildings', 'roads', 'longestHolder', 'armyHolder',
    'pendingDiscard', 'trade', 'winner', 'turn', 'rollStats', 'rollHistory', 'produced', 'order', 'lastRoll', 'rollSeq', 'lastSteal', 'history', 'cr']) delete game[k];
  for (const p of game.players) for (const k of ['hand', 'scrolls', 'guards', 'roadLen', 'pieces', 'seat', 'cr']) delete p[k];
  game.status = 'lobby';
  log(game, 'Back in the lobby — the host can start a new game.');
}

// ---------- rule helpers ----------

const P = (game, id) => game.players.find((p) => p.id === id);
const current = (game) => game.players[game.turn.idx];
const setupIdx = (pos, n) => (pos < n ? pos : 2 * n - 1 - pos);

function canPlaceVillage(game, pid, v, setup) {
  const V = game.board.vertices[v];
  if (!V || game.buildings[v] || CR.wardenAt(game, v)) return false;
  if (V.adj.some((a) => game.buildings[a])) return false;
  if (setup) return true;
  return V.edges.some((e) => game.roads[e] === pid);
}

function canPlaceRoad(game, pid, e) {
  const E = game.board.edges[e];
  if (!E || game.roads[e] !== undefined) return false;
  for (const x of [E.a, E.b]) {
    const b = game.buildings[x] || CR.wardenAt(game, x);
    if (b && b.owner === pid) return true;
    if (b) continue; // an opponent's building or warden blocks extension through this point
    if (game.board.vertices[x].edges.some((o) => o !== e && game.roads[o] === pid)) return true;
  }
  return false;
}

function validRoads(game, pid) {
  return game.board.edges.filter((E) => canPlaceRoad(game, pid, E.id)).map((E) => E.id);
}

function roadLength(game, pid) {
  const { board, roads, buildings } = game;
  const starts = new Set();
  for (const [e, o] of Object.entries(roads)) {
    if (o === pid) { starts.add(board.edges[e].a); starts.add(board.edges[e].b); }
  }
  const used = new Set();
  const dfs = (v) => {
    let m = 0;
    for (const e of board.vertices[v].edges) {
      if (roads[e] !== pid || used.has(e)) continue;
      const E = board.edges[e]; const o = E.a === v ? E.b : E.a;
      used.add(e);
      const ob = buildings[o] || CR.wardenAt(game, o);
      m = Math.max(m, 1 + (ob && ob.owner !== pid ? 0 : dfs(o)));
      used.delete(e);
    }
    return m;
  };
  let best = 0;
  for (const v of starts) best = Math.max(best, dfs(v));
  return best;
}

function updateLongest(game) {
  for (const p of game.players) p.roadLen = roadLength(game, p.id);
  const max = Math.max(...game.players.map((p) => p.roadLen));
  const holder = P(game, game.longestHolder);
  if (holder && holder.roadLen >= 5 && holder.roadLen === max) return;
  const top = game.players.filter((p) => p.roadLen === max && max >= 5);
  const next = top.length === 1 ? top[0].id : null;
  if (next !== game.longestHolder) {
    game.longestHolder = next;
    if (next) log(game, `🛤️ ${P(game, next).name} now has the Grand Route (${max} roads).`);
    else log(game, '🛤️ Nobody holds the Grand Route right now.');
  }
}

function updateArmy(game, p) {
  const holder = P(game, game.armyHolder);
  if (p.guards >= 3 && (!holder || p.guards > holder.guards) && game.armyHolder !== p.id) {
    game.armyHolder = p.id;
    log(game, `🛡️ ${p.name} now commands the Strongest Watch (${p.guards} guards).`);
  }
}

// Where a player's points come from. Hidden Monuments are only listed when `hidden` is true (their owner, or after the game).
function pointParts(game, p, hidden) {
  const out = [];
  const mine = Object.values(game.buildings).filter((b) => b.owner === p.id);
  const villages = mine.filter((b) => b.type === 'village').length; const towns = mine.length - villages;
  if (villages) out.push({ key: 'settlements', label: 'Settlements', count: villages, each: 1, n: villages });
  if (towns) out.push({ key: 'cities', label: 'Cities', count: towns, each: 2, n: 2 * towns });
  if (game.longestHolder === p.id) out.push({ key: 'route', label: 'Grand Route (longest road)', count: 1, each: 2, n: 2 });
  if (game.armyHolder === p.id) out.push({ key: 'watch', label: 'Strongest Watch (3+ Guards)', count: 1, each: 2, n: 2 });
  if (hidden) { const m = p.scrolls.filter((s) => s.type === 'vp').length; if (m) out.push({ key: 'monuments', label: 'Monuments (hidden)', count: m, each: 1, n: m }); }
  if (CR.on(game)) out.push(...CR.pointParts(game, p));
  return out;
}

function vp(game, p, hidden) {
  return pointParts(game, p, hidden).reduce((s, x) => s + x.n, 0);
}

function checkWin(game, pid) {
  if (game.status !== 'playing') return;
  const t = game.turn;
  if (t.phase === 'setup' || t.phase === 'builder' || current(game).id !== pid) return;
  const p = P(game, pid);
  const score = vp(game, p, true);
  if (score >= game.settings.vpTarget) {
    game.status = 'over'; game.winner = pid;
    log(game, `🏆 ${p.name} wins with ${score} victory points!`);
  }
}

function produce(game, sum) {
  const demand = {};
  for (const r of CARDS) demand[r] = {};
  const crowns = CR.on(game);
  for (const h of game.board.hexes) {
    if (h.num !== sum || h.id === game.bandit || h.res === 'desert') continue;
    for (const v of h.v) {
      const b = game.buildings[v];
      if (!b) continue;
      // crowns: a city next to forest/pasture/mountains takes 1 resource + 1 commodity instead of 2 resources
      const gains = crowns ? CR.cityYield(h.res, b.type) : [[h.res, b.type === 'town' ? 2 : 1]];
      for (const [card, n] of gains) demand[card][b.owner] = (demand[card][b.owner] || 0) + n;
    }
  }
  const got = {};
  for (const r of CARDS) {
    const entries = Object.entries(demand[r]);
    if (!entries.length) continue;
    const total = entries.reduce((s, [, n]) => s + n, 0);
    if (total > game.bank[r]) {
      if (entries.length === 1 && game.bank[r] > 0) entries[0][1] = game.bank[r];
      else { log(game, `The bank is short on ${RES_NAME[r]} — nobody receives it.`); continue; }
    }
    for (const [pid, n] of entries) {
      P(game, pid).hand[r] += n; game.bank[r] -= n;
      game.produced = game.produced || {};
      game.produced[pid] = (game.produced[pid] || 0) + n;
      (got[pid] = got[pid] || {})[r] = n;
    }
  }
  const parts = Object.entries(got).map(([pid, c]) => `${P(game, pid).name}: ${fmtRes(c)}`);
  log(game, parts.length ? `Harvest — ${parts.join(' · ')}` : 'Nobody harvests anything.', null, { type: 'harvest', gains: got });
  if (crowns) CR.afterHarvest(game, got);
}

// The thief points at one of the victim's face-down cards; the hand is shuffled so the pick is blind.
function stealFrom(game, thief, victim, pickIndex) {
  const cards = [];
  for (const r of CARDS) for (let i = 0; i < (victim.hand[r] || 0); i++) cards.push(r);
  if (!cards.length) return;
  shuffle(cards);
  const i = Number.isInteger(pickIndex) && pickIndex >= 0 && pickIndex < cards.length ? pickIndex : rint(cards.length);
  const r = cards[i];
  game.lastSteal = { id: (game.lastSteal ? game.lastSteal.id : 0) + 1, thief: thief.id, victim: victim.id, res: r };
  victim.hand[r]--; thief.hand[r]++;
  log(game, `🥷 ${thief.name} stole a card from ${victim.name}.`);
  log(game, `You stole 1 ${RES_NAME[r]} from ${victim.name}.`, thief.id);
  log(game, `${thief.name} stole 1 ${RES_NAME[r]} from you.`, victim.id);
}

// Friendly bandit: tiles touching an opponent with 2 or fewer public points are off-limits
// (unless that leaves nowhere to go).
function banditHexes(game, pid) {
  const all = game.board.hexes.filter((h) => h.id !== game.bandit);
  if (!game.settings.friendlyBandit) return all.map((h) => h.id);
  const protectedIds = new Set(game.players.filter((p) => p.id !== pid && vp(game, p, false) <= 2).map((p) => p.id));
  const ok = all.filter((h) => !h.v.some((v) => game.buildings[v] && protectedIds.has(game.buildings[v].owner)));
  return (ok.length ? ok : all).map((h) => h.id);
}

function rate(game, pid, r) {
  let best = 4;
  for (const [v, b] of Object.entries(game.buildings)) {
    if (b.owner !== pid) continue;
    const h = game.board.vertices[v].harbor;
    if (h === r) return 2;
    if (h === 'any') best = 3;
  }
  return CR.on(game) ? Math.min(best, CR.rate(game, pid, r)) : best;
}

function canAffordAny(p, game) {
  if (CR.on(game) && CR.canAffordAny(game, p)) return true;
  return (hasRes(p.hand, COST.road) && p.pieces.road > 0) ||
    (hasRes(p.hand, COST.village) && p.pieces.village > 0) ||
    (hasRes(p.hand, COST.town) && p.pieces.town > 0) ||
    (hasRes(p.hand, COST.scroll) && game.deck.length > 0);
}

function nextTurn(game) {
  const t = game.turn;
  t.idx = (t.idx + 1) % game.players.length;
  t.number++; t.phase = 'preroll'; t.dice = null; t.devPlayed = false;
  if (CR.on(game)) CR.newTurn(game);
  t.builder = null; t.builderQueue = []; t.freeRoads = 0; t.victims = [];
  game.trade = null;
  log(game, `— ${current(game).name}'s turn —`);
  checkWin(game, current(game).id);
}

function advanceBuilder(game) {
  const t = game.turn;
  while (t.builderQueue.length) {
    const id = t.builderQueue.shift();
    const p = P(game, id);
    if (p && canAffordAny(p, game)) { t.builder = id; t.phase = 'builder'; return; }
  }
  nextTurn(game);
}

function endTurn(game) {
  const t = game.turn;
  game.trade = null;
  if (game.settings.builderPhase && game.players.length > 2) {
    const n = game.players.length;
    t.builderQueue = [];
    for (let i = 1; i < n; i++) t.builderQueue.push(game.players[(t.idx + i) % n].id);
    advanceBuilder(game);
  } else nextTurn(game);
}

function parseCards(obj) {
  const out = emptyHand();
  if (!obj || typeof obj !== 'object') return out;
  for (const r of CARDS) {
    const n = Number(obj[r] || 0);
    if (!Number.isInteger(n) || n < 0 || n > 99) fail('Invalid card amounts');
    out[r] = n;
  }
  return out;
}

// ---------- actions ----------

// Gameplay moves that go into the history (chat, host hand-offs and lobby actions don't change the game).
const RECORDED = new Set(['roll', 'discard', 'moveBandit', 'steal', 'buildVillage', 'buildTown', 'buildRoad', 'skipRoads', 'buyScroll',
  'playScroll', 'bankTrade', 'proposeTrade', 'respondTrade', 'confirmTrade', 'cancelTrade', 'endTurn', 'builderDone', 'skip',
  'rerollMap', 'mapVote', 'mapDecide', ...CROWNS_MOVES]);
let depth = 0; // >0 while a move is being applied, so moves the game makes for someone (auto-play) aren't recorded twice

// Run fn with this game's seeded randomness, restoring whatever was active before.
function withRng(game, fn) {
  if (!game.rng) game.rng = { s: newSeed() }; // rooms saved before seeds existed
  const prev = CUR_RNG; CUR_RNG = game.rng; depth++;
  try { return fn(); } finally { depth--; CUR_RNG = prev; }
}

function act(game, pid, a) {
  const top = depth === 0;
  const record = top && game.status === 'playing' && game.history && a && RECORDED.has(a.type);
  let line = null;
  if (record) { try { line = encodeMove(game, pid, a); } catch { /* malformed input: the rules below reject it */ } }
  const result = withRng(game, () => actInner(game, pid, a));
  if (line) game.history.moves.push(line);
  return result;
}

// Switch the game to a fresh random seed (e.g. after the host downloads a save mid-game, so that file
// can't predict the coming dice). Recorded in the history so replays still follow the real rolls.
function reseed(game, seed = newSeed()) {
  if (!game.rng) game.rng = { s: 0 };
  game.rng.s = seed >>> 0;
  if (game.history) game.history.moves.push(`- reseed ${game.rng.s}`);
}

function actInner(game, pid, a) {
  const p = P(game, pid);
  if (!p) fail('You are not in this game');
  if (!a || typeof a.type !== 'string') fail('Bad action');

  if (a.type === 'chat') {
    const text = String(a.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 300);
    if (text) game.log.push({ id: ++game.logSeq, t: Date.now(), chat: true, from: pid, msg: text });
    return bump(game);
  }

  if (a.type === 'claimHost') {
    const host = P(game, game.hostId);
    if (host && host.connected) fail('The host is still here');
    game.hostId = pid;
    log(game, `${p.name} is now the host.`);
    return bump(game);
  }

  if (game.status === 'lobby') { lobbyAction(game, p, a); return bump(game); }
  if (a.type === 'rematch') {
    if (pid !== game.hostId) fail('Only the host can do that');
    resetToLobby(game); return bump(game);
  }
  if (game.status === 'over') fail('The game is over');

  const t = game.turn;
  const isCur = current(game).id === pid;
  const mustCur = (...phases) => {
    if (!isCur) fail("It's not your turn");
    if (phases.length && !phases.includes(t.phase)) fail(phaseHint(t.phase));
  };
  const canBuild = () => (isCur && t.phase === 'main') || (t.phase === 'builder' && t.builder === pid);

  if (a.type === 'rerollMap' || a.type === 'mapVote' || a.type === 'mapDecide') { mapAction(game, p, a); return bump(game); }

  if (CR.on(game) && CR.handles(a.type)) {
    CR.act(game, p, a, { isCur, mustCur, canBuild });
    checkWin(game, pid);
    return bump(game);
  }
  if (CR.on(game) && (a.type === 'buyScroll' || a.type === 'playScroll')) fail('Crowns & Raiders uses edicts instead of development cards');

  switch (a.type) {
    case 'roll': {
      if (t.phase === 'order') { orderRoll(game, p); break; }
      mustCur('preroll');
      const [d1, d2] = rollDice(game, pid, 'turn', CR.on(game) ? CR.takeFixedDice(game) : null); const sum = d1 + d2;
      t.dice = [d1, d2]; game.rollStats[sum]++;
      (game.rollHistory = game.rollHistory || []).push({ n: sum, d: [d1, d2], by: pid, turn: t.number });
      log(game, `🎲 ${p.name} rolled ${sum} (${d1}+${d2}).`);
      // crowns: the event die first (raiders advance or a gate hands out edicts); a raid may need choices first
      if (CR.on(game) && CR.rollEvent(game, p, d2, sum)) break;
      afterRoll(game, sum);
      break;
    }
    case 'discard': {
      if (t.phase !== 'discard' || !game.pendingDiscard[pid]) fail('You do not need to discard');
      const cards = parseCards(a.cards);
      if (handCount(cards) !== game.pendingDiscard[pid]) fail(`Choose exactly ${game.pendingDiscard[pid]} cards`);
      if (!hasRes(p.hand, cards)) fail("You don't have those cards");
      move(p.hand, game.bank, cards);
      log(game, `${p.name} discarded ${handCount(cards)} cards.`);
      delete game.pendingDiscard[pid];
      if (!Object.keys(game.pendingDiscard).length) afterDiscards(game);
      break;
    }
    case 'moveBandit': {
      mustCur('robber');
      if (CR.on(game) && !CR.banditFree(game)) fail('The bandit cannot move until the raiders first reach the island');
      const h = game.board.hexes[a.hex];
      if (!h) fail('Pick a tile');
      if (h.id === game.bandit) fail('The bandit must move to a different tile');
      if (!banditHexes(game, pid).includes(h.id)) fail('Friendly bandit: that tile touches a player with 2 or fewer points');
      game.bandit = h.id;
      log(game, `${p.name} moved the bandit.`);
      const victims = [...new Set(h.v.map((v) => game.buildings[v]).filter(Boolean).map((b) => b.owner))]
        .filter((id) => id !== pid && handCount(P(game, id).hand) > 0);
      if (victims.length) { t.victims = victims; t.phase = 'steal'; }
      else t.phase = t.afterRobber;
      break;
    }
    case 'steal': {
      mustCur('steal');
      if (!t.victims.includes(a.victim)) fail('You cannot steal from that player');
      stealFrom(game, p, P(game, a.victim), a.card);
      t.victims = []; t.phase = t.afterRobber;
      break;
    }
    case 'buildVillage': {
      const v = Number(a.vertex);
      if (t.phase === 'setup') {
        mustCur('setup');
        if (t.setup.need !== 'village') fail('Place a road next to your settlement');
        if (!canPlaceVillage(game, pid, v, true)) fail("You can't build there (too close to another settlement?)");
        const asCity = CR.on(game) && t.setup.pos >= game.players.length; // crowns: the second placement is a city
        game.buildings[v] = { owner: pid, type: asCity ? 'town' : 'village' };
        if (asCity) p.pieces.town--; else p.pieces.village--;
        log(game, `${p.name} placed a ${asCity ? 'city' : 'settlement'}.`);
        if (t.setup.pos >= game.players.length) {
          const got = emptyHand();
          for (const hid of game.board.vertices[v].hexes) {
            const h = game.board.hexes[hid];
            if (h.res !== 'desert' && game.bank[h.res] > 0) { got[h.res]++; game.bank[h.res]--; p.hand[h.res]++; }
          }
          log(game, `${p.name} collects ${fmtRes(got)}.`, null, { type: 'harvest', gains: { [p.id]: got }, setup: true });
        }
        t.setup.need = 'road'; t.setup.last = v;
        break;
      }
      if (!canBuild()) fail(phaseHint(t.phase));
      if (p.pieces.village <= 0) fail('You have no settlements left');
      if (!hasRes(p.hand, COST.village)) fail('Not enough resources for a settlement');
      if (!canPlaceVillage(game, pid, v, false)) fail("You can't build a settlement there");
      move(p.hand, game.bank, COST.village);
      game.buildings[v] = { owner: pid, type: 'village' }; p.pieces.village--;
      log(game, `🏠 ${p.name} built a settlement.`);
      updateLongest(game);
      break;
    }
    case 'buildTown': {
      if (!canBuild()) fail(phaseHint(t.phase));
      const v = Number(a.vertex); const b = game.buildings[v];
      if (!b || b.owner !== pid || b.type !== 'village') fail('Cities are built on top of your own settlements');
      if (p.pieces.town <= 0) fail('You have no cities left');
      if (!hasRes(p.hand, COST.town)) fail('Not enough resources for a city');
      move(p.hand, game.bank, COST.town);
      b.type = 'town'; p.pieces.town--; p.pieces.village++;
      log(game, `🏰 ${p.name} upgraded a settlement to a city.`);
      break;
    }
    case 'buildRoad': {
      const e = Number(a.edge); const E = game.board.edges[e];
      if (!E) fail('Pick a road spot');
      if (t.phase === 'setup') {
        mustCur('setup');
        if (t.setup.need !== 'road') fail('Place a settlement first');
        if (game.roads[e] !== undefined || (E.a !== t.setup.last && E.b !== t.setup.last)) fail('The road must touch the settlement you just placed');
        game.roads[e] = pid; p.pieces.road--;
        t.setup.pos++;
        const n = game.players.length;
        if (t.setup.pos >= 2 * n) {
          t.idx = 0; t.number = 1; t.phase = 'preroll';
          log(game, `Setup complete! ${current(game).name} rolls first.`);
        } else {
          t.idx = setupIdx(t.setup.pos, n); t.setup.need = 'village'; t.setup.last = null;
          log(game, `${current(game).name}, place a settlement.`);
        }
        updateLongest(game);
        break;
      }
      if (t.phase === 'roadbuilding') {
        mustCur('roadbuilding');
        if (!canPlaceRoad(game, pid, e)) fail("You can't build a road there");
        game.roads[e] = pid; p.pieces.road--; t.freeRoads--;
        log(game, `${p.name} built a free road.`);
        updateLongest(game);
        if (t.freeRoads <= 0 || p.pieces.road <= 0 || !validRoads(game, pid).length) t.phase = t.afterRoads;
        break;
      }
      if (!canBuild()) fail(phaseHint(t.phase));
      if (p.pieces.road <= 0) fail('You have no roads left');
      if (!hasRes(p.hand, COST.road)) fail('Not enough resources for a road');
      if (!canPlaceRoad(game, pid, e)) fail("You can't build a road there");
      move(p.hand, game.bank, COST.road);
      game.roads[e] = pid; p.pieces.road--;
      log(game, `${p.name} built a road.`);
      updateLongest(game);
      break;
    }
    case 'skipRoads': {
      mustCur('roadbuilding');
      t.freeRoads = 0; t.phase = t.afterRoads;
      break;
    }
    case 'buyScroll': {
      if (!canBuild()) fail(phaseHint(t.phase));
      if (!game.deck.length) fail('No development cards left');
      if (!hasRes(p.hand, COST.scroll)) fail('Not enough resources for a development card');
      move(p.hand, game.bank, COST.scroll);
      const type = game.deck.pop();
      p.scrolls.push({ type, bought: t.number });
      log(game, `📜 ${p.name} bought a development card.`);
      log(game, `Your new development card: ${SCROLL_NAME[type]}.`, pid);
      break;
    }
    case 'playScroll': {
      mustCur('preroll', 'main');
      if (t.devPlayed) fail('You can only play one development card per turn');
      const kind = a.kind;
      if (kind === 'vp' || !SCROLL_NAME[kind]) fail('That card cannot be played');
      const i = p.scrolls.findIndex((s) => s.type === kind && s.bought < t.number);
      if (i < 0) fail(p.scrolls.some((s) => s.type === kind) ? "You can't play a development card on the turn you bought it" : "You don't have that card");
      if (kind === 'plenty') {
        if (!RES.includes(a.res) || !RES.includes(a.res2)) fail('Pick two resources');
        const need = emptyHand(); need[a.res]++; need[a.res2]++;
        if (!hasRes(game.bank, need)) fail('The bank does not have those');
        p.scrolls.splice(i, 1); t.devPlayed = true;
        move(game.bank, p.hand, need);
        log(game, `📜 ${p.name} played Bounty and took ${fmtRes(need)}.`);
        break;
      }
      if (kind === 'monopoly') {
        if (!RES.includes(a.res)) fail('Pick a resource');
        p.scrolls.splice(i, 1); t.devPlayed = true;
        let total = 0;
        for (const o of game.players) if (o.id !== pid) { total += o.hand[a.res]; p.hand[a.res] += o.hand[a.res]; o.hand[a.res] = 0; }
        log(game, `📜 ${p.name} played Embargo and seized all ${RES_NAME[a.res]} (${total}).`);
        break;
      }
      p.scrolls.splice(i, 1); t.devPlayed = true;
      if (kind === 'guard') {
        p.guards++;
        log(game, `📜 ${p.name} played a Guard.`);
        updateArmy(game, p);
        t.afterRobber = t.phase; t.phase = 'robber';
      } else if (kind === 'route') {
        log(game, `📜 ${p.name} played Road Crew.`);
        t.freeRoads = Math.min(2, p.pieces.road);
        if (t.freeRoads > 0 && validRoads(game, pid).length) { t.afterRoads = t.phase; t.phase = 'roadbuilding'; }
      }
      break;
    }
    case 'bankTrade': {
      // Same shape as a player trade: { give: {res: n}, get: {res: n} }. Each resource you give must come in
      // whole lots at your rate for it (4, or 3/2 at a harbor); every lot buys exactly one card.
      mustCur('main');
      let give, get;
      if (typeof a.give === 'string') { // older single-card form: give one lot of a.give for 1 a.get
        if (!CARDS.includes(a.give) || !CARDS.includes(a.get)) fail('Pick two different cards');
        give = emptyHand(); give[a.give] = rate(game, pid, a.give);
        get = emptyHand(); get[a.get] = 1;
      } else { give = parseCards(a.give); get = parseCards(a.get); }
      if (!handCount(give) || !handCount(get)) fail('Choose what to give and what to take');
      if (CARDS.some((r) => give[r] && get[r])) fail("Don't put the same card on both sides");
      let lots = 0;
      for (const r of CARDS) {
        if (!give[r]) continue;
        const k = rate(game, pid, r);
        if (give[r] % k) fail(`${RES_NAME[r]} trades in groups of ${k}`);
        lots += give[r] / k;
      }
      if (handCount(get) !== lots) fail(`That gives you ${lots} card${lots === 1 ? '' : 's'} to take — you picked ${handCount(get)}`);
      if (!hasRes(p.hand, give)) fail("You don't have those cards");
      for (const r of CARDS) if (get[r] > (game.bank[r] || 0)) fail(`The bank only has ${game.bank[r] || 0} ${RES_NAME[r]}`);
      move(p.hand, game.bank, give); move(game.bank, p.hand, get);
      log(game, `🏦 ${p.name} traded ${fmtRes(give)} to the bank for ${fmtRes(get)}.`);
      break;
    }
    case 'proposeTrade': {
      mustCur('main');
      const give = parseCards(a.give); const get = parseCards(a.get);
      if (!handCount(give) || !handCount(get)) fail('A trade needs cards on both sides');
      if (CARDS.some((r) => give[r] && get[r])) fail("Don't put the same card on both sides");
      if (!hasRes(p.hand, give)) fail("You don't have the cards you're offering");
      game.trade = { id: rid(4), from: pid, give, get, responses: {}, counters: {} };
      log(game, `🤝 ${p.name} offers ${fmtRes(give)} for ${fmtRes(get)}.`);
      break;
    }
    case 'respondTrade': {
      const tr = game.trade;
      if (!tr || tr.id !== a.id) fail('That offer is no longer open');
      if (tr.from === pid) fail('You made this offer');
      tr.counters = tr.counters || {};
      if (a.counter) {
        // counter terms from the responder's side: what they give / what they want
        const give = parseCards(a.counter.give); const get = parseCards(a.counter.get);
        if (!handCount(give) || !handCount(get)) fail('A counter-offer needs cards on both sides');
        if (CARDS.some((r) => give[r] && get[r])) fail("Don't put the same card on both sides");
        if (!hasRes(p.hand, give)) fail("You don't have the cards you're offering");
        tr.counters[pid] = { give, get }; tr.responses[pid] = 'counter';
        log(game, `🤝 ${p.name} counters: ${fmtRes(give)} for ${fmtRes(get)}.`);
        break;
      }
      if (a.accept && !hasRes(p.hand, tr.get)) fail("You don't have the cards they want");
      delete tr.counters[pid];
      tr.responses[pid] = a.accept ? 'accept' : 'decline';
      break;
    }
    case 'confirmTrade': {
      const tr = game.trade;
      if (!tr || tr.from !== pid) fail('No open offer');
      const o = P(game, a.with);
      const resp = o && tr.responses[o.id];
      if (resp !== 'accept' && resp !== 'counter') fail('That player has not accepted');
      // a counter swaps in the responder's terms
      const give = resp === 'counter' ? tr.counters[o.id].get : tr.give;
      const get = resp === 'counter' ? tr.counters[o.id].give : tr.get;
      if (!hasRes(p.hand, give)) fail("You don't have the cards for that trade");
      if (!hasRes(o.hand, get)) fail(`${o.name} no longer has those cards`);
      move(p.hand, o.hand, give); move(o.hand, p.hand, get);
      log(game, `🤝 ${p.name} traded ${fmtRes(give)} with ${o.name} for ${fmtRes(get)}.`);
      game.trade = null;
      break;
    }
    case 'cancelTrade': {
      if (game.trade && game.trade.from === pid) game.trade = null;
      break;
    }
    case 'endTurn': {
      mustCur('main');
      endTurn(game);
      break;
    }
    case 'builderDone': {
      if (t.phase !== 'builder' || t.builder !== pid) fail('It is not your build phase');
      advanceBuilder(game);
      break;
    }
    case 'skip': {
      // Unstick the game when someone is away. Host can always; others only if the stalled player is offline.
      const stalled = stalledPlayers(game);
      const allowed = pid === game.hostId || stalled.every((id) => !P(game, id).connected);
      if (!allowed) fail('Only the host can skip a connected player');
      if (!stalled.length || stalled.includes(pid)) fail('Nothing to skip');
      autoPlay(game);
      break;
    }
    default: fail('Unknown action');
  }
  checkWin(game, pid);
  return bump(game);
}

function stalledPlayers(game) {
  const t = game.turn;
  if (t.phase === 'order') return game.order.contenders.filter((id) => game.order.rolls[id] === undefined);
  if (t.phase === 'discard') return Object.keys(game.pendingDiscard);
  if (t.phase === 'raid' && game.cr) return Object.keys(game.cr.pendingRaid);
  if (t.phase === 'builder') return [t.builder];
  return [current(game).id];
}

function autoPlay(game) {
  const t = game.turn; const cur = current(game);
  log(game, `⏭️ Skipping ahead for ${stalledPlayers(game).map((id) => P(game, id).name).join(', ')}.`);
  switch (t.phase) {
    case 'discard':
      for (const [id, n] of Object.entries(game.pendingDiscard)) {
        const o = P(game, id);
        for (let i = 0; i < n; i++) {
          const have = CARDS.filter((r) => o.hand[r] > 0);
          const r = have[rint(have.length)]; o.hand[r]--; game.bank[r]++;
        }
      }
      game.pendingDiscard = {}; afterDiscards(game);
      return;
    case 'builder': return advanceBuilder(game);
    case 'raid': return CR.autoRaid(game);
    case 'preroll': return act(game, cur.id, { type: 'roll' });
    case 'order': for (const id of stalledPlayers(game)) orderRoll(game, P(game, id)); return;
    case 'robber': {
      const ids = banditHexes(game, cur.id);
      const land = ids.filter((id) => game.board.hexes[id].res !== 'desert');
      const opts = land.length ? land : ids;
      return act(game, cur.id, { type: 'moveBandit', hex: opts[rint(opts.length)] });
    }
    case 'steal': return act(game, cur.id, { type: 'steal', victim: t.victims[0] });
    case 'roadbuilding': t.freeRoads = 0; t.phase = t.afterRoads; if (t.phase === 'main') endTurn(game); return;
    case 'main': return endTurn(game);
    case 'setup': {
      const pid = cur.id;
      if (t.setup.need === 'village') {
        const opts = game.board.vertices.filter((V) => canPlaceVillage(game, pid, V.id, true));
        act(game, pid, { type: 'buildVillage', vertex: opts[rint(opts.length)].id });
      }
      const last = game.board.vertices[t.setup.last];
      const e = last.edges.find((x) => game.roads[x] === undefined);
      return act(game, pid, { type: 'buildRoad', edge: e });
    }
  }
}

function lobbyAction(game, p, a) {
  const host = p.id === game.hostId;
  switch (a.type) {
    case 'setColor':
      if (!COLORS.includes(a.color)) fail('Unknown color');
      if (game.players.some((o) => o.color === a.color && o.id !== p.id)) fail('Color taken');
      p.color = a.color; break;
    case 'settings': {
      if (!host) fail('Only the host can change settings — use Suggest instead');
      Object.assign(game.settings, cleanSettings(a.settings));
      break;
    }
    // Non-hosts propose settings; everyone votes; the host applies or dismisses (votes never apply anything).
    case 'suggest': {
      if (host) fail('As host, just change the setting directly');
      const changes = cleanSettings(a.settings);
      for (const k of Object.keys(changes)) if (changes[k] === game.settings[k]) delete changes[k];
      if (!Object.keys(changes).length) fail('That matches the current settings');
      game.suggestions = (game.suggestions || []).filter((x) => x.by !== p.id); // one open suggestion each
      game.suggestions.push({ id: rid(4), by: p.id, changes, votes: { [p.id]: 1 }, at: Date.now() });
      log(game, `💡 ${p.name} suggested: ${describeChanges(game, changes)}.`);
      break;
    }
    case 'vote': {
      const sg = (game.suggestions || []).find((x) => x.id === a.id);
      if (!sg) fail('That suggestion is gone');
      const val = Number(a.value);
      if (val === 1 || val === -1) sg.votes[p.id] = val; else delete sg.votes[p.id];
      break;
    }
    case 'applySuggestion':
    case 'dismissSuggestion': {
      const i = (game.suggestions || []).findIndex((x) => x.id === a.id);
      if (i < 0) fail('That suggestion is gone');
      const sg = game.suggestions[i];
      if (a.type === 'applySuggestion') {
        if (!host) fail('Only the host can apply suggestions');
        Object.assign(game.settings, sg.changes);
        log(game, `✅ ${p.name} applied ${P(game, sg.by)?.name || 'someone'}'s suggestion: ${describeChanges(game, sg.changes)}.`);
      } else {
        if (!host && sg.by !== p.id) fail('Only the host or the person who suggested it can remove it');
        log(game, sg.by === p.id ? `${p.name} withdrew their suggestion.` : `${p.name} dismissed ${P(game, sg.by)?.name || 'someone'}'s suggestion.`);
      }
      game.suggestions.splice(i, 1);
      break;
    }
    case 'kick': {
      if (!host) fail('Only the host can remove players');
      if (a.pid === p.id) fail("You can't remove yourself");
      const i = game.players.findIndex((o) => o.id === a.pid);
      if (i >= 0) { log(game, `${game.players[i].name} was removed.`); game.players.splice(i, 1); }
      break;
    }
    case 'leave': {
      game.players = game.players.filter((o) => o.id !== p.id);
      log(game, `${p.name} left the room.`);
      if (game.hostId === p.id) {
        const next = game.players.find((o) => o.connected) || game.players[0];
        game.hostId = next ? next.id : null;
        if (next) log(game, `${next.name} is now the host.`);
      }
      break;
    }
    case 'start':
      if (!host) fail('Only the host can start');
      startGame(game); game.suggestions = []; break;
    default: fail('The game has not started yet');
  }
  pruneSuggestions(game);
}

// Keep only valid settings keys, clamped to their allowed values.
function cleanSettings(s) {
  s = s || {};
  const out = {};
  if (['classic', 'crowns'].includes(s.mode)) {
    out.mode = s.mode;
    if (s.vpTarget === undefined) out.vpTarget = s.mode === 'crowns' ? 13 : 10; // each mode's usual target
  }
  if (s.vpTarget !== undefined) out.vpTarget = Math.max(5, Math.min(20, Math.round(Number(s.vpTarget)) || 10));
  if (s.discardLimit !== undefined) out.discardLimit = Math.max(5, Math.min(12, Math.round(Number(s.discardLimit)) || 7));
  if (s.builderPhase !== undefined) out.builderPhase = !!s.builderPhase;
  if (s.friendlyBandit !== undefined) out.friendlyBandit = !!s.friendlyBandit;
  if (s.turnTimer !== undefined && [0, 60, 90, 120, 180].includes(Number(s.turnTimer))) out.turnTimer = Number(s.turnTimer);
  if (['auto', 'small', 'large'].includes(s.boardSize)) out.boardSize = s.boardSize;
  if (s.firstRaid !== undefined && CR.FIRST_RAID.includes(Number(s.firstRaid))) out.firstRaid = Number(s.firstRaid);
  return out;
}

const SETTING_LABEL = {
  mode: (v) => (v === 'crowns' ? 'Crowns & Raiders mode' : 'classic mode'),
  vpTarget: (v) => `points to win ${v}`,
  boardSize: (v) => `island ${v}`,
  discardLimit: (v) => `hand limit ${v}`,
  builderPhase: (v) => `builder phase ${v ? 'on' : 'off'}`,
  turnTimer: (v) => `turn timer ${v ? `${v / 60} min` : 'off'}`,
  friendlyBandit: (v) => `friendly bandit ${v ? 'on' : 'off'}`,
  firstRaid: (v) => `first raid after ${v} ship steps`,
};
function describeChanges(game, changes) {
  return Object.entries(changes).map(([k, v]) => SETTING_LABEL[k](v)).join(', ');
}

// Drop suggestion parts the host already made true, and anything from players who left.
function pruneSuggestions(game) {
  const ids = new Set(game.players.map((p) => p.id));
  game.suggestions = (game.suggestions || []).filter((sg) => {
    if (!ids.has(sg.by)) return false;
    for (const k of Object.keys(sg.changes)) if (sg.changes[k] === game.settings[k]) delete sg.changes[k];
    for (const id of Object.keys(sg.votes)) if (!ids.has(id)) delete sg.votes[id];
    return Object.keys(sg.changes).length > 0;
  });
}

function phaseHint(phase) {
  return {
    order: 'Everyone is rolling for turn order',
    setup: 'Finish placing your starting pieces',
    preroll: 'Roll the dice first',
    discard: 'Waiting for players to discard',
    raid: 'Waiting for players to choose which city the raiders sack',
    robber: 'Move the bandit first',
    steal: 'Choose who to steal from first',
    roadbuilding: 'Place your free roads first',
    builder: 'Only the current builder can act right now',
    main: "You can't do that right now",
  }[phase] || "You can't do that right now";
}

function bump(game) {
  game.version++; game.updatedAt = Date.now();
  // Turn timer: every time the game starts waiting on someone new, their clock restarts.
  const secs = game.status === 'playing' ? game.settings.turnTimer || 0 : 0;
  if (!secs) { game.deadline = null; game.stallKey = null; return game; }
  const t = game.turn;
  const key = `${t.number}:${t.phase}:${t.setup ? t.setup.pos + t.setup.need : ''}:${stalledPlayers(game).join(',')}`;
  if (key !== game.stallKey) {
    game.stallKey = key;
    const long = t.phase === 'main' || t.phase === 'setup';
    game.deadlineTotal = 1000 * (long ? secs : Math.min(secs, 60));
    game.deadline = Date.now() + game.deadlineTotal;
  }
  return game;
}

// Called by the server about once a second; auto-plays for whoever ran out of time.
function tick(game, now = Date.now()) {
  if (game.status !== 'playing' || !game.deadline || now < game.deadline) return false;
  if (game.history) game.history.moves.push('- timeout');
  timeout(game);
  return true;
}

// What happens when the turn timer runs out (also used to replay a recorded "- timeout").
function timeout(game) {
  game.stallKey = null;
  withRng(game, () => {
    log(game, '⏱️ Time ran out.');
    autoPlay(game);
  });
  bump(game);
}

function setConnected(game, pid, on) {
  const p = P(game, pid);
  if (p && p.connected !== on) { p.connected = on; return true; }
  return false;
}

// ---------- per-player view (hides other players' hands and scrolls) ----------

function viewFor(game, pid) {
  const me = P(game, pid);
  const base = {
    code: game.code, status: game.status, hostId: game.hostId, me: pid, version: game.version,
    settings: game.settings, colors: COLORS, maxPlayers: MAX_PLAYERS,
    log: game.log.filter((l) => !l.to || l.to === pid).slice(-120).map(({ to, ...l }) => (to ? { ...l, private: true } : l)),
  };
  if (game.status === 'lobby') {
    return {
      ...base,
      players: game.players.map((p) => ({ id: p.id, name: p.name, color: p.color, connected: p.connected })),
      suggestions: game.suggestions || [],
    };
  }
  const t = game.turn; const over = game.status === 'over';
  const cur = current(game);
  const players = game.players.map((p) => ({
    id: p.id, name: p.name, color: p.color, connected: p.connected,
    cards: handCount(p.hand), scrolls: p.scrolls.length, guards: p.guards, roadLen: p.roadLen,
    pieces: p.pieces, vp: vp(game, p, false),
    ...(CR.on(game) ? { cr: CR.publicPlayer(game, p) } : {}),
    vpTotal: p.id === pid || over ? vp(game, p, true) : null,
    points: pointParts(game, p, p.id === pid || over),
    hand: over ? p.hand : undefined,
    longest: game.longestHolder === p.id, army: game.armyHolder === p.id,
  }));
  const hints = { villages: [], roads: [], towns: [], hexes: [], ...(CR.on(game) ? { wardenSpots: [], wallSpots: [], raidCities: [], capitalCities: [], myWardens: [] } : {}) };
  if (me && CR.on(game) && game.status === 'playing') Object.assign(hints, CR.hints(game, pid));
  if (me && game.status === 'playing') {
    const myTurn = cur.id === pid;
    if (t.phase === 'robber' && myTurn) hints.hexes = banditHexes(game, pid);
    const building = (myTurn && t.phase === 'main') || (t.phase === 'builder' && t.builder === pid);
    if (t.phase === 'setup' && myTurn) {
      if (t.setup.need === 'village') hints.villages = game.board.vertices.filter((V) => canPlaceVillage(game, pid, V.id, true)).map((V) => V.id);
      else hints.roads = game.board.vertices[t.setup.last].edges.filter((e) => game.roads[e] === undefined);
    } else if ((t.phase === 'roadbuilding' && myTurn) || building) {
      hints.roads = validRoads(game, pid);
      if (building) {
        hints.villages = game.board.vertices.filter((V) => canPlaceVillage(game, pid, V.id, false)).map((V) => V.id);
        hints.towns = Object.entries(game.buildings).filter(([, b]) => b.owner === pid && b.type === 'village').map(([v]) => Number(v));
      }
    }
  }
  return {
    ...base, players, board: game.board, bank: game.bank, deckCount: game.deck.length,
    buildings: game.buildings, roads: game.roads, bandit: game.bandit,
    longestHolder: game.longestHolder, armyHolder: game.armyHolder, winner: game.winner,
    rollStats: game.rollStats, rollHistory: game.rollHistory || [], produced: game.produced || {}, cost: COST, scrollNames: SCROLL_NAME,
    turn: {
      idx: t.idx, number: t.number, phase: t.phase, current: cur.id, dice: t.dice, devPlayed: t.devPlayed,
      freeRoads: t.freeRoads, victims: t.victims, builder: t.builder, event: t.event || null,
      setupNeed: t.phase === 'setup' ? t.setup.need : null,
      setupRound: t.phase === 'setup' ? (t.setup.pos < game.players.length ? 1 : 2) : null,
    },
    pendingDiscard: game.pendingDiscard, trade: game.trade,
    map: { canReroll: canRerollMap(game), seq: game.mapSeq || 0, vote: game.mapVote && canRerollMap(game) ? { ...game.mapVote, ...mapTally(game) } : null }, stalled: game.status === 'playing' ? stalledPlayers(game) : [],
    order: game.order ? { contenders: game.order.contenders, rolls: game.order.rolls, round: game.order.round } : null,
    lastRoll: game.lastRoll || null,
    lastSteal: game.lastSteal ? {
      id: game.lastSteal.id, thief: game.lastSteal.thief, victim: game.lastSteal.victim,
      res: [game.lastSteal.thief, game.lastSteal.victim].includes(pid) ? game.lastSteal.res : null,
    } : null,
    deadlineIn: game.status === 'playing' && game.deadline ? Math.max(0, game.deadline - Date.now()) : null,
    deadlineTotal: game.deadline ? game.deadlineTotal || null : null,
    hand: me ? me.hand : null,
    handLimit: me ? discardLimit(game, me) : null,
    myScrolls: me ? me.scrolls.map((s) => ({ type: s.type, fresh: s.bought >= t.number })) : [],
    rates: me ? Object.fromEntries(CARDS.map((r) => [r, rate(game, pid, r)])) : null,
    hints,
    ...(CR.on(game) ? { crowns: CR.view(game, pid, hints) } : {}),
  };
}

CR.bind({ log, P, fail, rint, shuffle, handCount, hasRes, move, fmtRes, emptyHand, current, updateLongest, stealFrom, banditHexes,
  afterRoll, canPlaceVillage, canPlaceRoad, validRoads, vp, RES, CARDS, RES_NAME, COST, PIECES });

module.exports = { createGame, addPlayer, act, viewFor, setConnected, tick, timeout, reseed, newSeed, historyStart, RES, COM, CARDS, COST, MAX_PLAYERS, PIECES, COLORS,
  _internal: { roadLength, buildBoard, boardConfig, canPlaceRoad, canPlaceVillage, validRoads, handCount, withRng, autoPlay, bump } };
