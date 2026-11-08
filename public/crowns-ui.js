'use strict';
/* Crowns & Raiders, the browser side: board pieces (walls, wardens, capitals, the merchant), the raiders'
   track, the event die, city improvements, edicts and their prompts. Loaded before app.js; every function
   here runs later, from app.js, and uses its helpers (S, RM, $, esc, send, render, …). */

const CRT = {
  guild:   { name: 'Guild',   com: 'linen',     ico: '⚖️', color: '#d4a21f', ink: '#5e4506', gate: 'Guild gate' },
  council: { name: 'Council', com: 'silver',    ico: '📯', color: '#3b6fd1', ink: '#173a7a', gate: 'Council gate' },
  academy: { name: 'Academy', com: 'parchment', ico: '🔭', color: '#2f9a58', ink: '#145430', gate: 'Academy gate' },
};
const CR_TRACKS = ['guild', 'council', 'academy'];
const CR_EVENT = { ship: { ico: '⛵', color: '#2b2118', name: 'the raiders’ ship sails closer' } };
for (const k of CR_TRACKS) CR_EVENT[k] = { ico: CRT[k].ico, color: CRT[k].color, name: `the ${CRT[k].gate} opens` };
const CR_RANK_NAME = { 1: 'Warden', 2: 'Veteran', 3: 'Champion' };

const crMe = (v) => v.players.find((p) => p.id === v.me);
const crMyCities = (v) => Object.entries(v.buildings).filter(([, b]) => b.owner === v.me && b.type === 'town').map(([x]) => Number(x));
const crMainNow = (v) => v.status === 'playing' && isMine(v) && v.turn.phase === 'main';
const crCapitalAt = (v, x) => CR_TRACKS.find((k) => v.crowns.capitals[k] === Number(x)) || null;
const crTouchesMyRoad = (v, x) => v.board.vertices[x].edges.some((e) => v.roads[e] === v.me);
const crLevelCost = (v, track) => {
  const lvl = v.crowns.me.improve[track];
  return Math.max(0, lvl + 1 - (v.crowns.mason && isMine(v) ? 1 : 0));
};

// ---------- the event die ----------
function crEventDieSvg(ev) {
  const e = CR_EVENT[ev];
  return `<svg viewBox="0 0 40 40" aria-label="event die: ${esc(e.name)}"><title>Event die: ${esc(e.name)}</title><rect x="2" y="2" width="36" height="36" rx="8" fill="${ev === 'ship' ? '#fffaf0' : e.color}" stroke="#2b2118" stroke-width="2"/>
    <text x="20" y="21" font-size="20" text-anchor="middle" dominant-baseline="central">${e.ico}</text></svg>`;
}
// the 3D event die: faces 1–3 are the ship, 4–6 the three gates
const CR_FACE_EVENT = { 1: 'ship', 2: 'ship', 3: 'ship', 4: 'guild', 5: 'council', 6: 'academy' };
function crEventFace(roll) { return roll.event === 'ship' ? 1 + (roll.id % 3) : { guild: 4, council: 5, academy: 6 }[roll.event]; }
function crEventFaceHtml(n) {
  const ev = CR_FACE_EVENT[n]; const e = CR_EVENT[ev];
  return `<div class="evface" style="--ec:${ev === 'ship' ? '#fffaf0' : e.color}">${e.ico}</div>`;
}
function crEventLabel(ev) { return ` <span class="ev-tag">${CR_EVENT[ev].ico} ${esc(CR_EVENT[ev].name)}</span>`; }

// ---------- raiders' track (over the board, bottom right) ----------
function crRenderTrack(v) {
  const el = $('#cr-track'); const c = v.crowns;
  $('#cr-sec').hidden = false;
  $('#cr-count').textContent = `ship ${c.raiders}/${c.raidAt}${c.raids ? ` · ${c.raids} raid${c.raids > 1 ? 's' : ''} so far` : ''}`;
  const steps = Array.from({ length: c.raidAt }, (_, i) => `<span class="crt-step ${i < c.raiders ? 'past' : ''} ${i === c.raidAt - 1 ? 'isle' : ''}">${
    i === Math.max(0, c.raiders - 1) && c.raiders > 0 ? '⛵' : i === c.raidAt - 1 ? '🏝️' : ''}</span>`).join('');
  const safe = c.attack === 0 || c.defense >= c.attack;
  el.innerHTML = `<div class="crt-steps" aria-label="The ship is ${c.raiders} of ${c.raidAt} steps from the island">${c.raiders ? '' : '<span class="crt-start">⛵</span>'}${steps}</div>
    <div class="crt-vs ${safe ? 'good' : 'bad'}" title="Raiders: one per city on the island. Wardens: the ranks of all active wardens added up. If the raiders are stronger, the players with the weakest wardens each lose a city.">
      ⚔️ <b>${c.attack}</b> raiders vs 🛡️ <b>${c.defense}</b> wardens · ${c.attack === 0 ? 'nothing to plunder yet' : safe ? 'the island would hold' : 'the island would fall'}</div>
    ${c.banditFree ? '' : '<div class="crt-note">🏜️ The bandit stays in the dunes until the first raid</div>'}`;
}

