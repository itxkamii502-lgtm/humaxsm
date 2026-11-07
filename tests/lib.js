// Test helpers: start the REAL server.js on an isolated copy of the data folder and talk to it over HTTP.
// Usage: node tests/verify-rules.js   (needs the normal `npm install` dependencies)
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const results = [];
export function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : (extra ? '  -> ' + extra : '')}`);
}
export function summary(title = '') {
  const bad = results.filter(r => !r.ok);
  console.log(`\n${title} ${results.length - bad.length}/${results.length} passed${bad.length ? ' — FAILED: ' + bad.map(b => b.name).join('; ') : ''}`);
  return bad.length === 0;
}

export function makeFixture(overrides = {}) {
  const src = path.join(ROOT, 'Alpha SMS', 'data');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-test-'));
  for (const f of fs.readdirSync(src)) { const sp = path.join(src, f); if (fs.statSync(sp).isFile()) fs.copyFileSync(sp, path.join(dir, f)); }
  const W = (n, v) => fs.writeFileSync(path.join(dir, n + '.json'), JSON.stringify(v));
  const now = new Date().toISOString();
  W('users', [
    { id: 1, username: 'Kamran_Bhatti', password: 'ownerpass1', role: 'Owner', status: 'active', created: now },
    { id: 3, username: 'mgr_one', password: 'mgrpass11', role: 'Manager', status: 'active', created: now },
    { id: 4, username: 'mgr_two', password: 'mgrpass22', role: 'Manager', status: 'active', created: now }
  ]);
  W('agents', [
    { id: 1, username: 'agent_one', password: 'agentpass1', role: 'Agent', manager_id: 3, status: 'active', created: now },
    { id: 2, username: 'agent_direct', password: 'agentpass2', role: 'Agent', manager_id: null, status: 'active', created: now },
    { id: 3, username: 'agent_two', password: 'agentpass3', role: 'Agent', manager_id: 4, status: 'active', created: now }
  ]);
  W('clients', [
    { id: 1, username: 'client_one', password: 'clientpass1', role: 'Client', agent_id: 1, manager_id: 3, status: 'active', created: now },
    { id: 2, username: 'client_two', password: 'clientpass2', role: 'Client', agent_id: 1, manager_id: 3, status: 'active', created: now },
    { id: 3, username: 'client_three', password: 'clientpass3', role: 'Client', agent_id: 2, manager_id: null, status: 'active', created: now }
  ]);
  W('testpanel_credentials', [{ id: 1, username: 'test123', password: 'test123', role: 'TestPanel', status: 'active', created: now }]);
  const mk = (id, number, extra = {}) => ({ id, number: String(number), country: 'Ghana', provider: 'Orange', range_id: 1, range_name: 'Ghana Orange NS2', status: 'active', manager_id: null, agent_id: null, client_id: null, user: '', created: now, ...extra });
  W('numbers', [
    mk(1, '233500000001'), mk(2, '233500000002'), mk(3, '233500000003', { manager_id: 3, status: 'assigned' }),
    mk(4, '233500000004', { manager_id: 3, agent_id: 1, status: 'assigned' }),
    mk(5, '233500000005', { manager_id: 3, agent_id: 1, client_id: 1, status: 'assigned', user: 'client_one' }),
    mk(6, '233500000006', { manager_id: null, agent_id: 2, status: 'assigned' }),
    mk(7, '233500000007', { manager_id: null, agent_id: 2, client_id: 3, status: 'assigned', user: 'client_three' }),
    mk(8, '233500000008', { manager_id: 4, status: 'assigned' }),
    mk(9, '233500000009'), mk(10, '233500000010')
  ]);
  W('sms_ranges', [{ id: 1, range_name: 'Ghana Orange NS2', name: 'Ghana Orange NS2', country: 'Ghana', provider: 'Orange', prefix: '233', cost: 0.02, payout: 0.01, currency: 'USD' }]);
  W('test_numbers', [{ id: 1, number: '233999000001', country: 'Ghana', provider: 'Orange', range_id: 1, range_name: 'Ghana Orange NS2' }]);
  for (const f of ['sms_log', 'test_sms_logs', 'audit_logs', 'api_tokens', 'notifications', 'number_transfers', 'allocation_history', 'sessions']) W(f, []);
  try { fs.rmSync(path.join(dir, 'sessions'), { recursive: true, force: true }); } catch (e) { /* ignore */ }
  fs.writeFileSync(path.join(dir, 'sms_log.journal.ndjson'), '');
  for (const [name, val] of Object.entries(overrides)) W(name, val);
  return dir;
}

export async function startServer(dir, port, env = {}) {
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dir, INBOUND_TOKEN: 'inbound-secret', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', d => { log += d; }); child.stderr.on('data', d => { log += d; });
  await new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (log.includes('Server running')) { clearInterval(iv); resolve(); }
      else if (child.exitCode !== null || child.signalCode !== null || Date.now() - t0 > 15000) { clearInterval(iv); reject(new Error('server did not start:\n' + log.slice(-1500))); }
    }, 100);
  });
  const base = `http://127.0.0.1:${port}`;
  const api = async (method, url, { body, cookie, headers = {} } = {}) => {
    const res = await fetch(base + url, { method, redirect: 'manual', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    let data = null; const txt = await res.text(); try { data = JSON.parse(txt); } catch (e) { data = txt; }
    return { status: res.status, data, headers: res.headers };
  };
  const login = async (username, password) => {
    const r = await api('POST', '/api/auth/login', { body: { username, password } });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    const tok = sc.map(c => c.split(';')[0]).find(c => c.startsWith('alpha_session_token='));
    return { ok: r.status === 200 && !!tok, cookie: tok || '', res: r };
  };
  const stop = () => new Promise(res => { if (child.exitCode !== null || child.signalCode !== null) return res(); child.on('exit', () => res()); child.kill('SIGKILL'); });
  const stopGracefully = () => new Promise(res => { if (child.exitCode !== null || child.signalCode !== null) return res(); child.on('exit', () => res()); child.kill('SIGTERM'); });
  return { api, login, stop, stopGracefully, dir, base, getLog: () => log };
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const readJson = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf-8'));
export { ROOT, fs, path };
