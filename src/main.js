import {parseTeam, checkTeam, batch, live, BOSSES, importBosses, bossFrom, moveType, speciesTypes, itemName} from './engine.js';
import {mountLog, lastTurnHtml, TC} from './logview.js';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const SAMPLE = `Mewtwo @ Life Orb
Ability: Pressure
EVs: 252 SpA / 252 Spe / 4 HP
Timid Nature
- Psystrike
- Aura Sphere
- Ice Beam
- Fire Blast

Groudon @ Leftovers
Ability: Drought
EVs: 252 HP / 252 Atk / 4 Def
Adamant Nature
- Earthquake
- Stone Edge
- Dragon Tail
- Fire Punch

Kyurem @ Life Orb
Ability: Pressure
EVs: 252 SpA / 252 Spe / 4 HP
Timid Nature
- Ice Beam
- Earth Power
- Draco Meteor
- Focus Blast

Xerneas @ Life Orb
Ability: Fairy Aura
EVs: 252 SpA / 252 Spe / 4 HP
Modest Nature
- Moonblast
- Focus Blast
- Thunder
- Grass Knot

Zekrom @ Choice Band
Ability: Teravolt
EVs: 252 Atk / 252 Spe / 4 HP
Jolly Nature
- Bolt Strike
- Outrage
- Wild Charge
- Close Combat

Giratina @ Leftovers
Ability: Pressure
EVs: 252 HP / 252 Atk / 4 Def
Adamant Nature
- Shadow Claw
- Dragon Claw
- Earthquake
- Aura Sphere`;
const store = {get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }};

// ---- Types ----
const X = (se, nve, imm) => [se.split(' '), nve.split(' '), imm.split(' ')]; // [super effective, resisted, immune]
const CH = {
  Normal: X('', 'Rock Steel', 'Ghost'), Fire: X('Grass Ice Bug Steel', 'Fire Water Rock Dragon', ''), Water: X('Fire Ground Rock', 'Water Grass Dragon', ''),
  Electric: X('Water Flying', 'Electric Grass Dragon', 'Ground'), Grass: X('Water Ground Rock', 'Fire Grass Poison Flying Bug Dragon Steel', ''),
  Ice: X('Grass Ground Flying Dragon', 'Fire Water Ice Steel', ''), Fighting: X('Normal Ice Rock Dark Steel', 'Poison Flying Psychic Bug Fairy', 'Ghost'),
  Poison: X('Grass Fairy', 'Poison Ground Rock Ghost', 'Steel'), Ground: X('Fire Electric Poison Rock Steel', 'Grass Bug', 'Flying'),
  Flying: X('Grass Fighting Bug', 'Electric Rock Steel', ''), Psychic: X('Fighting Poison', 'Psychic Steel', 'Dark'),
  Bug: X('Grass Psychic Dark', 'Fire Fighting Poison Flying Ghost Steel Fairy', ''), Rock: X('Fire Ice Flying Bug', 'Fighting Ground Steel', ''),
  Ghost: X('Psychic Ghost', 'Dark', 'Normal'), Dragon: X('Dragon', 'Steel', 'Fairy'), Dark: X('Psychic Ghost', 'Fighting Dark Fairy', ''),
  Steel: X('Ice Rock Fairy', 'Fire Water Electric Steel', ''), Fairy: X('Fighting Dragon Dark', 'Fire Poison Steel', ''),
};
const eff = (mt, def) => { const c = CH[mt]; return c ? def.reduce((m, t) => m * (c[2].includes(t) ? 0 : c[0].includes(t) ? 2 : c[1].includes(t) ? .5 : 1), 1) : 1; };
const EFL = {0: ['0×', 'imm'], .25: ['¼×', 'nve'], .5: ['½×', 'nve'], 2: ['2×', 'se'], 4: ['4×', 'se']};
const badge = t => `<span class="ty" style="background:${TC[t] || '#888'}">${esc(t)}</span>`;
const badges = ts => ts.map(badge).join('');