// ---------- status line prompts ----------
function crStatus(v) {
  const t = v.turn; const mine = isMine(v);
  if (t.phase === 'raid') {
    if (v.hints.raidCities.length) return '⚔️ The raiders won — click the city you lose (it becomes a settlement)';
    return `⚔️ The raiders won — waiting for ${Object.keys(v.crowns.pendingRaid).map((id) => esc(pname(v, id))).join(', ')} to choose a city…`;
  }
  if (!S.mode) return null;
  const C = S.cr || {};
  if (S.mode === 'wall') return 'Click one of your cities to wall it (2 🧱 · hand limit +2)';
  if (S.mode === 'warden') return 'Click a glowing corner along your roads to raise a warden';
  if (S.mode === 'wmove') return 'Click where your warden moves (along your roads) — Esc cancels';
  if (S.mode === 'wpush') return 'Click the weaker opponent warden to push away — Esc cancels';
  if (S.mode === 'capital') return `Choose which city becomes your ${CRT[C.track].name} capital`;
  if (S.mode === 'edict' && C.edict) {
    const step = crEdictSteps(v, C.edict)[C.step];
    return `📜 ${esc(v.crowns.info.edicts[C.edict].name)}: ${step ? step.prompt : 'ready'} — Esc cancels`;
  }
  return mine ? null : null;
}

// ---------- board ----------
function crBoardUnder(v) {
  let out = '';
  for (const [x, owner] of Object.entries(v.crowns.walls)) {
    const V = v.board.vertices[x]; const cx = V.x * U, cy = V.y * U;
    // a stone ring around the city's foot, crenellated, in the owner's color at the top
    out += `<g aria-label="city wall"><title>${esc(pname(v, owner))}'s city wall</title>
      <ellipse cx="${cx}" cy="${cy + 9}" rx="27" ry="12" fill="#8c8273" stroke="#2b241c" stroke-width="2"/>
      <ellipse cx="${cx}" cy="${cy + 9}" rx="27" ry="12" fill="none" stroke="#c9bfae" stroke-width="3" stroke-dasharray="5 4"/>
      <ellipse cx="${cx}" cy="${cy + 9}" rx="21" ry="8" fill="${pcolor(v, owner)}" opacity=".55"/></g>`;
  }
  return out;
}

function crCrownPath(cx, cy, color) {
  return `<path d="M${cx - 11},${cy + 6} L${cx - 13},${cy - 6} L${cx - 6},${cy - 1} L${cx},${cy - 10} L${cx + 6},${cy - 1} L${cx + 13},${cy - 6} L${cx + 11},${cy + 6} Z"
    fill="${color}" stroke="#2b2118" stroke-width="1.8" stroke-linejoin="round"/><circle cx="${cx}" cy="${cy - 10}" r="2" fill="#fff6c8" stroke="#2b2118" stroke-width="1"/>`;
}

function crWardenShape(v, x, w, anim) {
  const V = v.board.vertices[x]; const cx = V.x * U, cy = V.y * U;
  const mine = w.owner === v.me;
  const clickable = mine && v.status === 'playing' && !S.replay;
  const bars = Array.from({ length: w.level }, (_, i) => `<rect x="${cx - 6}" y="${cy - 5 + i * 5}" width="12" height="3" rx="1" fill="#fff" opacity=".95"/>`).join('');
  const star = w.level === 3 ? `<text x="${cx}" y="${cy + 1}" font-size="12" text-anchor="middle" dominant-baseline="central" fill="#fff">★</text>` : bars;
  const label = `${esc(pname(v, w.owner))}'s ${CR_RANK_NAME[w.level]} (rank ${w.level}) — ${w.active ? 'active' : 'inactive'}`;
  return `<g${anim('w' + x, 'drop')}><g class="warden ${w.active ? 'active' : 'idle'} ${clickable ? 'mine' : ''}" data-warden="${x}" aria-label="${label}"><title>${label}${clickable ? ' · click for actions' : ''}</title>
    ${w.active ? `<circle cx="${cx}" cy="${cy}" r="17" class="warden-glow"/>` : ''}
    <path d="M${cx},${cy - 14} L${cx + 12},${cy - 9} L${cx + 11},${cy + 3} Q${cx + 7},${cy + 11} ${cx},${cy + 15} Q${cx - 7},${cy + 11} ${cx - 11},${cy + 3} L${cx - 12},${cy - 9} Z"
      fill="${pcolor(v, w.owner)}" stroke="${w.active ? '#ffd23a' : '#1d150e'}" stroke-width="${w.active ? 3 : 1.8}" stroke-linejoin="round"/>
    ${star}</g></g>`;
}

function crBoardOver(v, anim) {
  const c = v.crowns; let out = '';
  for (const k of CR_TRACKS) {
    const x = c.capitals[k];
    if (x === null || !v.buildings[x]) continue;
    const V = v.board.vertices[x];
    out += `<g aria-label="${CRT[k].name} capital"><title>${CRT[k].name} capital of ${esc(pname(v, v.buildings[x].owner))} (+2 points, can't be sacked)</title>${crCrownPath(V.x * U + (CR_TRACKS.indexOf(k) - 1) * 9, V.y * U - 34, CRT[k].color)}</g>`;
  }
  for (const [x, w] of Object.entries(c.wardens)) out += crWardenShape(v, x, w, anim);
  if (c.merchant) {
    const h = v.board.hexes[c.merchant.hex]; const cx = h.x * U + 25, cy = h.y * U + 8;
    out += `<g aria-label="merchant"><title>The merchant (${esc(pname(v, c.merchant.owner))}: trades ${RM[h.res].name} 2:1, +1 point)</title>
      <circle cx="${cx}" cy="${cy}" r="13" fill="#fffaf0" stroke="${pcolor(v, c.merchant.owner)}" stroke-width="4"/>
      <text x="${cx}" y="${cy + 1}" font-size="14" text-anchor="middle" dominant-baseline="central">💰</text></g>`;
  }
  return out;
}

