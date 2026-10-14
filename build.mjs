import {build} from 'esbuild'; import fs from 'fs'; import path from 'path';
// keepNames: the sim's save/restore (used by undo) finds classes by constructor.name, which minifying would rename.
const r = await build({entryPoints: ['src/main.js'], bundle: true, minify: true, keepNames: true, format: 'iife', platform: 'browser', write: false, define: {'process.env.NODE_ENV': '"production"'}});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const out = process.env.OUT || 'dist/pro-boss-sim.html';
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, fs.readFileSync('template.html', 'utf8').replace('/*BUNDLE*/', () => js));
console.log('Built ' + out + ' (' + (js.length / 1e6).toFixed(2) + ' MB js)');
