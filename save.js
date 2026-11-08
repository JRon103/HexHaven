'use strict';
// Hexhaven save files: a readable snapshot of the game (what you load, resume and edit) plus its history
// (the starting snapshot, the starting seed and every move), which replays the game exactly.
// Shared by the server and the browser's replay viewer.
const crypto = require('crypto');
const G = require('./game');
const CR = require('./crowns');
const { RES, TILE, TILE_BACK, geometry, cards, uncards, decodeMove } = require('./notation');

const FORMAT = 1;
const ABOUT = 'Hexhaven save file. Seats are permanent numbers (seat 1 = first player listed); "turnOrder" is the order they play in. '
  + 'Tiles are listed row by row, top to bottom: Wo wood, Cl clay, Fl fleece, Wh wheat, Ir iron, De dunes, followed by the dice number. '
  + 'Positions are "row.tile" counted from 1, plus a corner (N NE SE S SW NW) or a side (NE E SE SW W NW), e.g. "3.2SE". '
  + 'Cards are written like "Wo1 Cl2 Wh3" (Crowns & Raiders adds Pa parchment, Li linen, Si silver). A development card ending in * was bought this turn. '
  + 'Leave "seed" empty ("") to get fresh random dice; keep it to roll exactly the same dice again. '
  + 'Editing the snapshot is fine: the history then no longer matches, and the game continues from your edited version.';
const TILE_ROWS = { 2: [3, 4, 5, 4, 3], 3: [4, 5, 6, 7, 6, 5, 4] };

function fail(msg) { const e = new Error(msg); e.user = true; throw e; }
const rid = (n) => crypto.randomBytes(n).toString('hex');
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------- game → readable snapshot ----------
function encodeSnapshot(game) {
  const geo = geometry(game.board);
  const seatOf = (pid) => { const p = game.players.find((x) => x.id === pid); return p ? p.seat : null; };
  const bySeat = [...game.players].sort((a, b) => a.seat - b.seat);
  const t = game.turn;
  const pieces = {};
  for (const p of bySeat) pieces[p.seat] = { settlements: [], cities: [], roads: [] };
  for (const [v, b] of Object.entries(game.buildings)) pieces[seatOf(b.owner)][b.type === 'town' ? 'cities' : 'settlements'].push(geo.corner(Number(v)));
  for (const [e, o] of Object.entries(game.roads)) pieces[seatOf(o)].roads.push(geo.side(Number(e)));
  for (const k in pieces) for (const list of Object.values(pieces[k])) list.sort();
  const seatMap = (obj) => Object.fromEntries(Object.entries(obj || {}).map(([pid, n]) => [seatOf(pid), n]));
  const snap = {
    status: game.status,
    settings: game.settings,
    host: seatOf(game.hostId),
    players: bySeat.map((p) => ({ seat: p.seat, name: p.name, color: p.color, hand: cards(p.hand),
      devCards: p.scrolls.map((s) => s.type + (s.bought >= t.number ? '*' : '')), guardsPlayed: p.guards })),
    turnOrder: game.players.map((p) => p.seat),
    map: {
      size: game.board.radius,
      tiles: geo.rows.map((row) => row.map((h) => TILE[h.res] + (h.num || '')).join(' ')),
      harbors: game.board.harbors.map((hb) => `${hb.type === 'any' ? '3:1' : '2:1 ' + hb.type} @ ${geo.side(hb.edge)}`),
      bandit: geo.tile(game.bandit),
    },
    pieces,
    bank: cards(game.bank),
    devDeck: game.deck.join(' '),
    turn: {
      number: t.number, player: seatOf(game.players[t.idx].id), phase: t.phase, dice: t.dice, devCardPlayed: t.devPlayed,
      ...(t.phase === 'setup' ? { setup: { step: t.setup.pos, need: t.setup.need === 'village' ? 'settlement' : 'road', last: t.setup.last === null ? null : geo.corner(t.setup.last) } } : {}),
      ...(t.freeRoads ? { freeRoads: t.freeRoads } : {}), ...(t.afterRoads ? { afterRoads: t.afterRoads } : {}),
      ...(t.victims && t.victims.length ? { victims: t.victims.map(seatOf) } : {}), ...(t.afterRobber ? { afterRobber: t.afterRobber } : {}),
      ...(t.builder ? { builder: seatOf(t.builder), builderQueue: t.builderQueue.map(seatOf) } : {}),
    },
    ...(t.phase === 'order' && game.order ? { rollOff: { waiting: game.order.contenders.map(seatOf), rolls: seatMap(game.order.rolls), round: game.order.round } } : {}),
    awards: { longestRoad: seatOf(game.longestHolder), largestArmy: seatOf(game.armyHolder) },
    pendingDiscard: seatMap(game.pendingDiscard),
    rolls: game.rollHistory.map((r) => `${seatOf(r.by)}:${r.d[0]}+${r.d[1]}`).join(' '),
    harvested: seatMap(game.produced),
    winner: seatOf(game.winner),
  };
  if (game.cr) {
    const t2 = game.turn;
    snap.turn = { ...snap.turn, ...(t2.event ? { event: t2.event } : {}) };
    snap.crowns = encodeCrowns(game, geo, seatOf, bySeat);
  }
  return snap;
}