// ---- Init ----
$('team').value = store.get('team') || SAMPLE;
$('gen').value = store.get('gen') || '6';
$('runs').value = store.get('runs') || '300';
$('runs').onchange = () => store.set('runs', $('runs').value);

// Theme: auto -> light -> dark
const THEMES = ['auto', 'light', 'dark'], TL = {auto: '◐ Auto', light: '☀ Light', dark: '☾ Dark'};
let theme = store.get('theme') || 'auto';
const applyTheme = () => { if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; $('theme').textContent = TL[theme]; };
$('theme').onclick = () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; store.set('theme', theme); applyTheme(); };
applyTheme();

const pane = which => { document.body.classList.toggle('playing', which === 'live'); $('empty').hidden = which !== 'empty'; $('out').hidden = which !== 'out'; $('live').hidden = which !== 'live'; };
const toResults = () => { if (matchMedia('(max-width:899px)').matches) $('res').scrollIntoView({behavior: 'smooth', block: 'start'}); };

// ---- Log rendering ----
const logHtml = txt => `<div class="log">${txt.split('\n').map(l => {
  const c = l.startsWith('—') ? 't' : l.startsWith('☠') ? 'f' : l.startsWith('🏆') ? 'w' : /super effective/.test(l) ? 'se' : /Resisted|immune|Missed/.test(l) ? 'nv' : /^\s/.test(l) ? 's' : 'm';
  return `<div class="l ${c}">${esc(l.trim())}</div>`;
}).join('')}</div>`;

// ---- Boss + team previews ----
const metaChips = () => {
  const n = (BOSSES[$('bossSel').value] || []).length;
  $('meta').innerHTML = ['<b>Hard</b> mode', 'Level <b>100</b>', '<b>31</b> IV / <b>400</b> EV', 'Hardy nature', n ? `<b>${n}</b> boss Pokémon` : '', 'Boss AI v1 <span title="Not yet matched to PRO">(unmatched)</span>'].filter(Boolean).map(t => `<span class="chip">${t}</span>`).join('');
};
function lineup() {
  const b = BOSSES[$('bossSel').value] || [];
  $('lineup').innerHTML = b.map((m, i) => `<div class="bm"><div class="bh"><span class="n">${i + 1}</span><b>${esc(m.species)}</b>${badges(speciesTypes(m.species))}</div>
    <div class="bs">${esc(m.ability)} · ${esc(m.item || 'no item')}</div>
    <div>${m.moves.map(mv => `<span class="mc" style="--tc:${TC[moveType(mv)] || 'var(--line)'}">${esc(mv)}</span>`).join('')}</div>
    ${m.moves.length > 4 ? `<div class="note">Picks 4 of ${m.moves.length} moves at random</div>` : ''}</div>`).join('');
  metaChips();
}
let tvTimer;
function teamPreview() {
  let sets = [], errs = [];
  try { sets = parseTeam($('team').value); errs = sets.length ? checkTeam(sets) : ['No Pokémon found. Paste a Showdown-format team.']; } catch (e) { errs = ['Could not parse team: ' + e.message]; }
  $('tv').innerHTML = `<div class="tv">${sets.map(s => `<span class="p"><b>${esc(s.species || s.name)}</b> ${badges(speciesTypes(s.species || s.name))}${s.item ? ` <small>${esc(s.item)}</small>` : ''}</span>`).join('')}</div>` +
    (errs.length ? `<div class="verr">${errs.map(esc).join('<br>')}</div>` : `<div class="vok">✓ ${sets.length} Pokémon, team is valid</div>`);
}
$('team').oninput = () => { clearTimeout(tvTimer); tvTimer = setTimeout(teamPreview, 250); };

