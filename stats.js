'use strict';
// Game stats and the end-of-game titles ("behavior tags"). game.js reports what happens (rolls, harvests,
// steals, trades, the score after each move); this file keeps the counts in game.stats and turns them into
// titles like The Couple, Lone Wolf, Lucky or Thrower when the game ends. A replay rebuilds the same stats.

const WAYS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
const RES = ['wood', 'clay', 'fleece', 'wheat', 'iron'];

function S(game) {
  if (!game.stats) {
    game.stats = { rolls: 0, trades: {}, bank: {}, harbor: {}, robbed: {}, steals: {}, blocked: {}, blockedRolls: {},
      expected: {}, harvest: {}, lead: {} };
  }
  return game.stats;
}
const inc = (obj, k, n = 1) => { obj[k] = (obj[k] || 0) + n; };

// A turn roll: what each player's tiles should give on average (a 2-dice number n comes up WAYS[n]/36 of the
// time), and the cards the bandit kept from them this roll. The bandit's tile doesn't count toward luck.
function onRoll(game, sum) {
  const s = S(game); s.rolls++;
  for (const [v, b] of Object.entries(game.buildings)) {
    const n = b.type === 'town' ? 2 : 1;
    for (const hid of game.board.vertices[v].hexes) {
      const h = game.board.hexes[hid];
      if (!h.num) continue;
      if (h.id !== game.bandit) inc(s.expected, b.owner, (n * WAYS[h.num]) / 36);
      else if (h.num === sum) { inc(s.blocked, b.owner, n); inc(s.blockedRolls, b.owner); }
    }
  }
}
function onHarvest(game, got) {
  const s = S(game);
  for (const [pid, cards] of Object.entries(got)) {
    const mine = s.harvest[pid] || (s.harvest[pid] = {});
    for (const [r, n] of Object.entries(cards)) inc(mine, r, n);
  }
}
function onSteal(game, thiefId, victimId) { const s = S(game); inc(s.robbed, victimId); inc(s.steals, thiefId); }
function onPlayerTrade(game, a, b) {
  const s = S(game);
  inc(s.trades[a] || (s.trades[a] = {}), b); inc(s.trades[b] || (s.trades[b] = {}), a);
}
// lots: [{ rate }] — 4:1 lots go to the bank count, cheaper ones to the harbor count
function onBankTrade(game, pid, lots) {
  const s = S(game);
  for (const { rate, n } of lots) inc(rate < 4 ? s.harbor : s.bank, pid, n);
}
// After every move: each player's lead over the best other player (negative when behind), lowest and highest.
function onScore(game, points) {
  const s = S(game);
  for (const [pid, mine] of Object.entries(points)) {
    const best = Math.max(...Object.entries(points).filter(([id]) => id !== pid).map(([, v]) => v));
    const lead = mine - best; const L = s.lead[pid] || (s.lead[pid] = { max: 0, min: 0 });
    if (lead > L.max) L.max = lead;
    if (lead < L.min) L.min = lead;
  }
}

const luck = (s, pid) => {
  const exp = s.expected[pid] || 0;
  const got = Object.values(s.harvest[pid] || {}).reduce((a, b) => a + b, 0);
  return exp >= 3 ? { exp, got, ratio: got / exp } : { exp, got, ratio: null };
};
const tradeCount = (s, pid) => Object.values(s.trades[pid] || {}).reduce((a, b) => a + b, 0);

// What everyone can see during the game (Dice stats → By player).
function publicStats(game) {
  const s = S(game); const out = {};
  for (const p of game.players) {
    const l = luck(s, p.id);
    out[p.id] = { robbed: s.robbed[p.id] || 0, steals: s.steals[p.id] || 0, blocked: s.blocked[p.id] || 0,
      blockedRolls: s.blockedRolls[p.id] || 0, luck: l.ratio === null ? null : Math.round(l.ratio * 100),
      expected: Math.round(l.exp * 10) / 10, harvested: l.got, trades: tradeCount(s, p.id),
      bank: s.bank[p.id] || 0, harbor: s.harbor[p.id] || 0 };
  }
  return out;
}