// Crowns & Raiders: everything the mode adds, written per seat with board positions.
// A warden is "3.2SE rank 2 active" plus the turns it was built / activated / promoted (rules limit those per turn).
function encodeCrowns(game, geo, seatOf, bySeat) {
  const cr = game.cr;
  const per = {};
  for (const p of bySeat) {
    per[p.seat] = {
      improvements: { ...p.cr.improve }, edicts: p.cr.edicts.map((e) => `${e.type}@${e.got}`),
      defender: p.cr.defender, edictPoints: p.cr.edictVP, freePicks: p.cr.freePicks, edictPicks: p.cr.edictPicks,
      walls: [], wardens: [],
    };
  }
  for (const [v, o] of Object.entries(cr.walls)) per[seatOf(o)].walls.push(geo.corner(Number(v)));
  for (const [v, w] of Object.entries(cr.wardens)) {
    per[seatOf(w.owner)].wardens.push({ at: geo.corner(Number(v)), rank: w.level, active: !!w.active,
      built: w.builtTurn ?? null, activated: w.activatedTurn ?? null, promoted: w.promotedTurn ?? null });
  }
  for (const k in per) { per[k].walls.sort(); per[k].wardens.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)); }
  return {
    raiders: cr.raiders, raids: cr.raids, lastEvent: cr.lastEvent,
    capitals: Object.fromEntries(CR.TRACKS.map((k) => [k, cr.capitals[k] === null ? null : geo.corner(cr.capitals[k])])),
    merchant: cr.merchant ? { tile: geo.tile(cr.merchant.hex), owner: seatOf(cr.merchant.owner) } : null,
    decks: Object.fromEntries(CR.TRACKS.map((k) => [k, cr.decks[k].join(' ')])),
    players: per,
    pendingRaid: Object.keys(cr.pendingRaid).map(seatOf), afterRaid: cr.afterRaid,
    fixedDice: cr.fixedDice, fleet: cr.fleet ? { seat: seatOf(cr.fleet.pid), card: cr.fleet.card } : null, mason: cr.mason,
  };
}

