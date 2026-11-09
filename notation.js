'use strict';
// Hexhaven notation: human-readable names for board positions, cards and moves.
// Pure functions with no dependencies, so the server and the browser (replay viewer) share them.
//
//   Tile      "row.tile"        rows counted top to bottom, tiles left to right, from 1   e.g. "3.2"
//   Corner    "row.tile" + N|NE|SE|S|SW|NW                                              e.g. "3.2SE"
//   Side      "row.tile" + NE|E|SE|SW|W|NW (side NE runs from corner N to corner NE)   e.g. "3.2E"
//   Cards     "Wo1 Cl2 Fl0 Wh3 Ir1" (wood, clay, fleece, wheat, iron; zero counts may be left out; "-" = none)
//             Crowns & Raiders adds the commodities Pa parchment, Li linen, Si silver
//   Move      "<seat> <action> [details]"  e.g. "2 buildRoad 3.2E", "4 steal @1 #0", "- timeout"

const RES = ['wood', 'clay', 'fleece', 'wheat', 'iron'];
const COM = ['parchment', 'linen', 'silver'];
const CARDS = [...RES, ...COM];
const CORNER = ['N', 'NE', 'SE', 'S', 'SW', 'NW'];
const SIDE = ['NE', 'E', 'SE', 'SW', 'W', 'NW'];
const TILE = { wood: 'Wo', clay: 'Cl', fleece: 'Fl', wheat: 'Wh', iron: 'Ir', desert: 'De' };
const TILE_BACK = Object.fromEntries(Object.entries(TILE).map(([k, v]) => [v, k]));
const CARD = { wood: 'Wo', clay: 'Cl', fleece: 'Fl', wheat: 'Wh', iron: 'Ir', parchment: 'Pa', linen: 'Li', silver: 'Si' };
const CARD_BACK = Object.fromEntries(Object.entries(CARD).map(([k, v]) => [v, k]));

function fail(msg) { const e = new Error(msg); e.user = true; throw e; }

// ---------- positions ----------
const geoCache = new WeakMap();
function geometry(board) {
  if (geoCache.has(board)) return geoCache.get(board);
  const byRow = {};
  for (const h of board.hexes) (byRow[h.r] = byRow[h.r] || []).push(h);
  const rowKeys = Object.keys(byRow).map(Number).sort((a, b) => a - b);
  const pos = {}; const at = {};
  rowKeys.forEach((r, ri) => byRow[r].sort((a, b) => a.q - b.q).forEach((h, ci) => {
    pos[h.id] = [ri + 1, ci + 1]; at[`${ri + 1}.${ci + 1}`] = h;
  }));
  const rows = rowKeys.map((r) => byRow[r]);
  const tile = (hid) => pos[hid].join('.');
  // a corner or side touches up to three tiles; name it after the first one in reading order
  const first = (ids) => ids.map((id) => board.hexes[id]).sort((a, b) => pos[a.id][0] - pos[b.id][0] || pos[a.id][1] - pos[b.id][1])[0];
  const corner = (vid) => { const h = first(board.vertices[vid].hexes); return tile(h.id) + CORNER[h.v.indexOf(vid)]; };
  const side = (eid) => {
    const E = board.edges[eid]; const h = first(E.hexes);
    const k = [0, 1, 2, 3, 4, 5].find((i) => { const a = h.v[i], b = h.v[(i + 1) % 6]; return (a === E.a && b === E.b) || (a === E.b && b === E.a); });
    return tile(h.id) + SIDE[k];
  };
  const parse = (s, names, what) => {
    const m = /^(\d+)\.(\d+)([A-Z]*)$/.exec(String(s).trim().toUpperCase());
    const h = m && at[`${m[1]}.${m[2]}`]; const k = m ? names.indexOf(m[3]) : -1;
    if (!h || k < 0) fail(`Unknown ${what} "${s}"`);
    return [h, k];
  };
  const tileId = (s) => parse(s, [''], 'tile')[0].id;
  const cornerId = (s) => { const [h, k] = parse(s, CORNER, 'corner'); return h.v[k]; };
  const sideId = (s) => {
    const [h, k] = parse(s, SIDE, 'side'); const a = h.v[k], b = h.v[(k + 1) % 6];
    return board.edges.find((E) => (E.a === a && E.b === b) || (E.a === b && E.b === a)).id;
  };
  const geo = { rows, tile, corner, side, tileId, cornerId, sideId };
  geoCache.set(board, geo);
  return geo;
}

