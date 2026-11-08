'use strict';
// Crowns & Raiders: the cities-and-raiders game mode. game.js calls in at its hook points (roll, harvest,
// building rules, points, the 7, setup, auto-play, views); everything specific to the mode lives here.
//
//   Commodities  cities next to forest / pasture / mountains also make parchment / linen / silver
//   Improvements three tracks (Guild·linen, Council·silver, Academy·parchment), levels 1–5; level 3 unlocks a
//                power; the first to level 4 gets that track's Capital (+2), which the first to level 5 can take
//   Raiders      a ship moves on event-die rolls; on arrival, cities (raider strength) vs active wardens:
//                lose → the weakest defenders each lose a city; win → the strongest becomes Defender (+1)
//   Wardens      knights of rank 1–3 standing on corners along your roads; activate with wheat, then move,
//                push away a weaker opponent warden, or chase the bandit
//   Edicts       three decks of action cards, drawn when the event die shows a track's gate and the red die
//                is within reach of your level in that track

const COM = ['parchment', 'linen', 'silver'];
const TRACKS = ['guild', 'council', 'academy'];
const TRACK_COM = { guild: 'linen', council: 'silver', academy: 'parchment' };
const TERRAIN_COM = { wood: 'parchment', fleece: 'linen', iron: 'silver' };
const TRACK_NAME = { guild: 'Guild', council: 'Council', academy: 'Academy' };
const POWER = {
  guild: 'Trading Hall — trade commodities 2:1 with the bank',
  council: 'Citadel — wardens can be promoted to Champions (rank 3)',
  academy: 'Waterworks — when a roll gives you nothing, take any one resource',
};
const RANK = { 1: 'Warden', 2: 'Veteran', 3: 'Champion' };
const EVENT_FACES = ['ship', 'ship', 'ship', 'guild', 'council', 'academy'];
const RAID_AT = 7;          // the ship reaches the island on its 7th step
const FIRST_RAID = [7, 10, 14, 21]; // lobby choices for the first arrival (later raids always take 7 steps)
// Steps the ship needs this time: the first arrival can be set later in the lobby to give everyone time to build.
const raidAt = (game) => (game.cr.raids === 0 && FIRST_RAID.includes(game.settings.firstRaid) ? game.settings.firstRaid : RAID_AT);
const EDICT_HAND = 4;       // most edicts you can hold (point edicts don't count)
const COST = {
  wall: { clay: 2 }, warden: { fleece: 1, iron: 1 }, activate: { wheat: 1 }, promote: { fleece: 1, iron: 1 }, healer: { iron: 2, wheat: 1 },
};

const EDICTS = {
  // Academy (parchment)
  loadeddice: { deck: 'academy', n: 2, name: 'Weighted Dice', when: 'preroll', desc: 'Play before rolling: choose what the two number dice show. The event die still rolls.' },
  surveyor: { deck: 'academy', n: 2, name: 'Surveyor', desc: 'Swap the numbers of two tiles. Neither may be a 2, 6, 8 or 12.' },
  mason: { deck: 'academy', n: 2, name: 'Master Mason', desc: 'Your next city improvement this turn costs one commodity less.' },
  irrigation: { deck: 'academy', n: 2, name: 'Irrigation', desc: 'Take 2 wheat for every wheat tile next to your settlements and cities.' },
  mining: { deck: 'academy', n: 2, name: 'Deep Mining', desc: 'Take 2 iron for every mountain tile next to your settlements and cities.' },
  engineer: { deck: 'academy', n: 1, name: 'Engineer', desc: 'Build a city wall for free.' },
  healer: { deck: 'academy', n: 2, name: 'Healer', desc: 'Upgrade a settlement to a city for just 2 iron and 1 wheat.' },
  paving: { deck: 'academy', n: 2, name: 'Paving Crew', desc: 'Build 2 roads for free.' },
  smith: { deck: 'academy', n: 2, name: 'Smith', desc: 'Promote up to 2 of your wardens for free.' },
  press: { deck: 'academy', n: 1, name: 'Printing Press', vp: true, desc: '+1 victory point, shown as soon as you draw it.' },
  // Guild (linen)
  harbortax: { deck: 'guild', n: 2, name: 'Harbor Tax', desc: 'Each opponent holding a commodity gives you one; you give each of them one resource back, if you have any.' },
  mastermerchant: { deck: 'guild', n: 2, name: 'Master Merchant', desc: 'Take 2 random cards from a player with more points than you.' },
  merchant: { deck: 'guild', n: 6, name: 'Merchant', desc: 'Put the merchant on a tile next to your settlement or city: trade its resource 2:1, and hold +1 point while it stays with you.' },
  fleet: { deck: 'guild', n: 2, name: 'Merchant Fleet', desc: 'For the rest of this turn, trade one resource or commodity of your choice 2:1 with the bank.' },
  resembargo: { deck: 'guild', n: 4, name: 'Resource Embargo', desc: 'Name a resource: every other player gives you up to 2 of it.' },
  comembargo: { deck: 'guild', n: 2, name: 'Commodity Embargo', desc: 'Name a commodity: every other player gives you 1 of it, if they can.' },
  // Council (silver)
  inquisitor: { deck: 'council', n: 2, name: 'Inquisitor', desc: 'Move the bandit and take 1 random card from every player with a building on its new tile.' },
  charter: { deck: 'council', n: 1, name: 'Charter', vp: true, desc: '+1 victory point, shown as soon as you draw it.' },
  deserter: { deck: 'council', n: 2, name: 'Deserter', desc: "Remove an opponent's warden, and place one of your own of the same rank (if you have one) where you could build a warden." },
  diplomat: { deck: 'council', n: 2, name: 'Diplomat', desc: 'Remove a road with a loose end. If it is yours, build it again somewhere for free.' },
  intrigue: { deck: 'council', n: 2, name: 'Intrigue', desc: "Push away an opponent's warden that stands on one of your roads." },
  saboteur: { deck: 'council', n: 2, name: 'Saboteur', desc: 'Every player with at least as many points as you discards half their cards, at random.' },
  spy: { deck: 'council', n: 3, name: 'Spy', desc: 'Take a random edict from another player (not a point card).' },
  warlord: { deck: 'council', n: 2, name: 'Warlord', desc: 'Activate all of your wardens for free.' },
  wedding: { deck: 'council', n: 2, name: 'Wedding', desc: 'Every player with more points than you gives you 2 random cards.' },
};

