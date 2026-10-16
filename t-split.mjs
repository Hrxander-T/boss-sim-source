import fs from 'fs';
import {importBosses, bossFrom, batch, parseTeam} from './src/engine.js';
const r = importBosses(JSON.parse(fs.readFileSync('bosses.json', 'utf8')));
for (const n of ['Shary', 'Shaui']) console.log(n + ':', r.bosses[n].map(m => `${m[0]} @ ${m[2] || '-'}`).join(', '));
console.log('Shary & Shaui still listed:', 'Shary & Shaui' in r.bosses, '| total bosses:', Object.keys(r.bosses).length);
const t = parseTeam('Mewtwo @ Life Orb\nAbility: Pressure\nTimid Nature\n- Psystrike\n- Ice Beam\n\nGroudon @ Leftovers\nAbility: Drought\n- Earthquake\n- Stone Edge');
for (const n of ['Shary', 'Shaui']) { const R = batch(t, 30, {boss: bossFrom(r.bosses[n])}); console.log(n, 'sim ok: wins', R.wins + '/30'); }
console.log(r.report.filter(x => /Shary|Shaui/.test(x)).join('\n'));
