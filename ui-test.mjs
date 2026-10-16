// UI smoke test: loads dist/pro-boss-sim.html in jsdom and exercises Simulate, Play, keyboard, manual boss, theme.
import {JSDOM, VirtualConsole} from 'jsdom';
import fs from 'fs';
const errs = [];
const vc = new VirtualConsole(); vc.on('jsdomError', e => errs.push('jsdomError: ' + e.message)); vc.on('error', e => errs.push('console.error: ' + e));
const dom = new JSDOM(fs.readFileSync('dist/pro-boss-sim.html', 'utf8'), {runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'http://localhost/'});
const w = dom.window, d = w.document, $ = id => d.getElementById(id);
w.matchMedia = w.matchMedia || (() => ({matches: false}));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; let fails = 0;
const ok = (name, cond, extra = '') => { if (!cond) fails++; out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };

await sleep(300);
ok('boss select filled', $('bossSel').options.length >= 1, $('bossSel').options.length + ' option(s)');
{ const names = [...$('bossSel').options].map(o => o.value), want = ['Gamer Pewdie', 'Gamer Diepy', 'Medusa', 'Eldir'];
  ok('split two-trainer bosses listed, combined ones gone', want.every(n => names.includes(n)) && !names.includes('Medusa & Eldir') && !names.includes('Gamers Pewdie and Diepy'), want.filter(n => !names.includes(n)).join(',') || 'all 4 present'); }
ok('lineup rendered', d.querySelectorAll('.bm').length === 6, d.querySelectorAll('.bm').length + ' cards');
ok('team preview valid', /valid/.test($('tv').textContent), $('tv').textContent.slice(0, 80));
ok('meta chips', d.querySelectorAll('#meta .chip').length >= 5);

$('team').value = 'Pikachu\n- Thunderbolt\n\nPikachu\n- Surf'; $('team').oninput(); await sleep(400);
ok('team validation error shown', d.querySelector('.verr') !== null, d.querySelector('.verr')?.textContent);
$('team').value = ''; $('team').oninput(); await sleep(400);
ok('empty team message', /No Pok/.test($('tv').textContent));
const SAMPLE = fs.readFileSync('src/main.js', 'utf8').match(/const SAMPLE = `([\s\S]*?)`;/)[1];
$('team').value = SAMPLE; $('team').oninput(); await sleep(400);

$('runs').value = '100';
$('run').click();
ok('progress shown', !!d.querySelector('.prog'));
for (let i = 0; i < 200 && $('run').disabled; i++) await sleep(100);
ok('results rendered', /win rate/.test($('out').textContent), $('out').textContent.slice(0, 60).replace(/\s+/g, ' '));
ok('empty hidden / out visible', $('empty').hidden && !$('out').hidden);
ok('bar cells', d.querySelectorAll('td.bc').length > 3);
$('w').click(); await sleep(50);
$('l').click(); await sleep(50);
ok('log turn cards', d.querySelectorAll('#log .tn').length > 3 || /No such/.test($('log').textContent), d.querySelectorAll('#log .tn').length + ' turns');
ok('log move rows', d.querySelectorAll('#log .ev .mvn').length > 3, d.querySelectorAll('#log .ev .mvn').length + ' moves');
ok('log summary chips', d.querySelectorAll('#log .lv-sum .chip').length === 4);
const ab = d.querySelectorAll('#log .nt.k-ability').length;
d.querySelector('#log [data-d]').click(); // toggle details off
ok('details toggle hides ability notes', ab > 0 && d.querySelectorAll('#log .nt.k-ability').length === 0, ab + ' -> ' + d.querySelectorAll('#log .nt.k-ability').length);
d.querySelector('#log [data-v="boss"]').click();
ok('boss decisions table', d.querySelectorAll('#log table.dt tr').length > 2 && d.querySelectorAll('#log .uc').length >= 1, d.querySelectorAll('#log table.dt tr').length + ' rows');
d.querySelector('#log [data-v="turns"]').click();
d.querySelector('#log [data-f]').click();
ok('collapse older keeps last open', d.querySelectorAll('#log details.tn[open]').length === 1, d.querySelectorAll('#log details.tn[open]').length + ' open');
d.querySelector('#log [data-f]').click();

$('play').click(); await sleep(200);
ok('live visible', !$('live').hidden && $('out').hidden);
ok('two panels', d.querySelectorAll('.mon').length === 2);
{ const pm = [...d.querySelectorAll('#live .mon .pm')], foe = [...d.querySelectorAll('#live .mon.foe .pm')], me = [...d.querySelectorAll('#live .mon.you .pm')];
  ok('party names shown in both cards', foe.length === 6 && me.length >= 1 && pm.every(x => x.textContent.trim().length > 2) && d.querySelectorAll('#live .mon .pm.on').length === 2, 'boss: ' + foe.map(x => x.textContent).join(', ') + ' | you: ' + me.map(x => x.textContent).join(', ')); }
