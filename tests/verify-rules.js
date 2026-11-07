// Run: node tests/verify-rules.js [A|B|C|D ...]   (default: everything that exists)
import { summary } from './lib.js';
const want = process.argv.slice(2).map(x => x.toUpperCase());
const run = x => !want.length || want.includes(x);
let ok = true;
if (run('A')) { const { stageA } = await import('./stage-a.js'); await stageA(); }
for (const st of ['B', 'C', 'D']) {
  if (!run(st)) continue;
  try { const m = await import(`./stage-${st.toLowerCase()}.js`); await m[`stage${st}`](); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') { console.error(e); ok = false; } }
}
ok = summary('TOTAL') && ok;
process.exit(ok ? 0 : 1);