// ---- Batch results ----
let last = null;
const pct = (a, n) => (100 * a / n).toFixed(0) + '%';
const barCell = (v, n, cls) => { const p = 100 * v / n; return `<td class="bc"><span class="bar ${cls}"><i style="width:${p.toFixed(0)}%"></i></span><b>${p.toFixed(0)}%</b></td>`; };
const rows = (obj, n, cols, cls) => Object.entries(obj).sort((a, b) => b[1].fainted - a[1].fainted)
  .map(([k, v]) => `<tr><td>${esc(k)}</td>${cols.map(c => barCell(v[c], n, cls)).join('')}</tr>`).join('') || '<tr><td class="muted">None</td></tr>';

function render(R) {
  last = R;
  const wr = R.wins / R.n, k = Object.entries(R.killers).sort((a, b) => b[1] - a[1]).slice(0, 8), tot = Object.values(R.killers).reduce((a, b) => a + b, 0) || 1;
  const cls = wr >= .8 ? 'good' : wr >= .5 ? 'warn' : 'bad';
  $('out').innerHTML = `
  <div class="card"><div class="hero"><div class="big ${cls}">${pct(R.wins, R.n)}<br><small>win rate · ${R.wins}/${R.n}</small></div>
    <div class="muted">vs <b>${esc($('bossSel').value)}</b> (Hard)<br>Gen ${$('gen').value} mechanics</div></div>
    <div class="tiles"><div class="tile"><b>${(R.turns / R.n).toFixed(1)}</b><span>avg turns</span></div>
    <div class="tile"><b>${R.wins ? (R.alive / R.wins).toFixed(1) : '—'}</b><span>of yours alive on wins</span></div>
    <div class="tile"><b>${R.n - R.wins}</b><span>losses</span></div></div></div>
  <div class="card"><h2>Your team</h2><div class="sc"><table><tr><th></th><th>KO'd</th><th>KO'd first</th></tr>${rows(R.you, R.n, ['fainted', 'first'], '')}</table></div></div>
  <div class="card"><h2>Boss Pokémon (KO'd per battle)</h2><div class="sc"><table><tr><th></th><th>KO'd</th></tr>${rows(R.boss, R.n, ['fainted'], 'g')}</table></div></div>
  <div class="card"><h2>Biggest threats (share of your KOs)</h2><div class="sc"><table>${k.map(([m, c]) => `<tr><td>${esc(m)}</td>${barCell(c, tot, 'n')}</tr>`).join('') || '<tr><td class="muted">No KOs</td></tr>'}</table></div></div>
  <div class="card"><h2>Sample battles</h2><div class="row"><button class="alt" id="w">Show a win</button><button class="alt" id="l">Show a loss</button></div><div id="log" class="result"></div></div>`;
  const show = lg => { if (lg) mountLog($('log'), lg); else $('log').innerHTML = '<p class="muted">No such battle in this run.</p>'; };
  $('w').onclick = () => show(last.winLog); $('l').onclick = () => show(last.lossLog);
}

$('run').onclick = () => {
  const sets = parseTeam($('team').value), errs = checkTeam(sets);
  store.set('team', $('team').value); store.set('gen', $('gen').value); store.set('runs', $('runs').value);
  pane('out'); toResults();
  if (!sets.length || errs.length) { $('out').innerHTML = `<div class="err">${(errs.length ? errs : ['No Pokémon found in your team.']).map(esc).join('<br>')}</div>`; return; }
  const n = +$('runs').value, o = {gen: +$('gen').value, boss: BOSSES[$('bossSel').value]}, step = 20;
  let R, done = 0;
  $('run').disabled = $('play').disabled = true;
  const fin = () => { $('run').disabled = $('play').disabled = false; };
  $('out').innerHTML = `<div class="card"><div class="muted">Simulating… 0/${n}</div><div class="prog"><i style="width:0%"></i></div></div>`;
  (function tick() {
    try { R = batch(sets, Math.min(step, n - done), o, R); } catch (e) { $('out').innerHTML = `<div class="err">Sim error: ${esc(e.message)}</div>`; fin(); return; }
    done += step;
    if (done < n) {
      $('out').innerHTML = `<div class="card"><div class="muted">Simulating… ${done}/${n}</div><div class="prog"><i style="width:${(100 * done / n).toFixed(0)}%"></i></div></div>`;
      setTimeout(tick, 0);
    } else { fin(); render(R); }
  })();
};

