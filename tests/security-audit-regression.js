import fs from 'fs';
import { makeFixture, startServer, check, summary } from './lib.js';

const PORT = 4721;

const dir = makeFixture({
  users: [
    { id: 1, username: 'Kamran_Bhatti', password: 'ownerpass1', role: 'Owner', status: 'active', balance: 500 },
    { id: 3, username: 'mgr_one', password: 'mgrpass11', role: 'Manager', status: 'active', balance: 50 },
    { id: 4, username: 'mgr_two', password: 'mgrpass22', role: 'Manager', status: 'active', balance: 50 }
  ],
  agents: [
    { id: 1, username: 'agent_one', password: 'agentpass1', role: 'Agent', manager_id: 3, status: 'active', balance: 25 },
    { id: 2, username: 'agent_direct', password: 'agentpass2', role: 'Agent', manager_id: null, status: 'active', balance: 25 },
    { id: 3, username: 'agent_two', password: 'agentpass3', role: 'Agent', manager_id: 4, status: 'active', balance: 25 }
  ],
  clients: [
    { id: 1, username: 'client_one', password: 'clientpass1', role: 'Client', agent_id: 1, manager_id: 3, status: 'active', balance: 25 },
    { id: 2, username: 'client_two', password: 'clientpass2', role: 'Client', agent_id: 1, manager_id: 3, status: 'active', balance: 25 },
    { id: 3, username: 'client_three', password: 'clientpass3', role: 'Client', agent_id: 2, manager_id: null, status: 'active', balance: 25 }
  ],
  credit_notes: [
    { id: 101, user: 'agent_one', role: 'Agent', amount: 12.5, currency: 'USD', reason: '<script>alert(1)</script>', status: 'confirmed' },
    { id: 102, user: 'agent_two', role: 'Agent', amount: 15, currency: 'USD', reason: 'Note Two', status: 'confirmed' }
  ],
  support_tickets: [
    { id: 201, user: 'agent_one', user_role: 'Agent', subject: 'Help', status: 'open', replies: [] }
  ],
  notifications: [
    { id: 301, message: 'Manager Secret', role: 'Manager', user_id: 3, username: 'mgr_one', read: false },
    { id: 302, message: 'Agent One Notice', role: 'Agent', user_id: 1, username: 'agent_one', read: false }
  ],
  payout_requests: [
    { id: 401, user: 'mgr_one', user_id: 3, role: 'Manager', manager_id: 3, amount: 20, method: 'USDT', wallet: 'T123', status: 'pending' }
  ],
  registration_requests: [
    { id: 501, username: 'pending_user', email: 'p@example.com', requested_role: 'Client', status: 'pending' }
  ],
  sms_log: [
    { id: 601, number: '233500000005', user: 'client_one', client_id: 1, agent_id: 1, manager_id: 3, cli: 'WhatsApp', provider: 'Orange', range_name: 'Ghana', message: 'OTP 112233', profit: 0.01, timestamp: new Date().toISOString(), status: 'DELIVRD' }
  ],
  test_sms_logs: [
    { id: 701, number: '233999000001', cli: 'TestCLI', provider: 'Orange', range_name: 'Ghana', message: 'Test 998877', timestamp: new Date().toISOString() }
  ],
  api_tokens: [
    { id: 801, name: 'ag2-token', token: 'ag2-secret-token-123', agent_id: 3, role: 'Agent', status: 'active', calls: 0 }
  ]
});

const srv = await startServer(dir, PORT);