// What each edict asks the player to pick (the client builds its prompts from this).
const TARGET = { loadeddice: 'dice', surveyor: 'tiles2', engineer: 'wallCity', healer: 'settlement', smith: 'myWardens', mastermerchant: 'richer',
  merchant: 'merchantTile', fleet: 'anyCard', resembargo: 'res', comembargo: 'com', inquisitor: 'banditTile', deserter: 'deserter',
  diplomat: 'road', intrigue: 'foeWardenOnRoad', spy: 'edictHolder' };
const INFO = { edicts: Object.fromEntries(Object.entries(EDICTS).map(([k, e]) => [k, { ...e, target: TARGET[k] || null }])), power: POWER, rank: RANK };

const ACTIONS = new Set(['buildWall', 'buildWarden', 'activateWarden', 'promoteWarden', 'wardenMove', 'wardenDisplace', 'wardenChase',
  'improve', 'raidLose', 'takeFree', 'drawEdict', 'playEdict']);

let X = null; // helpers from game.js (log, fail, rint, …), set by bind()
function bind(ctx) { X = ctx; }

const on = (game) => !!(game && game.cr && game.settings && game.settings.mode === 'crowns');
const handles = (type) => ACTIONS.has(type);
const wardenAt = (game, v) => (game.cr ? game.cr.wardens[v] || null : null);
const banditFree = (game) => game.cr.raids > 0;
const isTown = (b) => b && b.type === 'town';
const capitalAt = (game, v) => TRACKS.find((k) => game.cr.capitals[k] === Number(v)) || null;
const ownCities = (game, pid) => Object.entries(game.buildings).filter(([, b]) => b.owner === pid && isTown(b)).map(([v]) => Number(v));
const strength = (game, pid) => Object.values(game.cr.wardens).filter((w) => w.owner === pid && w.active).reduce((s, w) => s + w.level, 0);
const totalCities = (game) => Object.values(game.buildings).filter(isTown).length;

// ---------- setup ----------
function setup(game) {
  const n = game.players.length;
  const supply = n <= 4 ? 12 : n <= 6 ? 15 : 18;
  for (const c of COM) game.bank[c] = supply;
  game.deck = []; // no development cards in this mode
  const decks = { guild: [], council: [], academy: [] };
  for (const [k, e] of Object.entries(EDICTS)) for (let i = 0; i < e.n; i++) decks[e.deck].push(k);
  for (const d of TRACKS) X.shuffle(decks[d]);
  game.cr = { raiders: 0, raids: 0, wardens: {}, walls: {}, capitals: { guild: null, council: null, academy: null }, decks,
    merchant: null, lastEvent: null, pendingRaid: {}, afterRaid: null, fixedDice: null, fleet: null, mason: 0 };
  for (const p of game.players) {
    p.cr = { improve: { guild: 0, council: 0, academy: 0 }, edicts: [], defender: 0, edictVP: 0, freePicks: 0, edictPicks: 0,
      wardenPieces: { 1: 2, 2: 2, 3: 2 }, wallPieces: 3 };
  }
  X.log(game, '👑 Crowns & Raiders: cities make commodities, the raiders are coming, and the first to 13 points wins.');
}

function newTurn(game) {
  game.cr.fixedDice = null; game.cr.fleet = null; game.cr.mason = 0;
}

// ---------- points, harvest, trade rates, hand limit ----------
function pointParts(game, p) {
  const caps = TRACKS.filter((k) => { const c = game.cr.capitals[k]; return c !== null && game.buildings[c] && game.buildings[c].owner === p.id; });
  const out = [];
  if (caps.length) out.push({ key: 'capitals', label: `Capital${caps.length > 1 ? 's' : ''} (${caps.map((k) => TRACK_NAME[k]).join(', ')})`, count: caps.length, each: 2, n: 2 * caps.length });
  if (p.cr.defender) out.push({ key: 'defender', label: 'Defender of the Isle', count: p.cr.defender, each: 1, n: p.cr.defender });
  if (game.cr.merchant && game.cr.merchant.owner === p.id) out.push({ key: 'merchant', label: 'Merchant', count: 1, each: 1, n: 1 });
  if (p.cr.edictVP) out.push({ key: 'edicts', label: 'Point edicts', count: p.cr.edictVP, each: 1, n: p.cr.edictVP });
  return out;
}
function extraPoints(game, p) { return pointParts(game, p).reduce((s, x) => s + x.n, 0); }

function cityYield(res, type) {
  if (type === 'town' && TERRAIN_COM[res]) return [[res, 1], [TERRAIN_COM[res], 1]];
  return [[res, type === 'town' ? 2 : 1]];
}

function afterHarvest(game, got) {
  for (const p of game.players) {
    if (p.cr.improve.academy >= 3 && !got[p.id]) {
      p.cr.freePicks++;
      X.log(game, `💧 Waterworks: ${p.name} got nothing this roll and may take any one resource.`);
    }
  }
}