// ---- Boss data ----
const pre = window.__BOSSES__;
if (pre) for (const k in pre.bosses) BOSSES[k] = bossFrom(pre.bosses[k]);
try { const sv = JSON.parse(store.get('bossdata') || '{}'); for (const k in sv) BOSSES[k] = bossFrom(sv[k]); } catch (e) {}
const showBoss = () => { store.set('boss', $('bossSel').value); lineup(); };
function fillBoss() {
  const cur = store.get('boss') || 'Ash Westbrook';
  $('bossSel').innerHTML = Object.keys(BOSSES).sort().map(n => `<option>${esc(n)}</option>`).join('');
  $('bossSel').value = BOSSES[cur] ? cur : 'Ash Westbrook'; showBoss();
}
$('bossSel').onchange = showBoss;
$('bf').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  const rep = $('rep'), sm = rep.querySelector('summary'), pre = rep.querySelector('pre');
  rep.hidden = false; rep.open = true;
  try {
    const r = importBosses(JSON.parse(await f.text()));
    for (const k in r.bosses) BOSSES[k] = bossFrom(r.bosses[k]);
    store.set('bossdata', JSON.stringify(r.bosses)); fillBoss();
    sm.textContent = `Imported ${Object.keys(r.bosses).length} bosses · ${r.report.length} notes`;
    pre.innerHTML = logHtml(r.report.join('\n') || 'No problems.');
  } catch (err) { sm.textContent = 'Import failed'; pre.textContent = String(err.message); }
};
fillBoss(); teamPreview();
if (pre && Object.keys(pre.bosses).length) {
  $('rep').hidden = false; $('rep').querySelector('summary').textContent = `${Object.keys(pre.bosses).length} bosses built in · ${pre.report.length} notes`;
  $('rep').querySelector('pre').textContent = pre.report.join('\n') || 'No problems.';
}

// ---- Live battle ----
let G = null, msg = '', mega = false;
const hpCol = f => f > .5 ? 'var(--good)' : f > .2 ? 'var(--warn)' : 'var(--bad)';
const bar = p => { const f = p.hp / p.maxhp; return `<div class="hp"><i style="width:${(f * 100).toFixed(1)}%;background:${hpCol(f)}"></i></div>`; };
const party = t => `<div class="party">${t.map(p => { const f = p.maxhp ? p.hp / p.maxhp : 0; return `<span class="pm${p.fainted ? ' x' : ''}${p.active ? ' on' : ''}" style="--f:${(f * 100).toFixed(0)}%;--c:${hpCol(f)}" title="${esc(p.name)} ${p.hp}/${p.maxhp}">${esc(p.name)}</span>`; }).join('')}</div>`;
const panel = (p, side, team) => `<div class="mon ${side}"><div class="mh"><span class="side">${side === 'foe' ? 'BOSS' : 'YOU'}</span><b>${esc(p.name)}</b>${badges(p.types.split('/'))}${p.status ? `<span class="st st-${esc(p.status)}">${esc(p.status.toUpperCase())}</span>` : ''}</div>
  ${bar(p)}<div class="mf"><span>${p.hp}/${p.maxhp} (${Math.ceil(100 * p.hp / p.maxhp)}%)</span>${p.item ? `<span>· ${esc(itemName(p.item))}</span>` : ''}${p.boosts ? p.boosts.split(' ').map(b => `<span class="bst ${b.includes('-') ? 'dn' : 'up'}">${esc(b)}</span>`).join('') : ''}</div>${party(team)}</div>`;

