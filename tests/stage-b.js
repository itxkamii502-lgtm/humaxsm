import { check, makeFixture, startServer, sleep, readJson, ROOT, fs, path } from './lib.js';

export async function stageB() {
  console.log('\n=== STAGE B: hierarchy, holder pool & move ===');
  const dir = makeFixture();
  const srv = await startServer(dir, 3921);
  const { api, login } = srv;

  try {
    const owner = await login('Kamran_Bhatti', 'ownerpass1');
    const mgr1 = await login('mgr_one', 'mgrpass11');
    const mgr2 = await login('mgr_two', 'mgrpass22');
    const agent1 = await login('agent_one', 'agentpass1');
    const agentDir = await login('agent_direct', 'agentpass2');
    const client1 = await login('client_one', 'clientpass1');
    const client2 = await login('client_two', 'clientpass2');

    const ow = (m, u, body) => api(m, u, { cookie: owner.cookie, body });
    const mg = (m, u, body) => api(m, u, { cookie: mgr1.cookie, body });
    const ag = (m, u, body) => api(m, u, { cookie: agent1.cookie, body });
    const cl = (m, u, body) => api(m, u, { cookie: client1.cookie, body });

    // ── B0: Account Creation Rules ──
    // Owner creates ONLY Managers and Agents
    const createMgr = await ow('POST', '/api/users', { username: 'mgr_new', password: 'password123', role: 'Manager' });
    check('B0 Owner can create Manager', createMgr.status === 200 && createMgr.data.username === 'mgr_new');

    const ownerCreateClient = await ow('POST', '/api/users', { username: 'cl_bad', password: 'password123', role: 'Client' });
    check('B0 Owner cannot create Client via /api/users', ownerCreateClient.status >= 400);

    const ownerCreateClientDirect = await ow('POST', '/api/clients', { username: 'cl_bad2', password: 'password123' });
    check('B0 Owner cannot create Client via /api/clients', ownerCreateClientDirect.status === 403);

    const ownerCreateAgent = await ow('POST', '/api/agents', { username: 'agent_by_owner', password: 'password123', manager_id: null });
    check('B0 Owner can create Agent directly', ownerCreateAgent.status === 200 && ownerCreateAgent.data.manager_id === null);

    // Manager creates ONLY Agents
    const mgrCreateAgent = await mg('POST', '/api/agents', { username: 'agent_by_mgr', password: 'password123' });
    check('B0 Manager can create Agent (inherited manager_id)', mgrCreateAgent.status === 200 && Number(mgrCreateAgent.data.manager_id) === 3);

    const mgrCreateClient = await mg('POST', '/api/clients', { username: 'cl_mgr_bad', password: 'password123' });
    check('B0 Manager cannot create Client', mgrCreateClient.status === 403);

    // Agent creates ONLY Clients
    const agentCreateClient = await ag('POST', '/api/clients', { username: 'client_by_agent', password: 'password123' });
    check('B0 Agent can create Client', agentCreateClient.status === 200 && Number(agentCreateClient.data.agent_id) === 1);

    const agentCreateAgent = await ag('POST', '/api/agents', { username: 'ag_ag_bad', password: 'password123' });
    check('B0 Agent cannot create Agent', agentCreateAgent.status === 403);

    // Exactly one Owner
    const fakeOwner = await ow('POST', '/api/users', { username: 'new_owner', password: 'password123', role: 'Owner' });
    check('B0 New Owner cannot be created', fakeOwner.status >= 400);


    // ── B1: Account Deletion & Deactivation Protection ──
    // Agent / Manager may only deactivate / reactivate their own downline, never delete
    const agDelCl = await ag('DELETE', `/api/clients/${agentCreateClient.data.id}`);
    check('B1 Agent cannot delete Client', agDelCl.status === 403);

    const mgDelAg = await mg('DELETE', `/api/agents/${mgrCreateAgent.data.id}`);
    check('B1 Manager cannot delete Agent', mgDelAg.status === 403);

    // Agent deactivates client
    const deactCl = await ag('PATCH', `/api/clients/${agentCreateClient.data.id}`, { status: 'inactive' });
    check('B1 Agent can deactivate Client', deactCl.status === 200 && deactCl.data.status === 'inactive');

    // Deactivated account cannot log in
    const deactLogin = await login('client_by_agent', 'password123');
    check('B1 Deactivated account cannot log in', !deactLogin.ok);

    // Account with history cannot be deleted by Owner unless first deactivated
    // Client 1 has SMS history (from Fixture number 5)
    await api('POST', '/api/sms/inbound', { body: { from: 'Apple', to: '233500000005', message: 'Auth Code 555555', sms_id: 'b1-hist-1' }, headers: { 'x-inbound-token': 'inbound-secret' } });
    await sleep(1800);
    const owDelActiveWithHist = await ow('DELETE', '/api/clients/1');
    check('B1 Owner cannot delete active Client with history', owDelActiveWithHist.status === 400);

    // Deactivate client 1 then delete
    await ow('PATCH', '/api/clients/1', { status: 'inactive' });
    const owDelDeactWithHist = await ow('DELETE', '/api/clients/1');
    check('B1 Owner can delete deactivated Client with history', owDelDeactWithHist.status === 200);

    // Verify SMS history was NOT automatically removed
    const allSmsAfter = readJson(dir, 'sms_log');
    check('B1 Client SMS history kept and never auto-removed', allSmsAfter.some(s => s.message && s.message.includes('555555')));

    // Owner cannot delete Kamran_Bhatti
    const delOwner = await ow('DELETE', '/api/users/1');
    check('B1 Owner cannot delete Kamran_Bhatti', delOwner.status >= 400);


    // ── B2: Number Pools (ONE HOLDER) ──
    // Number 1 is in Owner pool. Owner assigns it to Manager 3.
    const owAssignMgr = await ow('POST', '/api/numbers/1/assign', { target_type: 'manager', target_id: 3 });
    check('B2 Owner assigns number to Manager pool', owAssignMgr.status === 200 && owAssignMgr.data.manager_id === 3 && owAssignMgr.data.agent_id === null);

    // Owner cannot give away number that is now in Manager's pool
    const owAssignAgain = await ow('POST', '/api/numbers/1/assign', { target_type: 'manager', target_id: 4 });
    check('B2 Owner cannot assign number held by Manager', owAssignAgain.status === 400);

    // Manager 3 assigns Number 1 to Agent 1
    const mgAssignAg = await mg('POST', '/api/numbers/1/assign', { target_type: 'agent', target_id: 1 });
    check('B2 Manager assigns number to Agent pool', mgAssignAg.status === 200 && mgAssignAg.data.agent_id === 1 && mgAssignAg.data.client_id === null);

    // Manager cannot assign directly to Client
    const mgAssignClDirect = await mg('POST', '/api/numbers/3/assign', { target_type: 'client', target_id: 2 });
    check('B2 Manager cannot assign directly to Client', mgAssignClDirect.status === 400);

    // Manager 4 cannot assign Manager 3's number
    const mg4 = await login('mgr_two', 'mgrpass22');
    const mg4Assign = await api('POST', '/api/numbers/1/assign', { cookie: mg4.cookie, body: { target_type: 'agent', target_id: 3 } });
    check('B2 Manager cannot assign number outside their pool', mg4Assign.status === 403);

    // Agent 1 assigns Number 1 to Client 2
    const agAssignCl = await ag('POST', '/api/numbers/1/assign', { target_type: 'client', target_id: 2 });
    check('B2 Agent assigns number to Client', agAssignCl.status === 200 && agAssignCl.data.client_id === 2);

    // Owner gives number 2 directly to Agent 2 (manager_id = null)
    const owAssignAgDirect = await ow('POST', '/api/numbers/2/assign', { target_type: 'agent', target_id: 2 });
    check('B2 Owner gives number directly to Agent (manager_id null)', owAssignAgDirect.status === 200 && owAssignAgDirect.data.agent_id === 2 && owAssignAgDirect.data.manager_id === null);


    // ── B3: Unallocate & Return & Recall ──
    // Unallocate: Agent takes number back from Client into Agent pool
    const agUnalloc = await ag('POST', '/api/numbers/1/unassign');
    const num1AfterUnalloc = (readJson(dir, 'numbers')).find(n => n.id === 1);
    check('B3 Agent unallocates number back into Agent pool', agUnalloc.status === 200 && num1AfterUnalloc.client_id === null && num1AfterUnalloc.agent_id === 1);

    // Return: Agent returns Number 1 to Manager 3
    const agReturn = await ag('POST', '/api/numbers/1/return');
    const num1AfterAgReturn = (readJson(dir, 'numbers')).find(n => n.id === 1);
    check('B3 Agent returns number to upstream Manager pool', agReturn.status === 200 && num1AfterAgReturn.agent_id === null && num1AfterAgReturn.manager_id === 3);

    // Manager returns Number 1 to Owner
    const mgReturn = await mg('POST', '/api/numbers/1/return');
    const num1AfterMgReturn = (readJson(dir, 'numbers')).find(n => n.id === 1);
    check('B3 Manager returns number to Owner pool', mgReturn.status === 200 && num1AfterMgReturn.manager_id === null && num1AfterMgReturn.agent_id === null);

    // Owner recalls Manager 4 pool numbers
    const owRecall = await ow('POST', '/api/numbers/recall-manager', { manager_id: 4 });
    const num8 = (readJson(dir, 'numbers')).find(n => n.id === 8);
    check('B3 Owner recalls Manager downward into Owner pool', owRecall.status === 200 && num8.manager_id === null);


    // ── B4: MOVE Number Directly from Client A to Client B ──
    // Fixture Number 5 belongs to Agent 1. We move it from client_one (id 1) to client_two (id 2).
    // Send SMS 1 to client_one BEFORE move
    await api('POST', '/api/sms/inbound', { body: { from: 'Google', to: '233500000005', message: 'Before Move Code 1111', sms_id: 'move-pre-1' }, headers: { 'x-inbound-token': 'inbound-secret' } });
    await sleep(200);

    // Move number 5 to Client 2
    const moveRes = await ag('POST', '/api/numbers/5/move', { to_client_id: 2 });
    check('B4 Agent moves number directly to Client 2', moveRes.status === 200 && moveRes.data.number.client_id === 2);

    // Send SMS 2 on number 5 AFTER move
    await api('POST', '/api/sms/inbound', { body: { from: 'Google', to: '233500000005', message: 'After Move Code 2222', sms_id: 'move-post-1' }, headers: { 'x-inbound-token': 'inbound-secret' } });
    await sleep(200);

    // Verify reports: Client 2 only sees SMS after move
    const cl2Sms = await api('GET', '/api/sms/logs', { cookie: client2.cookie });
    const cl2Messages = ((cl2Sms.data && cl2Sms.data.data) || []).map(s => s.message);
    check('B4 Client 2 gets new SMS after move', cl2Messages.some(m => m && m.includes('2222')));
    check('B4 Client 2 NEVER sees old SMS from before move', !cl2Messages.some(m => m && m.includes('1111')));

    // Owner and Agent see both
    const owSms = await ow('GET', '/api/sms/logs');
    const owMessages = ((owSms.data && owSms.data.data) || []).map(s => s.message);
    check('B4 Owner sees all SMS before and after move', owMessages.some(m => m && m.includes('1111')) && owMessages.some(m => m && m.includes('2222')));


    // ── B5: Unallocated SMS logging ──
    // Number 9 is in Owner pool only (manager_id = null, agent_id = null, client_id = null)
    const unallocSms = await api('POST', '/api/sms/inbound', { body: { from: 'Amazon', to: '233500000009', message: 'Unallocated OTP 999999', sms_id: 'unalloc-1' }, headers: { 'x-inbound-token': 'inbound-secret' } });
    check('B5 Unallocated number SMS is logged successfully', unallocSms.status === 200 && unallocSms.data.logged === true);
    await sleep(200);

    // Logged row has manager_id, agent_id, client_id null
    const latestLog = (readJson(dir, 'sms_log')).find(s => s.message && s.message.includes('999999'));
    check('B5 Unallocated SMS row columns stay empty', latestLog && latestLog.manager_id === null && latestLog.agent_id === null && latestLog.client_id === null);

    // Visible to Owner
    const owLogsAfter = await ow('GET', '/api/sms/logs');
    const owHasUnalloc = ((owLogsAfter.data && owLogsAfter.data.data) || []).some(s => s.message && s.message.includes('999999'));
    check('B5 Unallocated SMS visible to Owner', owHasUnalloc);

    // Hidden from Manager and Agent
    const mgLogsAfter = await mg('GET', '/api/sms/logs');
    const mgHasUnalloc = ((mgLogsAfter.data && mgLogsAfter.data.data) || []).some(s => s.message && s.message.includes('999999'));
    check('B5 Unallocated SMS hidden from Manager', !mgHasUnalloc);

    const agLogsAfter = await ag('GET', '/api/sms/logs');
    const agHasUnalloc = ((agLogsAfter.data && agLogsAfter.data.data) || []).some(s => s.message && s.message.includes('999999'));
    check('B5 Unallocated SMS hidden from Agent', !agHasUnalloc);

  } finally {
    await srv.stop();
  }
}
