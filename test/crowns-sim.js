'use strict';
// Crowns & Raiders self-play: bots try every action of the mode (improvements, capitals, walls, wardens,
// edicts with random targets, raids) and we check the rules' bookkeeping after every single action.
// Usage: node test/crowns-sim.js [games] [players]
const G = require('../game');
const CR = require('../crowns');

const GAMES = Number(process.argv[2]) || 30;
const ONLY_N = Number(process.argv[3]) || 0;
const { RES, CARDS } = G;
const pick = (a) => (a && a.length ? a[Math.floor(Math.random() * a.length)] : undefined);
const has = (h, c) => CARDS.every((r) => (h[r] || 0) >= (c[r] || 0));
let errors = 0;
const tryAct = (g, pid, a) => { try { G.act(g, pid, a); return true; } catch (e) { if (!e.user) { errors++; console.log('ENGINE ERROR on', JSON.stringify(a), e.stack); throw e; } return false; } };

function botStep(g) {
  const pid = G.viewFor(g, g.players[0].id).stalled[0];
  const v = G.viewFor(g, pid); const t = v.turn; const p = g.players.find((x) => x.id === pid); const c = v.crowns; const h = v.hints;
  // free picks and edict draws can be taken any time
  if (p.cr.freePicks > 0 && tryAct(g, pid, { type: 'takeFree', res: pick(RES) })) return;
  if (p.cr.edictPicks > 0 && tryAct(g, pid, { type: 'drawEdict', deck: pick(CR.TRACKS) })) return;
  switch (t.phase) {
    case 'order':
      if (Math.random() < 0.15 && tryAct(g, pick(g.players).id, { type: 'mapVote', value: pick([1, -1]) })) return;
      if (Math.random() < 0.05 && tryAct(g, g.hostId, { type: 'rerollMap' })) return;
      return G.act(g, pid, { type: 'roll' });
    case 'setup': return G.act(g, pid, t.setupNeed === 'village' ? { type: 'buildVillage', vertex: pick(h.villages) } : { type: 'buildRoad', edge: pick(h.roads) });
    case 'preroll':
      if (c.me.edicts.includes('loadeddice') && Math.random() < 0.5) tryAct(g, pid, { type: 'playEdict', kind: 'loadeddice', d1: 1 + Math.floor(Math.random() * 6), d2: 1 + Math.floor(Math.random() * 6) });
      return G.act(g, pid, { type: 'roll' });
    case 'raid': return G.act(g, pid, { type: 'raidLose', vertex: pick(h.raidCities) });
    case 'discard': {
      const n = g.pendingDiscard[pid]; const d = {}; const hh = { ...p.hand };
      for (let i = 0; i < n; i++) { const r = pick(CARDS.filter((x) => hh[x] > 0)); hh[r]--; d[r] = (d[r] || 0) + 1; }
      return G.act(g, pid, { type: 'discard', cards: d });
    }
    case 'robber': return G.act(g, pid, { type: 'moveBandit', hex: pick(h.hexes) });
    case 'steal': return G.act(g, pid, { type: 'steal', victim: pick(t.victims), card: 0 });
    case 'roadbuilding': return G.act(g, pid, h.roads.length ? { type: 'buildRoad', edge: pick(h.roads) } : { type: 'skipRoads' });
    default: {
      const mine = (fn) => Object.entries(g.buildings).filter(([, b]) => b.owner === pid && fn(b)).map(([x]) => Number(x));
      const foesW = Object.entries(g.cr.wardens).filter(([, w]) => w.owner !== pid).map(([x]) => Number(x));
      const others = g.players.filter((o) => o.id !== pid).map((o) => o.id);
      // improvements (and a city for the capital if one is founded)
      for (const k of CR.TRACKS) if (Math.random() < 0.7 && tryAct(g, pid, { type: 'improve', track: k, vertex: pick(h.capitalCities) })) return;
      if (h.villages.length && has(p.hand, v.cost.village) && tryAct(g, pid, { type: 'buildVillage', vertex: pick(h.villages) })) return;
      if (h.towns.length && has(p.hand, v.cost.town) && tryAct(g, pid, { type: 'buildTown', vertex: pick(h.towns) })) return;
      if (h.wallSpots.length && Math.random() < 0.5 && tryAct(g, pid, { type: 'buildWall', vertex: pick(h.wallSpots) })) return;
      // defend like a person would: more wardens as the raiders close in, and keep them active
      const danger = c.raiders >= 3 && c.defense < c.attack;
      if (h.wardenSpots.length && Math.random() < (danger ? 0.95 : 0.5) && tryAct(g, pid, { type: 'buildWarden', vertex: pick(h.wardenSpots) })) return;
      for (const w of h.myWardens) {
        if (w.canActivate && tryAct(g, pid, { type: 'activateWarden', vertex: w.vertex })) return;
        if (w.canPromote && Math.random() < 0.4 && tryAct(g, pid, { type: 'promoteWarden', vertex: w.vertex })) return;
        if (t.phase === 'main') {
          if (w.chase && Math.random() < 0.5 && tryAct(g, pid, { type: 'wardenChase', from: w.vertex })) return;
          if (w.pushes.length && Math.random() < 0.7 && tryAct(g, pid, { type: 'wardenDisplace', from: w.vertex, to: pick(w.pushes) })) return;
          if (w.moves.length && !danger && Math.random() < 0.2 && tryAct(g, pid, { type: 'wardenMove', from: w.vertex, to: pick(w.moves) })) return;
        }
      }
      if (h.roads.length && has(p.hand, v.cost.road) && Math.random() < 0.5 && tryAct(g, pid, { type: 'buildRoad', edge: pick(h.roads) })) return;
      if (t.phase === 'main') {
        // edicts with random targets (illegal ones are simply refused)
        for (const kind of c.me.edicts) {
          if (Math.random() < 0.5) continue;
          const hexes = g.board.hexes.map((x) => x.id);
          const a = { type: 'playEdict', kind, hex: pick(hexes), hex2: pick(hexes), res: pick(CARDS), victim: pick(others),
            vertex: pick([...mine(() => true), ...foesW, ...h.myWardens.map((w) => w.vertex)]), vertex2: pick(h.wardenSpots.length ? h.wardenSpots : h.myWardens.map((w) => w.vertex)),
            edge: pick(Object.keys(g.roads).map(Number)), d1: 3, d2: 4 };
          if (kind === 'smith') { a.vertex = pick(h.myWardens.map((w) => w.vertex)); a.vertex2 = undefined; }
          if (tryAct(g, pid, a)) return;
        }
        // bank trades with commodities now and then
        const rich = CARDS.find((r) => p.hand[r] >= v.rates[r]);
        if (rich && Math.random() < 0.3 && tryAct(g, pid, { type: 'bankTrade', give: { [rich]: v.rates[rich] }, get: { [pick(CARDS.filter((x) => x !== rich))]: 1 } })) return;
      }
      return G.act(g, pid, { type: t.phase === 'builder' ? 'builderDone' : 'endTurn' });
    }
  }
}