ok('start shows leads in last-turn card', /Battle start/.test(d.querySelector('#live .lt h2')?.textContent || '') && d.querySelectorAll('#live .lt .ev.sw').length === 2);
{ const ns = [...d.querySelectorAll('#blog .tn > summary b')].map(b => b.textContent); ok('live log lists newest turn first', ns.length >= 2 && ns[0] === 'Turn 1' && ns[ns.length - 1] === 'Battle start', ns.join(' | ')); }
ok('live log mounted', d.querySelectorAll('#blog .tn').length >= 2 && d.querySelectorAll('#blog .ev.sw').length >= 2, d.querySelectorAll('#blog .tn').length + ' turn cards');
const mv = d.querySelectorAll('.mv');
ok('4 move buttons', mv.length === 4, [...mv].map(b => b.querySelector('span').textContent + ' ' + (b.querySelector('.ef')?.textContent || '-')).join(' | '));
ok('type badges', d.querySelectorAll('#live .ty').length >= 2);
const turnBefore = d.querySelector('.field .chip b').textContent;
d.dispatchEvent(new w.KeyboardEvent('keydown', {key: '1', bubbles: true}));
await sleep(400);
ok('key 1 advances turn', d.querySelector('.field .chip b').textContent !== turnBefore || (/Turn 1 — what happened/.test(d.querySelector('#live .lt')?.textContent || '') && d.querySelectorAll('#live [data-c^="switch"]').length > 0), turnBefore + ' -> ' + d.querySelector('.field .chip b').textContent + ' | err: ' + (d.querySelector('#live .err')?.textContent || 'none') + ' | hidden=' + $('live').hidden + ' | active=' + d.activeElement?.tagName);
const lt = d.querySelector('#live .lt'), firstMv = d.querySelector('#live [data-c]');
ok('last-turn card above moves', !!lt && /Turn 1 — what happened/.test(lt.textContent) && lt.querySelectorAll('.ev .mvn').length >= 1 && !!(lt.compareDocumentPosition(firstMv) & w.Node.DOCUMENT_POSITION_FOLLOWING), lt?.querySelector('h2')?.textContent);
{
  const tc = () => d.querySelector('.field .chip b').textContent, tNow = tc();
  ok('undo enabled, redo disabled after a move', !$('undo').disabled && $('redo').disabled);
  $('undo').click(); await sleep(100);
  ok('undo button goes back a turn', tc() === turnBefore && $('undo').disabled && !$('redo').disabled, tNow + ' -> ' + tc());
  ok('log is back to its starting state after undo', d.querySelectorAll('#blog .tn').length === 2, d.querySelectorAll('#blog .tn').length + ' cards (start had 2)');
  $('redo').click(); await sleep(100);
  ok('redo button returns to the same turn', tc() === tNow && !$('undo').disabled && $('redo').disabled, tc());
  d.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'z', ctrlKey: true, bubbles: true})); await sleep(100);
  ok('Ctrl+Z undoes', tc() === turnBefore, tc());
  d.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'y', ctrlKey: true, bubbles: true})); await sleep(100);
  ok('Ctrl+Y redoes', tc() === tNow, tc());
}
for (let i = 0; i < 400; i++) {
  if (d.querySelector('#live .big')) break;
  const m = d.querySelector('#live .mv:not(:disabled)') || d.querySelector('#live [data-c^="switch"]:not(:disabled)');
  if (!m) break; m.click();
}
ok('battle reaches an end', !!d.querySelector('#live .big'), d.querySelector('#live .big')?.textContent.replace(/\s+/g, ' '));
ok('live log shows result', !!d.querySelector('#blog .ev.win') && d.querySelectorAll('#blog .ev.fn').length > 0);
ok('last-turn card shows the winner at the end', !!d.querySelector('#live .lt .ev.win'));
ok('new battle works', (() => { $('nb').click(); return !!d.querySelector('.mv'); })());

{
  $('manualBoss').checked = true; $('play').click(); await sleep(500);
  const bm = [...d.querySelectorAll('#live [data-bc^="move"]')];
  ok('manual boss: boss move picker shown first', bm.length === 4 && d.querySelectorAll('#live [data-c^="move"]').length === 0 && /Boss's turn/.test($('live').textContent), bm.map(b => b.querySelector('span').textContent).join(' | '));
  ok('manual boss: toggle checked in battle', $('mb') && $('mb').checked);
  d.dispatchEvent(new w.KeyboardEvent('keydown', {key: '2', bubbles: true})); await sleep(600);
  ok('manual boss: after boss pick my moves appear', d.querySelectorAll('#live [data-c^="move"]').length === 4 && /Boss will:/.test($('live').textContent) && d.querySelectorAll('#live [data-bc]').length === 0, d.querySelector('#live .chip b')?.textContent);
  const t0 = d.querySelector('.field .chip b').textContent;
  d.dispatchEvent(new w.KeyboardEvent('keydown', {key: '1', bubbles: true})); await sleep(800);
  ok('manual boss: turn runs after both picks', /Turn 1 — what happened/.test(d.querySelector('#live .lt')?.textContent || '') && !d.querySelector('#live .err'), t0 + ' -> ' + d.querySelector('.field .chip b').textContent);
  ok('manual boss: asks for boss again next turn (or forced switch)', d.querySelectorAll('#live [data-bc]').length > 0 || d.querySelectorAll('#live [data-c^="switch"]').length > 0);
  $('mb').checked = false; $('mb').onchange(); await sleep(500);
  ok('manual boss: switching back to AI removes boss picker', d.querySelectorAll('#live [data-bc]').length === 0 && d.querySelectorAll('#live [data-c]').length > 0);
}

$('play').click(); await sleep(200);
$('theme').click(); ok('theme toggles', d.documentElement.dataset.theme === 'light');
console.log(out.join('\n')); console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'No runtime errors');
process.exit(fails || errs.length ? 1 : 0);
