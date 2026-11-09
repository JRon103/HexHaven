'use strict';
// Fill a room with simple bot players for testing: node test/bots.js ROOMCODE [count] [server]
const [code, count = 5, base = 'http://localhost:3000'] = process.argv.slice(2);
if (!code) { console.log('Usage: node test/bots.js ROOMCODE [count] [server]'); process.exit(1); }
const RES = ['wood', 'clay', 'fleece', 'wheat', 'iron'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const CARDS = [...RES, 'parchment', 'linen', 'silver'];
const has = (h, c) => CARDS.every((r) => (h[r] || 0) >= (c[r] || 0));

async function post(path, body) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}

async function bot(name) {
  const { token, pid } = await post('/api/join', { code, name });
  const act = (action) => post('/api/action', { code, token, action }).catch((e) => { console.log(name, action.type, e.message); return null; });
  const res = await fetch(`${base}/api/stream?code=${code}&token=${token}`);
  const dec = new TextDecoder(); let buf = ''; let busy = false; let lastTrade = null; let latest = null;
  // act on the newest view; an update that arrives while we're busy is picked up when we finish
  const consider = (v) => {
    if (busy || v.status !== 'playing' || !v.stalled.includes(pid)) return;
    busy = true;
    setTimeout(async () => {
      let ok = true;
      try { ok = (await step(v, pid, act)) !== null; } catch (e) { console.log(name, 'bot error', e.message); ok = false; }
      // a refused move with nothing new to look at: finish building rather than try it again forever
      if (!ok && latest === v && ['main', 'builder'].includes(v.turn.phase)) await act({ type: v.turn.phase === 'builder' ? 'builderDone' : 'endTurn' });
      busy = false;
      if (latest !== v) consider(latest);
    }, 500);
  };
  console.log(`${name} joined`);
  setInterval(() => post('/api/ping', { code, token }).catch(() => {}), 25000); // like an open page: still here
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const msg = buf.slice(0, i); buf = buf.slice(i + 2);
      if (!msg.startsWith('data: ')) continue;
      const v = JSON.parse(msg.slice(6));
      latest = v;
      if (v.status !== 'playing') continue;
      if (v.trade && v.trade.from !== pid && v.trade.id !== lastTrade) {
        lastTrade = v.trade.id;
        const tr = v.trade;
        const spare = RES.find((r) => v.hand[r] > 0 && !tr.give[r]);
        const want = RES.find((r) => tr.give[r]);
        setTimeout(() => (spare && Math.random() < 0.4
          ? act({ type: 'respondTrade', id: tr.id, counter: { give: { [spare]: 1 }, get: { [want]: 1 } } })
          : act({ type: 'respondTrade', id: tr.id, accept: has(v.hand, tr.get) && Math.random() < 0.6 })), 600);
      }
      consider(v);
    }
  }
}

async function step(v, pid, act) {
  const t = v.turn; const h = v.hand; const c = v.crowns;
  // Crowns & Raiders: free picks, edict draws, raids, then the mode's own building
  if (c && c.me.freePicks > 0) return act({ type: 'takeFree', res: pick(RES) });
  if (c && c.me.edictPicks > 0) return act({ type: 'drawEdict', deck: pick(['guild', 'council', 'academy']) });
  if (t.phase === 'raid') return act({ type: 'raidLose', vertex: pick(v.hints.raidCities) });
  if (c && (t.phase === 'main' || t.phase === 'builder')) {
    for (const k of ['guild', 'council', 'academy']) {
      const com = { guild: 'linen', council: 'silver', academy: 'parchment' }[k];
      const myCities = Object.values(v.buildings).filter((b) => b.owner === pid && b.type === 'town').length;
      if (myCities && c.me.improve[k] < 5 && h[com] > c.me.improve[k]) return act({ type: 'improve', track: k, vertex: pick(v.hints.capitalCities) });
    }
    const w = v.hints.myWardens.find((x) => x.canActivate);
    if (w && h.wheat > 0) return act({ type: 'activateWarden', vertex: w.vertex });
    if (v.hints.wardenSpots.length && c.me.wardenPieces[1] > 0 && has(h, c.costs.warden) && Math.random() < 0.6) return act({ type: 'buildWarden', vertex: pick(v.hints.wardenSpots) });
    if (v.hints.wallSpots.length && has(h, c.costs.wall) && Math.random() < 0.4) return act({ type: 'buildWall', vertex: pick(v.hints.wallSpots) });
  }
  switch (t.phase) {
    case 'order': return act({ type: 'roll' });
    case 'setup':
      return t.setupNeed === 'village' ? act({ type: 'buildVillage', vertex: pick(v.hints.villages) }) : act({ type: 'buildRoad', edge: pick(v.hints.roads) });
    case 'preroll': return act({ type: 'roll' });
    case 'discard': {
      const n = v.pendingDiscard[pid]; const d = {}; const hh = { ...h };
      for (let i = 0; i < n; i++) { const r = pick(CARDS.filter((x) => hh[x] > 0)); hh[r]--; d[r] = (d[r] || 0) + 1; }
      return act({ type: 'discard', cards: d });
    }
    case 'robber': return act({ type: 'moveBandit', hex: pick(v.hints.hexes) });
    case 'steal': return act({ type: 'steal', victim: pick(t.victims), card: 0 });
    case 'roadbuilding': return v.hints.roads.length ? act({ type: 'buildRoad', edge: pick(v.hints.roads) }) : act({ type: 'skipRoads' });
    case 'main': case 'builder': {
      if (v.hints.towns.length && has(h, v.cost.town)) return act({ type: 'buildTown', vertex: pick(v.hints.towns) });
      if (v.hints.villages.length && has(h, v.cost.village)) return act({ type: 'buildVillage', vertex: pick(v.hints.villages) });
      if (v.hints.roads.length && has(h, v.cost.road) && Math.random() < 0.5) return act({ type: 'buildRoad', edge: pick(v.hints.roads) });
      return act({ type: t.phase === 'builder' ? 'builderDone' : 'endTurn' });
    }
  }
}

const names = ['Juniper', 'Rook', 'Marlo', 'Sage', 'Tamsin', 'Wren', 'Ostrich'];
for (let i = 0; i < Number(count); i++) bot(names[i]).catch((e) => console.log(names[i], e.message));