function check(g, supply) {
  for (const r of CARDS) {
    const total = (g.bank[r] || 0) + g.players.reduce((s, p) => s + (p.hand[r] || 0), 0);
    if (total !== supply[r]) throw new Error(`${r} not conserved: ${total} vs ${supply[r]}`);
    if (g.bank[r] < 0 || g.players.some((p) => p.hand[r] < 0)) throw new Error('negative ' + r);
  }
  const placed = (pid, lvl) => Object.values(g.cr.wardens).filter((w) => w.owner === pid && w.level === lvl).length;
  for (const p of g.players) {
    const b = Object.values(g.buildings).filter((x) => x.owner === p.id);
    if (b.filter((x) => x.type === 'village').length + p.pieces.village !== 5) throw new Error('settlement pieces');
    if (b.filter((x) => x.type === 'town').length + p.pieces.town !== 4) throw new Error('city pieces');
    if (Object.values(g.roads).filter((x) => x === p.id).length + p.pieces.road !== 15) throw new Error('road pieces');
    if (Object.values(g.cr.walls).filter((x) => x === p.id).length + p.cr.wallPieces !== 3) throw new Error('wall pieces');
    for (const l of [1, 2, 3]) if (placed(p.id, l) + p.cr.wardenPieces[l] !== 2) throw new Error(`warden pieces rank ${l}`);
    if (p.cr.edicts.length > CR.EDICT_HAND) throw new Error('too many edicts');
  }
  for (const [v, o] of Object.entries(g.cr.walls)) { const b = g.buildings[v]; if (!b || b.owner !== o || b.type !== 'town') throw new Error('wall without its city'); }
  for (const k of CR.TRACKS) { const c = g.cr.capitals[k]; if (c !== null && (!g.buildings[c] || g.buildings[c].type !== 'town')) throw new Error('capital without a city'); }
  for (const v of Object.keys(g.cr.wardens)) if (g.buildings[v]) throw new Error('warden on a building');
  for (const v of Object.keys(g.buildings)) if (g.board.vertices[v].adj.some((a) => g.buildings[a])) throw new Error('distance rule');
  for (const deck of CR.TRACKS) {
    const inDeck = g.cr.decks[deck].length;
    const inHands = g.players.reduce((s, p) => s + p.cr.edicts.filter((x) => CR.EDICTS[x.type].deck === deck).length, 0);
    // point edicts leave the decks for good: every card is in the deck, in a hand, or was a drawn point card
    const vpKinds = Object.entries(CR.EDICTS).filter(([, e]) => e.deck === deck && e.vp);
    const vpDrawn = vpKinds.reduce((s, [k, e]) => s + e.n - g.cr.decks[deck].filter((x) => x === k).length, 0);
    if (inDeck + inHands + vpDrawn !== 18) throw new Error(`edicts in ${deck}: ${inDeck}+${inHands}+${vpDrawn} != 18`);
  }
}

