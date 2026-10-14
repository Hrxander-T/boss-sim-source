import {Battle, Teams, Dex} from '@pkmn/sim';

// PRO Hard bosses run 400 EVs per stat; the sim clamps EVs at 255 (per-battle instance fn), so lift it.
const liftEvCap = b => { const c = b.clampIntRange; b.clampIntRange = (n, lo, hi) => c(n, lo, lo === 0 && hi === 255 ? 510 : hi); };
// Keep the omniscient half of each |split| pair (exact HP), drop the public duplicate.
const clean = log => { const o = []; for (let i = 0; i < log.length; i++) { if (log[i].startsWith('|split|')) { o.push(log[++i]); i++; } else o.push(log[i]); } return o; };

const ST = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const fill = v => Object.fromEntries(ST.map(s => [s, v]));
const B = (species, ability, item, moves, nature = 'Hardy') =>
  ({name: species, species, ability, item, moves, nature, level: 100, evs: fill(400), ivs: fill(31)});

// Source: wiki.pokemonrevolution.net/Ash_Westbrook_(boss), Hard lineup.
export const BOSSES = {
  'Ash Westbrook': [
    B('Dialga', 'Pressure', 'Leftovers', ['Draco Meteor', 'Roar', 'Fire Blast', 'Flash Cannon']),
    B('Reshiram', 'Turboblaze', 'Life Orb', ['Draco Meteor', 'Roar', 'Blue Flare', 'Stone Edge']),
    B('Arceus', 'Multitype', 'Life Orb', ['Extreme Speed', 'Shadow Claw', 'Earthquake', 'Stone Edge']),
    B('Infernape', 'Blaze', 'Expert Belt', ['Close Combat', 'Fire Blast', 'Grass Knot', 'Thunder Punch']),
    B('Kyogre', 'Drizzle', 'Choice Specs', ['Surf', 'Earthquake', 'Thunder', 'Ice Beam']),
    B('Lugia', 'Multiscale', 'Leftovers', ['Dragon Pulse', 'Psyshock', 'Ice Beam', 'Aeroblast']),
  ],
};

// AI profiles: tweak these to match observed PRO behaviour.
export const PROFILES = {
  boss: {replacement: 'order', switchOnImmune: true, status: true, roarBoosts: 2, roarAlways: true, tiered: true, statusChance: 0.25},
  user: {replacement: 'best', switchOnImmune: true, status: true, roarBoosts: 2},
};