// targets for the board-pick modes
function crTargets(v, mode) {
  const c = v.crowns; const h = v.hints; const C = S.cr || {};
  const vtx = (list, big) => ({ kind: 'corner', list, big });
  switch (mode) {
    case 'wall': return vtx(h.wallSpots, true);
    case 'warden': return vtx(h.wardenSpots);
    case 'capital': return vtx(h.capitalCities, true);
    case 'raid': return vtx(h.raidCities, true);
    case 'wmove': { const w = h.myWardens.find((x) => x.vertex === C.from); return vtx(w ? w.moves : []); }
    case 'wpush': { const w = h.myWardens.find((x) => x.vertex === C.from); return vtx(w ? w.pushes : [], true); }
    case 'edict': {
      const step = C.edict && crEdictSteps(v, C.edict)[C.step];
      if (!step) return null;
      return { kind: step.kind, list: step.list(), big: step.big };
    }
    default: return null;
  }
}

function crBoardHints(v, mode) {
  const T = crTargets(v, mode); const b = v.board;
  let low = ''; let hint = '';
  if (!T) return { low, hint };
  if (T.kind === 'corner') {
    for (const x of T.list) { const V = b.vertices[x]; hint += `<circle class="${T.big ? 'hint-t' : 'hint-v'}" data-vertex="${x}" cx="${V.x * U}" cy="${V.y * U - (T.big ? 2 : 0)}" r="${T.big ? 17 : 8}"/>`; }
  } else if (T.kind === 'tile') {
    for (const id of T.list) low += `<polygon class="hex-hit hex-pick" data-hex="${id}" points="${hexPoints(v, b.hexes[id])}"/>`;
  } else if (T.kind === 'side') {
    for (const e of T.list) {
      const E = b.edges[e]; const A = b.vertices[E.a]; const B = b.vertices[E.b];
      const c = `x1="${A.x * U}" y1="${A.y * U}" x2="${B.x * U}" y2="${B.y * U}"`;
      hint += `<line class="hint-e pick" ${c}/><line class="hit-e" data-edge="${e}" ${c}/>`;
    }
  }
  return { low, hint };
}

// Returns true when the click belonged to Crowns & Raiders.
function crBoardClick(v, mode, e) {
  const t = e.target; const C = S.cr || {};
  const finish = (ok) => { if (ok) { S.mode = null; S.cr = null; render(); } };
  const vx = t.dataset && t.dataset.vertex !== undefined ? Number(t.dataset.vertex) : null;
  switch (mode) {
    case 'raid': if (vx !== null) send({ type: 'raidLose', vertex: vx }); return true;
    case 'wall': if (vx !== null) send({ type: 'buildWall', vertex: vx }).then(finish); return true;
    case 'warden': if (vx !== null) send({ type: 'buildWarden', vertex: vx }).then(finish); return true;
    case 'capital': if (vx !== null) send({ type: 'improve', track: C.track, vertex: vx }).then(finish); return true;
    case 'wmove': if (vx !== null) send({ type: 'wardenMove', from: C.from, to: vx }).then(finish); return true;
    case 'wpush': if (vx !== null) send({ type: 'wardenDisplace', from: C.from, to: vx }).then(finish); return true;
    case 'edict': {
      const step = crEdictSteps(v, C.edict)[C.step];
      if (!step) return true;
      const val = step.kind === 'corner' ? vx : step.kind === 'tile' ? (t.dataset.hex !== undefined ? Number(t.dataset.hex) : null) : (t.dataset.edge !== undefined ? Number(t.dataset.edge) : null);
      if (val === null || !step.list().includes(val)) return true;
      C.picks[step.key] = val; C.step++;
      if (C.step >= crEdictSteps(v, C.edict).length) crPlayEdict(v);
      else render();
      return true;
    }
    default: break;
  }
  // no pick in progress: clicking one of your wardens opens its actions
  const wEl = t.closest && t.closest('[data-warden]');
  if (!mode && wEl && v.crowns.wardens[wEl.dataset.warden] && v.crowns.wardens[wEl.dataset.warden].owner === v.me && v.status === 'playing' && !S.replay) {
    S.cr = { warden: Number(wEl.dataset.warden) };
    openModal('cr-warden');
    return true;
  }
  return false;
}