function decodeCrowns(game, c, geo, idOf) {
  if (!c || typeof c !== 'object') fail('A Crowns & Raiders save needs its "crowns" section');
  const cr = { raiders: Number(c.raiders) || 0, raids: Number(c.raids) || 0, wardens: {}, walls: {},
    capitals: { guild: null, council: null, academy: null }, decks: {}, merchant: null, lastEvent: c.lastEvent || null,
    pendingRaid: {}, afterRaid: c.afterRaid ?? null, fixedDice: Array.isArray(c.fixedDice) ? c.fixedDice.map(Number) : null,
    fleet: c.fleet ? { pid: idOf(c.fleet.seat), card: c.fleet.card } : null, mason: Number(c.mason) || 0 };
  for (const k of CR.TRACKS) {
    cr.decks[k] = String((c.decks && c.decks[k]) || '').trim().split(/\s+/).filter(Boolean);
    for (const e of cr.decks[k]) if (!CR.EDICTS[e] || CR.EDICTS[e].deck !== k) fail(`The ${k} deck has an unknown edict "${e}"`);
    const cap = c.capitals && c.capitals[k];
    if (cap) cr.capitals[k] = geo.cornerId(cap);
  }
  if (c.merchant) cr.merchant = { hex: geo.tileId(c.merchant.tile), owner: idOf(c.merchant.owner) };
  for (const s of c.pendingRaid || []) cr.pendingRaid[idOf(s)] = 1;
  for (const p of game.players) {
    const d = (c.players && c.players[p.seat]) || {};
    const imp = d.improvements || {};
    p.cr = { improve: {}, edicts: [], defender: Number(d.defender) || 0, edictVP: Number(d.edictPoints) || 0,
      freePicks: Number(d.freePicks) || 0, edictPicks: Number(d.edictPicks) || 0, wardenPieces: { 1: 2, 2: 2, 3: 2 }, wallPieces: 3 };
    for (const k of CR.TRACKS) {
      const n = Number(imp[k]) || 0;
      if (!Number.isInteger(n) || n < 0 || n > 5) fail(`Seat ${p.seat}: improvement levels go from 0 to 5`);
      p.cr.improve[k] = n;
    }
    p.cr.edicts = (d.edicts || []).map((x) => {
      const [type, got] = String(x).split('@');
      if (!CR.EDICTS[type]) fail(`Seat ${p.seat}: unknown edict "${type}"`);
      return { type, got: got === undefined ? -1 : Number(got) };
    });
    for (const at of d.walls || []) {
      const v = geo.cornerId(at); const b = game.buildings[v];
      if (!b || b.owner !== p.id || b.type !== 'town') fail(`Seat ${p.seat}: the wall at ${at} needs one of their cities`);
      cr.walls[v] = p.id; p.cr.wallPieces--;
    }
    if (p.cr.wallPieces < 0) fail(`Seat ${p.seat} has more than 3 walls`);
    for (const w of d.wardens || []) {
      const v = geo.cornerId(w.at); const rank = Number(w.rank);
      if (![1, 2, 3].includes(rank)) fail(`Seat ${p.seat}: warden ranks are 1, 2 or 3`);
      if (game.buildings[v] || cr.wardens[v]) fail(`The warden at ${w.at} shares its corner with another piece`);
      const o = { owner: p.id, level: rank, active: !!w.active };
      if (w.built !== null && w.built !== undefined) o.builtTurn = Number(w.built);
      if (w.activated !== null && w.activated !== undefined) o.activatedTurn = Number(w.activated);
      if (w.promoted !== null && w.promoted !== undefined) o.promotedTurn = Number(w.promoted);
      cr.wardens[v] = o; p.cr.wardenPieces[rank]--;
      if (p.cr.wardenPieces[rank] < 0) fail(`Seat ${p.seat} has more than 2 wardens of rank ${rank}`);
    }
  }
  game.cr = cr;
}