function rate(game, pid, card) {
  let r = 4;
  const p = X.P(game, pid);
  if (COM.includes(card) && p.cr.improve.guild >= 3) r = 2;
  if (game.cr.fleet && game.cr.fleet.pid === pid && game.cr.fleet.card === card) r = 2;
  const m = game.cr.merchant;
  if (m && m.owner === pid && game.board.hexes[m.hex].res === card) r = 2;
  return r;
}

const wallBonus = (game, p) => 2 * Object.values(game.cr.walls).filter((o) => o === p.id).length;

function canAffordAny(game, p) {
  const h = p.hand;
  if (X.hasRes(h, COST.wall) && p.cr.wallPieces > 0 && ownCities(game, p.id).some((v) => !game.cr.walls[v])) return true;
  if (X.hasRes(h, COST.warden) && p.cr.wardenPieces[1] > 0) return true;
  if (X.hasRes(h, COST.activate) && Object.values(game.cr.wardens).some((w) => w.owner === p.id && !w.active)) return true;
  return TRACKS.some((k) => p.cr.improve[k] < 5 && (h[TRACK_COM[k]] || 0) >= p.cr.improve[k] + 1);
}

// ---------- the roll: the event die ----------
function takeFixedDice(game) { const d = game.cr.fixedDice; game.cr.fixedDice = null; return d; }

// Returns true if the roll must wait (players choosing which city the raiders sack).
function rollEvent(game, p, red, sum) {
  const cr = game.cr;
  const face = EVENT_FACES[X.rint(6)];
  cr.lastEvent = face; game.turn.event = face;
  if (game.lastRoll) game.lastRoll.event = face;
  if (face === 'ship') {
    cr.raiders++;
    X.log(game, `⛵ The raiders' ship sails closer (${cr.raiders}/${raidAt(game)}).`);
    if (cr.raiders >= raidAt(game) && raid(game)) { cr.afterRaid = sum; game.turn.phase = 'raid'; return true; }
  } else {
    X.log(game, `🚪 The ${TRACK_NAME[face]} gate opens (red die ${red}).`);
    drawFor(game, face, red);
  }
  return false;
}

// Everyone whose level in the track reaches the red die draws an edict (level n covers red 1…n+1).
function drawFor(game, track, red) {
  const n = game.players.length; const start = game.turn.idx;
  for (let i = 0; i < n; i++) {
    const p = game.players[(start + i) % n];
    const lvl = p.cr.improve[track];
    if (lvl >= 1 && red <= lvl + 1) drawEdict(game, p, track);
  }
}

function drawEdict(game, p, track) {
  const deck = game.cr.decks[track];
  if (!deck.length) { X.log(game, `The ${TRACK_NAME[track]} edicts have run out.`); return; }
  const type = deck.shift();
  const e = EDICTS[type];
  if (e.vp) {
    p.cr.edictVP++;
    X.log(game, `📜 ${p.name} drew ${e.name} — +1 point!`);
    return;
  }
  if (p.cr.edicts.length >= EDICT_HAND) {
    deck.push(type);
    X.log(game, `📜 ${p.name}'s hand of edicts is full (${EDICT_HAND}); the ${TRACK_NAME[track]} edict goes back.`);
    return;
  }
  p.cr.edicts.push({ type, got: game.turn.number });
  X.log(game, `📜 ${p.name} drew a ${TRACK_NAME[track]} edict.`);
  X.log(game, `Your new edict: ${e.name}.`, p.id);
}

// ---------- raids ----------
// Returns true when some players must choose which city they lose.
function raid(game) {
  const cr = game.cr;
  const attack = totalCities(game);
  const byPlayer = Object.fromEntries(game.players.map((p) => [p.id, strength(game, p.id)]));
  const defense = Object.values(byPlayer).reduce((s, n) => s + n, 0);
  X.log(game, `⚔️ The raiders land! Raider strength ${attack} (one per city) against wardens ${defense}.`, null, { type: 'raid', attack, defense });
  cr.pendingRaid = {};
  const rec = { id: cr.raids + 1, attack, defense, strength: byPlayer, outcome: 'empty', defender: null, shared: [], losers: [], choosing: [] };
  cr.lastRaid = rec;
  if (attack > 0 && defense >= attack) {
    const best = Math.max(...Object.values(byPlayer));
    const top = game.players.filter((p) => byPlayer[p.id] === best && best > 0);
    rec.outcome = 'hold';
    if (top.length === 1) { rec.defender = top[0].id; top[0].cr.defender++; X.log(game, `🛡️ The island holds! ${top[0].name} is Defender of the Isle (+1 point).`); }
    else if (top.length) {
      rec.shared = top.map((p) => p.id);
      for (const p of top) p.cr.edictPicks++;
      X.log(game, `🛡️ The island holds! ${top.map((p) => p.name).join(', ')} share the honor and each draw an edict.`);
    }
  } else if (attack > 0) {
    const exposed = game.players.filter((p) => ownCities(game, p.id).some((v) => !capitalAt(game, v)));
    if (exposed.length) {
      const weakest = Math.min(...exposed.map((p) => byPlayer[p.id]));
      rec.outcome = 'fall';
      for (const p of exposed.filter((x) => byPlayer[x.id] === weakest)) {
        const open = ownCities(game, p.id).filter((v) => !capitalAt(game, v));
        rec.losers.push(p.id);
        if (open.length === 1) sack(game, open[0]);
        else { cr.pendingRaid[p.id] = 1; rec.choosing.push(p.id); }
      }
      X.log(game, `🔥 The raiders win. ${exposed.filter((x) => byPlayer[x.id] === weakest).map((x) => x.name).join(', ')} lose a city.`);
    } else { rec.outcome = 'capitals'; X.log(game, '🔥 The raiders win, but every city is a protected capital.'); }
  } else X.log(game, 'There are no cities to plunder yet; the raiders sail away.');
  for (const w of Object.values(cr.wardens)) w.active = false;
  cr.raiders = 0;
  if (cr.raids === 0) X.log(game, '🏜️ The bandit is free to leave the dunes from now on.');
  cr.raids++;
  return Object.keys(cr.pendingRaid).length > 0;
}

