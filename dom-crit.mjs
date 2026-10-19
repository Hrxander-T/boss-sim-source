import {JSDOM} from 'jsdom'; import fs from 'fs';
const dom = new JSDOM(fs.readFileSync('dist/pro-boss-sim.html', 'utf8'), {runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(w) { w.matchMedia = () => ({matches: false}); w.Element.prototype.scrollIntoView = () => {}; }});
const w = dom.window, d = w.document; w.addEventListener('error', e => console.log('ERR', e.message));
console.log('checkbox present:', !!d.getElementById('bossCrit'));
const run = async on => { d.getElementById('bossCrit').checked = on; d.getElementById('runs').value = '100'; d.getElementById('run').click();
  await new Promise(r => setTimeout(r, 9000)); return d.getElementById('out').textContent.replace(/\s+/g, ' ').match(/\d+%/)?.[0]; };
console.log('win rate normal:', await run(false), '| always-crit:', await run(true));