// ---------- readable snapshot → game (with friendly errors for hand edits) ----------
function decodeSnapshot(snap, code = 'SAVE') {
  if (!snap || typeof snap !== 'object') fail('That file is not a Hexhaven save');
  const seats = (snap.players || []).map((p) => Number(p.seat));
  if (seats.length < 2 || seats.length > G.MAX_PLAYERS) fail(`A save needs 2–${G.MAX_PLAYERS} players`);
  if (new Set(seats).size !== seats.length || seats.some((s) => !Number.isInteger(s) || s < 1)) fail('Every player needs a different seat number (1, 2, 3, …)');
  const names = new Set(); const colors = new Set();
  const players = snap.players.map((p) => {
    const name = String(p.name || '').trim().slice(0, 20);
    if (!name) fail(`Seat ${p.seat} needs a name`);
    if (names.has(name.toLowerCase())) fail(`Two players are called "${name}"`);
    names.add(name.toLowerCase());
    if (!G.COLORS.includes(p.color)) fail(`Seat ${p.seat}: color must be one of ${G.COLORS.join(', ')}`);
    if (colors.has(p.color)) fail(`Two players use the color ${p.color}`);
    colors.add(p.color);
    return {
      id: 'p' + rid(4), token: rid(24), name, color: p.color, connected: false, seat: Number(p.seat),
      hand: uncards(p.hand), guards: Number(p.guardsPlayed) || 0, roadLen: 0, pieces: { ...G.PIECES },
      scrolls: (p.devCards || []).map((c) => {
        const type = String(c).replace('*', '');
        if (!['guard', 'route', 'plenty', 'monopoly', 'vp'].includes(type)) fail(`Seat ${p.seat}: unknown development card "${c}"`);
        return { type, bought: String(c).endsWith('*') ? Number(snap.turn && snap.turn.number) || 0 : -1 };
      }),
    };
  });
  // turn order (players are stored in the order they play)
  const order = (snap.turnOrder && snap.turnOrder.length ? snap.turnOrder : seats).map(Number);
  if (order.length !== seats.length || order.some((s) => !seats.includes(s))) fail('"turnOrder" must list every seat exactly once');
  const ordered = order.map((s) => players.find((p) => p.seat === s));
  const idOf = (seat) => { if (seat === null || seat === undefined || seat === '') return null; const p = players.find((x) => x.seat === Number(seat)); if (!p) fail(`There is no seat ${seat}`); return p.id; };

  // the island: build the geometry for this size, then lay the saved tiles and harbors on it
  const size = Number(snap.map && snap.map.size);
  if (!TILE_ROWS[size]) fail('"map.size" must be 2 (19 tiles) or 3 (37 tiles)');
  const board = G._internal.buildBoard(G._internal.boardConfig(size === 2 ? 'small' : 'large', players.length));
  const geo = geometry(board);
  const rows = snap.map.tiles || [];
  if (rows.length !== TILE_ROWS[size].length) fail(`"map.tiles" needs ${TILE_ROWS[size].length} rows for size ${size}`);
  geo.rows.forEach((row, ri) => {
    const codes = String(rows[ri]).trim().split(/\s+/);
    if (codes.length !== row.length) fail(`Map row ${ri + 1} needs ${row.length} tiles (it has ${codes.length})`);
    codes.forEach((code, ci) => {
      const res = TILE_BACK[code.slice(0, 2)]; const num = code.length > 2 ? Number(code.slice(2)) : null;
      if (!res) fail(`Map row ${ri + 1}: unknown tile "${code}"`);
      if (res === 'desert' ? num !== null : !(num >= 2 && num <= 12 && num !== 7)) fail(`Map row ${ri + 1}: "${code}" needs a number 2–12 except 7 (dunes have none)`);
      row[ci].res = res; row[ci].num = res === 'desert' ? null : num;
    });
  });
  for (const V of board.vertices) V.harbor = null;
  const r3 = (n) => Math.round(n * 1000) / 1000;
  board.harbors = (snap.map.harbors || []).map((s) => {
    const m = /^\s*(3:1|2:1\s+(\w+))\s*@\s*(\S+)\s*$/.exec(String(s));
    if (!m || (m[2] && !RES.includes(m[2]))) fail(`Unknown harbor "${s}" (write "3:1 @ 1.2NW" or "2:1 wheat @ 1.2NW")`);
    const type = m[2] || 'any'; const e = geo.sideId(m[3]); const E = board.edges[e];
    if (E.hexes.length !== 1) fail(`Harbor "${s}" must be on the coast`);
    board.vertices[E.a].harbor = type; board.vertices[E.b].harbor = type;
    const A = board.vertices[E.a], B = board.vertices[E.b], h = board.hexes[E.hexes[0]];
    return { edge: e, type, x: r3(h.x + ((A.x + B.x) / 2 - h.x) * 1.55), y: r3(h.y + ((A.y + B.y) / 2 - h.y) * 1.55) };
  });

  const game = G.createGame(code);
  const T = snap.turn || {};
  Object.assign(game, {
    status: snap.status === 'over' || snap.winner ? 'over' : 'playing',
    settings: { ...game.settings, ...(snap.settings || {}) },
    players: ordered, hostId: idOf(snap.host) || ordered[0].id, board,
    bank: uncards(snap.bank), deck: snap.devDeck ? String(snap.devDeck).trim().split(/\s+/) : [],
    bandit: snap.map.bandit ? geo.tileId(snap.map.bandit) : board.hexes.find((h) => h.res === 'desert').id,
    buildings: {}, roads: {}, trade: null,
    longestHolder: idOf(snap.awards && snap.awards.longestRoad), armyHolder: idOf(snap.awards && snap.awards.largestArmy),
    winner: idOf(snap.winner), lastRoll: null, rollSeq: 0, lastSteal: null, suggestions: [], order: null,
  });
  game.pendingDiscard = {};
  for (const p of ordered) { const n = snap.pendingDiscard && snap.pendingDiscard[p.seat]; if (n) game.pendingDiscard[p.id] = Number(n); }
  game.produced = {};
  for (const [s, n] of Object.entries(snap.harvested || {})) game.produced[idOf(s)] = Number(n);
  game.rollHistory = snap.rolls ? String(snap.rolls).trim().split(/\s+/).map((x) => {
    const m = /^(\d+):(\d)\+(\d)$/.exec(x); if (!m) fail(`Unknown roll "${x}" (write seat:die+die, e.g. 2:3+4)`);
    return { n: Number(m[2]) + Number(m[3]), d: [Number(m[2]), Number(m[3])], by: idOf(m[1]) };
  }) : [];
  game.rollStats = Array(13).fill(0);
  for (const r of game.rollHistory) game.rollStats[r.n]++;
  for (const [s, pc] of Object.entries(snap.pieces || {})) {
    const pid = idOf(s); const p = players.find((x) => x.id === pid);
    const put = (list, fn) => (list || []).forEach(fn);
    put(pc.settlements, (a) => { game.buildings[geo.cornerId(a)] = { owner: pid, type: 'village' }; p.pieces.village--; });
    put(pc.cities, (a) => { game.buildings[geo.cornerId(a)] = { owner: pid, type: 'town' }; p.pieces.town--; });
    put(pc.roads, (a) => { game.roads[geo.sideId(a)] = pid; p.pieces.road--; });
    if (p.pieces.village < 0 || p.pieces.town < 0 || p.pieces.road < 0) fail(`Seat ${s} has more pieces than the game allows (5 settlements, 4 cities, 15 roads)`);
  }
  const phases = ['order', 'setup', 'preroll', 'raid', 'discard', 'robber', 'steal', 'roadbuilding', 'main', 'builder'];
  const phase = phases.includes(T.phase) ? T.phase : 'preroll';
  const idx = Math.max(0, ordered.findIndex((p) => p.seat === Number(T.player)));
  game.turn = {
    idx, number: Number.isInteger(Number(T.number)) && Number(T.number) >= 0 && T.number !== null && T.number !== '' ? Number(T.number) : 1, phase, dice: Array.isArray(T.dice) ? T.dice : null, devPlayed: !!T.devCardPlayed,
    setup: T.setup ? { pos: Number(T.setup.step) || 0, need: T.setup.need === 'road' ? 'road' : 'village', last: T.setup.last ? geo.cornerId(T.setup.last) : null } : { pos: 0, need: 'village', last: null },
    freeRoads: Number(T.freeRoads) || 0, afterRoads: T.afterRoads || null, victims: (T.victims || []).map(idOf), afterRobber: T.afterRobber || null,
    builder: idOf(T.builder), builderQueue: (T.builderQueue || []).map(idOf),
  };
  if (T.event) game.turn.event = T.event;
  if (game.settings.mode === 'crowns') decodeCrowns(game, snap.crowns, geo, idOf);
  else { delete game.cr; for (const p of ordered) delete p.cr; }
  if (phase === 'order') {
    const ro = snap.rollOff || {};
    game.order = { contenders: (ro.waiting || ordered.map((p) => p.seat)).map(idOf), rolls: Object.fromEntries(Object.entries(ro.rolls || {}).map(([s, n]) => [idOf(s), Number(n)])), round: Number(ro.round) || 1 };
  }
  for (const p of ordered) p.roadLen = G._internal.roadLength(game, p.id);
  return game;
}

