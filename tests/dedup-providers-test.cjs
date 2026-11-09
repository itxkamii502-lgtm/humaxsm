const assert = require('assert');
const http = require('http');

function postJson(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function getJson(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3000,
      path: path,
      method: 'GET',
      headers
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('--- Starting Deduplication & Dynamic Providers Tests ---');

  // Fetch and solve captcha if active
  const capRes = await getJson('/api/auth/captcha');
  let capPayload = {};
  if (capRes && capRes.body && capRes.body.id) {
    const q = capRes.body.question || '';
    const match = q.match(/(\d+)\s*\+\s*(\d+)/);
    if (match) {
      const ans = parseInt(match[1], 10) + parseInt(match[2], 10);
      capPayload = { captcha_id: capRes.body.id, captcha_answer: ans };
    }
  }

  // Login as Owner
  const loginRes = await postJson('/api/auth/login', { username: 'Kamran_Bhatti', password: 'ownerpass1', ...capPayload });
  assert.strictEqual(loginRes.status, 200, 'Owner login failed');
  const token = loginRes.body.token || loginRes.body.session_token;
  const authHeaders = { 'Authorization': `Bearer ${token}`, 'X-Session-Token': token };

  // 1. Test /api/providers does NOT have fake hardcoded telecoms
  const provRes = await getJson('/api/providers', authHeaders);
  assert.strictEqual(provRes.status, 200, 'GET /api/providers failed');
  const provNames = (provRes.body.data || []).map(p => p.name || p.provider_name);
  console.log('Current Providers in system:', provNames);

  const fakeCarriers = ['Airtel', 'Vodafone', 'Orange', 'MTN', 'O2', 'EE', 'T-Mobile', 'Movistar', 'Claro', 'Etisalat'];
  for (const fc of fakeCarriers) {
    assert(!provNames.includes(fc), `Fake carrier ${fc} should not be in /api/providers`);
  }
  console.log('✅ PASS: No fake hardcoded carriers in /api/providers');

  // 2. Test CR API Connection Duplicate Prevention & Dynamic Provider Registration
  const testConnToken = 'tok_test_' + Date.now();
  const testConnUrl = 'https://panel.example.com/' + Date.now();
  const testConnName = 'OctoPanel_' + Date.now();

  const addConn1 = await postJson('/api/cr-api-connections', {
    panel_name: testConnName,
    panel_url: testConnUrl,
    token: testConnToken
  }, authHeaders);
  assert.strictEqual(addConn1.status, 200, 'Adding new CR API connection failed');
  console.log('✅ PASS: Added CR API Connection successfully');

  // Test dynamic provider: testConnName should now appear in /api/providers
  const provResAfter = await getJson('/api/providers', authHeaders);
  const provNamesAfter = (provResAfter.body.data || []).map(p => p.name || p.provider_name);
  assert(provNamesAfter.includes(testConnName), 'New connection name must dynamically appear in /api/providers');
  console.log('✅ PASS: CR API connection name dynamically appears as a Provider');

  // Try to add the same token again -> should reject with 409
  const addConnDupToken = await postJson('/api/cr-api-connections', {
    panel_name: 'DifferentName',
    panel_url: 'https://different.example.com',
    token: testConnToken
  }, authHeaders);
  assert.strictEqual(addConnDupToken.status, 409, 'Duplicate token must return 409 Conflict');
  assert(addConnDupToken.body.error.includes('already exists'), 'Error must mention already exists');
  console.log('✅ PASS: Duplicate API token rejected with 409 Conflict');

  // Try to add the same URL and name again -> should reject with 409
  const addConnDupUrl = await postJson('/api/cr-api-connections', {
    panel_name: testConnName,
    panel_url: testConnUrl,
    token: 'different_token_' + Date.now()
  }, authHeaders);
  assert.strictEqual(addConnDupUrl.status, 409, 'Duplicate URL + Name must return 409 Conflict');
  console.log('✅ PASS: Duplicate URL + Name rejected with 409 Conflict');

  // 3. Test Number Import Deduplication and Range Detection
  const uniqueTestNum = '4477009' + Math.floor(10000 + Math.random() * 90000);
  const rangeId = 1;

  // First import of this number
  const import1 = await postJson('/api/numbers/import-to-range', {
    range_id: rangeId,
    numbers: `${uniqueTestNum}\n${uniqueTestNum}` // duplicate within the same batch!
  }, authHeaders);

  assert.strictEqual(import1.status, 200, 'import-to-range failed');
  assert.strictEqual(import1.body.imported, 1, 'Should import only 1 (unique) number');
  assert.strictEqual(import1.body.skipped_duplicates, 1, 'Should skip 1 duplicate within the batch');
  console.log('✅ PASS: Duplicate in same import batch successfully deduplicated');

  // Second import of the EXACT same number into the same range -> should skip it completely!
  const import2 = await postJson('/api/numbers/import-to-range', {
    range_id: rangeId,
    numbers: `${uniqueTestNum}`
  }, authHeaders);

  assert.strictEqual(import2.status, 200, 'import-to-range failed');
  assert.strictEqual(import2.body.imported, 0, 'Should import 0 numbers when already existing');
  assert.strictEqual(import2.body.skipped_duplicates, 1, 'Should skip existing number in same range');
  assert(import2.body.duplicates_detail[0].reason.includes('Already exists in this range'), 'Must state already in this range');
  console.log('✅ PASS: Existing number in same range successfully detected and skipped');

  // Third import: try importing into a DIFFERENT range (e.g. range 2)
  const rangesRes = await getJson('/api/numbers/sms-ranges', authHeaders);
  const otherRange = (rangesRes.body || []).find(r => r.id !== rangeId);
  if (otherRange) {
    const import3 = await postJson('/api/numbers/import-to-range', {
      range_id: otherRange.id,
      numbers: `${uniqueTestNum}`
    }, authHeaders);
    assert.strictEqual(import3.status, 200, 'import-to-range failed');
    assert.strictEqual(import3.body.imported, 0, 'Should import 0 numbers when already in another range');
    assert(import3.body.duplicates_detail[0].reason.includes('Already in range'), 'Must identify other range');
    console.log('✅ PASS: Number existing in another range successfully detected and cross-range skipped');
  }

  // 4. Test Single Number Add via POST /api/numbers
  const singleDup = await postJson('/api/numbers', {
    number: uniqueTestNum,
    country: 'UK'
  }, authHeaders);
  assert.strictEqual(singleDup.status, 409, 'Single number add must reject with 409 Conflict');
  assert(singleDup.body.detail.includes('already exists in system'), 'Must report range/system conflict');
  console.log('✅ PASS: POST /api/numbers rejected duplicate with 409 and detailed conflict message');

  console.log('\n🎉 ALL 4 NEW CAPABILITIES VERIFIED 100% WORKING!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