// The titles, once the game is over: { pid: [{ key, ico, label, desc }] }
function tags(game) {
  const s = S(game); const ps = game.players; const n = ps.length;
  const out = Object.fromEntries(ps.map((p) => [p.id, []]));
  const name = (id) => (ps.find((p) => p.id === id) || {}).name || '?';
  const add = (pid, key, ico, label, desc) => out[pid].push({ key, ico, label, desc });
  // the single top player for a count, if they reach the minimum and nobody ties them
  const top = (obj, min) => {
    const list = ps.map((p) => [p.id, obj(p.id)]).sort((a, b) => b[1] - a[1]);
    return list[0][1] >= min && (list.length < 2 || list[0][1] > list[1][1]) ? list[0] : null;
  };
  const long = s.rolls >= 12; // titles about habits need a real game behind them

  // trading habits
  const couples = new Set();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = ps[i].id, b = ps[j].id; const t = (s.trades[a] || {})[b] || 0;
      if (t >= 3 && t >= 0.7 * tradeCount(s, a) && t >= 0.7 * tradeCount(s, b)) {
        couples.add(a); couples.add(b);
        add(a, 'couple', '💞', 'The Couple', `Traded ${t} times with ${name(b)}, and hardly with anyone else`);
        add(b, 'couple', '💞', 'The Couple', `Traded ${t} times with ${name(a)}, and hardly with anyone else`);
      }
    }
  }
  // the Black Hole: traded with everyone, and more than anyone else who did (one per game)
  const holes = new Set();
  if (n >= 3) {
    const everyone = ps.filter((p) => !couples.has(p.id) && Object.values(s.trades[p.id] || {}).filter((x) => x > 0).length >= n - 1);
    const hole = top((id) => (everyone.some((p) => p.id === id) ? tradeCount(s, id) : 0), 4);
    if (hole) { holes.add(hole[0]); add(hole[0], 'blackhole', '🕳️', 'Black Hole', `Traded with every other player (${hole[1]} trades)`); }
  }
  const deal = top((id) => tradeCount(s, id), 5);
  if (deal && !holes.has(deal[0]) && !couples.has(deal[0])) add(deal[0], 'dealmaker', '🤝', 'Dealmaker', `Most trades with players (${deal[1]})`);
  if (long) for (const p of ps) if (tradeCount(s, p.id) <= 1) add(p.id, 'lonewolf', '🐺', 'Lone Wolf', tradeCount(s, p.id) ? 'Traded with another player only once' : 'Never traded with another player');
  const bank = top((id) => s.bank[id] || 0, 4);
  if (bank) add(bank[0], 'banker', '🏦', 'Banker', `Most 4:1 trades with the bank (${bank[1]})`);
  const harbor = top((id) => s.harbor[id] || 0, 3);
  if (harbor) add(harbor[0], 'harbor', '⚓', 'Harbor Master', `Most harbor trades (${harbor[1]})`);

  // the dice
  const lucks = ps.map((p) => [p.id, luck(s, p.id)]).filter(([, l]) => l.ratio !== null && l.exp >= 6);
  if (lucks.length) {
    lucks.sort((a, b) => b[1].ratio - a[1].ratio);
    const [hi, lo] = [lucks[0], lucks[lucks.length - 1]];
    if (hi[1].ratio >= 1.2) add(hi[0], 'lucky', '🍀', 'Lucky', `The dice gave ${hi[1].got} cards where ${Math.round(hi[1].exp)} were expected (${Math.round(hi[1].ratio * 100)}%)`);
    if (lo[0] !== hi[0] && lo[1].ratio <= 0.8) add(lo[0], 'unlucky', '🌧️', 'Unlucky', `The dice gave ${lo[1].got} cards where ${Math.round(lo[1].exp)} were expected (${Math.round(lo[1].ratio * 100)}%)`);
  }

  // how the race went
  if (game.status === 'over' && game.winner) {
    for (const p of ps) {
      const L = s.lead[p.id] || { max: 0, min: 0 };
      if (p.id !== game.winner && L.max >= 3) add(p.id, 'thrower', '📉', 'Thrower', `Led by ${L.max} points at one point, and still lost`);
      if (p.id === game.winner && L.min <= -3) add(p.id, 'comeback', '🚀', 'Comeback', `Was ${-L.min} points behind at one point, and won`);
    }
  }

  // resources: someone who collected most of all of one (a near-monopoly); each player keeps their biggest one
  const barons = {};
  for (const r of RES) {
    const total = ps.reduce((a, p) => a + ((s.harvest[p.id] || {})[r] || 0), 0);
    if (total < 10) continue;
    for (const p of ps) {
      const mine = (s.harvest[p.id] || {})[r] || 0; const share = mine / total;
      if (share > 0.6 && (!barons[p.id] || share > barons[p.id].share)) barons[p.id] = { r, mine, total, share };
    }
  }
  for (const [pid, b] of Object.entries(barons)) {
    add(pid, 'baron-' + b.r, '👑', `${b.r[0].toUpperCase()}${b.r.slice(1)} Baron`, `Collected ${b.mine} of the ${b.total} ${b.r} the dice gave out (${Math.round(b.share * 100)}%)`);
  }

  // the bandit
  const magnet = top((id) => s.robbed[id] || 0, 3);
  if (magnet) add(magnet[0], 'magnet', '🎯', 'Bandit Magnet', `Robbed ${magnet[1]} times`);
  const thief = top((id) => s.steals[id] || 0, 3);
  if (thief) add(thief[0], 'thief', '🥷', 'Thief', `Stole ${thief[1]} cards`);
  const siege = top((id) => s.blocked[id] || 0, 4);
  if (siege) add(siege[0], 'siege', '🚧', 'Under Siege', `Lost ${siege[1]} cards to the bandit sitting on their tiles`);
  // at most 3 titles each, the most telling first
  const ORDER = ['comeback', 'thrower', 'couple', 'lucky', 'unlucky', 'baron', 'blackhole', 'lonewolf', 'magnet', 'siege', 'thief', 'dealmaker', 'harbor', 'banker'];
  const rank = (t) => ORDER.indexOf(t.key.replace(/-.*/, ''));
  for (const pid of Object.keys(out)) out[pid] = out[pid].sort((a, b) => rank(a) - rank(b)).slice(0, 3);
  return out;
}

// Stats copied to a game whose players have other ids (a loaded save): ids are swapped through idMap.
function remap(stats, idMap) {
  const swap = (obj) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [idMap[k] || k, v]));
  const out = { ...stats };
  for (const k of ['bank', 'harbor', 'robbed', 'steals', 'blocked', 'blockedRolls', 'expected', 'harvest', 'lead']) out[k] = swap(stats[k]);
  out.trades = Object.fromEntries(Object.entries(stats.trades || {}).map(([k, v]) => [idMap[k] || k, swap(v)]));
  return out;
}

module.exports = { onRoll, onHarvest, onSteal, onPlayerTrade, onBankTrade, onScore, publicStats, tags, remap };
