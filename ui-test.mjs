// UI smoke test: loads dist/pro-boss-sim.html in jsdom and exercises Simulate, Play, keyboard, items, theme.
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
ok('start shows leads in last-turn card', /Battle start/.test(d.querySelector('#live .lt h2')?.textContent || '') && d.querySelectorAll('#live .lt .ev.sw').length === 2);
{ const ns = [...d.querySelectorAll('#blog .tn > summary b')].map(b => b.textContent); ok('live log lists newest turn first', ns.length >= 2 && ns[0] === 'Turn 1' && ns[ns.length - 1] === 'Battle start', ns.join(' | ')); }
ok('live log mounted', d.querySelectorAll('#blog .tn').length >= 2 && d.querySelectorAll('#blog .ev.sw').length >= 2, d.querySelectorAll('#blog .tn').length + ' turn cards');
const mv = d.querySelectorAll('.mv');
ok('4 move buttons', mv.length === 4, [...mv].map(b => b.querySelector('span').textContent + ' ' + (b.querySelector('.ef')?.textContent || '-')).join(' | '));
ok('type badges', d.querySelectorAll('#live .ty').length >= 2);
const turnBefore = d.querySelector('.field .chip b').textContent;
d.dispatchEvent(new w.KeyboardEvent('keydown', {key: '1', bubbles: true}));
await sleep(400);
ok('key 1 advances turn', d.querySelector('.field .chip b').textContent !== turnBefore, turnBefore + ' -> ' + d.querySelector('.field .chip b').textContent + ' | err: ' + (d.querySelector('#live .err')?.textContent || 'none') + ' | hidden=' + $('live').hidden + ' | active=' + d.activeElement?.tagName);
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

$('items').checked = true; $('items').onchange(); ok('bag input shown', !$('bagwrap').hidden);
$('play').click(); await sleep(200);
ok('bag section shown', /Bag/.test($('live').textContent) && d.querySelectorAll('[data-i]').length > 0, d.querySelectorAll('[data-i]').length + ' items');
$('theme').click(); ok('theme toggles', d.documentElement.dataset.theme === 'light');
console.log(out.join('\n')); console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'No runtime errors');
process.exit(fails || errs.length ? 1 : 0);