// A raided city falls back to a settlement (or disappears if no settlement pieces are left); its wall is lost.
function sack(game, v) {
  const b = game.buildings[v]; const owner = X.P(game, b.owner);
  if (game.cr.walls[v]) { delete game.cr.walls[v]; owner.cr.wallPieces++; }
  owner.pieces.town++;
  if (owner.pieces.village > 0) { b.type = 'village'; owner.pieces.village--; } else delete game.buildings[v];
  X.log(game, `🔥 ${owner.name}'s city is sacked and becomes a settlement.`);
  X.updateLongest(game);
}

function finishRaid(game) {
  const sum = game.cr.afterRaid; game.cr.afterRaid = null; game.cr.pendingRaid = {};
  X.afterRoll(game, sum);
}

function autoRaid(game) {
  for (const pid of Object.keys(game.cr.pendingRaid)) {
    const open = ownCities(game, pid).filter((v) => !capitalAt(game, v));
    if (open.length) sack(game, open[X.rint(open.length)]);
  }
  finishRaid(game);
}

// ---------- wardens ----------
const touchesOwnRoad = (game, pid, v) => game.board.vertices[v].edges.some((e) => game.roads[e] === pid);
const emptyCorner = (game, v) => !game.buildings[v] && !game.cr.wardens[v];
const wardenSpots = (game, pid) => game.board.vertices.filter((V) => emptyCorner(game, V.id) && touchesOwnRoad(game, pid, V.id)).map((V) => V.id);

// Corners a warden can reach along its owner's roads: empty ones to move to, and opponent wardens it could push.
function reach(game, pid, from) {
  const seen = new Set([from]); const queue = [from]; const empty = []; const foes = [];
  while (queue.length) {
    const v = queue.shift();
    for (const e of game.board.vertices[v].edges) {
      if (game.roads[e] !== pid) continue;
      const E = game.board.edges[e]; const o = E.a === v ? E.b : E.a;
      if (seen.has(o)) continue;
      seen.add(o);
      const b = game.buildings[o]; const w = game.cr.wardens[o];
      if (w && w.owner !== pid) { foes.push(o); continue; }
      if (b && b.owner !== pid) continue;
      if (!b && !w) empty.push(o);
      queue.push(o);
    }
  }
  return { empty, foes };
}

// A pushed-away warden moves to another free corner on its owner's roads, or leaves the board if there is none.
function relocate(game, v) {
  const w = game.cr.wardens[v]; delete game.cr.wardens[v];
  const owner = X.P(game, w.owner);
  const spots = wardenSpots(game, w.owner).filter((x) => x !== Number(v));
  if (spots.length) {
    const to = spots[X.rint(spots.length)];
    game.cr.wardens[to] = w;
    X.log(game, `${owner.name}'s ${RANK[w.level]} is pushed to another corner.`);
  } else {
    owner.cr.wardenPieces[w.level]++;
    X.log(game, `${owner.name}'s ${RANK[w.level]} has nowhere to go and leaves the board.`);
  }
}

function myWarden(game, pid, v) {
  const w = game.cr.wardens[v];
  if (!w || w.owner !== pid) X.fail('Pick one of your wardens');
  return w;
}
function promote(game, p, w, free) {
  if (w.level >= 3) X.fail('That warden is already a Champion');
  if (w.level === 2 && p.cr.improve.council < 3) X.fail('Champions need the Council at level 3 (Citadel)');
  if (w.promotedTurn === game.turn.number) X.fail('A warden can only be promoted once per turn');
  if (p.cr.wardenPieces[w.level + 1] <= 0) X.fail(`You have no ${RANK[w.level + 1]} pieces left`);
  if (!free) { if (!X.hasRes(p.hand, COST.promote)) X.fail('Promoting costs 1 fleece and 1 iron'); X.move(p.hand, game.bank, COST.promote); }
  p.cr.wardenPieces[w.level]++; p.cr.wardenPieces[w.level + 1]--;
  w.level++; w.promotedTurn = game.turn.number;
}
function readyToAct(game, w) {
  if (!w.active) X.fail('Activate the warden first (1 wheat)');
  if (w.activatedTurn === game.turn.number) X.fail('A warden activated this turn can act from next turn on');
}

// ---------- improvements & capitals ----------
function capitalPlan(game, p, track, level) {
  const cr = game.cr; const holderV = cr.capitals[track];
  const holder = holderV !== null && game.buildings[holderV] ? game.buildings[holderV].owner : null;
  if (level >= 4 && holderV === null) return 'claim';
  if (level === 5 && holder && holder !== p.id && X.P(game, holder).cr.improve[track] < 5) return 'take';
  return null;
}