export const BANNED = ['zacian', 'zacianc', 'zamazenta', 'zamazentacrowned', 'smeargle'];
export function checkTeam(sets) {
  const errs = [], seen = new Set();
  if (!sets.length) errs.push('No Pokémon found in the paste.');
  if (sets.length > 6) errs.push('Max 6 Pokémon.');
  for (const s of sets) {
    const id = (s.species || s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const base = id.replace(/(mega|megax|megay|origin|therian|black|white|crowned|primal|alola|galar)$/, '');
    if (seen.has(base)) errs.push(`Species clause: duplicate ${s.species || s.name}.`);
    seen.add(base);
    if (BANNED.some(b => id.startsWith(b))) errs.push(`${s.species || s.name} is banned in boss fights.`);
    if ((s.moves || []).some(m => /^entrainment$/i.test(m))) errs.push(`${s.species || s.name} has Entrainment (banned).`);
  }
  return errs;
}
export const parseTeam = text => Teams.import(text) || [];

function dmg(b, a, d, moveId) {
  try {
    const m = b.dex.moves.get(moveId);
    if (m.category === 'Status') return 0;
    const v = b.actions.getDamage(a, d, moveId, true);
    if (!v) return 0;
    let acc = m.accuracy === true ? 100 : m.accuracy;
    if (m.id === 'thunder' && b.field.isWeather('raindance')) acc = 100;
    return (Math.min(v, d.hp) + (v >= d.hp ? d.maxhp : 0)) * acc / 100 + Math.random() * 0.01;
  } catch (e) { return 0; }
}
const bestOf = (b, a, d) => Math.max(0, ...a.moves.map(m => dmg(b, a, d, m)));

const boostSum = (p, pos) => Object.values(p.boosts).reduce((a, x) => a + (pos ? Math.max(0, x) : x), 0);
// Rough "damage-equivalent" value of a status move, so it can compete with attacks.
function statusScore(b, i, me, fo, id, prof) {
  try {
    const d = b.dex.moves.get(id), hpf = me.hp / me.maxhp, acc = (d.accuracy === true ? 100 : d.accuracy) / 100;
    const foeSide = b.sides[1 - i], bench = foeSide.pokemon.filter(p => !p.fainted && !p.isActive).length;
    if (d.id === 'roar' || d.id === 'whirlwind') return bench && (prof.roarAlways || boostSum(fo, true) >= prof.roarBoosts) ? fo.maxhp * 0.9 : 0;
    if (d.heal) return hpf < 0.5 ? me.maxhp * (d.heal[0] / d.heal[1]) * 1.2 : 0;
    if (d.status) {
      if (fo.status || !fo.runStatusImmunity(d.status === 'tox' ? 'psn' : d.status) || !fo.runImmunity(d.type)) return 0;
      return fo.maxhp * (d.status === 'slp' ? 0.5 : 0.4) * acc;
    }
    if (['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'].includes(d.id)) return foeSide.sideConditions[d.id] && d.id !== 'spikes' ? 0 : bench ? fo.maxhp * 0.3 : 0;
    if (d.boosts && d.target === 'self') {
      const up = Object.values(d.boosts).some(v => v > 0);
      return up && hpf > 0.6 && boostSum(me) < 2 ? fo.maxhp * 0.5 : 0;
    }
  } catch (e) {}
  return 0;
}
const score = (b, i, me, fo, id, prof) => {
  const cat = b.dex.moves.get(id).category;
  return cat !== 'Status' ? dmg(b, me, fo, id) : prof.status ? statusScore(b, i, me, fo, id, prof) + Math.random() * 0.01 : 0;
};

function decide(b, i, prof) {
  const side = b.sides[i], me = side.active[0];
  let fo = b.sides[1 - i].active[0];
  if (fo && fo.fainted) fo = null;
  const bench = side.pokemon.map((p, k) => [p, k + 1]).filter(([p]) => !p.isActive && !p.fainted);
  const pick = () => {
    if (!fo || prof.replacement === 'order') return bench[0][1];
    return bench.map(([p, k]) => [bestOf(b, p, fo) / fo.hp, k]).sort((x, y) => y[0] - x[0])[0][1];
  };
  const req = side.activeRequest;
  if (req.forceSwitch) return 'switch ' + pick();
  const act = req.active[0];
  const sc = act.moves.map((m, k) => [m.disabled ? -1 : (fo ? score(b, i, me, fo, m.id, prof) : 1), k + 1]).sort((x, y) => y[0] - x[0]);
  if (prof.tiered && fo) {
    // Boss logic: 1) best super-effective move, 2) else best neutral damage (sometimes a status move like Roar), 3) else status / least-bad damage.
    const eff = id => { const d = b.dex.moves.get(id); return d.category === 'Status' ? null : b.dex.getImmunity(d.type, fo) ? b.dex.getEffectiveness(d.type, fo.getTypes()) : -9; };
    const all = act.moves.map((m, k) => ({k: k + 1, off: m.disabled, e: eff(m.id), s: sc.find(x => x[1] === k + 1)[0]})).filter(x => !x.off && x.s > 0);
    const best = a => a.sort((x, y) => y.s - x.s)[0].k;
    const dm = all.filter(x => x.e !== null), se = dm.filter(x => x.e > 0), ne = dm.filter(x => x.e >= 0), st = all.filter(x => x.e === null);
    if (se.length) return 'move ' + best(se);
    if (st.length && (!ne.length || Math.random() < prof.statusChance)) return 'move ' + best(st);
    if (dm.length) return 'move ' + best(ne.length ? ne : dm);
  }
  if (sc[0][0] <= 0 && bench.length && !act.trapped && prof.switchOnImmune && fo) return 'switch ' + pick();
  return 'move ' + sc[0][1] + (act.canMegaEvo ? ' mega' : '');
}

const pick4 = a => a.length > 4 ? [...a].sort(() => Math.random() - 0.5).slice(0, 4) : a;

function mk(userSets, o = {}) {
  const gen = o.gen || 6;
  const boss = (o.boss || BOSSES['Ash Westbrook']).map(s => ({...s, nature: o.bossNature || s.nature, evs: {...s.evs}, ivs: {...s.ivs}, moves: pick4(s.moves)}));
  const b = new Battle({formatid: `gen${gen}customgame@@@!Team Preview`});
  liftEvCap(b);
  b.setPlayer('p1', {name: 'You', team: userSets.map(s => ({...s, evs: {...(s.evs || {})}, ivs: {...(s.ivs || {})}, moves: [...s.moves], level: s.level || 100}))});
  b.setPlayer('p2', {name: 'Boss', team: boss});
  const profs = [o.userProfile || PROFILES.user, o.bossProfile || PROFILES.boss];
  return {b, profs};
}

export function simulate(userSets, o = {}) {
  const {b, profs} = mk(userSets, o);
  for (let g = 0; !b.ended && g < 400; g++) {
    for (let i = 0; i < 2; i++) {
      const s = b.sides[i], r = s.activeRequest;
      if (!r || r.wait) continue;
      if (!s.choose(decide(b, i, profs[i]))) { s.clearChoice(); s.autoChoose(); }
    }
    b.commitChoices();
  }
  const log = clean(b.log), faints = [];
  let lastMove = {0: '', 1: ''};
  for (const l of log) {
    const p = l.split('|');
    if (p[1] === 'move') lastMove[p[2][1] === '1' ? 0 : 1] = p[2].slice(5) + ': ' + p[3];
    if (p[1] === 'faint') { const sd = p[2][1] === '1' ? 0 : 1; faints.push({side: sd, name: p[2].slice(5), by: lastMove[1 - sd]}); }
  }
  return {win: b.winner === 'You', ended: b.ended, turns: b.turn, faints, alive: b.sides[0].pokemon.filter(p => !p.fainted).length, log};
}

export function fmtLog(log) {
  const out = [];
  for (const l of log) {
    const p = l.split('|'), who = p[2] ? (p[2][1] === '1' ? '🟦 ' : '🟥 ') + p[2].slice(5) : '';
    if (p[1] === 'turn') out.push(`— Turn ${p[2]} —`);
    else if (p[1] === 'switch' || p[1] === 'drag') out.push(`${who} enters`);
    else if (p[1] === 'move') out.push(`${who} used ${p[3]}`);
    else if (p[1] === '-damage') out.push(`   ${who} → ${p[3]}`);
    else if (p[1] === 'faint') out.push(`☠ ${who} fainted`);
    else if (p[1] === '-weather') out.push(`   weather: ${p[2]}`);
    else if (p[1] === '-supereffective') out.push('   It\'s super effective!');
    else if (p[1] === '-resisted') out.push('   Resisted');
    else if (p[1] === '-immune') out.push(`   ${who} is immune`);
    else if (p[1] === '-miss') out.push('   Missed!');
    else if (p[1] === '-crit') out.push('   Critical hit!');
    else if (p[1] === '-status') out.push(`   ${who} → ${p[3]}`);
    else if (p[1] === '-boost' || p[1] === '-unboost') out.push(`   ${who} ${p[3]} ${p[1] === '-boost' ? '+' : '-'}${p[4]}`);
    else if (p[1] === '-heal') out.push(`   ${who} → ${p[3]}`);
    else if (p[1] === 'message') out.push(`🎒 ${p[2]}`);
    else if (p[1] === '-mega') out.push(`✨ ${who} Mega Evolved`);
    else if (p[1] === 'win') out.push(`🏆 ${p[2]} wins`);
  }
  return out.join('\n');
}

export function batch(userSets, n, o = {}, R) {
  R = R || {n: 0, wins: 0, turns: 0, alive: 0, you: {}, boss: {}, killers: {}, winLog: null, lossLog: null};
  R.n += n;
  const sp = (obj, k) => obj[k] || (obj[k] = {fainted: 0, first: 0});
  for (let i = 0; i < n; i++) {
    const r = simulate(userSets, o);
    R.turns += r.turns;
    if (r.win) { R.wins++; R.alive += r.alive; R.winLog = R.winLog || r.log; } else R.lossLog = R.lossLog || r.log;
    let firstDone = false;
    for (const f of r.faints) {
      if (f.side === 0) {
        sp(R.you, f.name).fainted++;
        if (!firstDone) { sp(R.you, f.name).first++; firstDone = true; }
        const k = f.by || 'other (recoil/status)';
        R.killers[k] = (R.killers[k] || 0) + 1;
      } else sp(R.boss, f.name).fainted++;
    }
  }
  return R;
}

const boosts = p => Object.entries(p.boosts).filter(([, v]) => v).map(([k, v]) => k + (v > 0 ? '+' : '') + v).join(' ');
const mon = p => p && {name: p.name, hp: p.hp, maxhp: p.maxhp, fainted: p.fainted, active: p.isActive, status: p.status, item: p.item, types: p.getTypes().join('/'), boosts: boosts(p)};

// Interactive battle: you choose for side 1, the boss AI chooses for side 2.
const ITEMS = {'hyper potion': {heal: 120}, 'max potion': {heal: 1e4}, 'full restore': {heal: 1e4, cure: 1}, 'revive': {rev: 0.5}, 'max revive': {rev: 1}, 'full heal': {cure: 1}};
export const parseBag = t => Object.fromEntries((t || '').split(',').map(x => x.trim().split(/\s*[:×]\s*|\s+x\s*(?=\d)/i)).filter(a => ITEMS[(a[0] || '').trim().toLowerCase()]).map(a => [a[0].trim().toLowerCase(), +a[1] || 1]));

export function live(userSets, o = {}) {
  const m0 = mk(userSets, o), profs = m0.profs, bag = o.items ? {...o.items} : null;
  let b = m0.b, you = b.sides[0], foe = b.sides[1];
  // Undo/redo: full battle snapshots (the sim's own serializer, RNG state included) plus the bag.
  const take = () => ({json: JSON.stringify(b.toJSON()), bag: bag && {...bag}});
  const hist = []; let pos = -1;
  const push = () => { hist.length = pos + 1; hist.push(take()); if (hist.length > 300) hist.shift(); pos = hist.length - 1; };
  const restore = sn => {
    b = Battle.fromJSON(sn.json); liftEvCap(b); you = b.sides[0]; foe = b.sides[1];
    if (bag) { for (const k of Object.keys(bag)) delete bag[k]; Object.assign(bag, sn.bag); }
  };
  const boss = () => {
    const r = foe.activeRequest;
    if (!r || r.wait || foe.isChoiceDone()) return;
    if (!foe.choose(decide(b, 1, profs[1]))) { foe.clearChoice(); foe.autoChoose(); }
  };
  const adv = () => {
    for (let g = 0; g < 50 && !b.ended; g++) {
      boss();
      const r = you.activeRequest;
      if (r && !r.wait) return;
      b.commitChoices();
    }
  };
  adv();
  push();
  return {
    undo() { if (pos <= 0) return false; restore(hist[--pos]); return true; },
    redo() { if (pos >= hist.length - 1) return false; restore(hist[++pos]); return true; },
    useItem(name, idx) {
      const r = you.activeRequest, it = ITEMS[name], p = you.pokemon[idx - 1];
      if (!bag || !it || !p) return 'Items are off.';
      if (b.ended || !r || r.wait || r.forceSwitch) return 'Items can only be used on your move turn.';
      if (!bag[name]) return 'None left.';
      if (it.rev ? !p.fainted : p.fainted) return it.rev ? 'Target has not fainted.' : 'Target has fainted.';
      if (!it.rev && !(it.heal && p.hp < p.maxhp) && !(it.cure && p.status)) return 'It would have no effect.';
      const nm = name.replace(/\b\w/g, c => c.toUpperCase());
      if (it.rev) { p.fainted = false; p.faintQueued = false; p.subFainted = false; p.status = ''; p.hp = 1; p.sethp(Math.max(1, Math.floor(p.maxhp * it.rev))); you.pokemonLeft++; }
      else { if (it.heal && p.hp < p.maxhp) p.sethp(Math.min(p.maxhp, p.hp + it.heal)); if (it.cure) p.cureStatus(true); }
      b.add('message', `You used ${nm} on ${p.name}`); b.add('-heal', p, p.getHealth, '[from] item: ' + nm);
      bag[name]--;
      const m = r.active[0].moves.findIndex(x => !x.disabled) + 1 || 1;
      if (!you.choose('move ' + m)) { you.clearChoice(); return 'Cannot act right now.'; }
      you.choice.actions = [{choice: 'pass'}];
      b.commitChoices(); adv(); push(); return '';
    },
    choose(c) {
      if (b.ended) return false;
      if (!you.choose(c)) { you.clearChoice(); return false; }
      b.commitChoices(); adv(); push(); return true;
    },
    state() {
      const r = you.activeRequest, a = r && r.active && r.active[0];
      return {
        ended: b.ended, winner: b.winner, turn: b.turn, weather: b.field.weather, log: clean(b.log), canUndo: pos > 0, canRedo: pos < hist.length - 1,
        you: {active: mon(you.active[0]), team: you.pokemon.map(mon)}, boss: {active: mon(foe.active[0]), team: foe.pokemon.map(mon)},
        forceSwitch: !!(r && r.forceSwitch), trapped: !!(a && a.trapped), canMega: !!(a && a.canMegaEvo), bag, team: you.pokemon.map((p, i) => ({idx: i + 1, name: p.name, hp: p.hp, maxhp: p.maxhp, fainted: p.fainted, status: p.status})),
        moves: (a ? a.moves : []).map(m => { const d = b.dex.moves.get(m.id); return {name: m.move, disabled: !!m.disabled, pp: m.pp, maxpp: m.maxpp, type: d.type, cat: d.category, bp: d.basePower}; }),
        bench: you.pokemon.map((p, i) => ({idx: i + 1, name: p.name, hp: p.hp, maxhp: p.maxhp, ok: !p.isActive && !p.fainted})).filter(x => x.ok),
      };
    },
  };
}

// ---- Boss import (scraped bosses.json) ----
export const bossFrom = arr => arr.map(([sp, ab, it, mv]) => B(sp, ab, it, mv));
const fixName = n => {
  n = n.replace(/^(Shiny|Christmas|Easter|Pink)\s+/, '');
  let m;
  if ((m = n.match(/^Mega (.+?)( [XY])?$/))) return `${m[1]}-Mega${m[2] ? '-' + m[2].trim() : ''}`;
  if ((m = n.match(/^Primal (.+)$/))) return `${m[1]}-Primal`;
  if ((m = n.match(/^Alolan (.+)$/))) return `${m[1]}-Alola`;
  if ((m = n.match(/^Galarian (.+)$/))) return `${m[1]}-Galar`;
  return n;
};
export function importBosses(json) {
  const bosses = {}, report = [];
  for (const b of json) {
    if (b.category !== 'Repeatable Bosses') continue;
    const key = ['Hard', 'Medium/Hard', 'Lineup'].find(k => b.teams && b.teams[k]);
    const skip = why => report.push(`SKIPPED ${b.name}: ${why}`);
    if (!key) { skip('no usable lineup'); continue; }
    const team = b.teams[key];
    if (team.length > 6) { skip(`${team.length} Pokémon (multi-trainer/double battle?)`); continue; }
    if (team.some(m => !m.moves.length)) { skip('missing move data'); continue; }
    const out = []; let ok = true;
    for (const m of team) {
      const sp = Dex.species.get(fixName(m.pokemon));
      if (!sp.exists) { skip(`unknown species "${m.pokemon}"`); ok = false; break; }
      let ab = m.ability && m.ability !== 'Random' ? m.ability : sp.abilities[0];
      if (!Dex.abilities.get(ab).exists) { report.push(`${b.name}: unknown ability "${ab}" on ${sp.name}, used ${sp.abilities[0]}`); ab = sp.abilities[0]; }
      let it = m.item === 'None' ? '' : m.item;
      if (it && !Dex.items.get(it).exists) { report.push(`${b.name}: unknown item "${it}" on ${sp.name}, removed`); it = ''; }
      const mv = m.moves.map(x => x.move).filter(x => Dex.moves.get(x).exists || (report.push(`${b.name}: unknown move "${x}" on ${sp.name}, removed`), false));
      out.push([sp.name, ab, it, mv]);
    }
    if (ok) { bosses[b.name] = out; if (key === 'Lineup') report.push(`${b.name}: only a single lineup exists (used as Hard)`); }
  }
  return {bosses, report};
}

// ---- UI helpers (lookups only, no battle logic) ----
export const moveType = n => { const m = Dex.moves.get(n); return m.exists ? m.type : null; };
export const speciesTypes = n => { const s = Dex.species.get(n); return s.exists ? [...s.types] : []; };
export const itemName = n => { const i = Dex.items.get(n); return i.exists ? i.name : n; };
