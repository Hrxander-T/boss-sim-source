import {parseTeam, live} from './src/engine.js';
const t = parseTeam('Mewtwo @ Leftovers\nAbility: Pressure\nEVs: 252 HP / 252 Def\n- Calm Mind\n- Psystrike\n\nGroudon @ Leftovers\nAbility: Drought\nEVs: 252 HP / 252 Def\n- Earthquake\n- Recover');
const g = live(t, {bossCrit: true});
const hits = () => g.state().log.filter(l => /^\|-damage\|p1a/.test(l) && !l.includes('[from]')).length;
const crits = () => g.state().log.filter(l => l.startsWith('|-crit|p1')).length;
const step = () => { const s = g.state(); if (!s.ended) g.choose(s.forceSwitch ? 'switch ' + s.bench[0].idx : 'move 1'); };
step(); step(); step();
g.undo(); g.undo();               // restore from snapshot (fromJSON path)
step(); step(); g.undo(); g.redo(); step();
console.log('after undo/redo: damaging hits on me =', hits(), '| crits =', crits());