// ---------- actions ----------
function act(game, p, a, ctx) {
  const cr = game.cr; const t = game.turn; const pid = p.id;
  const needBuild = () => { if (!ctx.canBuild()) X.fail("You can't do that right now"); };
  const vertex = (k = 'vertex') => { const v = Number(a[k]); if (!game.board.vertices[v]) X.fail('Pick a corner on the board'); return v; };
  switch (a.type) {
    case 'buildWall': {
      needBuild();
      const v = vertex(); const b = game.buildings[v];
      if (!b || b.owner !== pid || !isTown(b)) X.fail('Walls go around your own cities');
      if (cr.walls[v]) X.fail('That city already has a wall');
      if (p.cr.wallPieces <= 0) X.fail('You have no walls left (3 at most)');
      if (!X.hasRes(p.hand, COST.wall)) X.fail('A wall costs 2 clay');
      X.move(p.hand, game.bank, COST.wall);
      cr.walls[v] = pid; p.cr.wallPieces--;
      X.log(game, `🧱 ${p.name} built a city wall (hand limit +2).`);
      return;
    }
    case 'buildWarden': {
      needBuild();
      const v = vertex();
      if (!emptyCorner(game, v) || !touchesOwnRoad(game, pid, v)) X.fail('Wardens go on an empty corner along your roads');
      if (p.cr.wardenPieces[1] <= 0) X.fail('You have no Warden pieces left');
      if (!X.hasRes(p.hand, COST.warden)) X.fail('A warden costs 1 fleece and 1 iron');
      X.move(p.hand, game.bank, COST.warden);
      cr.wardens[v] = { owner: pid, level: 1, active: false, builtTurn: t.number };
      p.cr.wardenPieces[1]--;
      X.log(game, `🛡️ ${p.name} raised a Warden.`);
      X.updateLongest(game);
      return;
    }
    case 'activateWarden': {
      needBuild();
      const w = myWarden(game, pid, vertex());
      if (w.active) X.fail('That warden is already active');
      if (!X.hasRes(p.hand, COST.activate)) X.fail('Activating costs 1 wheat');
      X.move(p.hand, game.bank, COST.activate);
      w.active = true; w.activatedTurn = t.number;
      X.log(game, `🔥 ${p.name} activated a ${RANK[w.level]}.`);
      return;
    }
    case 'promoteWarden': {
      needBuild();
      const w = myWarden(game, pid, vertex());
      promote(game, p, w, false);
      X.log(game, `⬆️ ${p.name} promoted a warden to ${RANK[w.level]}.`);
      return;
    }
    case 'wardenMove': case 'wardenDisplace': {
      ctx.mustCur('main');
      const from = vertex('from'); const to = vertex('to');
      const w = myWarden(game, pid, from); readyToAct(game, w);
      const r = reach(game, pid, from);
      if (a.type === 'wardenMove') {
        if (!r.empty.includes(to)) X.fail('Wardens move to an empty corner they can reach along your roads');
      } else {
        const foe = cr.wardens[to];
        if (!r.foes.includes(to) || !foe) X.fail("Pick an opponent's warden you can reach along your roads");
        if (foe.level >= w.level) X.fail('You can only push away a weaker warden');
        relocate(game, to);
      }
      delete cr.wardens[from]; cr.wardens[to] = w; w.active = false;
      X.log(game, a.type === 'wardenMove' ? `${p.name}'s ${RANK[w.level]} moved.` : `⚔️ ${p.name}'s ${RANK[w.level]} pushed an opponent's warden away.`);
      X.updateLongest(game);
      return;
    }
    case 'wardenChase': {
      ctx.mustCur('main');
      const v = vertex('from');
      const w = myWarden(game, pid, v); readyToAct(game, w);
      if (!banditFree(game)) X.fail('The bandit cannot move until the raiders first reach the island');
      if (!game.board.vertices[v].hexes.includes(game.bandit)) X.fail('That warden is not next to the bandit');
      w.active = false;
      t.afterRobber = 'main'; t.phase = 'robber';
      X.log(game, `🛡️ ${p.name}'s ${RANK[w.level]} drives the bandit off — they move it.`);
      return;
    }
    case 'improve': {
      needBuild();
      const track = a.track;
      if (!TRACKS.includes(track)) X.fail('Pick Guild, Council or Academy');
      if (!ownCities(game, pid).length) X.fail('You need at least one city to improve');
      const lvl = p.cr.improve[track];
      if (lvl >= 5) X.fail(`Your ${TRACK_NAME[track]} is already at the top level`);
      const com = TRACK_COM[track];
      const cost = Math.max(0, lvl + 1 - (cr.mason ? 1 : 0));
      if ((p.hand[com] || 0) < cost) X.fail(`Level ${lvl + 1} costs ${cost} ${X.RES_NAME[com]}`);
      // a capital needs a city to sit on: decide it before paying
      const plan = capitalPlan(game, p, track, lvl + 1);
      let seat = null;
      if (plan) {
        const free = ownCities(game, pid).filter((v) => !capitalAt(game, v));
        if (free.length) {
          if (a.vertex !== undefined && a.vertex !== null) { seat = Number(a.vertex); if (!free.includes(seat)) X.fail('Choose one of your cities without a capital'); }
          else if (free.length === 1) seat = free[0];
          else X.fail('Choose which city becomes your capital');
        }
      }
      X.move(p.hand, game.bank, { [com]: cost });
      cr.mason = 0;
      p.cr.improve[track] = lvl + 1;
      X.log(game, `🏛️ ${p.name} raised their ${TRACK_NAME[track]} to level ${lvl + 1}.`);
      if (lvl + 1 === 3) X.log(game, `✨ ${p.name} unlocks the ${POWER[track]}.`);
      if (plan && seat !== null) {
        const old = cr.capitals[track];
        if (plan === 'take' && old !== null) X.log(game, `👑 ${p.name} takes the ${TRACK_NAME[track]} capital from ${X.P(game, game.buildings[old].owner).name}!`);
        else X.log(game, `👑 ${p.name} founds the ${TRACK_NAME[track]} capital (+2 points).`);
        cr.capitals[track] = seat;
      }
      return;
    }
    case 'raidLose': {
      if (t.phase !== 'raid' || !cr.pendingRaid[pid]) X.fail('The raiders are not after you');
      const v = vertex(); const b = game.buildings[v];
      if (!b || b.owner !== pid || !isTown(b) || capitalAt(game, v)) X.fail('Pick one of your cities (capitals are protected)');
      sack(game, v);
      delete cr.pendingRaid[pid];
      if (!Object.keys(cr.pendingRaid).length) finishRaid(game);
      return;
    }
    case 'takeFree': {
      if (p.cr.freePicks <= 0) X.fail('You have no free resource to take');
      if (!X.RES.includes(a.res)) X.fail('Pick a resource');
      if (game.bank[a.res] <= 0) X.fail(`The bank is out of ${X.RES_NAME[a.res]}`);
      p.cr.freePicks--; game.bank[a.res]--; p.hand[a.res]++;
      X.log(game, `💧 ${p.name} took 1 ${X.RES_NAME[a.res]} (Waterworks).`);
      return;
    }
    case 'drawEdict': {
      if (p.cr.edictPicks <= 0) X.fail('You have no edict to draw');
      if (!TRACKS.includes(a.deck)) X.fail('Pick a deck');
      p.cr.edictPicks--;
      drawEdict(game, p, a.deck);
      return;
    }
    case 'playEdict': return playEdict(game, p, a, ctx);
    default: X.fail('Unknown action');
  }
}

