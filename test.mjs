import {parseTeam, checkTeam, simulate, batch, fmtLog, BOSSES} from './src/engine.js';
const team = parseTeam(`Mewtwo @ Life Orb
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
- Fire Punch`);
console.log(checkTeam(team));
const r = simulate(team);
console.log(r.turns, r.win, r.faints.length, r.log.filter(l=>l.startsWith('|error')||l.startsWith('|-fail')).slice(0,3));
console.log(fmtLog(r.log).split('\n').slice(0,25).join('\n'));
const t=Date.now(); const R=batch(team,100); console.log('wins',R.wins,'ms',Date.now()-t, JSON.stringify(R.killers));