// ---------- the whole file ----------
function exportSave(game, extra = {}) {
  const h = game.history;
  return {
    hexhaven: FORMAT,
    _about: ABOUT,
    saved: new Date().toISOString(),
    room: game.code,
    ...extra,
    seed: game.rng ? game.rng.s : '',
    ...encodeSnapshot(game),
    history: h ? { seed: h.start.rng ? h.start.rng.s : '', start: encodeSnapshot(h.start), moves: h.moves } : null,
  };
}

// Pretty-print: one field per line, short lists on one line, and one move per line.
function stringifySave(file) {
  return JSON.stringify(file, null, 2).replace(/\[\s+([^[\]{}]*?)\s+\]/g, (m, inner) => (inner.length > 300 ? m : '[' + inner.replace(/\s*\n\s*/g, ' ') + ']'));
}

const isSeed = (x) => x !== '' && x !== null && x !== undefined && Number.isInteger(Number(x)) && Number(x) >= 0;
const meaning = (game) => JSON.stringify(encodeSnapshot(game));

// Apply one recorded move to a game (used by loading and by the replay viewer).
function applyMove(game, line) {
  const d = decodeMove(game, line);
  if (d.special === 'timeout') return G.timeout(game);
  if (d.special === 'reseed') { game.rng.s = d.seed; return; }
  G.act(game, d.pid, d.action);
}

