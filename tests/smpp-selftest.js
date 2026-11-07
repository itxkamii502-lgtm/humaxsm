import { check, makeFixture, startServer, sleep, readJson, summary } from './lib.js';
import smpp from 'smpp';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import net from 'net';

console.log('\n=== SMPP Self-Test: Server listener, Client bind & submit_sm ===');

const dir = makeFixture();
const testPass = 'testsecret123';
const testHash = bcrypt.hashSync(testPass, 10);
const testSysId = 'carrier_test_1';
const smppPort = 3875;

// Configure settings to enable SMPP on port 3875
const settings = readJson(dir, 'settings') || {};
settings.smpp_enabled = true;
settings.smpp_host = '127.0.0.1';
settings.smpp_port = smppPort;

// Configure smpp_accounts with a server account
const smppAccounts = [
  {
    id: 1,
    company: 'TestCarrier',
    interconnect_type: 'smpp',
    system_id: testSysId,
    password_hash: testHash,
    status: 'active',
    bind_type: 'transceiver',
    max_connections: 10,
    max_mps: 100
  }
];

fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(settings, null, 2));
fs.writeFileSync(path.join(dir, 'smpp_accounts.json'), JSON.stringify(smppAccounts, null, 2));

const srv = await startServer(dir, 3935, { SMPP_PORT: String(smppPort), SMPP_HOST: '127.0.0.1' });

let allOk = true;

try {
  const owner = await srv.login('Kamran_Bhatti', 'ownerpass1');
  const ow = (method, url, opts = {}) => srv.api(method, url, { cookie: owner.cookie, ...opts });

  // 1. Verify /api/smpp/server-info reports listening=true
  const infoRes = await ow('GET', '/api/smpp/server-info');
  check('SMPP Server reports listening=true and port ' + smppPort,
    infoRes.status === 200 && infoRes.data.listening === true && Number(infoRes.data.port) === smppPort);

  // 2. Connect client and bind
  let sessionBound = false;
  let pduRespStatus = -1;
  let submitRespId = null;

  const session = smpp.connect({
    url: `smpp://127.0.0.1:${smppPort}`
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SMPP bind timed out after 8s')), 8000);
    session.bind_transceiver({
      system_id: testSysId,
      password: testPass
    }, (pdu) => {
      clearTimeout(timer);
      pduRespStatus = pdu.command_status;
      if (pdu.command_status === 0) {
        sessionBound = true;
        resolve();
      } else {
        reject(new Error('Bind failed with status: ' + pdu.command_status));
      }
    });
  });

  check('SMPP Client binds successfully to server (status 0)', sessionBound && pduRespStatus === 0);

  // 3. Verify session appears in /api/smpp/sessions
  const sessRes = await ow('GET', '/api/smpp/sessions');
  const foundSess = (sessRes.data || []).find(s => s.system_id === testSysId);
  check('Active session visible in /api/smpp/sessions', Boolean(foundSess));

  // 4. Send submit_sm
  const testNumber = '233500000001';
  const testMsg = 'Test OTP code: 987654 via SMPP';
  const testCli = 'SMPPCARRIER';

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('submit_sm timed out after 8s')), 8000);
    session.submit_sm({
      source_addr: testCli,
      destination_addr: testNumber,
      short_message: testMsg
    }, (pdu) => {
      clearTimeout(timer);
      if (pdu.command_status === 0) {
        submitRespId = pdu.message_id;
        resolve();
      } else {
        reject(new Error('submit_sm failed with status: ' + pdu.command_status));
      }
    });
  });

  check('submit_sm returns success with message_id', submitRespId !== null && submitRespId !== undefined);

  // Short delay for ingest processing and persistence
  await sleep(300);

  // 5. Assert that message arrives in sms_log
  const smsLog = readJson(dir, 'sms_log') || [];
  const logged = smsLog.find(s => s.number === testNumber && s.message === testMsg);
  check('Message arrived in sms_log with correct number and text', Boolean(logged));
  if (logged) {
    check('Message company is set to account company (TestCarrier)', logged.company === 'TestCarrier');
  }

  // 6. Verify smpp_logs.json has bind_ok event
  const smppLogs = readJson(dir, 'smpp_logs') || [];
  const bindLog = smppLogs.find(l => l.event === 'bind_ok');
  check('smpp_logs.json records bind_ok event', Boolean(bindLog));

  // 7. Verify real throughput endpoint
  const tpRes = await ow('GET', '/api/smpp/throughput');
  check('GET /api/smpp/throughput returns current_mps, peak_mps >= 1 and limit',
    tpRes.status === 200 && tpRes.data.peak_mps >= 1 && tpRes.data.limit > 0);

  // 8. Cleanly unbind and close session
  await new Promise(r => {
    session.unbind(() => {
      session.close();
      r();
    });
  });

  await sleep(150);

  // 9. Session should be removed on close
  const sessAfterClose = await ow('GET', '/api/smpp/sessions');
  const stillThere = (sessAfterClose.data || []).some(s => s.system_id === testSysId);
  check('Session removed from /api/smpp/sessions after unbind/close', !stillThere);

  // 10. Port collision: verify server never crashes on failed port bind
  const dummyServer = net.createServer().listen(3899, '127.0.0.1');
  await new Promise(r => dummyServer.on('listening', r));

  await ow('POST', '/api/settings', { body: { smpp_host: '127.0.0.1', smpp_port: 3899, smpp_enabled: true } });
  await sleep(400);

  const errorInfoRes = await ow('GET', '/api/smpp/server-info');
  check('Port conflict sets status=error and records last_error without crashing',
    errorInfoRes.status === 200 && errorInfoRes.data.listening === false && Boolean(errorInfoRes.data.last_error),
    JSON.stringify(errorInfoRes.data));

  dummyServer.close();

  // Verify server is alive and can restore to a valid port
  await ow('POST', '/api/settings', { body: { smpp_host: '127.0.0.1', smpp_port: 3876, smpp_enabled: true } });
  await sleep(400);
  const recoveredInfo = await ow('GET', '/api/smpp/server-info');
  check('SMPP server recovers when switched to valid port 3876',
    recoveredInfo.status === 200 && recoveredInfo.data.listening === true && Number(recoveredInfo.data.port) === 3876);

} catch (err) {
  console.error('Test error:', err);
  allOk = false;
} finally {
  await srv.stop();
}

const passed = summary('SMPP SELF-TEST') && allOk;
process.exit(passed ? 0 : 1);