// ---------- edicts ----------
function playEdict(game, p, a, ctx) {
  const cr = game.cr; const t = game.turn; const pid = p.id; const kind = a.kind;
  const e = EDICTS[kind];
  if (!e || e.vp) X.fail('That edict cannot be played');
  const i = p.cr.edicts.findIndex((x) => x.type === kind);
  if (i < 0) X.fail("You don't have that edict");
  ctx.mustCur(e.when === 'preroll' ? 'preroll' : 'main');
  const others = game.players.filter((o) => o.id !== pid);
  const pts = (o) => X.vp(game, o, false);
  const randomCards = (from, n) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      const have = X.CARDS.filter((c) => from.hand[c] > 0);
      if (!have.length) break;
      const c = have[X.rint(have.length)]; from.hand[c]--; out.push(c);
    }
    return out;
  };
  const give = (cards, to) => { for (const c of cards) to.hand[c]++; };
  const adjTiles = (res) => game.board.hexes.filter((h) => h.res === res && h.v.some((v) => game.buildings[v] && game.buildings[v].owner === pid));
  const done = (msg) => {
    p.cr.edicts.splice(p.cr.edicts.findIndex((x) => x.type === kind), 1);
    cr.decks[e.deck].push(kind); // played edicts go to the bottom of their deck
    X.log(game, `📜 ${p.name} played ${e.name}${msg ? ': ' + msg : '.'}`);
  };
  switch (kind) {
    case 'loadeddice': {
      const d1 = Number(a.d1), d2 = Number(a.d2);
      if (![d1, d2].every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) X.fail('Choose two dice between 1 and 6');
      cr.fixedDice = [d1, d2];
      return done(`the number dice will show ${d1} and ${d2}`);
    }
    case 'surveyor': {
      const h1 = game.board.hexes[Number(a.hex)], h2 = game.board.hexes[Number(a.hex2)];
      if (!h1 || !h2 || h1 === h2 || !h1.num || !h2.num) X.fail('Pick two different numbered tiles');
      if ([h1.num, h2.num].some((n) => [2, 6, 8, 12].includes(n))) X.fail('Tiles showing 2, 6, 8 or 12 cannot be swapped');
      [h1.num, h2.num] = [h2.num, h1.num];
      return done(`swapped a ${h2.num} and a ${h1.num}`);
    }
    case 'mason': cr.mason = 1; return done('the next improvement this turn costs one commodity less');
    case 'irrigation': case 'mining': {
      const res = kind === 'irrigation' ? 'wheat' : 'iron';
      const n = Math.min(2 * adjTiles(res).length, game.bank[res]);
      game.bank[res] -= n; p.hand[res] += n;
      return done(`+${n} ${X.RES_NAME[res]}`);
    }
    case 'engineer': {
      const v = Number(a.vertex); const b = game.buildings[v];
      if (!b || b.owner !== pid || !isTown(b) || cr.walls[v]) X.fail('Pick one of your cities without a wall');
      if (p.cr.wallPieces <= 0) X.fail('You have no walls left');
      cr.walls[v] = pid; p.cr.wallPieces--;
      return done('a free city wall');
    }
    case 'healer': {
      const v = Number(a.vertex); const b = game.buildings[v];
      if (!b || b.owner !== pid || b.type !== 'village') X.fail('Pick one of your settlements');
      if (p.pieces.town <= 0) X.fail('You have no cities left');
      if (!X.hasRes(p.hand, COST.healer)) X.fail('This costs 2 iron and 1 wheat');
      X.move(p.hand, game.bank, COST.healer);
      b.type = 'town'; p.pieces.town--; p.pieces.village++;
      return done('a settlement became a city');
    }
    case 'paving': {
      t.freeRoads = Math.min(2, p.pieces.road);
      if (t.freeRoads > 0 && X.validRoads(game, pid).length) { t.afterRoads = 'main'; t.phase = 'roadbuilding'; }
      return done('2 free roads');
    }
    case 'smith': {
      const picks = [a.vertex, a.vertex2].filter((v) => v !== undefined && v !== null && v !== '').map(Number);
      if (!picks.length || new Set(picks).size !== picks.length) X.fail('Pick one or two of your wardens');
      const ws = picks.map((v) => myWarden(game, pid, v));
      for (const w of ws) promote(game, p, w, true);
      return done(`${ws.length} warden${ws.length > 1 ? 's' : ''} promoted`);
    }
    case 'harbortax': {
      let n = 0;
      for (const o of others) {
        const coms = COM.filter((c) => o.hand[c] > 0);
        if (!coms.length) continue;
        const c = coms[X.rint(coms.length)]; o.hand[c]--; p.hand[c]++; n++;
        const back = X.RES.filter((r) => p.hand[r] > 0);
        if (back.length) { const r = back[X.rint(back.length)]; p.hand[r]--; o.hand[r]++; }
      }
      return done(`${n} commodit${n === 1 ? 'y' : 'ies'} collected`);
    }
    case 'mastermerchant': {
      const o = X.P(game, a.victim);
      if (!o || o.id === pid || pts(o) <= pts(p)) X.fail('Pick a player with more points than you');
      give(randomCards(o, 2), p);
      return done(`took 2 cards from ${o.name}`);
    }
    case 'merchant': {
      const h = game.board.hexes[Number(a.hex)];
      if (!h || h.res === 'desert' || !h.v.some((v) => game.buildings[v] && game.buildings[v].owner === pid)) X.fail('Pick a land tile next to your settlement or city');
      cr.merchant = { hex: h.id, owner: pid };
      return done(`the merchant now trades ${X.RES_NAME[h.res]} 2:1 for them (+1 point)`);
    }
    case 'fleet': {
      if (!X.CARDS.includes(a.res)) X.fail('Pick a resource or commodity');
      cr.fleet = { pid, card: a.res };
      return done(`${X.RES_NAME[a.res]} trades 2:1 this turn`);
    }
    case 'resembargo': case 'comembargo': {
      const list = kind === 'resembargo' ? X.RES : COM; const most = kind === 'resembargo' ? 2 : 1;
      if (!list.includes(a.res)) X.fail(kind === 'resembargo' ? 'Name a resource' : 'Name a commodity');
      let n = 0;
      for (const o of others) { const k = Math.min(most, o.hand[a.res] || 0); o.hand[a.res] -= k; p.hand[a.res] += k; n += k; }
      return done(`collected ${n} ${X.RES_NAME[a.res]}`);
    }
    case 'inquisitor': {
      if (!banditFree(game)) X.fail('The bandit cannot move until the raiders first reach the island');
      const h = game.board.hexes[Number(a.hex)];
      if (!h || h.id === game.bandit) X.fail('Move the bandit to a different tile');
      game.bandit = h.id;
      const victims = [...new Set(h.v.map((v) => game.buildings[v]).filter(Boolean).map((b) => b.owner))].filter((id) => id !== pid);
      for (const id of victims) { const o = X.P(game, id); if (X.handCount(o.hand)) X.stealFrom(game, p, o); }
      return done('the bandit moved');
    }
    case 'deserter': {
      const v = Number(a.vertex); const foe = cr.wardens[v];
      if (!foe || foe.owner === pid) X.fail("Pick an opponent's warden");
      const to = a.vertex2 === undefined || a.vertex2 === null || a.vertex2 === '' ? null : Number(a.vertex2);
      delete cr.wardens[v]; X.P(game, foe.owner).cr.wardenPieces[foe.level]++;
      let rank = foe.level === 3 && p.cr.improve.council < 3 ? 2 : foe.level;
      while (rank > 0 && p.cr.wardenPieces[rank] <= 0) rank--;
      if (rank > 0 && to !== null) {
        if (!wardenSpots(game, pid).includes(to)) { cr.wardens[v] = foe; X.P(game, foe.owner).cr.wardenPieces[foe.level]--; X.fail('Place your warden on an empty corner along your roads'); }
        cr.wardens[to] = { owner: pid, level: rank, active: false, builtTurn: t.number }; p.cr.wardenPieces[rank]--;
      }
      X.updateLongest(game);
      return done(`an opponent's ${RANK[foe.level]} deserts${rank > 0 && to !== null ? ` and a ${RANK[rank]} joins them` : ''}`);
    }
    case 'diplomat': {
      const eid = Number(a.edge); const owner = game.roads[eid];
      if (owner === undefined) X.fail('Pick a road');
      const E = game.board.edges[eid];
      const loose = [E.a, E.b].some((x) => {
        const b = game.buildings[x] || cr.wardens[x];
        if (b && b.owner === owner) return false;
        return !game.board.vertices[x].edges.some((o) => o !== eid && game.roads[o] === owner);
      });
      if (!loose) X.fail('Only a road with a loose end can be removed');
      delete game.roads[eid]; X.P(game, owner).pieces.road++;
      if (owner === pid) { t.freeRoads = 1; t.afterRoads = 'main'; t.phase = 'roadbuilding'; }
      X.updateLongest(game);
      return done(owner === pid ? 'they move one of their own roads' : `${X.P(game, owner).name} loses a road`);
    }
    case 'intrigue': {
      const v = Number(a.vertex); const foe = cr.wardens[v];
      if (!foe || foe.owner === pid) X.fail("Pick an opponent's warden");
      if (!touchesOwnRoad(game, pid, v)) X.fail('That warden must stand on one of your roads');
      relocate(game, v);
      X.updateLongest(game);
      return done("an opponent's warden is pushed away");
    }
    case 'saboteur': {
      const mine = pts(p); const hit = others.filter((o) => pts(o) >= mine);
      for (const o of hit) { const n = Math.floor(X.handCount(o.hand) / 2); for (const c of randomCards(o, n)) game.bank[c]++; }
      return done(hit.length ? `${hit.map((o) => o.name).join(', ')} discard half their cards` : 'nobody is affected');
    }
    case 'spy': {
      const o = X.P(game, a.victim);
      if (!o || o.id === pid || !o.cr.edicts.length) X.fail('Pick a player who holds edicts');
      if (p.cr.edicts.length - 1 >= EDICT_HAND) X.fail('Your hand of edicts is full');
      const k = X.rint(o.cr.edicts.length);
      const [card] = o.cr.edicts.splice(k, 1);
      done(`took an edict from ${o.name}`);
      p.cr.edicts.push({ type: card.type, got: t.number });
      X.log(game, `You took ${EDICTS[card.type].name} from ${o.name}.`, pid);
      X.log(game, `${p.name} took your ${EDICTS[card.type].name}.`, o.id);
      return;
    }
    case 'warlord': {
      let n = 0;
      for (const w of Object.values(cr.wardens)) if (w.owner === pid && !w.active) { w.active = true; w.activatedTurn = t.number; n++; }
      return done(`${n} warden${n === 1 ? '' : 's'} activated`);
    }
    case 'wedding': {
      const mine = pts(p); const richer = others.filter((o) => pts(o) > mine);
      for (const o of richer) give(randomCards(o, 2), p);
      return done(richer.length ? `${richer.map((o) => o.name).join(', ')} bring 2 cards each` : 'nobody has more points');
    }
    default: X.fail('Unknown edict');
  }
}

