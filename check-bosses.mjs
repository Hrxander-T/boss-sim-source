import fs from 'fs';
import {importBosses, bossFrom, batch, parseTeam} from './src/engine.js';
const r = importBosses(JSON.parse(fs.readFileSync('bosses.json', 'utf8')));
const names = Object.keys(r.bosses);
console.log(names.length + ' bosses imported:\n' + names.join(', '));
console.log('\nNotes (' + r.report.length + '):\n' + r.report.join('\n'));
const team = parseTeam('Mewtwo @ Life Orb\nAbility: Pressure\nTimid Nature\n- Psystrike\n- Ice Beam\n\nGroudon @ Leftovers\nAbility: Drought\n- Earthquake\n- Stone Edge');
console.log('\nSmoke test: 10 battles vs every imported boss...');
const bad = [];
for (const n of names) { try { batch(team, 10, {boss: bossFrom(r.bosses[n])}); } catch (e) { bad.push(n + ': ' + e.message); } }
console.log(bad.length ? 'FAILED:\n' + bad.join('\n') : 'All ' + names.length + ' bosses simulate without errors.');
