import {JSDOM} from 'jsdom'; import fs from 'fs';
const dom = new JSDOM(fs.readFileSync('dist/pro-boss-sim.html', 'utf8'), {runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(w) { w.matchMedia = () => ({matches: false}); w.Element.prototype.scrollIntoView = () => {}; }});
const w = dom.window, d = w.document; w.addEventListener('error', e => console.log('ERR', e.message));
const opts = [...d.getElementById('bossSel').options].map(o => o.value);
console.log(opts.length + ' bosses in dropdown with no import');
d.getElementById('bossSel').value = opts[3]; d.getElementById('bossSel').dispatchEvent(new w.Event('change'));
d.getElementById('runs').value = '100'; d.getElementById('run').click();
await new Promise(r => setTimeout(r, 9000));
console.log('selected', opts[3], '->', d.getElementById('out').textContent.replace(/\s+/g, ' ').slice(0, 90));
d.getElementById('play').click(); console.log('play mode ok:', !!d.querySelector('#live [data-c]'));
