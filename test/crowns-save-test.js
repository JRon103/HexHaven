'use strict';
// Save / load / replay checks for Crowns & Raiders: bots play the mode (wardens, walls, edicts, raids),
// then the save must load to the same game, and its history must replay to it exactly.
// Usage: node test/crowns-save-test.js [games]
const G = require('../game');
const S = require('../save');
const { botStep } = require('./crowns-sim');

const GAMES = Number(process.argv[2]) || 10;
const meaning = (g) => JSON.stringify(S.encodeSnapshot(g));
let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; console.log('  FAIL:', what); } };

for (let gi = 0; gi < GAMES; gi++) {
  const n = 2 + (gi % 7);
  const g = G.createGame('K' + gi);
  const ps = Array.from({ length: n }, (_, i) => G.addPlayer(g, 'P' + i));
  G.act(g, ps[0].id, { type: 'settings', settings: { mode: 'crowns', turnTimer: gi % 2 ? 60 : 0, builderPhase: gi % 3 === 0, firstRaid: [7, 14][gi % 2], fog: gi % 3 === 1 } });
  G.act(g, ps[0].id, { type: 'start' });
  const stopAt = gi % 4 === 3 ? 30000 : 100 + Math.floor(Math.random() * 1500);
  for (let s = 0; s < stopAt && g.status === 'playing'; s++) {
    if (g.deadline && Math.random() < 0.02) G.tick(g, Infinity); else botStep(g);
    if (s === 300) G.reseed(g);
  }
  const label = `crowns game ${gi + 1} (${n} players, ${g.history.moves.length} moves, phase ${g.turn.phase}, ${g.status})`;

  const text = S.stringifySave(S.exportSave(g));
  const file = JSON.parse(text);
  const { game: loaded, notes } = S.importSave(file, 'LOAD');
  check(meaning(loaded) === meaning(g), `${label}: loaded game differs`);
  check(notes[0].startsWith('Kept the full history'), `${label}: history not kept (${notes.join(' ')})`);
  check(JSON.stringify(loaded.cr) === JSON.stringify(g.cr) || meaning(loaded) === meaning(g), `${label}: crowns state differs`);
  for (let s = 0; s < 200 && loaded.status === 'playing'; s++) botStep(loaded);

  const rp = S.replayer(file);
  const end = rp.stateAt(rp.length);
  check(!end.error && meaning(end.game) === meaning(g), `${label}: replay differs ${end.error ? end.error.message + ' at ' + end.error.line : ''}`);
  const mid = rp.stateAt(Math.floor(Math.random() * rp.length));
  check(!mid.error, `${label}: replay failed midway`);
  JSON.stringify(G.viewFor(mid.game, mid.game.players[0].id));

  const again = JSON.parse(S.stringifySave(S.exportSave(loaded)));
  const rp2 = S.replayer(again).stateAt(again.history.moves.length);
  check(!rp2.error && meaning(rp2.game) === meaning(loaded), `${label}: history after loading doesn't replay`);

  // a hand edit: give seat 1 nine silver; the game continues from the edit
  const edited = JSON.parse(text); edited.players[0].hand = 'Si9 ' + edited.players[0].hand.replace(/Si\d+\s?/, '');
  const ed = S.importSave(edited, 'ED');
  check(ed.game.players.find((p) => p.seat === 1).hand.silver === 9, `${label}: commodity edit not applied`);
  for (let s = 0; s < 100 && ed.game.status === 'playing'; s++) botStep(ed.game);
  if (gi < 2 || failures) console.log(`${label}: ${text.length} bytes; ok so far`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : `\nAll Crowns & Raiders save/load/replay checks passed (${GAMES} games).`);
process.exitCode = failures ? 1 : 0;
