import fs from 'fs';
import vm from 'vm';
import assert from 'assert';

const sharedUiCode = fs.readFileSync('humex-sms/static/js/shared-ui-kit.js', 'utf8');

// Mock browser environment
const dom = {
  elements: {},
  body: { classList: { contains: () => false }, appendChild: () => {} },
  head: { appendChild: () => {} },
  documentElement: { getAttribute: () => 'light' },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => ({ style: {}, appendChild: () => {} }),
  addEventListener: () => {}
};

const sandbox = {
  document: dom,
  window: { addEventListener: () => {} },
  navigator: {},
  location: { href: '' },
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Array,
  Object,
  Math,
  String,
  Number,
  parseInt,
  parseFloat,
  zyImg: () => '',
  ZY_ICON_BASE: '/static/img/',
  zyEsc: (s) => String(s || ''),
  zyFmtMoney: (n) => Number(n).toFixed(4)
};

vm.createContext(sandbox);
vm.runInContext(sharedUiCode, sandbox);

console.log('Testing zyDT2 dynamic footer rendering...');

const hostMock = {
  innerHTML: ''
};
sandbox.document.getElementById = (id) => hostMock;

// Scenario 1: Direct 1:1 match with 5 columns, all visible
const tableConfig1 = {
  cols: ['Date', 'Number', 'SMS', 'Rate', 'Payout'],
  rows: [
    ['2026-11-12 12:00', '1234567890', 'Test SMS', '0.05', '0.05']
  ],
  footRow: '<td><b>Total SMS: 1</b></td><td></td><td></td><td></td><td><b>$0.0500</b></td>'
};

sandbox.zyDT2('dt-test1', tableConfig1);
sandbox.zy2Render('dt-test1');

assert(hostMock.innerHTML.includes('<tfoot>'), 'tfoot should be rendered');
let matches1 = hostMock.innerHTML.match(/<tfoot[\s\S]*?<\/tfoot>/i)[0].match(/<td[\s\S]*?<\/td>/gi);
assert.strictEqual(matches1.length, 5, `Expected 5 cells in tfoot, got ${matches1.length}`);
console.log('PASS: Scenario 1 - 5 visible cols -> exactly 5 footer cells');

// Scenario 2: Hide 2 columns (Number and Rate) using zy2ToggleCol
sandbox.zy2ToggleCol('dt-test1', 1, false);
sandbox.zy2ToggleCol('dt-test1', 3, false);

let matches2 = hostMock.innerHTML.match(/<tfoot[\s\S]*?<\/tfoot>/i)[0].match(/<td[\s\S]*?<\/td>/gi);
assert.strictEqual(matches2.length, 3, `Expected 3 cells in tfoot when 2 cols hidden, got ${matches2.length}`);
assert(matches2[0].includes('Total SMS'), 'Col 0 (Date) has Total SMS');
assert(matches2[2].includes('$0.0500'), 'Last visible col has Payout total');
console.log('PASS: Scenario 2 - Hiding columns dynamically shrinks footer cells to 3 with perfect alignment');

// Scenario 3: Hide Col 0 (Date). Total label should shift to first visible col so total is never lost
sandbox.zy2ToggleCol('dt-test1', 0, false); // Col 0 is now hidden too! Cols 2 (SMS) and 4 (Payout) are visible
let matches3 = hostMock.innerHTML.match(/<tfoot[\s\S]*?<\/tfoot>/i)[0].match(/<td[\s\S]*?<\/td>/gi);
assert.strictEqual(matches3.length, 2, `Expected 2 cells in tfoot, got ${matches3.length}`);
assert(matches3[0].includes('Total SMS'), 'Total label shifted to first visible column when col 0 hidden');
console.log('PASS: Scenario 3 - Total label preserved and shifted when Col 0 is hidden');


// Scenario 4: Mismatched author footRow with repeat(9) when cols has 7 columns
const tableConfig4 = {
  cols: ['Range', 'Count', 'USD', 'Payout', 'Profit', 'Cause', 'IP'],
  rows: [['Range1', 10, '$', '1.00', '0.50', 'Success', '1.1.1.1']],
  footRow: '<td><b>Total Groups: 1</b></td>' + '<td></td>'.repeat(9) + '<td><b>$1.0000</b></td><td><b>$0.5000</b></td>'
};
sandbox.zyDT2('dt-test4', tableConfig4);
sandbox.zy2Render('dt-test4');

let matches4 = hostMock.innerHTML.match(/<tfoot[\s\S]*?<\/tfoot>/i)[0].match(/<td[\s\S]*?<\/td>/gi);
assert.strictEqual(matches4.length, 7, `Expected 7 cells in tfoot, got ${matches4.length}`);
assert(matches4[0].includes('Total Groups'), 'Leading cell has Total Groups');
assert(matches4[matches4.length - 1].includes('$0.5000'), 'Trailing cell has profit');
console.log('PASS: Scenario 4 - Mismatched author footRow with fixed spacers dynamically auto-fits to exact visible columns');

console.log('\nALL 4 DYNAMIC FOOTER TESTS PASSED WITH 100% SUCCESS!');
process.exit(0);