// ---------- cards ----------
const cards = (h) => CARDS.filter((r) => h && h[r]).map((r) => `${CARD[r]}${h[r]}`).join(' ') || '-';
function uncards(s) {
  const h = Object.fromEntries(CARDS.map((r) => [r, 0]));
  const str = String(s == null ? '' : s).trim();
  if (!str || str === '-') return h;
  for (const t of str.split(/\s+/)) {
    if (t === '-') continue; // "none" marker left in by a hand edit, e.g. "Wo9 -"
    const r = CARD_BACK[t.slice(0, 1).toUpperCase() + t.slice(1, 2).toLowerCase()];
    const n = Number(t.slice(2));
    if (!r || !Number.isInteger(n) || n < 0) fail(`Unknown cards "${t}" (use Wo, Cl, Fl, Wh, Ir, Pa, Li, Si followed by a count)`);
    h[r] += n;
  }
  return h;
}

// ---------- moves ----------
// Crowns & Raiders moves carry named details, e.g. "2 wardenDisplace from=3.2SE to=3.3N" or "4 playEdict spy victim=@1".
const CROWNS_MOVES = new Set(['buildWall', 'buildWarden', 'activateWarden', 'promoteWarden', 'wardenMove', 'wardenDisplace', 'wardenChase',
  'improve', 'raidLose', 'takeFree', 'drawEdict', 'playEdict']);
const KEY_KIND = { vertex: 'corner', vertex2: 'corner', from: 'corner', to: 'corner', hex: 'tile', hex2: 'tile', edge: 'side', victim: 'seat' };
const KEY_ORDER = ['kind', 'track', 'deck', 'res', 'vertex', 'vertex2', 'from', 'to', 'hex', 'hex2', 'edge', 'victim', 'd1', 'd2'];

// Moves never contain server-made ids: players are seat numbers, "respondTrade" answers the open offer.
function encodeMove(game, pid, a) {
  const geo = geometry(game.board);
  const seatOf = (id) => { const p = game.players.find((x) => x.id === id); return p ? p.seat : 0; };
  const parts = [seatOf(pid), a.type];
  switch (a.type) {
    case 'buildVillage': case 'buildTown': parts.push(geo.corner(Number(a.vertex))); break;
    case 'buildRoad': parts.push(geo.side(Number(a.edge))); break;
    case 'moveBandit': parts.push(geo.tile(Number(a.hex))); break;
    case 'discard': parts.push(cards(a.cards)); break;
    case 'steal': parts.push('@' + seatOf(a.victim)); if (Number.isInteger(a.card)) parts.push('#' + a.card); break;
    case 'confirmTrade': parts.push('@' + seatOf(a.with)); break;
    case 'mapVote': parts.push(Number(a.value) === 1 ? 'yes' : Number(a.value) === -1 ? 'no' : 'clear'); break;
    case 'mapDecide': parts.push(a.reroll ? 'new' : 'keep'); break;
    case 'playScroll': parts.push(a.kind); if (a.res) parts.push(a.res); if (a.res2) parts.push(a.res2); break;
    case 'bankTrade': case 'proposeTrade':
      if (typeof a.give === 'string') parts.push('give', a.give, 'get', a.get); // older single-lot bank form
      else parts.push('give', cards(a.give), 'get', cards(a.get));
      break;
    case 'respondTrade':
      if (a.counter) parts.push('counter', 'give', cards(a.counter.give), 'get', cards(a.counter.get));
      else parts.push(a.accept ? 'yes' : 'no');
      break;
    default:
      if (CROWNS_MOVES.has(a.type)) {
        for (const k of KEY_ORDER) {
          const val = a[k];
          if (val === undefined || val === null || val === '') continue;
          const kind = KEY_KIND[k];
          if (kind === 'corner') parts.push(`${k}=${geo.corner(Number(val))}`);
          else if (kind === 'tile') parts.push(`${k}=${geo.tile(Number(val))}`);
          else if (kind === 'side') parts.push(`${k}=${geo.side(Number(val))}`);
          else if (kind === 'seat') parts.push(`${k}=@${seatOf(val)}`);
          else if (/^[\w-]+$/.test(String(val))) parts.push(`${k}=${val}`);
        }
      }
      break; // roll, endTurn, builderDone, skipRoads, buyScroll, cancelTrade, skip
  }
  return parts.join(' ');
}

