// Structured battle-log parser + viewer. Pure JS, no sim dependency except the move-type lookup.
import {moveType} from './engine.js';

export const TC = {Normal: '#8a8f98', Fire: '#e8683a', Water: '#4a8fe0', Electric: '#d9a400', Grass: '#4fa84a', Ice: '#4ab0c8', Fighting: '#c03a4a', Poison: '#a050c0', Ground: '#b8843f', Flying: '#7f98d8', Psychic: '#e8587f', Bug: '#8fa81f', Rock: '#a89858', Ghost: '#6a5aa8', Dragon: '#5a4fd0', Dark: '#5a4a48', Steel: '#6a8ea0', Fairy: '#e07ac8'};
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const SIDE = ['🟦', '🟥'], NAME = ['You', 'Boss'];
const STAT = {atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', accuracy: 'Acc', evasion: 'Eva'};
const STS = {brn: 'burned', par: 'paralyzed', psn: 'poisoned', tox: 'badly poisoned', slp: 'asleep', frz: 'frozen'};
const WX = {SunnyDay: 'Harsh sunlight', RainDance: 'Rain', Sandstorm: 'Sandstorm', Hail: 'Hail', Snow: 'Snow', DesolateLand: 'Extremely harsh sunlight', PrimordialSea: 'Heavy rain', DeltaStream: 'Strong winds'};
const DETAIL = new Set(['ability', 'detail']); // hidden when "Details" is off

// ---------- Parser ----------
export function parseLog(log) {
  const sd = s => (s[1] === '1' ? 0 : 1), nm = s => s.replace(/^p[12][a-z]?:\s*/, ''), isMon = s => /^p[12][a-z]?:/.test(s || '');
  const hp = h => { const m = /^(\d+)(?:\/(\d+))?/.exec(h || ''); return m ? {cur: +m[1], max: m[2] ? +m[2] : 0} : null; };
  const fromOf = p => { const f = p.find(x => x && x.startsWith('[from]')); return f ? f.replace(/^\[from\]\s*(?:\w+:\s*)?/, '') : ''; };
  const ofOf = p => { const f = p.find(x => x && x.startsWith('[of]')); return f && isMon(f.slice(5).trim()) ? nm(f.slice(5).trim()) : ''; };
  const mons = [{}, {}], act = [null, null], fainted = [false, false], lastSrc = ['', ''];
  const info = s => { const n = act[s], m = n && mons[s][n]; return n ? {name: n, cur: m.cur, max: m.max} : null; };
  const turns = [{n: 0, start: null, ev: []}], faints = [];
  let T = turns[0], cur = null, ord = 0, winner = null;
  const note = (s, text, kind) => { const o = {t: 'note', s, text, kind}; if (cur && (s === -1 || s === cur.s || s === cur.ts)) cur.notes.push(o); else T.ev.push(o); };
  const mon = (s, n, h) => mons[s][n] || (mons[s][n] = {cur: h ? h.cur : 0, max: h ? h.max : 0});

  for (const l of log) {
    const p = l.split('|'), k = p[1];
    if (k === 'turn') { T = {n: +p[2], start: {you: info(0), boss: info(1)}, ev: []}; turns.push(T); cur = null; ord = 0; continue; }
    if (k === '' || k === 'upkeep') { cur = null; continue; }
    if (k === 'switch' || k === 'drag') {
      const s = sd(p[2]), n = nm(p[2]), h = hp(p[4]) || {cur: 0, max: 0};
      const by = k === 'drag' && cur && cur.s !== s ? cur.move : '';
      mons[s][n] = {cur: h.cur, max: h.max}; act[s] = n;
      const how = k === 'drag' ? 'drag' : fainted[s] ? 'send' : T.n === 0 ? 'lead' : 'switch';
      fainted[s] = false; cur = null;
      T.ev.push({t: 'switch', s, mon: n, how, by, cur: h.cur, max: h.max});
      continue;
    }
    switch (k) {
      case 'move': {
        const s = sd(p[2]), tg = isMon(p[4]);
        cur = {t: 'move', s, mon: nm(p[2]), move: p[3], tgt: tg ? nm(p[4]) : '', ts: tg ? sd(p[4]) : s, ord: ++ord, miss: l.includes('[miss]'), eff: '', crit: false, hits: 0, dmg: null, immune: '', notes: []};
        T.ev.push(cur); break;
      }
      case '-supereffective': if (cur) cur.eff = 'se'; break;
      case '-resisted': if (cur) cur.eff = 'nve'; break;
      case '-crit': if (cur) cur.crit = true; break;
      case '-miss': if (cur) cur.miss = true; break;
      case '-hitcount': if (cur) cur.hits = +p[3]; break;
      case '-immune': if (cur && sd(p[2]) === cur.ts && cur.ts !== cur.s) { cur.eff = 'imm'; cur.immune = fromOf(p); } else note(sd(p[2]), `${nm(p[2])} is unaffected${fromOf(p) ? ' (' + fromOf(p) + ')' : ''}`, 'detail'); break;
      case '-damage': {
        const s = sd(p[2]), n = nm(p[2]), h = hp(p[3]); if (!h) break;
        const m = mon(s, n, {cur: h.max, max: h.max}), from = m.cur, max = h.max || m.max, src = fromOf(p);
        m.cur = h.cur; m.max = max;
        if (!src && cur && cur.ts === s) { if (!cur.dmg) cur.dmg = {from, to: h.cur, max}; else cur.dmg.to = h.cur; lastSrc[s] = `${cur.mon}'s ${cur.move}`; }
        else { if (src) lastSrc[s] = src; note(s, `${n} −${from - h.cur} HP${src ? ' (' + src + ')' : ''}${h.cur === 0 ? ' → KO' : ''}`, 'dmg'); }
        break;
      }
      case '-heal': {
        const s = sd(p[2]), n = nm(p[2]), h = hp(p[3]); if (!h) break;
        const m = mon(s, n, h), d = h.cur - m.cur; m.cur = h.cur; if (h.max) m.max = h.max;
        note(s, `${n} +${d} HP${fromOf(p) ? ' (' + fromOf(p) + ')' : ''}`, 'heal'); break;
      }
      case '-sethp': { const s = sd(p[2]), n = nm(p[2]), h = hp(p[3]); if (h) { const m = mon(s, n, h); m.cur = h.cur; if (h.max) m.max = h.max; } break; }
      case '-status': note(sd(p[2]), `${nm(p[2])} is ${STS[p[3]] || p[3]}${fromOf(p) ? ' (' + fromOf(p) + ')' : ''}`, 'status'); break;
      case '-curestatus': note(sd(p[2]), `${nm(p[2])} cured of ${STS[p[3]] || p[3]}`, 'status'); break;
      case '-boost': case '-unboost': note(sd(p[2]), `${nm(p[2])} ${STAT[p[3]] || p[3]} ${k === '-boost' ? '+' : '−'}${p[4]}`, k === '-boost' ? 'boost' : 'unboost'); break;
      case '-ability': note(sd(p[2]), `${nm(p[2])}: ${p[3]}${p[4] && !p[4].startsWith('[') ? ' (' + p[4] + ')' : ''}`, 'ability'); break;
      case '-weather': {
        if (p.includes('[upkeep]')) break;
        const who = ofOf(p), src = fromOf(p);
        note(-1, p[2] === 'none' ? 'Weather cleared' : `Weather: ${WX[p[2]] || p[2]}${src ? ' (' + src + (who ? ', ' + who : '') + ')' : ''}`, 'weather'); break;
      }
      case '-fieldstart': case '-fieldend': note(-1, `${p[2].replace(/^move: /, '')} ${k === '-fieldstart' ? 'started' : 'ended'}`, 'weather'); break;
      case '-sidestart': case '-sideend': { const s = p[2][1] === '1' ? 0 : 1; note(-1, `${NAME[s]} side: ${p[3].replace(/^move: /, '')} ${k === '-sidestart' ? 'set' : 'ended'}`, 'weather'); break; }
      case '-item': note(sd(p[2]), `${nm(p[2])}: ${p[3]} revealed`, 'detail'); break;
      case '-enditem': note(sd(p[2]), `${nm(p[2])}'s ${p[3]} ${fromOf(p) ? 'used (' + fromOf(p) + ')' : 'was used up'}`, 'item'); break;
      case '-activate': note(sd(p[2]), `${nm(p[2])}: ${p.slice(3).filter(x => x && !x.startsWith('[')).join(' ').replace(/(^|\s)(ability|move|item): /g, '$1')}`, 'detail'); break;
      case '-start': case '-end': note(sd(p[2]), `${nm(p[2])} ${k === '-start' ? 'gained' : 'lost'} ${(p[3] || '').replace(/^(typechange|ability|move): ?/, '')}`, 'detail'); break;
      case '-fail': note(sd(p[2]), `${nm(p[2])}: it failed`, 'detail'); break;
      case '-mega': note(sd(p[2]), `${nm(p[2])} Mega Evolved`, 'mega'); break;
      case 'cant': cur = null; T.ev.push({t: 'note', s: sd(p[2]), text: `${nm(p[2])} can't move (${p[3]})`, kind: 'status'}); break;
      case 'faint': {
        const s = sd(p[2]); fainted[s] = true;
        const f = {t: 'faint', s, mon: nm(p[2]), by: lastSrc[s], turn: T.n};
        T.ev.push(f); faints.push(f); break;
      }
      case 'message': T.ev.push({t: 'msg', text: p[2]}); break;
      case 'win': winner = p[2]; T.ev.push({t: 'win', winner: p[2]}); break;
      default: break; // protocol noise (debug, t:, raw, request, ...)
    }
  }
  return {turns, faints, winner, nTurns: turns[turns.length - 1].n};
}

// ---------- Plain text (for copy/paste) ----------
const hpPct = (c, m) => (m ? Math.round(100 * c / m) : 0);
const dmgPct = d => Math.round(100 * (d.from - d.to) / (d.max || 1));
const tagsOf = e => [e.crit && 'CRIT', e.eff === 'se' && 'SUPER EFFECTIVE', e.eff === 'nve' && 'resisted', e.miss && 'MISSED', e.eff === 'imm' && `IMMUNE${e.immune ? ' (' + e.immune + ')' : ''}`, e.hits > 1 && `${e.hits} hits`].filter(Boolean);
const SWL = {lead: 'leads with', switch: 'switched to', send: 'sent out'};
const swText = e => (e.how === 'drag' ? `${e.mon} was dragged in${e.by ? ' by ' + e.by : ''}` : `${SWL[e.how]} ${e.mon}`);
export function logText(P) {
  const L = [`Result: ${P.winner ? P.winner + ' wins' : 'unfinished'} after ${P.nTurns} turns`, ''];
  const hs = i => (i ? `${i.name} ${i.cur}/${i.max} (${hpPct(i.cur, i.max)}%)` : '-');
  const nt = n => `${n.s >= 0 ? '[' + NAME[n.s] + '] ' : ''}${n.text}`;
  for (const T of P.turns) {
    L.push(T.n ? `== Turn ${T.n} | You: ${hs(T.start.you)} | Boss: ${hs(T.start.boss)}` : '== Battle start');
    for (const e of T.ev) {
      if (e.t === 'move') {
        const tg = tagsOf(e);
        L.push(`${e.ord}. [${NAME[e.s]}] ${e.mon} used ${e.move}${e.tgt && e.ts !== e.s ? ' -> ' + e.tgt : ''}${e.dmg ? `  ${e.dmg.from}->${e.dmg.to}/${e.dmg.max} (-${dmgPct(e.dmg)}%)` : ''}${tg.length ? '  [' + tg.join(', ') + ']' : ''}`);
        e.notes.forEach(n => L.push('      ' + nt(n)));
      } else if (e.t === 'switch') L.push(`   [${NAME[e.s]}] ${swText(e)} (${e.cur}/${e.max})`);
      else if (e.t === 'faint') L.push(`   X ${e.mon} fainted${e.by ? ' - ' + e.by : ''}`);
      else if (e.t === 'note') L.push('   ' + nt(e));
      else if (e.t === 'msg') L.push('   * ' + e.text);
      else if (e.t === 'win') L.push(`WINNER: ${e.winner}`);
    }
  }
  return L.join('\n');
}

// ---------- HTML ----------
const hpCol = f => (f > .5 ? 'var(--good)' : f > .2 ? 'var(--warn)' : 'var(--bad)');
const mini = (c, m) => `<span class="mh"><i style="width:${m ? (100 * c / m).toFixed(0) : 0}%;background:${hpCol(m ? c / m : 0)}"></i></span>`;
const hpTxt = i => (i ? `${esc(i.name)} <span class="pc">${hpPct(i.cur, i.max)}%</span>${mini(i.cur, i.max)}` : '—');
const tag = (c, t) => `<span class="tag ${c}">${t}</span>`;
const tagsHtml = e => [e.crit && tag('crit', 'Crit'), e.eff === 'se' && tag('se', 'Super effective'), e.eff === 'nve' && tag('nve', 'Resisted'), e.miss && tag('miss', 'Missed'), e.eff === 'imm' && tag('imm', 'Immune' + (e.immune ? ' · ' + esc(e.immune) : '')), e.hits > 1 && tag('hit', e.hits + ' hits')].filter(Boolean).join('');
const pillHtml = e => { const d = e.dmg; return `<span class="pill a${e.s}">−${dmgPct(d)}%<small>${d.from}→${d.to}</small></span>${mini(d.to, d.max)}${d.to === 0 ? tag('ko', 'KO') : ''}`; };
const noteHtml = (n, det, solo) => (!det && DETAIL.has(n.kind) ? '' : `<div class="nt k-${n.kind}${solo ? ' solo' : ''}">${n.s >= 0 ? SIDE[n.s] + ' ' : ''}${esc(n.text)}</div>`);

function evHtml(e, det) {
  if (e.t === 'move') {
    const col = TC[moveType(e.move)] || 'var(--mut)';
    return `<div class="ev s${e.s}"><span class="ord" title="${e.ord === 1 ? 'Acted first' : 'Acted later'}">${e.ord}</span><span class="who">${SIDE[e.s]} ${esc(e.mon)}</span><span class="mu">used</span><b class="mvn" style="--tc:${col}">${esc(e.move)}</b>${e.tgt && e.ts !== e.s ? `<span class="mu">→ ${esc(e.tgt)}</span>` : ''}${e.dmg ? pillHtml(e) : ''}${tagsHtml(e)}${e.notes.map(n => noteHtml(n, det)).join('')}</div>`;
  }
  if (e.t === 'switch') {
    const txt = e.how === 'drag' ? `<b>${esc(e.mon)}</b> was dragged in${e.by ? ' by ' + esc(e.by) : ''}` : `${SWL[e.how]} <b>${esc(e.mon)}</b>`;
    return `<div class="ev s${e.s} sw"><span class="who">${SIDE[e.s]} ${NAME[e.s]}</span> ${txt} ${mini(e.cur, e.max)} <span class="pc">${e.cur}/${e.max}</span></div>`;
  }
  if (e.t === 'faint') return `<div class="ev s${e.s} fn">☠ <b>${esc(e.mon)}</b> fainted${e.by ? ` <span class="mu">— ${esc(e.by)}</span>` : ''}</div>`;
  if (e.t === 'win') return `<div class="ev win">🏆 ${esc(e.winner)} wins</div>`;
  if (e.t === 'msg') return `<div class="ev it">🎒 ${esc(e.text)}</div>`;
  if (e.t === 'note') { const h = noteHtml(e, det, true); return h ? `<div class="ev nn s${e.s}">${h}</div>` : ''; }
  return '';
}

const LP = (() => { const d = {view: 'turns', details: true, fold: false}; try { return {...d, ...JSON.parse(localStorage.getItem('lp') || '{}')}; } catch (e) { return d; } })();
const saveLP = () => { try { localStorage.setItem('lp', JSON.stringify(LP)); } catch (e) {} };

function turnsView(P, newest) {
  const last = P.turns[P.turns.length - 1];
  return (newest ? [...P.turns].reverse() : P.turns).map(T => {
    const head = T.n ? `<b>Turn ${T.n}</b><span class="mu">🟦 ${hpTxt(T.start.you)} <span class="vs">vs</span> 🟥 ${hpTxt(T.start.boss)}</span>` : '<b>Battle start</b>';
    const body = T.ev.map(e => evHtml(e, LP.details)).join('') || '<div class="mu" style="padding:6px 2px">No actions</div>';
    return `<details class="tn" ${!LP.fold || T === last ? 'open' : ''}><summary>${head}</summary><div class="evs">${body}</div></details>`;
  }).join('');
}

function bossView(P) {
  const rows = [], use = {}, sw = {};
  for (const T of P.turns) for (const e of T.ev) {
    if (e.s !== 1 || (e.t !== 'move' && e.t !== 'switch')) continue;
    rows.push({T, e});
    if (e.t === 'move') { (use[e.mon] || (use[e.mon] = {}))[e.move] = ((use[e.mon] || {})[e.move] || 0) + 1; }
    else if (e.how === 'switch') sw[e.mon] = (sw[e.mon] || 0) + 1;
  }
  const usage = Object.entries(use).map(([m, mv]) => `<div class="uc"><b>${esc(m)}</b> ${Object.entries(mv).sort((a, b) => b[1] - a[1]).map(([n, c]) => `<span class="mc" style="--tc:${TC[moveType(n)] || 'var(--line)'}">${esc(n)} ×${c}</span>`).join('')}</div>`).join('') || '<div class="mu">Boss made no moves.</div>';
  const res = e => {
    if (e.t === 'switch') return `<span class="mu">${esc(swText(e))}</span>`;
    const bits = [];
    if (e.dmg) bits.push(`<b>−${dmgPct(e.dmg)}%</b>${e.dmg.to === 0 ? ' KO' : ''}`);
    bits.push(tagsHtml(e));
    const nn = e.notes.filter(n => n.s !== 1 || n.kind !== 'dmg').map(n => esc(n.text)).join('; ');
    if (!e.dmg && !e.miss && e.eff !== 'imm' && nn) bits.push(`<span class="mu">${nn}</span>`);
    return bits.join(' ') || '<span class="mu">—</span>';
  };
  const body = rows.map(({T, e}) => {
    const st = T.start;
    const act = e.t === 'move' ? `<b class="mvn" style="--tc:${TC[moveType(e.move)] || 'var(--mut)'}">${esc(e.move)}</b>` : `<b>switch</b>`;
    const who = e.t === 'move' ? e.mon : (st && st.boss ? st.boss.name : '—');
    return `<tr><td>${T.n || '—'}</td><td>${esc(who)}${st && st.boss && e.t === 'move' ? ` <span class="pc">${hpPct(st.boss.cur, st.boss.max)}%</span>` : ''}</td><td>${st && st.you ? `${esc(st.you.name)} <span class="pc">${hpPct(st.you.cur, st.you.max)}%</span>` : '—'}</td><td>${act}</td><td>${res(e)}</td><td>${e.t === 'move' ? (e.ord === 1 ? '1st' : 'later') : ''}</td></tr>`;
  }).join('');
  return `<div class="pad"><h2>Boss move usage</h2>${usage}<h2 style="margin-top:14px">Every boss action</h2><div class="sc"><table class="dt"><tr><th>Turn</th><th>Boss Pokémon</th><th>Your active</th><th>Boss action</th><th>Result</th><th>Order</th></tr>${body}</table></div><p class="hint">“Your active” and HP are as of the start of that turn, which is what the boss AI was looking at when it chose.</p></div>`;
}

const summary = P => {
  const lost = s => P.faints.filter(f => f.s === s).map(f => `${esc(f.mon)} <span class="pc">T${f.turn}</span>`).join(', ') || 'none';
  return `<div class="lv-sum"><span class="chip"><b>${P.nTurns}</b> turns</span><span class="chip">${P.winner ? '🏆 <b>' + esc(P.winner) + '</b> wins' : 'Unfinished'}</span><span class="chip">🟦 lost: ${lost(0)}</span><span class="chip">🟥 lost: ${lost(1)}</span></div>`;
};

// Compact card with the most recent turn that has events. Shown next to the move buttons in Play mode.
export function lastTurnHtml(raw) {
  const P = parseLog(raw), T = [...P.turns].reverse().find(t => t.ev.length);
  if (!T) return '';
  const body = T.ev.map(e => evHtml(e, LP.details)).join('');
  return `<div class="card lt"><h2>${T.n ? 'Turn ' + T.n : 'Battle start'} — what happened</h2><div class="evs">${body}</div></div>`;
}

// el: container. raw: array of sim log lines. o.stick: scroll to newest turn (live battle). o.newest: list newest turn first.
export function mountLog(el, raw, o = {}) {
  const P = parseLog(raw);
  const draw = () => {
    el.innerHTML = `<div class="lv"><div class="lv-bar"><div class="seg"><button data-v="turns" class="${LP.view === 'turns' ? 'on' : ''}">Turn by turn</button><button data-v="boss" class="${LP.view === 'boss' ? 'on' : ''}">Boss decisions</button></div>
      <label class="switch" title="Ability announcements, item reveals, etc."><input type="checkbox" data-d ${LP.details ? 'checked' : ''}> Details</label><span class="sp"></span>
      ${LP.view === 'turns' ? `<button class="ghost" data-f>${LP.fold ? 'Expand all' : 'Collapse older'}</button>` : ''}<button class="ghost" data-c>Copy text</button></div>
      ${summary(P)}<div class="lv-body">${LP.view === 'boss' ? bossView(P) : turnsView(P, o.newest)}</div></div>`;
    el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { LP.view = b.dataset.v; saveLP(); draw(); });
    el.querySelector('[data-d]').onchange = e => { LP.details = e.target.checked; saveLP(); draw(); };
    const f = el.querySelector('[data-f]'); if (f) f.onclick = () => { LP.fold = !LP.fold; saveLP(); draw(); };
    const c = el.querySelector('[data-c]');
    c.onclick = async () => { try { await navigator.clipboard.writeText(logText(P)); c.textContent = 'Copied'; } catch (e) { c.textContent = 'Copy failed'; } setTimeout(() => { c.textContent = 'Copy text'; }, 1200); };
    const b = el.querySelector('.lv-body'); if (o.stick && LP.view === 'turns') b.scrollTop = o.newest ? 0 : b.scrollHeight;
  };
  draw();
  return P;
}
