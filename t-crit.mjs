import {parseTeam, simulate, live} from './src/engine.js';
const t = parseTeam('Mewtwo @ Life Orb\nAbility: Pressure\nTimid Nature\nEVs: 252 HP / 252 Def\n- Psystrike\n- Recover\n\nGroudon @ Leftovers\nAbility: Drought\nEVs: 252 HP / 252 Def\n- Earthquake\n- Recover');
function stats(on) {
  let bossHits = 0, bossCrits = 0, userHits = 0, userCrits = 0, turns = 0;
  for (let n = 0; n < 40; n++) {
    const r = simulate(t, {bossCrit: on}); turns += r.turns; const L = r.log;
    for (let i = 0; i < L.length; i++) {
      const p = L[i].split('|'); if (p[1] !== 'move') continue;
      const side = p[2][1]; let dmg = false, crit = false;
      for (let j = i + 1; j < L.length && !/^\|(move|turn|switch|faint)\|/.test(L[j]); j++) {
        if (L[j].startsWith('|-damage|p' + (side === '1' ? '2' : '1')) && !L[j].includes('[from]')) dmg = true;
        if (L[j].startsWith('|-crit|')) crit = true;
      }
      if (dmg) { if (side === '2') { bossHits++; if (crit) bossCrits++; } else { userHits++; if (crit) userCrits++; } }
    }
  }
  return {on, bossHits, bossCrits, userHits, userCrits, avgTurns: (turns / 40).toFixed(1)};
}
console.log(stats(false)); console.log(stats(true));
// live mode + undo/redo keep the option
const g = live(t, {bossCrit: true}); let s = g.state(); g.choose('move 1');
const keys = Object.keys(g).filter(k => /undo|redo/i.test(k)); console.log('undo api:', keys);