try {
  // 1. Captcha unconditional + login response hides token + no ?token= URL bypass
  const missingCap = await srv.api('POST', '/api/auth/login', { body: { username: 'Kamran_Bhatti', password: 'ownerpass1' } });
  check('Security: login rejected when captcha missing', missingCap.status === 400);

  const ownerLogin = await srv.login('Kamran_Bhatti', 'ownerpass1');
  check('Security: owner cookie login succeeds with solved captcha', ownerLogin.ok);
  check('Security: token & session_token omitted from login JSON body', !ownerLogin.res.data?.token && !ownerLogin.res.data?.session_token);

  const rawCookieVal = ownerLogin.cookie.split('=')[1];
  const urlLeak = await srv.api('GET', `/api/auth/me?token=${encodeURIComponent(rawCookieVal)}`);
  check('Security: ?token= query auth bypass rejected', urlLeak.status === 401);

  // 2. Per-account lockout across different X-Forwarded-For IPs
  for (let i = 0; i < 5; i++) {
    const capRes = await srv.api('GET', '/api/auth/captcha');
    const m = String(capRes.data.question || '').match(/(\d+)\s*\+\s*(\d+)/);
    await srv.api('POST', '/api/auth/login', {
      headers: { 'X-Forwarded-For': `10.0.0.${i + 10}` },
      body: { username: 'client_two', password: 'wrongpass', captcha_id: capRes.data.id, captcha_answer: String(Number(m[1]) + Number(m[2])) }
    });
  }
  const capResLock = await srv.api('GET', '/api/auth/captcha');
  const mLock = String(capResLock.data.question || '').match(/(\d+)\s*\+\s*(\d+)/);
  const lockedAttempt = await srv.api('POST', '/api/auth/login', {
    headers: { 'X-Forwarded-For': '10.0.0.99' },
    body: { username: 'client_two', password: 'clientpass2', captcha_id: capResLock.data.id, captcha_answer: String(Number(mLock[1]) + Number(mLock[2])) }
  });
  check('Security: per-account lockout enforces 429 even across IPs', lockedAttempt.status === 429);

  // 3. CSRF Origin check on cookie-authenticated POST
  const csrfBad = await srv.api('POST', '/api/settings', {
    cookie: ownerLogin.cookie,
    headers: { Origin: 'https://evil.example' },
    body: { site_name: 'Hacked' }
  });
  check('Security: cross-origin cookie POST blocked with 403', csrfBad.status === 403);

  const mgrLogin = await srv.login('mgr_one', 'mgrpass11');
  const ag1Login = await srv.login('agent_one', 'agentpass1');
  const ag2Login = await srv.login('agent_two', 'agentpass3');
  const cl1Login = await srv.login('client_one', 'clientpass1');

  // 4. Credit notes IDOR + PDF XSS escape
  const cnIdor = await srv.api('GET', '/api/credit-notes/102/pdf', { cookie: ag1Login.cookie });
  check('Security: cross-tenant credit-note PDF blocked (403)', cnIdor.status === 403);
  const cnPdf = await srv.api('GET', '/api/credit-notes/101/pdf', { cookie: ag1Login.cookie });
  check('Security: credit-note PDF escapes <script> tags', cnPdf.status === 200 && typeof cnPdf.data === 'string' && !cnPdf.data.includes('<script>alert(1)</script>') && cnPdf.data.includes('&lt;script&gt;'));

  // 5. Ticket PATCH & Client self-status/2FA PATCH blocked
  const ticketPatch = await srv.api('PATCH', '/api/support-tickets/201', { cookie: ag1Login.cookie, body: { status: 'closed', assigned_to: 'Kamran_Bhatti' } });
  check('Security: non-owner cannot tamper ticket status via PATCH', ticketPatch.status === 403 || ticketPatch.data?.status !== 'closed');
  const clientStatusPatch = await srv.api('PATCH', '/api/clients/1', { cookie: cl1Login.cookie, body: { status: 'suspended', two_fa_enabled: false } });
  check('Security: client cannot self-disable 2FA/status via PATCH', clientStatusPatch.status === 403);

  // 6. Payout self-approval, mass-assignment status, insufficient balance, double-pay -> 409
  const mgrSelfPay = await srv.api('PATCH', '/api/payout-requests/401', { cookie: mgrLogin.cookie, body: { status: 'paid' } });
  check('Security: manager cannot self-approve own payout', mgrSelfPay.status === 403);

  const paidForge = await srv.api('POST', '/api/payout-requests', { cookie: ag1Login.cookie, body: { amount: 15, method: 'USDT', wallet: 'TXYZ', status: 'paid' } });
  check('Security: POST /api/payout-requests forces status pending', paidForge.status === 200 && paidForge.data?.status === 'pending');

  const overdraw = await srv.api('POST', '/api/payout-requests', { cookie: ag1Login.cookie, body: { amount: 9999, method: 'USDT', wallet: 'TXYZ' } });
  check('Security: payout above balance fails safely (400)', overdraw.status === 400);

  const mgrApprove = await srv.api('PATCH', `/api/payout-requests/${paidForge.data.id}`, { cookie: mgrLogin.cookie, body: { status: 'paid' } });
  const doublePay = await srv.api('PATCH', `/api/payout-requests/${paidForge.data.id}`, { cookie: mgrLogin.cookie, body: { status: 'paid' } });
  check('Security: payout request cannot be paid twice (409)', mgrApprove.status === 200 && doublePay.status === 409);

  // 7. Number pool & revoke IDOR
  const agBulkOtherClient = await srv.api('POST', '/api/numbers/bulk-allocate', { cookie: ag1Login.cookie, body: { range_id: 1, count: 1, target_id: 3, target_type: 'client' } });
  const agBulkAgentRole = await srv.api('POST', '/api/numbers/bulk-allocate', { cookie: ag1Login.cookie, body: { range_id: 1, count: 1, target_id: 1, target_type: 'agent' } });
  check('Security: agent blocked from cross-agent or agent-tier bulk-allocate', agBulkOtherClient.status === 403 && agBulkAgentRole.status === 403);

  const crossRevokeNum = await srv.api('POST', '/api/numbers/revoke', { cookie: ag1Login.cookie, body: { number: '233500000008' } });
  const crossRevokeUser = await srv.api('POST', '/api/numbers/revoke', { cookie: ag1Login.cookie, body: { user_id: 3 } });
  check('Security: agent blocked from revoking out-of-scope number or client', crossRevokeNum.status === 403 && crossRevokeUser.status === 403);

  // 8. Notifications header-feed scoping & IDOR & test_sms leak fix
  const clFeed = await srv.api('GET', '/api/notifications/header-feed', { cookie: cl1Login.cookie });
  const hasTestSms = (clFeed.data?.recent_sms || []).some(s => String(s.number).includes('233999000001'));
  const clSmsMasked = (clFeed.data?.recent_sms || []).length > 0 && (clFeed.data?.recent_sms || []).every(s => !s.cli || (s.cli !== 'WhatsApp' && /^[A-Za-z0-9]XXXXX$/.test(s.cli)));
  check('Security: client header-feed excludes test_sms_logs and masks CLI', clFeed.status === 200 && !hasTestSms && clSmsMasked);

  const notifList = await srv.api('GET', '/api/notifications', { cookie: ag1Login.cookie });
  const seesMgrNotif = (notifList.data?.data || []).some(n => n.id === 301);
  const notifIdor = await srv.api('POST', '/api/notifications/301/read', { cookie: ag1Login.cookie, body: {} });
  check('Security: cross-user notifications hidden and mark-read blocked (403)', !seesMgrNotif && notifIdor.status === 403);

  // 9. Registration requests locked to Owner & cli-search masked for Client
  const regLeak = await srv.api('GET', '/api/registration-requests', { cookie: mgrLogin.cookie });
  check('Security: manager blocked from /api/registration-requests (403)', regLeak.status === 403);

  const cliSearch = await srv.api('GET', '/api/cli-search?hours=24', { cookie: cl1Login.cookie });
  const cliExposed = (cliSearch.data?.data || []).some(r => r.cli === 'WhatsApp');
  check('Security: /api/cli-search masks CLI for Client', cliSearch.status === 200 && !cliExposed);

  // 10. SVG upload rejection, orphan report Owner-lock & static traversal check
  const svgUpload = await srv.api('POST', '/api/settings/upload-logo', {
    cookie: ownerLogin.cookie,
    body: { image: 'data:image/svg+xml;base64,' + Buffer.from('<svg onload=alert(1)></svg>').toString('base64') }
  });
  check('Security: SVG data URI rejected on upload-logo', svgUpload.status === 400);

  const orphanNonOwner = await srv.api('GET', '/api/reports/orphans', { cookie: mgrLogin.cookie });
  const traversalProbe = await srv.api('GET', '/static/../../server.js');
  const leakedServerSrc = typeof traversalProbe.data === 'string' && traversalProbe.data.includes('registerPaginatedCrud');
  check('Security: /api/reports/orphans restricted to Owner & static traversal blocked', orphanNonOwner.status === 403 && !leakedServerSrc);

  // 11. /api/sms/viewstats enforces active API token & scopes by agent_id
  const unauthViewStats = await srv.api('GET', '/api/sms/viewstats');
  const ag2ViewStats = await srv.api('GET', '/api/sms/viewstats?token=ag2-secret-token-123');
  const cookieOnlyDenied = await srv.api('GET', '/api/sms/viewstats', { cookie: ag2Login.cookie });
  check(
    'Security: /api/sms/viewstats requires API token and scopes agent_two data',
    unauthViewStats.status === 401 && cookieOnlyDenied.status === 401 && ag2ViewStats.status === 200 && Array.isArray(ag2ViewStats.data?.data) && ag2ViewStats.data.data.length === 0
  );
} finally {
  await srv.stop();
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

process.exit(summary('Security audit regression') ? 0 : 1);
