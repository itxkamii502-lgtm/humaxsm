const assert = require('assert');
const fs = require('fs');

async function run() {
  console.log('--- Starting Isolated Deduplication & Dynamic Providers Tests ---');
  const { makeFixture, startServer } = await import('./lib.js');

  const dir = makeFixture({
    sms_ranges: [
      { id: 1, range_name: 'Ghana Orange NS2', name: 'Ghana Orange NS2', country: 'Ghana', provider: 'Orange', prefix: '233', cost: 0.02, payout: 0.01, currency: 'USD' },
      { id: 2, range_name: 'UK Test Range', name: 'UK Test Range', country: 'UK', provider: 'Direct', prefix: '44', cost: 0.03, payout: 0.015, currency: 'USD' }
    ],
    cr_api_connections: []
  });
  const port = 4500 + Math.floor(Math.random() * 400);
  const srv = await startServer(dir, port);

  try {
    const loginRes = await srv.login('Kamran_Bhatti', 'ownerpass1');
    assert.strictEqual(loginRes.ok, true, 'Owner login via cookie failed');
    const cookie = loginRes.cookie;

    // 1. Test /api/providers does NOT have fake hardcoded carriers beyond fixture data
    const provRes = await srv.api('GET', '/api/providers', { cookie });
    assert.strictEqual(provRes.status, 200, 'GET /api/providers failed');
    const provNames = (provRes.data.data || []).map(p => p.name || p.provider_name);
    const fakeCarriers = ['Airtel', 'Vodafone', 'MTN', 'O2', 'EE', 'T-Mobile', 'Movistar', 'Claro', 'Etisalat'];
    for (const fc of fakeCarriers) {
      assert(!provNames.includes(fc), `Fake carrier ${fc} should not be in /api/providers`);
    }
    console.log('PASS  No fake hardcoded carriers in /api/providers');

    // 2. Test CR API Connection Duplicate Prevention & Dynamic Provider Registration
    const testConnToken = 'tok_test_' + Date.now();
    const testConnUrl = 'https://panel.example.com/' + Date.now();
    const testConnName = 'OctoPanel_' + Date.now();

    const addConn1 = await srv.api('POST', '/api/cr-api-connections', {
      cookie,
      body: { panel_name: testConnName, panel_url: testConnUrl, token: testConnToken }
    });
    assert.strictEqual(addConn1.status, 200, 'Adding new CR API connection failed');

    const provResAfter = await srv.api('GET', '/api/providers', { cookie });
    const provNamesAfter = (provResAfter.data.data || []).map(p => p.name || p.provider_name);
    assert(provNamesAfter.includes(testConnName), 'New connection name must dynamically appear in /api/providers');
    console.log('PASS  CR API connection dynamically registered as Provider');

    const addConnDupToken = await srv.api('POST', '/api/cr-api-connections', {
      cookie,
      body: { panel_name: 'DifferentName', panel_url: 'https://different.example.com', token: testConnToken }
    });
    assert.strictEqual(addConnDupToken.status, 409, 'Duplicate token must return 409 Conflict');

    const addConnDupUrl = await srv.api('POST', '/api/cr-api-connections', {
      cookie,
      body: { panel_name: testConnName, panel_url: testConnUrl, token: 'different_token_' + Date.now() }
    });
    assert.strictEqual(addConnDupUrl.status, 409, 'Duplicate URL + Name must return 409 Conflict');
    console.log('PASS  Duplicate CR API token & URL+Name rejected with 409 Conflict');

    // 3. Test Number Import Deduplication and Range Detection
    const uniqueTestNum = '4477009' + Math.floor(10000 + Math.random() * 90000);
    const rangeId = 1;

    const import1 = await srv.api('POST', '/api/numbers/import-to-range', {
      cookie,
      body: { range_id: rangeId, numbers: `${uniqueTestNum}\n${uniqueTestNum}` }
    });
    assert.strictEqual(import1.status, 200, 'import-to-range failed');
    assert.strictEqual(import1.data.imported, 1, 'Should import only 1 unique number');
    assert.strictEqual(import1.data.skipped_duplicates, 1, 'Should skip 1 in-batch duplicate');

    const import2 = await srv.api('POST', '/api/numbers/import-to-range', {
      cookie,
      body: { range_id: rangeId, numbers: `${uniqueTestNum}` }
    });
    assert.strictEqual(import2.status, 200);
    assert.strictEqual(import2.data.imported, 0);
    assert.strictEqual(import2.data.skipped_duplicates, 1);
    assert(import2.data.duplicates_detail[0].reason.includes('Already exists in this range'));

    const import3 = await srv.api('POST', '/api/numbers/import-to-range', {
      cookie,
      body: { range_id: 2, numbers: `${uniqueTestNum}` }
    });
    assert.strictEqual(import3.status, 200);
    assert.strictEqual(import3.data.imported, 0);
    assert(import3.data.duplicates_detail[0].reason.includes('Already in range'));
    console.log('PASS  In-batch, same-range, and cross-range number deduplication verified');

    // 4. Test Single Number Add via POST /api/numbers
    const singleDup = await srv.api('POST', '/api/numbers', {
      cookie,
      body: { number: uniqueTestNum, country: 'UK' }
    });
    assert.strictEqual(singleDup.status, 409, 'Single number add must reject duplicate with 409 Conflict');
    assert(singleDup.data.detail.includes('already exists in system'));
    console.log('PASS  POST /api/numbers rejects duplicate with 409');
  } finally {
    await srv.stop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