// ---------- what each player sees ----------
function publicPlayer(game, p) {
  return {
    improve: p.cr.improve, defender: p.cr.defender, edictVP: p.cr.edictVP, edicts: p.cr.edicts.length,
    strength: strength(game, p.id), walls: Object.values(game.cr.walls).filter((o) => o === p.id).length,
    capitals: TRACKS.filter((k) => { const c = game.cr.capitals[k]; return c !== null && game.buildings[c] && game.buildings[c].owner === p.id; }),
    merchant: !!(game.cr.merchant && game.cr.merchant.owner === p.id),
  };
}

function hints(game, pid) {
  const t = game.turn; const cr = game.cr; const p = X.P(game, pid);
  const myTurn = X.current(game).id === pid;
  const building = (myTurn && t.phase === 'main') || (t.phase === 'builder' && t.builder === pid);
  const out = { wardenSpots: [], wallSpots: [], raidCities: [], capitalCities: [], myWardens: [] };
  if (t.phase === 'raid' && cr.pendingRaid[pid]) out.raidCities = ownCities(game, pid).filter((v) => !capitalAt(game, v));
  if (building) {
    out.wardenSpots = wardenSpots(game, pid);
    out.wallSpots = p.cr.wallPieces > 0 ? ownCities(game, pid).filter((v) => !cr.walls[v]) : [];
    out.capitalCities = ownCities(game, pid).filter((v) => !capitalAt(game, v));
  }
  for (const [v, w] of Object.entries(cr.wardens)) {
    if (w.owner !== pid) continue;
    const ready = w.active && w.activatedTurn !== t.number && myTurn && t.phase === 'main';
    const r = ready ? reach(game, pid, Number(v)) : { empty: [], foes: [] };
    out.myWardens.push({
      vertex: Number(v), level: w.level, active: w.active,
      canActivate: building && !w.active, canPromote: building && w.level < 3 && w.promotedTurn !== t.number && (w.level < 2 || p.cr.improve.council >= 3) && p.cr.wardenPieces[w.level + 1] > 0,
      moves: r.empty, pushes: r.foes.filter((x) => cr.wardens[x].level < w.level),
      chase: ready && banditFree(game) && game.board.vertices[v].hexes.includes(game.bandit),
    });
  }
  return out;
}