module.exports = { botStep, check };
if (require.main === module) run();
function run() {
let wins = 0; let steps = 0; const stats = { raids: 0, defenders: 0, capitals: 0, wardens: 0, sacked: 0 };
const t0 = Date.now();
for (let i = 0; i < GAMES; i++) {
  const n = ONLY_N || 2 + (i % 7);
  const g = G.createGame('C' + i);
  const ps = Array.from({ length: n }, (_, k) => G.addPlayer(g, 'Bot' + k));
  G.act(g, ps[0].id, { type: 'settings', settings: { mode: 'crowns', builderPhase: i % 3 === 0, turnTimer: i % 4 === 1 ? 60 : 0, firstRaid: [7, 10, 14, 21][i % 4] } });
  if (g.settings.vpTarget !== 13) throw new Error('crowns should default to 13 points');
  G.act(g, ps[0].id, { type: 'start' });
  const supply = Object.fromEntries(CARDS.map((r) => [r, g.bank[r]]));
  let s = 0;
  while (g.status === 'playing' && s < 30000) {
    if (g.deadline && Math.random() < 0.02) G.tick(g, Infinity); else botStep(g);
    check(g, supply); s++;
  }
  steps += s;
  if (g.status === 'over') wins++;
  else {
    const pts = g.players.map((p) => `${G.viewFor(g, p.id).players.find((x) => x.id === p.id).vpTotal}vp/${Object.values(g.buildings).filter((b) => b.owner === p.id && b.type === 'town').length}c`);
    console.log(`UNFINISHED: ${n} players, turn ${g.turn.number}, phase ${g.turn.phase}, raids ${g.cr.raids}, scores ${pts.join(' ')}, bank ${JSON.stringify(g.bank)}`);
  }
  stats.raids += g.cr.raids;
  stats.defenders += g.players.reduce((a, p) => a + p.cr.defender, 0);
  stats.capitals += CR.TRACKS.filter((k) => g.cr.capitals[k] !== null).length;
  stats.wardens += Object.keys(g.cr.wardens).length;
  JSON.stringify(G.viewFor(g, ps[0].id));
}
console.log(`${GAMES} Crowns & Raiders games: ${wins} finished, avg ${Math.round(steps / GAMES)} actions, ${Date.now() - t0}ms`);
console.log(`  raids ${stats.raids}, defender awards ${stats.defenders}, capitals founded ${stats.capitals}, wardens standing at the end ${stats.wardens}`);
// Random bots can occasionally starve themselves (e.g. nobody holds iron and they never trade for it).
// That is bad play, not a rules bug: fail on any engine error, or if more than 1 game in 10 stalls.
if (errors || wins < Math.ceil(GAMES * 0.9)) process.exitCode = 1;
}
