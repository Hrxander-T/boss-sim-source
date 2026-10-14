// Parser check: parseLog output must agree with the raw sim log, across many battles and every boss.
import fs from 'fs';
import {Teams} from '@pkmn/sim';
import {simulate, BOSSES, importBosses, bossFrom} from './src/engine.js';
import {parseLog, logText} from './src/logview.js';

const team = Teams.import(fs.readFileSync('src/main.js', 'utf8').match(/const SAMPLE = `([\s\S]*?)`;/)[1]);
for (const [k, v] of Object.entries(importBosses(JSON.parse(fs.readFileSync('bosses.json', 'utf8'))).bosses)) BOSSES[k] = bossFrom(v);

let battles = 0, bad = [];
const check = (name, cond, extra) => { if (!cond) bad.push(`${name}: ${extra || ''}`); };
for (const [bn, lineup] of Object.entries(BOSSES)) {
  for (let i = 0; i < 4; i++) {
    const r = simulate(team, {gen: 6, boss: lineup}); battles++;
    const raw = r.log, P = parseLog(raw), tag = `${bn}#${i}`;
    const count = k => raw.filter(l => l.split('|')[1] === k).length;
    const evs = P.turns.flatMap(t => t.ev);
    check(tag + ' moves', evs.filter(e => e.t === 'move').length === count('move'), `${evs.filter(e => e.t === 'move').length} vs ${count('move')}`);
    check(tag + ' faints', P.faints.length === count('faint'), `${P.faints.length} vs ${count('faint')}`);
    check(tag + ' switches', evs.filter(e => e.t === 'switch').length === count('switch') + count('drag'));
    check(tag + ' turns', P.nTurns === r.turns, `${P.nTurns} vs ${r.turns}`);
    check(tag + ' winner', (P.winner === 'You') === r.win);
    for (const e of evs) if (e.t === 'move' && e.dmg) {
      check(tag + ' dmg range', e.dmg.from >= e.dmg.to && e.dmg.to >= 0 && e.dmg.from <= e.dmg.max, JSON.stringify(e.dmg));
    }
    const known = new Set(evs.filter(e => e.t === 'switch').map(e => e.mon));
    for (const e of evs) if (e.t === 'move') check(tag + ' names', known.has(e.mon) && (!e.tgt || known.has(e.tgt)), `${e.mon} -> ${e.tgt}`);
    const txt = logText(P);
    check(tag + ' text', txt.length > 50 && !/undefined|NaN/.test(txt), (txt.match(/.*(undefined|NaN).*/) || [''])[0]);
    // faint source should always be known for boss KOs by a move
    check(tag + ' faint src', P.faints.every(f => f.by !== undefined));
  }
}
console.log(`${battles} battles across ${Object.keys(BOSSES).length} bosses parsed.`);
console.log(bad.length ? `FAIL (${bad.length}):\n` + bad.slice(0, 15).join('\n') : 'All parser checks passed.');
// sample output
const s = simulate(team, {gen: 6, boss: BOSSES['Ash Westbrook'] || Object.values(BOSSES)[0]});
console.log('\n--- sample text export (first 28 lines) ---\n' + logText(parseLog(s.log)).split('\n').slice(0, 28).join('\n'));
process.exit(bad.length ? 1 : 0);