function draw() {
  const s = G.state(), foeTypes = s.boss.active.types.split('/');
  let h = `<div class="card"><div class="field"><span class="chip">Turn <b>${s.turn}</b></span>${s.weather ? `<span class="chip">Weather: <b>${esc(s.weather)}</b></span>` : ''}<label class="switch" style="margin-left:auto" title="Pick the boss's moves yourself instead of the AI"><input type="checkbox" id="mb" ${s.manualBoss ? 'checked' : ''}> Manual boss</label><span style="display:flex;gap:6px;margin-left:8px"><button class="ghost" id="undo" title="Undo last action (Ctrl+Z)" ${s.canUndo ? '' : 'disabled'}>↶ Undo</button><button class="ghost" id="redo" title="Redo (Ctrl+Y)" ${s.canRedo ? '' : 'disabled'}>Redo ↷</button></span></div>` + panel(s.boss.active, 'foe', s.boss.team) + panel(s.you.active, 'you', s.you.team) + '</div>' + lastTurnHtml(s.log);
  if (msg) h += `<div class="err">${esc(msg)}</div>`;
  if (s.ended) h += `<div class="card"><div class="big ${s.winner === 'You' ? 'good' : 'bad'}">${s.winner === 'You' ? 'You win!' : 'Boss wins'}<br><small>after ${s.turn} turns</small></div></div>`;
  else if (s.needBoss) {
    const mt = s.you.active.types.split('/');
    h += `<div class="card"><h2>Boss's turn — ${s.bossForceSwitch ? 'choose its next Pokémon' : 'choose its move'} <span style="font-weight:400;text-transform:none;letter-spacing:0">· ${esc(s.boss.active.name)}${s.bossForceSwitch ? '' : ' · keys 1-4 · type-only effectiveness vs ' + esc(s.you.active.name)}</span></h2>`;
    if (!s.bossForceSwitch) h += `<div class="grid">${s.bossMoves.map((m, i) => {
      const dmg = m.cat !== 'Status', e = dmg ? EFL[eff(m.type, mt)] : null;
      return `<button class="mv" style="--tc:${TC[m.type] || 'var(--acc)'}" data-k="${i + 1}" data-bc="move ${i + 1}" ${m.disabled ? 'disabled' : ''}><span><kbd>${i + 1}</kbd>${esc(m.name)}</span><small>${esc(m.type)} · ${esc(m.cat)}${dmg && m.bp ? ' · ' + m.bp + ' BP' : ''} · PP ${m.pp}/${m.maxpp}</small>${e ? `<span class="ef ${e[1]}">${e[0]}</span>` : ''}</button>`;
    }).join('')}</div>`;
    h += `<h3>${s.bossForceSwitch ? 'Choose next Pokémon' : 'Switch'}</h3><div class="grid">${s.bossBench.map(p => `<button class="alt" data-bc="switch ${p.idx}" ${s.bossTrapped && !s.bossForceSwitch ? 'disabled' : ''}>${esc(p.name)}<small>${p.hp}/${p.maxhp}</small></button>`).join('') || '<span class="muted">No one left</span>'}</div></div>`;
  }
  else {
    h += '<div class="card">';
    if (s.manualBoss && s.bossPick) h += `<div class="field" style="margin-bottom:8px"><span class="chip">Boss will: <b>${esc(s.bossPick)}</b></span><button class="ghost" id="bchg">Change</button></div>`;
    else if (s.manualBoss && s.youChosen) h += '<div class="muted" style="margin-bottom:8px">Waiting for the boss\'s choice…</div>';
    if (!s.forceSwitch && s.canMega) h += `<label class="switch" style="margin-bottom:8px"><input type="checkbox" id="mg" ${mega ? 'checked' : ''}> ✨ Mega Evolve this turn</label>`;
    if (!s.forceSwitch) h += `<h2>Moves <span style="font-weight:400;text-transform:none;letter-spacing:0">· keys 1-4 · effectiveness is type-only, abilities not counted</span></h2><div class="grid">${s.moves.map((m, i) => {
      const dmg = m.cat !== 'Status', e = dmg ? EFL[eff(m.type, foeTypes)] : null;
      return `<button class="mv" style="--tc:${TC[m.type] || 'var(--acc)'}" data-k="${i + 1}" data-c="move ${i + 1}" ${m.disabled ? 'disabled' : ''}><span><kbd>${i + 1}</kbd>${esc(m.name)}</span><small>${esc(m.type)} · ${esc(m.cat)}${dmg && m.bp ? ' · ' + m.bp + ' BP' : ''} · PP ${m.pp}/${m.maxpp}</small>${e ? `<span class="ef ${e[1]}">${e[0]}</span>` : ''}</button>`;
    }).join('')}</div>`;
    h += `<h3>${s.forceSwitch ? 'Choose next Pokémon' : 'Switch'}</h3><div class="grid">${s.bench.map(p => `<button class="alt" data-c="switch ${p.idx}" ${s.trapped && !s.forceSwitch ? 'disabled' : ''}>${esc(p.name)}<small>${p.hp}/${p.maxhp}</small></button>`).join('') || '<span class="muted">No one left</span>'}</div>`;
    h += '</div>';
  }
  $('live').innerHTML = `<div class="lv2"><div class="lv-main">${h}</div><div class="lv-side"><div class="card"><h2>Battle log</h2><div id="blog"></div><div class="row"><button class="alt" id="nb">New battle</button></div></div></div></div>`;
  const mg = $('mg'); if (mg) mg.onchange = () => { mega = mg.checked; };
  $('live').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const c = b.dataset.c; msg = G.choose(c + (mega && c.startsWith('move') ? ' mega' : '')) ? '' : 'Invalid choice.'; mega = false; draw(); });
      $('nb').onclick = start;
  $('live').querySelectorAll('[data-bc]').forEach(b => b.onclick = () => { msg = G.chooseBoss(b.dataset.bc) ? '' : 'Invalid boss choice.'; draw(); });
  const bc = $('bchg'); if (bc) bc.onclick = () => { G.clearBoss(); draw(); };
  const mb = $('mb'); if (mb) mb.onchange = () => { G.setManual(mb.checked); msg = ''; draw(); };
  $('undo').onclick = () => doUndo(); $('redo').onclick = () => doRedo();
  mountLog($('blog'), s.log, {stick: true, newest: true});
  const lt = $('live').querySelector('.lv-main .lt'); if (lt && lt.scrollIntoView) lt.scrollIntoView({block: 'nearest'});
}
const hist = fn => { if (!G || !fn.call(G)) return; msg = ''; mega = false; draw(); };
const doUndo = () => hist(G && G.undo), doRedo = () => hist(G && G.redo);
document.addEventListener('keydown', e => {
  if (!$('live').hidden && (e.ctrlKey || e.metaKey) && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); return; }
  }
  if ($('live').hidden || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const b = $('live').querySelector(`.mv[data-k="${e.key}"]`); if (b && !b.disabled) b.click();
});
function start() {
  const sets = parseTeam($('team').value), errs = checkTeam(sets);
  store.set('team', $('team').value); store.set('gen', $('gen').value);
  pane('live'); toResults(); msg = ''; mega = false;
  if (!sets.length || errs.length) { $('live').innerHTML = `<div class="err">${(errs.length ? errs : ['No Pokémon found in your team.']).map(esc).join('<br>')}</div>`; return; }
  try { G = live(sets, {gen: +$('gen').value, boss: BOSSES[$('bossSel').value], manualBoss: $('manualBoss').checked}); draw(); } catch (e) { $('live').innerHTML = `<div class="err">Sim error: ${esc(e.message)}</div>`; }
}
$('play').onclick = start;