// Turn one move line back into { pid, action } for this game, or a special { special: 'timeout' | 'reseed', seed }.
function decodeMove(game, line) {
  const tok = String(line).trim().split(/\s+/);
  if (tok[0] === '-') {
    if (tok[1] === 'timeout') return { special: 'timeout' };
    if (tok[1] === 'reseed') return { special: 'reseed', seed: Number(tok[2]) >>> 0 };
    fail(`Unknown move "${line}"`);
  }
  const geo = geometry(game.board);
  const bySeat = (s) => { const p = game.players.find((x) => x.seat === Number(s)); if (!p) fail(`No player in seat ${s}`); return p.id; };
  const pid = bySeat(tok[0]); const type = tok[1]; const rest = tok.slice(2); const a = { type };
  const between = (from, to) => rest.slice(rest.indexOf(from) + 1, to ? rest.indexOf(to) : undefined).join(' ');
  switch (type) {
    case 'buildVillage': case 'buildTown': a.vertex = geo.cornerId(rest[0]); break;
    case 'buildRoad': a.edge = geo.sideId(rest[0]); break;
    case 'moveBandit': a.hex = geo.tileId(rest[0]); break;
    case 'discard': a.cards = uncards(rest.join(' ')); break;
    case 'steal': a.victim = bySeat(rest[0].slice(1)); if (rest[1]) a.card = Number(rest[1].slice(1)); break;
    case 'confirmTrade': a.with = bySeat(rest[0].slice(1)); break;
    case 'mapVote': a.value = rest[0] === 'yes' ? 1 : rest[0] === 'no' ? -1 : 0; break;
    case 'mapDecide': a.reroll = rest[0] === 'new'; break;
    case 'playScroll': a.kind = rest[0]; if (rest[1]) a.res = rest[1]; if (rest[2]) a.res2 = rest[2]; break;
    case 'bankTrade': case 'proposeTrade':
      if (RES.includes(rest[1])) { a.give = rest[1]; a.get = rest[3]; } else { a.give = uncards(between('give', 'get')); a.get = uncards(between('get')); }
      break;
    case 'respondTrade':
      a.id = game.trade && game.trade.id;
      if (rest[0] === 'counter') a.counter = { give: uncards(between('give', 'get')), get: uncards(between('get')) };
      else a.accept = rest[0] === 'yes';
      break;
    default:
      if (CROWNS_MOVES.has(type)) {
        for (const tk of rest) {
          const m = /^(\w+)=(.+)$/.exec(tk);
          if (!m || !KEY_ORDER.includes(m[1])) fail(`Unknown detail "${tk}" in move "${line}"`);
          const [, k, val] = m; const kind = KEY_KIND[k];
          if (kind === 'corner') a[k] = geo.cornerId(val);
          else if (kind === 'tile') a[k] = geo.tileId(val);
          else if (kind === 'side') a[k] = geo.sideId(val);
          else if (kind === 'seat') a[k] = bySeat(val.replace('@', ''));
          else if (k === 'd1' || k === 'd2') a[k] = Number(val);
          else a[k] = val;
        }
      }
      break;
  }
  return { pid, action: a };
}

module.exports = { RES, COM, CARDS, CORNER, SIDE, TILE, TILE_BACK, CARD, CARD_BACK, CROWNS_MOVES, geometry, cards, uncards, encodeMove, decodeMove };
