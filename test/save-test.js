'use strict';
// Save / load / replay checks. Bots play real games (with timeouts, trades, counters, dev cards and a
// mid-game reseed); then we save, load, replay and hand-edit the file and check the results.
// Usage: node test/save-test.js [games]
const G = require('../game');
const S = require('../save');
const { RES } = G;

const GAMES = Number(process.argv[2]) || 12;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const has = (h, c) => RES.every((r) => h[r] >= (c[r] || 0));
const meaning = (g) => JSON.stringify(S.encodeSnapshot(g));
const tryAct = (g, pid, a) => { try { G.act(g, pid, a); return true; } catch (e) { if (!e.user) throw e; return false; } };
let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log('  FAIL:', what); } };

function botStep(g) {
  const pid = G.viewFor(g, g.players[0].id).stalled[0];
  const v = G.viewFor(g, pid); const t = v.turn; const p = g.players.find((x) => x.id === pid);
  if (g.deadline && Math.random() < 0.03) return G.tick(g, Infinity); // the turn timer runs out
  switch (t.phase) {
    case 'order':
      // now and then someone wants a different island: the host rerolls, or the table votes
      if (Math.random() < 0.15) { const r = Math.random(); const who = pick(g.players).id; if (r < 0.3 ? tryAct(g, g.hostId, { type: 'rerollMap' }) : r < 0.9 ? tryAct(g, who, { type: 'mapVote', value: pick([1, 1, -1, 0]) }) : tryAct(g, g.hostId, { type: 'mapDecide', reroll: Math.random() < 0.5 })) return; }
      return G.act(g, pid, { type: 'roll' });
    case 'preroll': return G.act(g, pid, { type: 'roll' });
    case 'setup': return G.act(g, pid, t.setupNeed === 'village' ? { type: 'buildVillage', vertex: pick(v.hints.villages) } : { type: 'buildRoad', edge: pick(v.hints.roads) });
    case 'discard': {
      const n = g.pendingDiscard[pid]; const c = { wood: 0, clay: 0, fleece: 0, wheat: 0, iron: 0 }; const h = { ...p.hand };
      for (let i = 0; i < n; i++) { const r = pick(RES.filter((x) => h[x] > 0)); h[r]--; c[r]++; }
      return G.act(g, pid, { type: 'discard', cards: c });
    }
    case 'robber': return G.act(g, pid, { type: 'moveBandit', hex: pick(v.hints.hexes) });
    case 'steal': return G.act(g, pid, { type: 'steal', victim: pick(t.victims), card: 0 });
    case 'roadbuilding': return G.act(g, pid, v.hints.roads.length ? { type: 'buildRoad', edge: pick(v.hints.roads) } : { type: 'skipRoads' });
    default: {
      if (v.hints.towns.length && has(p.hand, v.cost.town) && tryAct(g, pid, { type: 'buildTown', vertex: pick(v.hints.towns) })) return;
      if (v.hints.villages.length && has(p.hand, v.cost.village) && tryAct(g, pid, { type: 'buildVillage', vertex: pick(v.hints.villages) })) return;
      if (v.hints.roads.length && has(p.hand, v.cost.road) && Math.random() < 0.6 && tryAct(g, pid, { type: 'buildRoad', edge: pick(v.hints.roads) })) return;
      if (has(p.hand, v.cost.scroll) && Math.random() < 0.5 && tryAct(g, pid, { type: 'buyScroll' })) return;
      if (t.phase === 'main') {
        const s = v.myScrolls.find((x) => !x.fresh && x.type !== 'vp');
        if (s && !t.devPlayed && Math.random() < 0.4 && tryAct(g, pid, { type: 'playScroll', kind: s.type, res: pick(RES), res2: pick(RES) })) return;
        const rich = RES.find((r) => p.hand[r] >= v.rates[r]);
        if (rich && Math.random() < 0.3 && tryAct(g, pid, { type: 'bankTrade', give: { [rich]: v.rates[r = rich] }, get: { [pick(RES.filter((x) => x !== rich))]: 1 } })) return;
        const give = RES.find((r) => p.hand[r] > 0);
        if (give && !g.trade && Math.random() < 0.2) {
          const get = pick(RES.filter((r) => r !== give));
          if (tryAct(g, pid, { type: 'proposeTrade', give: { [give]: 1 }, get: { [get]: 1 } })) {
            for (const o of g.players) if (o.id !== pid) {
              const spare = RES.find((r) => o.hand[r] > 0 && r !== give);
              if (spare && Math.random() < 0.3) tryAct(g, o.id, { type: 'respondTrade', id: g.trade.id, counter: { give: { [spare]: 1 }, get: { [give]: 1 } } });
              else tryAct(g, o.id, { type: 'respondTrade', id: g.trade.id, accept: Math.random() < 0.5 });
            }
            const ok = Object.keys(g.trade.responses).filter((k) => g.trade.responses[k] !== 'decline');
            if (!(ok.length && tryAct(g, pid, { type: 'confirmTrade', with: pick(ok) }))) G.act(g, pid, { type: 'cancelTrade' });
            return;
          }
        }
      }
      return G.act(g, pid, { type: t.phase === 'builder' ? 'builderDone' : 'endTurn' });
    }
  }
}
let r; // eslint-disable-line no-unused-vars