// ---------- edicts: what each one asks you to pick ----------
// Board picks happen step by step; dice / cards / players are picked in the edict's window.
function crEdictSteps(v, kind) {
  const c = v.crowns; const b = v.board; const target = c.info.edicts[kind].target;
  const myWardens = () => Object.entries(c.wardens).filter(([, w]) => w.owner === v.me).map(([x]) => Number(x));
  const foeWardens = () => Object.entries(c.wardens).filter(([, w]) => w.owner !== v.me).map(([x]) => Number(x));
  const swappable = () => b.hexes.filter((h) => h.num && ![2, 6, 8, 12].includes(h.num)).map((h) => h.id);
  const C = S.cr || { picks: {} };
  switch (target) {
    case 'tiles2': return [
      { key: 'hex', kind: 'tile', prompt: 'click the first tile to swap (not 2, 6, 8 or 12)', list: swappable },
      { key: 'hex2', kind: 'tile', prompt: 'click the second tile', list: () => swappable().filter((x) => x !== C.picks.hex) }];
    case 'wallCity': return [{ key: 'vertex', kind: 'corner', big: true, prompt: 'click one of your cities without a wall', list: () => crMyCities(v).filter((x) => !c.walls[x]) }];
    case 'settlement': return [{ key: 'vertex', kind: 'corner', big: true, prompt: 'click the settlement to upgrade', list: () => Object.entries(v.buildings).filter(([, x]) => x.owner === v.me && x.type === 'village').map(([x]) => Number(x)) }];
    case 'myWardens': return [
      { key: 'vertex', kind: 'corner', big: true, prompt: 'click a warden to promote', list: myWardens },
      { key: 'vertex2', kind: 'corner', big: true, optional: true, prompt: 'click a second warden, or press “Play now”', list: () => myWardens().filter((x) => x !== C.picks.vertex) }];
    case 'merchantTile': return [{ key: 'hex', kind: 'tile', prompt: 'click a land tile next to your settlement or city', list: () => b.hexes.filter((h) => h.res !== 'desert' && h.v.some((x) => v.buildings[x] && v.buildings[x].owner === v.me)).map((h) => h.id) }];
    case 'banditTile': return [{ key: 'hex', kind: 'tile', prompt: 'click the tile the bandit moves to', list: () => b.hexes.filter((h) => h.id !== v.bandit).map((h) => h.id) }];
    case 'deserter': return [
      { key: 'vertex', kind: 'corner', big: true, prompt: "click the opponent's warden that deserts", list: foeWardens },
      { key: 'vertex2', kind: 'corner', optional: true, prompt: 'click where your own warden joins (or press “Play now”)', list: () => v.hints.wardenSpots.concat(C.picks.vertex !== undefined && crTouchesMyRoad(v, C.picks.vertex) ? [C.picks.vertex] : []) }];
    case 'road': return [{ key: 'edge', kind: 'side', prompt: 'click a road with a loose end', list: () => Object.keys(v.roads).map(Number) }];
    case 'foeWardenOnRoad': return [{ key: 'vertex', kind: 'corner', big: true, prompt: "click an opponent's warden standing on your road", list: () => foeWardens().filter((x) => crTouchesMyRoad(v, x)) }];
    default: return [];
  }
}
const CR_MODAL_TARGET = ['dice', 'res', 'com', 'anyCard', 'richer', 'edictHolder'];

function crStartEdict(v, kind) {
  S.cr = { edict: kind, step: 0, picks: {} };
  openModal('cr-edict');
}
function crPlayEdict(v) {
  const C = S.cr;
  send({ type: 'playEdict', kind: C.edict, ...C.picks }).then((ok) => {
    S.mode = null; S.cr = null;
    if (ok) closeModal();
    render();
  });
}
function crEdictPlayable(v, kind) {
  const e = v.crowns.info.edicts[kind];
  return v.status === 'playing' && isMine(v) && v.turn.phase === (e.when === 'preroll' ? 'preroll' : 'main');
}

// ---------- dock ----------
function crDockCan(v, me, hand, building, can, left, label, what) {
  const c = v.crowns;
  can.wall = building && has(hand, c.costs.wall) && v.hints.wallSpots.length > 0;
  can.warden = building && has(hand, c.costs.warden) && c.me.wardenPieces[1] > 0 && v.hints.wardenSpots.length > 0;
  left.wall = c.me.wallPieces; left.warden = c.me.wardenPieces[1];
  label.wall = 'Wall'; label.warden = 'Warden';
  label.village = 'Settlement';
  what.wall = 'City wall — around one of your cities: +2 to your hand limit when a 7 is rolled. Lost if the city is sacked';
  what.warden = 'Warden — on an empty corner along your roads. Activate it with 🌾 to defend against the raiders, move, push weaker wardens or chase the bandit';
  what.town = 'City — upgrades a settlement (2 points). Cities next to forest, pasture and mountains also make 📃 parchment, 🧵 linen and 🪙 silver';
}

function crDockExtraButtons(v) {
  if (S.mode && S.mode === 'edict' && S.cr) {
    const steps = crEdictSteps(v, S.cr.edict); const step = steps[S.cr.step];
    return `${step && step.optional ? '<button class="btn primary" data-cr="edict-go">Play now</button>' : ''}<button class="btn" data-cr="cancel">Cancel edict</button>`;
  }
  if (['wmove', 'wpush', 'capital'].includes(S.mode)) return '<button class="btn" data-cr="cancel">Cancel</button>';
  return '';
}