// Rebuild the starting game of a file's history (or explain why we can't).
function historyStartGame(file) {
  const h = file.history;
  if (!h || !h.start || !Array.isArray(h.moves)) return null;
  const start = decodeSnapshot(h.start, file.room || 'SAVE');
  if (!isSeed(h.seed)) return null; // without the starting seed the dice can't be reproduced
  start.rng = { s: Number(h.seed) >>> 0 };
  // names and colors are cosmetic: edits to them in the snapshot apply to the whole history (by seat)
  for (const p of start.players) {
    const now = (file.players || []).find((x) => Number(x.seat) === p.seat);
    if (now) { p.name = String(now.name || p.name).trim().slice(0, 20) || p.name; if (G.COLORS.includes(now.color)) p.color = now.color; }
  }
  return start;
}

// Load a file into a playable game. Returns { game, notes } — notes explain anything the loader decided.
function importSave(file, code) {
  if (!file || file.hexhaven !== FORMAT) fail('That file is not a Hexhaven save (or is from a newer version)');
  const game = decodeSnapshot(file, code);
  const notes = [];
  let historyOk = false; let replayed = null;
  try {
    const start = historyStartGame(file);
    if (start) {
      replayed = clone(start);
      for (const line of file.history.moves) applyMove(replayed, line);
      historyOk = meaning(replayed) === meaning(game);
    }
  } catch { historyOk = false; }
  if (historyOk) {
    const startGame = historyStartGame(file);
    startGame.code = code;
    game.history = { start: G.historyStart(startGame), moves: [...file.history.moves] };
    game.rng = { s: replayed.rng.s };
    if (isSeed(file.seed)) { if ((Number(file.seed) >>> 0) !== game.rng.s) G.reseed(game, Number(file.seed)); notes.push('Kept the full history — the replay still works.'); }
    else { G.reseed(game); notes.push('Kept the full history. "seed" was empty, so the dice are freshly random from here.'); }
  } else {
    game.rng = { s: isSeed(file.seed) ? Number(file.seed) >>> 0 : G.newSeed() };
    game.history = { start: G.historyStart(game), moves: [] };
    notes.push(file.history && file.history.moves && file.history.moves.length
      ? 'The snapshot was edited (or the history is incomplete), so the game continues from the snapshot and its replay starts here.'
      : 'This save has no history; the replay starts here.');
    if (!isSeed(file.seed)) notes.push('"seed" was empty, so the dice are freshly random.');
  }
  return { game, notes };
}

// ---------- replays: jump to any move quickly (a checkpoint every 25 moves) ----------
function replayer(file) {
  const start = historyStartGame(file);
  if (!start) fail('This save has no replayable history');
  const moves = file.history.moves;
  const checkpoints = new Map([[0, clone(start)]]);
  let error = null;
  function stateAt(n) {
    n = Math.max(0, Math.min(moves.length, n));
    let base = 0;
    for (const k of checkpoints.keys()) if (k <= n && k > base) base = k;
    const game = clone(checkpoints.get(base));
    for (let i = base; i < n; i++) {
      try { applyMove(game, moves[i]); } catch (e) { error = { at: i, line: moves[i], message: e.message }; return { game, reached: i, error }; }
      if ((i + 1) % 25 === 0 && !checkpoints.has(i + 1)) checkpoints.set(i + 1, clone(game));
    }
    return { game, reached: n, error: null };
  }
  return { length: moves.length, moves, stateAt, start };
}

module.exports = { FORMAT, encodeSnapshot, decodeSnapshot, exportSave, stringifySave, importSave, replayer, applyMove };
