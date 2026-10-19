import {parseTeam, live} from './src/engine.js';
const t = parseTeam('Mewtwo @ Life Orb\nAbility: Pressure\nEVs: 252 HP / 252 Def\n- Psystrike\n- Recover\n\nGroudon @ Leftovers\nAbility: Drought\nEVs: 252 HP / 252 Def\n- Earthquake\n- Recover');
const g = live(t, {bossCrit: true});
const crits = () => g.state().log.filter(l => l.startsWith('|-crit|p1')).length;
g.choose('move 2'); g.choose('move 2'); const before = crits();
g.undo(); g.undo(); g.choose('move 2'); g.choose('move 2'); g.undo(); g.redo(); g.choose('move 2');
const s = g.state(); const bossHitsOnMe = s.log.filter(l => /^\|-damage\|p1a/.test(l) && !l.includes('[from]')).length;
console.log('crits on me before undo:', before, '| after undo/redo play:', crits(), 'of', bossHitsOnMe, 'damaging hits');