function crDockPanel(v, hand) {
  const c = v.crowns; const me = c.me; if (!me) return '';
  const building = isBuilding(v); const cities = crMyCities(v).length;
  const tracks = CR_TRACKS.map((k) => {
    const T = CRT[k]; const lvl = me.improve[k]; const cost = crLevelCost(v, k);
    const capHere = c.capitals[k];
    const capOwner = capHere !== null && v.buildings[capHere] ? v.buildings[capHere].owner : null;
    const ok = building && cities > 0 && lvl < 5 && (hand[T.com] || 0) >= cost;
    const why = lvl >= 5 ? 'Top level reached' : !cities ? 'You need a city to improve' : !building ? 'Improve on your turn (or in the builder phase)' : (hand[T.com] || 0) < cost ? `Needs ${cost} ${RM[T.com].name}` : '';
    const pips = Array.from({ length: 5 }, (_, i) => `<span class="lv ${i < lvl ? 'on' : ''} ${i === 2 ? 'power' : ''} ${i >= 3 ? 'cap' : ''}" title="Level ${i + 1}${i === 2 ? ': unlocks the power' : i === 3 ? ': founds the capital if nobody has it' : i === 4 ? ': takes the capital from someone below 5' : ''}"></span>`).join('');
    const reach = lvl ? `draws an edict when the ${T.gate} opens and the red die shows 1–${lvl + 1}` : 'level 1 lets you draw edicts';
    return `<div class="track" style="--tc:${T.color};--ti:${T.ink}">
      <div class="tr-head"><span class="tr-ico">${T.ico}</span><b>${T.name}</b><span class="tr-lv">Lv ${lvl}</span>${capOwner ? `<span class="tr-cap" title="${T.name} capital: ${esc(pname(v, capOwner))}">👑${capOwner === v.me ? ' yours' : ''}</span>` : ''}</div>
      <div class="tr-pips">${pips}</div>
      <div class="tr-power ${lvl >= 3 ? 'on' : ''}" title="${esc(c.info.power[k])}">${lvl >= 3 ? '✓ ' : 'Lv 3: '}${esc(c.info.power[k].split(' — ')[0])}</div>
      <div class="tr-reach hint">${reach}</div>
      <button class="btn small ${ok ? 'primary' : ''}" data-improve="${k}" ${ok ? '' : `disabled title="${esc(why)}"`}>${lvl >= 5 ? 'Maxed' : `Improve <span class="cost">${costHtml({ [T.com]: cost }, hand) || 'free'}</span>`}</button>
    </div>`;
  }).join('');
  const playable = (k) => crEdictPlayable(v, k);
  const edicts = me.edicts.map((k, i) => {
    const e = c.info.edicts[k]; const T = CRT[e.deck];
    return `<div class="devcard edict" style="--tc:${T.color}">
      <div class="dc-head"><span class="dc-ico">${T.ico}</span><b>${esc(e.name)}</b></div>
      <p>${esc(e.desc)}</p>
      <div class="dc-foot"><button class="btn small primary" data-edict="${k}" data-i="${i}" ${playable(k) ? '' : `disabled title="${e.when === 'preroll' ? 'Play it on your turn, before rolling' : 'Play it on your turn, after rolling'}"`}>Play</button></div></div>`;
  }).join('');
  const myW = v.hints.myWardens;
  const wardens = myW.length
    ? `🛡️ ${myW.length} warden${myW.length > 1 ? 's' : ''} · strength <b>${me.strength}</b> active — <span class="hint">click one on the board to activate (🌾), promote, move, push or chase the bandit</span>`
    : '<span class="hint">🛡️ No wardens yet. Raise one (🐑⛏️) and activate it (🌾) to defend against the raiders.</span>';
  return `<div class="crpanel">
    <div class="cr-tracks">${tracks}</div>
    <div class="cr-wardens">${wardens}</div>
    ${edicts ? `<div class="devcards"><div class="dc-title">Your edicts <span class="hint">· ${me.edicts.length}/4</span></div><div class="dc-row">${edicts}</div></div>` : ''}
  </div>`;
}

// Improving a track: if it founds or takes a capital and you have several cities, pick which one on the board.
function crImprove(v, k) {
  const c = v.crowns; const lvl = c.me.improve[k] + 1;
  const holderV = c.capitals[k];
  const holder = holderV !== null && v.buildings[holderV] ? v.buildings[holderV].owner : null;
  const holderP = holder && v.players.find((p) => p.id === holder);
  const plan = (lvl >= 4 && holderV === null) || (lvl === 5 && holder && holder !== v.me && holderP.cr.improve[k] < 5);
  if (plan && v.hints.capitalCities.length > 1) {
    S.mode = 'capital'; S.cr = { track: k };
    toast(`👑 Level ${lvl} makes a ${CRT[k].name} capital — click the city it goes to`);
    render();
    return;
  }
  send({ type: 'improve', track: k });
}

function crBindDock(v) {
  const dock = $('#dock');
  dock.querySelectorAll('[data-improve]').forEach((b) => { b.onclick = () => crImprove(S.v, b.dataset.improve); });
  dock.querySelectorAll('[data-edict]').forEach((b) => { b.onclick = () => crStartEdict(S.v, b.dataset.edict); });
  dock.querySelectorAll('[data-cr]').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.cr === 'cancel') { S.mode = null; S.cr = null; render(); }
      if (b.dataset.cr === 'edict-go') crPlayEdict(S.v);
    };
  });
  // build buttons for walls and wardens choose a spot on the board, like roads
}

// ---------- players panel ----------
function crPlayerStats(v, p) {
  const c = p.cr;
  return `<span title="City improvements: ${CR_TRACKS.map((k) => `${CRT[k].name} ${c.improve[k]}`).join(' · ')}">${CR_TRACKS.map((k) => `${CRT[k].ico}${c.improve[k]}`).join(' ')}</span>
    <span title="Strength of active wardens">⚔️ ${c.strength}</span><span title="Edicts in hand">📜 ${c.edicts}</span>${c.walls ? `<span title="City walls">🧱 ${c.walls}</span>` : ''}
    ${c.capitals.map((k) => `<span class="badge award" style="background:${CRT[k].color};color:#fff" title="${CRT[k].name} capital (+2)">👑 ${CRT[k].name}</span>`).join('')}
    ${c.defender ? `<span class="badge award" title="Defender of the Isle: +1 point each">🛡️ Defender${c.defender > 1 ? ' ×' + c.defender : ''}</span>` : ''}
    ${c.merchant ? '<span class="badge award" title="Holds the merchant (+1)">💰 Merchant</span>' : ''}
    ${c.edictVP ? `<span class="badge award" title="Point edicts drawn">📜 +${c.edictVP}</span>` : ''}`;
}