function view(game, pid) {
  const cr = game.cr; const me = X.P(game, pid);
  return {
    raiders: cr.raiders, raidAt: raidAt(game), raids: cr.raids, lastRaid: cr.lastRaid || null, banditFree: banditFree(game), lastEvent: cr.lastEvent,
    attack: totalCities(game), defense: game.players.reduce((s, p) => s + strength(game, p.id), 0),
    wardens: cr.wardens, walls: cr.walls, capitals: cr.capitals, merchant: cr.merchant, pendingRaid: cr.pendingRaid,
    deckCounts: Object.fromEntries(TRACKS.map((k) => [k, cr.decks[k].length])),
    fixedDice: me && X.current(game).id === pid ? cr.fixedDice : null,
    fleet: cr.fleet, mason: cr.mason,
    me: me ? { improve: me.cr.improve, edicts: me.cr.edicts.map((x) => x.type), freePicks: me.cr.freePicks, edictPicks: me.cr.edictPicks,
      wardenPieces: me.cr.wardenPieces, wallPieces: me.cr.wallPieces, strength: strength(game, pid) } : null,
    costs: COST, info: INFO,
  };
}

module.exports = {
  COM, TRACKS, TRACK_COM, TRACK_NAME, POWER, RANK, EVENT_FACES, RAID_AT, EDICT_HAND, COST, EDICTS,
  FIRST_RAID, bind, on, handles, setup, newTurn, wardenAt, banditFree, extraPoints, pointParts, cityYield, afterHarvest, rate, wallBonus, canAffordAny,
  takeFixedDice, rollEvent, autoRaid, act, publicPlayer, hints, view, capitalAt, strength, ownCities, wardenSpots, reach,
};
