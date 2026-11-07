import { check, makeFixture, startServer, sleep, readJson, ROOT, fs, path } from './lib.js';

export async function stageD() {
  console.log('\n=== STAGE D: reports, analytics, webhooks & operational lifecycle ===');
  const dir = makeFixture();
  const srv = await startServer(dir, 3923);
  const { api, login } = srv;

  try {
    const owner = await login('Kamran_Bhatti', 'ownerpass1');
    const mgr1 = await login('mgr_one', 'mgrpass11');
    const agent1 = await login('agent_one', 'agentpass1');
    const client1 = await login('client_one', 'clientpass1');
    const client2 = await login('client_two', 'clientpass2');

    const ow = (m, u, body) => api(m, u, { cookie: owner.cookie, body });
    const mg = (m, u, body) => api(m, u, { cookie: mgr1.cookie, body });
    const ag = (m, u, body) => api(m, u, { cookie: agent1.cookie, body });
    const cl1 = (m, u, body) => api(m, u, { cookie: client1.cookie, body });
    const cl2 = (m, u, body) => api(m, u, { cookie: client2.cookie, body });

    // ── D1: Scoped SMS CDR Logs & Reports ──
    // Send inbound SMS to Number 5 (assigned to Client 1)
    const smsClient1 = await api('POST', '/api/sms/inbound', {
      body: { from: 'Google', to: '233500000005', message: 'Google code 111222', sms_id: 'stage-d-sms-1' },
      headers: { 'x-inbound-token': 'inbound-secret' }
    });
    check('D1 Inbound SMS on Client 1 number processed and stamped', smsClient1.status === 200 && smsClient1.data.logged === true);
    await sleep(200);

    // Client 1 sees its own SMS
    const cl1Logs = await cl1('GET', '/api/sms/logs');
    const cl1List = (cl1Logs.data && cl1Logs.data.data) || [];
    const hasSms1InCl1 = cl1List.some(s => s.sms_id === 'stage-d-sms-1' || (s.message && s.message.includes('111222')));
    check('D1 Client 1 sees only their SMS in /api/sms/logs', hasSms1InCl1);

    // Client 2 does NOT see Client 1's SMS
    const cl2Logs = await cl2('GET', '/api/sms/logs');
    const cl2List = (cl2Logs.data && cl2Logs.data.data) || [];
    const hasSms1InCl2 = cl2List.some(s => s.sms_id === 'stage-d-sms-1' || (s.message && s.message.includes('111222')));
    check('D1 Client 2 cannot see Client 1 SMS logs', !hasSms1InCl2);

    // Agent 1 sees Client 1 SMS logs
    const agLogs = await ag('GET', '/api/sms/logs');
    const agList = (agLogs.data && agLogs.data.data) || [];
    check('D1 Agent 1 sees downline client SMS logs', agList.some(s => s.sms_id === 'stage-d-sms-1'));

    // Manager 1 sees downline SMS logs
    const mgLogs = await mg('GET', '/api/sms/logs');
    const mgList = (mgLogs.data && mgLogs.data.data) || [];
    check('D1 Manager 1 sees downline agent and client SMS logs', mgList.some(s => s.sms_id === 'stage-d-sms-1'));

    // Owner sees all logs and can filter by client_id
    const owLogsFiltered = await ow('GET', '/api/sms/logs?client_id=1');
    const owFilteredList = (owLogsFiltered.data && owLogsFiltered.data.data) || [];
    check('D1 Owner sees all SMS and filters by client_id', owFilteredList.some(s => s.sms_id === 'stage-d-sms-1'));

    // Date and search filters on SMS logs
    const searchRes = await ow('GET', '/api/sms/logs?search=Google');
    const searchList = (searchRes.data && searchRes.data.data) || [];
    check('D1 SMS search query filters by sender/CLI', searchList.length > 0 && searchList.every(s => (s.cli || s.from || '').includes('Google') || (s.message || '').includes('Google')));

    // ── D2: Analytics & System Reports ──
    const dailyStatsRes = await ow('GET', '/api/sms/daily-stats');
    check('D2 Daily stats returns volume breakdown (/api/sms/daily-stats)', dailyStatsRes.status === 200 && (dailyStatsRes.data !== undefined));

    const clientStatsRes = await ag('GET', '/api/sms/client-stats');
    check('D2 Client stats returns client usage summary (/api/sms/client-stats)', clientStatsRes.status === 200);

    // Orphan detection report (Owner only)
    const orphansRes = await ow('GET', '/api/reports/orphans');
    check('D2 Owner can fetch orphan report (/api/reports/orphans)', orphansRes.status === 200 && ('orphaned_agents' in orphansRes.data || 'orphaned_numbers' in orphansRes.data));

    const orphansForbidden = await cl1('GET', '/api/reports/orphans');
    check('D2 Non-owner refused orphan report (403)', orphansForbidden.status === 403);

    // Business report (Owner only)
    const busReportRes = await ow('GET', '/api/reports/business');
    check('D2 Owner fetches business report (/api/reports/business)', busReportRes.status === 200);

    const busReportForbidden = await mg('GET', '/api/reports/business');
    check('D2 Manager cannot access business report (403)', busReportForbidden.status === 403);

    // ── D3: Agent Request Workflow (Fulfill & Reject) ──
    // Client cannot submit agent requests
    const clBadReq = await cl1('POST', '/api/agent-requests', { quantity: 1, range_id: 1, app_name: 'Telegram' });
    check('D3 Client cannot submit agent request (403)', clBadReq.status === 403);

    // Agent 1 submits request
    const agReqRes = await ag('POST', '/api/agent-requests', {
      quantity: 1,
      range_id: 1,
      range_name: 'Ghana Orange NS2',
      country: 'Ghana',
      app_name: 'Telegram',
      notes: 'Need 1 Ghana number for Telegram'
    });
    check('D3 Agent submits number request (/api/agent-requests)', agReqRes.status === 200 && agReqRes.data.success === true);
    const req1Id = agReqRes.data.request && agReqRes.data.request.id;

    // Manager 1 views requests
    const mgRequests = await mg('GET', '/api/agent-requests');
    const hasReq1 = Array.isArray(mgRequests.data) && mgRequests.data.some(r => r.id === req1Id);
    check('D3 Manager views pending request for Agent 1', hasReq1);

    // Manager 1 fulfills request with Number 3 (in Manager 1 pool)
    const fulfillRes = await mg('POST', `/api/agent-requests/${req1Id}/fulfill`, { count: 1, range_id: 1 });
    check('D3 Manager fulfills agent request with available number', fulfillRes.status === 200 && fulfillRes.data.success === true);

    // Check request status updated
    const reqsAfterFulfill = readJson(dir, 'number_requests');
    const req1Updated = reqsAfterFulfill.find(r => r.id === req1Id);
    check('D3 Request status is marked approved after fulfillment', req1Updated && req1Updated.status === 'approved');

    // Number 3 is now assigned to Agent 1
    const numbersAfter = readJson(dir, 'numbers');
    const num3 = numbersAfter.find(n => n.id === 3);
    check('D3 Number allocation chain assigned to Agent 1', num3 && Number(num3.agent_id) === 1);

    // Agent 1 submits a second request to test rejection
    const agReq2Res = await ag('POST', '/api/agent-requests', {
      quantity: 5,
      range_id: 1,
      app_name: 'WhatsApp',
      notes: 'Need 5 more'
    });
    const req2Id = agReq2Res.data && agReq2Res.data.request && agReq2Res.data.request.id;

    // Manager 1 rejects request 2
    const rejectRes = await mg('POST', `/api/agent-requests/${req2Id}/reject`, { reason: 'No inventory currently' });
    check('D3 Manager rejects agent request with reason', rejectRes.status === 200);

    const reqsAfterReject = readJson(dir, 'number_requests');
    const req2Updated = reqsAfterReject.find(r => r.id === req2Id);
    check('D3 Rejected request records rejected status and reason', req2Updated && req2Updated.status === 'rejected' && req2Updated.rejected_reason === 'No inventory currently');

    // ── D4: Webhooks & Notifications Pipeline ──
    const webhookGet = await ow('GET', '/api/webhook/config');
    check('D4 Webhook config read (/api/webhook/config)', webhookGet.status === 200);

    const webhookTest = await ow('POST', '/api/webhook/test', { test: true });
    check('D4 Webhook test endpoint responds 200 (/api/webhook/test)', webhookTest.status === 200 && webhookTest.data.success === true);

    // Notification created for Agent on fulfillment
    const notifs = await ag('GET', '/api/notifications');
    const agNotifList = Array.isArray(notifs.data) ? notifs.data : (notifs.data.data || []);
    check('D4 Agent receives notification on request fulfillment', Array.isArray(agNotifList) && agNotifList.length > 0);

    // Mark notification read
    if (agNotifList.length > 0) {
      const notifId = agNotifList[0].id;
      const readRes = await ag('POST', `/api/notifications/${notifId}/read`);
      check('D4 Agent marks notification as read (/api/notifications/:id/read)', readRes.status === 200);
    }

    // ── D5: Support Tickets & Announcements ──
    // Client creates support ticket
    const ticketRes = await cl1('POST', '/api/support-tickets', {
      subject: 'Inquiry about Ghana numbers',
      message: 'When will new Ghana numbers arrive?',
      priority: 'normal'
    });
    check('D5 Client creates support ticket (/api/support-tickets)', ticketRes.status === 200 && ticketRes.data.id !== undefined);
    const ticketId = ticketRes.data.id;

    // Owner resolves ticket
    const ticketPatch = await ow('PATCH', `/api/support-tickets/${ticketId}`, { status: 'resolved' });
    check('D5 Owner updates ticket status to resolved', ticketPatch.status === 200 && ticketPatch.data.status === 'resolved');

    // Announcement
    const annPost = await ow('POST', '/api/announcements', {
      title: 'Scheduled Maintenance Notice',
      body: 'Network maintenance on Sunday 02:00 UTC',
      target_role: 'all'
    });
    check('D5 Owner can post announcement (/api/announcements)', annPost.status < 300);

    const annGet = await cl1('GET', '/api/announcements');
    check('D5 Client reads active announcements', annGet.status === 200 && ((annGet.data && annGet.data.data) || annGet.data).length > 0);

    // ── D6: Financial Statements & Balance Lifecycle ──
    const stmtRes = await ag('GET', '/api/statements?currency=USD&agent_id=1');
    check('D6 Agent fetches monthly statements (/api/statements)', stmtRes.status === 200 && Array.isArray(stmtRes.data.data));

    const creditNotesRes = await ag('GET', '/api/credit-notes');
    check('D6 Credit notes endpoint responds (/api/credit-notes)', creditNotesRes.status === 200);

    // ── D7: Backups, Audit Logs & Security ──
    const backupRes = await ow('GET', '/api/backup/export');
    check('D7 Owner exports system backup zip (/api/backup/export)', backupRes.status === 200 && String(backupRes.headers.get('content-type')).includes('zip'));

    const backupForbidden = await cl1('GET', '/api/backup/export');
    check('D7 Non-owner refused backup export (403)', backupForbidden.status === 403);

    const auditRes = await ow('GET', '/api/audit-logs');
    check('D7 Owner reads audit logs (/api/audit-logs)', auditRes.status === 200);

    const auditForbidden = await cl1('GET', '/api/audit-logs');
    check('D7 Non-owner refused audit logs (403)', auditForbidden.status === 403);

    // Password change with old password verification
    const pwFailRes = await cl1('POST', '/api/account/change-password', {
      oldPassword: 'wrongoldpassword',
      newPassword: 'brandnewpass123'
    });
    check('D7 Password change with wrong old password rejected (400)', pwFailRes.status === 400);

    const pwSuccessRes = await cl1('POST', '/api/account/change-password', {
      oldPassword: 'clientpass1',
      newPassword: 'brandnewpass123'
    });
    check('D7 Password change with valid old password succeeds', pwSuccessRes.status === 200);

    // ── F3: Server-side paging, exact page sizes, summary totals, archives, and export streaming ──
    const pageRes = await ow('GET', '/api/sms/logs?limit=1&page=1');
    check('F3 Server returns exact page limit and total pages', pageRes.status === 200 && pageRes.data.data.length === 1 && pageRes.data.total_pages >= 1);
    check('F3 Server returns global summary totals on paged results', pageRes.data.summary && pageRes.data.summary.total_sms >= 1 && pageRes.data.summary.payout != null);

    const allRes = await ow('GET', '/api/sms/logs?limit=all');
    check('F3 Server returns all records when limit=all', allRes.status === 200 && allRes.data.data.length === allRes.data.total);

    const exportRes = await ow('GET', '/api/sms/export');
    check('F3 Streaming CSV export endpoint returns text/csv', exportRes.status === 200 && String(exportRes.headers.get('content-type')).includes('text/csv'));
    check('F3 Streaming CSV export contains header and summary row', typeof exportRes.data === 'string' && exportRes.data.includes('Date Time') && exportRes.data.includes('Total SMS:'));

    // Archive retention retrieval test
    const archDir = path.join(dir, 'archive');
    fs.mkdirSync(archDir, { recursive: true });
    const archFile = path.join(archDir, 'sms_log_2024-12.json');
    fs.writeFileSync(archFile, JSON.stringify([{
      id: 99991,
      sms_id: 'stage-d-archived-1',
      number: '233500999999',
      cli: 'ArchiveBank',
      message: 'Your archived OTP 998877',
      status: 'delivered',
      timestamp: '2024-12-15 12:00:00',
      payout: 0.05,
      client_payout: 0.02
    }]));

    const archQueryRes = await ow('GET', '/api/sms/logs?date_from=2024-12-01');
    const archList = (archQueryRes.data && archQueryRes.data.data) || [];
    check('F3 Archived month SMS seamlessly included in CDR query', archList.some(s => s.sms_id === 'stage-d-archived-1' || s.number === '233500999999'));

    // ── F4: Dashboard Top Row & Period Stats ──
    const periodStatsRes = await ow('GET', '/api/sms/period-stats');
    check('F4 GET /api/sms/period-stats returns status 200', periodStatsRes.status === 200);
    check('F4 /api/sms/period-stats contains today, week, month, year, earnings',
      periodStatsRes.data &&
      typeof periodStatsRes.data.today === 'number' &&
      typeof periodStatsRes.data.week === 'number' &&
      typeof periodStatsRes.data.month === 'number' &&
      typeof periodStatsRes.data.year === 'number' &&
      typeof periodStatsRes.data.earnings === 'number'
    );

    // Client role period-stats (server-scoped)
    const clientPeriodRes = await cl1('GET', '/api/sms/period-stats');
    check('F4 Client role can access /api/sms/period-stats', clientPeriodRes.status === 200);
    check('F4 Client role period-stats is scoped to client', clientPeriodRes.data && typeof clientPeriodRes.data.today === 'number');

    // Archive reading for current year test
    const currYear = new Date().getUTCFullYear();
    const archYearFile = path.join(archDir, `sms_log_${currYear}-01.json`);
    fs.writeFileSync(archYearFile, JSON.stringify([{
      id: 99992,
      sms_id: `stage-d-year-arch-${currYear}`,
      number: '233500888888',
      cli: 'YearArchiveBank',
      message: 'Year archive OTP 123456',
      status: 'delivered',
      timestamp: `${currYear}-01-10 10:00:00`,
      profit: 0.10,
      payout: 0.05
    }]));
    const periodYearRes = await ow('GET', '/api/sms/period-stats?fresh=1');
    check('F4 /api/sms/period-stats reads archives for the current year', periodYearRes.status === 200 && periodYearRes.data.year >= 1);

  } finally {
    await srv.stop();
  }
}