// ---------- windows ----------
function crModalValid(v, kind) {
  const c = v.crowns; if (!c || v.status !== 'playing' || !c.me) return false;
  if (kind === 'cr-warden') { const w = S.cr && c.wardens[S.cr.warden]; return !!(w && w.owner === v.me); }
  if (kind === 'cr-edict') return !!(S.cr && S.cr.edict && c.me.edicts.includes(S.cr.edict) && crEdictPlayable(v, S.cr.edict));
  return true;
}

function crRulesHtml(v) {
  const info = v.crowns ? v.crowns.info : null;
  const deck = (k) => (info ? Object.entries(info.edicts).filter(([, e]) => e.deck === k).map(([, e]) => `<div class="devcard edict" style="--tc:${CRT[k].color}">
      <div class="dc-head"><span class="dc-ico">${CRT[k].ico}</span><b>${esc(e.name)}</b>${e.n > 1 ? `<span class="dc-n">×${e.n}</span>` : ''}</div><p>${esc(e.desc)}</p></div>`).join('') : '');
  return `<h2>👑 Crowns & Raiders</h2>
    <ul class="cr-rules">
      <li><b>Commodities.</b> A city next to forest, pasture or mountains takes 1 resource + 1 commodity (📃 parchment, 🧵 linen, 🪙 silver) instead of 2 resources. Other cities still take 2.</li>
      <li><b>City improvements.</b> Three tracks, levels 1–5, paid with commodities (level n costs n): ${CR_TRACKS.map((k) => `${CRT[k].ico} ${CRT[k].name} (${RM[CRT[k].com].ico} ${RM[CRT[k].com].name})`).join(', ')}. You need a city. Level 3 unlocks a power: ${CR_TRACKS.map((k) => esc(info ? info.power[k] : '')).join('; ')}.</li>
      <li><b>Capitals.</b> The first to level 4 in a track turns one of their cities into its capital (+2 points, safe from raids). The first to level 5 takes it from anyone below 5.</li>
      <li><b>The event die.</b> Each roll also throws an event die, and the second number die is red. ⛵ moves the raiders' ship one step. A gate (${CR_TRACKS.map((k) => CRT[k].ico).join(' ')}) gives an edict from that deck to everyone whose level n in the track covers the red die (1 to n+1).</li>
      <li><b>Raids.</b> When the ship arrives (step 7), the raiders (one per city on the island) fight all active wardens (their ranks added up). If the wardens win, the strongest player is Defender of the Isle (+1 point); a tie draws an edict each. If the raiders win, the players with the weakest wardens each lose a city (it becomes a settlement, and its wall is lost). Then every warden goes inactive. The bandit can't leave the dunes before the first raid.</li>
      <li><b>Wardens.</b> Raise one (🐑⛏️) on a free corner along your roads, then activate it (🌾). From the next turn an active warden can move along your roads, push a weaker opponent warden away, or chase the bandit off a tile it touches; acting makes it inactive again. Promote with 🐑⛏️: rank 2 Veteran, rank 3 Champion (needs Council level 3). Wardens block roads and settlements like buildings.</li>
      <li><b>Walls</b> (🧱🧱) go around your cities: +2 cards each to your hand limit when a 7 is rolled. At most 3.</li>
      <li><b>Edicts</b> replace development cards. Play them on your turn after rolling (Weighted Dice before rolling), as many as you like. You hold at most 4. Point edicts (+1) are revealed at once. Played edicts go back under their deck.</li>
      <li><b>Setup.</b> Your second piece is a city. First to <b>13</b> points wins (unless the host changed it).</li>
    </ul>
    ${info ? CR_TRACKS.map((k) => `<h3 style="font-size:16px;margin-top:6px">${CRT[k].ico} ${CRT[k].name} edicts</h3><div class="dc-row">${deck(k)}</div>`).join('') : ''}
    <div class="foot"><button class="btn" data-do="close">Close</button></div>`;
}