for (let gi = 0; gi < GAMES; gi++) {
  const n = 2 + (gi % 7);
  const g = G.createGame('T' + gi);
  const ps = Array.from({ length: n }, (_, i) => G.addPlayer(g, 'P' + i));
  G.act(g, ps[0].id, { type: 'settings', settings: { turnTimer: gi % 2 ? 60 : 0, fog: gi % 3 === 1, mapStyle: gi % 4 === 3 ? 'random' : 'balanced' } });
  G.act(g, ps[0].id, { type: 'start' });
  const stopAt = gi % 5 === 4 ? 20000 : 30 + Math.floor(Math.random() * 400); // every 5th game plays to the end
  for (let s = 0; s < stopAt && g.status === 'playing'; s++) { botStep(g); if (s === 120) G.reseed(g); }
  const label = `game ${gi + 1} (${n} players, ${g.history.moves.length} moves, ${g.status})`;

  // 1) save → text → load: same game, history kept, play goes on
  const text = S.stringifySave(S.exportSave(g));
  const file = JSON.parse(text);
  const { game: loaded, notes } = S.importSave(file, 'LOAD');
  check(meaning(loaded) === meaning(g), `${label}: loaded game differs`);
  check(notes[0].startsWith('Kept the full history'), `${label}: history not kept (${notes.join(' ')})`);
  check(loaded.rng.s === g.rng.s, `${label}: seed not restored`);
  for (let s = 0; s < 60 && loaded.status === 'playing'; s++) botStep(loaded);

  // 2) replay reproduces the live game exactly, and any point in between is a valid game
  const rp = S.replayer(file);
  const end = rp.stateAt(rp.length);
  check(!end.error && meaning(end.game) === meaning(g), `${label}: replay differs ${end.error ? end.error.message + ' at ' + end.error.line : ''}`);
  const mid = rp.stateAt(Math.floor(Math.random() * rp.length));
  check(!mid.error, `${label}: replay failed midway`);
  JSON.stringify(G.viewFor(mid.game, mid.game.players[0].id));

  // 3) the loaded game keeps recording: save it again and the history still replays to it
  const again = JSON.parse(S.stringifySave(S.exportSave(loaded)));
  const rp2 = S.replayer(again).stateAt(again.history.moves.length);
  check(!rp2.error && meaning(rp2.game) === meaning(loaded), `${label}: history after loading doesn't replay`);

  // 4) cosmetic edits (names, colors, swapping who sits where) keep the history
  const renamed = JSON.parse(text);
  [renamed.players[0].name, renamed.players[1].name] = [renamed.players[1].name, renamed.players[0].name];
  const free = G.COLORS.find((c) => !renamed.players.some((p) => p.color === c));
  if (free) renamed.players[0].color = free;
  const rn = S.importSave(renamed, 'RN');
  check(rn.notes[0].startsWith('Kept the full history'), `${label}: renaming dropped the history`);
  check(rn.game.players.find((p) => p.seat === 1).name === renamed.players[0].name, `${label}: rename not applied`);

  // 5) a real edit (give seat 1 extra wood) continues from the edit, with a fresh history
  const edited = JSON.parse(text); edited.players[0].hand = 'Wo9 ' + edited.players[0].hand.replace(/Wo\d+\s?/, '');
  const ed = S.importSave(edited, 'ED');
  check(ed.game.players.find((p) => p.seat === 1).hand.wood === 9, `${label}: edit not applied`);
  check(ed.notes[0].startsWith('The snapshot was edited') && ed.game.history.moves.length === 0, `${label}: edited save kept a stale history`);

  // 6) a blank seed gives new dice but keeps a replayable history
  const blank = JSON.parse(text); blank.seed = '';
  const bl = S.importSave(blank, 'BL');
  check(/freshly random/.test(bl.notes.join(' ')), `${label}: blank seed not reported`);
  const blRe = S.replayer(JSON.parse(S.stringifySave(S.exportSave(bl.game)))).stateAt(Infinity);
  check(!blRe.error && meaning(blRe.game) === meaning(bl.game), `${label}: history after a blank seed doesn't replay`);
  if (gi < 3 || g.status === 'over' || failures) console.log(`${label}: ${text.length} bytes; ok so far`);
}

// 7) broken edits are rejected with a readable message
const g = G.createGame('X'); const ps = ['a', 'b', 'c'].map((x) => G.addPlayer(g, x)); G.act(g, ps[0].id, { type: 'start' });
const base = JSON.parse(S.stringifySave(S.exportSave(g)));
const bad = [
  ['duplicate color', (f) => { f.players[1].color = f.players[0].color; }, /Two players use the color/],
  ['unknown position', (f) => { f.pieces[1] = { settlements: ['9.9N'], cities: [], roads: [] }; }, /Unknown corner/],
  ['wrong row length', (f) => { f.map.tiles[0] += ' Wo3'; }, /needs 3 tiles/],
  // a 7 on the first numbered tile of row 1 (its first tile may be the dunes, which have no number)
  ['bad number', (f) => { f.map.tiles[0] = f.map.tiles[0].replace(/(Wo|Cl|Fl|Wh|Ir)\d+/, 'Wh7'); }, /needs a number/],
  ['not a save', (f) => { f.hexhaven = 99; }, /not a Hexhaven save/],
];
for (const [what, edit, msg] of bad) {
  const f = JSON.parse(JSON.stringify(base)); edit(f);
  try { S.importSave(f, 'BAD'); check(false, `broken edit accepted: ${what}`); } catch (e) { check(e.user && msg.test(e.message), `${what}: unexpected error "${e.message}"`); }
}

console.log(failures ? `\n${failures} check(s) FAILED` : `\nAll save/load/replay checks passed (${GAMES} games).`);
process.exitCode = failures ? 1 : 0;
