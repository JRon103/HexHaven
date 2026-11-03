'use strict';
// Headless self-play: random bots play full games and we check invariants after every action.
// Usage: node test/sim.js [games] [players]
const G = require('../game');
const { RES } = G;
const { handCount } = G._internal;

const GAMES = Number(process.argv[2]) || 100;
const N = Number(process.argv[3]) || 6;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const has = (h, c) => RES.every((r) => h[r] >= (c[r] || 0));

function tryAct(g, pid, a) {
  try { G.act(g, pid, a); return true; } catch (e) { if (!e.user) throw e; return false; }
}

function botStep(g) {
  const t = g.turn;
  const stalled = G.viewFor(g, g.players[0].id).stalled;
  for (const pid of stalled) {
    const v = G.viewFor(g, pid);
    const p = g.players.find((x) => x.id === pid);
    switch (t.phase) {
      case 'order':
        return G.act(g, pid, { type: 'roll' });
      case 'setup':
        if (v.turn.setupNeed === 'village') return G.act(g, pid, { type: 'buildVillage', vertex: pick(v.hints.villages) });
        return G.act(g, pid, { type: 'buildRoad', edge: pick(v.hints.roads) });
      case 'preroll':
        if (Math.random() < 0.5 && v.myScrolls.some((s) => s.type === 'guard' && !s.fresh) && !t.devPlayed) {
          return G.act(g, pid, { type: 'playScroll', kind: 'guard' });
        }
        return G.act(g, pid, { type: 'roll' });
      case 'discard': {
        const n = g.pendingDiscard[pid]; const cards = { wood: 0, clay: 0, fleece: 0, wheat: 0, iron: 0 };
        const h = { ...p.hand };
        for (let i = 0; i < n; i++) { const r = pick(RES.filter((x) => h[x] > 0)); h[r]--; cards[r]++; }
        return G.act(g, pid, { type: 'discard', cards });
      }
      case 'robber':
        return G.act(g, pid, { type: 'moveBandit', hex: pick(v.hints.hexes) });
      case 'steal':
        { const vic = pick(t.victims); return G.act(g, pid, { type: 'steal', victim: vic, card: Math.floor(Math.random() * handCount(g.players.find((x) => x.id === vic).hand)) }); }
      case 'roadbuilding':
        if (v.hints.roads.length && Math.random() < 0.9) return G.act(g, pid, { type: 'buildRoad', edge: pick(v.hints.roads) });
        return G.act(g, pid, { type: 'skipRoads' });
      case 'builder':
      case 'main': {
        const c = v.cost;
        if (v.hints.towns.length && has(p.hand, c.town) && tryAct(g, pid, { type: 'buildTown', vertex: pick(v.hints.towns) })) return;
        if (v.hints.villages.length && has(p.hand, c.village) && tryAct(g, pid, { type: 'buildVillage', vertex: pick(v.hints.villages) })) return;
        if (v.hints.roads.length && has(p.hand, c.road) && Math.random() < 0.6 && tryAct(g, pid, { type: 'buildRoad', edge: pick(v.hints.roads) })) return;
        if (has(p.hand, c.scroll) && Math.random() < 0.5 && tryAct(g, pid, { type: 'buyScroll' })) return;
        if (t.phase === 'builder') return G.act(g, pid, { type: 'builderDone' });
        if (!t.devPlayed && Math.random() < 0.3) {
          const s = v.myScrolls.find((x) => !x.fresh && x.type !== 'vp');
          if (s && tryAct(g, pid, { type: 'playScroll', kind: s.type, res: pick(RES), res2: pick(RES) })) return;
        }
        const rich = RES.find((r) => p.hand[r] >= v.rates[r]);
        if (rich && Math.random() < 0.5 && tryAct(g, pid, { type: 'bankTrade', give: rich, get: pick(RES.filter((r) => r !== rich)) })) return;
        if (!g.trade && Math.random() < 0.15) {
          const give = pick(RES.filter((r) => p.hand[r] > 0) || []);
          if (give) {
            const get = pick(RES.filter((r) => r !== give));
            if (tryAct(g, pid, { type: 'proposeTrade', give: { [give]: 1 }, get: { [get]: 1 } })) {
              for (const o of g.players) {
                if (o.id === pid) continue;
                const mine = RES.find((r) => o.hand[r] > 0 && r !== get);
                if (mine && Math.random() < 0.2) tryAct(g, o.id, { type: 'respondTrade', id: g.trade.id, counter: { give: { [mine]: 1 }, get: { [give]: 1 } } });
                else tryAct(g, o.id, { type: 'respondTrade', id: g.trade.id, accept: Math.random() < 0.5 });
              }
              const acc = Object.keys(g.trade.responses).filter((k) => g.trade.responses[k] !== 'decline');
              if (acc.length && tryAct(g, pid, { type: 'confirmTrade', with: pick(acc) })) { /* traded */ }
              else G.act(g, pid, { type: 'cancelTrade' });
              return;
            }
          }
        }
        return G.act(g, pid, { type: 'endTurn' });
      }
    }
  }
  throw new Error('No stalled player in phase ' + t.phase);
}

function check(g, bankSize) {
  for (const r of RES) {
    const total = g.bank[r] + g.players.reduce((s, p) => s + p.hand[r], 0);
    if (total !== bankSize) throw new Error(`Resource ${r} not conserved: ${total} != ${bankSize}`);
    if (g.bank[r] < 0 || g.players.some((p) => p.hand[r] < 0)) throw new Error('Negative count of ' + r);
  }
  for (const p of g.players) {
    const b = Object.values(g.buildings).filter((x) => x.owner === p.id);
    if (b.filter((x) => x.type === 'village').length + p.pieces.village !== 5) throw new Error('Village pieces off');
    if (b.filter((x) => x.type === 'town').length + p.pieces.town !== 4) throw new Error('Town pieces off');
    if (Object.values(g.roads).filter((x) => x === p.id).length + p.pieces.road !== 15) throw new Error('Road pieces off');
  }
  for (const v of Object.keys(g.buildings)) {
    if (g.board.vertices[v].adj.some((a) => g.buildings[a])) throw new Error('Distance rule broken');
  }
}

let wins = 0; let steps = 0; let stuck = 0;
const t0 = Date.now();
for (let i = 0; i < GAMES; i++) {
  const g = G.createGame('TEST');
  const players = [];
  for (let k = 0; k < N; k++) players.push(G.addPlayer(g, 'Bot' + k));
  G.act(g, players[0].id, { type: 'settings', settings: { friendlyBandit: i % 2 === 0, turnTimer: i % 3 === 0 ? 60 : 0 } });
  G.act(g, players[0].id, { type: 'start' });
  const bankSize = g.bank.wood;
  let s = 0;
  while (g.status === 'playing' && s < 20000) {
    // every so often pretend the stalled player let their timer run out
    if (g.deadline && Math.random() < 0.05) G.tick(g, Infinity); else botStep(g);
    check(g, bankSize); s++;
  }
  steps += s;
  if (g.status === 'over') wins++; else stuck++;
  JSON.stringify(G.viewFor(g, players[0].id)); // views must serialize
}
console.log(`${GAMES} games × ${N} players: ${wins} finished, ${stuck} hit the step cap, avg ${Math.round(steps / GAMES)} actions/game, ${Date.now() - t0}ms`);
if (stuck) process.exitCode = 1;