function crModalHtml(v, kind) {
  const c = v.crowns; const hand = v.hand || zero();
  if (kind === 'crref') return crRulesHtml(v);
  if (kind === 'freepick') {
    return `<h2>💧 Waterworks</h2><p>The roll gave you nothing, so your Academy's Waterworks lets you take any one resource.</p>
      <div class="respick">${RES.map((r) => `<button class="btn" data-free="${r}" ${v.bank[r] > 0 ? '' : 'disabled'}><span class="ico">${RM[r].ico}</span>${RM[r].name}<span class="hint">bank ${v.bank[r]}</span></button>`).join('')}</div>`;
  }
  if (kind === 'edictpick') {
    return `<h2>📜 Draw an edict</h2><p>You shared the honor of defending the isle. Choose the deck to draw from.</p>
      <div class="respick">${CR_TRACKS.map((k) => `<button class="btn" data-deck="${k}" style="border-color:${CRT[k].color}"><span class="ico">${CRT[k].ico}</span>${CRT[k].name}<span class="hint">${c.deckCounts[k]} left</span></button>`).join('')}</div>`;
  }
  if (kind === 'cr-warden') {
    const x = S.cr.warden; const w = c.wardens[x]; const h = v.hints.myWardens.find((m) => m.vertex === x) || {};
    const mainNow = crMainNow(v);
    const fresh = w.active && w.activatedTurn === v.turn.number;
    const btn = (act, label, ok, why) => `<button class="btn ${ok ? '' : ''}" data-wact="${act}" ${ok ? '' : `disabled title="${esc(why)}"`}>${label}</button>`;
    const needTurn = isBuilding(v) ? '' : 'Only on your turn (or in the builder phase)';
    const actWhy = !mainNow ? 'Only after rolling, on your own turn' : !w.active ? 'Activate it first' : fresh ? 'Activated this turn — it can act from your next turn' : '';
    return `<h2>🛡️ Your ${CR_RANK_NAME[w.level]} <span class="hint">rank ${w.level} · ${w.active ? '🔥 active' : 'inactive'}</span></h2>
      <p class="hint" style="margin:0">Active wardens defend the island when the raiders land. Moving, pushing or chasing makes the warden inactive again.</p>
      <div class="wact">
        ${btn('activate', `🔥 Activate <span class="cost">${costHtml(c.costs.activate, hand)}</span>`, h.canActivate && has(hand, c.costs.activate), needTurn || (w.active ? 'Already active' : 'Needs 1 wheat'))}
        ${btn('promote', `⬆️ Promote to ${CR_RANK_NAME[Math.min(3, w.level + 1)]} <span class="cost">${costHtml(c.costs.promote, hand)}</span>`, h.canPromote && has(hand, c.costs.promote),
          needTurn || (w.level >= 3 ? 'Already a Champion' : w.level === 2 && c.me.improve.council < 3 ? 'Champions need Council level 3' : c.me.wardenPieces[w.level + 1] <= 0 ? 'No pieces of that rank left' : 'Needs 1 fleece and 1 iron'))}
        ${btn('move', '🚶 Move along your roads', (h.moves || []).length > 0, actWhy || 'No free corner it can reach')}
        ${btn('push', '⚔️ Push away a weaker warden', (h.pushes || []).length > 0, actWhy || 'No weaker opponent warden within reach')}
        ${btn('chase', '🥷 Chase the bandit away', !!h.chase, actWhy || (!c.banditFree ? 'The bandit stays in the dunes until the first raid' : 'The bandit is not on a tile this warden touches'))}
      </div>
      <div class="foot"><button class="btn" data-do="close">Close</button></div>`;
  }
  if (kind === 'cr-edict') {
    const k = S.cr.edict; const e = c.info.edicts[k]; const T = CRT[e.deck];
    const target = e.target; const steps = crEdictSteps(v, k);
    const pick = S.cr.pick; let body = ''; let ready = true;
    const me = crMe(v);
    if (target === 'dice') {
      const d = S.cr.dice || (S.cr.dice = [3, 4]);
      body = `<div class="dicepick">${[0, 1].map((i) => `<div><b>${i ? 'Red die' : 'White die'}</b><div class="dp-row">${[1, 2, 3, 4, 5, 6].map((n) => `<button class="dp ${d[i] === n ? 'on' : ''}" data-die="${i}:${n}" aria-label="${n}">${dieSvg(n, i === 1)}</button>`).join('')}</div></div>`).join('')}
        <div class="hint">Total ${d[0] + d[1]}${d[0] + d[1] === 7 ? ' — the bandits strike!' : ''}</div></div>`;
    } else if (['res', 'com', 'anyCard'].includes(target)) {
      const list = target === 'res' ? RES : target === 'com' ? COMS : ALLC;
      body = `<div class="respick">${list.map((r) => `<button class="btn ${pick === r ? 'on' : ''}" data-epick="${r}"><span class="ico">${RM[r].ico}</span>${RM[r].name}</button>`).join('')}</div>`;
      ready = !!pick;
    } else if (target === 'richer' || target === 'edictHolder') {
      const list = v.players.filter((p) => p.id !== v.me && (target === 'richer' ? p.vp > me.vp : p.cr.edicts > 0));
      body = list.length ? `<div class="respick">${list.map((p) => `<button class="btn ${pick === p.id ? 'on' : ''}" data-epick="${p.id}">${chip(p.color)} ${esc(p.name)}<span class="hint">${target === 'richer' ? `${p.vp} points` : `${p.cr.edicts} edict${p.cr.edicts > 1 ? 's' : ''}`}</span></button>`).join('')}</div>`
        : `<p class="hint">${target === 'richer' ? 'Nobody has more points than you right now.' : 'Nobody else holds an edict right now.'}</p>`;
      ready = !!pick;
    } else if (steps.length) {
      const first = steps[0].list();
      body = `<p class="hint" style="margin:0">You'll pick on the board: ${esc(steps.map((s) => s.prompt.replace(/^click /, '')).join(', then '))}.</p>${first.length ? '' : '<p class="hint"><b>There is nothing you can pick right now.</b></p>'}`;
      ready = first.length > 0;
    }
    const boardPick = steps.length > 0;
    return `<h2>${T.ico} ${esc(e.name)} <span class="hint">${T.name} edict</span></h2>
      <div class="devcard edict big" style="--tc:${T.color}"><p>${esc(e.desc)}</p></div>
      ${body}
      <div class="foot"><button class="btn" data-do="close">Keep it</button>
        <button class="btn primary" data-crdo="${boardPick ? 'eboard' : 'eplay'}" ${ready ? '' : 'disabled'}>${boardPick ? 'Choose on the board' : 'Play it'}</button></div>`;
  }
  return '';
}

