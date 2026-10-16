// Undo/redo fidelity test for the interactive battle (engine only, no UI).
import {live, parseTeam} from './src/engine.js';
const team = parseTeam('Mewtwo @ Life Orb\nAbility: Pressure\nTimid Nature\n- Psystrike\n- Ice Beam\n- Recover\n\nGroudon @ Leftovers\nAbility: Drought\n- Earthquake\n- Stone Edge\n\nKyogre @ Leftovers\nAbility: Drizzle\n- Surf\n- Ice Beam');
let fails = 0;
const ok = (n, c, x = '') => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); };
const snap = s => JSON.stringify({...s, canUndo: 0, canRedo: 0});
const play = G => { const s = G.state(); if (s.ended) return false; return G.choose(s.forceSwitch ? 'switch ' + s.bench[0].idx : 'move 1'); };

const G = live(team);
ok('start: no undo/redo', !G.state().canUndo && !G.state().canRedo);
const S = [snap(G.state())];
for (let i = 0; i < 5; i++) { if (!play(G)) break; S.push(snap(G.state())); }
const n = S.length - 1;
ok('played turns', n >= 3, n + ' actions');
ok('canUndo after play', G.state().canUndo && !G.state().canRedo);

let good = true;
for (let k = 1; k <= n; k++) { if (!G.undo() || snap(G.state()) !== S[n - k]) { good = false; break; } }
ok('undo all the way restores every earlier state exactly', good);
ok('cannot undo past start', !G.undo() && !G.state().canUndo && G.state().canRedo);
good = true;
for (let k = 1; k <= n; k++) { if (!G.redo() || snap(G.state()) !== S[k]) { good = false; break; } }
ok('redo all the way restores every later state exactly', good);
ok('cannot redo past end', !G.redo() && !G.state().canRedo);

// branch: undo 2, act, redo is gone
G.undo(); G.undo();
play(G);
ok('new action clears redo', !G.state().canRedo && G.state().canUndo);

// play to the end, then undo out of the finished battle
let guard = 0; while (play(G) && guard++ < 200);
ok('battle can finish after restores', G.state().ended, 'turn ' + G.state().turn);
const endTurn = G.state().turn;
ok('undo from finished battle', G.undo() && !G.state().ended && G.state().turn <= endTurn);
ok('can keep playing after undoing the end', play(G) !== undefined);

console.log(fails ? fails + ' FAILED' : 'All undo/redo checks passed');
process.exit(fails ? 1 : 0);
