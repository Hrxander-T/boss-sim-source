import {live, parseTeam, BOSSES} from './src/engine.js';
let fail = 0;
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fail++; };
const team = parseTeam(`Groudon @ Leftovers\nAbility: Drought\nEVs: 252 HP / 252 Atk\n- Earthquake\n- Precipice Blades\n- Stone Edge\n- Roar\n\nKyurem @ Leftovers\nAbility: Pressure\n- Ice Beam\n- Earth Power\n- Roar\n- Substance`.replace('Substance', 'Draco Meteor'));

// Manual boss: nothing runs until the boss move AND my move are chosen.
const G = live(team, {manualBoss: true, boss: BOSSES['Ash Westbrook']});
let s = G.state();
ok(s.manualBoss && s.needBoss, 'starts waiting for boss choice');
ok(s.bossMoves.length === 4, 'boss has 4 selectable moves: ' + s.bossMoves.map(m => m.name).join(', '));
ok(s.bossBench.length === 5, 'boss bench listed (5)');
ok(G.choose('move 1') && G.state().turn === s.turn, 'my choice alone does not run the turn');
ok(G.state().youChosen && G.state().needBoss, 'still waiting for boss');
ok(G.chooseBoss('move 3') && (G.state().turn === s.turn + 1 || G.state().forceSwitch || G.state().bossForceSwitch), 'boss choice then runs the turn');
const used = G.state().log.filter(l => l.startsWith('|move|p2a')).map(l => l.split('|')[3]);
ok(used.length === 0 || used[0] === s.bossMoves[2].name, 'boss used the move I picked (or was KO\'d first): ' + used[0]);
ok(!G.chooseBoss('move 9'), 'invalid boss choice rejected');
const settle = () => { let st = G.state(); if (st.needBoss && st.bossForceSwitch) G.chooseBoss('switch ' + st.bossBench[0].idx); st = G.state(); if (st.forceSwitch) G.choose('switch ' + st.bench[0].idx); st = G.state(); if (st.needBoss && st.bossForceSwitch) G.chooseBoss('switch ' + st.bossBench[0].idx); };
settle();

// Boss picks first, then me.
s = G.state(); ok(s.needBoss, 'next turn waits for boss again');
ok(G.chooseBoss('move 1') && G.state().bossPick === s.bossMoves[0].name, 'bossPick shown: ' + G.state().bossPick);
G.clearBoss(); ok(G.state().needBoss, 'clearBoss lets me re-pick');
G.chooseBoss('move 2'); const t = G.state().turn; ok(G.choose('move 1') && (G.state().turn === t + 1 || G.state().bossForceSwitch), 'boss first, then me, runs the turn (or boss must replace a fainted mon)');

// Keep fighting manually until the boss must pick a replacement.
let sawForce = false;
for (let i = 0; i < 80 && !G.state().ended; i++) {
  const st = G.state();
  if (st.needBoss) { if (st.bossForceSwitch) { sawForce = true; ok(G.chooseBoss('switch ' + st.bossBench[0].idx), 'boss forced switch chosen by me -> ' + st.bossBench[0].name); } else G.chooseBoss('move 1'); }
  else if (st.forceSwitch) G.choose('switch ' + st.bench[0].idx);
  else G.choose('move 1');
}
ok(sawForce || !G.state().boss.team.some(p => p.fainted), 'boss forced-switch prompt appeared whenever a boss mon fainted');

// Toggling back to AI finishes the turn by itself.
const G2 = live(team, {manualBoss: true, boss: BOSSES['Ash Westbrook']});
G2.choose('move 1'); const t2 = G2.state().turn; G2.setManual(false);
ok(!G2.state().needBoss && (G2.state().turn === t2 + 1 || G2.state().forceSwitch), 'switching to AI resolves the pending turn');

// AI mode untouched.
const G3 = live(team, {boss: BOSSES['Ash Westbrook']});
ok(!G3.state().needBoss && G3.choose('move 1') && (G3.state().turn === 2 || G3.state().forceSwitch), 'AI mode still works');
const u = G3.state().canUndo; G3.undo(); ok(u, 'undo works in AI mode');
// Undo in manual mode.
const G4 = live(team, {manualBoss: true, boss: BOSSES['Ash Westbrook']});
G4.chooseBoss('move 1'); G4.choose('move 1'); ok(G4.undo() && G4.state().needBoss && G4.state().turn === 1, 'undo in manual mode returns to boss choice');
process.exit(fail ? 1 : 0);