function crBindModal(v, root, kind) {
  root.querySelectorAll('[data-free]').forEach((b) => { b.onclick = () => send({ type: 'takeFree', res: b.dataset.free }); });
  root.querySelectorAll('[data-deck]').forEach((b) => { b.onclick = () => send({ type: 'drawEdict', deck: b.dataset.deck }); });
  root.querySelectorAll('[data-wact]').forEach((b) => {
    b.onclick = async () => {
      const x = S.cr.warden; const a = b.dataset.wact;
      if (a === 'activate') { if (await send({ type: 'activateWarden', vertex: x })) closeModal(); }
      if (a === 'promote') { if (await send({ type: 'promoteWarden', vertex: x })) closeModal(); }
      if (a === 'chase') { if (await send({ type: 'wardenChase', from: x })) closeModal(); }
      if (a === 'move' || a === 'push') { closeModal(); S.mode = a === 'move' ? 'wmove' : 'wpush'; S.cr = { from: x }; render(); }
    };
  });
  root.querySelectorAll('[data-die]').forEach((b) => { b.onclick = () => { const [i, n] = b.dataset.die.split(':').map(Number); S.cr.dice[i] = n; renderModal(S.v); }; });
  root.querySelectorAll('[data-epick]').forEach((b) => { b.onclick = () => { S.cr.pick = b.dataset.epick; renderModal(S.v); }; });
  root.querySelectorAll('[data-crdo]').forEach((b) => {
    b.onclick = () => {
      const C = S.cr; const target = S.v.crowns.info.edicts[C.edict].target;
      if (b.dataset.crdo === 'eboard') {
        S.modal = null; $('#modal-root').innerHTML = '';
        S.mode = 'edict'; render();
        return;
      }
      if (target === 'dice') { C.picks.d1 = C.dice[0]; C.picks.d2 = C.dice[1]; }
      else if (['res', 'com', 'anyCard'].includes(target)) C.picks.res = C.pick;
      else if (target === 'richer' || target === 'edictHolder') C.picks.victim = C.pick;
      crPlayEdict(S.v);
    };
  });
}

// ---------- the raid: a big moment over the board ----------
// The ship lands, raiders and wardens count up side by side, then the outcome: who defended the isle or who loses a city.
function crShowRaid(v, r) {
  const fx = $('#fx'); const wrap = $('#boardwrap');
  if (!fx || !r) return;
  fx.querySelectorAll('.raidfx').forEach((e) => e.remove());
  const nm = (id) => esc(pname(v, id));
  const names = (ids) => ids.map(nm).join(', ');
  let title; let sub; let cls;
  if (r.outcome === 'hold') {
    cls = 'hold'; title = '🛡️ The island holds!';
    sub = r.defender ? (r.defender === v.me ? 'You are <b>Defender of the Isle</b> (+1 point)' : `<b>${nm(r.defender)}</b> is Defender of the Isle (+1 point)`)
      : `${names(r.shared)} share the honor and each draw an edict`;
  } else if (r.outcome === 'fall') {
    cls = 'fall'; title = '🔥 The raiders win!';
    const mine = r.losers.includes(v.me);
    sub = mine ? `You lose a city${r.choosing.includes(v.me) ? ' — click which one on the board' : ''}${r.losers.length > 1 ? `, and so do ${names(r.losers.filter((x) => x !== v.me))}` : ''}`
      : `${names(r.losers)} ${r.losers.length > 1 ? 'each lose' : 'loses'} a city (the weakest defense)`;
  } else if (r.outcome === 'capitals') { cls = 'fall'; title = '🔥 The raiders win…'; sub = 'but every city left is a protected capital'; }
  else { cls = 'hold'; title = '⛵ The raiders land…'; sub = 'and find no cities to plunder'; }
  const ranked = v.players.slice().sort((a, b) => (r.strength[b.id] || 0) - (r.strength[a.id] || 0));
  const el = document.createElement('div');
  el.className = 'raidfx ' + cls;
  el.setAttribute('role', 'status');
  el.innerHTML = `<div class="rf-head">⚔️ The raiders land! <span class="hint">raid ${r.id}</span></div>
    <div class="rf-vs">
      <div class="rf-side bad"><div class="rf-n" data-to="${r.attack}">0</div><div class="rf-l">⛵ Raiders<br><span>one per city</span></div></div>
      <div class="rf-mid">vs</div>
      <div class="rf-side good"><div class="rf-n" data-to="${r.defense}">0</div><div class="rf-l">🛡️ Wardens<br><span>active ranks</span></div></div>
    </div>
    <div class="rf-players">${ranked.map((p) => `<span class="rf-p ${p.id === r.defender ? 'def' : ''} ${r.losers.includes(p.id) ? 'lost' : ''}" style="--pc:${PC[p.color]}">${chip(p.color)}${esc(p.name)} <b>${r.strength[p.id] || 0}</b></span>`).join('')}</div>
    <div class="rf-out"><div class="rf-title">${title}</div><div class="rf-sub">${sub}</div></div>
    <div class="rf-hint">click to close</div>`;
  el.onclick = () => el.remove();
  fx.appendChild(el);
  const reduce = !motionOn();
  chime('drum');
  // count the two sides up
  const nums = [...el.querySelectorAll('.rf-n')];
  const t0 = performance.now(); const dur = reduce ? 0 : 900;
  const step = (now) => {
    const k = dur ? Math.min(1, (now - t0) / dur) : 1;
    nums.forEach((n) => { n.textContent = Math.round(Number(n.dataset.to) * k); });
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => {
    el.classList.add('done');
    chime(cls === 'fall' ? 'raidfall' : 'raidhold');
    if (wrap) { const f = document.createElement('div'); f.className = 'raid-flash ' + cls; wrap.appendChild(f); setTimeout(() => f.remove(), 1600); }
  }, dur + 150);
  setTimeout(() => el.classList.add('out'), dur + 6500);
  setTimeout(() => el.remove(), dur + 7000);
}
