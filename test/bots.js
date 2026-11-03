'use strict';
// Fill a room with simple bot players for testing: node test/bots.js ROOMCODE [count] [server]
const [code, count = 5, base = 'http://localhost:3000'] = process.argv.slice(2);
if (!code) { console.log('Usage: node test/bots.js ROOMCODE [count] [server]'); process.exit(1); }
const RES = ['wood', 'clay', 'fleece', 'wheat', 'iron'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const has = (h, c) => RES.every((r) => h[r] >= (c[r] || 0));

async function post(path, body) {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}

async function bot(name) {
  const { token, pid } = await post('/api/join', { code, name });
  const act = (action) => post('/api/action', { code, token, action }).catch((e) => console.log(name, action.type, e.message));
  const res = await fetch(`${base}/api/stream?code=${code}&token=${token}`);
  const dec = new TextDecoder(); let buf = ''; let busy = false; let lastTrade = null;
  console.log(`${name} joined`);
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const msg = buf.slice(0, i); buf = buf.slice(i + 2);
      if (!msg.startsWith('data: ')) continue;
      const v = JSON.parse(msg.slice(6));
      if (v.status !== 'playing' || busy) continue;
      if (v.trade && v.trade.from !== pid && v.trade.id !== lastTrade) {
        lastTrade = v.trade.id;
        const tr = v.trade;
        const spare = RES.find((r) => v.hand[r] > 0 && !tr.give[r]);
        const want = RES.find((r) => tr.give[r]);
        setTimeout(() => (spare && Math.random() < 0.4
          ? act({ type: 'respondTrade', id: tr.id, counter: { give: { [spare]: 1 }, get: { [want]: 1 } } })
          : act({ type: 'respondTrade', id: tr.id, accept: has(v.hand, tr.get) && Math.random() < 0.6 })), 600);
      }
      if (!v.stalled.includes(pid)) continue;
      busy = true;
      setTimeout(async () => {
        await step(v, pid, act);
        busy = false;
      }, 500);
    }
  }
}

async function step(v, pid, act) {
  const t = v.turn; const h = v.hand;
  switch (t.phase) {
    case 'order': return act({ type: 'roll' });
    case 'setup':
      return t.setupNeed === 'village' ? act({ type: 'buildVillage', vertex: pick(v.hints.villages) }) : act({ type: 'buildRoad', edge: pick(v.hints.roads) });
    case 'preroll': return act({ type: 'roll' });
    case 'discard': {
      const n = v.pendingDiscard[pid]; const c = { wood: 0, clay: 0, fleece: 0, wheat: 0, iron: 0 }; const hh = { ...h };
      for (let i = 0; i < n; i++) { const r = pick(RES.filter((x) => hh[x] > 0)); hh[r]--; c[r]++; }
      return act({ type: 'discard', cards: c });
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
