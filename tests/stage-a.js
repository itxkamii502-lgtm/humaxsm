import { check, makeFixture, startServer, sleep, readJson, ROOT, fs, path } from './lib.js';

export async function stageA() {
  console.log('\n=== STAGE A: security + reliability ===');
  const dir = makeFixture();
  const srv = await startServer(dir, 3911);
  const { api, login } = srv;
  try {
    const owner = await login('Kamran_Bhatti', 'ownerpass1');
    const mgr = await login('mgr_one', 'mgrpass11');
    const agent = await login('agent_one', 'agentpass1');
    const client = await login('client_one', 'clientpass1');
    const test = await login('test123', 'test123');
    check('A0 all five roles can log in', owner.ok && mgr.ok && agent.ok && client.ok && test.ok, JSON.stringify([owner.ok, mgr.ok, agent.ok, client.ok, test.ok]));

    // anonymous
    for (const [m, u] of [['GET', '/api/backup/export'], ['GET', '/api/sms/logs'], ['POST', '/api/numbers/bulk-assign-many'], ['GET', '/api/numbers'], ['GET', '/api/tokens'], ['GET', '/api/notifications']]) {
      const r = await api(m, u, { body: m === 'POST' ? {} : undefined });
      check(`A1 anonymous refused: ${m} ${u}`, r.status === 401, 'got ' + r.status);
    }
    const pub = await api('GET', '/api/settings');
    check('A1 anonymous settings has no secrets', pub.status === 200 && pub.data && !('webhook_secret' in pub.data) && !('smtp_password' in pub.data));

    // Client cannot do owner things
    const cl = (m, u, body) => api(m, u, { cookie: client.cookie, body });
    check('A1 client cannot bulk-delete numbers', (await cl('POST', '/api/numbers/bulk-delete-many', { number_ids: [1] })).status === 403);
    check('A1 client cannot read API tokens', (await cl('GET', '/api/tokens')).status === 403);
    check('A1 client cannot write rate-card', (await cl('POST', '/api/numbers/rate-card', { country: 'x' })).status === 403);
    check('A1 client cannot download all numbers', (await cl('GET', '/api/numbers/download')).status === 403);
    check('A1 client cannot read dashboard stats', (await cl('GET', '/api/dashboard/stats')).status === 403);
    check('A1 client cannot unassign numbers', (await cl('POST', '/api/numbers/bulk-unassign-many', { number_ids: [5] })).status === 403);
    check('A1 client cannot write announcements', (await cl('POST', '/api/announcements', { title: 'x' })).status === 403);
    check('A1 client cannot read audit logs', (await cl('GET', '/api/audit-logs')).status === 403);
    check('A1 client cannot edit payout requests', (await cl('PATCH', '/api/payout-requests/1', { status: 'paid' })).status === 403);
    check('A1 client can still read its numbers + ranges', (await cl('GET', '/api/numbers')).status === 200 && (await cl('GET', '/api/numbers/sms-ranges')).status === 200);
    const rangesForClient = await cl('GET', '/api/numbers/sms-ranges');
    check('A1 client does not see company cost in ranges', Array.isArray(rangesForClient.data) && rangesForClient.data.every(r => !('cost' in r)));
    // Agent / Manager
    const ag = (m, u, body) => api(m, u, { cookie: agent.cookie, body });
    const mg = (m, u, body) => api(m, u, { cookie: mgr.cookie, body });
    check('A1 agent cannot bulk-delete numbers', (await ag('POST', '/api/numbers/bulk-delete-many', { number_ids: [4] })).status === 403);
    check('A1 agent cannot write ranges', (await ag('POST', '/api/numbers/sms-ranges', { range_name: 'x' })).status === 403);
    check('A1 agent cannot read business report', (await ag('GET', '/api/reports/business')).status === 403);
    check('A1 manager cannot read business report', (await mg('GET', '/api/reports/business')).status === 403);
    check('A1 manager cannot open backup', (await mg('GET', '/api/backup/export')).status === 403);
    check('A1 manager can read its tokens list', (await mg('GET', '/api/tokens')).status === 200);
    check('A1 manager can post announcement', (await mg('POST', '/api/announcements', { title: 'hello', body: 'm' })).status < 300);
    // TestPanel is default-deny
    const tp = (m, u, body) => api(m, u, { cookie: test.cookie, body });
    check('A1 testpanel can read test numbers', (await tp('GET', '/api/sms/test-numbers')).status === 200);
    check('A1 testpanel cannot read normal numbers', (await tp('GET', '/api/numbers')).status === 403);
    check('A1 testpanel cannot read sms logs', (await tp('GET', '/api/sms/logs')).status === 403);
    // Owner works
    const ow = (m, u, body) => api(m, u, { cookie: owner.cookie, body });
    check('A1 owner can open backup export', (await ow('GET', '/api/backup/export')).status === 200);
    check('A1 owner can read dashboard stats', (await ow('GET', '/api/dashboard/stats')).status === 200);
    // F2: Logout invalidates server session
    const tempAgent = await login('agent_one', 'agentpass1');
    check('F2 agent session valid before logout', tempAgent.ok && (await api('GET', '/api/auth/me', { cookie: tempAgent.cookie })).status === 200);
    const logoutRes = await api('POST', '/api/auth/logout', { cookie: tempAgent.cookie });
    check('F2 POST /api/auth/logout returns 200', logoutRes.status === 200);
    check('F2 agent session invalidated on server after logout (returns 401)', (await api('GET', '/api/auth/me', { cookie: tempAgent.cookie })).status === 401);

    // A2 download routes gone
    const dl = await api('GET', '/download/vps');
    check('A2 /download/vps no longer serves a file', !(typeof dl.data === 'string' && dl.data.startsWith('PK')) && !String(dl.headers.get('content-disposition') || '').includes('attachment'));
    check('A2 no archive files shipped in static/', !fs.existsSync(path.join(ROOT, 'Alpha SMS/static/alphasms-vps.zip')));

    // A4 inbound
    check('A4 inbound without token refused', (await api('POST', '/api/sms/inbound', { body: { to: '233500000005', message: 'Your code is 111111' } })).status === 403);
    check('A4 inbound with wrong token refused', (await api('POST', '/api/sms/inbound', { body: { to: '233500000005', message: 'x' }, headers: { 'x-inbound-token': 'nope' } })).status === 403);
    check('A4 inbound empty message rejected (no invented OTP)', (await api('POST', '/api/sms/inbound', { body: { to: '233500000005' }, headers: { 'x-inbound-token': 'inbound-secret' } })).status === 400);
    const good = await api('POST', '/api/sms/inbound', { body: { from: 'Apple', to: '233500000005', message: 'Your Apple code is 123456', sms_id: 'sid-1' }, headers: { 'x-inbound-token': 'inbound-secret' } });
    check('A4 inbound with token logs the SMS', good.status === 200 && good.data.logged === true && good.data.entry && good.data.entry.client_id === 1, JSON.stringify(good.data).slice(0, 200));
    const dup = await api('POST', '/api/sms/inbound', { body: { from: 'Apple', to: '233500000005', message: 'Your Apple code is 123456', sms_id: 'sid-1' }, headers: { 'x-inbound-token': 'inbound-secret' } });
    check('A5 duplicate sms_id is not logged twice', dup.status === 200 && dup.data.duplicate === true);
    // A8 test SMS isolation
    const t1 = await api('POST', '/api/sms/inbound', { body: { from: 'Apple', to: '233999000001', message: 'Test code 777777', sms_id: 'tst-1' }, headers: { 'x-inbound-token': 'inbound-secret' } });
    await sleep(1800);
    check('A8 test SMS accepted but only in test logs', t1.status === 200 && t1.data.test === true);
    const smsLogNow = readJson(dir, 'sms_log');
    check('A8 test SMS never enters sms_log', !smsLogNow.some(r => r.message && r.message.includes('777777')));
    check('A8 test SMS is in test_sms_logs', readJson(dir, 'test_sms_logs').some(r => r.message && r.message.includes('777777')));

    // A7 tokens hashed + shown once + token API strictness
    const noTok = await api('GET', '/api/sms');
    check('A7 /api/sms without token refused', noTok.status === 401);
    const bad = await api('GET', '/api/sms', { headers: { Authorization: 'Bearer tok_fake' } });
    check('A7 /api/sms with wrong token refused', bad.status === 401);
    const created = await mg('POST', '/api/tokens', { name: 'k1', agent_id: 1 });
    check('A7 token created and returned once', created.status === 200 && /^tok_[0-9a-f]{48}$/.test(created.data.token || ''), JSON.stringify(created.data).slice(0, 150));
    const stored = readJson(dir, 'api_tokens');
    check('A7 token stored hashed (no raw token on disk)', stored.length === 1 && !stored[0].token && stored[0].token_hash && stored[0].token_hash.length === 64);
    const listed = await mg('GET', '/api/tokens');
    check('A7 token list never shows the raw token', Array.isArray(listed.data) && listed.data.every(t => !t.token && !t.token_hash));
    const viaTok = await api('GET', '/api/sms', { headers: { Authorization: 'Bearer ' + created.data.token } });
    check('A7 valid token works and is scoped to its agent', viaTok.status === 200, 'status ' + viaTok.status);
    const rows = Array.isArray(viaTok.data) ? viaTok.data : (viaTok.data && (viaTok.data.data || viaTok.data.sms || viaTok.data.rows)) || [];
    check('A7 token result only has the agent\'s chain', rows.every(r => Number(r.agent_id) === 1), JSON.stringify(viaTok.data).slice(0, 200));
    const sessionOnly = await api('GET', '/api/sms', { cookie: owner.cookie });
    check('A7 /api/sms refuses a browser session (token only)', sessionOnly.status === 401);
    const crapi = await api('GET', '/crapi/viewstats');
    check('A7 /crapi/viewstats refuses requests without a token', crapi.status === 401);

    // notifications scoping
    const nf = readJson(dir, 'notifications');
    fs.writeFileSync(path.join(dir, 'notifications.json'), JSON.stringify([{ id: 1, title: 'owner only', message: 'secret', recipient_role: 'owner', read: false }, { id: 2, title: 'for clients', message: 'hi', recipient_role: 'client', read: false }]));
    await sleep(50);
    const clN = await cl('GET', '/api/notifications?role=owner');
    const titles = ((clN.data && clN.data.data) || []).map(n => n.title);
    check('A1 client cannot read owner notifications by changing ?role=', !titles.includes('owner only'), JSON.stringify(titles));

    // A7 static: no Math.random left for secrets
    const code = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf-8');
    const rnd = (code.match(/Math\.random\(\)/g) || []).length;
    check('A7 Math.random is not used for secrets (only 1 harmless test-number suffix allowed)', rnd <= 1, 'found ' + rnd);
    check('A7 express.json is capped (no 50mb global limit)', !/express\.json\(\{ limit: '50mb' \}\)/.test(code));

    // A6 WebSocket auth
    const WebSocket = (await import('ws')).default;
    const wsNoAuth = await new Promise(res => {
      const ws = new WebSocket('ws://127.0.0.1:3911');
      ws.on('close', code => res(code));
      ws.on('error', () => {});
      setTimeout(() => { try { ws.terminate(); } catch (e) {} res(0); }, 1500);
    });
    check('A6 anonymous WebSocket refused (close code 1008)', wsNoAuth === 1008, 'got ' + wsNoAuth);

    // A3 UI token masking + A9 escapeHtml
    const btCode = fs.readFileSync(path.join(ROOT, 'Alpha SMS/static/js/brand-theme.js'), 'utf-8');
    check('A9 escapeHtml defined globally in brand-theme.js', btCode.includes('window.escapeHtml'));
    const mgrJs = fs.readFileSync(path.join(ROOT, 'Alpha SMS/static/js/manager.js'), 'utf-8');
    check('A3 token masked in manager table', mgrJs.includes('token_hint ?') && !mgrJs.includes("mgrCopyToken('${t.token"));
    const appJs = fs.readFileSync(path.join(ROOT, 'Alpha SMS/static/js/app.js'), 'utf-8');
    check('A3 token masked in admin table', appJs.includes('token_hint ?') && !appJs.includes("copyToken('${t.token"));
  } finally { await srv.stop(); }

  // A5 volume + crash safety
  console.log('-- A5 volume / crash tests');
  const big = [];
  for (let i = 1; i <= 200000; i++) big.push({ id: i, number: '233500000099', cli: 'x', message: 'm' + i, timestamp: '2026-10-01T00:00:00.000Z', date: '2026-10-01', status: 'delivered', ext_key: 'k' + i });
  const dir2 = makeFixture({ sms_log: big });
  const srv2 = await startServer(dir2, 3912, { SMS_LOG_RETENTION_DAYS: '3650' });
  try {
    const r = await srv2.api('POST', '/api/sms/inbound', { body: { from: 'Apple', to: '233500000005', message: 'Volume code 424242', sms_id: 'vol-1' }, headers: { 'x-inbound-token': 'inbound-secret' } });
    check('A5 SMS still accepted with 200,000 rows in the log (old Math.max bug)', r.status === 200 && r.data.logged === true, JSON.stringify(r.data).slice(0, 150));
    await srv2.stop();   // SIGKILL immediately: before the debounced flush
    const jr = fs.readFileSync(path.join(dir2, 'sms_log.journal.ndjson'), 'utf-8');
    check('A5 SMS is in the crash-safe journal even though the process was killed', jr.includes('424242'));
    const srv3 = await startServer(dir2, 3913, { SMS_LOG_RETENTION_DAYS: '3650' });
    try {
      await sleep(300);
      const after = readJson(dir2, 'sms_log');
      check('A5 SMS recovered after crash restart', after.some(x => x.message && x.message.includes('424242')) && after.length === 200001, 'rows ' + after.length);
    } finally { await srv3.stop(); }
  } finally { await srv2.stop(); }

  // retention archives (never deletes)
  const old = [];
  for (let i = 1; i <= 50; i++) old.push({ id: i, number: '233500000005', message: 'old' + i, timestamp: '2025-01-15T10:00:00.000Z', date: '2025-01-15', status: 'delivered', ext_key: 'o' + i });
  const dir3 = makeFixture({ sms_log: old.concat([{ id: 99, number: '233500000005', message: 'fresh', timestamp: new Date().toISOString(), date: new Date().toISOString().slice(0, 10), status: 'delivered', ext_key: 'f1' }]) });
  const srv4 = await startServer(dir3, 3914, { SMS_LOG_RETENTION_DAYS: '90' });
  try {
    await sleep(300);
    const live = readJson(dir3, 'sms_log');
    const arch = path.join(dir3, 'archive', 'sms_log_2025-01.json');
    check('A5 old SMS moved out of the live log', live.length === 1 && live[0].message === 'fresh');
    check('A5 old SMS preserved in monthly archive (not deleted)', fs.existsSync(arch) && JSON.parse(fs.readFileSync(arch, 'utf-8')).length === 50);
  } finally { await srv4.stop(); }
}
