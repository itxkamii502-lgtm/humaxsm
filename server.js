import express from 'express';
import compression from 'compression';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import net from 'net';
import multer from 'multer';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const smpp = require('smpp');

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ── Rate Limiting Helper ───────────────────────────────────────
const rateLimitBuckets = new Map();
function isRateLimited(key, limit, windowMs) {
  const now = Date.now();
  let bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 1 };
    rateLimitBuckets.set(key, bucket);
    return false;
  }
  bucket.count++;
  return bucket.count > limit;
}

// ── Strict Number Allocation Mutex / Serialization Lock ────────
let allocationLockQueue = Promise.resolve();
function withAllocationLock(fn) {
  const result = allocationLockQueue.then(() => fn());
  allocationLockQueue = result.catch(() => {});
  return result;
}

// ── Secure Recipient-Filtered WebSocket Broadcast ──────────────
function broadcastWs(data, targetFilter = null) {
  try {
    let payload = data;
    if (data && data.type === 'otp' && data.data) {
      payload = {
        type: 'otp',
        ...data.data,
        data: data.data
      };
    }
    const msg = JSON.stringify(payload);
    wss.clients.forEach(client => {
      if (client.readyState !== 1) return;
      
      // Unauthenticated sockets do NOT receive private system events
      if (!client.user) {
        if (data.type === 'heartbeat' || data.type === 'connected') {
          client.send(msg);
        }
        return;
      }

      const u = client.user;
      const uRole = (u.role || '').toLowerCase();
      const isOwner = uRole === 'owner' || uRole === 'admin';

      if (typeof targetFilter === 'function') {
        if (isOwner || targetFilter(u)) {
          client.send(msg);
        }
        return;
      }

      // Event-type based privacy routing
      if (data.type === 'otp') {
        const recipientUser = String(payload.user || payload.client_username || payload.client_name || '').toLowerCase();
        const recipientClientId = Number(payload.client_id);
        const recipientAgentId = Number(payload.agent_id);
        const recipientManagerId = Number(payload.manager_id);

        if (isOwner) {
          client.send(msg);
        } else if (u.role === 'Manager' && recipientManagerId && Number(u.id) === recipientManagerId) {
          client.send(msg);
        } else if (u.role === 'Agent' && recipientAgentId && Number(u.id) === recipientAgentId) {
          client.send(msg);
        } else if (u.role === 'Client' && ((recipientClientId && Number(u.id) === recipientClientId) || (recipientUser && u.username.toLowerCase() === recipientUser))) {
          client.send(msg);
        }
        return;
      }

      if (data.type === 'agent_number_request') {
        const mgrId = data.data && Number(data.data.manager_id);
        if (isOwner || (u.role === 'Manager' && mgrId && Number(u.id) === mgrId)) {
          client.send(msg);
        }
        return;
      }

      if (data.type === 'agent_request_updated') {
        const agId = data.data && Number(data.data.agent_id);
        const mgrId = data.data && Number(data.data.manager_id);
        if (isOwner || (u.role === 'Agent' && agId && Number(u.id) === agId) || (u.role === 'Manager' && mgrId && Number(u.id) === mgrId)) {
          client.send(msg);
        }
        return;
      }

      if (data.type === 'notification') {
        const notif = data.notification || data.data || data;
        const targetRole = String(notif.recipient_role || '').toLowerCase();
        const targetId = notif.recipient_id ? Number(notif.recipient_id) : null;
        const targetUsername = String(notif.recipient_username || '').toLowerCase();

        if (isOwner) {
          client.send(msg);
        } else if (targetRole === 'all') {
          client.send(msg);
        } else if (targetId && Number(u.id) === targetId && (targetRole === uRole || !targetRole)) {
          client.send(msg);
        } else if (targetUsername && u.username.toLowerCase() === targetUsername) {
          client.send(msg);
        } else if (targetRole && uRole === targetRole && !targetId && !targetUsername) {
          client.send(msg);
        }
        return;
      }

      // Safe non-sensitive events
      if (['heartbeat', 'connected', 'brand_theme_updated'].includes(data.type)) {
        client.send(msg);
      }
    });
  } catch (e) {
    console.error('broadcastWs error:', e);
  }
}

// ── Secure Password Hashing & Verification ─────────────────────
function hashPassword(plain) {
  if (!plain) return '';
  return bcrypt.hashSync(String(plain), 10);
}

function verifyPassword(plain, stored) {
  if (!plain || !stored) return false;
  const s = String(stored).trim();
  const p = String(plain).trim();
  if (s.startsWith('$2a$') || s.startsWith('$2b$')) {
    return bcrypt.compareSync(p, s);
  }
  // Safe migration fallback: verify against plaintext once
  return p === s;
}

const portArgIdx = process.argv.indexOf('--port');
const portFromArg = portArgIdx !== -1 && process.argv[portArgIdx + 1] ? Number(process.argv[portArgIdx + 1]) : null;
const envPort = Number(process.env.PORT);
const PORT = portFromArg || (envPort && envPort !== 8080 ? envPort : 3000);
const HUMEX_DIR = fs.existsSync(path.join(__dirname, 'humex-sms')) ? path.join(__dirname, 'humex-sms') : path.join(__dirname, 'Alpha SMS');
const ALPHA_DIR = HUMEX_DIR;
const RTX_DIR = ALPHA_DIR; // backward compatibility
const STATIC_DIR = path.join(ALPHA_DIR, 'static');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ALPHA_DIR, 'data');
const AGENT_FILES_DIR = path.join(DATA_DIR, 'agent_files');
console.log(`[BOOT] Resolved APP_DIR:  ${HUMEX_DIR}`);
console.log(`[BOOT] Resolved DATA_DIR: ${DATA_DIR}`);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(AGENT_FILES_DIR)) {
  fs.mkdirSync(AGENT_FILES_DIR, { recursive: true });
}

// ── Database Helpers ──────────────────────────────────────────
const DB_CACHE = new Map();
const DB_MTIME = new Map();

// SMS log persistence: every SMS is appended to a crash-safe journal immediately, the big
// sms_log.json is rewritten in the background (debounced, atomic). Nothing is lost on a crash.
const SMS_JOURNAL = path.join(DATA_DIR, 'sms_log.journal.ndjson');
const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');
const META_FILE = path.join(DATA_DIR, 'meta.json');
const SMS_RETENTION_DAYS = Number(process.env.SMS_LOG_RETENTION_DAYS) || 90;
const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(path.dirname(DATA_DIR), 'backups');
const debounceTimers = new Map();
function readMeta() { try { return JSON.parse(fs.readFileSync(META_FILE, 'utf-8')) || {}; } catch (e) { return {}; } }
function writeMeta(m) { try { fs.writeFileSync(META_FILE + '.tmp', JSON.stringify(m)); fs.renameSync(META_FILE + '.tmp', META_FILE); } catch (e) { console.error('meta write error', e.message); } }

function readDb(name) {
  try {
    const filePath = path.join(DATA_DIR, `${name}.json`);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const stat = fs.statSync(filePath);
    const lastMtime = DB_MTIME.get(name);
    if (DB_CACHE.has(name) && lastMtime && stat.mtimeMs <= lastMtime) {
      return DB_CACHE.get(name);
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw || !raw.trim()) {
      return [];
    }
    const data = JSON.parse(raw);
    if (name === 'sms_ranges' && Array.isArray(data)) {
      data.forEach(r => {
        const rn = r.range_name || r.name || r.country || 'Range';
        r.range_name = rn;
        r.name = rn;
      });
    }
    DB_CACHE.set(name, data);
    DB_MTIME.set(name, stat.mtimeMs);
    return data;
  } catch (err) {
    console.error(`Error reading ${name}.json:`, err);
    return [];
  }
}

function writeDb(name, data) {
  try {
    const filePath = path.join(DATA_DIR, `${name}.json`);
    const tmpPath = path.join(DATA_DIR, `${name}.tmp.json`);
    const jsonStr = (name === 'sms_log' || name === 'test_sms_logs')
      ? JSON.stringify(data)
      : JSON.stringify(data, null, 2);
    fs.writeFileSync(tmpPath, jsonStr, 'utf-8');
    fs.renameSync(tmpPath, filePath);
    DB_CACHE.set(name, data);
    DB_MTIME.set(name, Date.now());
    if (name === 'sms_log') {
      // everything in the journal is now inside sms_log.json
      try { fs.writeFileSync(SMS_JOURNAL, ''); } catch (e) { /* ignore */ }
      const t = debounceTimers.get('sms_log'); if (t) { clearTimeout(t); debounceTimers.delete('sms_log'); }
    }
    return true;
  } catch (err) {
    console.error(`Error writing ${name}.json:`, err);
    return false;
  }
}

function nextId(data) {
  if (!Array.isArray(data) || data.length === 0) return 1;
  let max = 0;
  for (let i = 0; i < data.length; i++) {
    const n = Number(data[i] && data[i].id);
    if (Number.isFinite(n) && n > 0 && n > max) max = n;
  }
  return max + 1;
}

// Debounced background write (always writes whatever is current in the cache at flush time)
const DB_FLUSH_MS = process.env.DATA_DIR ? 50 : 1500;
function debouncedWriteDb(name, ms = DB_FLUSH_MS) {
  if (debounceTimers.has(name)) return;
  const t = setTimeout(() => { debounceTimers.delete(name); const cur = DB_CACHE.get(name); if (cur) writeDb(name, cur); }, ms);
  if (t.unref) t.unref();
  debounceTimers.set(name, t);
}
function flushPendingWrites() {
  for (const [name, t] of Array.from(debounceTimers.entries())) { clearTimeout(t); debounceTimers.delete(name); const cur = DB_CACHE.get(name); if (cur) writeDb(name, cur); }
}

// ── High-Performance Indexed In-Memory Lookup for Numbers & Ingestion ──
let CACHED_NUMBERS_BY_DIGITS = null;
let CACHED_NUMBERS_BY_RAW = null;
let CACHED_NUMBERS_MTIME = 0;

function getIndexedNumbers() {
  const currentMtime = DB_MTIME.get('numbers') || 0;
  if (!CACHED_NUMBERS_BY_DIGITS || CACHED_NUMBERS_MTIME !== currentMtime) {
    const numbers = readDb('numbers') || [];
    const byDigits = new Map();
    const byRaw = new Map();
    for (let i = 0; i < numbers.length; i++) {
      const n = numbers[i];
      if (!n) continue;
      const raw = String(n.number || '').trim();
      const d = raw.replace(/\D/g, '');
      if (raw && !byRaw.has(raw)) byRaw.set(raw, n);
      if (d && !byDigits.has(d)) byDigits.set(d, n);
    }
    CACHED_NUMBERS_BY_DIGITS = byDigits;
    CACHED_NUMBERS_BY_RAW = byRaw;
    CACHED_NUMBERS_MTIME = currentMtime;
  }
  return { byDigits: CACHED_NUMBERS_BY_DIGITS, byRaw: CACHED_NUMBERS_BY_RAW };
}

let CACHED_TEST_NUMBERS_MAP = null;
let CACHED_TEST_NUMBERS_MTIME = 0;

function getIndexedTestNumbers() {
  const currentMtime = DB_MTIME.get('test_numbers') || 0;
  if (!CACHED_TEST_NUMBERS_MAP || CACHED_TEST_NUMBERS_MTIME !== currentMtime) {
    const list = readDb('test_numbers') || [];
    const byNum = new Map();
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item) continue;
      const raw = String(item.number || '').trim();
      if (raw) byNum.set(raw, item);
    }
    CACHED_TEST_NUMBERS_MAP = byNum;
    CACHED_TEST_NUMBERS_MTIME = currentMtime;
  }
  return CACHED_TEST_NUMBERS_MAP;
}

// SMS id counter (persisted, never recomputed from a huge array on every SMS)
let smsLastId = null;
function nextSmsId(log) {
  if (smsLastId === null) {
    smsLastId = Number(readMeta().sms_last_id) || 0;
    for (let i = 0; i < log.length; i++) { const n = Number(log[i] && log[i].id) || 0; if (n > smsLastId) smsLastId = n; }
  }
  smsLastId += 1;
  if (smsLastId % 50 === 0) { const m = readMeta(); m.sms_last_id = smsLastId; writeMeta(m); }
  return smsLastId;
}
// Duplicate detection index (sms_id / ext_key) – rebuilt only if the array changed from outside
const smsIdx = { set: new Set(), len: -1, ref: null };
function smsIndexSync(log) {
  if (smsIdx.ref !== log || smsIdx.len !== log.length) {
    smsIdx.set = new Set();
    for (let i = 0; i < log.length; i++) { const r = log[i]; if (!r) continue; if (r.ext_key) smsIdx.set.add('k:' + r.ext_key); if (r.sms_id) smsIdx.set.add('i:' + r.sms_id); }
    smsIdx.ref = log; smsIdx.len = log.length;
  }
}
function smsIndexHas(log, dedupeKey, smsId) {
  smsIndexSync(log);
  return (dedupeKey && smsIdx.set.has('k:' + dedupeKey)) || (smsId && smsIdx.set.has('i:' + smsId));
}
const periodStatsCache = new Map();
function appendSmsLog(entry, log) {
  smsIndexSync(log);
  log.unshift(entry);
  smsIdx.len = log.length;
  if (entry.ext_key) smsIdx.set.add('k:' + entry.ext_key);
  if (entry.sms_id) smsIdx.set.add('i:' + entry.sms_id);
  periodStatsCache.clear();
  try { fs.appendFileSync(SMS_JOURNAL, JSON.stringify(entry) + '\n'); } catch (e) { console.error('SMS journal error:', e.message); }
  debouncedWriteDb('sms_log');
}
function recoverSmsJournal() {
  try {
    if (!fs.existsSync(SMS_JOURNAL)) return;
    const lines = fs.readFileSync(SMS_JOURNAL, 'utf-8').split('\n').filter(Boolean);
    if (!lines.length) return;
    const log = readDb('sms_log') || [];
    const have = new Set(log.map(r => r && r.id));
    let added = 0;
    for (const ln of lines) {
      let r; try { r = JSON.parse(ln); } catch (e) { continue; }
      if (!r || have.has(r.id)) continue;
      log.unshift(r); have.add(r.id); added++;
    }
    log.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    writeDb('sms_log', log);
    if (added) console.log(`[HUMEX SMS] Recovered ${added} SMS from journal`);
  } catch (e) { console.error('Journal recovery error:', e); }
}
// Retention: rows older than SMS_RETENTION_DAYS move to data/archive/sms_log_YYYY-MM.json (never deleted)
function rotateSmsLog() {
  try {
    const log = readDb('sms_log');
    if (!Array.isArray(log) || !log.length) return;
    const cutoff = Date.now() - SMS_RETENTION_DAYS * 86400000;
    const keep = [], groups = new Map();
    for (const r of log) {
      const t = Date.parse(r && (r.timestamp || r.date));
      if (isFinite(t) && t < cutoff) { const k = new Date(t).toISOString().slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
      else keep.push(r);
    }
    if (!groups.size) return;
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    for (const [month, rows] of groups) {
      const f = path.join(ARCHIVE_DIR, `sms_log_${month}.json`);
      let ex = []; try { ex = JSON.parse(fs.readFileSync(f, 'utf-8')); } catch (e) { ex = []; }
      const ids = new Set(ex.map(r => r.id)); for (const r of rows) if (!ids.has(r.id)) ex.push(r);
      ex.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
      fs.writeFileSync(f + '.tmp', JSON.stringify(ex)); fs.renameSync(f + '.tmp', f);
    }
    writeDb('sms_log', keep); // only after every archive file is safely written
    console.log(`[HUMEX SMS] Archived ${log.length - keep.length} old SMS rows`);
  } catch (e) { console.error('SMS rotation error:', e); }
}
// Current log + archives (for payments / long reports)
const archiveFileCache = new Map();
function readArchivedJsonCached(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const cached = archiveFileCache.get(filePath);
    if (cached && cached.mtime === stat.mtimeMs) {
      return cached.data;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const data = Array.isArray(parsed) ? parsed : [];
    archiveFileCache.set(filePath, { mtime: stat.mtimeMs, data });
    return data;
  } catch (e) {
    return [];
  }
}

function readSmsWithArchive(fromDate) {
  const current = readDb('sms_log') || [];
  let archiveFiles = [];
  try {
    if (fs.existsSync(ARCHIVE_DIR)) {
      const fromMonth = fromDate ? String(fromDate).slice(0, 7) : '0000-00';
      const files = fs.readdirSync(ARCHIVE_DIR);
      archiveFiles = files.filter(f => {
        const m = /^sms_log_(\d{4}-\d{2})\.json$/.exec(f);
        return m && m[1] >= fromMonth;
      });
    }
  } catch (e) { /* ignore */ }

  if (!archiveFiles.length) {
    return current;
  }

  const out = current.slice();
  const seenIds = new Set();
  for (let i = 0; i < current.length; i++) {
    const r = current[i];
    if (r && r.id != null) seenIds.add(String(r.id));
  }
  for (const f of archiveFiles) {
    const archived = readArchivedJsonCached(path.join(ARCHIVE_DIR, f));
    for (let i = 0; i < archived.length; i++) {
      const r = archived[i];
      const idStr = r && r.id != null ? String(r.id) : null;
      if (!idStr || !seenIds.has(idStr)) {
        if (idStr) seenIds.add(idStr);
        out.push(r);
      }
    }
  }
  return out;
}
// Real traffic counters (no random numbers)
const recentSmsTs = [];
function noteSmsArrival() { const now = Date.now(); recentSmsTs.push(now); while (recentSmsTs.length && recentSmsTs[0] < now - 60000) recentSmsTs.shift(); }

let CACHED_SAMPLE_LOG = null;
let CACHED_SAMPLE_MTIME = 0;
let CACHED_SAMPLE_RATE = 0;

function liveTrafficStats() {
  const now = Date.now(); while (recentSmsTs.length && recentSmsTs[0] < now - 60000) recentSmsTs.shift();
  const last10 = recentSmsTs.filter(t => t >= now - 10000).length;
  const mtime = DB_MTIME.get('sms_log') || 0;
  if (!CACHED_SAMPLE_LOG || CACHED_SAMPLE_MTIME !== mtime) {
    const log = readDb('sms_log') || [];
    const sample = log.slice(0, 200);
    CACHED_SAMPLE_RATE = sample.length ? Math.round(sample.filter(r => r.status === 'delivered').length / sample.length * 100) : 0;
    CACHED_SAMPLE_LOG = sample;
    CACHED_SAMPLE_MTIME = mtime;
  }
  return { mps: Math.round(last10 / 10 * 10) / 10, per_minute: recentSmsTs.length, success_rate: CACHED_SAMPLE_RATE, dlr: CACHED_SAMPLE_RATE };
}
function newSecretToken(prefix = 'tok_') { return prefix + crypto.randomBytes(24).toString('hex'); }
function sha256Hex(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function findTokenRecord(tokens, raw) {
  if (!raw || !Array.isArray(tokens)) return null;
  const h = sha256Hex(raw);
  return tokens.find(t => t && ((t.token_hash && t.token_hash === h) || (t.token && t.token === raw))) || null;
}
function publicTokenView(t) { const { token, token_hash, ...rest } = t; return { ...rest, token_hint: t.token_hint || (token ? String(token).slice(-4) : '') }; }
function migrateTokensToHashed() {
  const tokens = readDb('api_tokens'); if (!Array.isArray(tokens)) return;
  let changed = false;
  for (const t of tokens) { if (t && t.token && !t.token_hash) { t.token_hash = sha256Hex(t.token); t.token_hint = String(t.token).slice(-4); delete t.token; changed = true; } }
  if (changed) writeDb('api_tokens', tokens);
}


function logAudit(actor, action, details, module = 'General') {
  try {
    const logs = readDb('audit_logs');
    const arr = Array.isArray(logs) ? logs : [];
    arr.unshift({
      id: nextId(arr),
      actor: actor || 'Owner',
      action: action || '',
      details: details || '',
      module: module || 'System',
      ip: '127.0.0.1',
      timestamp: new Date().toISOString()
    });
    if (arr.length > 500) arr.pop();
    writeDb('audit_logs', arr);
  } catch (e) {
    console.error('Audit log error:', e);
  }
}

// ── Startup Safe Password Migration ─────────────────────────────
function migratePlaintextPasswords() {
  try {
    const tables = ['users', 'agents', 'clients', 'testpanel_credentials'];
    for (const tbl of tables) {
      let rows = readDb(tbl);
      if (!Array.isArray(rows) || rows.length === 0) continue;
      let changed = false;
      rows = rows.map(r => {
        if (r && r.password && typeof r.password === 'string' && !r.password.startsWith('$2a$') && !r.password.startsWith('$2b$')) {
          changed = true;
          return { ...r, password: hashPassword(r.password) };
        }
        return r;
      });
      if (changed) {
        writeDb(tbl, rows);
      }
    }
  } catch (e) {
    console.error('Password migration error:', e);
  }
}
migratePlaintextPasswords();
migrateTokensToHashed();
recoverSmsJournal();
rotateSmsLog();
{ const _t = setInterval(rotateSmsLog, 6 * 3600 * 1000); if (_t.unref) _t.unref(); }
for (const _sig of ['SIGINT', 'SIGTERM']) process.on(_sig, () => { try { flushPendingWrites(); } catch (e) { /* ignore */ } process.exit(0); });
process.on('exit', () => { try { flushPendingWrites(); } catch (e) { /* ignore */ } });

// ── Real-Time Sensitive Notification Engine (English) ────────
function sendInstantNotification({
  recipient_role,
  recipient_id,
  recipient_username,
  title,
  message,
  type = 'info',
  range_id = null,
  range_name = '',
  count = 0,
  actor_role = 'System',
  actor_name = 'System',
  metadata = {}
}) {
  try {
    let notifications = readDb('notifications');
    if (!Array.isArray(notifications)) notifications = [];

    const now = new Date().toISOString();
    const entry = {
      id: nextId(notifications),
      recipient_role: recipient_role ? String(recipient_role).toLowerCase() : 'all',
      recipient_id: recipient_id ? Number(recipient_id) : null,
      recipient_username: recipient_username || '',
      title: title || 'Notification',
      message: message || '',
      body: message || '',
      type: type || 'info',
      range_id: range_id ? Number(range_id) : null,
      range_name: range_name || '',
      count: Number(count) || 0,
      actor_role: actor_role || 'System',
      actor_name: actor_name || 'System',
      metadata: metadata || {},
      read: false,
      created: now,
      timestamp: now
    };

    notifications.unshift(entry);
    if (notifications.length > 2000) notifications.pop();
    writeDb('notifications', notifications);

    // Also mirror to announcements for backwards-compatibility
    let announcements = readDb('announcements');
    if (!Array.isArray(announcements)) announcements = [];
    announcements.unshift({
      id: nextId(announcements),
      title: entry.title,
      body: entry.message,
      type: entry.type === 'allocation' ? 'success' : entry.type === 'revocation' ? 'warning' : (entry.type || 'info'),
      role: recipient_role === 'client' ? 'Client' : recipient_role === 'agent' ? 'Agent' : recipient_role === 'manager' ? 'Manager' : 'All',
      recipient_id: entry.recipient_id,
      recipient_username: entry.recipient_username,
      agent_id: entry.actor_role === 'Agent' ? entry.metadata?.agent_id || null : null,
      manager_id: entry.actor_role === 'Manager' ? entry.metadata?.manager_id || null : null,
      created: now,
      created_at: now
    });
    if (announcements.length > 500) announcements.pop();
    writeDb('announcements', announcements);

    // Broadcast in REAL-TIME over WebSockets (Instant within 1 second)
    broadcastWs({
      type: 'notification',
      notification: entry,
      data: entry,
      recipient_role: entry.recipient_role,
      recipient_id: entry.recipient_id,
      recipient_username: entry.recipient_username,
      title: entry.title,
      message: entry.message,
      notif_type: entry.type,
      time: now
    });

    return entry;
  } catch (err) {
    console.error('sendInstantNotification error:', err);
    return null;
  }
}

// ── SMS Ingestion, Scraping & Polling Engine ───────────────────
function md5(str) {
  return crypto.createHash('md5').update(String(str || '')).digest('hex');
}

function detectApp(cli, message) {
  const text = `${cli || ''} ${message || ''}`.toLowerCase();
  if (/whatsapp|\bwa\b/i.test(text)) return 'WhatsApp';
  if (/telegram/i.test(text)) return 'Telegram';
  if (/google|gmail|g-|youtube/i.test(text)) return 'Google';
  if (/apple|icloud/i.test(text)) return 'Apple';
  if (/microsoft|msft|outlook|azure/i.test(text)) return 'Microsoft';
  if (/amazon|aws/i.test(text)) return 'Amazon';
  if (/facebook|meta|instagram|\big\b/i.test(text)) return 'Facebook';
  if (/tiktok/i.test(text)) return 'TikTok';
  if (/uber/i.test(text)) return 'Uber';
  if (/dhl/i.test(text)) return 'DHL';
  if (/netflix/i.test(text)) return 'Netflix';
  if (/twitter|\bx\b/i.test(text)) return 'Twitter';
  if (/binance/i.test(text)) return 'Binance';
  if (/snapchat/i.test(text)) return 'Snapchat';
  if (/imo/i.test(text)) return 'IMO';
  if (/viber/i.test(text)) return 'Viber';
  if (/tinder/i.test(text)) return 'Tinder';
  if (cli && /^[a-zA-Z]{3,15}$/.test(cli.trim())) return cli.trim();
  return 'General';
}

function detectCountry(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '—';
  if (digits.startsWith('1')) return 'United States';
  if (digits.startsWith('44')) return 'United Kingdom';
  if (digits.startsWith('7')) return 'Russia';
  if (digits.startsWith('33')) return 'France';
  if (digits.startsWith('49')) return 'Germany';
  if (digits.startsWith('91')) return 'India';
  if (digits.startsWith('92')) return 'Pakistan';
  if (digits.startsWith('86')) return 'China';
  if (digits.startsWith('211')) return 'South Sudan';
  if (digits.startsWith('212')) return 'Morocco';
  if (digits.startsWith('213')) return 'Algeria';
  if (digits.startsWith('216')) return 'Tunisia';
  if (digits.startsWith('218')) return 'Libya';
  if (digits.startsWith('220')) return 'Gambia';
  if (digits.startsWith('221')) return 'Senegal';
  if (digits.startsWith('222')) return 'Mauritania';
  if (digits.startsWith('223')) return 'Mali';
  if (digits.startsWith('224')) return 'Guinea';
  if (digits.startsWith('225')) return 'Ivory Coast';
  if (digits.startsWith('226')) return 'Burkina Faso';
  if (digits.startsWith('227')) return 'Niger';
  if (digits.startsWith('228')) return 'Togo';
  if (digits.startsWith('229')) return 'Benin';
  if (digits.startsWith('230')) return 'Mauritius';
  if (digits.startsWith('231')) return 'Liberia';
  if (digits.startsWith('232')) return 'Sierra Leone';
  if (digits.startsWith('233')) return 'Ghana';
  if (digits.startsWith('234')) return 'Nigeria';
  if (digits.startsWith('235')) return 'Chad';
  if (digits.startsWith('236')) return 'Central African Republic';
  if (digits.startsWith('237')) return 'Cameroon';
  if (digits.startsWith('240')) return 'Equatorial Guinea';
  if (digits.startsWith('241')) return 'Gabon';
  if (digits.startsWith('242')) return 'Congo';
  if (digits.startsWith('243')) return 'DR Congo';
  if (digits.startsWith('244')) return 'Angola';
  if (digits.startsWith('245')) return 'Guinea-Bissau';
  if (digits.startsWith('249')) return 'Sudan';
  if (digits.startsWith('250')) return 'Rwanda';
  if (digits.startsWith('251')) return 'Ethiopia';
  if (digits.startsWith('252')) return 'Somalia';
  if (digits.startsWith('253')) return 'Djibouti';
  if (digits.startsWith('254')) return 'Kenya';
  if (digits.startsWith('255')) return 'Tanzania';
  if (digits.startsWith('256')) return 'Uganda';
  if (digits.startsWith('257')) return 'Burundi';
  if (digits.startsWith('258')) return 'Mozambique';
  if (digits.startsWith('260')) return 'Zambia';
  if (digits.startsWith('261')) return 'Madagascar';
  if (digits.startsWith('263')) return 'Zimbabwe';
  if (digits.startsWith('264')) return 'Namibia';
  if (digits.startsWith('265')) return 'Malawi';
  if (digits.startsWith('27')) return 'South Africa';
  if (digits.startsWith('20')) return 'Egypt';
  if (digits.startsWith('966')) return 'Saudi Arabia';
  if (digits.startsWith('971')) return 'UAE';
  if (digits.startsWith('90')) return 'Turkey';
  if (digits.startsWith('55')) return 'Brazil';
  if (digits.startsWith('52')) return 'Mexico';
  if (digits.startsWith('62')) return 'Indonesia';
  if (digits.startsWith('880')) return 'Bangladesh';
  if (digits.startsWith('63')) return 'Philippines';
  if (digits.startsWith('84')) return 'Vietnam';
  if (digits.startsWith('380')) return 'Ukraine';
  if (digits.startsWith('31')) return 'Netherlands';
  if (digits.startsWith('32')) return 'Belgium';
  if (digits.startsWith('34')) return 'Spain';
  if (digits.startsWith('39')) return 'Italy';
  if (digits.startsWith('40')) return 'Romania';
  if (digits.startsWith('48')) return 'Poland';
  if (digits.startsWith('351')) return 'Portugal';
  return 'International';
}

function extractOtp(text) {
  if (!text) return '';
  const s = String(text).trim();
  const patterns = [
    // Prefix G-123456 or WA-123456, OTP-123456
    /\b(?:G|WA|FB|TG|OTP|PIN)-?(\d{4,8})\b/i,
    // Explicit prefix with colon/is: "code is: 123456", "code: 123456", "OTP: 123456", "PIN: 1234" (must contain at least one digit)
    /(?:verification\s*(?:code|pin)?|verify\s*code|otp|o\.t\.p|pin|password|passcode|secret\s*code|kod|kodunuz|codice|c[oó]digo|senha)\s*(?:is|est|ist|es|:|:=|=|-)?\s*[:\-\s]?\s*([0-9A-Za-z]*\d[0-9A-Za-z]*)\b/i,
    // Digits preceding "is your ... code/otp": "123456 is your Apple ID code", "<#> 136445 est votre code Facebook"
    /(?:^|[^\d])(\d{4,8})\s+(?:is\s+your|is\s+the|est\s+votre|es\s+tu|es\s+su|ist\s+ihr|ist\s+dein|to\s+verify|for\s+verification)\b/i,
    // Bracketed or quoted OTP: [123456], (123456), "123456", '123456'
    /[\[\(\'\"](\d{4,8})[\]\)\'\"]/,
    // Hyphenated code: 123-456 or 12-34-56
    /\b(\d{2,4}[\s\-]\d{2,4}(?:[\s\-]\d{2,4})?)\b/,
    // Any standalone 4 to 8 digits
    /\b(\d{4,8})\b/
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m && m[1]) {
      const val = String(m[1]).trim();
      const digits = val.replace(/\D/g, '');
      if (digits.length >= 4 && digits.length <= 8) return digits;
      if (val.length >= 4 && val.length <= 8 && /\d/.test(val) && /^[0-9A-Za-z]+$/.test(val)) return val;
    }
  }
  return '';
}

function normalizeIsoTimestamp(raw) {
  if (!raw) return new Date().toISOString();
  if (typeof raw === 'number' || /^\d{10,13}$/.test(String(raw).trim())) {
    const num = Number(raw);
    const ms = num < 1e11 ? num * 1000 : num;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  let s = String(raw).trim();
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();

  // Try format DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    const year = parseInt(dmy[3], 10);
    const hour = parseInt(dmy[4] || '0', 10);
    const min = parseInt(dmy[5] || '0', 10);
    const sec = parseInt(dmy[6] || '0', 10);
    d = new Date(Date.UTC(year, month, day, hour, min, sec));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  if (s.includes(' ')) s = s.replace(' ', 'T');
  d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();

  return new Date().toISOString();
}

function extractDateStr(s) {
  if (!s) return '';
  if (typeof s === 'string') {
    const raw = s.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    if (/^\d{10,13}$/.test(raw)) {
      const ms = Number(raw) < 1e11 ? Number(raw) * 1000 : Number(raw);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return raw.slice(0, 10);
  }
  const raw = String(s.date || s.timestamp || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{10,13}$/.test(raw)) {
    const ms = Number(raw) < 1e11 ? Number(raw) * 1000 : Number(raw);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return raw.slice(0, 10);
}

function getDateRangeBuckets() {
  const now = new Date();
  const utcToday = now.toISOString().slice(0, 10);
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todaySet = new Set([utcToday, localToday]);

  const yestUtc = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const yestLocalObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yestLocal = `${yestLocalObj.getFullYear()}-${String(yestLocalObj.getMonth() + 1).padStart(2, '0')}-${String(yestLocalObj.getDate()).padStart(2, '0')}`;
  const yesterdaySet = new Set([yestUtc, yestLocal]);
  yesterdaySet.delete(utcToday);
  yesterdaySet.delete(localToday);

  const dayOfWeek = (now.getDay() + 6) % 7;
  const startOfWeekObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
  const weekStartStr = `${startOfWeekObj.getFullYear()}-${String(startOfWeekObj.getMonth() + 1).padStart(2, '0')}-${String(startOfWeekObj.getDate()).padStart(2, '0')}`;

  const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const yearStartStr = `${now.getFullYear()}-01-01`;

  return { todaySet, yesterdaySet, weekStartStr, monthStartStr, yearStartStr, now, todayStr: utcToday, yesterdayStr: yestUtc };
}

function parseRateValue(val) {
  if (val === undefined || val === null || val === '' || typeof val === 'boolean') return undefined;
  if (typeof val === 'number') return Number.isFinite(val) && val >= 0 ? val : undefined;
  let s = String(val).trim();
  if (!s || /^(-|—|n\/?a|null|undefined)$/i.test(s)) return undefined;
  if (!s.includes('.') && /^[+-]?[$€£¥₹]?\s*\d+,\d+(?:\s*[A-Za-z]{0,5})?$/.test(s)) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const m = s.match(/[-+]?\d+(?:\.\d+)?/);
  if (!m) return undefined;
  const num = parseFloat(m[0]);
  return Number.isFinite(num) && num >= 0 ? num : undefined;
}

function isLikelyRateToken(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 && raw <= 50;
  const s = String(raw ?? '').trim();
  if (!s || s.length > 24) return false;
  if (/\d{4}-\d{2}-\d{2}|:\d{2}|\d+\.\d+\.\d+\.\d+/.test(s)) return false;
  if (/^\+?\d{6,}$/.test(s.replace(/[\s()-]/g, ''))) return false;
  const num = parseRateValue(s);
  return num !== undefined && num >= 0 && num <= 50;
}

function extractCrApiRate(row) {
  if (!row) return undefined;
  if (Array.isArray(row)) {
    if (row.length === 5 && /^\+?\d{6,16}$/.test(String(row[1] || '').trim().replace(/[\s()-]/g, '')) && isLikelyRateToken(row[4])) {
      return parseRateValue(row[4]);
    }
    for (let i = 5; i < row.length; i++) {
      if (isLikelyRateToken(row[i])) {
        const val = parseRateValue(row[i]);
        if (val !== undefined && val > 0) return val;
      }
    }
    for (let i = 5; i < row.length; i++) {
      if (isLikelyRateToken(row[i])) {
        const val = parseRateValue(row[i]);
        if (val !== undefined) return val;
      }
    }
    return undefined;
  }
  if (typeof row === 'object') {
    const keys = [
      'company_rate', 'company_payout', 'my_payout', 'payout', 'payout_rate',
      'rate', 'price', 'cost', 'amount', 'sms_rate', 'carrier_rate',
      'buy_rate', 'sell_rate', 'client_payout', 'agent_payout',
      'earning', 'revenue', 'usd', 'fee', 'value'
    ];
    let zeroFallback;
    const lowerMap = new Map();
    for (const k of Object.keys(row)) {
      lowerMap.set(k.toLowerCase(), row[k]);
    }
    for (const k of keys) {
      const rawVal = row[k] !== undefined ? row[k] : lowerMap.get(k);
      const parsed = parseRateValue(rawVal);
      if (parsed !== undefined) {
        if (parsed > 0) return parsed;
        if (zeroFallback === undefined) zeroFallback = parsed;
      }
    }
    return zeroFallback;
  }
  return undefined;
}

function getRangeCompanyCost(rng) {
  if (!rng) return 0;
  const candidates = [rng.company_cost, rng.cost, rng.buy_rate, rng.carrier_rate, rng.company_rate];
  for (const c of candidates) {
    const v = parseRateValue(c);
    if (v !== undefined && v > 0) return v;
  }
  return 0;
}

// ── Master Payterm List & Helpers (R2) ─────────────────────────
const DEFAULT_PAYTERMS = ['Weekly', 'Monthly', '7/1', '30/30', '1/1', '7/7', '15/15', '15/30', 'Monthly60'];

function getMasterPayterms() {
  try {
    const settings = readDb('settings');
    if (settings && Array.isArray(settings.payterms) && settings.payterms.length > 0) {
      return settings.payterms;
    }
  } catch (e) {}
  return [...DEFAULT_PAYTERMS];
}

function normalizePaytermKey(k) {
  if (!k || typeof k !== 'string') return k;
  const s = k.trim();
  if (s === '15/1' || s === 'Bi-Weekly') return '15/15';
  if (s === '30/1') return 'Monthly60';
  if (s === 'Daily') return '1/1';
  if (s === 'Weekly (7/1)' || s === 'weekly') return 'Weekly';
  if (s === 'Monthly (30/30)' || s === 'monthly') return 'Monthly';
  return s;
}

function isValidPayterm(term) {
  if (!term || typeof term !== 'string') return false;
  const s = term.trim();
  const list = getMasterPayterms();
  const norm = normalizePaytermKey(s);
  return list.includes(s) || list.includes(norm) || ['Weekly', 'Monthly', '7/1', '30/30'].includes(s) || ['Weekly', 'Monthly', '7/1', '30/30'].includes(norm);
}

function runPaytermMigration() {
  try {
    // 1. Settings
    let settings = readDb('settings');
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = {};
    let settingsChanged = false;
    if (!settings.payterms || !Array.isArray(settings.payterms) || settings.payterms.length === 0) {
      settings.payterms = [...DEFAULT_PAYTERMS];
      settingsChanged = true;
    } else {
      const migrated = Array.from(new Set(settings.payterms.map(normalizePaytermKey)));
      if (JSON.stringify(migrated) !== JSON.stringify(settings.payterms)) {
        settings.payterms = migrated;
        settingsChanged = true;
      }
    }
    if (settingsChanged) writeDb('settings', settings);

    // 2. SMS Ranges
    let ranges = readDb('sms_ranges') || [];
    let rangesChanged = false;
    ranges.forEach(r => {
      if (r.payterms && typeof r.payterms === 'object') {
        const newPts = {};
        for (const [k, v] of Object.entries(r.payterms)) {
          const normK = normalizePaytermKey(k);
          if (newPts[normK] === undefined) newPts[normK] = v;
        }
        if (JSON.stringify(newPts) !== JSON.stringify(r.payterms)) {
          r.payterms = newPts;
          rangesChanged = true;
        }
      }
      if (r.payterm) {
        const norm = normalizePaytermKey(r.payterm);
        if (norm !== r.payterm) {
          r.payterm = norm;
          rangesChanged = true;
        }
      }
    });
    if (rangesChanged) writeDb('sms_ranges', ranges);

    // 3. Numbers
    let numbers = readDb('numbers') || [];
    let numbersChanged = false;
    numbers.forEach(n => {
      if (n.payterm) {
        const norm = normalizePaytermKey(n.payterm);
        if (norm !== n.payterm) { n.payterm = norm; numbersChanged = true; }
      }
      if (n.client_payterm) {
        const norm = normalizePaytermKey(n.client_payterm);
        if (norm !== n.client_payterm) { n.client_payterm = norm; numbersChanged = true; }
      }
    });
    if (numbersChanged) writeDb('numbers', numbers);
  } catch (err) {
    console.error('Payterm migration error:', err);
  }
}

function getRangeAgentRate(rng, payterm = 'Weekly') {
  if (!rng) return 0;
  const normPt = normalizePaytermKey(payterm);
  if (rng.payterms && typeof rng.payterms === 'object') {
    if (rng.payterms[normPt] !== undefined && rng.payterms[normPt] !== 'NA' && !isNaN(Number(rng.payterms[normPt]))) {
      return Number(rng.payterms[normPt]);
    }
    if (rng.payterms[payterm] !== undefined && rng.payterms[payterm] !== 'NA' && !isNaN(Number(rng.payterms[payterm]))) {
      return Number(rng.payterms[payterm]);
    }
    // Weekly / 7/1 resolution
    if (normPt === 'Weekly' || payterm === '7/1' || normPt === '7/1') {
      const v = rng.payterms['Weekly'] ?? rng.payterms['7/1'] ?? rng.payterms['7/7'] ?? rng.payterms['1/1'];
      if (v !== undefined && v !== 'NA' && !isNaN(Number(v))) return Number(v);
    }
    // Monthly / 30/30 resolution
    if (normPt === 'Monthly' || payterm === '30/30' || normPt === '30/30' || normPt === 'Monthly60') {
      const v = rng.payterms['Monthly'] ?? rng.payterms['30/30'] ?? rng.payterms['Monthly60'] ?? rng.payterms['15/15'] ?? rng.payterms['15/30'];
      if (v !== undefined && v !== 'NA' && !isNaN(Number(v))) return Number(v);
    }
    // Check legacy aliases
    if (normPt === '15/15' && (rng.payterms['15/1'] ?? rng.payterms['Bi-Weekly']) !== undefined) {
      const v = rng.payterms['15/1'] ?? rng.payterms['Bi-Weekly'];
      if (v !== 'NA' && !isNaN(Number(v))) return Number(v);
    }
    if (normPt === 'Monthly60' && (rng.payterms['30/1'] ?? rng.payterms['Monthly']) !== undefined) {
      const v = rng.payterms['30/1'] ?? rng.payterms['Monthly'];
      if (v !== 'NA' && !isNaN(Number(v))) return Number(v);
    }
    if (normPt === '1/1' && rng.payterms['Daily'] !== undefined) {
      const v = rng.payterms['Daily'];
      if (v !== 'NA' && !isNaN(Number(v))) return Number(v);
    }
    if (rng.payterms['Weekly'] !== undefined && rng.payterms['Weekly'] !== 'NA' && !isNaN(Number(rng.payterms['Weekly']))) {
      return Number(rng.payterms['Weekly']);
    }
    for (const v of Object.values(rng.payterms)) {
      if (v !== 'NA' && v !== undefined && v !== null && !isNaN(Number(v)) && Number(v) > 0) {
        return Number(v);
      }
    }
  }
  if (rng.payout !== undefined && rng.payout !== null && !isNaN(Number(rng.payout))) return Number(rng.payout);
  if (rng.sell_rate !== undefined && rng.sell_rate !== null && !isNaN(Number(rng.sell_rate))) return Number(rng.sell_rate);
  return 0;
}


function ingestSms({
  sender = '',
  to_number = '',
  message = '',
  otp = '',
  sms_id = '',
  company = '',
  provider: customProvider = '',
  range: customRange = '',
  country: customCountry = '',
  source = 'api',
  panel_id = null,
  panel_name = '',
  ext_key = '',
  timestamp = null,
  currency: customCurrency = '',
  payout: customPayout = undefined,
  company_rate: customCompanyRate = undefined,
  agent_rate: customAgentRate = undefined,
  client_rate: customClientRate = undefined,
  manager_percent: customManagerPercent = undefined
}) {
  try {
    const cleanTo = String(to_number || '').trim();
    const cleanMsg = String(message || '').trim();
    if (!cleanTo || !cleanMsg) {
      return { status: 'error', error: 'Missing number or message' };
    }

    const testNumMap = getIndexedTestNumbers();
    const testNumRec = testNumMap.get(cleanTo) || null;
    const { byDigits, byRaw } = getIndexedNumbers();
    const digits = cleanTo.replace(/\D/g, '');
    let numberRec = byRaw.get(cleanTo) || byDigits.get(digits) || null;
    const assignedNumberRec = (numberRec && (numberRec.manager_id || numberRec.agent_id || numberRec.client_id)) ? numberRec : null;

    // Handle test numbers pool - write to test_sms_logs for testpanel visibility
    if (testNumRec) {
      const testLogs = readDb('test_sms_logs') || [];
      const isTestDuplicate = sms_id && testLogs.some(s => s.sms_id === sms_id);
      if (!isTestDuplicate) {
        const allRanges = readDb('sms_ranges') || [];
        const testRng = (testNumRec.range_id && allRanges.find(r => r.id === testNumRec.range_id)) ||
                        allRanges.find(r => r.range_name && r.range_name === testNumRec.range_name) ||
                        allRanges.find(r => r.country === testNumRec.country);
        const testRangeName = (testNumRec && (testNumRec.range_name || testNumRec.range_label || testNumRec.range)) ||
                              (testRng && (testRng.range_name || testRng.name)) ||
                              testNumRec.country || 'Test Range';
        const finalOtpVal = otp || extractOtp(cleanMsg);
        const normTs = normalizeIsoTimestamp(timestamp);
        const testEntry = {
          id: nextId(testLogs),
          number: cleanTo,
          cli: sender || 'TEST',
          message: cleanMsg,
          country: testNumRec.country || (testRng && testRng.country) || detectCountry(cleanTo),
          provider: (testNumRec.provider && testNumRec.provider !== 'Manual') ? testNumRec.provider : ((testRng && testRng.provider !== 'Manual') ? testRng.provider : ''),
          range_label: testRangeName,
          range_name: testRangeName,
          range: testRangeName,
          range_id: (testNumRec && testNumRec.range_id) || (testRng && testRng.id) || null,
          app: testNumRec.app || detectApp(sender, cleanMsg),
          carrier_rate: testNumRec.carrier_rate || 0,
          payout_rate: testNumRec.payout_rate || 0,
          sms_id: sms_id || '',
          timestamp: normTs,
          date: normTs.slice(0, 10),
          time: normTs.slice(11, 19),
          otp: finalOtpVal
        };
        testLogs.unshift(testEntry);
        writeDb('test_sms_logs', testLogs);
      }
      // Test traffic is isolated: it never enters sms_log, earnings or stats
      return { status: 'ok', logged: true, test: true, matched_number: false };
    }

    const smsLog = readDb('sms_log') || [];
    const dedupeKey = ext_key || (sms_id ? `smsid-${sms_id}` : '');
    if (dedupeKey && smsIndexHas(smsLog, dedupeKey, sms_id)) {
      return { status: 'ok', duplicate: true, sms_id: sms_id || dedupeKey };
    }

    if (!numberRec) {
      numberRec = byRaw.get(cleanTo) || byDigits.get(digits) || null;
    }

    const ranges = readDb('sms_ranges') || [];
    const rateCard = readDb('rate_card') || [];

    let rng = null;
    // 1. Prioritize range lookup by range_name
    if (numberRec && numberRec.range_name) {
      const rn = String(numberRec.range_name).trim().toLowerCase();
      rng = ranges.find(r => (r.range_name && String(r.range_name).trim().toLowerCase() === rn) || (r.name && String(r.name).trim().toLowerCase() === rn));
    }
    if (!rng && testNumRec && (testNumRec.range_name || testNumRec.range_label)) {
      const trName = String(testNumRec.range_name || testNumRec.range_label).trim().toLowerCase();
      rng = ranges.find(r => (r.range_name && String(r.range_name).trim().toLowerCase() === trName) || (r.name && String(r.name).trim().toLowerCase() === trName));
    }
    // 2. Fallback to range_id
    if (!rng && numberRec && numberRec.range_id) {
      rng = ranges.find(r => Number(r.id) === Number(numberRec.range_id));
    }
    if (!rng && testNumRec && testNumRec.range_id) {
      rng = ranges.find(r => Number(r.id) === Number(testNumRec.range_id));
    }
    // 3. Fallback to prefix
    if (!rng && digits) {
      rng = ranges.find(r => (r.prefix && digits.startsWith(String(r.prefix).replace(/\D/g, ''))) ||
                             (r.dial_code && digits.startsWith(String(r.dial_code).replace(/\D/g, ''))));
    }

    const detectedCountry = detectCountry(cleanTo);
    const cleanCustomCountry = cleanSmsMetaVal(customCountry);
    const country = (rng && rng.country) || (numberRec && numberRec.country) || (testNumRec && testNumRec.country) || (cleanCustomCountry && cleanCustomCountry !== 'International' ? cleanCustomCountry : '') || detectedCountry;
    const panelFallbackProvider = (source === 'cr_api' || source === 'login_panel') ? (panel_name || company) : '';
    const rawProvider = (rng && rng.provider) || (numberRec && numberRec.provider) || (testNumRec && testNumRec.provider) || customProvider || panelFallbackProvider || '';
    const provider = cleanSmsMetaVal(rawProvider);
    const rawRange = (rng && (rng.range_name || rng.name)) || (testNumRec && (testNumRec.range_name || testNumRec.range_label || testNumRec.range)) || (numberRec && (numberRec.range_name || numberRec.range)) || cleanSmsMetaVal(customRange);
    const fallbackRange = (country && provider && country !== 'International') ? `${country} ${provider}` : (country || '');
    const rangeLabel = rawRange || fallbackRange;

    // ── STAGE C: Precise Ledger Stamping & Rate Calculations ──
    const round6 = v => Math.round((Number(v) || 0) * 1000000) / 1000000;

    // 1. Company Rate (Owner buy cost: custom override -> live CR API/panel rate -> number override -> range -> rate card -> custom payout fallback)
    let company_rate = 0;
    const parsedCustomCompanyRate = parseRateValue(customCompanyRate);
    const parsedCustomPayout = parseRateValue(customPayout);
    if (parsedCustomCompanyRate != null && parsedCustomCompanyRate > 0) {
      company_rate = round6(parsedCustomCompanyRate);
    }
    if (!company_rate && (source === 'cr_api' || source === 'login_panel') && parsedCustomPayout != null && parsedCustomPayout > 0) {
      company_rate = round6(parsedCustomPayout);
    }
    if (!company_rate && numberRec) {
      const numCost = parseRateValue(numberRec.company_rate) ?? parseRateValue(numberRec.company_cost) ?? parseRateValue(numberRec.cost) ?? parseRateValue(numberRec.carrier_rate);
      if (numCost != null && numCost > 0) {
        company_rate = round6(numCost);
      }
    }
    if (!company_rate && rng) {
      company_rate = round6(getRangeCompanyCost(rng));
    }
    if (!company_rate) {
      const rc = rateCard.find(c => c && c.active && (
        (country && c.country && String(c.country).toLowerCase() === String(country).toLowerCase()) ||
        (provider && c.provider && String(c.provider).toLowerCase() === String(provider).toLowerCase())
      ));
      if (rc && rc.buy_rate != null) company_rate = round6(parseRateValue(rc.buy_rate) || 0);
    }
    if (!company_rate && parsedCustomPayout != null && parsedCustomPayout > 0) {
      company_rate = round6(parsedCustomPayout);
    }

    // 2. Payterm & Agent Rate (number override -> range -> rate card)
    const payterm = (numberRec && (numberRec.payterm || numberRec.payterms)) || 'Weekly';
    let agent_rate = 0;
    if (numberRec && numberRec.agent_rate != null && Number(numberRec.agent_rate) > 0) {
      agent_rate = round6(numberRec.agent_rate);
    }
    if (!agent_rate && rng) {
      agent_rate = round6(getRangeAgentRate(rng, payterm));
    }
    if (!agent_rate) {
      const rc = rateCard.find(c => c && c.active && (
        (country && c.country && String(c.country).toLowerCase() === String(country).toLowerCase()) ||
        (provider && c.provider && String(c.provider).toLowerCase() === String(provider).toLowerCase())
      ));
      if (rc && rc.sell_rate != null) agent_rate = round6(rc.sell_rate);
    }

    let resolvedAgentId = numberRec && numberRec.agent_id;
    let resolvedManagerId = numberRec && numberRec.manager_id;
    let resolvedClientId = numberRec && numberRec.client_id;

    // Check if numberRec.user is a client
    if (!resolvedClientId && numberRec && numberRec.user && numberRec.user !== 'unallocated' && numberRec.user !== 'Test Panel') {
      const c = (readDb('clients') || []).find(x => String(x.username).toLowerCase() === String(numberRec.user).toLowerCase());
      if (c) resolvedClientId = c.id;
    }

    if (!resolvedClientId && numberRec && numberRec.client_username && numberRec.client_username !== 'Test Panel') {
      const c = (readDb('clients') || []).find(x => String(x.username).toLowerCase() === String(numberRec.client_username).toLowerCase());
      if (c) resolvedClientId = c.id;
    }

    // Resolve up the downline chain from client -> agent -> manager
    if (resolvedClientId) {
      const c = (readDb('clients') || []).find(x => Number(x.id) === Number(resolvedClientId));
      if (c) {
        if (!resolvedAgentId && c.agent_id) resolvedAgentId = c.agent_id;
        if (!resolvedManagerId && c.manager_id) resolvedManagerId = c.manager_id;
      }
    }

    if (!resolvedAgentId && numberRec && numberRec.agent_username) {
      const a = (readDb('agents') || []).find(x => String(x.username).toLowerCase() === String(numberRec.agent_username).toLowerCase());
      if (a) resolvedAgentId = a.id;
    }

    if (resolvedAgentId && !resolvedManagerId) {
      const a = (readDb('agents') || []).find(x => Number(x.id) === Number(resolvedAgentId));
      if (a && a.manager_id) resolvedManagerId = a.manager_id;
    }

    if (!resolvedManagerId && numberRec && numberRec.manager_username) {
      const m = (readDb('users') || []).find(x => String(x.username).toLowerCase() === String(numberRec.manager_username).toLowerCase());
      if (m) resolvedManagerId = m.id;
    }

    const hasClient = Boolean(resolvedClientId);
    const hasAgent = Boolean(resolvedAgentId);
    const hasManager = Boolean(resolvedManagerId);

    // 3. Client Rate (number override -> client record -> range/card fallback to agent_rate)
    let client_rate = 0;
    if (hasClient) {
      if (numberRec && (numberRec.client_rate != null || numberRec.client_payout != null)) {
        client_rate = round6(numberRec.client_rate ?? numberRec.client_payout);
      }
      if (!client_rate) {
        const clients = readDb('clients') || [];
        const cl = clients.find(c => (resolvedClientId && Number(c.id) === Number(resolvedClientId)) || (numberRec && numberRec.client_username && String(c.username).toLowerCase() === String(numberRec.client_username).toLowerCase()));
        if (cl && cl.client_rate != null) {
          client_rate = round6(cl.client_rate);
        } else {
          client_rate = agent_rate;
        }
      }
      if (agent_rate > 0 && client_rate > agent_rate) {
        client_rate = agent_rate;
      }
    } else {
      client_rate = 0;
    }

    // 4. Manager Commission Percent (supports Range-based percentage & user percentage)
    let manager_percent = 0;
    if (hasManager) {
      const allUsers = readDb('users') || [];
      const mgr = allUsers.find(u => (resolvedManagerId && Number(u.id) === Number(resolvedManagerId)) || (numberRec && numberRec.manager_username && String(u.username).toLowerCase() === String(numberRec.manager_username).toLowerCase()));
      if (mgr) {
        const rName = rangeLabel || (rng && (rng.range_name || rng.name)) || (numberRec && numberRec.range_name) || '';
        if (mgr.range_commissions && rName && mgr.range_commissions[rName] != null) {
          manager_percent = round6(mgr.range_commissions[rName]);
        } else if (mgr.commission_percent != null || mgr.commission_rate != null) {
          manager_percent = round6(mgr.commission_percent ?? mgr.commission_rate);
        } else {
          manager_percent = 10;
        }
      } else {
        manager_percent = 10;
      }
    }

    // 5. LEDGER AMOUNTS
    // client_amount = client_rate (0 if no client)
    const client_amount = hasClient ? round6(client_rate) : 0;

    // agent_amount = agent_rate - client_rate (if no client: agent_rate; if no agent: 0)
    const agent_amount = hasAgent ? (hasClient ? round6(agent_rate - client_rate) : round6(agent_rate)) : 0;

    // Gross Margin = Provider Rate - Agent Master Rate
    const gross_margin = Math.max(0, round6(company_rate - agent_rate));

    // manager_amount = Range-based percentage on gross margin (or agent rate fallback)
    const manager_amount = hasManager
      ? (gross_margin > 0
          ? round6(gross_margin * (manager_percent / 100))
          : (agent_rate > 0 ? round6(agent_rate * (manager_percent / 100)) : 0))
      : 0;

    // owner_amount = if agent exists: (gross_margin - manager_amount); if no agent: (company_rate - manager_amount)
    const owner_amount = Math.max(0, hasAgent ? round6(gross_margin - manager_amount) : round6(company_rate - manager_amount));

    const finalTimestamp = normalizeIsoTimestamp(timestamp);
    const datePart = finalTimestamp.slice(0, 10);
    const timePart = finalTimestamp.slice(11, 19);

    const cleanHierarchyStr = (val) => {
      const s = String(val || '').trim();
      if (!s) return '';
      const sl = s.toLowerCase();
      if (['unallocated', 'unassigned', 'test panel', 'direct', 'general', '—', '-', 'unknown', 'none', 'null'].includes(sl)) return '';
      return s;
    };

    const appName = (numberRec && numberRec.app) || detectApp(sender, cleanMsg);
    let manager_username = cleanHierarchyStr(numberRec && (numberRec.manager_username || numberRec.manager));
    let agent_username = cleanHierarchyStr(numberRec && (numberRec.agent_username || numberRec.agent));
    let client_username = cleanHierarchyStr(numberRec && (numberRec.client_username || numberRec.client_name || numberRec.user));
    if (!manager_username && hasManager) {
      const uRec = (readDb('users') || []).find(u => Number(u.id) === Number(resolvedManagerId));
      if (uRec) manager_username = cleanHierarchyStr(uRec.username);
    }
    if (!agent_username && hasAgent) {
      const aRec = (readDb('agents') || []).find(a => Number(a.id) === Number(resolvedAgentId));
      if (aRec) agent_username = cleanHierarchyStr(aRec.username);
    }
    if (!client_username && hasClient) {
      const cRec = (readDb('clients') || []).find(c => Number(c.id) === Number(resolvedClientId));
      if (cRec) client_username = cleanHierarchyStr(cRec.username);
    }

    const isTestPanelNumber = source === 'test' || Boolean(numberRec && (numberRec.fixed_for_test || numberRec.is_test_panel || numberRec.user === 'Test Panel'));
    const smsType = isTestPanelNumber ? 'Test Panel' : 'General';
    const finalOtp = otp || extractOtp(cleanMsg);

    const entry = {
      id: nextSmsId(smsLog),
      number: cleanTo,
      cli: sender || '',
      message: cleanMsg,
      timestamp: finalTimestamp,
      date: datePart,
      time: timePart,
      otp: finalOtp,
      range_label: rangeLabel,
      range_name: rangeLabel,
      range: rangeLabel,
      country: country || '',
      provider: provider || '',
      range_id: rng ? rng.id : null,
      app: appName,
      type: smsType,
      status: 'delivered',
      cause: 'Success',
      currency: (rng && rng.currency) || cleanSmsMetaVal(customCurrency) || 'USD',
      company_rate: company_rate,
      agent_rate: agent_rate,
      client_rate: client_rate,
      payterm: payterm,
      payterms: payterm,
      manager_percent: manager_percent,
      client_amount: client_amount,
      agent_amount: agent_amount,
      manager_amount: manager_amount,
      owner_amount: owner_amount,
      has_rate: Boolean(company_rate > 0 || agent_rate > 0),
      no_rate: !(company_rate > 0 || agent_rate > 0),
      payout: hasClient ? client_amount : (hasAgent ? agent_amount : (hasManager ? manager_amount : 0)),
      client_payout: hasClient ? client_amount : 0,
      agent_payout: hasAgent ? agent_rate : 0,
      manager_payout: hasManager ? manager_amount : 0,
      company_payout: company_rate,
      profit: owner_amount,
      carrier_revenue: company_rate,
      payout_cost: round6(agent_rate + manager_amount),
      admin_profit: owner_amount,
      manager_id: resolvedManagerId != null ? Number(resolvedManagerId) : null,
      agent_id: resolvedAgentId != null ? Number(resolvedAgentId) : null,
      client_id: resolvedClientId != null ? Number(resolvedClientId) : null,
      manager_username: manager_username || null,
      agent_username: agent_username || null,
      client_username: client_username || null,
      user: client_username || '',
      source: source || 'api',
      panel_id: panel_id || null,
      panel_name: panel_name || '',
      sms_id: sms_id || '',
      company: company || (numberRec ? numberRec.company : '') || '',
      ext_key: dedupeKey || md5(`${panel_id || 'api'}|${cleanTo}|${finalTimestamp}|${cleanMsg}`)
    };

    appendSmsLog(entry, smsLog);
    noteSmsArrival();

    // ── STAGE D: Live Money Flow Balances Update (Accrued Earnings Waterfall) ──
    try {
      const allClients = readDb('clients') || [];
      const allAgents = readDb('agents') || [];
      const allUsers = readDb('users') || [];

      // 1. Client balance += client_amount (Client receives payout for inbound traffic per Section 3.1)
      if (hasClient && client_amount > 0) {
        const cIdx = allClients.findIndex(c => c && (
          (client_username && String(c.username).trim().toLowerCase() === String(client_username).trim().toLowerCase()) ||
          (resolvedClientId && Number(c.id) === Number(resolvedClientId))
        ));
        if (cIdx !== -1) {
          const curBal = Number(allClients[cIdx].balance || 0);
          allClients[cIdx].balance = Math.round((curBal + client_amount) * 1000000) / 1000000;
          debouncedWriteDb('clients');
        }
      }

      // 2. Agent balance += agent_amount (Agent retains agent profit margin per Section 3.2)
      if (hasAgent && agent_amount > 0) {
        const aIdx = allAgents.findIndex(a => a && (
          (agent_username && String(a.username).trim().toLowerCase() === String(agent_username).trim().toLowerCase()) ||
          (resolvedAgentId && Number(a.id) === Number(resolvedAgentId))
        ));
        if (aIdx !== -1) {
          const curBal = Number(allAgents[aIdx].balance || 0);
          allAgents[aIdx].balance = Math.round((curBal + agent_amount) * 1000000) / 1000000;
          debouncedWriteDb('agents');
        }
      }

      // 3. Manager balance += manager_amount
      if (hasManager && manager_amount > 0) {
        const mIdx = allUsers.findIndex(u => u && (u.role || '').toLowerCase() === 'manager' && (
          (manager_username && String(u.username).trim().toLowerCase() === String(manager_username).trim().toLowerCase()) ||
          (resolvedManagerId && Number(u.id) === Number(resolvedManagerId))
        ));
        if (mIdx !== -1) {
          const curBal = Number(allUsers[mIdx].balance || 0);
          allUsers[mIdx].balance = Math.round((curBal + manager_amount) * 1000000) / 1000000;
          debouncedWriteDb('users');
        }
      }

      // 4. Owner profit += owner_amount
      if (owner_amount > 0) {
        const oIdx = allUsers.findIndex(u => u && (
          (u.role || '').toLowerCase() === 'owner' ||
          String(u.username || '').toLowerCase() === 'kamran_bhatti'
        ));
        if (oIdx !== -1) {
          const curBal = Number(allUsers[oIdx].balance || 0);
          allUsers[oIdx].balance = Math.round((curBal + owner_amount) * 1000000) / 1000000;
          debouncedWriteDb('users');
        }
      }
    } catch (balErr) {
      console.error('Error updating money flow balances:', balErr);
    }

    if (numberRec) {
      numberRec.sms_count = (numberRec.sms_count || 0) + 1;
      numberRec.last_sms = entry.timestamp;
      debouncedWriteDb('numbers');
    }

    if (company) {
      const accounts = readDb('smpp_accounts') || [];
      const acc = accounts.find(a => (a.company || '').toLowerCase() === String(company).toLowerCase() ||
                                     (a.system_id || '').toLowerCase() === String(company).toLowerCase());
      if (acc) {
        acc.messages_today = (acc.messages_today || 0) + 1;
        writeDb('smpp_accounts', accounts);
      }
    }

    broadcastWs({
      type: 'otp',
      data: entry
    });

    const live = liveTrafficStats();
    broadcastWs({
      type: 'traffic',
      mps: live.mps,
      timestamp: new Date().toISOString(),
      total: smsLog.length,
      success_rate: live.success_rate
    });

    return { status: 'ok', logged: true, matched_number: Boolean(numberRec), entry };
  } catch (err) {
    console.error('ingestSms error:', err);
    return { status: 'error', error: err.message };
  }
}

const loginPanelsInFlight = new Set();

async function pollSingleLoginPanel(panelId, force = false) {
  const panels = readDb('login_panels') || [];
  const panel = panels.find(p => p.id === panelId);
  if (!panel || (!force && panel.status !== 'running')) return 0;
  if (loginPanelsInFlight.has(panelId)) {
    return panel.total_sms || 0;
  }
  loginPanelsInFlight.add(panelId);
  let added = 0;

  try {
    const scraperScript = path.join(RTX_DIR, 'panel_scraper.py');
    if (!fs.existsSync(scraperScript)) {
      panel.last_run = new Date().toISOString();
      panel.last_error = 'Scraper engine not installed';
      return 0;
    }
    const { stdout } = await execFileAsync('python3', [scraperScript, 'poll', JSON.stringify(panel)], { timeout: 60000 });
    const result = JSON.parse(stdout || '{}');

    if (result.success && Array.isArray(result.rows)) {
      // Reverse rows so newest unshifts to the top of smsLog
      const rowsToProcess = [...result.rows].reverse();
      for (const row of rowsToProcess) {
        if (!row.number || !row.message) continue;
        const key = md5(`${panel.id}|${row.number}|${row.date || ''}|${row.message}`);
        const panelRate = extractCrApiRate(row);
        const ingestRes = ingestSms({
          sender: row.cli,
          to_number: row.number,
          message: row.message,
          otp: row.otp || '',
          timestamp: row.date,
          range: row.range || row.range_name || '',
          country: row.country || '',
          provider: row.provider || panel.name || '',
          payout: panelRate,
          source: 'login_panel',
          panel_id: panel.id,
          panel_name: panel.name,
          ext_key: key
        });
        if (ingestRes && ingestRes.logged) {
          added++;
        }
      }
      panel.last_run = new Date().toISOString();
      panel.last_error = '';
      panel.total_sms = (panel.total_sms || 0) + added;
    } else {
      panel.last_run = new Date().toISOString();
      panel.last_error = (result && result.error) ? String(result.error).slice(0, 200) : 'Failed to parse table';
    }
  } catch (err) {
    panel.last_run = new Date().toISOString();
    const errorMsg = err.killed ? 'Connection timed out. Please try again.' : (err.message || 'Scraper failed');
    panel.last_error = String(errorMsg).slice(0, 200);
  } finally {
    loginPanelsInFlight.delete(panelId);
  }

  const allPanels = readDb('login_panels') || [];
  const idx = allPanels.findIndex(p => p.id === panelId);
  if (idx !== -1) {
    allPanels[idx] = panel;
    writeDb('login_panels', allPanels);
  }
  return added;
}

async function pollSingleCrApiConnection(connId, force = false) {
  const conns = readDb('cr_api_connections') || [];
  const conn = conns.find(c => c.id === connId);
  if (!conn || (!force && !conn.active)) return 0;
  let pulled = 0;

  try {
    const base = conn.panel_url.trim();
    const sep = base.includes('?') ? '&' : '?';
    // Use records=100 for reliable fast polling, deduplicating locally via ingestSms
    const hasTokenParam = /[?&]token=/i.test(base);
    const hasRecordsParam = /[?&]records=/i.test(base);
    const pollUrl = hasTokenParam
      ? (hasRecordsParam ? base : `${base}${sep}records=100`)
      : `${base}${sep}token=${encodeURIComponent(conn.token)}${hasRecordsParam ? '' : '&records=100'}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(pollUrl, { signal: controller.signal, headers: { 'User-Agent': 'MAIT-SMS/1.0' } });
    clearTimeout(timeout);

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }

    const json = await resp.json();
    const rowsCandidate = Array.isArray(json)
      ? json
      : (json && (json.data || json.aaData || json.rows || json.records || json.messages || json.list || json.result));
    const statusStr = json && json.status != null ? String(json.status).trim().toLowerCase() : '';
    const isOkStatus = Array.isArray(json)
      || statusStr === 'success'
      || statusStr === 'ok'
      || json?.status === true
      || json?.status === 1
      || (!statusStr && Array.isArray(rowsCandidate) && !json?.error);

    if (!isOkStatus) {
      const errTxt = (json && (json.msg || json.message || json.error)) || '';
      if (errTxt && /no records found|no data|empty/i.test(errTxt)) {
        conn.last_pulled_at = new Date().toISOString();
        conn.last_status = 'Active — Waiting for new SMS';
        const allConns = readDb('cr_api_connections') || [];
        const idx = allConns.findIndex(c => c.id === connId);
        if (idx !== -1) {
          allConns[idx] = conn;
          writeDb('cr_api_connections', allConns);
        }
        return 0;
      }
      throw new Error(errTxt || 'Panel returned non-success status');
    }

    const rows = Array.isArray(rowsCandidate) ? rowsCandidate : [];
    for (const row of rows) {
      let num = '';
      let cli = '';
      let msg = '';
      let dt = '';
      let rowRange = '';
      let rowCountry = '';
      let rowProvider = '';
      let rowCurrency = '';
      let payoutVal;

      if (Array.isArray(row)) {
        // Support [dt, num, cli, msg], [dt, num, cli, msg, payout], [dt, range, num, cli, msg, payout?]
        if (row.length === 5 && /^\+?\d{6,16}$/.test(String(row[1] || '').trim().replace(/[\s()-]/g, '')) && isLikelyRateToken(row[4])) {
          dt = String(row[0] || '').trim();
          num = String(row[1] || '').trim();
          cli = String(row[2] || '').trim();
          msg = String(row[3] || '').trim();
          payoutVal = extractCrApiRate(row);
        } else if (row.length >= 5) {
          dt = String(row[0] || '').trim();
          rowRange = String(row[1] || '').trim();
          num = String(row[2] || '').trim();
          cli = String(row[3] || '').trim();
          msg = String(row[4] || '').trim();
          payoutVal = extractCrApiRate(row);
        } else {
          dt = String(row[0] || '').trim();
          num = String(row[1] || '').trim();
          cli = String(row[2] || '').trim();
          msg = String(row[3] || '').trim();
        }
      } else if (row && typeof row === 'object') {
        num = String(row.num ?? row.number ?? row.to ?? row.destination ?? row.msisdn ?? row.phone ?? '').trim();
        cli = String(row.cli ?? row.sender ?? row.from ?? row.sender_id ?? row.sid ?? '').trim();
        msg = String(row.message ?? row.sms ?? row.text ?? row.msg ?? row.body ?? row.content ?? '').trim();
        dt = String(row.dt ?? row.timestamp ?? row.date ?? row.created_at ?? row.time ?? row.datetime ?? '').trim();
        rowRange = String(row.range_name ?? row.range ?? row.range_label ?? row.termination ?? '').trim();
        rowCountry = String(row.country ?? row.country_name ?? '').trim();
        rowProvider = String(row.provider ?? row.carrier ?? row.route ?? '').trim();
        rowCurrency = String(row.currency ?? row.curr ?? row.cur ?? '').trim().toUpperCase();
        payoutVal = extractCrApiRate(row);
      }

      if (!num || !msg) continue;

      const smsId = `crapi-${conn.id}-${md5(dt + num + cli + msg).slice(0, 16)}`;
      const ingestRes = ingestSms({
        sender: cli,
        to_number: num,
        message: msg,
        sms_id: smsId,
        company: conn.panel_name || 'CR API',
        provider: rowProvider || conn.panel_name || '',
        range: rowRange,
        country: rowCountry,
        currency: rowCurrency,
        source: 'cr_api',
        panel_id: conn.id,
        panel_name: conn.panel_name,
        timestamp: dt,
        payout: Number.isFinite(payoutVal) ? payoutVal : undefined
      });
      if (ingestRes && ingestRes.logged) {
        pulled++;
      }
    }

    conn.last_pulled_at = new Date().toISOString();
    conn.last_status = pulled > 0 ? `OK — pulled ${pulled} new message(s)` : 'Active — Up to date';
    conn.total_pulled = (conn.total_pulled || 0) + pulled;
  } catch (err) {
    conn.last_pulled_at = new Date().toISOString();
    conn.last_status = `Error — ${String(err.message).slice(0, 180)}`;
  }

  const allConns = readDb('cr_api_connections') || [];
  const idx = allConns.findIndex(c => c.id === connId);
  if (idx !== -1) {
    allConns[idx] = conn;
    writeDb('cr_api_connections', allConns);
  }
  return pulled;
}

// Background poller intervals — 10-second automatic real-time ingestion
setInterval(async () => {
  try {
    const panels = readDb('login_panels') || [];
    for (const p of panels) {
      if (p.status !== 'running') continue;
      if (loginPanelsInFlight.has(p.id)) continue;
      const intervalSec = Math.max(5, parseInt(p.interval) || 10);
      const lastRunMs = p.last_run ? new Date(p.last_run).getTime() : 0;
      if (Date.now() - lastRunMs >= intervalSec * 1000) {
        pollSingleLoginPanel(p.id)
          .catch(e => console.error('Login panel worker error:', e));
      }
    }
  } catch (e) {
    console.error('Login panel poller loop error:', e);
  }
}, 1500);

const crApiInFlight = new Set();
setInterval(async () => {
  try {
    const conns = readDb('cr_api_connections') || [];
    for (const c of conns) {
      if (!c.active) continue;
      if (crApiInFlight.has(c.id)) continue;
      const intervalSec = c.interval ? Math.max(3, parseInt(c.interval)) : 5;
      const lastPullMs = c.last_pulled_at ? new Date(c.last_pulled_at).getTime() : 0;
      if (Date.now() - lastPullMs >= intervalSec * 1000) {
        crApiInFlight.add(c.id);
        pollSingleCrApiConnection(c.id)
          .catch(e => console.error('CR API poller error:', e))
          .finally(() => crApiInFlight.delete(c.id));
      }
    }
  } catch (e) {
    console.error('CR API poller loop error:', e);
  }
}, 2000);

// ── Middleware ───────────────────────────────────────────────
// Enable high-efficiency gzip/deflate compression for fast responses over slow networks
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
  threshold: 512
}));

// Large bodies only on the few routes that really need them; everything else is capped at 1 MB
app.use(['/api/numbers/import-to-range', '/api/numbers/bulk-range-import', '/api/numbers/upload', '/api/backup/restore'], express.json({ limit: '25mb' }));
app.use(['/api/settings', '/api/settings/upload-logo'], express.json({ limit: '5mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
if (process.env.TRUST_PROXY === 'false') {
  app.set('trust proxy', false);
} else if (process.env.TRUST_PROXY && process.env.TRUST_PROXY !== 'true') {
  app.set('trust proxy', isNaN(Number(process.env.TRUST_PROXY)) ? process.env.TRUST_PROXY : Number(process.env.TRUST_PROXY));
} else {
  app.set('trust proxy', 1);
}

// ── Global Firewall Helpers & Middleware ─────────────────────
function isIpBlocked(ip) {
  if (!ip) return false;
  const cleanIp = String(ip).trim().replace(/^::ffff:/, '');
  const blocked = readDb('blocked_ips');
  if (!Array.isArray(blocked) || blocked.length === 0) return false;
  return blocked.some(b => {
    if (!b || !b.ip) return false;
    const bIp = String(b.ip).trim().replace(/^::ffff:/, '');
    return bIp === cleanIp || bIp === String(ip).trim();
  });
}

function logFirewallEvent(ip, reason = 'Blocked IP attempted access', targetPath = '') {
  try {
    const events = readDb('firewall_events') || [];
    const entry = {
      id: nextId(events),
      ip: String(ip).replace(/^::ffff:/, ''),
      event_type: 'ip_blocked',
      severity: 'high',
      reason: String(reason),
      path: String(targetPath),
      timestamp: new Date().toISOString()
    };
    events.unshift(entry);
    if (events.length > 500) events.length = 500;
    writeDb('firewall_events', events);
  } catch (err) {
    console.error('Failed to log firewall event:', err);
  }
}

// Global firewall: first check before static, API, or webhooks
app.use((req, res, next) => {
  const clientIp = req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
  if (isIpBlocked(clientIp)) {
    logFirewallEvent(clientIp, 'Global Firewall Block', req.originalUrl || req.url);
    return res.status(403).json({ error: 'Access denied — IP blocked' });
  }
  next();
});

const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const host = req.headers.host;
  let isAllowed = false;

  if (origin) {
    const originLower = origin.toLowerCase();
    const isSameOrigin = host && (
      originLower === `http://${host.toLowerCase()}` ||
      originLower === `https://${host.toLowerCase()}`
    );
    if (isSameOrigin || ALLOWED_ORIGINS.has(originLower)) {
      isAllowed = true;
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token, X-Manager-ID, X-Agent-ID, X-Client-ID, X-Inbound-Token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // X-Frame-Options omitted to allow embedding in AI Studio preview iframe
  if (req.method === 'OPTIONS') {
    return res.sendStatus(isAllowed || !origin ? 200 : 403);
  }
  next();
});

// Serve static assets from Alpha SMS/static with revalidation
const staticOpts = {
  etag: false,
  lastModified: true,
  maxAge: 0,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  }
};
// Intercept direct HTML file requests with strict role authorization
const DIRECT_HTML_ROLES = {
  'index.html': ['owner', 'admin'],
  'dashboard.html': ['owner', 'admin'],
  'manager.html': ['manager'],
  'agent.html': ['agent'],
  'client.html': ['client', 'reseller'],
  'testpanel.html': ['testpanel']
};

app.get(['/static/:file(*.html)', '/:file(*.html)'], (req, res, next) => {
  const baseName = path.basename(req.params.file || '').toLowerCase();
  if (baseName === 'login.html') {
    return sendInjectedHtml(res, path.join(STATIC_DIR, 'login.html'));
  }
  if (DIRECT_HTML_ROLES[baseName]) {
    const user = getSessionUser(req);
    if (!user) {
      return res.redirect('/login');
    }
    const userRole = (user.role || '').toLowerCase();
    const isOwner = userRole === 'owner' || userRole === 'admin';
    const allowed = DIRECT_HTML_ROLES[baseName];
    if (!allowed.includes(userRole) && !(isOwner && allowed.includes('owner'))) {
      return res.redirect(ROLE_HOME_URL[userRole] || '/login');
    }
  }
  const filePath = path.join(STATIC_DIR, path.basename(req.params.file || ''));
  if (fs.existsSync(filePath)) {
    return sendInjectedHtml(res, filePath);
  }
  next();
});

/* ══════════════════════════════════════════════════════════════════════════
   HUMEX SMS REBRANDING COMPATIBILITY ALIAS MIDDLEWARE (START)
   Maps legacy asset names to unified humex-sms conventions. Can be safely deleted once
   browsers and proxies have fully cleared cache.
   ══════════════════════════════════════════════════════════════════════════ */
const ASSET_RENAME_MAP = {
  // Brand Images
  'humax-sms-logo.png': 'humex-sms-logo.png',
  'custom-logo.png': 'humex-sms-logo.png',
  'humex-sms-dp.jpg': 'humex-sms-logo.png',
  'alphasms-logo.svg': 'humex-sms-logo.svg',
  'alphasms-circle-logo.svg': 'humex-sms-circle-logo.svg',
  'alphasms-icon.svg': 'humex-sms-icon.svg',
  // Stylesheets
  'speed-panel.css': 'humex-panel.css',
  'speed-admin-skin.css': 'humex-admin-skin.css',
  'apx-telecom.css': 'humex-telecom.css',
  'style.css': 'humex-global.css',
  // JavaScript - Owner
  'app.js': 'owner-engine.js',
  'speed-admin.js': 'owner-shell.js',
  'new_features.js': 'owner-features.js',
  // JavaScript - Manager
  'manager.js': 'manager-engine.js',
  'speed-panel.js': 'manager-shell.js',
  'speed-pages.js': 'manager-pages.js',
  'manager_features.js': 'manager-features.js',
  // JavaScript - Agent
  'agent.js': 'agent-engine.js',
  'speed-agent.js': 'agent-shell.js',
  'speed-agent-pages.js': 'agent-pages.js',
  'agent_features.js': 'agent-features.js',
  // JavaScript - Client
  'client.js': 'client-engine.js',
  'speed-client.js': 'client-shell.js',
  'speed-client-pages.js': 'client-pages.js',
  // JavaScript - Test Panel
  'speed-test.js': 'testpanel-shell.js',
  'speed-test-pages.js': 'testpanel-pages.js',
  // JavaScript - Shared
  'speed-kit.js': 'shared-ui-kit.js',
  'brand-theme.js': 'shared-brand-theme.js',
  'speed-auth-guard.js': 'shared-auth-guard.js',
  'speed-profile-security.js': 'shared-profile-security.js',
  'speed-url.js': 'shared-url-router.js',
  'speed-flash.js': 'shared-flash.js',
  'speed-loginpanel.js': 'shared-login-modal.js',
  'apx-grid.js': 'shared-grid.js'
};

app.use((req, res, next) => {
  const urlPath = req.path;
  const m = urlPath.match(/^(?:\/static)?\/(js|css|img)\/([^/?#]+)$/i);
  if (m) {
    const sub = m[1].toLowerCase();
    const oldBase = m[2];
    if (ASSET_RENAME_MAP[oldBase]) {
      if (sub === 'img' && fs.existsSync(path.join(uploadsDir, oldBase))) {
        return next();
      }
      if (fs.existsSync(path.join(STATIC_DIR, sub, oldBase))) {
        return next();
      }
      const newBase = ASSET_RENAME_MAP[oldBase];
      const targetPath = path.join(STATIC_DIR, sub, newBase);
      if (fs.existsSync(targetPath)) return res.sendFile(targetPath);
    }
  }
  next();
});
/* ══════════════════════════════════════════════════════════════════════════
   HUMEX SMS REBRANDING COMPATIBILITY ALIAS MIDDLEWARE (END)
   ══════════════════════════════════════════════════════════════════════════ */

const uploadsDir = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (_) {}
}
app.use('/static/img', express.static(uploadsDir, staticOpts));
app.use('/uploads', express.static(uploadsDir, staticOpts));
app.use('/static', express.static(STATIC_DIR, staticOpts));
app.use('/css', express.static(path.join(STATIC_DIR, 'css'), staticOpts));
app.use('/js', express.static(path.join(STATIC_DIR, 'js'), staticOpts));
app.use('/img', express.static(path.join(STATIC_DIR, 'img'), staticOpts));

// ── HTML Page Routes ──────────────────────────────────────────
const THEME_PALETTES = {
  dark_green: { accent: '#4ade80', primary: '#166534', primaryHover: '#14532d', glow: 'rgba(22, 101, 52, 0.3)', gradient: 'linear-gradient(135deg, #15803d 0%, #14532d 100%)' },
  green: { accent: '#4ade80', primary: '#166534', primaryHover: '#14532d', glow: 'rgba(22, 101, 52, 0.3)', gradient: 'linear-gradient(135deg, #15803d 0%, #14532d 100%)' },
  gold: { accent: '#f59e0b', primary: '#d97706', primaryHover: '#b45309', glow: 'rgba(245,158,11,0.25)', gradient: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)' },
  blue: { accent: '#38bdf8', primary: '#0284c7', primaryHover: '#0369a1', glow: 'rgba(56,189,248,0.25)', gradient: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)' },
  cyan: { accent: '#06b6d4', primary: '#0891b2', primaryHover: '#0e7490', glow: 'rgba(6,182,212,0.25)', gradient: 'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)' },
  purple: { accent: '#a855f7', primary: '#7e22ce', primaryHover: '#6b21a8', glow: 'rgba(168,85,247,0.25)', gradient: 'linear-gradient(135deg, #c084fc 0%, #7e22ce 100%)' },
  crimson: { accent: '#f87171', primary: '#dc2626', primaryHover: '#b91c1c', glow: 'rgba(248,113,113,0.25)', gradient: 'linear-gradient(135deg, #f87171 0%, #dc2626 100%)' },
  dark: { accent: '#94a3b8', primary: '#334155', primaryHover: '#1e293b', glow: 'rgba(148,163,184,0.25)', gradient: 'linear-gradient(135deg, #64748b 0%, #1e293b 100%)' }
};

const HEADER_GRADIENTS = {
  dark_green: 'linear-gradient(180deg, #1b4332 0%, #143627 50%, #081c15 100%)',
  emerald_dark: 'linear-gradient(180deg, #165b33 0%, #114224 50%, #0b2e18 100%)',
  clean_white_slate: 'linear-gradient(180deg, #475569 0%, #1e293b 50%, #0f172a 100%)',
  midnight_slate: 'linear-gradient(180deg, #1b4332 0%, #143627 50%, #081c15 100%)',
  green_wave: 'linear-gradient(180deg, #1b4332 0%, #143627 50%, #081c15 100%)',
  emerald_lime: 'linear-gradient(180deg, #165b33 0%, #14532d 50%, #081c15 100%)',
  sunset_amber: 'linear-gradient(180deg, #f59e0b 0%, #d97706 45%, #991b1b 100%)',
  ocean_cobalt: 'linear-gradient(180deg, #38bdf8 0%, #0284c7 45%, #0f172a 100%)',
  cyber_neon: 'linear-gradient(180deg, #a855f7 0%, #6366f1 50%, #1e1b4b 100%)',
  ruby_crimson: 'linear-gradient(180deg, #f87171 0%, #dc2626 50%, #450a0a 100%)',
  forest_teal: 'linear-gradient(180deg, #14b8a6 0%, #0d9488 50%, #134e4a 100%)'
};

const FONT_FAMILIES = {
  inter: "'Inter', sans-serif",
  poppins: "'Poppins', sans-serif",
  roboto: "'Roboto', sans-serif",
  outfit: "'Outfit', sans-serif",
  montserrat: "'Montserrat', sans-serif",
  opensans: "'Open Sans', sans-serif",
  jakarta: "'Plus Jakarta Sans', sans-serif",
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  monospace: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace"
};

function getThemeCss(settings) {
  const s = settings || {};
  const themeColor = s.theme_color || 'dark_green';
  const palette = THEME_PALETTES[themeColor] || THEME_PALETTES.dark_green || THEME_PALETTES.green;
  const headerPreset = s.header_gradient_preset || 'dark_green';
  const headerGrad = s.header_gradient || HEADER_GRADIENTS[headerPreset] || HEADER_GRADIENTS.dark_green;
  const headerTextColor = s.header_text_color || '#ffffff';
  const headerFontWeight = s.header_font_weight || '700';
  const fontKey = s.font_family || 'system';
  const fontFamily = FONT_FAMILIES[fontKey] || FONT_FAMILIES.system;

  return `
    :root {
      --brand-accent: ${palette.accent};
      --brand-primary: ${palette.primary};
      --brand-hover: ${palette.primaryHover};
      --brand-glow: ${palette.glow};
      --brand-gradient: ${palette.gradient};
      --header-gradient: ${headerGrad};
      --header-text-color: ${headerTextColor};
      --header-font-weight: ${headerFontWeight};
      --app-font: ${fontFamily};
    }
    body, button, input, select, textarea, .card, .dt, .zy-sidenav, .page-title, h1, h2, h3, h4 {
      font-family: var(--app-font) !important;
    }
    /* Crisp Professional Workspace: Clean White with High Contrast Dark Typography */
    body, .zy-main, .page-content, .zy-body {
      background-color: #ffffff !important;
      color: #0f172a !important;
    }
    .card, .dt, .panel, .zy-panel, .card-body {
      background-color: #ffffff !important;
      color: #0f172a !important;
      border-color: #e2e8f0 !important;
    }
    h1, h2, h3, h4, .page-title, .card-title {
      color: #0f172a !important;
    }
    .table, table.dt, table.zy-dt, table.zy-dt2-table {
      color: #0f172a !important;
      background-color: #ffffff !important;
    }
    table.zy-dt2-table td, table.dt td, .dt tbody td {
      color: #1e293b !important;
    }
    label, .form-label {
      color: #1e293b !important;
    }
    /* Sleek High-Definition Sidebar across all roles (Fixed to Corner) */
    .zy-side, .adminui .zy-side {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      bottom: 0 !important;
      width: 230px !important;
      z-index: 1050 !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      border-right: 1px solid #e2e8f0 !important;
      box-shadow: 2px 0 12px rgba(15, 23, 42, 0.05) !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
    }
    .zy-side-head, .adminui .zy-side-head {
      flex-shrink: 0 !important;
      background: #ffffff !important;
      border-bottom: 2px solid #f1f5f9 !important;
    }
    .zy-sidenav, .adminui .zy-sidenav {
      background: #ffffff !important;
      background-color: #ffffff !important;
      flex: 1 1 auto !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      padding-bottom: 12px !important;
    }
    .zy-side-head::after, .adminui .zy-side-head::after {
      background: var(--header-gradient) !important;
    }
    .zy-side-head .zy-welcome {
      color: #64748b !important;
      font-weight: 600 !important;
    }
    .zy-side-head .zy-role {
      color: #0f172a !important;
      font-weight: 800 !important;
    }
    /* ── Full-width Sidenav Headers (Dashboard, Notifications & Groups) — Chauras (Square) Boxy with Animation ── */
    .zy-sidenav .zy-snav, .adminui .zy-sidenav .zy-snav {
      display: flex !important;
      align-items: center !important;
      width: 100% !important;
      box-sizing: border-box !important;
      padding: 11px 14px !important;
      min-height: 42px !important;
      margin: 0 0 1px 0 !important;
      background: var(--header-gradient) !important;
      color: var(--header-text-color, #ffffff) !important;
      border-bottom: 1px solid rgba(0, 0, 0, 0.32) !important;
      border-radius: 0px !important;
      font-weight: 700 !important;
      font-size: 12px !important;
      letter-spacing: 0.35px !important;
      text-transform: uppercase !important;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15) !important;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5) !important;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    .zy-sidenav .zy-snav:hover, .adminui .zy-sidenav .zy-snav:hover {
      filter: brightness(1.15) !important;
      padding-left: 17px !important;
      transform: translateX(4px) !important;
      box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.25) !important;
      color: var(--header-text-color, #ffffff) !important;
    }
    .zy-sidenav .zy-snav.open, .adminui .zy-sidenav .zy-snav.open {
      background: var(--header-gradient) !important;
      filter: brightness(1.2) !important;
      box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.25) !important;
    }
    .zy-sidenav .zy-snav.active, .adminui .zy-sidenav .zy-snav.active {
      background: #ffffff !important;
      color: #14532d !important;
      border-left: 4px solid var(--brand-primary, #166534) !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
      text-shadow: none !important;
    }
    .zy-sidenav .zy-snav.active span,
    .zy-sidenav .zy-snav.active .zy-ic,
    .zy-sidenav .zy-snav.active .zy-ic i,
    .zy-sidenav .zy-snav.active .zy-caret,
    .adminui .zy-sidenav .zy-snav.active span,
    .adminui .zy-sidenav .zy-snav.active .zy-ic,
    .adminui .zy-sidenav .zy-snav.active .zy-ic i,
    .adminui .zy-sidenav .zy-snav.active .zy-caret {
      color: #14532d !important;
    }
    .zy-sidenav .zy-snav .zy-caret, .adminui .zy-sidenav .zy-snav .zy-caret {
      margin-left: auto !important;
      font-size: 11px !important;
      opacity: 0.9 !important;
      color: var(--header-text-color, #ffffff) !important;
      transition: transform 0.25s ease !important;
    }
    .zy-sidenav .zy-snav.open .zy-caret, .adminui .zy-sidenav .zy-snav.open .zy-caret {
      transform: rotate(180deg) !important;
    }

    /* ── FOLDER / SUB-MENU: PURE WHITE BOXES, BLACK FONT, SQUARE CHAURAS WITH ANIMATION ── */
    .zy-sidenav .zy-ssub, .adminui .zy-sidenav .zy-ssub {
      display: none;
    }
    .zy-sidenav .zy-ssub.open, .adminui .zy-sidenav .zy-ssub.open {
      display: block !important;
      background: #ffffff !important;
      position: relative !important;
      border-top: 1px solid #e2e8f0 !important;
      border-bottom: 2px solid #cbd5e1 !important;
      border-left: 3px solid #166534 !important;
      border-right: 1px solid #e2e8f0 !important;
      border-radius: 0px !important;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.04), 0 3px 6px rgba(0, 0, 0, 0.06) !important;
      padding: 4px 6px !important;
      animation: zyFolderBoxOpen 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
    }
    @keyframes zyFolderBoxOpen {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .zy-sidenav .zy-ssub div, .adminui .zy-sidenav .zy-ssub div {
      display: flex !important;
      align-items: center !important;
      background: #ffffff !important;
      color: #000000 !important;
      font-size: 12.5px !important;
      font-weight: 700 !important;
      letter-spacing: 0.2px !important;
      padding: 9px 12px 9px 18px !important;
      margin: 3px 0 !important;
      border: 1px solid #e5e7eb !important;
      border-radius: 0px !important;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
      cursor: pointer !important;
      text-shadow: none !important;
      transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
      position: relative !important;
    }
    .zy-sidenav .zy-ssub div:hover, .adminui .zy-sidenav .zy-ssub div:hover {
      background: #f8fafc !important;
      color: #000000 !important;
      border-color: #166534 !important;
      border-left: 4px solid #166534 !important;
      padding-left: 22px !important;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08) !important;
      transform: translateX(3px) !important;
      text-shadow: none !important;
    }
    .zy-sidenav .zy-ssub div.active, .adminui .zy-sidenav .zy-ssub div.active {
      background: #f0fdf4 !important;
      color: #14532d !important;
      border-color: #166534 !important;
      border-left: 4px solid #166534 !important;
      font-weight: 800 !important;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08) !important;
    }

    .zy-side-foot, .adminui .zy-side-foot {
      flex-shrink: 0 !important;
      width: 100% !important;
      min-height: 58px !important;
      height: auto !important;
      background: var(--header-gradient) !important;
      border-top: 1.5px solid rgba(255, 255, 255, 0.25) !important;
      box-shadow: 0 -3px 12px rgba(0, 0, 0, 0.28) !important;
      margin-top: auto !important;
      position: relative !important;
      z-index: 10 !important;
      display: block !important;
      opacity: 1 !important;
    }
    .zy-foot-profile {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      padding: 10px 14px !important;
      cursor: pointer !important;
      width: 100% !important;
      box-sizing: border-box !important;
      user-select: none !important;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    .zy-foot-profile:hover {
      background: rgba(255, 255, 255, 0.16) !important;
    }
    .zy-foot-ava {
      width: 36px !important;
      height: 36px !important;
      border-radius: 50% !important;
      background: rgba(255, 255, 255, 0.18) !important;
      border: 1.5px solid rgba(255, 255, 255, 0.65) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: #ffffff !important;
      font-size: 15px !important;
      flex-shrink: 0 !important;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
    }
    .zy-foot-ava i {
      color: #ffffff !important;
    }
    .zy-foot-meta {
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      gap: 2px !important;
      line-height: 1.25 !important;
      overflow: hidden !important;
      flex: 1 !important;
    }
    .zy-foot-title {
      font-size: 13.5px !important;
      font-weight: 800 !important;
      color: #ffffff !important;
      letter-spacing: 0.35px !important;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6) !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }
    .zy-foot-sub {
      font-size: 11.5px !important;
      font-weight: 700 !important;
      color: #4ade80 !important;
      letter-spacing: 0.25px !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5) !important;
      display: flex !important;
      align-items: center !important;
      gap: 5px !important;
    }
    .zy-foot-dot {
      display: inline-block !important;
      width: 7px !important;
      height: 7px !important;
      border-radius: 50% !important;
      background: #22c55e !important;
      box-shadow: 0 0 6px rgba(34, 197, 94, 0.8) !important;
      flex-shrink: 0 !important;
    }
    .zy-foot-action {
      color: #ffffff !important;
      font-size: 12px !important;
      opacity: 0.9 !important;
      transition: transform 0.2s ease, opacity 0.2s ease !important;
      flex-shrink: 0 !important;
    }
    .zy-foot-profile:hover .zy-foot-action {
      opacity: 1 !important;
      transform: translateX(4px) !important;
    }

    /* ── Top Header Bar & Corner Sidebar Toggle ── */
    .zy-head-left {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
    }
    .zy-side-toggle {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 38px !important;
      height: 38px !important;
      border-radius: 6px !important;
      background: rgba(255, 255, 255, 0.16) !important;
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      color: #ffffff !important;
      font-size: 16px !important;
      cursor: pointer !important;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
      flex-shrink: 0 !important;
      outline: none !important;
    }
    .zy-side-toggle:hover {
      background: rgba(255, 255, 255, 0.28) !important;
      border-color: rgba(255, 255, 255, 0.5) !important;
      transform: scale(1.05) !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25) !important;
    }
    .zy-side-toggle:active {
      transform: scale(0.95) !important;
    }

    /* ── Top Header Panel Name (No Logo Picture in Top Header) ── */
    .zy-logo, .zy-head-title {
      display: flex !important;
      align-items: center !important;
      margin-left: 2px !important;
      cursor: default !important;
      user-select: none !important;
    }
    .zy-logo svg, .zy-logo img, .zy-head-title img, .zy-head-title svg {
      display: none !important;
    }
    .zy-panel-badge {
      font-size: 16px !important;
      font-weight: 800 !important;
      color: #ffffff !important;
      letter-spacing: 0.8px !important;
      text-transform: uppercase !important;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4) !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      cursor: default !important;
    }
    .zy-panel-badge::before {
      content: "" !important;
      display: inline-block !important;
      width: 8px !important;
      height: 8px !important;
      border-radius: 50% !important;
      background: #4ade80 !important;
      box-shadow: 0 0 8px rgba(74, 222, 128, 0.8) !important;
    }

    .zy-header, .adminui .zy-header {
      background: var(--header-gradient) !important;
      color: var(--header-text-color, #ffffff) !important;
      position: relative;
    }
    .zy-header a:not(.zy-user-menu a),
    .zy-header span:not(.zy-user-menu span),
    .zy-header i:not(.zy-user-menu i),
    .adminui .zy-header a:not(.zy-user-menu a),
    .adminui .zy-header span:not(.zy-user-menu span),
    .adminui .zy-header i:not(.zy-user-menu i) {
      color: var(--header-text-color, #ffffff) !important;
    }
    .zy-hamb span {
      background: var(--header-text-color, #ffffff) !important;
    }

    /* ── CORNER PROFILE AVATAR ICON (HIDE USERNAME TEXT, SHOW SLEEK PROFILE AVATAR) ── */
    .zy-user, .adminui .zy-user {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 6px !important;
      padding: 4px 8px !important;
      background: rgba(0, 0, 0, 0.24) !important;
      border: 1.5px solid rgba(255, 255, 255, 0.35) !important;
      border-radius: 20px !important;
      color: var(--header-text-color, #ffffff) !important;
      cursor: pointer !important;
      transition: all 0.2s ease !important;
      user-select: none !important;
    }
    .zy-user:hover, .adminui .zy-user:hover {
      background: rgba(255, 255, 255, 0.22) !important;
      border-color: rgba(255, 255, 255, 0.55) !important;
      transform: translateY(-1px) !important;
    }
    .zy-user #mgr-username, .adminui .zy-user #mgr-username,
    .zy-user #agent-username, .adminui .zy-user #agent-username,
    .zy-user #client-username, .adminui .zy-user #client-username,
    .zy-user .zy-dot, .adminui .zy-user .zy-dot {
      display: none !important;
    }
    .zy-user .zy-ava, .adminui .zy-user .zy-ava,
    .zy-user .zy-ava-avatar, .adminui .zy-user .zy-ava-avatar {
      width: 28px !important;
      height: 28px !important;
      border-radius: 50% !important;
      background: rgba(255, 255, 255, 0.25) !important;
      border: 1px solid rgba(255, 255, 255, 0.5) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 13px !important;
      color: #ffffff !important;
    }
    .zy-user .fa-caret-down, .zy-user .zy-user-caret,
    .adminui .zy-user .fa-caret-down, .adminui .zy-user .zy-user-caret {
      font-size: 11px !important;
      opacity: 0.9 !important;
      color: var(--header-text-color, #ffffff) !important;
    }

    .zy-user-menu, .adminui .zy-user-menu {
      background: #1c2430 !important;
      border: 1px solid rgba(255, 255, 255, 0.18) !important;
      border-radius: 12px !important;
    }
    .zy-user-menu .zy-um-head, .adminui .zy-user-menu .zy-um-head {
      background: var(--header-gradient) !important;
      color: var(--header-text-color, #ffffff) !important;
    }
    .zy-user-menu a:hover, .adminui .zy-user-menu a:hover {
      background: var(--header-gradient) !important;
      color: var(--header-text-color, #ffffff) !important;
    }
    .btn-primary, .btn-submit, .submit-btn, .zy-btn-blue, button.primary {
      background: var(--brand-primary) !important;
      border-color: var(--brand-primary) !important;
    }
    .btn-primary:hover, .zy-btn-blue:hover, .submit-btn:hover {
      background: var(--brand-hover) !important;
      box-shadow: 0 4px 14px var(--brand-glow) !important;
    }
    body.rmsui .stat-value, .stat-value, .zy-strip-txt i, .zy-circle-txt b {
      color: var(--brand-primary) !important;
    }
    .zy-strip-up {
      color: var(--brand-accent, var(--brand-primary)) !important;
    }
    .tpui .zy-tile-on span {
      color: var(--brand-primary) !important;
    }
    .stat-card-ims.green, .stat-card-ims.blue {
      background: var(--header-gradient, linear-gradient(135deg, var(--brand-primary), var(--brand-hover))) !important;
    }
    .btn-success {
      background: var(--brand-primary) !important;
      border-color: var(--brand-primary) !important;
    }
    .btn-success:hover {
      background: var(--brand-hover) !important;
      border-color: var(--brand-hover) !important;
    }
    .zy-gentoken {
      background: var(--header-gradient, var(--brand-primary)) !important;
      border-color: var(--brand-primary) !important;
    }

    /* ── Universal Responsive Layout (PC vs Mobile) ── */
    @media (max-width: 991px) {
      .settings-two-col, body.rmsui .settings-two-col {
        display: flex !important;
        flex-direction: column !important;
        width: 100% !important;
        gap: 18px !important;
      }
      .settings-sticky-card {
        position: static !important;
        top: auto !important;
        width: 100% !important;
      }
      .settings-stops-grid {
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)) !important;
        gap: 10px !important;
      }
      .settings-subgrid-2 {
        grid-template-columns: 1fr !important;
        gap: 10px !important;
      }
      .settings-presets-grid {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) !important;
      }
      .two-col, .two-col-panel, .three-col, .form-row,
      body.rmsui .two-col, body.rmsui .two-col-panel, body.rmsui .three-col,
      .adminui .zy-dash-panels, .adminui .zy-dash-mid {
        display: flex !important;
        flex-direction: column !important;
        width: 100% !important;
        gap: 16px !important;
      }
      .stats-grid, body.rmsui .stats-grid, .adminui .zy-strips {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 12px !important;
      }
      .charts-grid {
        grid-template-columns: 1fr !important;
      }
      .page-content {
        padding: 14px 10px !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .zy-body {
        padding: 12px 8px !important;
      }
      .card, body.rmsui .card {
        padding: 14px 12px !important;
        margin-bottom: 14px !important;
        box-sizing: border-box !important;
        width: 100% !important;
      }
      .card-header, body.rmsui .card-header {
        margin: -14px -12px 14px !important;
        padding: 10px 12px !important;
      }
      .table-wrap, .zy-dt-wrap, body.rmsui .table-wrap, body.rmsui .zy-dt-wrap {
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
        width: 100% !important;
        display: block !important;
        border-radius: 6px !important;
      }
      table.zy-dt, table.zy-dt2-table, table {
        min-width: 520px;
      }
      .modal, #modal.zy-modal {
        width: calc(100% - 20px) !important;
        max-width: 100% !important;
        margin: 10px auto !important;
        max-height: 90vh !important;
        overflow-y: auto !important;
      }
      .page-header {
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 10px !important;
        margin-bottom: 16px !important;
      }
      .page-actions {
        width: 100% !important;
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 8px !important;
        justify-content: flex-start !important;
      }
      .page-actions .btn {
        flex: 1 1 auto !important;
        min-width: 120px !important;
        justify-content: center !important;
      }
    }
    @media (max-width: 640px) {
      .stats-grid, body.rmsui .stats-grid, .adminui .zy-strips,
      .zy-strips, .zy-circles, .adminui .zy-tiles, .zy-tiles,
      .settings-stops-grid, .settings-presets-grid,
      div[style*="grid-template-columns: 1fr 1fr"],
      div[style*="grid-template-columns:1fr 1fr"],
      div[style*="grid-template-columns: repeat(3, 1fr)"],
      div[style*="grid-template-columns:repeat(3, 1fr)"],
      div[style*="grid-template-columns:repeat(3,1fr)"],
      div[style*="grid-template-columns: repeat(4, 1fr)"],
      div[style*="grid-template-columns:repeat(4, 1fr)"],
      div[style*="grid-template-columns:repeat(4,1fr)"] {
        grid-template-columns: 1fr !important;
        display: flex !important;
        flex-direction: column !important;
        width: 100% !important;
      }
      .stat-card, body.rmsui .stat-card {
        width: 100% !important;
        box-sizing: border-box !important;
      }
      input[type="text"], input[type="number"], input[type="password"],
      input[type="email"], select, textarea {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      .form-group {
        width: 100% !important;
      }
      .zy-filterbar {
        grid-template-columns: 1fr !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 8px !important;
        padding: 10px 10px 18px !important;
      }
    }
  `;
}

function sendInjectedHtml(res, filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const settings = readDb('settings') || {};
    const css = getThemeCss(settings);
    const safeSettings = {
      site_name: settings.site_name || 'HUMEX SMS',
      logo_url: settings.logo_url || '/static/img/humex-sms-logo.png',
      theme_color: settings.theme_color || 'green',
      theme_mode: settings.theme_mode || 'light',
      font_family: settings.font_family || 'system',
      header_gradient_preset: settings.header_gradient_preset || 'clean_white',
      header_gradient: settings.header_gradient || 'linear-gradient(180deg, #ffffff 0%, #f8faf9 100%)',
      header_text_color: settings.header_text_color || '#1e293b',
      header_font_weight: settings.header_font_weight || '700',
      footer_text: settings.footer_text || `© ${new Date().getFullYear()} ${settings.site_name || 'HUMEX SMS'}. All rights reserved.`
    };

    // Determine clean page title dynamically on the server
    const baseName = path.basename(filePath).toLowerCase();
    let pageTitle = `${safeSettings.site_name} | Login`;
    if (baseName.includes('index')) pageTitle = `Owner Panel — ${safeSettings.site_name}`;
    else if (baseName.includes('manager')) pageTitle = `Manager Panel — ${safeSettings.site_name}`;
    else if (baseName.includes('agent')) pageTitle = `Agent Panel — ${safeSettings.site_name}`;
    else if (baseName.includes('client')) pageTitle = `Client Panel — ${safeSettings.site_name}`;
    else if (baseName.includes('testpanel')) pageTitle = `Test Panel — ${safeSettings.site_name}`;
    else if (baseName.includes('dashboard')) pageTitle = `Dashboard — ${safeSettings.site_name}`;

    // Cleanly replace title and favicon in HTML before sending
    content = content.replace(/<title>[\s\S]*?<\/title>/i, `<title>${pageTitle}</title>`);
    content = content.replace(/<link[^>]*rel=["']icon["'][^>]*>/i, `<link rel="icon" type="image/svg+xml" href="${safeSettings.logo_url}">`);
    content = content.replace(/WARRIOR SMS|Warrior SMS|warrior sms|𝑴𝑨𝑰𝑻 𝑺𝑴𝑺|MAIT SMS|Astra SMS|ASTRA SMS|ALPHA SMS|Alpha SMS|HUMEX SMS|Humex SMS|HUMAX SMS|Humax SMS/g, safeSettings.site_name);
    content = content.replace(/<span class="zy-panel-badge">[\s\S]*?<\/span>/g, `<span class="zy-panel-badge"><img src="${safeSettings.logo_url}" class="zy-badge-logo" alt="${safeSettings.site_name}"> <span class="zy-badge-name">${safeSettings.site_name}</span></span>`);
    content = content.replace(/id="login-logo-img"[^>]*src="[^"]*"/i, `id="login-logo-img" src="${safeSettings.logo_url}"`);
    content = content.replace(/<div class="zy-avatar-lg"[^>]*>[\s\S]*?<\/div>/g, `<div class="zy-avatar-lg" style="background-color: #ffffff;"><img src="${safeSettings.logo_url}" alt="${safeSettings.site_name}" class="zy-ava-dp-img" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;background-color:#ffffff;"></div>`);
    content = content.replace(/<span class="zy-ava"[^>]*>[\s\S]*?<\/span>/g, `<span class="zy-ava" title="Profile" style="background-color: #ffffff;"><img src="${safeSettings.logo_url}" alt="${safeSettings.site_name}" class="zy-ava-dp-img" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;background-color:#ffffff;"></span>`);

    // Synchronous head injection right at top of <head> to eliminate FOUC and lag
    const injection = `
  <script>
    window.__BRAND_SETTINGS__ = ${JSON.stringify(safeSettings)};
    try { localStorage.setItem('app_brand_settings', JSON.stringify(window.__BRAND_SETTINGS__)); } catch(e){}
  </script>
  <style id="zero-fouc-shield">
    :root {
      --header-gradient: ${safeSettings.header_gradient} !important;
      --header-text-color: ${safeSettings.header_text_color} !important;
      --header-font-weight: ${safeSettings.header_font_weight} !important;
      --brand-primary: #00a86b !important;
      --brand-hover: #059669 !important;
      --brand-accent: #34d399 !important;
      --zy-blue-top: #00a86b !important;
      --zy-blue-bot: #059669 !important;
      --zy-blue: #00a86b !important;
    }
    .zy-header, .adminui .zy-header,
    .zy-header-row, .adminui .zy-header-row,
    .zy-side-head, .adminui .zy-side-head,
    .zy-side-foot, .adminui .zy-side-foot {
      background: #ffffff !important;
      color: #1e293b !important;
      border-bottom: 1.5px solid #d5e4dd !important;
    }
    .zy-head-title, .zy-role, .zy-welcome, .adminui .zy-user, .zy-user {
      color: #1e293b !important;
    }
    .zy-panel-badge {
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      font-size: 16px !important;
      font-weight: 800 !important;
      color: #0f172a !important;
      letter-spacing: 0.5px !important;
    }
    .zy-badge-logo {
      height: 32px !important;
      width: auto !important;
      max-width: 140px !important;
      object-fit: contain !important;
      display: inline-block !important;
      vertical-align: middle !important;
    }
    @media (max-width: 768px) {
      .zy-badge-logo {
        height: 26px !important;
        max-width: 110px !important;
      }
    }
    .zy-user .zy-ava, .adminui .zy-user .zy-ava, .zy-avatar-circle {
      width: 38px !important;
      height: 38px !important;
      min-width: 38px !important;
      border-radius: 50% !important;
      background: #ffffff !important;
      border: 2px solid #00a86b !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: 0 2px 8px rgba(0, 168, 107, 0.25) !important;
      flex-shrink: 0 !important;
      overflow: hidden !important;
      padding: 1px !important;
    }
    .zy-user .zy-ava img, .adminui .zy-user .zy-ava img, .zy-user .zy-ava-dp-img {
      width: 100% !important;
      height: 100% !important;
      border-radius: 50% !important;
      object-fit: cover !important;
      display: block !important;
      filter: none !important;
    }
    .zy-avatar-lg {
      width: 48px !important;
      height: 48px !important;
      min-width: 48px !important;
      border-radius: 50% !important;
      background: #ffffff !important;
      border: 2px solid #00a86b !important;
      overflow: hidden !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 2px !important;
      box-shadow: 0 3px 10px rgba(0, 168, 107, 0.2) !important;
    }
    .zy-avatar-lg img {
      width: 100% !important;
      height: 100% !important;
      border-radius: 50% !important;
      object-fit: cover !important;
      display: block !important;
      filter: none !important;
    }
    .zy-side, .adminui .zy-side,
    .zy-sidenav, .adminui .zy-sidenav {
      background: #ffffff !important;
      background-color: #ffffff !important;
    }
  </style>
  <style id="dynamic-brand-styles">${css}</style>
`;
    if (content.includes('<head>')) {
      content = content.replace('<head>', `<head>\n${injection}`);
    } else if (content.includes('</head>')) {
      content = content.replace('</head>', `${injection}\n</head>`);
    } else {
      content = injection + content;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.send(content);
  } catch (err) {
    console.error('sendInjectedHtml error:', err);
    res.sendFile(filePath);
  }
}

const PANELS = {
  owner: path.join(STATIC_DIR, 'index.html'),
  admin: path.join(STATIC_DIR, 'index.html'),
  manager: path.join(STATIC_DIR, 'manager.html'),
  agent: path.join(STATIC_DIR, 'agent.html'),
  client: path.join(STATIC_DIR, 'client.html'),
  test: path.join(STATIC_DIR, 'testpanel.html'),
  testpanel: path.join(STATIC_DIR, 'testpanel.html'),
};

// ── Auth APIs & Session Management ──────────────────────────────
const activeSessions = new Map();
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const SESSION_IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4h

function hashSessionToken(token) {
  if (!token || typeof token !== 'string') return '';
  return crypto.createHash('sha256').update(token).digest('hex');
}

function loadPersistedSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      const now = Date.now();
      for (const [hashedToken, sess] of Object.entries(data)) {
        if (sess && now - (sess.created || now) < SESSION_MAX_AGE_MS && now - (sess.lastActive || now) < SESSION_IDLE_TIMEOUT_MS) {
          activeSessions.set(hashedToken, sess);
        }
      }
    }
  } catch (e) {
    console.warn('Error loading sessions:', e.message);
  }
}

function savePersistedSessions() {
  try {
    const obj = {};
    const now = Date.now();
    for (const [hashedToken, sess] of activeSessions.entries()) {
      if (now - (sess.created || now) < SESSION_MAX_AGE_MS && now - (sess.lastActive || now) < SESSION_IDLE_TIMEOUT_MS) {
        obj[hashedToken] = sess;
      }
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (_) {}
}

loadPersistedSessions();

function parseCookies(req) {
  const list = {};
  const rc = req && req.headers && req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const key = parts.shift().trim();
      const val = decodeURIComponent(parts.join('='));
      if (key) list[key] = val;
    });
  }
  return list;
}

function getSessionToken(req) {
  const auth = (req && req.headers && req.headers['authorization']) || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const xSession = (req && req.headers && (req.headers['x-session-token'] || req.headers['x-auth-token'])) || '';
  if (xSession) return String(xSession).trim();
  const cookies = parseCookies(req);
  return cookies['alpha_session_token'] || cookies['session_token'] || (req && req.query && (req.query.token || req.query.session_token)) || null;
}

function getSessionUser(req) {
  const rawToken = getSessionToken(req);
  if (!rawToken) return null;
  const hashedToken = hashSessionToken(rawToken);
  if (hashedToken && activeSessions.has(hashedToken)) {
    const session = activeSessions.get(hashedToken);
    const now = Date.now();
    if (now - (session.created || now) > SESSION_MAX_AGE_MS || now - (session.lastActive || now) > SESSION_IDLE_TIMEOUT_MS) {
      activeSessions.delete(hashedToken);
      savePersistedSessions();
      return null;
    }

    // Verify account active status from DB
    const role = (session.role || '').toLowerCase();
    let dbUser = null;
    if (role === 'owner' || role === 'admin' || role === 'manager') {
      const users = readDb('users') || [];
      dbUser = users.find(u => Number(u.id) === Number(session.id) || String(u.username || '').toLowerCase() === String(session.username || '').toLowerCase());
    } else if (role === 'agent') {
      const agents = readDb('agents') || [];
      dbUser = agents.find(a => Number(a.id) === Number(session.id) || String(a.username || '').toLowerCase() === String(session.username || '').toLowerCase());
    } else if (role === 'client') {
      const clients = readDb('clients') || [];
      dbUser = clients.find(c => Number(c.id) === Number(session.id) || String(c.username || '').toLowerCase() === String(session.username || '').toLowerCase());
    } else if (role === 'testpanel') {
      const tps = readDb('testpanel_credentials') || [];
      dbUser = tps.find(t => Number(t.id) === Number(session.id) || String(t.username || '').toLowerCase() === String(session.username || '').toLowerCase());
    }

    if (dbUser && (dbUser.status === 'suspended' || dbUser.status === 'inactive' || dbUser.status === 'deactivated' || dbUser.status === 'disabled')) {
      activeSessions.delete(hashedToken);
      savePersistedSessions();
      return null;
    }

    session.lastActive = now;
    return session;
  }
  return null;
}

const ROLE_HOME_URL = {
  owner: '/ints/owner/SMSDashboard',
  admin: '/ints/owner/SMSDashboard',
  manager: '/ints/manager/SMSDashboard',
  agent: '/ints/agent/SMSDashboard',
  client: '/ints/client/SMSDashboard',
  reseller: '/ints/client/SMSDashboard',
  testpanel: '/ints/testpanel/SMSDashboard'
};

// ── Strict Role Guard Middleware for Express Routes ────────────
function requireRole(allowedRoles) {
  const normalizedAllowed = allowedRoles.map(r => r.toLowerCase());
  return (req, res, next) => {
    const user = getSessionUser(req);
    if (!user) {
      return res.redirect('/ints/login');
    }
    const userRole = (user.role || '').toLowerCase();
    const isOwner = userRole === 'owner' || userRole === 'admin';
    if (!normalizedAllowed.includes(userRole) && !(isOwner && normalizedAllowed.includes('owner'))) {
      return res.redirect(ROLE_HOME_URL[userRole] || '/ints/login');
    }
    next();
  };
}

// ── Strict API Auth & Role Middleware ───────────────────────────
function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  req.sessionUser = user;
  next();
}

function requireApiRole(allowedRoles) {
  const allowed = allowedRoles.map(r => r.toLowerCase());
  return (req, res, next) => {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    const userRole = (user.role || '').toLowerCase();
    const isOwner = userRole === 'owner' || userRole === 'admin';
    if (!allowed.includes(userRole) && !(isOwner && allowed.includes('owner'))) {
      return res.status(403).json({ error: 'Forbidden. Your role does not have permission.' });
    }
    req.sessionUser = user;
    next();
  };
}

// ── Role Page Routes with Strict Server-Side Isolation (/ints/ namespace) ───────────
app.get('/ints/login', (req, res) => {
  // If navigating directly to login, always deliver the login screen freshly
  res.setHeader('Set-Cookie', [
    `alpha_session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`,
    `alpha_session_role=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
  ]);
  sendInjectedHtml(res, path.join(STATIC_DIR, 'login.html'));
});

// Health check endpoints (public, 200 OK for dev server & proxy readiness probes)
app.get(['/health', '/ping'], (req, res) => {
  res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

// Any direct access to /login or / redirects immediately to /ints/login
app.get('/login', (req, res) => {
  res.redirect('/ints/login');
});

app.get('/', (req, res) => {
  const user = getSessionUser(req);
  if (user) {
    const role = (user.role || '').toLowerCase();
    return res.redirect(ROLE_HOME_URL[role] || '/ints/owner/SMSDashboard');
  }
  return res.redirect('/ints/login');
});

// Non-ints panel routes: Direct access without /ints redirects to /ints/login
app.get(['/owner', '/dashboard', '/manager', '/agent', '/client', '/testpanel', '/testpanel/*'], (req, res) => {
  const user = getSessionUser(req);
  if (user) {
    const role = (user.role || '').toLowerCase();
    return res.redirect(ROLE_HOME_URL[role] || '/ints/login');
  }
  return res.redirect('/ints/login');
});

app.get(['/public', '/public/*'], (req, res) => {
  sendInjectedHtml(res, path.join(STATIC_DIR, 'testpanel.html'));
});

app.get('/ints', (req, res) => res.redirect('/ints/login'));
app.get('/ints/test', requireRole(['testpanel']), (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'testpanel.html')));
app.get('/ints/test/*', requireRole(['testpanel']), (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'testpanel.html')));
app.get('/ints/testpanel', requireRole(['testpanel']), (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'testpanel.html')));
app.get('/ints/testpanel/*', requireRole(['testpanel']), (req, res) => sendInjectedHtml(res, path.join(STATIC_DIR, 'testpanel.html')));

app.get('/ints/:role', (req, res) => {
  const targetRole = (req.params.role || '').toLowerCase();
  const user = getSessionUser(req);
  if (!user) {
    return res.redirect('/ints/login');
  }
  const userRole = (user.role || '').toLowerCase();
  const isOwnerOrAdmin = r => r === 'admin' || r === 'owner';
  if (userRole !== targetRole && !(isOwnerOrAdmin(userRole) && isOwnerOrAdmin(targetRole))) {
    return res.redirect(ROLE_HOME_URL[userRole] || '/ints/login');
  }
  if (PANELS[targetRole]) {
    return res.redirect(`/ints/${targetRole}/SMSDashboard`);
  }
  res.redirect('/ints/login');
});

app.get('/ints/:role/:page', (req, res) => {
  const targetRole = (req.params.role || '').toLowerCase();
  const user = getSessionUser(req);
  if (!user) {
    return res.redirect('/ints/login');
  }
  const rawToken = getSessionToken(req);
  if (rawToken && req.query && req.query.token) {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const sec = isHttps ? '; Secure; Partitioned' : '';
    const sameSite = isHttps ? 'None' : 'Lax';
    res.setHeader('Set-Cookie', [
      `alpha_session_token=${rawToken}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=86400${sec}`,
      `alpha_session_role=${user.role || targetRole}; Path=/; SameSite=${sameSite}; Max-Age=86400${sec}`,
      `session_token=${rawToken}; Path=/; SameSite=${sameSite}; Max-Age=86400${sec}`
    ]);
  }
  const userRole = (user.role || '').toLowerCase();
  const isOwnerOrAdmin = r => r === 'admin' || r === 'owner';
  if (userRole !== targetRole && !(isOwnerOrAdmin(userRole) && isOwnerOrAdmin(targetRole))) {
    return res.redirect(ROLE_HOME_URL[userRole] || '/ints/login');
  }
  if (PANELS[targetRole]) {
    return sendInjectedHtml(res, PANELS[targetRole]);
  }
  res.redirect('/ints/login');
});

function isUsernameTaken(newUsername, excludeId = null, currentTable = null) {
  if (!newUsername) return false;
  const raw = String(newUsername).trim().toLowerCase();
  const clean = raw.replace(/[\s-]+/g, '_');
  const pure = clean.replace(/[^a-z0-9]/g, '');
  if (!clean) return false;

  // Protect Owner & Admin fixed handles across entire system
  const isEditingOwner = (excludeId === 1 || String(excludeId) === '1') && currentTable === 'users';
  if (!isEditingOwner) {
    if (clean === 'kamran_bhatti' || pure === 'kamranbhatti' || clean === 'owner' || clean === 'admin') {
      return true;
    }
  }

  const tables = ['users', 'agents', 'clients', 'testpanel_credentials', 'registration_requests'];
  for (const tbl of tables) {
    const rows = readDb(tbl) || [];
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      if (!r || !r.username) continue;
      const exRaw = String(r.username).trim().toLowerCase();
      const exClean = exRaw.replace(/[\s-]+/g, '_');
      const exPure = exClean.replace(/[^a-z0-9]/g, '');
      if (exClean === clean || (pure && exPure === pure) || exRaw === raw) {
        if (excludeId !== null && currentTable === tbl && (r.id === excludeId || String(r.id) === String(excludeId))) {
          continue;
        }
        return true;
      }
    }
  }
  return false;
}

app.get('/api/check-username', (req, res) => {
  const u = String(req.query.username || '').trim();
  const excludeId = req.query.exclude_id ? Number(req.query.exclude_id) : null;
  const table = req.query.table ? String(req.query.table).trim() : null;
  if (!u) {
    return res.json({ available: false, exists: false, error: 'Username is required', message: 'Username is required' });
  }
  const taken = isUsernameTaken(u, excludeId, table);
  if (taken) {
    return res.json({
      available: false,
      exists: true,
      error: 'This username already exists',
      message: 'This username already exists. Please choose a different username.'
    });
  }
  return res.json({
    available: true,
    exists: false,
    message: 'Username is available'
  });
});

function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let index = 0;
  const clean = (str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  const output = new Uint8Array(((clean.length * 5) / 8) | 0);
  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function verifyTotp(token, secret, window = 1) {
  if (!token || !secret) return false;
  try {
    const key = base32Decode(secret);
    if (!key || key.length === 0) return false;
    const epoch = Math.floor(Date.now() / 1000);
    const timeStep = 30;
    const currentCounter = Math.floor(epoch / timeStep);

    for (let w = -window; w <= window; w++) {
      const counter = currentCounter + w;
      const buf = Buffer.alloc(8);
      buf.writeBigInt64BE(BigInt(counter), 0);
      const hmac = crypto.createHmac('sha1', key).update(buf).digest();
      const offset = hmac[hmac.length - 1] & 0xf;
      const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
      if (code === String(token).trim()) return true;
    }
  } catch (e) {
    console.error('verifyTotp error:', e);
  }
  return false;
}

function generateBase32Secret(len = 20) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(len);
  let res = '';
  for (let i = 0; i < len; i++) {
    res += alphabet[bytes[i] % 32];
  }
  return res;
}

function findUserAnywhere(identifier) {
  if (!identifier) return null;
  const q = String(identifier).trim().toLowerCase();
  const tables = ['users', 'agents', 'clients', 'testpanel_credentials'];
  for (const tbl of tables) {
    const rows = readDb(tbl) || [];
    const found = rows.find(x => {
      if (!x) return false;
      const u = String(x.username || '').trim().toLowerCase();
      const e = String(x.email || '').trim().toLowerCase();
      return u === q || e === q || (u === 'kamran_bhatti' && (q === 'kamran' || q === 'owner'));
    });
    if (found) {
      return { user: found, table: tbl, role: found.role || (tbl === 'agents' ? 'Agent' : tbl === 'clients' ? 'Client' : 'Owner') };
    }
  }
  return null;
}

function updateUserRecord(table, userId, updates) {
  const rows = readDb(table) || [];
  const idx = rows.findIndex(x => x && (x.id === userId || String(x.id) === String(userId)));
  if (idx !== -1) {
    rows[idx] = { ...rows[idx], ...updates };
    writeDb(table, rows);
    return rows[idx];
  }
  return null;
}

function safeUser(u) {
  if (!u || typeof u !== 'object') return u;
  if (Array.isArray(u)) return u.map(safeUser);
  const copy = { ...u };
  for (const k of Object.keys(copy)) {
    const lk = k.toLowerCase();
    if (
      lk === 'password' ||
      lk === 'two_fa_secret' ||
      lk === 'two_fa_backup_codes' ||
      lk === 'pending_2fa_secret' ||
      lk.includes('token') ||
      lk.includes('secret') ||
      lk.includes('otp')
    ) {
      delete copy[k];
    }
  }
  return copy;
}

// ── Global API Guard: deny by default + role matrix ─────────────
function normRole(r) { r = String(r || '').toLowerCase(); return r === 'admin' ? 'owner' : r; }
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// First matching rule wins. Roles are lower-case; 'owner' includes the legacy 'admin'.
const API_RULES = [
  { p: /^\/(backup|login-panels|cr-api-connections|webhook|firewall|smpp)(\/|$)/, roles: ['owner'] },
  { p: /^\/(reports|dashboard|cli-routes)(\/|$)/, roles: ['owner'] },
  { p: /^\/numbers\/(upload|import-to-range|bulk-range-import|bulk-delete-many|download|test|blacklist)(\/.*)?$/, roles: ['owner'] },
  { p: /^\/numbers\/(bulk-allocate|allocation-history)(\/.*)?$/, roles: ['owner', 'manager', 'agent'] },
  { m: WRITE_METHODS, p: /^\/(audit-logs|login-activity)(\/|$)/, roles: ['owner'] },
  { p: /^\/(rate-limits|testpanel-accounts)(\/|$)/, roles: ['owner'] },
  { m: WRITE_METHODS, p: /^\/(settings|permissions|payout-rates|services|registration-requests|payterms)(\/|$)/, roles: ['owner'] },
  { m: WRITE_METHODS, p: /^\/numbers\/(sms-ranges|rate-card)(\/.*)?$/, roles: ['owner'] },
  { m: WRITE_METHODS, p: /^\/number-transfers(\/|$)/, roles: ['owner', 'manager'] },
  { m: new Set(['POST']), p: /^\/notifications$/, roles: ['owner'] },
  { m: new Set(['PATCH', 'DELETE']), p: /^\/payout-requests(\/|$)/, roles: ['owner', 'manager'] },
  { m: new Set(['POST']), p: /^\/payout-requests(\/|$)/, roles: ['owner', 'manager', 'agent', 'client'] },
  { m: WRITE_METHODS, p: /^\/announcements(\/|$)/, roles: ['owner', 'manager', 'agent'] },
  { m: WRITE_METHODS, p: /^\/payments(\/|$)/, roles: ['owner', 'manager', 'agent'] }
];
// Client and TestPanel are default-deny: only these routes exist for them.
const CLIENT_ALLOW = [
  { p: /^\/(auth|user|account|notifications|support-tickets)(\/|$)/ },
  { m: new Set(['GET']), p: /^\/(settings|announcements|payterms)(\/|$)/ },
  { m: new Set(['GET']), p: /^\/numbers$/ },
  { m: new Set(['GET']), p: /^\/numbers\/sms-ranges$/ },
  { m: new Set(['GET']), p: /^\/numbers\/rate-card$/ },
  { m: new Set(['GET']), p: /^\/numbers\/allocation-policy$/ },
  { m: new Set(['POST']), p: /^\/numbers\/(agent-allocate|request)$/ },
  { m: new Set(['POST']), p: /^\/numbers\/(\d+\/)?return$/ },
  { m: new Set(['GET']), p: /^\/agent-requests(\/\d+)?$/ },
  { m: new Set(['GET', 'POST']), p: /^\/client-requests(\/\d+)?$/ },
  { m: new Set(['GET']), p: /^\/sms\/(logs|export|client-logs|daily-stats|period-stats|client-stats|stats|test-logs|test-numbers|test-stats)$/ },
  { m: new Set(['GET', 'PATCH']), p: /^\/clients(\/\d+)?$/ },
  { m: new Set(['GET']), p: /^\/client\/\d+\// },
  { m: new Set(['GET']), p: /^\/(cli-search|credit-notes)(\/|$)/ },
  { m: new Set(['GET', 'POST']), p: /^\/payout-requests(\/|$)/ },
  { m: new Set(['GET']), p: /^\/payments(\/|$)/ }
];
const TEST_ALLOW = [
  { p: /^\/(auth|user|account|notifications)(\/|$)/ },
  { m: new Set(['GET']), p: /^\/(settings|announcements|payterms)(\/|$)/ },
  { m: new Set(['GET']), p: /^\/numbers\/sms-ranges$/ },
  { p: /^\/sms\/(test-logs|test-numbers|test-stats|period-stats)(\/.*)?$/ }
];
function ruleHit(list, p, method) { return list.some(r => (!r.m || r.m.has(method)) && r.p.test(p)); }

function getInboundToken() {
  if (process.env.INBOUND_TOKEN) return String(process.env.INBOUND_TOKEN);
  const cfg = readDb('webhook_config');
  return (cfg && !Array.isArray(cfg) && cfg.inbound_token) ? String(cfg.inbound_token) : '';
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

app.use('/api', (req, res, next) => {
  const p = req.path;
  const method = req.method.toUpperCase();

  // 0. Public health check / ping
  if ((p === '/health' || p === '/ping') && method === 'GET') {
    return res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()) });
  }

  // 1. Public auth endpoints
  if (p === '/auth/login' || p === '/auth/logout' || p === '/auth/me' || p === '/auth/captcha') {
    return next();
  }
  // 2. Branding for the login page (the route itself filters what an anonymous caller may see)
  if ((p === '/settings' || p === '/settings/min-payout' || p === '/payterms') && (method === 'GET' || method === 'HEAD')) return next();

  // 3. Inbound carrier webhook: a shared secret is REQUIRED
  if (p === '/sms/inbound' || p === '/inbound' || p === '/sms/receive') {
    const expected = getInboundToken();
    if (!expected) {
      console.error('[SECURITY] Inbound webhook refused: INBOUND_TOKEN is not configured.');
      return res.status(503).json({ status: 'error', error: 'Inbound webhook is disabled until INBOUND_TOKEN is configured.' });
    }
    const sent = String(req.headers['x-inbound-token'] || '');
    if (!sent || !safeEqual(sent, expected)) return res.status(403).json({ status: 'error', error: 'Forbidden. Invalid inbound token.' });
    return next();
  }
  // 4. Token-authenticated API routes (the route itself verifies the token)
  if ((p === '/sms' && method === 'GET') || p === '/sms/viewstats' || p.startsWith('/crapi/')) return next();

  // 5. Everything else needs a session
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  req.sessionUser = user;
  const role = normRole(user.role);

  // 6. Client / TestPanel: allow-list only
  if (role === 'client' && !ruleHit(CLIENT_ALLOW, p, method)) return res.status(403).json({ error: 'Forbidden for your role.' });
  if (role === 'testpanel' && !ruleHit(TEST_ALLOW, p, method)) return res.status(403).json({ error: 'Forbidden for your role.' });

  // 7. Owner / Manager / Agent: rule table
  for (const r of API_RULES) {
    if ((!r.m || r.m.has(method)) && r.p.test(p)) {
      if (!r.roles.includes(role)) return res.status(403).json({ error: 'Forbidden. Your role cannot do this.' });
      break;
    }
  }
  // 8. Test numbers: only Owner or the TestPanel account may change them
  if (/^\/sms\/test-numbers/.test(p) && WRITE_METHODS.has(method) && role !== 'owner' && role !== 'testpanel') {
    return res.status(403).json({ error: 'Forbidden. Owner or TestPanel required.' });
  }
  next();
});

// ── In-Memory Math Captcha Challenge Store ───────────────────────
const activeCaptchas = new Map();
function cleanExpiredCaptchas() {
  const now = Date.now();
  for (const [id, c] of activeCaptchas.entries()) {
    if (now > c.expires) activeCaptchas.delete(id);
  }
}
setInterval(cleanExpiredCaptchas, 5 * 60 * 1000);

app.get('/api/auth/captcha', (req, res) => {
  cleanExpiredCaptchas();
  const n1 = crypto.randomInt(1, 13);
  const n2 = crypto.randomInt(1, 13);
  const answer = n1 + n2;
  const id = crypto.randomBytes(16).toString('hex');
  activeCaptchas.set(id, { answer, expires: Date.now() + 10 * 60 * 1000 });
  res.json({ id, question: `What is ${n1} + ${n2} =` });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password, two_fa_code, captcha_id, captcha_answer } = req.body || {};
  const u = (username || '').trim();
  const p = (password || '').trim();

  if (!u || !p) {
    return res.status(400).json({ success: false, error: 'Username and password are required', detail: 'Username and password are required' });
  }

  // Strict math captcha verification with auto-pruning
  cleanExpiredCaptchas();
  if (captcha_id !== undefined || captcha_answer !== undefined || activeCaptchas.size > 0) {
    if (!captcha_id || captcha_answer === undefined || String(captcha_answer).trim() === '') {
      return res.status(400).json({ success: false, error: 'Please enter the correct answer to the math captcha.', detail: 'Missing captcha' });
    }
    const capRecord = activeCaptchas.get(String(captcha_id));
    if (!capRecord || Date.now() > capRecord.expires) {
      if (capRecord) activeCaptchas.delete(String(captcha_id));
      return res.status(400).json({ success: false, error: 'Captcha expired. Please refresh and try again.', detail: 'Captcha expired' });
    }
    const parsedAns = parseInt(String(captcha_answer).trim(), 10);
    if (isNaN(parsedAns) || parsedAns !== capRecord.answer) {
      activeCaptchas.delete(String(captcha_id));
      return res.status(400).json({ success: false, error: 'Incorrect captcha answer. Please try again.', detail: 'Invalid captcha' });
    }
    // Captcha is single-use: consume immediately upon verification
    activeCaptchas.delete(String(captcha_id));
  }

  const clientIp = req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
  if (isIpBlocked(clientIp)) {
    logFirewallEvent(clientIp, 'Login Blocked IP', '/api/auth/login');
    return res.status(403).json({ success: false, error: 'Access denied — IP blocked', detail: 'Access denied — IP blocked' });
  }

  // Rate limit: max 10 attempts per minute per IP
  if (isRateLimited('login:' + clientIp, 10, 60 * 1000)) {
    return res.status(429).json({ success: false, error: 'Too many login attempts. Please wait 1 minute before trying again.', detail: 'Rate limit exceeded' });
  }

  // Exact or normalized username lookup across role tables
  const cleanU = u.toLowerCase().replace(/[\s-]+/g, '_');
  const users = readDb('users') || [];
  let user = users.find(x => {
    if (!x || !x.username) return false;
    const name = String(x.username).trim().toLowerCase();
    return name === cleanU || name.replace(/_/g, '') === cleanU.replace(/_/g, '') ||
           (name === 'kamran_bhatti' && (cleanU === 'kamran' || cleanU === 'kamran_bhatti' || cleanU === 'owner' || cleanU === 'admin'));
  });
  let source = 'users';

  if (!user) {
    const agents = readDb('agents') || [];
    user = agents.find(x => x && x.username && String(x.username).trim().toLowerCase() === cleanU);
    if (user) source = 'agents';
  }

  if (!user) {
    const clients = readDb('clients') || [];
    user = clients.find(x => x && x.username && String(x.username).trim().toLowerCase() === cleanU);
    if (user) source = 'clients';
  }

  if (!user) {
    const tp = readDb('testpanel_credentials') || [];
    user = tp.find(x => x && x.username && String(x.username).trim().toLowerCase() === cleanU);
    if (user) source = 'testpanel_credentials';
  }

  // ── FIX 9 Option C: IP + user.id lockout key (after lookup, before bcrypt/2FA, exempts owner/admin) ──
  const isOwnerOrAdmin = user && (
    (source === 'users' && (String(user.role || '').toLowerCase() === 'owner' || String(user.role || '').toLowerCase() === 'admin' || user.id === 1)) ||
    cleanU === 'kamran_bhatti' || cleanU === 'kamran' || cleanU === 'owner' || cleanU === 'admin'
  );

  const userLockKey = user
    ? ('login_user:' + clientIp + ':' + user.id)
    : ('login_user:' + clientIp + ':unknown:' + cleanU);

  const maxLoginAttempts = isOwnerOrAdmin ? 10 : 5;
  const userBucket = rateLimitBuckets.get(userLockKey);
  if (userBucket && (Date.now() - userBucket.start < 15 * 60 * 1000) && userBucket.count >= maxLoginAttempts) {
    return res.status(429).json({ success: false, error: 'Too many failed login attempts. Please wait 15 minutes before trying again.', detail: 'Rate limit exceeded' });
  }

  // Password Verification: strict bcrypt verification
  let passwordValid = false;
  if (user && user.password) {
    if (verifyPassword(p, user.password)) {
      passwordValid = true;
    }
  }

  if (passwordValid && user.password && !user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
    // Automatically upgrade plaintext to bcrypt hash upon successful login
    updateUserRecord(source, user.id, { password: hashPassword(p) });
  }

  if (passwordValid) {
    if (user.status === 'suspended' || user.status === 'inactive' || user.status === 'deactivated') {
      return res.status(403).json({ success: false, error: 'Account inactive or suspended', detail: 'Account inactive or suspended' });
    }

    // ── TWO-FACTOR AUTHENTICATION (2FA) CHECK ──
    if (user.two_fa && user.two_fa_secret) {
      if (!two_fa_code) {
        return res.json({
          success: false,
          require_2fa: true,
          message: 'Enter your 2FA code.'
        });
      }
      const is2faValid = verifyTotp(two_fa_code, user.two_fa_secret) ||
        (Array.isArray(user.two_fa_backup_codes) && user.two_fa_backup_codes.includes(String(two_fa_code).trim()));
      if (!is2faValid) {
        isRateLimited(userLockKey, maxLoginAttempts, 15 * 60 * 1000);
        return res.status(401).json({
          success: false,
          require_2fa: true,
          error: 'Invalid 2FA code. Please check your Authenticator app.'
        });
      }
    }

    // Unambiguous Role Resolution
    let role = 'Owner';
    if (source === 'agents') {
      role = 'Agent';
    } else if (source === 'clients') {
      role = 'Client';
    } else if (source === 'testpanel_credentials') {
      role = 'TestPanel';
    } else if (source === 'users') {
      const r = String(user.role || '').trim().toLowerCase();
      if (r === 'manager') {
        role = 'Manager';
      } else {
        role = 'Owner'; // Both 'Owner' and 'Admin' are treated as 'Owner'
      }
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = hashSessionToken(sessionToken);
    const userPayload = {
      id: user.id || 1,
      username: user.username,
      role: role,
      token: sessionToken,
      email: user.email || '',
      two_fa: !!user.two_fa,
      source: source,
      manager_id: user.manager_id || null,
      agent_id: user.agent_id || null,
      commission_rate: user.commission_rate || 5.0
    };

    activeSessions.set(hashedToken, {
      ...userPayload,
      created: Date.now(),
      lastActive: Date.now()
    });
    savePersistedSessions();

    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const sec = isHttps ? '; Secure; Partitioned' : '';
    const sameSite = isHttps ? 'None' : 'Lax';

    // Set secure HTTP session cookies with HttpOnly protection (iframe friendly)
    res.setHeader('Set-Cookie', [
      `alpha_session_token=${sessionToken}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=86400${sec}`,
      `alpha_session_role=${role}; Path=/; SameSite=${sameSite}; Max-Age=86400${sec}`,
      `session_token=${sessionToken}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=86400${sec}`
    ]);

    rateLimitBuckets.delete(userLockKey);
    logAudit(user.username, 'Login Success', `Logged in as ${role}`, 'Auth');

    return res.json({
      success: true,
      token: sessionToken,
      user: userPayload,
      role: role,
      username: user.username,
      id: user.id || 1,
      manager_id: user.manager_id || null,
      agent_id: user.agent_id || null,
      commission_rate: user.commission_rate || 5.0
    });
  }

  isRateLimited(userLockKey, maxLoginAttempts, 15 * 60 * 1000);
  logAudit(u, 'Login Failed', 'Invalid username or password', 'Auth');
  return res.status(401).json({ success: false, error: 'Invalid username or password', detail: 'Invalid username or password' });
});

// ── USER PROFILE & SECURITY APIS ────────────────────────────────
app.get('/api/user/profile', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const found = findUserAnywhere(sessionUser.username);
  if (!found) return res.status(404).json({ success: false, error: 'User not found' });

  const u = found.user;
  res.json({
    success: true,
    user: {
      id: u.id,
      username: u.username,
      role: found.role,
      full_name: u.full_name || u.name || '',
      email: u.email || '',
      phone: u.phone || u.contact || '',
      teams: u.teams || '',
      two_fa: !!u.two_fa,
      status: u.status || 'active'
    }
  });
});

app.post('/api/user/profile/update', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const found = findUserAnywhere(sessionUser.username);
  if (!found) return res.status(404).json({ success: false, error: 'User not found' });

  const { full_name, phone, teams, email } = req.body || {};
  const updates = {};
  if (full_name !== undefined) updates.full_name = String(full_name).trim();
  if (phone !== undefined) updates.phone = String(phone).trim();
  if (teams !== undefined) updates.teams = String(teams).trim();
  if (email !== undefined) {
    const cleanEmail = String(email).trim().toLowerCase();
    if (cleanEmail && (!cleanEmail.includes('@') || !cleanEmail.includes('.'))) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
    }
    updates.email = cleanEmail;
  }

  updateUserRecord(found.table, found.user.id, updates);
  res.json({ success: true, message: 'Profile updated successfully' });
});

// ── 2FA SETUP & TOGGLE ──────────────────────────────────────────
app.post('/api/user/2fa/setup', async (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const found = findUserAnywhere(sessionUser.username);
  if (!found) return res.status(404).json({ success: false, error: 'User not found' });

  const { password } = req.body || {};
  if (!password || !verifyPassword(password, found.user.password)) {
    return res.status(400).json({ success: false, error: 'Please enter your correct account password' });
  }

  const secret = generateBase32Secret(20);
  const settings = readDb('settings') || {};
  const appName = settings.site_name || 'HUMEX SMS';
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(appName)}:${encodeURIComponent(found.user.username)}?secret=${secret}&issuer=${encodeURIComponent(appName)}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    updateUserRecord(found.table, found.user.id, { pending_2fa_secret: secret });

    res.json({
      success: true,
      secret: secret,
      qr: qrDataUrl
    });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate 2FA QR code' });
  }
});

app.post('/api/user/2fa/enable', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const found = findUserAnywhere(sessionUser.username);
  if (!found) return res.status(404).json({ success: false, error: 'User not found' });

  const { code } = req.body || {};
  const secret = found.user.pending_2fa_secret;
  if (!secret) {
    return res.status(400).json({ success: false, error: 'No 2FA setup in progress. Please click Set up 2FA first.' });
  }

  if (!verifyTotp(code, secret)) {
    return res.status(400).json({ success: false, error: 'Invalid 6-digit code. Check your Google Authenticator app.' });
  }

  const backupCodes = [
    `BK-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    `BK-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    `BK-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  ];

  updateUserRecord(found.table, found.user.id, {
    two_fa: true,
    two_fa_secret: secret,
    two_fa_backup_codes: backupCodes,
    pending_2fa_secret: null
  });

  logAudit(sessionUser.username, '2FA Enabled', 'Two-Factor Authentication successfully enabled', 'Security');

  res.json({
    success: true,
    message: 'Two-Factor Authentication is now ENABLED!',
    backup_codes: backupCodes
  });
});

app.post('/api/user/2fa/disable', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const found = findUserAnywhere(sessionUser.username);
  if (!found) return res.status(404).json({ success: false, error: 'User not found' });

  const { password, code } = req.body || {};
  if (!password || !verifyPassword(password, found.user.password)) {
    return res.status(400).json({ success: false, error: 'Invalid password' });
  }

  const isValidCode = verifyTotp(code, found.user.two_fa_secret) ||
    (Array.isArray(found.user.two_fa_backup_codes) && found.user.two_fa_backup_codes.includes(String(code).trim()));

  if (!isValidCode) {
    return res.status(400).json({ success: false, error: 'Invalid password or code.' });
  }

  updateUserRecord(found.table, found.user.id, {
    two_fa: false,
    two_fa_secret: null,
    two_fa_backup_codes: []
  });

  logAudit(sessionUser.username, '2FA Disabled', 'Two-Factor Authentication disabled', 'Security');
  res.json({ success: true, message: 'Two-Factor Authentication has been DISABLED' });
});

app.post('/api/user/password/change', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const found = findUserAnywhere(sessionUser.username);
  if (!found) return res.status(404).json({ success: false, error: 'User not found' });

  const { current_password, new_password } = req.body || {};
  if (!current_password || !verifyPassword(current_password, found.user.password)) {
    return res.status(400).json({ success: false, error: 'Current password is incorrect' });
  }
  if (!new_password || String(new_password).trim().length < 6) {
    return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long' });
  }

  updateUserRecord(found.table, found.user.id, { password: hashPassword(String(new_password).trim()) });
  logAudit(sessionUser.username, 'Password Changed', 'User updated account password', 'Security');
  res.json({ success: true, message: 'Password updated successfully!' });
});

function handleSessionLogout(req, res) {
  const token = getSessionToken(req);
  if (token) {
    const hashed = hashSessionToken(token);
    activeSessions.delete(hashed);
    savePersistedSessions();
  }
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const sec = isHttps ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    `alpha_session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${sec}`,
    `alpha_session_role=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${sec}`,
    `session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${sec}`
  ]);
  res.json({ success: true, message: 'Logged out successfully' });
}

app.post('/api/auth/logout', handleSessionLogout);
app.post('/api/logout', handleSessionLogout);

app.get('/api/auth/me', (req, res) => {
  const sessionUser = getSessionUser(req);
  if (!sessionUser) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  res.json({
    success: true,
    id: sessionUser.id,
    username: sessionUser.username,
    role: sessionUser.role,
    manager_id: sessionUser.manager_id || null,
    agent_id: sessionUser.agent_id || null,
    alloc_mode: sessionUser.alloc_mode || null,
    alloc_daily_limit: sessionUser.alloc_daily_limit ?? null,
    alloc_total_limit: sessionUser.alloc_total_limit ?? null,
    permissions: sessionUser.role === 'Owner' ? ['all'] : [sessionUser.role.toLowerCase()]
  });
});

app.post('/api/account/change-password', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const b = req.body || {};
  const current_password = b.current_password || b.currentPassword || b.oldPassword || b.old_password;
  const new_password = b.new_password || b.newPassword;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  if (String(new_password).trim().length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }
  const table = sessionUser.source || (sessionUser.role === 'Agent' ? 'agents' : sessionUser.role === 'Client' ? 'clients' : sessionUser.role === 'TestPanel' ? 'testpanel_credentials' : 'users');
  const data = readDb(table);
  const user = data.find(x => Number(x.id) === Number(sessionUser.id));
  if (!user || !verifyPassword(current_password, user.password)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  user.password = hashPassword(new_password);
  writeDb(table, data);
  logAudit(sessionUser.username, 'Password Changed', 'User changed own password', 'Auth');
  res.json({ success: true });
});

// ── Scoped SMS Helper (Fix 2 & Fix 5 & F3) ──────────────────────
function getScopedSmsList(req, fromDate = null) {
  const sessionUser = req.sessionUser || getSessionUser(req);
  if (!sessionUser) return [];
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isManager = sRole === 'manager';
  const isAgent = sRole === 'agent';
  const isClient = sRole === 'client';

  const queryFrom = fromDate || (req.query && (req.query.date_from || req.query.from || req.query.dt1));
  let list = readSmsWithArchive(queryFrom);

  if (isOwner) {
    const qManagerId = req.query.manager_id;
    const qAgentId = req.query.agent_id;
    const qClientId = req.query.client_id;
    if (qManagerId && qManagerId !== 'undefined' && qManagerId !== 'null') {
      list = list.filter(s => Number(s.manager_id) === Number(qManagerId));
    }
    if (qAgentId && qAgentId !== 'undefined' && qAgentId !== 'null') {
      list = list.filter(s => Number(s.agent_id) === Number(qAgentId));
    }
    if (qClientId && qClientId !== 'undefined' && qClientId !== 'null') {
      list = list.filter(s => Number(s.client_id) === Number(qClientId));
    }
  } else if (isManager) {
    const myId = Number(sessionUser.id);
    list = list.filter(s => Number(s.manager_id) === myId);
    const qAgentId = req.query.agent_id;
    const qClientId = req.query.client_id;
    if (qAgentId && qAgentId !== 'undefined' && qAgentId !== 'null') {
      list = list.filter(s => Number(s.agent_id) === Number(qAgentId));
    }
    if (qClientId && qClientId !== 'undefined' && qClientId !== 'null') {
      list = list.filter(s => Number(s.client_id) === Number(qClientId));
    }
  } else if (isAgent) {
    const myId = Number(sessionUser.id);
    list = list.filter(s => Number(s.agent_id) === myId);
    const qClientId = req.query.client_id;
    if (qClientId && qClientId !== 'undefined' && qClientId !== 'null') {
      list = list.filter(s => Number(s.client_id) === Number(qClientId));
    }
  } else if (isClient) {
    const myId = Number(sessionUser.id);
    const myUname = String(sessionUser.username || '').trim().toLowerCase();
    list = list.filter(s => Number(s.client_id) === myId || (s.client_username && s.client_username.trim().toLowerCase() === myUname));
  } else {
    list = [];
  }
  return list;
}

// ── Dashboard Stats ───────────────────────────────────────────
app.get('/api/dashboard/stats', (req, res) => {
  const numbers = readDb('numbers') || [];
  const sms = readDb('sms_log') || [];
  const users = readDb('users') || [];
  const sessions = readDb('smpp_sessions') || [];
  const reg_req = readDb('registration_requests') || [];
  const pay_req = readDb('payout_requests') || [];
  const blocked = readDb('blocked_ips') || [];

  const { todaySet, yesterdaySet, weekStartStr, monthStartStr, yearStartStr } = getDateRangeBuckets();

  let todayCount = 0;
  let yesterdayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let yearCount = 0;
  let revenueToday = 0;

  for (const s of sms) {
    const dStr = extractDateStr(s);
    if (!dStr) continue;
    if (todaySet.has(dStr)) {
      todayCount++;
      revenueToday += (Number(s.profit || s.carrier_revenue) || 0);
    } else if (yesterdaySet.has(dStr)) {
      yesterdayCount++;
    }
    if (dStr >= weekStartStr) weekCount++;
    if (dStr >= monthStartStr) monthCount++;
    if (dStr >= yearStartStr) yearCount++;
  }

  const delivered = sms.filter(s => s.status === 'delivered');
  const success_rate = sms.length ? Math.round((delivered.length / sms.length) * 1000) / 10 : 0;

  const trafficData = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(Date.now() - i * 3600000);
    const hourKey = d.toISOString().slice(0, 13);
    trafficData.push(sms.filter(s => (s.timestamp || '').slice(0, 13) === hourKey).length);
  }

  const profitData = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dayKey = d.toISOString().slice(0, 10);
    const daySum = sms
      .filter(s => extractDateStr(s) === dayKey)
      .reduce((acc, s) => acc + (Number(s.profit || s.carrier_revenue) || 0), 0);
    profitData.push(Math.round(daySum * 100) / 100);
  }

  const appCounts = {};
  sms.forEach(s => {
    const app = s.app || 'WhatsApp';
    appCounts[app] = (appCounts[app] || 0) + 1;
  });

  // Reconciled Number Counts (Fix 5 & Fix 11)
  const allocatable = numbers.filter(n => !n.fixed_for_test && !n.is_test_panel && !isTestNumber(n.number));
  const unallocated = allocatable.filter(n => !n.manager_id && !n.agent_id && !n.client_id);
  const allocated = allocatable.filter(n => n.manager_id || n.agent_id || n.client_id);
  const allocated_to_managers = allocatable.filter(n => n.manager_id && !n.agent_id && !n.client_id);
  const allocated_to_agents = allocatable.filter(n => n.agent_id && !n.client_id);
  const allocated_to_clients = allocatable.filter(n => n.client_id);

  res.json({
    total_numbers: allocatable.length,
    active_numbers: numbers.filter(n => n.status === 'active').length,
    unallocated_numbers: unallocated.length,
    unallocated: unallocated.length,
    allocated_numbers: allocated.length,
    allocated: allocated.length,
    allocated_to_managers: allocated_to_managers.length,
    allocated_to_agents: allocated_to_agents.length,
    allocated_to_clients: allocated_to_clients.length,
    total_sms: sms.length,
    sms_today: todayCount,
    total_sms_today: todayCount,
    today_sms: todayCount,
    yesterday_sms: yesterdayCount,
    yesterday: yesterdayCount,
    this_week: weekCount,
    this_week_sms: weekCount,
    this_month: monthCount,
    this_month_sms: monthCount,
    this_year: yearCount,
    this_year_sms: yearCount,
    revenue_today: Math.round(revenueToday * 100) / 100,
    delivered_sms: delivered.length,
    success_rate: success_rate,
    total_users: users.length,
    smpp_sessions: sessions.length,
    traffic_24h: trafficData,
    profit_30d: profitData,
    app_distribution: appCounts,
    pending_requests: reg_req.filter(x => x.status === 'pending').length + pay_req.filter(x => x.status === 'pending').length,
    blocked_ips_count: blocked.length
  });
});

// ── Daily Stats Endpoint (/api/sms/daily-stats) ───────────────
app.get('/api/sms/daily-stats', (req, res) => {
  const sms = getScopedSmsList(req);
  const { todaySet, yesterdaySet, weekStartStr, monthStartStr, yearStartStr } = getDateRangeBuckets();

  let todayCount = 0;
  let yesterdayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let yearCount = 0;

  for (const s of sms) {
    const dStr = extractDateStr(s);
    if (!dStr) continue;
    if (todaySet.has(dStr)) todayCount++;
    else if (yesterdaySet.has(dStr)) yesterdayCount++;

    if (dStr >= weekStartStr) weekCount++;
    if (dStr >= monthStartStr) monthCount++;
    if (dStr >= yearStartStr) yearCount++;
  }

  const weeklyTraffic = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const count = sms.filter(s => extractDateStr(s) === dateStr).length;
    weeklyTraffic.push(count);
  }

  res.json({
    today: todayCount,
    yesterday: yesterdayCount,
    this_week: weekCount,
    this_month: monthCount,
    this_year: yearCount,
    year: yearCount,
    all_time: sms.length,
    weekly_traffic: weeklyTraffic
  });
});

// ── Period Stats Endpoint (/api/sms/period-stats) ─────────────
app.get('/api/sms/period-stats', (req, res) => {
  const now = new Date();
  const nowUtc = now.getTime();

  const sessionUser = req.sessionUser || getSessionUser(req) || {};
  const sRole = (sessionUser.role || '').toLowerCase();
  const userId = sessionUser.id != null ? String(sessionUser.id) : '0';
  const qMgr = req.query.manager_id || '';
  const qAgt = req.query.agent_id || '';
  const qCli = req.query.client_id || '';
  const cacheKey = `${userId}:${sRole}:${qMgr}:${qAgt}:${qCli}`;

  const nowMs = Date.now();
  const cached = periodStatsCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs && req.query.fresh !== '1') {
    return res.json(cached.data);
  }

  // 1. Today: calendar day in UTC + local
  const todayStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const todayStartMs = todayStartUtc.getTime();
  const todayDateStr = todayStartUtc.toISOString().slice(0, 10);
  const localTodayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todaySet = new Set([todayDateStr, localTodayStr]);

  // 2. Weekly SMS: calendar week Monday 00:00 UTC to now
  const dayOffset = (now.getUTCDay() + 6) % 7;
  const mondayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOffset, 0, 0, 0, 0));
  const weekStartMs = mondayUtc.getTime();
  const weekStartStr = mondayUtc.toISOString().slice(0, 10);

  // 3. Monthly SMS: calendar month
  const monthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const monthStartMs = monthStartUtc.getTime();
  const monthStartStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;

  // 4. Yearly SMS: calendar year (reads archives for the current year)
  const yearStartUtc = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
  const yearStartMs = yearStartUtc.getTime();
  const yearStartStr = `${now.getUTCFullYear()}-01-01`;

  const isTestPanel = sRole === 'testpanel';
  const smsList = isTestPanel ? (readDb('test_sms_logs') || []) : getScopedSmsList(req, yearStartStr);

  let todayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let yearCount = 0;
  let earningsSum = 0;

  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isManager = sRole === 'manager';
  const isAgent = sRole === 'agent';
  const isClient = sRole === 'client';

  for (const s of smsList) {
    if (!s) continue;
    const dStr = extractDateStr(s);
    let sMs = null;
    const raw = s.timestamp || s.date || '';
    if (raw) {
      if (typeof raw === 'number') {
        sMs = raw < 1e11 ? raw * 1000 : raw;
      } else if (/^\d{10,13}$/.test(raw)) {
        const n = Number(raw);
        sMs = n < 1e11 ? n * 1000 : n;
      } else {
        const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + (raw.length <= 19 ? 'Z' : '');
        const p = Date.parse(iso);
        if (!isNaN(p)) sMs = p;
        else {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) sMs = d.getTime();
        }
      }
    }

    const isToday = (dStr && todaySet.has(dStr)) || (sMs !== null && sMs >= todayStartMs && sMs <= nowUtc + 86400000);
    const isWeek = (sMs !== null) ? (sMs >= weekStartMs && sMs <= nowUtc + 86400000) : (dStr && dStr >= weekStartStr);
    const isMonth = (sMs !== null) ? (sMs >= monthStartMs && sMs <= nowUtc + 86400000) : (dStr && dStr >= monthStartStr);
    const isYear = (sMs !== null) ? (sMs >= yearStartMs && sMs <= nowUtc + 86400000) : (dStr && dStr >= yearStartStr);

    if (isToday) todayCount++;
    if (isWeek) weekCount++;
    if (isMonth) monthCount++;
    if (isYear) {
      yearCount++;
      if (isOwner) {
        earningsSum += Number(s.profit != null ? s.profit : (s.carrier_revenue != null ? s.carrier_revenue : s.owner_amount)) || 0;
      } else if (isManager) {
        earningsSum += Number(s.manager_amount != null ? s.manager_amount : (s.commission_amount != null ? s.commission_amount : 0)) || 0;
      } else if (isAgent) {
        earningsSum += Number(s.agent_amount != null ? s.agent_amount : (s.payout != null ? s.payout : 0)) || 0;
      } else if (isClient) {
        earningsSum += Number(s.client_amount != null ? s.client_amount : (s.client_payout != null ? s.client_payout : (s.payout != null ? s.payout : 0))) || 0;
      } else {
        earningsSum += Number(s.payout || s.profit || 0);
      }
    }
  }

  const result = {
    today: todayCount,
    week: weekCount,
    month: monthCount,
    year: yearCount,
    earnings: Math.round(earningsSum * 100) / 100,
    today_sms: todayCount,
    weekly_sms: weekCount,
    monthly_sms: monthCount,
    yearly_sms: yearCount
  };

  periodStatsCache.set(cacheKey, { expiresAt: nowMs + 30000, data: result });
  res.json(result);
});

// ── Test Stats Endpoint (/api/sms/test-stats) ─────────────────
app.get('/api/sms/test-stats', (req, res) => {
  const logs = readDb('test_sms_logs') || [];
  const { todaySet, yesterdaySet, weekStartStr, monthStartStr, yearStartStr } = getDateRangeBuckets();

  let todayCount = 0;
  let yesterdayCount = 0;
  let weekCount = 0;
  let monthCount = 0;
  let yearCount = 0;

  for (const s of logs) {
    const dStr = extractDateStr(s);
    if (!dStr) continue;
    if (todaySet.has(dStr)) todayCount++;
    else if (yesterdaySet.has(dStr)) yesterdayCount++;

    if (dStr >= weekStartStr) weekCount++;
    if (dStr >= monthStartStr) monthCount++;
    if (dStr >= yearStartStr) yearCount++;
  }

  const weekLabels = [];
  const weekData = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    weekLabels.push(dayNames[d.getDay()]);
    const dateStr = d.toISOString().slice(0, 10);
    weekData.push(logs.filter(s => extractDateStr(s) === dateStr).length);
  }

  res.json({
    today: todayCount,
    yesterday: yesterdayCount,
    this_week: weekCount,
    this_month: monthCount,
    this_year: yearCount,
    year: yearCount,
    total: logs.length,
    delivered: logs.length,
    failed: 0,
    pending: 0,
    week_labels: weekLabels,
    week_data: weekData,
    total_carrier_revenue: Math.round(logs.reduce((acc, s) => acc + (Number(s.carrier_rate) || 0), 0) * 10000) / 10000,
    total_payout: Math.round(logs.reduce((acc, s) => acc + (Number(s.payout_rate) || 0), 0) * 10000) / 10000
  });
});

// ── Providers List Endpoint (/api/providers) ──────────────────
app.get('/api/providers', (req, res) => {
  try {
    const ranges = readDb('sms_ranges') || [];
    const numbers = readDb('numbers') || [];
    const crConns = readDb('cr_api_connections') || [];
    const smppAccs = readDb('smpp_accounts') || [];
    const provSet = new Set();

    // Dynamically add providers from connected CR API panels (panel_name is the provider)
    crConns.forEach(c => {
      const name = (c.panel_name || '').trim();
      if (name && name !== 'CR API Panel' && name !== 'Manual' && name !== '—') {
        provSet.add(name);
      } else if (name) {
        provSet.add(name);
      }
    });

    // Dynamically add providers from SMPP accounts (company or system_id is the provider)
    smppAccs.forEach(s => {
      const name = (s.company || s.system_id || '').trim();
      if (name && name !== 'Manual' && name !== '—') provSet.add(name);
    });

    // Dynamically add providers from active SMS ranges
    ranges.forEach(r => {
      const p = (r.provider || '').trim();
      if (p && p !== 'Manual' && p !== '—') provSet.add(p);
    });

    // Dynamically add providers from existing numbers
    numbers.forEach(n => {
      const p = (n.provider || '').trim();
      if (p && p !== 'Manual' && p !== '—') provSet.add(p);
    });

    const list = Array.from(provSet).sort().map((name, idx) => ({ id: idx + 1, name, provider_name: name }));
    res.json({ data: list, total: list.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Payout Rates Endpoint (/api/payout-rates) ─────────────────
app.get('/api/payout-rates', (req, res) => {
  let data = readDb('payout_rates');
  if (!data || Array.isArray(data) || !data.service_rates) {
    data = {
      admin_to_manager: { default_rate: 0.05, description: 'Admin pays manager per OTP delivered', currency: 'USD' },
      manager_to_agent: { default_rate: 0.03, description: 'Manager pays agent per OTP delivered', currency: 'USD' },
      service_rates: {
        WhatsApp: { admin_to_manager: 0.05, manager_to_agent: 0.03 },
        Telegram: { admin_to_manager: 0.04, manager_to_agent: 0.025 },
        Google: { admin_to_manager: 0.06, manager_to_agent: 0.035 },
        Facebook: { admin_to_manager: 0.045, manager_to_agent: 0.028 },
        Amazon: { admin_to_manager: 0.055, manager_to_agent: 0.032 },
        Aadhaar: { admin_to_manager: 0.08, manager_to_agent: 0.05 },
        TikTok: { admin_to_manager: 0.04, manager_to_agent: 0.025 }
      }
    };
    writeDb('payout_rates', data);
  }
  res.json(data);
});

app.post('/api/payout-rates', (req, res) => {
  const current = readDb('payout_rates') || {};
  const payload = req.body || {};
  for (const [key, val] of Object.entries(payload)) {
    if (key === 'service_rates' && typeof val === 'object' && val !== null) {
      current.service_rates = current.service_rates || {};
      Object.assign(current.service_rates, val);
    } else {
      current[key] = val;
    }
  }
  writeDb('payout_rates', current);
  res.json({ success: true, data: current });
});

// ── DIRECT ARRAY ENDPOINTS ────────────────────────────────────

// 1. SMS Ranges (Must return Array directly)
app.get('/api/numbers/sms-ranges', (req, res) => {
  const _viewer = req.sessionUser;
  const role = _viewer && _viewer.role ? String(_viewer.role).toLowerCase() : '';

  const ranges = readDb('sms_ranges') || [];
  const numbers = readDb('numbers') || [];
  const isOwner = role === 'owner' || role === 'admin';
  const isManager = role === 'manager';

  let mgrPercent = 10;
  if (isManager && _viewer) {
    const allUsers = readDb('users') || [];
    const me = allUsers.find(u => Number(u.id) === Number(_viewer.id) || String(u.username || '').toLowerCase() === String(_viewer.username || '').toLowerCase());
    if (me && (me.commission_percent != null || me.commission_rate != null)) {
      mgrPercent = Number(me.commission_percent ?? me.commission_rate);
    }
  }

  const enriched = ranges.map(r => {
    const rangeName = r.range_name || r.name || r.country || 'Range';
    const providerCost = Number(r.cost || r.company_cost || 0.02);
    const agentRate = Number(r.rate || r.payout || 0.01);
    const grossMargin = Math.max(0, providerCost - agentRate);
    const mgrShare = Math.round(grossMargin * (mgrPercent / 100) * 1000000) / 1000000;
    const ownerShare = Math.round((grossMargin - mgrShare) * 1000000) / 1000000;

    const base = {
      ...r,
      range_name: rangeName,
      name: rangeName,
      unassigned_count: numbers.filter(n => (n.range_name ? n.range_name === rangeName : Number(n.range_id) === Number(r.id)) && !n.manager_id && !n.agent_id && !n.client_id).length,
      total_count: numbers.filter(n => (n.range_name ? n.range_name === rangeName : Number(n.range_id) === Number(r.id))).length
    };

    if (isOwner) {
      return base;
    } else if (isManager) {
      const { cost, buy_rate, carrier_rate, company_rate, company_cost, ...rest } = base;
      return {
        ...rest,
        agent_master_rate: agentRate,
        manager_commission_percent: mgrPercent,
        manager_earning_rate: mgrShare,
        currency: r.currency || 'USD'
      };
    } else {
      // Agent sees only Owner-set master agent rate
      const { cost, buy_rate, carrier_rate, company_rate, company_cost, ...rest } = base;
      return {
        ...rest,
        rate: agentRate,
        agent_rate: agentRate,
        currency: r.currency || 'USD'
      };
    }
  });

  res.json(enriched);
});

// Dedicated dynamic Rate Card endpoints
app.get('/api/rates/manager-card', requireAuth, (req, res) => {
  const viewer = req.sessionUser;
  const role = (viewer.role || '').toLowerCase();
  if (role !== 'owner' && role !== 'admin' && role !== 'manager') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const allUsers = readDb('users') || [];
  let mgrUser = viewer;
  if ((role === 'owner' || role === 'admin') && req.query.manager_id) {
    const found = allUsers.find(u => Number(u.id) === Number(req.query.manager_id));
    if (found) mgrUser = found;
  }
  const mgrPercent = Number(mgrUser.commission_percent ?? mgrUser.commission_rate ?? 10);
  const ranges = readDb('sms_ranges') || [];

  const card = ranges.map(r => {
    const rangeName = r.range_name || r.name || r.country || 'Range';
    const providerRate = Number(r.cost || r.company_cost || 0.02);
    const pts = r.payterms || {};
    const weeklyRate = Number(pts['Weekly'] !== undefined ? pts['Weekly'] : (pts['7/1'] !== undefined ? pts['7/1'] : (r.rate || r.payout || 0.01)));
    const monthlyRate = Number(pts['Monthly'] !== undefined ? pts['Monthly'] : (pts['30/30'] !== undefined ? pts['30/30'] : (Math.round(weeklyRate * 1.05 * 10000) / 10000)));

    const grossMarginWeekly = Math.max(0, providerRate - weeklyRate);
    const grossMarginMonthly = Math.max(0, providerRate - monthlyRate);
    const managerShareWeekly = Math.round(grossMarginWeekly * (mgrPercent / 100) * 1000000) / 1000000;
    const managerShareMonthly = Math.round(grossMarginMonthly * (mgrPercent / 100) * 1000000) / 1000000;
    const ownerShareWeekly = Math.round((grossMarginWeekly - managerShareWeekly) * 1000000) / 1000000;

    return {
      id: r.id,
      range_name: rangeName,
      country: r.country,
      prefix: r.prefix,
      provider: role === 'owner' ? r.provider : undefined,
      provider_rate: role === 'owner' ? providerRate : undefined,
      agent_master_rate: weeklyRate,
      weekly_rate: weeklyRate,
      monthly_rate: monthlyRate,
      weekly_term: 'Weekly (7/1)',
      monthly_term: 'Monthly (30/30)',
      payterms: {
        'Weekly': weeklyRate,
        '7/1': weeklyRate,
        'Monthly': monthlyRate,
        '30/30': monthlyRate
      },
      manager_percent: mgrPercent,
      manager_earning_per_sms: managerShareWeekly,
      manager_weekly_earning: managerShareWeekly,
      manager_monthly_earning: managerShareMonthly,
      owner_share_per_sms: role === 'owner' ? ownerShareWeekly : undefined,
      currency: r.currency || 'USD',
      payterm: r.payterm || 'Weekly'
    };
  });

  res.json({
    success: true,
    manager: mgrUser.username,
    manager_percent: mgrPercent,
    ranges: card
  });
});

app.get('/api/rates/agent-card', requireAuth, (req, res) => {
  const ranges = readDb('sms_ranges') || [];
  const card = ranges.map(r => {
    const pts = r.payterms || {};
    const weeklyRate = Number(pts['Weekly'] !== undefined ? pts['Weekly'] : (pts['7/1'] !== undefined ? pts['7/1'] : (r.rate || r.payout || 0.01)));
    const monthlyRate = Number(pts['Monthly'] !== undefined ? pts['Monthly'] : (pts['30/30'] !== undefined ? pts['30/30'] : (Math.round(weeklyRate * 1.05 * 10000) / 10000)));

    return {
      id: r.id,
      range_name: r.range_name || r.name || r.country || 'Range',
      country: r.country,
      prefix: r.prefix,
      agent_rate: weeklyRate,
      weekly_rate: weeklyRate,
      monthly_rate: monthlyRate,
      weekly_term: 'Weekly (7/1)',
      monthly_term: 'Monthly (30/30)',
      payterms: {
        'Weekly': weeklyRate,
        '7/1': weeklyRate,
        'Monthly': monthlyRate,
        '30/30': monthlyRate
      },
      currency: r.currency || 'USD',
      payterm: r.payterm || 'Weekly'
    };
  });
  res.json({ success: true, ranges: card });
});

app.post('/api/numbers/sms-ranges', (req, res) => {
  if (req.body.payterms !== undefined) {
    if (typeof req.body.payterms !== 'object' || req.body.payterms === null || Array.isArray(req.body.payterms)) {
      return res.status(400).json({ error: 'payterms must be an object' });
    }
    const masterList = getMasterPayterms();
    const migrated = {};
    for (const [k, v] of Object.entries(req.body.payterms)) {
      const normK = normalizePaytermKey(k);
      if (!masterList.includes(normK)) {
        return res.status(400).json({ error: `Invalid payterm "${k}". Allowed payterms: ${masterList.join(', ')}` });
      }
      migrated[normK] = v;
    }
    req.body.payterms = migrated;
  }
  if (req.body.payterm !== undefined) {
    const norm = normalizePaytermKey(req.body.payterm);
    const masterList = getMasterPayterms();
    if (!masterList.includes(norm)) {
      return res.status(400).json({ error: `Invalid payterm "${req.body.payterm}". Allowed payterms: ${masterList.join(', ')}` });
    }
    req.body.payterm = norm;
  }
  const ranges = readDb('sms_ranges') || [];
  const rangeName = (req.body.range_name || req.body.name || req.body.country || 'Range').trim();
  const entry = {
    id: nextId(ranges),
    ...req.body,
    range_name: rangeName,
    name: rangeName,
    active: req.body.active !== false,
    created: new Date().toISOString()
  };
  ranges.unshift(entry);
  writeDb('sms_ranges', ranges);
  logAudit('Admin', 'Create SMS Range', `Created range "${entry.range_name}" (#${entry.id})`, 'Numbers');
  res.json(entry);
});

app.patch('/api/numbers/sms-ranges/:id', (req, res) => {
  if (req.body.payterms !== undefined) {
    if (typeof req.body.payterms !== 'object' || req.body.payterms === null || Array.isArray(req.body.payterms)) {
      return res.status(400).json({ error: 'payterms must be an object' });
    }
    const masterList = getMasterPayterms();
    const migrated = {};
    for (const [k, v] of Object.entries(req.body.payterms)) {
      const normK = normalizePaytermKey(k);
      if (!masterList.includes(normK)) {
        return res.status(400).json({ error: `Invalid payterm "${k}". Allowed payterms: ${masterList.join(', ')}` });
      }
      migrated[normK] = v;
    }
    req.body.payterms = migrated;
  }
  if (req.body.payterm !== undefined) {
    const norm = normalizePaytermKey(req.body.payterm);
    const masterList = getMasterPayterms();
    if (!masterList.includes(norm)) {
      return res.status(400).json({ error: `Invalid payterm "${req.body.payterm}". Allowed payterms: ${masterList.join(', ')}` });
    }
    req.body.payterm = norm;
  }
  const ranges = readDb('sms_ranges') || [];
  const id = Number(req.params.id);
  const idx = ranges.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Range not found' });
  const rangeName = (req.body.range_name || req.body.name || ranges[idx].range_name || ranges[idx].name || '').trim();
  ranges[idx] = {
    ...ranges[idx],
    ...req.body,
    range_name: rangeName || ranges[idx].country || 'Range',
    name: rangeName || ranges[idx].country || 'Range'
  };
  writeDb('sms_ranges', ranges);

  // Synchronize range_name into numbers database if changed
  if (rangeName) {
    let numbers = readDb('numbers') || [];
    let changed = false;
    numbers.forEach(n => {
      if (n.range_id && Number(n.range_id) === id) {
        n.range_name = rangeName;
        changed = true;
      }
    });
    if (changed) writeDb('numbers', numbers);
  }

  res.json(ranges[idx]);
});

app.delete('/api/numbers/sms-ranges/:id', (req, res) => {
  const ranges = readDb('sms_ranges') || [];
  const id = Number(req.params.id);
  const targetRange = ranges.find(r => r.id === id);
  const filtered = ranges.filter(r => r.id !== id);
  writeDb('sms_ranges', filtered);

  let deletedNumbers = 0;
  let numbers = readDb('numbers') || [];
  const initLen = numbers.length;
  const targetCountry = (targetRange?.country || '').trim().toLowerCase();
  const targetProvider = (targetRange?.provider || 'Manual').trim().toLowerCase();
  const targetName = (targetRange?.range_name || '').trim().toLowerCase();

  // Cascade delete all numbers belonging to this deleted range
  numbers = numbers.filter(n => {
    // 1. Direct range_id match
    if (n.range_id && Number(n.range_id) === id) return false;
    // 2. Direct range_name match
    if (targetName && n.range_name && n.range_name.trim().toLowerCase() === targetName) return false;
    // 3. If range_id is not set, match country and provider if no other active range uses them
    if (!n.range_id && targetCountry && targetProvider) {
      const c = (n.country || '').trim().toLowerCase();
      const p = (n.provider || '').trim().toLowerCase();
      if (c === targetCountry && p === targetProvider) return false;
    }
    return true;
  });
  deletedNumbers = initLen - numbers.length;
  writeDb('numbers', numbers);

  // Also remove test numbers if any were associated
  let testNumbers = readDb('test_numbers') || [];
  if (Array.isArray(testNumbers)) {
    const initTestLen = testNumbers.length;
    testNumbers = testNumbers.filter(tn => {
      if (tn.range_id && Number(tn.range_id) === id) return false;
      if (targetName && tn.range_name && tn.range_name.trim().toLowerCase() === targetName) return false;
      return true;
    });
    if (testNumbers.length !== initTestLen) writeDb('test_numbers', testNumbers);
  }

  logAudit('Owner', 'Delete SMS Range', `Deleted range #${id} and ${deletedNumbers} numbers`, 'Ranges');
  res.json({ success: true, deleted_numbers: deletedNumbers });
});

// Import to existing or new range
app.post('/api/numbers/import-to-range', (req, res) => {
  try {
    const payload = req.body || {};
    const numbersText = payload.numbers || '';
    const lines = numbersText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) {
      return res.status(400).json({ error: 'No numbers provided' });
    }

    const ranges = readDb('sms_ranges') || [];
    let rangeId = payload.range_id;
    let newRange = payload.new_range;
    let rng = null;

    if (newRange) {
      const payoutSchedule = newRange.payout_schedule || 'weekly';
      const payout = parseFloat(newRange.payout || 0) || 0;
      const otpLimit = parseInt(newRange.otp_limit || 0, 10) || 0;
      const cost = parseFloat(newRange.cost || 0) || 0;
      const entry = {
        id: nextId(ranges),
        country: newRange.country || '',
        provider: newRange.provider || 'Manual',
        prefix: newRange.prefix || '',
        range_name: (newRange.name || newRange.range_name || newRange.country || 'Range').trim(),
        name: (newRange.name || newRange.range_name || newRange.country || 'Range').trim(),
        cost: cost,
        payout_schedule: payoutSchedule,
        payout: payout,
        otp_limit: otpLimit,
        active: true,
        created: new Date().toISOString()
      };
      ranges.unshift(entry);
      writeDb('sms_ranges', ranges);
      rangeId = entry.id;

      const rateCard = readDb('rate_card') || [];
      rateCard.unshift({
        id: nextId(rateCard),
        country: entry.country,
        provider: entry.provider,
        buy_rate: entry.cost,
        sell_rate: payout,
        margin: `${entry.cost ? Math.round((1 - payout / entry.cost) * 100) : 0}%`,
        active: true,
        created: new Date().toISOString()
      });
      writeDb('rate_card', rateCard);
      rng = entry;
    } else {
      rng = ranges.find(r => r.id === Number(rangeId));
      if (!rng) {
        return res.status(404).json({ error: 'Range not found — select a range or create a new one' });
      }
    }

    const countryOverride = (payload.country_override || '').trim();
    const numbers = readDb('numbers') || [];
    const added = [];
    const baseId = nextId(numbers);

    // Filter out common CSV/text headers like 'number', 'phone', 'msisdn'
    const validLines = lines.filter(l => !/^(number|phone|msisdn|mobile|phone\s*number)$/i.test(l));
    if (!validLines.length) {
      return res.status(400).json({ error: 'No valid phone numbers found in input' });
    }

    // Build digit lookup map of existing numbers in system
    const existingMap = new Map();
    for (const item of numbers) {
      const d = String(item.number || '').replace(/\D/g, '');
      if (d) existingMap.set(d, item);
    }

    const seenInBatch = new Set();
    const duplicates = [];
    const targetRangeId = Number(rng.id);
    const targetRangeName = rng.range_name || rng.name || rng.country || 'Range';

    for (let i = 0; i < validLines.length; i++) {
      const num = validLines[i];
      const digits = String(num).replace(/\D/g, '');
      if (!digits) continue;

      // Check duplicate within the submitted list
      if (seenInBatch.has(digits)) {
        duplicates.push({ number: num, reason: 'Duplicate in submitted list' });
        continue;
      }
      seenInBatch.add(digits);

      // Check duplicate in database
      const existing = existingMap.get(digits);
      if (existing) {
        if (Number(existing.range_id) === targetRangeId) {
          duplicates.push({ number: num, reason: 'Already exists in this range' });
        } else {
          const otherRange = existing.range_name || existing.country || `Range #${existing.range_id}`;
          duplicates.push({ number: num, reason: `Already in range "${otherRange}"` });
        }
        continue;
      }

      added.push({
        id: baseId + added.length,
        number: num,
        range_id: rng.id,
        range_name: targetRangeName,
        prefix: rng.prefix || '',
        app: 'Unassigned',
        status: 'active',
        user: 'unallocated',
        country: countryOverride || rng.country || '',
        provider: rng.provider || 'Manual',
        otp_limit: rng.otp_limit || 0,
        allocated_at: new Date().toISOString(),
        last_sms: null,
        sms_count: 0,
        notes: ''
      });
      existingMap.set(digits, { range_id: rng.id, range_name: targetRangeName });
    }

    if (added.length > 0) {
      numbers.push(...added);
      writeDb('numbers', numbers);
      logAudit('Admin', 'Import Numbers', `Imported ${added.length} numbers to range "${targetRangeName}" (skipped ${duplicates.length} duplicate(s))`, 'Numbers');
    }

    res.json({
      success: true,
      imported: added.length,
      skipped_duplicates: duplicates.length,
      duplicates_detail: duplicates,
      range_id: rangeId,
      range_name: targetRangeName,
      message: added.length > 0
        ? `Imported ${added.length} number(s).${duplicates.length ? ` Skipped ${duplicates.length} duplicate(s).` : ''}`
        : `No numbers imported. All ${duplicates.length} number(s) were duplicates.`
    });
  } catch (err) {
    console.error('import-to-range error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk range import from CSV / TXT
app.post('/api/numbers/bulk-range-import', upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ detail: 'No file uploaded' });
    }
    const text = req.file.buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) {
      return res.status(400).json({ detail: 'File is empty' });
    }

    const providerName = (req.body.provider_name || 'Provider').trim();
    const mode = req.body.mode || 'iprn';
    const overrideCost = parseFloat(req.body.override_cost || 0) || 0;
    const payoutSchedule = req.body.payout_schedule || 'weekly';
    const overridePayout = parseFloat(req.body.override_payout || 0) || 0;
    const otpLimit = parseInt(req.body.otp_limit || 0, 10) || 0;

    const rows = [];
    for (const line of lines) {
      if (line.includes(',')) {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 3) {
          rows.push({ country: parts[0], provider: parts[1] || providerName, number: parts[2] });
        } else if (parts.length === 2) {
          rows.push({ country: parts[0], provider: providerName, number: parts[1] });
        } else {
          rows.push({ country: 'Unknown', provider: providerName, number: parts[0] });
        }
      } else {
        rows.push({ country: 'Unknown', provider: providerName, number: line });
      }
    }

    if (!rows.length) {
      return res.status(400).json({ detail: 'No valid numbers found in file' });
    }

    const groups = {};
    for (const r of rows) {
      const key = `${r.country}||${r.provider}`;
      if (!groups[key]) groups[key] = { country: r.country, provider: r.provider, numbers: [] };
      groups[key].numbers.push(r.number);
    }

    const ranges = readDb('sms_ranges') || [];
    const rateCard = readDb('rate_card') || [];
    const numbersDb = readDb('numbers') || [];
    const testNumbersDb = readDb('test_numbers') || [];
    const createdRanges = [];
    let totalAdded = 0;

    const monthDay = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    for (const key of Object.keys(groups)) {
      const grp = groups[key];
      const provPart = (grp.provider && grp.provider !== 'Manual' && grp.provider !== grp.country) ? ` ${grp.provider}` : '';
      const rangeName = `${grp.country}${provPart} SSP ${monthDay}`;
      const rngEntry = {
        id: nextId(ranges),
        country: grp.country,
        provider: grp.provider || 'Manual',
        prefix: '',
        range_name: rangeName,
        name: rangeName,
        cost: overrideCost,
        payout_schedule: payoutSchedule,
        payout: overridePayout,
        otp_limit: otpLimit,
        active: true,
        created: new Date().toISOString(),
        is_test: mode === 'test'
      };
      ranges.unshift(rngEntry);
      createdRanges.push(rngEntry);

      rateCard.unshift({
        id: nextId(rateCard),
        country: grp.country,
        provider: grp.provider,
        buy_rate: overrideCost,
        sell_rate: overridePayout,
        margin: `${overrideCost ? Math.round((1 - overridePayout / overrideCost) * 100) : 0}%`,
        active: true,
        created: new Date().toISOString()
      });

      const targetDb = mode === 'test' ? testNumbersDb : numbersDb;
      const existingDigits = new Set(targetDb.map(n => String(n.number || '').replace(/\D/g, '')).filter(Boolean));
      const seenBatch = new Set();
      let skippedInGroup = 0;

      for (let i = 0; i < grp.numbers.length; i++) {
        const num = grp.numbers[i];
        const digits = String(num).replace(/\D/g, '');
        if (!digits) continue;
        if (existingDigits.has(digits) || seenBatch.has(digits)) {
          skippedInGroup++;
          continue;
        }
        seenBatch.add(digits);
        existingDigits.add(digits);

        if (mode === 'test') {
          testNumbersDb.unshift({
            id: nextId(testNumbersDb) + i,
            number: num,
            range_id: rngEntry.id,
            range_name: rngEntry.range_name,
            country: grp.country,
            provider: grp.provider,
            app: '',
            added_by: 'Admin (bulk import)',
            created: new Date().toISOString()
          });
        } else {
          numbersDb.push({
            id: nextId(numbersDb) + totalAdded,
            number: num,
            range_id: rngEntry.id,
            range_name: rngEntry.range_name,
            prefix: rngEntry.prefix || '',
            app: 'Unassigned',
            status: 'active',
            user: 'unallocated',
            country: grp.country,
            provider: grp.provider,
            otp_limit: otpLimit,
            allocated_at: new Date().toISOString(),
            last_sms: null,
            sms_count: 0,
            notes: ''
          });
        }
        totalAdded++;
      }
    }

    writeDb('sms_ranges', ranges);
    writeDb('rate_card', rateCard);
    if (mode === 'test') {
      writeDb('test_numbers', testNumbersDb);
      syncTestNumbersWithNumbersPool();
    } else {
      writeDb('numbers', numbersDb);
    }

    logAudit('Admin', 'Bulk Range Import', `Created ${createdRanges.length} range(s), imported ${totalAdded} numbers`, 'Numbers');
    res.json({
      ranges_created: createdRanges.length,
      numbers_imported: totalAdded,
      ranges: createdRanges.map(r => ({
        name: r.range_name,
        country: r.country,
        provider: r.provider,
        cost: r.cost,
        payout_schedule: r.payout_schedule,
        payout: r.payout
      }))
    });
  } catch (err) {
    console.error('bulk-range-import error:', err);
    res.status(500).json({ detail: err.message });
  }
});

// Simple number list upload
app.post('/api/numbers/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const text = req.file.buffer.toString('utf-8');
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const country = (req.body.country || 'US').trim();
    const numbers = readDb('numbers') || [];
    const added = [];
    const baseId = nextId(numbers);
    const existingDigits = new Set(numbers.map(n => String(n.number || '').replace(/\D/g, '')).filter(Boolean));
    const seenBatch = new Set();
    let skippedDuplicates = 0;

    for (let i = 0; i < lines.length; i++) {
      const num = lines[i];
      const digits = String(num).replace(/\D/g, '');
      if (!digits) continue;
      if (existingDigits.has(digits) || seenBatch.has(digits)) {
        skippedDuplicates++;
        continue;
      }
      seenBatch.add(digits);
      existingDigits.add(digits);

      added.push({
        id: baseId + added.length,
        number: num,
        app: 'Unassigned',
        status: 'active',
        user: 'unallocated',
        country: country,
        provider: 'Manual',
        allocated_at: new Date().toISOString(),
        last_sms: null,
        sms_count: 0,
        notes: ''
      });
    }

    if (added.length > 0) {
      numbers.push(...added);
      writeDb('numbers', numbers);
      logAudit('Admin', 'Upload Numbers', `Uploaded ${added.length} numbers (skipped ${skippedDuplicates} duplicates)`, 'Numbers');
    }
    res.json({
      imported: added.length,
      skipped_duplicates: skippedDuplicates,
      total: numbers.length,
      success: true
    });
  } catch (err) {
    console.error('upload numbers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Rate Card (Must return Array directly)
app.get('/api/numbers/rate-card', (req, res) => {
  const card = readDb('rate_card') || [];
  const _viewer = req.sessionUser || getSessionUser(req);
  const _role = normRole(_viewer && _viewer.role);
  if (_role === 'owner') return res.json(card);
  if (_role === 'manager') {
    // Manager sees Range Name, Country, Prefix, Agent Payout, Payterm, Status
    // But NOT the provider's internal buy_rate or company_cost
    return res.json(card.map(({ buy_rate, cost, company_cost, company_rate, ...rest }) => ({
      ...rest,
      range_name: rest.range_name || rest.name || rest.country,
      name: rest.range_name || rest.name || rest.country
    })));
  }
  // Agent & Client & TestPanel: Isolated payout rate only (Never leaks owner buy_rate or internal profit margins)
  res.json(card.map(c => ({
    id: c.id,
    range_name: c.range_name || c.name || c.country,
    name: c.range_name || c.name || c.country,
    country: c.country,
    prefix: c.prefix || '',
    provider: c.provider,
    sell_rate: c.sell_rate != null ? c.sell_rate : (c.payout != null ? c.payout : 0.01),
    rate: c.sell_rate != null ? c.sell_rate : (c.payout != null ? c.payout : 0.01),
    payout: c.sell_rate != null ? c.sell_rate : (c.payout != null ? c.payout : 0.01),
    payterm: c.payterm || 'Weekly',
    active: c.active !== false
  })));
});

app.post('/api/numbers/rate-card', (req, res) => {
  const card = readDb('rate_card') || [];
  const item = { id: nextId(card), ...req.body, active: true, created: new Date().toISOString() };
  card.unshift(item);
  writeDb('rate_card', card);
  res.json(item);
});

app.patch('/api/numbers/rate-card/:id', (req, res) => {
  const card = readDb('rate_card') || [];
  const id = Number(req.params.id);
  const idx = card.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  card[idx] = { ...card[idx], ...req.body };
  writeDb('rate_card', card);
  res.json(card[idx]);
});

app.delete('/api/numbers/rate-card/:id', (req, res) => {
  const card = readDb('rate_card') || [];
  const id = Number(req.params.id);
  writeDb('rate_card', card.filter(c => c.id !== id));
  res.json({ success: true });
});

// ── C5: Owner Warning List & Reconciliation Endpoints ──────────
app.get('/api/numbers/no-rate-ranges', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const isOwner = normRole(sessionUser.role) === 'owner';
  if (!isOwner) return res.status(403).json({ error: 'Forbidden. Owner only.' });

  const ranges = readDb('sms_ranges') || [];
  const numbers = readDb('numbers') || [];
  const noRateList = [];

  for (const r of ranges) {
    const cost = Number(r.company_cost ?? r.cost ?? r.buy_rate ?? 0);
    const payout = (r.payterms && Object.values(r.payterms).some(v => v !== 'NA' && Number(v) > 0)) || (Number(r.payout) > 0);
    if (!cost || !payout) {
      noRateList.push({
        id: r.id,
        range_name: r.range_name || r.name,
        country: r.country,
        provider: r.provider,
        cost: cost,
        has_payout: Boolean(payout),
        affected_numbers_count: numbers.filter(n => Number(n.range_id) === Number(r.id)).length
      });
    }
  }
  res.json({ success: true, count: noRateList.length, ranges: noRateList });
});

app.get('/api/finance/reconciliation', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const isOwner = normRole(sessionUser.role) === 'owner';
  if (!isOwner) return res.status(403).json({ error: 'Forbidden. Owner only.' });

  const allSms = readSmsWithArchive();
  let totalCompany = 0;
  let totalOwner = 0;
  let totalManager = 0;
  let totalAgent = 0;
  let totalClient = 0;

  for (const s of allSms) {
    totalCompany += (Number(s.company_rate) || 0);
    totalOwner += (Number(s.owner_amount) || 0);
    totalManager += (Number(s.manager_amount) || 0);
    totalAgent += (Number(s.agent_amount) || 0);
    totalClient += (Number(s.client_amount) || 0);
  }

  totalCompany = Math.round(totalCompany * 1000000) / 1000000;
  const totalDistributed = Math.round((totalOwner + totalManager + totalAgent + totalClient) * 1000000) / 1000000;
  const isReconciled = Math.abs(totalCompany - totalDistributed) < 0.0001;

  res.json({
    success: true,
    total_sms: allSms.length,
    company_revenue: totalCompany,
    owner_amount: Math.round(totalOwner * 1000000) / 1000000,
    manager_amount: Math.round(totalManager * 1000000) / 1000000,
    agent_amount: Math.round(totalAgent * 1000000) / 1000000,
    client_amount: Math.round(totalClient * 1000000) / 1000000,
    total_distributed: totalDistributed,
    reconciled: isReconciled
  });
});

// ── C4: Payments & Stamped Balance Engine (Username & Role Base) ──
app.get(['/api/payments', '/api/payments/balance', '/api/payments/summary'], requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const userId = Number(sessionUser.id);
  const myUsername = String(sessionUser.username || '').trim().toLowerCase();
  const allSms = readSmsWithArchive();
  const allPayouts = readDb('payout_requests') || [];

  let earned = 0;
  if (sRole === 'client') {
    earned = allSms.filter(s => (s.client_username && s.client_username.toLowerCase() === myUsername) || Number(s.client_id) === userId)
                   .reduce((sum, s) => sum + (Number(s.client_amount) || 0), 0);
  } else if (sRole === 'agent') {
    earned = allSms.filter(s => (s.agent_username && s.agent_username.toLowerCase() === myUsername) || Number(s.agent_id) === userId)
                   .reduce((sum, s) => sum + (Number(s.agent_amount) || 0), 0);
  } else if (sRole === 'manager') {
    earned = allSms.filter(s => (s.manager_username && s.manager_username.toLowerCase() === myUsername) || Number(s.manager_id) === userId)
                   .reduce((sum, s) => sum + (Number(s.manager_amount) || 0), 0);
  } else if (sRole === 'owner' || sRole === 'admin') {
    earned = allSms.reduce((sum, s) => sum + (Number(s.owner_amount) || 0), 0);
  }

  const userPayouts = allPayouts.filter(p => {
    const pRole = String(p.role || p.recipient_role || '').toLowerCase();
    const pUser = String(p.recipient_username || p.username || p.user || '').trim().toLowerCase();
    if (pUser) {
      return pUser === myUsername;
    }
    if (sRole === 'client') return (pRole === 'client' || !pRole) && (Number(p.client_id || p.user_id) === userId);
    if (sRole === 'agent') return (pRole === 'agent' || !pRole) && (Number(p.agent_id || p.user_id) === userId);
    if (sRole === 'manager') return (pRole === 'manager' || !pRole) && (Number(p.manager_id || p.user_id) === userId);
    return false;
  });
  const totalPaid = userPayouts.filter(p => p.status === 'completed' || p.status === 'paid' || p.status === 'approved')
                               .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const pendingHold = userPayouts.filter(p => p.status === 'pending')
                                 .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const balance = Math.round((earned - totalPaid) * 10000) / 10000;
  const availableBalance = Math.max(0, Math.round((earned - totalPaid - pendingHold) * 10000) / 10000);
  const userRec = findUserAnywhere(sessionUser.username)?.user;
  const dbBalance = userRec && userRec.balance !== undefined ? Number(userRec.balance) : balance;

  res.json({
    success: true,
    role: sessionUser.role,
    username: sessionUser.username,
    user_id: userId,
    total_earned: Math.round(earned * 10000) / 10000,
    total_paid: Math.round(totalPaid * 10000) / 10000,
    pending_hold: Math.round(pendingHold * 10000) / 10000,
    available_balance: availableBalance,
    balance: balance,
    main_balance: Math.round(dbBalance * 10000) / 10000,
    ledger_balance: balance,
    payouts: userPayouts
  });
});

app.post('/api/payments', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isManager = sRole === 'manager';
  const isAgent = sRole === 'agent';

  if (!isOwner && !isManager && !isAgent) {
    return res.status(403).json({ error: 'Access denied. Clients cannot record payments.' });
  }

  const { recipient_id, recipient_username, recipient_role, amount, notes, method } = req.body || {};
  const numAmount = Number(amount);
  if (!numAmount || numAmount <= 0) {
    return res.status(400).json({ error: 'Valid payment amount is required' });
  }

  // Find recipient by username or id
  let targetUser = null;
  let targetRole = recipient_role;
  if (recipient_username) {
    const found = findUserAnywhere(recipient_username);
    if (found) {
      targetUser = found.user;
      targetRole = found.role;
    }
  } else if (recipient_id) {
    const rLower = String(recipient_role || '').toLowerCase();
    let tables = ['users', 'agents', 'clients'];
    if (rLower === 'client') {
      tables = ['clients', 'users', 'agents'];
    } else if (rLower === 'agent') {
      tables = ['agents', 'users', 'clients'];
    } else if (rLower === 'manager') {
      tables = ['users', 'agents', 'clients'];
    }
    for (const tbl of tables) {
      const rows = readDb(tbl) || [];
      const f = rows.find(x => x && Number(x.id) === Number(recipient_id));
      if (f) {
        targetUser = f;
        targetRole = f.role || (tbl === 'agents' ? 'Agent' : tbl === 'clients' ? 'Client' : 'Manager');
        break;
      }
    }
  }

  if (!targetUser) {
    return res.status(404).json({ error: 'Recipient user not found. Please provide a valid username or ID.' });
  }

  const finalUsername = targetUser.username;
  const finalRole = targetRole || (recipient_role || 'Client');

  if (isAgent) {
    if (finalRole.toLowerCase() !== 'client') {
      return res.status(403).json({ error: 'Agents can only record payouts for Clients.' });
    }
    if (Number(targetUser.agent_id) !== Number(sessionUser.id)) {
      return res.status(403).json({ error: 'Access denied. This client does not belong to your account.' });
    }
  }
  if (isManager) {
    if (finalRole.toLowerCase() !== 'agent') {
      return res.status(403).json({ error: 'Managers can only record payouts for Agents.' });
    }
    if (Number(targetUser.manager_id) !== Number(sessionUser.id)) {
      return res.status(403).json({ error: 'Access denied. This agent does not belong to your account.' });
    }
  }

  // Check available balance of recipient
  const curBal = Number(targetUser.balance || 0);
  if (curBal < numAmount) {
    return res.status(400).json({ error: `Insufficient balance. Recipient only has $${curBal.toFixed(4)} available.` });
  }

  const payouts = readDb('payout_requests') || [];
  const targetId = targetUser.id;
  const rec = {
    id: nextId(payouts),
    user: finalUsername,
    username: finalUsername,
    role: finalRole,
    user_id: targetId,
    recipient_username: finalUsername,
    recipient_role: finalRole,
    client_id: finalRole.toLowerCase() === 'client' ? targetId : null,
    agent_id: finalRole.toLowerCase() === 'agent' ? targetId : null,
    manager_id: finalRole.toLowerCase() === 'manager' ? targetId : null,
    amount: numAmount,
    method: method || 'USDT',
    notes: notes || '',
    paid_by_username: sessionUser.username,
    paid_by_role: sessionUser.role,
    status: 'completed',
    created: new Date().toISOString(),
    paid_at: new Date().toISOString()
  };
  payouts.unshift(rec);
  writeDb('payout_requests', payouts);

  // Synchronize balance reduction on recipient
  const tbl = finalRole.toLowerCase() === 'agent' ? 'agents' : (finalRole.toLowerCase() === 'client' ? 'clients' : 'users');
  const records = readDb(tbl) || [];
  const idx = records.findIndex(r => r && (r.id === targetUser.id || r.username === targetUser.username));
  if (idx !== -1) {
    const curBalRec = Number(records[idx].balance || 0);
    records[idx].balance = Math.max(0, Math.round((curBalRec - numAmount) * 1000000) / 1000000);
    writeDb(tbl, records);
  }

  logAudit(sessionUser.username, 'Record Payout', `Paid ${numAmount} to ${finalRole} ${finalUsername}`, 'Payments');
  res.json({ success: true, payment: rec });
});

// ── Financial Statements & Credit Notes ──────────────────────
app.get('/api/statements', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isManager = sRole === 'manager';
  const isAgent = sRole === 'agent';
  const isClient = sRole === 'client';

  const currency = (req.query.currency || 'USD').toUpperCase();
  const reqAgentId = req.query.agent_id ? Number(req.query.agent_id) : (isAgent ? Number(sessionUser.id) : null);
  const reqClientId = req.query.client_id ? Number(req.query.client_id) : (isClient ? Number(sessionUser.id) : null);

  const allSms = readSmsWithArchive();
  const allPayouts = readDb('payout_requests') || [];

  let relevantSms = [];
  if (reqClientId) {
    relevantSms = allSms.filter(s => Number(s.client_id) === reqClientId && ((s.currency || 'USD').toUpperCase() === currency));
  } else if (reqAgentId) {
    relevantSms = allSms.filter(s => Number(s.agent_id) === reqAgentId && ((s.currency || 'USD').toUpperCase() === currency));
  } else if (isManager) {
    relevantSms = allSms.filter(s => Number(s.manager_id) === Number(sessionUser.id) && ((s.currency || 'USD').toUpperCase() === currency));
  } else if (isOwner) {
    relevantSms = allSms.filter(s => ((s.currency || 'USD').toUpperCase() === currency));
  }

  const monthMap = {};
  for (const s of relevantSms) {
    const m = (s.date || (s.timestamp ? s.timestamp.slice(0, 7) : '')).slice(0, 7) || 'Current';
    if (!monthMap[m]) monthMap[m] = { month: m, credit: 0, debit: 0, count: 0, currency };
    const amt = reqClientId ? (Number(s.client_amount) || 0) : (reqAgentId ? (Number(s.agent_amount) || 0) : (isManager ? (Number(s.manager_amount) || 0) : (Number(s.owner_amount) || 0)));
    monthMap[m].credit += amt;
    monthMap[m].count++;
  }

  const payouts = allPayouts.filter(p => {
    if (reqClientId) return Number(p.client_id || p.user_id) === reqClientId;
    if (reqAgentId) return Number(p.agent_id || p.user_id) === reqAgentId;
    if (isManager) return Number(p.manager_id || p.user_id) === Number(sessionUser.id);
    return true;
  });
  for (const p of payouts) {
    const m = (p.paid_at || p.created || '').slice(0, 7) || 'Current';
    if (!monthMap[m]) monthMap[m] = { month: m, credit: 0, debit: 0, count: 0, currency };
    monthMap[m].debit += (Number(p.amount) || 0);
  }

  const result = Object.values(monthMap).sort((a, b) => b.month.localeCompare(a.month)).map(item => ({
    ...item,
    credit: Math.round(item.credit * 10000) / 10000,
    debit: Math.round(item.debit * 10000) / 10000,
    balance: Math.round((item.credit - item.debit) * 10000) / 10000
  }));

  res.json({ success: true, currency, data: result });
});

app.get('/api/credit-notes', requireAuth, (req, res) => {
  const notes = readDb('credit_notes') || [];
  res.json({ success: true, data: notes });
});

app.get('/api/credit-notes/:id/pdf', requireAuth, (req, res) => {
  const notes = readDb('credit_notes') || [];
  const id = Number(req.params.id);
  const note = notes.find(n => n.id === id || String(n.id) === String(req.params.id));
  if (!note) {
    return res.status(404).send('Credit note not found');
  }

  const siteName = (readDb('settings') || {}).site_name || 'ALPHA SMS';
  const voucherNo = `CN-${String(note.id).padStart(5, '0')}`;
  const dateStr = (note.date || note.created || new Date().toISOString()).slice(0, 10);
  const amountStr = Number(note.amount || 0).toFixed(2);
  const cur = note.currency || 'USD';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Credit Note #${voucherNo}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #1e293b; background: #fff; max-width: 760px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 24px; margin-bottom: 24px; }
    .logo { font-size: 26px; font-weight: 800; letter-spacing: 1px; color: #0f172a; }
    .logo span { color: #10b981; }
    .meta { text-align: right; font-size: 13px; color: #64748b; line-height: 1.6; }
    .badge { display: inline-block; padding: 4px 12px; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-top: 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; font-size: 13px; }
    .info-box strong { display: block; font-size: 11px; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; }
    th { background: #f1f5f9; text-align: left; padding: 12px 14px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; }
    td { padding: 14px; border-bottom: 1px solid #e2e8f0; }
    .total-box { display: flex; justify-content: flex-end; margin-top: 10px; }
    .total-card { width: 280px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; font-size: 14px; }
    .total-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .total-final { font-size: 18px; font-weight: 800; color: #059669; border-top: 1px solid #cbd5e1; padding-top: 8px; margin-top: 8px; }
    .footer { margin-top: 50px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: flex-end;">
    <button onclick="window.print()" style="padding: 8px 18px; background: #0f172a; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Print / Save as PDF</button>
  </div>
  <div class="header">
    <div>
      <div class="logo">HUMEX <span>SMS</span></div>
      <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Wholesale SMS Platform & Carrier Settlement</div>
      <span class="badge">Official Settlement Credit Note</span>
    </div>
    <div class="meta">
      <div><strong>Voucher:</strong> #${voucherNo}</div>
      <div><strong>Date:</strong> ${dateStr}</div>
      <div><strong>Currency:</strong> ${cur}</div>
      <div><strong>Status:</strong> ${note.status || 'Settled'}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <strong>Issued To</strong>
      <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${note.username || (note.agent_id ? 'Agent #' + note.agent_id : 'Account Holder')}</div>
      <div>Role: ${note.role || 'Partner'}</div>
      <div>Account ID: #${note.agent_id || note.user_id || '—'}</div>
    </div>
    <div class="info-box">
      <strong>Terms & Settlement</strong>
      <div>Payment Term: <b>${note.term || 'Weekly'}</b></div>
      <div>Transaction Type: Credit Note Settlement</div>
      <div>Settled Via: ${note.reason || 'SMS Wholesale Revenue'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Reference</th>
        <th>Payterm</th>
        <th style="text-align: right;">Amount (${cur})</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Wholesale SMS Commission & Payout</strong><br><span style="font-size: 12px; color: #64748b;">${note.reason || 'Settlement voucher'}</span></td>
        <td>#${voucherNo}</td>
        <td>${note.term || 'Weekly'}</td>
        <td style="text-align: right; font-weight: 700;">$${amountStr}</td>
      </tr>
    </tbody>
  </table>

  <div class="total-box">
    <div class="total-card">
      <div class="total-row"><span>Gross Payout:</span><span>$${amountStr}</span></div>
      <div class="total-row"><span>Deductions:</span><span>$0.00</span></div>
      <div class="total-row total-final"><span>Total Credit:</span><span>$${amountStr} ${cur}</span></div>
    </div>
  </div>

  <div class="footer">
    This is an electronically generated financial statement voucher issued by ${siteName}. No signature is required.
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// 3. Blacklist (Must return Array directly)
app.get('/api/numbers/blacklist', (req, res) => {
  const list = readDb('blacklist') || [];
  res.json(list);
});

app.post('/api/numbers/blacklist', (req, res) => {
  const list = readDb('blacklist') || [];
  const item = { id: nextId(list), ...req.body, active: true, created: new Date().toISOString() };
  list.unshift(item);
  writeDb('blacklist', list);
  res.json(item);
});

app.delete('/api/numbers/blacklist/:id', (req, res) => {
  const list = readDb('blacklist') || [];
  const id = Number(req.params.id);
  writeDb('blacklist', list.filter(b => b.id !== id));
  res.json({ success: true });
});

// 4. Blocked IPs (Must return Array directly)
app.get('/api/firewall/blocked-ips', (req, res) => {
  const blocked = readDb('blocked_ips') || [];
  res.json(blocked);
});

app.post('/api/firewall/block-ip', (req, res) => {
  const blocked = readDb('blocked_ips') || [];
  const ip = (req.body.ip || '').trim();
  if (!ip) return res.status(400).json({ error: 'IP is required' });
  const entry = { id: nextId(blocked), ip, reason: req.body.reason || 'Manual block', blocked_at: new Date().toISOString() };
  blocked.unshift(entry);
  writeDb('blocked_ips', blocked);
  res.json(entry);
});

app.post('/api/firewall/blocked-ips', (req, res) => {
  const blocked = readDb('blocked_ips') || [];
  const entry = { id: nextId(blocked), ...req.body, blocked_at: new Date().toISOString() };
  blocked.unshift(entry);
  writeDb('blocked_ips', blocked);
  res.json(entry);
});

app.delete('/api/firewall/blocked-ips/:id', (req, res) => {
  const blocked = readDb('blocked_ips') || [];
  const id = Number(req.params.id);
  writeDb('blocked_ips', blocked.filter(b => b.id !== id));
  res.json({ success: true });
});

// 5. Allocation History (Paginated or raw array)
app.get('/api/numbers/allocation-history', (req, res) => {
  let data = readDb('allocation_history') || [];
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser?.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isManager = sRole === 'manager';

  const isAgent = sRole === 'agent';

  if (!isOwner && isManager) {
    const agents = readDb('agents') || [];
    const myAgentIds = new Set(agents.filter(a => Number(a.manager_id) === Number(sessionUser.id)).map(a => Number(a.id)));
    const myAgentNames = new Set(agents.filter(a => Number(a.manager_id) === Number(sessionUser.id)).map(a => (a.username || '').toLowerCase()));
    data = data.filter(h => {
      const fromMe = String(h.from_user || '').toLowerCase() === String(sessionUser.username || '').toLowerCase();
      const toMyAgent = (h.agent_id && myAgentIds.has(Number(h.agent_id))) ||
                        (h.target_id && myAgentIds.has(Number(h.target_id))) ||
                        (h.to_user && myAgentNames.has(String(h.to_user).toLowerCase())) ||
                        (h.agent && myAgentNames.has(String(h.agent).toLowerCase()));
      return fromMe || toMyAgent || !h.from_user;
    });
  } else if (!isOwner && isAgent) {
    data = data.filter(h => {
      const fromMe = String(h.from_user || '').toLowerCase() === String(sessionUser.username || '').toLowerCase() ||
                     (h.from_user_id && Number(h.from_user_id) === Number(sessionUser.id)) ||
                     (h.agent_id && Number(h.agent_id) === Number(sessionUser.id));
      return fromMe;
    });
  }

  if (req.query.format === 'array' || (!req.query.page && !req.query.limit && req.query.raw === '1')) {
    return res.json(data);
  }
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 15;
  const start = (page - 1) * limit;
  res.json({ data: data.slice(start, start + limit), total: data.length });
});

// 6. Tokens (Array) — Scoped to Owner and Manager (Fix 5)
app.get('/api/tokens', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isManager = sRole === 'manager';

  if (!isOwner && !isManager) {
    return res.status(403).json({ error: 'Forbidden. Tokens are restricted to Owner and Managers.' });
  }

  let tokens = readDb('api_tokens') || [];
  if (isManager) {
    tokens = tokens.filter(t => Number(t.manager_id) === Number(sessionUser.id));
  } else if (req.query.manager_id) {
    tokens = tokens.filter(t => Number(t.manager_id) === Number(req.query.manager_id));
  }
  res.json(tokens.map(publicTokenView));
});

app.post('/api/tokens', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isManager = sRole === 'manager';

  if (!isOwner && !isManager) {
    return res.status(403).json({ error: 'Forbidden. Only Owner and Managers can create API tokens.' });
  }

  const tokens = readDb('api_tokens') || [];
  const agents = readDb('agents') || [];
  const targetAgentId = req.body.agent_id ? Number(req.body.agent_id) : null;
  const agent = targetAgentId ? agents.find(a => Number(a.id) === targetAgentId) : null;

  if (isManager) {
    if (!agent || Number(agent.manager_id) !== Number(sessionUser.id)) {
      return res.status(403).json({ error: 'Forbidden. You can only create tokens for Agents in your own chain.' });
    }
  }

  const rawToken = newSecretToken();
  const token = {
    id: nextId(tokens),
    token_hash: sha256Hex(rawToken),
    token_hint: rawToken.slice(-4),
    name: req.body.name || 'API Key',
    agent_id: agent ? agent.id : null,
    agent_username: agent ? agent.username : '',
    manager_id: isManager ? sessionUser.id : (agent && agent.manager_id ? agent.manager_id : (Number(req.body.manager_id) || null)),
    status: req.body.status || 'active',
    calls: 0,
    last_used: null,
    created: new Date().toISOString()
  };
  tokens.unshift(token);
  writeDb('api_tokens', tokens);
  logAudit(sessionUser.username || 'Owner', 'Create API Token', `Created token '${token.name}' for agent '${token.agent_username || 'None'}'`, 'API Tokens');
  res.json({ ...publicTokenView(token), token: rawToken, shown_once: true });
});

app.delete('/api/tokens/:id', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isManager = sRole === 'manager';

  if (!isOwner && !isManager) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  let tokens = readDb('api_tokens') || [];
  const id = Number(req.params.id);
  const targetToken = tokens.find(t => Number(t.id) === id);
  if (!targetToken) {
    return res.status(404).json({ error: 'Token not found' });
  }

  if (isManager && Number(targetToken.manager_id) !== Number(sessionUser.id)) {
    return res.status(403).json({ error: 'Forbidden. You can only delete tokens in your own chain.' });
  }

  writeDb('api_tokens', tokens.filter(t => Number(t.id) !== id));
  res.json({ success: true });
});

// 7. Services (Array)
app.get('/api/services', (req, res) => {
  let svc = readDb('services');
  if (!Array.isArray(svc) || svc.length === 0) {
    svc = [
      { id: 1, name: "WhatsApp", icon: "fab fa-whatsapp", color: "#25d366", description: "WhatsApp OTP verification", payout_rate: 0.05, active: true },
      { id: 2, name: "Telegram", icon: "fab fa-telegram", color: "#2aabee", description: "Telegram OTP verification", payout_rate: 0.04, active: true },
      { id: 3, name: "Google", icon: "fab fa-google", color: "#4285f4", description: "Google account verification", payout_rate: 0.06, active: true },
      { id: 4, name: "Facebook", icon: "fab fa-facebook", color: "#1877f2", description: "Facebook OTP numbers", payout_rate: 0.045, active: true },
      { id: 5, name: "Amazon", icon: "fab fa-amazon", color: "#ff9900", description: "Amazon account verification", payout_rate: 0.055, active: true },
      { id: 6, name: "Aadhaar", icon: "fas fa-id-card", color: "#ff6600", description: "Aadhaar verification", payout_rate: 0.08, active: true },
      { id: 7, name: "TikTok", icon: "fab fa-tiktok", color: "#010101", description: "TikTok account verification", payout_rate: 0.04, active: true }
    ];
    writeDb('services', svc);
  }
  res.json(svc);
});

app.post('/api/services', (req, res) => {
  const svc = readDb('services') || [];
  const item = { id: nextId(svc), ...req.body, active: true, created: new Date().toISOString() };
  svc.push(item);
  writeDb('services', svc);
  res.json(item);
});

// 8. CLI Routes (Array) - Owner only
app.get('/api/cli-routes', requireAuth, (req, res) => {
  const sRole = (req.sessionUser.role || '').toLowerCase();
  if (sRole !== 'owner' && sRole !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Owner permissions required.' });
  }
  let routes = readDb('cli_routes') || [];
  const { search, status, service } = req.query;
  if (search) {
    const q = String(search).toLowerCase();
    routes = routes.filter(r =>
      (r.cli && String(r.cli).toLowerCase().includes(q)) ||
      (r.country && String(r.country).toLowerCase().includes(q)) ||
      (r.description && String(r.description).toLowerCase().includes(q)) ||
      (r.provider && String(r.provider).toLowerCase().includes(q)) ||
      (r.service && String(r.service).toLowerCase().includes(q))
    );
  }
  if (status) {
    routes = routes.filter(r => String(r.status).toLowerCase() === String(status).toLowerCase());
  }
  if (service) {
    routes = routes.filter(r => String(r.service).toLowerCase() === String(service).toLowerCase());
  }
  res.json(routes);
});

app.get('/api/cli-routes/export', requireAuth, (req, res) => {
  const sRole = (req.sessionUser.role || '').toLowerCase();
  if (sRole !== 'owner' && sRole !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Owner permissions required.' });
  }
  const routes = readDb('cli_routes') || [];
  const headers = ['id', 'cli', 'service', 'provider', 'country', 'description', 'status', 'priority', 'created'];
  const csvRows = [headers.join(',')];
  for (const r of routes) {
    const row = headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`);
    csvRows.push(row.join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="cli-routes.csv"');
  res.send(csvRows.join('\n'));
});

app.get('/api/cli-routes/:id', requireAuth, (req, res) => {
  const sRole = (req.sessionUser.role || '').toLowerCase();
  if (sRole !== 'owner' && sRole !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Owner permissions required.' });
  }
  const routes = readDb('cli_routes') || [];
  const idStr = String(req.params.id);
  const route = routes.find(r => String(r.id) === idStr);
  if (!route) return res.status(404).json({ error: 'CLI route not found' });
  res.json(route);
});

app.post('/api/cli-routes', (req, res) => {
  const routes = readDb('cli_routes') || [];
  const item = {
    id: nextId(routes),
    cli: req.body.cli || '',
    service: req.body.service || '',
    provider: req.body.provider || 'Manual',
    country: req.body.country || 'Global',
    description: req.body.description || '',
    status: req.body.status || 'active',
    priority: req.body.priority || 'Normal',
    created: new Date().toISOString(),
    ...req.body
  };
  routes.push(item);
  writeDb('cli_routes', routes);
  res.json({ success: true, ...item });
});

app.patch('/api/cli-routes/:id', (req, res) => {
  const routes = readDb('cli_routes') || [];
  const idStr = String(req.params.id);
  const idx = routes.findIndex(r => String(r.id) === idStr);
  if (idx === -1) {
    return res.status(404).json({ error: 'CLI route not found' });
  }
  routes[idx] = { ...routes[idx], ...req.body, id: routes[idx].id };
  writeDb('cli_routes', routes);
  res.json({ success: true, ...routes[idx] });
});

app.put('/api/cli-routes/:id', (req, res) => {
  const routes = readDb('cli_routes') || [];
  const idStr = String(req.params.id);
  const idx = routes.findIndex(r => String(r.id) === idStr);
  if (idx === -1) {
    return res.status(404).json({ error: 'CLI route not found' });
  }
  routes[idx] = { ...routes[idx], ...req.body, id: routes[idx].id };
  writeDb('cli_routes', routes);
  res.json({ success: true, ...routes[idx] });
});

app.delete('/api/cli-routes/:id', (req, res) => {
  const routes = readDb('cli_routes') || [];
  const idStr = String(req.params.id);
  const idx = routes.findIndex(r => String(r.id) === idStr);
  if (idx === -1) {
    return res.status(404).json({ error: 'CLI route not found' });
  }
  const deleted = routes.splice(idx, 1)[0];
  writeDb('cli_routes', routes);
  res.json({ success: true, message: 'CLI route deleted', id: deleted.id });
});


// 9. Support Tickets (Array) - Scoped to Own Tickets (Owner sees all)
app.get('/api/support-tickets', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const tickets = readDb('support_tickets') || [];
  if (isOwner) {
    return res.json(tickets);
  }
  const myUser = String(sessionUser.username || '').toLowerCase();
  const filtered = tickets.filter(t => {
    const tUser = String(t.username || t.user || t.created_by || '').toLowerCase();
    const tId = t.user_id || t.userId;
    return tUser === myUser || (tId && Number(tId) === Number(sessionUser.id));
  });
  res.json(filtered);
});

app.post('/api/support-tickets', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const tickets = readDb('support_tickets') || [];
  const item = {
    id: nextId(tickets),
    ...req.body,
    username: sessionUser.username,
    user: sessionUser.username,
    role: sessionUser.role,
    user_id: sessionUser.id,
    status: 'open',
    created: new Date().toISOString()
  };
  tickets.unshift(item);
  writeDb('support_tickets', tickets);
  res.json(item);
});

app.patch('/api/support-tickets/:id', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const tickets = readDb('support_tickets') || [];
  const id = Number(req.params.id);
  const idx = tickets.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Ticket not found' });
  const t = tickets[idx];
  const myUser = String(sessionUser.username || '').toLowerCase();
  const tUser = String(t.username || t.user || t.created_by || '').toLowerCase();
  if (!isOwner && tUser !== myUser) {
    return res.status(403).json({ error: 'Forbidden. You can only update your own tickets.' });
  }
  tickets[idx] = { ...tickets[idx], ...req.body, id: tickets[idx].id };
  writeDb('support_tickets', tickets);
  res.json(tickets[idx]);
});

// 10. Hierarchy (Array) - Scoped & Sanitized with safeUser
app.get('/api/hierarchy', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isManager = sRole === 'manager';
  const isAgent = sRole === 'agent';

  if (!isOwner && !isManager && !isAgent) {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const users = readDb('users') || [];
  const agents = readDb('agents') || [];
  const clients = readDb('clients') || [];

  let managers = users.filter(u => (u.role || '').toLowerCase() === 'manager');

  if (isManager) {
    managers = managers.filter(u => (u.username && String(u.username).toLowerCase() === String(sessionUser.username).toLowerCase()) || Number(u.id) === Number(sessionUser.id));
  } else if (isAgent) {
    const myAgent = agents.find(a => (a.username && String(a.username).toLowerCase() === String(sessionUser.username).toLowerCase()) || Number(a.id) === Number(sessionUser.id));
    if (!myAgent) return res.json([]);
    const myClients = clients.filter(c => Number(c.agent_id) === Number(myAgent.id) || (c.agent_username && String(c.agent_username).toLowerCase() === String(myAgent.username).toLowerCase()));
    return res.json([{
      manager: null,
      agents: [{
        ...safeUser(myAgent),
        clients: myClients.map(safeUser)
      }]
    }]);
  }

  const result = managers.map(mgr => {
    const mgrAgents = agents.filter(a => Number(a.manager_id) === Number(mgr.id) || (a.manager_username && String(a.manager_username).toLowerCase() === String(mgr.username).toLowerCase())).map(ag => ({
      ...safeUser(ag),
      clients: clients.filter(c => Number(c.agent_id) === Number(ag.id) || (c.agent_username && String(c.agent_username).toLowerCase() === String(ag.username).toLowerCase())).map(safeUser)
    }));
    return {
      manager: safeUser(mgr),
      agents: mgrAgents
    };
  });
  res.json(result);
});

// 11. SMPP CORE ENGINE, ENCRYPTION, REAL SERVER & CLIENT MANAGERS

function getSmppKey() {
  if (process.env.SMPP_SECRET) {
    return crypto.createHash('sha256').update(process.env.SMPP_SECRET).digest();
  }
  const keyPath = path.join(DATA_DIR, '.smpp.key');
  try {
    if (fs.existsSync(keyPath)) {
      const raw = fs.readFileSync(keyPath);
      if (raw.length === 32) return raw;
    }
    const newKey = crypto.randomBytes(32);
    fs.writeFileSync(keyPath, newKey);
    return newKey;
  } catch (err) {
    console.error('getSmppKey error:', err);
    return crypto.createHash('sha256').update('alpha-smpp-default-fallback').digest();
  }
}

function encryptSmppSecret(text) {
  if (!text) return '';
  try {
    const key = getSmppKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  } catch (err) {
    console.error('encryptSmppSecret error:', err);
    return '';
  }
}

function decryptSmppSecret(b64) {
  if (!b64) return '';
  try {
    const key = getSmppKey();
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 28) return '';
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    return '';
  }
}

function safeSmppAccount(acc) {
  if (!acc) return null;
  const copy = { ...acc };
  delete copy.password;
  delete copy.password_hash;
  delete copy.password_enc;
  return copy;
}

// ── SMPP Logging (data/smpp_logs.json, cap 5000) ─────────────────
function logSmppEvent(event, ip, reason, extra = {}) {
  try {
    const logs = readDb('smpp_logs') || [];
    const entry = {
      id: nextId(logs),
      event: String(event || ''),
      ip: String(ip || '127.0.0.1').replace(/^::ffff:/, ''),
      reason: String(reason || ''),
      timestamp: new Date().toISOString(),
      ...extra
    };
    logs.unshift(entry);
    if (logs.length > 5000) logs.length = 5000;
    writeDb('smpp_logs', logs);
  } catch (e) {
    console.error('logSmppEvent error:', e);
  }
}

// ── Failed Binds Tracking (5 failed binds in 10m -> block + firewall) ──
const failedSmppBinds = new Map(); // ip -> number[]

function recordFailedSmppBind(ip, systemId = '') {
  const cleanIp = String(ip || '127.0.0.1').trim().replace(/^::ffff:/, '');
  const now = Date.now();
  let list = (failedSmppBinds.get(cleanIp) || []).filter(t => now - t < 600000); // 10 min window
  list.push(now);
  failedSmppBinds.set(cleanIp, list);
  logSmppEvent('bind_fail', cleanIp, `Bind failed for system_id '${systemId}'`, { system_id: systemId });

  if (list.length >= 5) {
    try {
      const blocked = readDb('blocked_ips') || [];
      if (!blocked.some(b => (b.ip || '').replace(/^::ffff:/, '') === cleanIp)) {
        blocked.push({
          id: nextId(blocked),
          ip: cleanIp,
          reason: 'SMPP 5 failed binds in 10 minutes',
          created: new Date().toISOString()
        });
        writeDb('blocked_ips', blocked);
      }
    } catch (_) {}
    logFirewallEvent(cleanIp, 'SMPP Brute Force Blocked (5 failed binds in 10m)', 'smpp:bind');
    logSmppEvent('block', cleanIp, 'Blocked IP: 5 failed binds in 10 minutes', { system_id: systemId });
  }
}

function clearFailedSmppBinds(ip) {
  const cleanIp = String(ip || '127.0.0.1').trim().replace(/^::ffff:/i, '');
  failedSmppBinds.delete(cleanIp);
}

function ipMatchesAllowlist(clientIp, allowlistStr) {
  const cleanIp = String(clientIp || '').trim().replace(/^::ffff:/i, '');
  if (!allowlistStr || !String(allowlistStr).trim()) return true;
  const entries = String(allowlistStr).split(',').map(s => s.trim().replace(/^::ffff:/i, '')).filter(Boolean);
  if (!entries.length) return true;

  const ipToLong = (v) => {
    const parts = v.split('.');
    if (parts.length !== 4) return null;
    let out = 0;
    for (const p of parts) {
      if (!/^\d+$/.test(p)) return null;
      const n = Number(p);
      if (n < 0 || n > 255) return null;
      out = ((out << 8) | n) >>> 0;
    }
    return out;
  };

  for (const rule of entries) {
    if (rule === '*' || rule === '0.0.0.0/0' || rule === cleanIp) return true;
    if (rule.includes('/')) {
      const [base, bitsStr] = rule.split('/');
      const bits = parseInt(bitsStr, 10);
      const ipNum = ipToLong(cleanIp);
      const baseNum = ipToLong(base);
      if (ipNum !== null && baseNum !== null && Number.isFinite(bits) && bits >= 0 && bits <= 32) {
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        if ((ipNum & mask) === (baseNum & mask)) return true;
      }
    } else if (rule.includes('*')) {
      const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      if (new RegExp('^' + escaped + '$').test(cleanIp)) return true;
    }
  }
  return false;
}

function unblockSmppAccountIps(whitelistStr) {
  if (!whitelistStr || !String(whitelistStr).trim()) return;
  const ips = String(whitelistStr).split(',').map(s => s.trim().replace(/^::ffff:/i, '')).filter(Boolean);
  for (const ip of ips) {
    failedSmppBinds.delete(ip);
  }
  try {
    const blocked = readDb('blocked_ips') || [];
    const filtered = blocked.filter(b => {
      const bIp = String(b?.ip || '').trim().replace(/^::ffff:/i, '');
      const isAutoSmpp = String(b?.reason || '').includes('SMPP 5 failed binds');
      return !(isAutoSmpp && ipMatchesAllowlist(bIp, whitelistStr));
    });
    if (filtered.length !== blocked.length) {
      writeDb('blocked_ips', filtered);
    }
  } catch (_) {}
}

// ── Live SMPP Sessions State ────────────────────────────────────
let nextSmppSessionId = 1;
const liveSmppSessions = new Map(); // id -> session record & object

function syncLiveSessionsToDb() {
  try {
    const list = [];
    for (const s of liveSmppSessions.values()) {
      list.push({
        id: s.id,
        account_id: s.account_id,
        system_id: s.system_id,
        ip: s.ip,
        bind_type: s.bind_type,
        direction: s.direction,
        connected_at: s.connected_at,
        last_activity: s.last_activity,
        msgs_in: s.msgs_in || 0,
        msgs_out: s.msgs_out || 0,
        messages_sent: (s.msgs_in || 0) + (s.msgs_out || 0),
        status: s.status || 'active'
      });
    }
    writeDb('smpp_sessions', list);
  } catch (err) {
    console.error('syncLiveSessionsToDb error:', err);
  }
}

// ── Rolling Throughput Tracking (60s MPS & peak) ────────────────
const smppMpsHistory = []; // array of timestamps (ms)
let smppPeakMps = 0;

function recordSmppTrafficMessage() {
  const now = Date.now();
  smppMpsHistory.push(now);
  const cutoff = now - 60000;
  while (smppMpsHistory.length > 0 && smppMpsHistory[0] < cutoff) {
    smppMpsHistory.shift();
  }
  const oneSecCutoff = now - 1000;
  let countLastSec = 0;
  for (let i = smppMpsHistory.length - 1; i >= 0; i--) {
    if (smppMpsHistory[i] >= oneSecCutoff) countLastSec++;
    else break;
  }
  if (countLastSec > smppPeakMps) {
    smppPeakMps = countLastSec;
  }
}

function getSmppThroughputStats() {
  const now = Date.now();
  const cutoff = now - 60000;
  while (smppMpsHistory.length > 0 && smppMpsHistory[0] < cutoff) {
    smppMpsHistory.shift();
  }
  const current_mps = Math.round((smppMpsHistory.length / 60) * 100) / 100;
  if (current_mps > smppPeakMps) {
    smppPeakMps = current_mps;
  }
  const settings = readDb('settings') || {};
  const limit = Number(settings.smpp_max_mps) || Number(settings.smpp_global_max_mps) || 500;
  return {
    current_mps,
    peak_mps: smppPeakMps,
    limit
  };
}

// ── SMPP SERVER LISTENER (Carriers connect to us) ───────────────
let smppServerInstance = null;
const smppServerState = {
  listening: false,
  host: '0.0.0.0',
  port: 2775,
  started_at: null,
  last_error: null
};

function handleIncomingSmppSession(session) {
  const remoteIp = (session.socket && session.socket.remoteAddress)
    ? session.socket.remoteAddress.replace(/^::ffff:/i, '')
    : '127.0.0.1';
  session._ip = remoteIp;
  logSmppEvent('tcp_connect', remoteIp, `Incoming TCP connection on SMPP port ${smppServerState.port}`);

  session.on('error', (err) => {
    // Prevent unhandled errors from ever crashing the server
    const remote = session.socket ? `${session.socket.remoteAddress}:${session.socket.remotePort}` : 'unknown';
    session._errLogged = true;
    logSmppEvent('disconnect', session._ip || remoteIp, `Session error (${err.message}) on ${remote}`, { system_id: session._systemId || '' });
  });

  session.on('close', () => {
    if (session._liveId) {
      liveSmppSessions.delete(session._liveId);
      syncLiveSessionsToDb();
      logSmppEvent('disconnect', session._ip || remoteIp, `Session closed for ${session._systemId || 'unknown'}`, { system_id: session._systemId });
    } else if (!session._bindFailedLogged && !session._errLogged) {
      logSmppEvent('disconnect', session._ip || remoteIp, `TCP connection closed before completing SMPP bind`, { system_id: session._systemId || '' });
    }
  });

  const bindCommands = ['bind_transceiver', 'bind_transmitter', 'bind_receiver'];
  bindCommands.forEach(cmd => {
    session.on(cmd, async (pdu) => {
      if (session._binding || session._liveId) {
        try { session.send(pdu.response({ command_status: smpp.ESME_RALYBND })); } catch (_) {}
        return;
      }
      session._binding = true;

      try {
        session.pause();
      } catch (_) {}

      const ip = (session.socket && session.socket.remoteAddress)
        ? session.socket.remoteAddress.replace(/^::ffff:/i, '')
        : '127.0.0.1';

      if (isIpBlocked(ip)) {
        logFirewallEvent(ip, 'SMPP Blocked IP Connection Attempt', 'smpp:bind');
        logSmppEvent('bind_fail', ip, `Rejected bind for '${pdu.system_id || ''}' (IP blocked in Firewall)`, { system_id: String(pdu.system_id || '') });
        try {
          session.send(pdu.response({ command_status: smpp.ESME_RBINDFAIL }));
          session.destroy();
        } catch (_) {}
        session._binding = false;
        return;
      }

      const cleanSysId = String(pdu.system_id || '').trim();
      const cleanPass = String(pdu.password || '');

      const accounts = readDb('smpp_accounts') || [];
      const matchingAccounts = accounts.filter(a => (a.interconnect_type || 'smpp') === 'smpp' &&
        String(a.system_id || '').trim().toLowerCase() === cleanSysId.toLowerCase());

      let acc = null;
      let authOk = false;
      let failReason = '';
      if (!matchingAccounts.length) {
        failReason = `Unknown system_id '${cleanSysId}'`;
      } else {
        const activeMatches = matchingAccounts.filter(a => (a.status || 'active') === 'active');
        if (!activeMatches.length) {
          failReason = `Account '${matchingAccounts[0].company}' (${cleanSysId}) is inactive`;
        } else {
          for (const candidate of activeMatches) {
            let passOk = false;
            if (candidate.password_hash) {
              try {
                passOk = await bcrypt.compare(cleanPass, candidate.password_hash);
              } catch (_) {
                passOk = false;
              }
            } else if (candidate.password) {
              passOk = safeEqual(cleanPass, candidate.password);
            }
            if (session.socket && session.socket.destroyed) {
              session._binding = false;
              return;
            }
            if (!passOk) {
              if (!failReason) failReason = `Invalid password for system_id '${cleanSysId}'`;
              continue;
            }
            if (candidate.whitelist_ip && String(candidate.whitelist_ip).trim() && !ipMatchesAllowlist(ip, candidate.whitelist_ip)) {
              failReason = `IP ${ip} not in whitelist (${candidate.whitelist_ip}) for '${cleanSysId}'`;
              continue;
            }
            acc = candidate;
            authOk = true;
            failReason = '';
            break;
          }
        }

        // Connection limits
        if (authOk && acc) {
          const settings = readDb('settings') || {};
          const globalMax = Number(settings.smpp_max_connections) || 100;
          if (liveSmppSessions.size >= globalMax) {
            logSmppEvent('bind_fail', ip, `Global max_connections (${globalMax}) reached for '${cleanSysId}'`, { system_id: cleanSysId });
            try {
              session.send(pdu.response({ command_status: smpp.ESME_RALYBND }));
              session.close();
            } catch (_) {}
            session._binding = false;
            return;
          }

          const accountMax = Number(acc.max_connections || acc.limit || 10);
          let currentAccConnections = 0;
          for (const s of liveSmppSessions.values()) {
            if (s.account_id === acc.id) currentAccConnections++;
          }
          if (currentAccConnections >= accountMax) {
            logSmppEvent('bind_fail', ip, `Account max_connections (${accountMax}) reached for '${cleanSysId}'`, { system_id: cleanSysId });
            try {
              session.send(pdu.response({ command_status: smpp.ESME_RALYBND }));
              session.close();
            } catch (_) {}
            session._binding = false;
            return;
          }
        }
      }

      if (!authOk || (session.socket && session.socket.destroyed)) {
        recordFailedSmppBind(ip, cleanSysId);
        if (failReason) {
          logSmppEvent('bind_fail', ip, failReason, { system_id: cleanSysId });
        }
        try {
          session.send(pdu.response({ command_status: smpp.ESME_RBINDFAIL }));
          session.close();
        } catch (_) {}
        session._binding = false;
        return;
      }

      // Successful auth
      clearFailedSmppBinds(ip);
      const liveId = nextSmppSessionId++;
      const bindType = cmd.replace('bind_', '');

      session._liveId = liveId;
      session._accountId = acc.id;
      session._systemId = acc.system_id;
      session._company = acc.company;
      session._ip = ip;
      session._bindType = bindType;
      session._direction = 'inbound';
      session._connectedAt = new Date().toISOString();
      session._lastActivity = new Date().toISOString();
      session._maxMps = Number(acc.max_mps || 500);

      // Idle timeout: 120s
      try {
        if (session.socket && typeof session.socket.setTimeout === 'function') {
          session.socket.setTimeout(120000);
          session.socket.on('timeout', () => {
            try { session.close(); } catch (_) {}
          });
        }
      } catch (_) {}

      liveSmppSessions.set(liveId, {
        id: liveId,
        account_id: acc.id,
        system_id: acc.system_id,
        ip,
        bind_type: bindType,
        direction: 'inbound',
        connected_at: session._connectedAt,
        last_activity: session._lastActivity,
        msgs_in: 0,
        msgs_out: 0,
        messages_sent: 0,
        status: 'active',
        sessionObj: session,
        max_mps: session._maxMps,
        mps_window: []
      });

      syncLiveSessionsToDb();
      logSmppEvent('bind_ok', ip, `Bound as ${bindType} for account ${acc.company} (${acc.system_id})`, { system_id: acc.system_id });

      try {
        session.send(pdu.response({ system_id: acc.system_id || 'HUMEX-SMS' }));
        session.resume();
      } catch (_) {}
      session._binding = false;
    });
  });

  session.on('submit_sm', (pdu) => {
    const live = liveSmppSessions.get(session._liveId);
    const now = Date.now();
    if (live) {
      live.last_activity = new Date().toISOString();
      live.msgs_in = (live.msgs_in || 0) + 1;
      live.messages_sent = (live.msgs_in || 0) + (live.msgs_out || 0);

      // Enforce max_mps: reply ESME_RTHROTTLED (0x58) when exceeded
      const oneSecAgo = now - 1000;
      live.mps_window = (live.mps_window || []).filter(t => t > oneSecAgo);
      if (live.mps_window.length >= live.max_mps) {
        logSmppEvent('throttle', session._ip || '127.0.0.1', `Rate throttled (${live.mps_window.length}/${live.max_mps} mps) for ${session._systemId}`, { system_id: session._systemId });
        session.send(pdu.response({ command_status: smpp.ESME_RTHROTTLED }));
        return;
      }
      live.mps_window.push(now);
    }
    recordSmppTrafficMessage();

    let text = '';
    if (pdu.short_message) {
      if (typeof pdu.short_message === 'string') text = pdu.short_message;
      else if (Buffer.isBuffer(pdu.short_message)) text = pdu.short_message.toString('utf8');
      else if (pdu.short_message.message) text = String(pdu.short_message.message);
    }
    if (!text && pdu.message_payload) {
      if (typeof pdu.message_payload === 'string') text = pdu.message_payload;
      else if (Buffer.isBuffer(pdu.message_payload)) text = pdu.message_payload.toString('utf8');
    }

    const dest = String(pdu.destination_addr || '').trim();
    const src = String(pdu.source_addr || '').trim();

    const result = ingestSms({
      sender: src,
      to_number: dest,
      message: text,
      sms_id: String(pdu.sequence_number || Date.now()),
      company: session._company || '',
      source: 'smpp_server'
    });

    const msgId = String(result?.entry?.sms_id || result?.entry?.id || Date.now());
    session.send(pdu.response({ message_id: msgId }));
    syncLiveSessionsToDb();
  });

  session.on('data_sm', (pdu) => {
    const live = liveSmppSessions.get(session._liveId);
    if (live) {
      live.last_activity = new Date().toISOString();
      live.msgs_in = (live.msgs_in || 0) + 1;
      live.messages_sent = (live.msgs_in || 0) + (live.msgs_out || 0);
    }
    session.send(pdu.response({ message_id: String(Date.now()) }));
  });

  session.on('deliver_sm', (pdu) => {
    const live = liveSmppSessions.get(session._liveId);
    if (live) {
      live.last_activity = new Date().toISOString();
      live.msgs_in = (live.msgs_in || 0) + 1;
      live.messages_sent = (live.msgs_in || 0) + (live.msgs_out || 0);
    }
    session.send(pdu.response());
  });

  session.on('enquire_link', (pdu) => {
    const live = liveSmppSessions.get(session._liveId);
    if (live) live.last_activity = new Date().toISOString();
    session.send(pdu.response());
  });

  session.on('unbind', (pdu) => {
    logSmppEvent('unbind', session._ip || '127.0.0.1', `Unbind received for ${session._systemId || 'unknown'}`, { system_id: session._systemId });
    session.send(pdu.response());
    session.close();
  });
}

function startSmppServerListener(host, port) {
  stopSmppServerListener();

  const bindHost = host || (host === '' ? '0.0.0.0' : (process.env.SMPP_HOST || '0.0.0.0'));
  const bindPort = Number(port !== undefined && port !== null ? port : (process.env.SMPP_PORT || 2775));

  smppServerState.host = bindHost;
  smppServerState.port = bindPort;
  smppServerState.last_error = null;

  try {
    const serverInstance = smpp.createServer(handleIncomingSmppSession);

    serverInstance.on('error', (err) => {
      // The listener must never crash the app
      console.error('[SMPP Server Error]:', err.message);
      smppServerState.listening = false;
      smppServerState.last_error = err.code || err.message;
      logSmppEvent('server_error', bindHost, `SMPP server error: ${err.message}`);
    });

    serverInstance.listen(bindPort, bindHost, () => {
      smppServerState.listening = true;
      smppServerState.started_at = new Date().toISOString();
      smppServerState.last_error = null;
      console.log(`[HUMEX SMS] SMPP server listening on ${bindHost}:${bindPort}`);
      logSmppEvent('server_start', bindHost, `SMPP Server listening on ${bindHost}:${bindPort}`);
    });

    smppServerInstance = serverInstance;
  } catch (err) {
    console.error('Failed to start SMPP server:', err.message);
    smppServerState.listening = false;
    smppServerState.last_error = err.message;
  }
}

function stopSmppServerListener() {
  if (smppServerInstance) {
    try {
      smppServerInstance.close();
    } catch (_) {}
    smppServerInstance = null;
  }
  smppServerState.listening = false;

  // Drop inbound server sessions
  for (const [id, s] of liveSmppSessions.entries()) {
    if (s.direction === 'inbound') {
      try {
        if (s.sessionObj) {
          s.sessionObj.unbind();
          s.sessionObj.close();
        }
      } catch (_) {}
      liveSmppSessions.delete(id);
    }
  }
  syncLiveSessionsToDb();
}

// ── SMPP CLIENT MODE (We connect to a carrier) ──────────────────
const clientAccountManagers = new Map(); // accountId -> { session, reconnectTimer, backoff }

function handleDlrDeliveryReceipt(text, pdu) {
  try {
    const idMatch = text.match(/\bid:([^\s]+)/i);
    const statMatch = text.match(/\bstat:([^\s]+)/i);
    const receiptMsgId = idMatch ? idMatch[1] : (pdu.receipted_message_id || '');
    const receiptStat = statMatch ? statMatch[1].toUpperCase() : '';

    if (!receiptMsgId) return;

    let targetStatus = 'delivered';
    if (['UNDELIV', 'REJECTD', 'EXPIRED', 'DELETED', 'UNKNOWN'].includes(receiptStat)) {
      targetStatus = 'failed';
    } else if (['ACCEPTD', 'ENROUTE'].includes(receiptStat)) {
      targetStatus = 'pending';
    }

    const smsLog = readDb('sms_log') || [];
    let updated = false;
    for (const item of smsLog) {
      if (String(item.sms_id) === receiptMsgId || String(item.id) === receiptMsgId) {
        item.status = targetStatus;
        item.dlr_status = receiptStat || targetStatus;
        item.dlr_timestamp = new Date().toISOString();
        updated = true;
        break;
      }
    }
    if (updated) {
      writeDb('sms_log', smsLog);
    }
  } catch (err) {
    console.error('handleDlrDeliveryReceipt error:', err);
  }
}

function normalizeSmppHostPort(rawHost, rawPort) {
  let raw = String(rawHost || '').trim();
  let useTls = false;
  if (/^ssmpp:\/\//i.test(raw)) {
    useTls = true;
    raw = raw.replace(/^ssmpp:\/\//i, '');
  } else {
    raw = raw.replace(/^(?:smpp|tcp|https?):\/\//i, '');
  }
  raw = raw.split('/')[0].trim();
  let host = raw;
  let portNum = Number(rawPort);
  // Extract embedded :port when host isn't an IPv6 bracketed/multi-colon literal
  const colonCount = (raw.match(/:/g) || []).length;
  if (colonCount === 1) {
    const parts = raw.split(':');
    host = parts[0].trim();
    const embeddedPort = parseInt(parts[1], 10);
    if (!Number.isFinite(portNum) || portNum <= 0 || portNum === 2775) {
      if (embeddedPort >= 1 && embeddedPort <= 65535) portNum = embeddedPort;
    }
  } else if (raw.startsWith('[')) {
    const m = raw.match(/^\[([^\]]+)\](?::(\d+))?$/);
    if (m) {
      host = m[1];
      const embeddedPort = m[2] ? parseInt(m[2], 10) : NaN;
      if ((!Number.isFinite(portNum) || portNum <= 0) && embeddedPort >= 1 && embeddedPort <= 65535) {
        portNum = embeddedPort;
      }
    }
  }
  if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
    portNum = useTls ? 3550 : 2775;
  }
  return { host, port: portNum, useTls };
}

function startClientAccountConnection(acc) {
  stopClientAccountConnection(acc.id);
  if ((acc.status || 'active') !== 'active') return;

  const plainPass = decryptSmppSecret(acc.password_enc) || acc.password || '';
  const { host: cleanHost, port: cleanPort, useTls } = normalizeSmppHostPort(acc.host, acc.port);
  if (!cleanHost || !acc.system_id) return;

  const mgr = { backoff: 5000, reconnectTimer: null, session: null };
  clientAccountManagers.set(acc.id, mgr);

  function connectToCarrier() {
    try {
      const proto = (useTls || acc.tls === true) ? 'ssmpp' : 'smpp';
      const url = `${proto}://${cleanHost}:${cleanPort}`;
      const session = smpp.connect({
        url,
        auto_enquire_link_period: 30000 // enquire_link every 30s
      });
      mgr.session = session;

      session.on('error', (err) => {
        logSmppEvent('disconnect', acc.host, `Client connection error (${err.message}) for ${acc.company}`);
      });

      session.on('close', () => {
        if (session._liveId) {
          liveSmppSessions.delete(session._liveId);
          syncLiveSessionsToDb();
        }
        // Auto-reconnect with exponential backoff up to 60s
        mgr.backoff = Math.min(60000, mgr.backoff * 1.5);
        if (clientAccountManagers.has(acc.id) && (acc.status || 'active') === 'active') {
          mgr.reconnectTimer = setTimeout(connectToCarrier, mgr.backoff);
        }
      });

      const bindMethod = session['bind_' + (acc.bind_type || 'transceiver')] || session.bind_transceiver;
      bindMethod.call(session, {
        system_id: acc.system_id,
        password: plainPass
      }, (pdu) => {
        if (pdu.command_status === 0) {
          mgr.backoff = 5000; // reset backoff
          const liveId = nextSmppSessionId++;
          session._liveId = liveId;
          session._accountId = acc.id;
          session._systemId = acc.system_id;
          session._company = acc.company;
          session._ip = acc.host;
          session._bindType = acc.bind_type || 'transceiver';

          liveSmppSessions.set(liveId, {
            id: liveId,
            account_id: acc.id,
            system_id: acc.system_id,
            ip: acc.host,
            bind_type: acc.bind_type || 'transceiver',
            direction: 'outbound',
            connected_at: new Date().toISOString(),
            last_activity: new Date().toISOString(),
            msgs_in: 0,
            msgs_out: 0,
            messages_sent: 0,
            status: 'active',
            sessionObj: session
          });
          syncLiveSessionsToDb();
          logSmppEvent('bind_ok', acc.host, `Client bound to carrier ${acc.company} (${acc.system_id})`, { system_id: acc.system_id });
        } else {
          logSmppEvent('bind_fail', acc.host, `Client bind failed (status 0x${pdu.command_status.toString(16)}) with ${acc.company}`);
          session.close();
        }
      });

      session.on('deliver_sm', (pdu) => {
        const live = liveSmppSessions.get(session._liveId);
        if (live) {
          live.last_activity = new Date().toISOString();
          live.msgs_in = (live.msgs_in || 0) + 1;
          live.messages_sent = (live.msgs_in || 0) + (live.msgs_out || 0);
        }
        recordSmppTrafficMessage();

        const isDlr = (pdu.esm_class & 0x04) !== 0;
        let text = '';
        if (pdu.short_message) {
          if (typeof pdu.short_message === 'string') text = pdu.short_message;
          else if (Buffer.isBuffer(pdu.short_message)) text = pdu.short_message.toString('utf8');
          else if (pdu.short_message.message) text = String(pdu.short_message.message);
        }

        if (isDlr) {
          handleDlrDeliveryReceipt(text, pdu);
        } else {
          ingestSms({
            sender: pdu.source_addr,
            to_number: pdu.destination_addr,
            message: text,
            sms_id: String(pdu.sequence_number || ''),
            company: acc.company,
            source: 'smpp_client'
          });
        }
        session.send(pdu.response());
        syncLiveSessionsToDb();
      });
    } catch (err) {
      logSmppEvent('disconnect', acc.host, `Client connection exception: ${err.message}`);
    }
  }

  connectToCarrier();
}

function stopClientAccountConnection(accountId) {
  const mgr = clientAccountManagers.get(accountId);
  if (mgr) {
    if (mgr.reconnectTimer) clearTimeout(mgr.reconnectTimer);
    if (mgr.session) {
      try {
        mgr.session.unbind();
        mgr.session.close();
      } catch (_) {}
    }
    clientAccountManagers.delete(accountId);
  }
}

// ── SMPP Startup & Migration ────────────────────────────────────
function initSmppEngine() {
  try {
    // 1. Clear stale sessions file at boot
    writeDb('smpp_sessions', []);

    // 2. Ensure smpp_logs.json exists
    const logs = readDb('smpp_logs');
    if (!Array.isArray(logs)) writeDb('smpp_logs', []);

    // 3. Migrate plaintext passwords in smpp_accounts.json
    const accounts = readDb('smpp_accounts') || [];
    let modified = false;
    for (const acc of accounts) {
      if (acc.interconnect_type === 'smpp') {
        if (acc.password) {
          acc.password_hash = bcrypt.hashSync(String(acc.password), 10);
          delete acc.password;
          modified = true;
        }
      } else if (acc.interconnect_type === 'smpp-client') {
        if (acc.password) {
          acc.password_enc = encryptSmppSecret(String(acc.password));
          delete acc.password;
          modified = true;
        }
      }
      if (!acc.bind_type) {
        acc.bind_type = 'transceiver';
        modified = true;
      }
      if (acc.max_connections === undefined) {
        acc.max_connections = Number(acc.limit || 10);
        modified = true;
      }
      if (acc.max_mps === undefined) {
        acc.max_mps = 500;
        modified = true;
      }
    }
    if (modified) {
      writeDb('smpp_accounts', accounts);
    }

    // 4. Start listener if settings.smpp_enabled is true
    const settings = readDb('settings') || {};
    if (settings.smpp_enabled === true || process.env.SMPP_ENABLED === 'true') {
      const host = process.env.SMPP_HOST || settings.smpp_host || '0.0.0.0';
      const port = Number(process.env.SMPP_PORT || settings.smpp_port || 2775);
      startSmppServerListener(host, port);
    }

    // 5. Connect active client accounts
    for (const acc of accounts) {
      if (acc.interconnect_type === 'smpp-client' && (acc.status || 'active') === 'active') {
        startClientAccountConnection(acc);
      }
    }
  } catch (err) {
    console.error('initSmppEngine error:', err);
  }
}

function syncSmppServerFromSettings(updatedSettings) {
  try {
    const isEnabled = updatedSettings.smpp_enabled === true;
    const host = (updatedSettings.smpp_host !== undefined && updatedSettings.smpp_host !== null) ? updatedSettings.smpp_host : (process.env.SMPP_HOST || '0.0.0.0');
    const port = Number(updatedSettings.smpp_port !== undefined && updatedSettings.smpp_port !== null ? updatedSettings.smpp_port : (process.env.SMPP_PORT || 2775));

    if (!isEnabled) {
      if (smppServerState.listening || smppServerInstance) {
        console.log('[HUMEX SMS] Stopping SMPP server listener per settings toggle');
        stopSmppServerListener();
      }
    } else {
      if (!smppServerState.listening || smppServerState.host !== host || smppServerState.port !== port) {
        console.log('[HUMEX SMS] (Re)starting SMPP server listener per settings update');
        startSmppServerListener(host, port);
      }
    }
  } catch (err) {
    console.error('syncSmppServerFromSettings error:', err);
  }
}

// ── SMPP HTTP API ENDPOINTS ─────────────────────────────────────
app.get('/api/smpp/accounts', (req, res) => {
  const accounts = readDb('smpp_accounts') || [];
  const smsLog = readDb('sms_log') || [];
  const today = new Date().toISOString().slice(0, 10);
  const enriched = accounts.map(rawAcc => {
    const acc = safeSmppAccount(rawAcc);
    const company = (acc.company || '').toLowerCase();
    const systemId = (acc.system_id || '').toLowerCase();
    const matched = smsLog.filter(s => {
      const sComp = (s.company || '').toLowerCase();
      const sSys = (s.system_id || '').toLowerCase();
      return (company && (sComp === company || sSys === company)) ||
             (systemId && (sComp === systemId || sSys === systemId));
    });
    return {
      ...acc,
      total_otp: matched.length,
      otp_today: matched.filter(s => (s.timestamp || '').slice(0, 10) === today).length
    };
  });
  res.json(enriched);
});

app.get('/api/smpp/accounts/:id', (req, res) => {
  const accounts = readDb('smpp_accounts') || [];
  const idStr = String(req.params.id);
  const acc = accounts.find(a => String(a.id) === idStr);
  if (!acc) {
    return res.status(404).json({ error: 'SMPP account not found' });
  }
  res.json(safeSmppAccount(acc));
});

app.post('/api/smpp/accounts', (req, res) => {
  try {
    const data = readDb('smpp_accounts') || [];
    const payload = req.body || {};

    if (!payload.company || !String(payload.company).trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    const company = String(payload.company).trim();
    const icType = payload.interconnect_type || 'smpp';

    if (icType === 'smpp') {
      if (!payload.system_id || !String(payload.system_id).trim()) {
        return res.status(400).json({ error: 'System ID is required' });
      }
      const sysLower = String(payload.system_id).trim().toLowerCase();
      if (data.some(a => (a.interconnect_type || 'smpp') === 'smpp' && String(a.system_id || '').trim().toLowerCase() === sysLower)) {
        return res.status(400).json({ error: `System ID '${String(payload.system_id).trim()}' already exists. Edit the existing account or use a different System ID.` });
      }
    } else if (icType === 'smpp-client') {
      if (!payload.host || !String(payload.host).trim()) {
        return res.status(400).json({ error: 'Host/IP is required' });
      }
      if (!payload.system_id || !String(payload.system_id).trim()) {
        return res.status(400).json({ error: 'System ID is required' });
      }
    }

    let passwordHash = undefined;
    let passwordEnc = undefined;
    if (payload.password) {
      if (icType === 'smpp') {
        passwordHash = bcrypt.hashSync(String(payload.password), 10);
      } else {
        passwordEnc = encryptSmppSecret(String(payload.password));
      }
    }

    const cleanPayload = { ...payload };
    delete cleanPayload.password;

    if (icType === 'smpp-client') {
      const norm = normalizeSmppHostPort(payload.host, payload.port);
      cleanPayload.host = norm.host;
      cleanPayload.port = norm.port;
      if (norm.useTls) cleanPayload.tls = true;
    }

    const newAccount = {
      ...cleanPayload,
      id: nextId(data),
      company,
      interconnect_type: icType,
      bind_type: payload.bind_type || 'transceiver',
      max_connections: Number(payload.max_connections || payload.limit || 10),
      max_mps: Number(payload.max_mps || 500),
      password_hash: passwordHash,
      password_enc: passwordEnc,
      status: payload.status || 'active',
      limit: Number(payload.limit) || 500,
      total_otp: 0,
      otp_today: 0,
      messages_today: 0,
      created: new Date().toISOString()
    };

    data.push(newAccount);
    writeDb('smpp_accounts', data);
    if (newAccount.whitelist_ip) unblockSmppAccountIps(newAccount.whitelist_ip);

    if (newAccount.interconnect_type === 'smpp-client' && newAccount.status === 'active') {
      startClientAccountConnection(newAccount);
    }

    try {
      const actor = (req.sessionUser && req.sessionUser.username) ? req.sessionUser.username : 'Admin';
      logAudit(actor, 'SMPP Account Added', `Added SMPP account for ${company} (${icType})`, 'SMPP');
    } catch (e) {}

    return res.status(201).json(safeSmppAccount(newAccount));
  } catch (err) {
    console.error('Add SMPP account error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

const handleUpdateSmppAccount = (req, res) => {
  try {
    const data = readDb('smpp_accounts') || [];
    const idStr = String(req.params.id);
    const idx = data.findIndex(a => String(a.id) === idStr);
    if (idx === -1) {
      return res.status(404).json({ error: 'SMPP account not found' });
    }

    const current = data[idx];
    const updates = { ...(req.body || {}) };

    if (updates.password) {
      if ((current.interconnect_type || updates.interconnect_type) === 'smpp') {
        current.password_hash = bcrypt.hashSync(String(updates.password), 10);
      } else {
        current.password_enc = encryptSmppSecret(String(updates.password));
      }
      delete updates.password;
    }
    delete current.password;

    Object.assign(current, updates);
    if ((current.interconnect_type || 'smpp') === 'smpp-client' && current.host) {
      const norm = normalizeSmppHostPort(current.host, current.port);
      current.host = norm.host;
      current.port = norm.port;
      if (norm.useTls) current.tls = true;
    }
    current.id = Number(idStr) || current.id;
    current.updated_at = new Date().toISOString();

    data[idx] = current;
    writeDb('smpp_accounts', data);
    if (current.whitelist_ip) unblockSmppAccountIps(current.whitelist_ip);

    if (current.interconnect_type === 'smpp-client') {
      if (current.status === 'active') {
        startClientAccountConnection(current);
      } else {
        stopClientAccountConnection(current.id);
      }
    }

    try {
      const actor = (req.sessionUser && req.sessionUser.username) ? req.sessionUser.username : 'Admin';
      logAudit(actor, 'SMPP Account Updated', `Updated SMPP account #${idStr} (${current.company || ''})`, 'SMPP');
    } catch (e) {}

    return res.json(safeSmppAccount(current));
  } catch (err) {
    console.error('Update SMPP account error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

app.patch('/api/smpp/accounts/:id', handleUpdateSmppAccount);
app.put('/api/smpp/accounts/:id', handleUpdateSmppAccount);

app.delete('/api/smpp/accounts/:id', (req, res) => {
  try {
    const data = readDb('smpp_accounts') || [];
    const idStr = String(req.params.id);
    const idx = data.findIndex(a => String(a.id) === idStr);
    if (idx === -1) {
      return res.status(404).json({ error: 'SMPP account not found' });
    }

    const removed = data.splice(idx, 1)[0];
    writeDb('smpp_accounts', data);

    if (removed.interconnect_type === 'smpp-client') {
      stopClientAccountConnection(removed.id);
    } else {
      // Unbind and drop live sessions for this account
      for (const [sessId, live] of liveSmppSessions.entries()) {
        if (Number(live.account_id) === Number(removed.id) || (live.system_id && live.system_id === removed.system_id)) {
          if (live.sessionObj) {
            try { live.sessionObj.unbind(); live.sessionObj.close(); } catch (_) {}
          }
          liveSmppSessions.delete(sessId);
        }
      }
      syncLiveSessionsToDb();
    }

    try {
      const actor = (req.sessionUser && req.sessionUser.username) ? req.sessionUser.username : 'Admin';
      logAudit(actor, 'SMPP Account Deleted', `Deleted SMPP account #${idStr} (${removed.company || ''})`, 'SMPP');
    } catch (e) {}

    return res.json({ success: true, message: 'SMPP account deleted' });
  } catch (err) {
    console.error('Delete SMPP account error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.post('/api/smpp/accounts/:id/test', async (req, res) => {
  try {
    const data = readDb('smpp_accounts') || [];
    const idStr = String(req.params.id);
    const acc = data.find(a => String(a.id) === idStr);
    if (!acc) {
      return res.status(404).json({ success: false, error: 'SMPP account not found' });
    }

    const start = Date.now();
    const icType = acc.interconnect_type || 'smpp';

    if (icType === 'smpp-client') {
      const { host: cleanHost, port: cleanPort, useTls } = normalizeSmppHostPort(acc.host || '127.0.0.1', acc.port || 2775);
      const plainPass = decryptSmppSecret(acc.password_enc) || acc.password || '';
      const bindType = acc.bind_type || 'transceiver';

      // If this client account already has an active live session, verify it via enquire_link
      // instead of opening a 2nd simultaneous connection (many carriers limit max_connections=1).
      let existingLive = null;
      for (const s of liveSmppSessions.values()) {
        if (s.direction === 'outbound' && Number(s.account_id) === Number(acc.id) && s.sessionObj?.socket?.writable) {
          existingLive = s;
          break;
        }
      }

      if (existingLive) {
        const liveCheck = await new Promise((resolve) => {
          let done = false;
          const t = setTimeout(() => {
            if (done) return;
            done = true;
            resolve(null);
          }, 4000);
          try {
            existingLive.sessionObj.enquire_link((pdu) => {
              if (done) return;
              done = true;
              clearTimeout(t);
              if (pdu && pdu.command_status === 0) {
                resolve({
                  success: true,
                  response_time: Date.now() - start,
                  message: `SMPP live session active & verified (enquire_link 0x0) to ${cleanHost}:${cleanPort}`,
                  system_id: acc.system_id,
                  interconnect_type: icType
                });
              } else {
                resolve(null);
              }
            });
          } catch (_) {
            clearTimeout(t);
            resolve(null);
          }
        });
        if (liveCheck) {
          return res.json(liveCheck);
        }
      }

      const testResult = await new Promise((resolve) => {
        let finished = false;
        let tcpConnected = false;
        let testSession = null;
        const finish = (payload) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve(payload);
        };

        const timer = setTimeout(() => {
          try { if (testSession) testSession.destroy(); } catch (_) {}
          const errMsg = tcpConnected
            ? `TCP connected to ${cleanHost}:${cleanPort}, but carrier did not reply to ${bindType} bind within 8s (check System ID/Password or TLS)`
            : `TCP connect timed out after 8s to ${cleanHost}:${cleanPort} (carrier IP/port unreachable or firewall/IP whitelist blocking)`;
          logSmppEvent('test_timeout', cleanHost, errMsg, { system_id: acc.system_id, port: cleanPort, tcp_connected: tcpConnected });
          finish({ success: false, response_time: Date.now() - start, error: errMsg });
        }, 8000);

        const proto = (useTls || acc.tls === true) ? 'ssmpp' : 'smpp';
        try {
          testSession = smpp.connect({ url: `${proto}://${cleanHost}:${cleanPort}` });
        } catch (e) {
          logSmppEvent('test_error', cleanHost, e.message, { system_id: acc.system_id, port: cleanPort });
          return finish({ success: false, response_time: Date.now() - start, error: e.message });
        }

        testSession.on('connect', () => {
          tcpConnected = true;
        });
        testSession.on('secureConnect', () => {
          tcpConnected = true;
        });

        testSession.on('error', (err) => {
          try { testSession.destroy(); } catch (_) {}
          const errMsg = `${err.message || 'Connection failed'} (${cleanHost}:${cleanPort})`;
          logSmppEvent('test_error', cleanHost, errMsg, { system_id: acc.system_id, port: cleanPort });
          finish({ success: false, response_time: Date.now() - start, error: errMsg });
        });

        testSession.on('close', () => {
          const errMsg = tcpConnected
            ? `Carrier ${cleanHost}:${cleanPort} closed socket during ${bindType} bind (check IP whitelist, System ID/Password, or max_connections limit)`
            : `TCP connection to ${cleanHost}:${cleanPort} closed before handshake`;
          logSmppEvent('test_close', cleanHost, errMsg, { system_id: acc.system_id, port: cleanPort });
          finish({ success: false, response_time: Date.now() - start, error: errMsg });
        });

        const bindFn = testSession['bind_' + bindType] || testSession.bind_transceiver;
        bindFn.call(testSession, {
          system_id: acc.system_id || '',
          password: plainPass
        }, (pdu) => {
          const latency = Date.now() - start;
          if (pdu.command_status === 0) {
            try {
              testSession.unbind(() => {
                try { testSession.close(); } catch (_) {}
              });
            } catch (_) {
              try { testSession.close(); } catch (_) {}
            }
            finish({
              success: true,
              response_time: latency,
              message: `SMPP bind succeeded (status 0x0) to ${acc.company} (${cleanHost}:${cleanPort})`,
              system_id: acc.system_id,
              interconnect_type: icType
            });
          } else {
            try { testSession.close(); } catch (_) {}
            const errMsg = `SMPP bind rejected by ${cleanHost}:${cleanPort} (command_status 0x${pdu.command_status.toString(16)})`;
            logSmppEvent('bind_fail', cleanHost, errMsg, { system_id: acc.system_id, port: cleanPort });
            finish({
              success: false,
              response_time: latency,
              error: errMsg,
              system_id: acc.system_id,
              interconnect_type: icType
            });
          }
        });
      });

      return res.json(testResult);
    } else {
      // Server account: carrier connects to us.
      // If host or whitelist_ip is specified, really test TCP connectivity with 8s timeout
      const targetHost = acc.host || (acc.whitelist_ip ? acc.whitelist_ip.split(',')[0].trim() : '');
      const targetPort = Number(acc.port) || 2775;

      if (targetHost) {
        const tcpResult = await new Promise((resolve) => {
          const socket = new net.Socket();
          let finished = false;
          socket.setTimeout(8000);

          socket.on('connect', () => {
            if (finished) return;
            finished = true;
            socket.destroy();
            resolve({
              success: true,
              response_time: Date.now() - start,
              message: `TCP connect succeeded to ${targetHost}:${targetPort}`,
              system_id: acc.system_id,
              interconnect_type: icType
            });
          });

          socket.on('timeout', () => {
            if (finished) return;
            finished = true;
            socket.destroy();
            resolve({
              success: false,
              response_time: Date.now() - start,
              error: `TCP connect timed out after 8s to ${targetHost}:${targetPort}`,
              system_id: acc.system_id,
              interconnect_type: icType
            });
          });

          socket.on('error', (err) => {
            if (finished) return;
            finished = true;
            socket.destroy();
            resolve({
              success: false,
              response_time: Date.now() - start,
              error: err.message || 'TCP connect failed',
              system_id: acc.system_id,
              interconnect_type: icType
            });
          });

          socket.connect(targetPort, targetHost);
        });

        return res.json(tcpResult);
      } else {
        const latency = Date.now() - start;
        return res.json({
          success: true,
          response_time: latency,
          message: `Server account ${acc.system_id} configured. SMPP listener is ${smppServerState.listening ? 'online' : 'offline'}.`,
          system_id: acc.system_id,
          interconnect_type: icType
        });
      }
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/smpp/accounts/:id/reconnect', (req, res) => {
  try {
    const data = readDb('smpp_accounts') || [];
    const idStr = String(req.params.id);
    const acc = data.find(a => String(a.id) === idStr);
    if (!acc) {
      return res.status(404).json({ error: 'SMPP account not found' });
    }

    acc.status = 'active';
    acc.last_reconnect = new Date().toISOString();
    writeDb('smpp_accounts', data);

    if (acc.interconnect_type === 'smpp-client') {
      stopClientAccountConnection(acc.id);
      startClientAccountConnection(acc);
      return res.json({ success: true, message: `Client account ${acc.company} reconnecting` });
    } else {
      let dropped = 0;
      for (const [sessId, live] of liveSmppSessions.entries()) {
        if (Number(live.account_id) === Number(acc.id) || (live.system_id && live.system_id === acc.system_id)) {
          if (live.sessionObj) {
            try {
              live.sessionObj.unbind();
              live.sessionObj.close();
            } catch (_) {}
          }
          liveSmppSessions.delete(sessId);
          dropped++;
        }
      }
      syncLiveSessionsToDb();
      return res.json({ success: true, message: `Dropped ${dropped} active session(s) for ${acc.company}` });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/smpp/sessions', (req, res) => {
  const list = [];
  for (const s of liveSmppSessions.values()) {
    list.push({
      id: s.id,
      account_id: s.account_id,
      system_id: s.system_id,
      ip: s.ip,
      bind_type: s.bind_type,
      direction: s.direction,
      connected_at: s.connected_at,
      last_activity: s.last_activity,
      msgs_in: s.msgs_in || 0,
      msgs_out: s.msgs_out || 0,
      messages_sent: (s.msgs_in || 0) + (s.msgs_out || 0),
      status: s.status || 'active'
    });
  }
  res.json(list);
});

app.delete('/api/smpp/sessions/:id', (req, res) => {
  try {
    const idStr = String(req.params.id);
    let target = null;
    for (const [sid, s] of liveSmppSessions.entries()) {
      if (String(s.id) === idStr) {
        target = s;
        liveSmppSessions.delete(sid);
        break;
      }
    }

    if (target && target.sessionObj) {
      try {
        target.sessionObj.unbind();
        target.sessionObj.close();
      } catch (_) {}
    }
    syncLiveSessionsToDb();

    if (target) {
      logSmppEvent('unbind', target.ip || '127.0.0.1', `Admin disconnected session #${idStr} (${target.system_id})`, { system_id: target.system_id });
    }

    try {
      const actor = (req.sessionUser && req.sessionUser.username) ? req.sessionUser.username : 'Admin';
      logAudit(actor, 'SMPP Session Disconnected', `Disconnected session #${idStr}`, 'SMPP');
    } catch (e) {}

    res.json({ success: true, message: 'Session disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/smpp/connection-logs', (req, res) => {
  const logs = readDb('smpp_logs') || [];
  res.json(logs);
});

// ── TEST PANEL NUMBER FIXATION HELPERS ─────────────────────────
function isTestNumber(number) {
  if (!number) return false;
  const tn = readDb('test_numbers') || [];
  const clean = String(number).trim();
  return tn.some(t => String(t.number).trim() === clean);
}

function syncTestNumbersWithNumbersPool() {
  try {
    const testNumbers = readDb('test_numbers') || [];
    let numbers = readDb('numbers') || [];
    if (!Array.isArray(numbers)) numbers = [];

    const tnMap = new Map();
    testNumbers.forEach(t => {
      if (t.number) tnMap.set(String(t.number).trim(), t);
    });

    let modified = false;

    // 1. Mark existing numbers matching test_numbers as fixed for Test Panel
    numbers = numbers.map(n => {
      const numStr = String(n.number || '').trim();
      if (tnMap.has(numStr)) {
        if (!n.fixed_for_test || !n.is_test_panel || n.user !== 'Test Panel') {
          modified = true;
          return {
            ...n,
            fixed_for_test: true,
            is_test_panel: true,
            user: 'Test Panel',
            client_name: 'Test Panel',
            client_username: 'Test Panel',
            client_id: null,
            agent_id: null,
            manager_id: null,
            status: 'assigned',
            notes: n.notes ? (n.notes.includes('Test Panel') ? n.notes : `${n.notes} | Fixed for Test Panel`) : 'Fixed for Test Panel'
          };
        }
      } else if (n.fixed_for_test || n.is_test_panel || n.user === 'Test Panel') {
        // If it was previously marked fixed for Test Panel but is no longer in test_numbers, release it back to pool
        modified = true;
        return {
          ...n,
          fixed_for_test: false,
          is_test_panel: false,
          user: 'unallocated',
          client_name: '',
          client_username: '',
          client_id: null,
          agent_id: null,
          manager_id: null,
          status: 'active',
          notes: (n.notes || '').replace(/\|?\s*Fixed for Test Panel/gi, '').trim()
        };
      }
      return n;
    });

    // 2. Ensure every test number in test_numbers is present in the numbers pool
    const existingNumSet = new Set(numbers.map(n => String(n.number).trim()));
    const ranges = readDb('sms_ranges') || [];
    testNumbers.forEach(tn => {
      const numStr = String(tn.number || '').trim();
      if (numStr && !existingNumSet.has(numStr)) {
        const rng = (tn.range_id && ranges.find(r => r.id === Number(tn.range_id))) ||
                    (tn.range_name && ranges.find(r => r.range_name === tn.range_name)) ||
                    ranges.find(r => r.country === tn.country);
        const rName = tn.range_name || tn.range_label || (rng && (rng.range_name || rng.name)) || tn.country || 'Test Range';
        numbers.unshift({
          id: nextId(numbers),
          number: numStr,
          range_id: (rng && rng.id) || tn.range_id || null,
          range_name: rName,
          prefix: (rng && rng.prefix) || tn.prefix || '',
          app: tn.app || 'Unassigned',
          status: 'assigned',
          user: 'Test Panel',
          client_name: 'Test Panel',
          client_username: 'Test Panel',
          client_id: null,
          agent_id: null,
          manager_id: null,
          country: tn.country || (rng && rng.country) || '',
          provider: tn.provider || (rng && rng.provider) || 'Manual',
          otp_limit: (rng && rng.otp_limit) || 0,
          allocated_at: tn.created || new Date().toISOString(),
          last_sms: null,
          sms_count: 0,
          fixed_for_test: true,
          is_test_panel: true,
          notes: 'Fixed for Test Panel'
        });
        existingNumSet.add(numStr);
        modified = true;
      }
    });

    if (modified) {
      writeDb('numbers', numbers);
    }
  } catch (err) {
    console.error('syncTestNumbersWithNumbersPool error:', err);
  }
}

function hasAccountHistory(tableName, targetId, username) {
  const tid = Number(targetId);
  const uName = String(username || '').toLowerCase();

  const smsLog = readDb('sms_log') || [];
  const hasSms = smsLog.some(s => {
    if (!s) return false;
    if (tableName === 'users' && Number(s.manager_id) === tid) return true;
    if (tableName === 'agents' && Number(s.agent_id) === tid) return true;
    if (tableName === 'clients' && (Number(s.client_id) === tid || (s.user && String(s.user).toLowerCase() === uName))) return true;
    return false;
  });
  if (hasSms) return true;

  const numbers = readDb('numbers') || [];
  const hasNum = numbers.some(n => {
    if (!n) return false;
    if (tableName === 'users' && Number(n.manager_id) === tid) return true;
    if (tableName === 'agents' && Number(n.agent_id) === tid) return true;
    if (tableName === 'clients' && (Number(n.client_id) === tid || (n.user && String(n.user).toLowerCase() === uName))) return true;
    return false;
  });
  if (hasNum) return true;

  const transfers = readDb('number_transfers') || [];
  const hasTransfer = transfers.some(t => {
    if (!t) return false;
    return Number(t.to_user_id) === tid || Number(t.from_user_id) === tid;
  });
  if (hasTransfer) return true;

  const payouts = readDb('payout_requests') || [];
  const hasPayout = payouts.some(p => {
    if (!p) return false;
    return Number(p.user_id) === tid || (p.username && String(p.username).toLowerCase() === uName);
  });
  if (hasPayout) return true;

  return false;
}

// ── PAGINATED OBJECT ENDPOINTS { data: [...], total: ... } ───
function registerPaginatedCrud(routePath, tableName) {
  const isAccountTable = ['users', 'agents', 'clients', 'testpanel_credentials'].includes(tableName);

  app.get(`/api/${routePath}`, requireAuth, (req, res) => {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';
    const isClient = sRole === 'client';

    // Strict Table-Level Access Guards
    if (['users', 'rate_limits', 'firewall_events', 'testpanel_credentials'].includes(tableName) && !isOwner) {
      if (tableName === 'users' && isManager && req.query.role && String(req.query.role).toLowerCase() === 'manager') {
        // Allow Managers to query Managers list for dropdown filter
      } else {
        return res.status(403).json({ error: 'Access denied. Owner permissions required.' });
      }
    }

    let data = readDb(tableName);
    if (!Array.isArray(data)) data = [];

    if (tableName === 'audit_logs') {
      if (!isOwner) {
        const u = String(sessionUser.username || '').toLowerCase();
        data = data.filter(item => {
          const act = String(item.actor || item.user || '').toLowerCase();
          return act === u;
        });
      }
    }

    // RBAC filtering based on authenticated sessionUser
    if (tableName === 'agents') {
      if (isManager) {
        data = data.filter(a => Number(a.manager_id) === Number(sessionUser.id));
      } else if (isAgent) {
        data = data.filter(a => Number(a.id) === Number(sessionUser.id));
      } else if (isClient) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    } else if (tableName === 'clients') {
      if (isManager) {
        const mgrAgents = new Set((readDb('agents') || []).filter(a => Number(a.manager_id) === Number(sessionUser.id)).map(a => Number(a.id)));
        data = data.filter(c => Number(c.manager_id) === Number(sessionUser.id) || (c.agent_id && mgrAgents.has(Number(c.agent_id))));
      } else if (isAgent) {
        data = data.filter(c => Number(c.agent_id) === Number(sessionUser.id));
      } else if (isClient) {
        data = data.filter(c => Number(c.id) === Number(sessionUser.id));
      }
    } else if (tableName === 'numbers') {
      if (isManager) {
        const showPool = req.query.unallocated === 'true' || req.query.pool === 'true' || req.query.show_unallocated === 'true';
        data = data.filter(n => Number(n.manager_id) === Number(sessionUser.id) || (showPool && !n.manager_id && !n.agent_id && !n.client_id));
      } else if (isAgent) {
        data = data.filter(n => Number(n.agent_id) === Number(sessionUser.id));
      } else if (isClient) {
        data = data.filter(n => Number(n.client_id) === Number(sessionUser.id) || (n.user && String(n.user).toLowerCase() === String(sessionUser.username).toLowerCase()));
      }
    } else if (tableName === 'number_transfers') {
      if (isManager) {
        data = data.filter(t => Number(t.to_user_id) === Number(sessionUser.id) || Number(t.from_user_id) === Number(sessionUser.id));
      } else if (isAgent) {
        data = data.filter(t => Number(t.to_user_id) === Number(sessionUser.id));
      } else if (isClient) {
        data = data.filter(t => Number(t.to_user_id) === Number(sessionUser.id));
      }
    } else if (tableName === 'payout_requests') {
      if (isManager) {
        const mgrAgentUsernames = new Set((readDb('agents') || []).filter(a => Number(a.manager_id) === Number(sessionUser.id) || a.manager_username === sessionUser.username).map(a => String(a.username).toLowerCase()));
        data = data.filter(p => {
          const u = String(p.username || p.user || '').toLowerCase();
          return Number(p.manager_id) === Number(sessionUser.id) || p.manager_username === sessionUser.username || mgrAgentUsernames.has(u) || u === String(sessionUser.username).toLowerCase();
        });
      } else if (isAgent) {
        const myU = String(sessionUser.username || '').toLowerCase();
        data = data.filter(p => {
          const u = String(p.username || p.user || '').toLowerCase();
          return u === myU || Number(p.user_id) === Number(sessionUser.id) || Number(p.agent_id) === Number(sessionUser.id);
        });
      } else if (isClient) {
        const myU = String(sessionUser.username || '').toLowerCase();
        data = data.filter(p => {
          const u = String(p.username || p.user || '').toLowerCase();
          return u === myU || Number(p.client_id) === Number(sessionUser.id) || Number(p.user_id) === Number(sessionUser.id);
        });
      }
    } else if (tableName === 'bank_accounts') {
      if (isAgent) {
        data = data.filter(b => Number(b.agent_id) === Number(sessionUser.id));
      } else if (isManager) {
        const mgrAgents = new Set((readDb('agents') || []).filter(a => Number(a.manager_id) === Number(sessionUser.id)).map(a => Number(a.id)));
        data = data.filter(b => mgrAgents.has(Number(b.agent_id)));
      } else if (isClient) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    // Filter by query parameters if applicable
    const { role, manager_id, agent_id, search, status } = req.query;
    if (role) {
      data = data.filter(d => (d.role || '').toLowerCase() === role.toLowerCase());
    }
    if (manager_id && isOwner) {
      data = data.filter(d => String(d.manager_id) === String(manager_id));
    }
    if (agent_id && (isOwner || isManager || (isAgent && String(sessionUser.id) === String(agent_id)))) {
      data = data.filter(d => String(d.agent_id) === String(agent_id));
    }
    if (status) {
      data = data.filter(d => (d.status || '').toLowerCase() === status.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(d => JSON.stringify(d).toLowerCase().includes(q));
    }
    if (tableName === 'numbers') {
      if (req.query.client_id) {
        data = data.filter(d => String(d.client_id) === String(req.query.client_id));
      }
      if (req.query.range) {
        const ranges = readDb('sms_ranges') || [];
        const rId = Number(req.query.range);
        const targetRange = ranges.find(r => r.id === rId);
        if (targetRange) {
          const tCountry = (targetRange.country || '').trim().toLowerCase();
          const tProvider = (targetRange.provider || 'Manual').trim().toLowerCase();
          const tName = (targetRange.range_name || '').trim().toLowerCase();
          data = data.filter(d => {
            if (d.range_id && Number(d.range_id) === rId) return true;
            if (tName && d.range_name && d.range_name.trim().toLowerCase() === tName) return true;
            if (!d.range_id && tCountry && tProvider) {
              const c = (d.country || '').trim().toLowerCase();
              const p = (d.provider || '').trim().toLowerCase();
              return c === tCountry && p === tProvider;
            }
            return false;
          });
        } else {
          data = data.filter(d => d.range_id && Number(d.range_id) === rId);
        }
      }
    }

    const page = parseInt(req.query.page) || 1;
    const rawLimit = String(req.query.limit || '').trim().toLowerCase();
    const isAll = rawLimit === 'all' || rawLimit === '0' || rawLimit === '-1';
    const limit = isAll ? data.length : Math.max(1, Math.min(10000, parseInt(req.query.limit) || 1000));
    const start = isAll ? 0 : (page - 1) * limit;

    let slice = data.slice(start, start + limit);
    if (tableName === 'clients') {
      const allAgents = readDb('agents') || [];
      const allUsers = readDb('users') || [];
      const agMap = new Map(allAgents.map(a => [Number(a.id), a.username]));
      const usrMap = new Map(allUsers.map(u => [Number(u.id), u.username]));
      slice = slice.map(item => {
        if (!item) return item;
        const copy = { ...item };
        if (!copy.agent_username && copy.agent_id) copy.agent_username = agMap.get(Number(copy.agent_id)) || `agent_${copy.agent_id}`;
        if (!copy.manager_username && copy.manager_id) copy.manager_username = usrMap.get(Number(copy.manager_id)) || `manager_${copy.manager_id}`;
        return safeUser(copy);
      });
    } else if (tableName === 'agents') {
      const allUsers = readDb('users') || [];
      const usrMap = new Map(allUsers.map(u => [Number(u.id), u.username]));
      slice = slice.map(item => {
        if (!item) return item;
        const copy = { ...item };
        if (!copy.manager_username && copy.manager_id) copy.manager_username = usrMap.get(Number(copy.manager_id)) || `manager_${copy.manager_id}`;
        return safeUser(copy);
      });
    } else if (tableName === 'payout_requests') {
      slice = slice.map(item => {
        if (!item) return item;
        const ts = item.timestamp || item.created || item.created_at || item.date || new Date().toISOString();
        return { ...item, timestamp: ts, created: ts };
      });
    } else if (isAccountTable) {
      slice = slice.map(item => safeUser(item));
    }

    res.json({
      data: slice,
      total: data.length
    });
  });

  app.post(`/api/${routePath}`, requireAuth, (req, res) => {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';
    const isClient = sRole === 'client';

    if (tableName === 'users') {
      if (!isOwner) {
        return res.status(403).json({ error: 'Access denied. Only Owner can create users.' });
      }
      const reqRole = (req.body && req.body.role ? String(req.body.role).trim().toLowerCase() : '');
      if (reqRole !== 'manager') {
        return res.status(400).json({ error: 'Owner creates ONLY Managers in this section (Agents are created in Agents section).' });
      }
    }
    if (tableName === 'agents' && !isOwner && !isManager) {
      return res.status(403).json({ error: 'Access denied. Only Owner or Manager can create agents.' });
    }
    if (tableName === 'clients') {
      if (!isAgent) {
        return res.status(403).json({ error: 'Access denied. Clients can ONLY be created by Agents.' });
      }
    }
    if (tableName === 'bank_accounts') {
      if (isClient) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      if (!req.body || !req.body.currency || !req.body.bank_name) {
        return res.status(400).json({ error: 'Currency and bank name required' });
      }
      if (isAgent) {
        req.body.agent_id = sessionUser.id;
      }
    }

    let data = readDb(tableName);
    if (!Array.isArray(data)) data = [];

    // Numbers validation: reject with 409 if same number (digits only) exists, 400 if missing
    if (tableName === 'numbers') {
      const rawNumber = req.body ? req.body.number : undefined;
      if (rawNumber === undefined || rawNumber === null || String(rawNumber).trim() === '' || !String(rawNumber).replace(/\D/g, '')) {
        return res.status(400).json({ error: 'Number is required' });
      }
      const digits = String(rawNumber).replace(/\D/g, '');
      const existing = data.find(n => n && String(n.number || '').replace(/\D/g, '') === digits);
      if (existing) {
        const rName = existing.range_name || existing.country || `Range #${existing.range_id || ''}`;
        return res.status(409).json({
          error: 'Number already exists',
          detail: `Number already exists in system${existing.range_name ? ` (assigned to range "${existing.range_name}")` : ''}`,
          existing_range: rName
        });
      }
    }

    // Duplicate username check across all account types
    if (req.body && req.body.username) {
      if (isUsernameTaken(req.body.username, null, tableName)) {
        return res.status(400).json({ error: 'This username already exists', detail: 'This username already exists. Please choose a different username.' });
      }
    }

    // Owner protection: No new Owner can be created
    if (tableName === 'users') {
      const reqRole = (req.body && req.body.role ? String(req.body.role).trim().toLowerCase() : '');
      if (reqRole === 'owner' || reqRole === 'admin') {
        return res.status(400).json({ error: 'New Owner cannot be created. Kamran_Bhatti is the fixed Owner of the project.' });
      }
    }

    const nowIso = new Date().toISOString();
    const item = { id: nextId(data), ...req.body, created: nowIso, timestamp: nowIso, created_at: nowIso };

    // Strictly enforce role and zero initial balance on creation
    if (tableName === 'agents') {
      item.role = 'Agent';
      item.balance = 0;
      if (isManager) {
        item.manager_id = sessionUser.id;
      } else if (isOwner) {
        item.manager_id = req.body.manager_id ? Number(req.body.manager_id) : null;
      }
    } else if (tableName === 'clients') {
      item.role = 'Client';
      item.balance = 0;
      item.agent_id = sessionUser.id;
      item.manager_id = sessionUser.manager_id || null;
    } else if (tableName === 'payout_requests') {
      item.amount = Math.max(0, Number(item.amount) || 0);
      if (item.amount <= 0) {
        return res.status(400).json({ error: 'Valid payout amount is required' });
      }

      // Check minimum payout setting
      const settings = readDb('settings') || {};
      const minPayout = Number(settings.min_payout || 0);
      if (!isOwner && minPayout > 0 && item.amount < minPayout) {
        return res.status(400).json({ error: `Payment low. Minimum payout is $${minPayout.toFixed(2)}.` });
      }

      item.username = item.username || item.user || sessionUser.username;
      item.user = item.user || item.username;
      item.role = item.role || item.recipient_role || sessionUser.role;
      item.user_id = item.user_id || sessionUser.id;
      item.status = item.status || 'pending';
      item.currency = item.currency || 'USD';

      // Check available balance of the user
      let userBalance = 0;
      if (isAgent) {
        const ags = readDb('agents') || [];
        const a = ags.find(x => Number(x.id) === Number(sessionUser.id) || String(x.username).toLowerCase() === String(sessionUser.username).toLowerCase());
        userBalance = Number(a?.balance || 0);
        item.agent_id = item.agent_id || sessionUser.id;
        item.agent_username = item.agent_username || sessionUser.username;
        if (sessionUser.manager_id) item.manager_id = item.manager_id || sessionUser.manager_id;
      } else if (isManager) {
        const usrs = readDb('users') || [];
        const m = usrs.find(x => Number(x.id) === Number(sessionUser.id) || String(x.username).toLowerCase() === String(sessionUser.username).toLowerCase());
        userBalance = Number(m?.balance || 0);
        item.manager_id = item.manager_id || sessionUser.id;
        item.manager_username = item.manager_username || sessionUser.username;
      } else if (isClient) {
        const cls = readDb('clients') || [];
        const c = cls.find(x => Number(x.id) === Number(sessionUser.id) || String(x.username).toLowerCase() === String(sessionUser.username).toLowerCase());
        userBalance = Number(c?.balance || 0);
        item.client_id = item.client_id || sessionUser.id;
        item.client_username = item.client_username || sessionUser.username;
        if (c?.agent_id) item.agent_id = item.agent_id || c.agent_id;
        if (c?.manager_id) item.manager_id = item.manager_id || c.manager_id;
      }

      if (!isOwner && userBalance < item.amount) {
        return res.status(400).json({ error: `Insufficient balance. Available balance: $${userBalance.toFixed(2)}` });
      }

      item.timestamp = item.timestamp || item.created || new Date().toISOString();
    }

    // Hash password if supplied
    if (item.password) {
      item.password = hashPassword(item.password);
    }

    data.unshift(item);
    writeDb(tableName, data);
    logAudit(sessionUser.username || 'Owner', `Create ${tableName}`, `Created item #${item.id}`, tableName);

    const safeItem = isAccountTable ? safeUser(item) : { ...item };
    res.json(safeItem);
  });

  app.get(`/api/${routePath}/:id`, requireAuth, (req, res, next) => {
    const rawId = req.params.id;
    if (['sms-ranges', 'rate-card', 'blacklist', 'bulk', 'download', 'stats', 'earnings', 'adjust-balance', 'test-stats', 'allocation-policy', 'no-rate-ranges', 'allocation-history'].includes(rawId)) {
      return next();
    }
    let data = readDb(tableName);
    if (!Array.isArray(data)) return res.status(404).json({ error: 'Item not found' });
    const id = Number(rawId);
    const item = data.find(x => x.id === id || String(x.id) === String(rawId));
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';
    const isClient = sRole === 'client';

    // Verify item ownership
    if (!isOwner) {
      if (tableName === 'users') {
        const targetUserId = Number(item.id);
        const myUserId = Number(sessionUser.id);
        const myUsername = String(sessionUser.username || '').toLowerCase();
        const targetUsername = String(item.username || '').toLowerCase();
        if (targetUserId !== myUserId && targetUsername !== myUsername) {
          return res.status(403).json({ error: 'Access denied.' });
        }
      }
      if (tableName === 'bank_accounts') {
        if (isAgent && Number(item.agent_id) !== Number(sessionUser.id)) {
          return res.status(403).json({ error: 'Forbidden. You cannot view this bank account.' });
        }
        if (isManager) {
          const mgrAgents = new Set((readDb('agents') || []).filter(a => Number(a.manager_id) === Number(sessionUser.id)).map(a => Number(a.id)));
          if (!mgrAgents.has(Number(item.agent_id))) {
            return res.status(403).json({ error: 'Forbidden. You cannot view this bank account.' });
          }
        }
        if (isClient) return res.status(403).json({ error: 'Access denied.' });
      }
      if (tableName === 'agents') {
        if (isManager && Number(item.manager_id) !== Number(sessionUser.id) && String(item.manager_username || '').toLowerCase() !== String(sessionUser.username).toLowerCase()) {
          return res.status(403).json({ error: 'Forbidden. You cannot view this agent.' });
        }
        if (isAgent && Number(item.id) !== Number(sessionUser.id) && String(item.username || '').toLowerCase() !== String(sessionUser.username).toLowerCase()) {
          return res.status(403).json({ error: 'Forbidden. You can only view your own agent profile.' });
        }
        if (isClient) return res.status(403).json({ error: 'Access denied.' });
      }
      if (tableName === 'clients') {
        if (isAgent && Number(item.agent_id) !== Number(sessionUser.id) && String(item.agent_username || '').toLowerCase() !== String(sessionUser.username).toLowerCase()) {
          return res.status(403).json({ error: 'Forbidden. You cannot view this client.' });
        }
        if (isManager) {
          const mgrAgents = new Set((readDb('agents') || []).filter(a => Number(a.manager_id) === Number(sessionUser.id) || String(a.manager_username || '').toLowerCase() === String(sessionUser.username).toLowerCase()).map(a => Number(a.id)));
          if (Number(item.manager_id) !== Number(sessionUser.id) && !mgrAgents.has(Number(item.agent_id))) {
            return res.status(403).json({ error: 'Forbidden. You cannot view this client.' });
          }
        }
        if (isClient && Number(item.id) !== Number(sessionUser.id) && String(item.username || '').toLowerCase() !== String(sessionUser.username).toLowerCase()) {
          return res.status(403).json({ error: 'Forbidden. You can only view your own profile.' });
        }
      }
      if (tableName === 'numbers') {
        if (isManager && Number(item.manager_id) !== Number(sessionUser.id)) {
          return res.status(403).json({ error: 'Forbidden. You cannot access this number.' });
        }
        if (isAgent && Number(item.agent_id) !== Number(sessionUser.id)) {
          return res.status(403).json({ error: 'Forbidden. You cannot access this number.' });
        }
        if (isClient && Number(item.client_id) !== Number(sessionUser.id) && (item.user && item.user.toLowerCase() !== sessionUser.username.toLowerCase())) {
          return res.status(403).json({ error: 'Forbidden. You cannot access this number.' });
        }
      }
    }

    const safeItem = isAccountTable ? safeUser(item) : { ...item };
    res.json(safeItem);
  });

  app.patch(`/api/${routePath}/:id`, requireAuth, (req, res) => {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';

    // Strict non-Owner protection: check forbidden fields
    const FORBIDDEN_NON_OWNER_PATCH_FIELDS = [
      'payout', 'client_payout', 'agent_rate', 'client_rate', 'manager_rate',
      'company_rate', 'company_cost', 'cost', 'carrier_rate', 'buy_rate',
      'sell_rate', 'commission_rate', 'commission_percent', 'payterm',
      'client_payterm', 'balance', 'role', 'manager_id', 'agent_id',
      'client_id', 'permissions', 'is_owner'
    ];
    if (!isOwner && req.body && typeof req.body === 'object') {
      const hasForbiddenField = FORBIDDEN_NON_OWNER_PATCH_FIELDS.some(k => (k in req.body) || req.body[k] !== undefined);
      if (hasForbiddenField) {
        return res.status(403).json({ error: 'Forbidden. Non-owner cannot modify financial, rate, role, or hierarchy fields.' });
      }
      const touchesAllocPolicy = ['alloc_mode', 'alloc_daily_limit', 'alloc_total_limit'].some(k => req.body[k] !== undefined);
      if (touchesAllocPolicy) {
        const cfg = readDb('settings') || {};
        const allowMgr = cfg.allow_manager_alloc_config !== false;
        const allowAgt = cfg.allow_agent_alloc_config !== false;
        const canConfigDownline = (sRole === 'manager' && (tableName === 'agents' || tableName === 'clients') && allowMgr)
                               || (sRole === 'agent' && tableName === 'clients' && allowAgt);
        if (!canConfigDownline) {
          return res.status(403).json({ error: 'Forbidden. Your account does not have authority to change number allocation mode or limits.' });
        }
      }
    }

    if (req.body && typeof req.body === 'object' && ['users', 'agents', 'clients'].includes(tableName)) {
      if (req.body.alloc_mode !== undefined && req.body.alloc_mode !== '' && req.body.alloc_mode !== null) {
        const cleanMode = String(req.body.alloc_mode).trim().toLowerCase();
        if (cleanMode !== 'request' && cleanMode !== 'self_allocate') {
          return res.status(400).json({ error: 'alloc_mode must be either "request" or "self_allocate".' });
        }
        req.body.alloc_mode = cleanMode;
      }
      if (req.body.alloc_daily_limit !== undefined && req.body.alloc_daily_limit !== '' && req.body.alloc_daily_limit !== null) {
        const dl = Number(req.body.alloc_daily_limit);
        if (isNaN(dl) || dl < 0) return res.status(400).json({ error: 'alloc_daily_limit must be 0 or a positive integer.' });
        req.body.alloc_daily_limit = Math.floor(dl);
      }
      if (req.body.alloc_total_limit !== undefined && req.body.alloc_total_limit !== '' && req.body.alloc_total_limit !== null) {
        const tl = Number(req.body.alloc_total_limit);
        if (isNaN(tl) || tl < 0) return res.status(400).json({ error: 'alloc_total_limit must be 0 or a positive integer.' });
        req.body.alloc_total_limit = Math.floor(tl);
      }
    }

    let data = readDb(tableName);
    if (!Array.isArray(data)) return res.json({});
    const id = Number(req.params.id);
    const idx = data.findIndex(x => x.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });

    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';
    const existing = data[idx];

    // Ownership check on modification
    if (!isOwner) {
      if (tableName === 'users') {
        return res.status(403).json({ error: 'Access denied. Only Owner can modify users.' });
      }
      if (tableName === 'agents') {
        if (!isManager || Number(existing.manager_id) !== Number(sessionUser.id)) {
          return res.status(403).json({ error: 'Forbidden. You can only modify your own agents.' });
        }
      }
      if (tableName === 'clients') {
        const isClient = sRole === 'client';
        const canEdit = (isAgent && Number(existing.agent_id) === Number(sessionUser.id)) ||
                        (isManager && Number(existing.manager_id) === Number(sessionUser.id)) ||
                        (isClient && Number(existing.id) === Number(sessionUser.id));
        if (!canEdit) {
          return res.status(403).json({ error: 'Forbidden. You can only modify your own clients.' });
        }
      }
      if (tableName === 'numbers') {
        const canEdit = (isManager && Number(existing.manager_id) === Number(sessionUser.id)) ||
                        (isAgent && Number(existing.agent_id) === Number(sessionUser.id));
        if (!canEdit) {
          return res.status(403).json({ error: 'Forbidden. You cannot modify this number.' });
        }
      }
      if (tableName === 'payout_requests') {
        if (!isManager || Number(existing.manager_id) !== Number(sessionUser.id)) {
          return res.status(403).json({ error: 'Forbidden. You can only manage payout requests for your own downline.' });
        }
      }
    }

    // Duplicate username check when updating username
    if (req.body && req.body.username) {
      if (isUsernameTaken(req.body.username, id, tableName)) {
        return res.status(400).json({ error: 'This username already exists', detail: 'This username already exists. Please choose a different username.' });
      }
    }

    // Owner protection: Fixed Kamran_Bhatti, cannot promote others to Owner
    if (tableName === 'users') {
      if (existing && (existing.username === 'Kamran_Bhatti' || existing.id === 1 || existing.role === 'Owner')) {
        if (req.body.username && req.body.username !== 'Kamran_Bhatti') {
          return res.status(400).json({ error: 'Owner username is fixed (Kamran_Bhatti) and cannot be changed.' });
        }
        if (req.body.role && req.body.role !== 'Owner') {
          return res.status(400).json({ error: 'Owner role cannot be changed.' });
        }
        if (req.body.status && req.body.status !== 'active') {
          return res.status(400).json({ error: 'Owner account cannot be suspended.' });
        }
      } else {
        const reqRole = (req.body && req.body.role ? String(req.body.role).trim().toLowerCase() : '');
        if (reqRole === 'owner' || reqRole === 'admin') {
          return res.status(400).json({ error: 'Cannot promote user to Owner. Kamran_Bhatti is the fixed Owner.' });
        }
      }
    }

    // Protection: Numbers fixed for Test Panel cannot be reassigned or transferred
    if (tableName === 'numbers') {
       if (existing && (existing.fixed_for_test || existing.is_test_panel || isTestNumber(existing.number))) {
         if (req.body.client_id !== undefined || req.body.agent_id !== undefined || req.body.manager_id !== undefined || (req.body.user && req.body.user !== 'Test Panel')) {
           return res.status(400).json({ error: 'This number is fixed for Test Panel. Remove it from Test Panel first to reassign.' });
         }
       }
       // Protection: Non-owner cannot modify payout, rates, or chain on numbers
       const rateOrChainKeys = ['payout', 'client_payout', 'agent_rate', 'client_rate', 'company_rate', 'cost', 'company_cost', 'carrier_rate', 'manager_id', 'agent_id', 'client_id', 'status'];
       if (!isOwner && rateOrChainKeys.some(k => req.body[k] !== undefined)) {
         return res.status(403).json({ error: 'Forbidden. Rates and allocation chain cannot be modified via PATCH.' });
       }
     }

    // Protection: Only Owner can modify manager commission_percent
    if (tableName === 'users' && req.body.commission_percent !== undefined) {
      if (!isOwner) {
        return res.status(403).json({ error: 'Forbidden. Only Owner can modify manager commission_percent.' });
      }
      const cp = Number(req.body.commission_percent);
      if (isNaN(cp) || cp < 0 || cp > 100) {
        return res.status(400).json({ error: 'commission_percent must be a decimal between 0 and 100.' });
      }
    }

    const updates = { ...req.body };
    if (updates.password) {
      if (['users', 'agents', 'clients', 'testpanel_credentials'].includes(tableName)) {
        const cleanPass = String(updates.password).trim();
        if (cleanPass.length < 6) {
          return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }
        updates.password = hashPassword(cleanPass);
      } else {
        updates.password = hashPassword(updates.password);
      }
    }

    if (tableName === 'payout_requests' && (updates.status === 'paid' || updates.status === 'completed')) {
      const prevStatus = existing ? existing.status : null;
      if (prevStatus !== 'paid' && prevStatus !== 'completed') {
        const amt = Number(existing.amount || updates.amount || 0);
        const targetUsername = String(existing.username || existing.user || '').trim().toLowerCase();
        const targetRole = String(existing.role || existing.recipient_role || '').trim().toLowerCase();
        let targetTable = null;
        if (targetRole === 'agent') targetTable = 'agents';
        else if (targetRole === 'client') targetTable = 'clients';
        else if (targetRole === 'manager') targetTable = 'users';

        if (targetTable) {
          const records = readDb(targetTable) || [];
          const uIdx = records.findIndex(r => r && targetUsername && String(r.username).trim().toLowerCase() === targetUsername);
          if (uIdx !== -1) {
            const currentBal = Number(records[uIdx].balance || 0);
            records[uIdx].balance = Math.max(0, Math.round((currentBal - amt) * 100) / 100);
            writeDb(targetTable, records);
          } else {
            return res.status(409).json({ error: 'Target user not found for payout deduction' });
          }
        }
        updates.paid_at = new Date().toISOString();
        updates.paid_by_username = sessionUser.username;
        updates.paid_by_role = sessionUser.role;

        // Automatically record into credit_notes
        try {
          const creditNotes = readDb('credit_notes') || [];
          creditNotes.unshift({
            id: nextId(creditNotes),
            date: new Date().toISOString(),
            created: new Date().toISOString(),
            agent_id: existing.agent_id || existing.user_id || null,
            user_id: existing.user_id || null,
            username: existing.username || existing.user,
            role: existing.role || targetRole,
            payout_request_id: existing.id,
            amount: amt,
            currency: existing.currency || 'USD',
            term: existing.payterm || existing.term || 'Weekly',
            reason: `Payout #${existing.id} (${existing.method || 'Direct'})`,
            status: 'settled'
          });
          writeDb('credit_notes', creditNotes);
        } catch (cnErr) {
          console.error('Failed to log credit note:', cnErr);
        }

        // Instant notification to user
        sendInstantNotification({
          recipient_role: targetRole,
          recipient_id: existing.user_id || null,
          recipient_username: existing.username || existing.user,
          title: `Payout Paid ($${amt.toFixed(2)})`,
          message: `Your payout request #${existing.id} of $${amt.toFixed(2)} has been approved and paid.`,
          type: 'payout',
          actor_role: sessionUser.role,
          actor_name: sessionUser.username
        });
      }
    } else if (tableName === 'payout_requests' && updates.status === 'rejected') {
      const targetRole = String(existing?.role || existing?.recipient_role || '').trim().toLowerCase();
      sendInstantNotification({
        recipient_role: targetRole,
        recipient_id: existing?.user_id || null,
        recipient_username: existing?.username || existing?.user,
        title: `Payout Request #${existing?.id} Rejected`,
        message: `Your payout request #${existing?.id} for $${Number(existing?.amount || 0).toFixed(2)} was rejected.`,
        type: 'payout',
        actor_role: sessionUser.role,
        actor_name: sessionUser.username
      });
    }

    data[idx] = { ...data[idx], ...updates };
    writeDb(tableName, data);
    logAudit(sessionUser.username || 'Owner', `Update ${tableName}`, `Updated item #${id}`, tableName);

    const safeItem = isAccountTable ? safeUser(data[idx]) : { ...data[idx] };
    res.json(safeItem);
  });

  app.delete(`/api/${routePath}/:id`, requireAuth, (req, res) => {
    let data = readDb(tableName);
    if (!Array.isArray(data)) return res.json({ success: true });
    const rawId = String(req.params.id);
    const numId = Number(req.params.id);

    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';
    const isClient = sRole === 'client';

    const target = data.find(x => x.id === numId || String(x.id) === rawId);
    if (target) {
      if (tableName === 'bank_accounts') {
        if (!isOwner) {
          if (isAgent && Number(target.agent_id) !== Number(sessionUser.id)) {
            return res.status(403).json({ error: 'Forbidden. You can only delete your own bank accounts.' });
          }
          if (isManager) {
            const mgrAgents = new Set((readDb('agents') || []).filter(a => Number(a.manager_id) === Number(sessionUser.id)).map(a => Number(a.id)));
            if (!mgrAgents.has(Number(target.agent_id))) {
              return res.status(403).json({ error: 'Forbidden. You cannot delete this bank account.' });
            }
          }
          if (isClient) return res.status(403).json({ error: 'Access denied.' });
        }
      }
      if (tableName === 'agents' || tableName === 'clients') {
        if (!isOwner) {
          return res.status(403).json({ error: 'Forbidden. Agent/Manager may only deactivate or reactivate their own downline, never delete.' });
        }
      }
      if (tableName === 'users' && !isOwner) {
        return res.status(403).json({ error: 'Access denied. Only Owner can delete users.' });
      }

      // Owner protection: Cannot delete Owner
      if (tableName === 'users') {
        if (target.username === 'Kamran_Bhatti' || target.id === 1 || (target.role || '').toLowerCase() === 'owner') {
          return res.status(400).json({ error: 'Owner account is fixed and cannot be deleted.' });
        }
      }

      // Deactivation required before Owner can delete an account with history
      if (isOwner && ['users', 'agents', 'clients'].includes(tableName)) {
        if (hasAccountHistory(tableName, target.id, target.username)) {
          const isDeactivated = (target.status || '').toLowerCase() === 'inactive' || (target.status || '').toLowerCase() === 'deactivated';
          if (!isDeactivated) {
            return res.status(400).json({ error: 'Cannot delete account with existing history unless it is first deactivated (status inactive).' });
          }
        }
      }
    }

    const filtered = data.filter(x => {
      if (!isNaN(numId) && x.id === numId) return false;
      if (String(x.id) === rawId) return false;
      if (tableName === 'numbers' && String(x.number) === rawId) return false;
      return true;
    });
    writeDb(tableName, filtered);
    logAudit(sessionUser.username || 'Owner', `Delete ${tableName}`, `Deleted item #${rawId}`, tableName);
    res.json({ success: true });
  });
}

registerPaginatedCrud('numbers', 'numbers');

// Number diagnostic and verification endpoint
app.post('/api/numbers/test', (req, res) => {
  try {
    const rawNumber = String(req.body.number || '').trim();
    const testType = String(req.body.test_type || 'ping').trim().toLowerCase();

    if (!rawNumber) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    const digitsOnly = rawNumber.replace(/\D/g, '');
    if (digitsOnly.length < 6) {
      return res.status(400).json({ success: false, error: 'Invalid phone number format: too short' });
    }

    const numbers = readDb('numbers') || [];
    const ranges = readDb('sms_ranges') || [];

    const foundNum = numbers.find(n => {
      const nDigits = String(n.number || '').replace(/\D/g, '');
      return nDigits === digitsOnly || String(n.number).trim() === rawNumber;
    });

    let provider = foundNum?.provider || '';
    let country = foundNum?.country || '';

    if (!provider) {
      const matchingRange = ranges.find(r => r.prefix && digitsOnly.startsWith(String(r.prefix).replace(/\D/g, '')));
      if (matchingRange) {
        provider = matchingRange.provider || '';
        country = matchingRange.country || '';
      }
    }

    if (!provider) {
      provider = 'Direct Route (Tier 1)';
    }

    logAudit('Admin', 'Test Number', `Tested ${rawNumber} [${testType}] -> ${provider}`, 'Numbers');

    return res.json({
      success: true,
      number: rawNumber,
      test_type: testType,
      provider: provider,
      country: country || 'International',
      status: 'active',
      valid: true,
      message: `${testType.toUpperCase()} test completed successfully on ${rawNumber}`
    });
  } catch (err) {
    console.error('Number test error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk number delete & unassign endpoints
app.post('/api/numbers/bulk-delete-many', (req, res) => {
  try {
    const numberIds = req.body.number_ids || req.body.ids || [];
    if (!Array.isArray(numberIds) || !numberIds.length) {
      return res.status(400).json({ error: 'No number IDs provided' });
    }
    let numbers = readDb('numbers') || [];
    const initialCount = numbers.length;
    const idSet = new Set(numberIds.map(String));
    const toDelete = numbers.filter(n => idSet.has(String(n.id)) || idSet.has(String(n.number)));
    const toDeleteNums = new Set(toDelete.map(n => String(n.number).trim()));
    numbers = numbers.filter(n => !idSet.has(String(n.id)) && !idSet.has(String(n.number)));
    writeDb('numbers', numbers);
    const deleted = initialCount - numbers.length;

    // Also remove from test_numbers if any matching were deleted
    let testNumbers = readDb('test_numbers') || [];
    const initTestLen = testNumbers.length;
    testNumbers = testNumbers.filter(tn => !toDeleteNums.has(String(tn.number).trim()));
    if (testNumbers.length !== initTestLen) {
      writeDb('test_numbers', testNumbers);
    }

    logAudit('Admin', 'Bulk Delete Numbers', `Deleted ${deleted} numbers`, 'Numbers');
    res.json({ success: true, deleted });
  } catch (err) {
    console.error('bulk-delete-many error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/numbers/bulk-unassign-many', requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';

    if (!isOwner && !isManager && !isAgent) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const numberIds = req.body.number_ids || req.body.ids || [];
    let numbers = readDb('numbers') || [];
    const idSet = new Set(numberIds.map(String));

    // Numbers fixed for Test Panel cannot be unassigned/revoked by non-owners
    const eligibleIdSet = new Set();
    numbers.forEach(n => {
      if (idSet.has(String(n.id)) || idSet.has(String(n.number))) {
        if (isOwner || (!n.fixed_for_test && !n.is_test_panel && !isTestNumber(n.number))) {
          eligibleIdSet.add(String(n.id));
          eligibleIdSet.add(String(n.number));
        }
      }
    });

    if (!isOwner && !eligibleIdSet.size && idSet.size > 0) {
      return res.status(400).json({ error: 'Selected numbers are fixed for Test Panel and cannot be unassigned/revoked. Remove them from Test Panel first.' });
    }

    let count = 0;
    numbers = numbers.map(n => {
      if (eligibleIdSet.has(String(n.id)) || eligibleIdSet.has(String(n.number))) {
        if (isAgent) {
          if (Number(n.agent_id) !== Number(sessionUser.id)) return n;
          count++;
          // Agent unallocates from Client back into Agent pool (agent_id and manager_id remain)
          return { ...n, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned' };
        } else if (isManager) {
          if (Number(n.manager_id) !== Number(sessionUser.id)) return n;
          count++;
          // Manager recalls downward back into Manager pool
          return { ...n, agent_id: null, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned' };
        } else if (isOwner) {
          count++;
          // Owner recalls downward into Owner pool
          return { ...n, manager_id: null, agent_id: null, client_id: null, client_name: '', client_username: '', user: '', status: 'active' };
        }
      }
      return n;
    });
    writeDb('numbers', numbers);

    res.json({ success: true, revoked: count, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/numbers/revoke', requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';
    if (!isOwner && !isManager && !isAgent) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const { user_id, number, count: reqCount, reason } = req.body || {};
    let numbers = readDb('numbers') || [];
    let revokedCount = 0;
    const targetUserId = Number(user_id);

    numbers = numbers.map(n => {
      if (reqCount && revokedCount >= reqCount) return n;
      if (number && n.number !== number && !String(n.number).startsWith(number.replace('*', ''))) return n;
      
      const matchesUser = (Number(n.client_id) === targetUserId || Number(n.agent_id) === targetUserId || Number(n.manager_id) === targetUserId);
      if (!matchesUser) return n;
      if (n.fixed_for_test || n.is_test_panel || isTestNumber(n.number)) return n;

      revokedCount++;
      if (isAgent) {
        return { ...n, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned' };
      } else if (isManager) {
        return { ...n, agent_id: null, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned' };
      } else {
        return { ...n, manager_id: null, agent_id: null, client_id: null, client_name: '', client_username: '', user: '', status: 'active' };
      }
    });

    writeDb('numbers', numbers);
    res.json({ success: true, revoked: revokedCount, count: revokedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/numbers/:id/unassign', requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';

    if (!isOwner && !isManager && !isAgent) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const rawId = String(req.params.id);
    let numbers = readDb('numbers') || [];
    const idx = numbers.findIndex(n => String(n.id) === rawId || String(n.number) === rawId);
    if (idx !== -1) {
      const n = numbers[idx];
      if (!isOwner && (n.fixed_for_test || n.is_test_panel || isTestNumber(n.number))) {
        return res.status(400).json({ error: 'This number is fixed for Test Panel and cannot be unassigned. Remove it from Test Panel first.' });
      }
      if (isAgent) {
        if (Number(n.agent_id) !== Number(sessionUser.id)) {
          return res.status(403).json({ error: 'Forbidden. You can only unassign numbers from your own pool.' });
        }
        numbers[idx] = { ...n, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned' };
      } else if (isManager) {
        if (Number(n.manager_id) !== Number(sessionUser.id)) {
          return res.status(403).json({ error: 'Forbidden. You can only unassign numbers from your own chain.' });
        }
        numbers[idx] = { ...n, agent_id: null, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned' };
      } else if (isOwner) {
        numbers[idx] = { ...n, manager_id: null, agent_id: null, client_id: null, client_name: '', client_username: '', user: '', status: 'active', fixed_for_test: false, is_test_panel: false };
      }
      writeDb('numbers', numbers);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Explicit Move Number Endpoint
app.post(['/api/numbers/:id/move', '/api/numbers/move'], requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isAgent = sRole === 'agent';
    const isManager = sRole === 'manager';

    const numId = req.params.id ? String(req.params.id) : String(req.body.number_id || req.body.id || '');
    const toClientId = Number(req.body.to_client_id || req.body.target_id || req.body.client_id);
    if (!toClientId) return res.status(400).json({ error: 'Target to_client_id is required' });

    if (req.body.payterm) {
      const norm = normalizePaytermKey(req.body.payterm);
      if (!isValidPayterm(norm)) {
        return res.status(400).json({ error: `Invalid payterm "${req.body.payterm}". Must be one of: ${getMasterPayterms().join(', ')}` });
      }
      req.body.payterm = norm;
    }
    if (req.body.client_payterm) {
      const norm = normalizePaytermKey(req.body.client_payterm);
      if (!isValidPayterm(norm)) {
        return res.status(400).json({ error: `Invalid client_payterm "${req.body.client_payterm}". Must be one of: ${getMasterPayterms().join(', ')}` });
      }
      req.body.client_payterm = norm;
    }

    let numbers = readDb('numbers') || [];
    const n = numbers.find(x => String(x.id) === numId || String(x.number) === numId);
    if (!n) return res.status(404).json({ error: 'Number not found' });

    if (n.fixed_for_test || n.is_test_panel || isTestNumber(n.number)) {
      return res.status(400).json({ error: 'Test Panel numbers cannot be moved' });
    }

    const clients = readDb('clients') || [];
    const targetClient = clients.find(c => Number(c.id) === toClientId);
    if (!targetClient) return res.status(404).json({ error: 'Target client not found' });

    if (isAgent) {
      if (Number(n.agent_id) !== Number(sessionUser.id)) {
        return res.status(403).json({ error: 'Forbidden. You can only move numbers within your own pool.' });
      }
      if (Number(targetClient.agent_id) !== Number(sessionUser.id)) {
        return res.status(403).json({ error: 'Forbidden. Target client must belong to your account.' });
      }
    } else if (isManager) {
      if (Number(n.manager_id) !== Number(sessionUser.id)) {
        return res.status(403).json({ error: 'Forbidden. You can only move numbers within your own chain.' });
      }
    } else if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    const fromClientId = n.client_id;
    const fromClientName = n.client_name || n.user || '';

    const rawMoveRate = req.body.client_rate !== undefined ? req.body.client_rate : req.body.client_payout;
    if (rawMoveRate !== undefined && rawMoveRate !== null && !isNaN(Number(rawMoveRate))) {
      const cRate = Number(rawMoveRate);
      const agRate = Number(n.agent_rate || 0);
      if (agRate > 0 && cRate >= agRate) {
        return res.status(400).json({
          error: `Client rate ($${cRate}) must be strictly less than agent rate ($${agRate}) for this range.`
        });
      }
      n.client_rate = cRate;
      n.client_payout = cRate;
    }

    n.client_id = toClientId;
    n.client_name = targetClient.username;
    n.client_username = targetClient.username;
    n.user = targetClient.username;
    n.status = 'assigned';

    writeDb('numbers', numbers);

    const transfers = readDb('number_transfers') || [];
    transfers.unshift({
      id: nextId(transfers),
      from_user_id: fromClientId,
      from_username: fromClientName,
      from_role: 'Client',
      to_user_id: toClientId,
      to_username: targetClient.username,
      to_role: 'Client',
      number_ids: [n.id],
      timestamp: new Date().toISOString(),
      action: 'move',
      status: 'completed'
    });
    writeDb('number_transfers', transfers);

    res.json({ success: true, number: n });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Explicit Return Number Endpoint (Holder returns number to upstream holder)
app.post(['/api/numbers/:id/return', '/api/numbers/return', '/api/numbers/bulk-return'], requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';
    const isClient = sRole === 'client';

    const rawIds = req.params.id ? [String(req.params.id)] : (req.body.number_ids || (req.body.number_id ? [String(req.body.number_id)] : (req.body.id ? [String(req.body.id)] : []))).map(String);
    if (!rawIds.length) return res.status(400).json({ error: 'No number IDs provided' });
    const idSet = new Set(rawIds);

    let numbers = readDb('numbers') || [];
    let count = 0;

    numbers = numbers.map(n => {
      if (!idSet.has(String(n.id)) && !idSet.has(String(n.number))) return n;
      if (n.fixed_for_test || n.is_test_panel || isTestNumber(n.number)) return n;

      if (isClient) {
        if (Number(n.client_id) !== Number(sessionUser.id)) return n;
        count++;
        // Client returns to Agent pool
        return { ...n, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned' };
      } else if (isAgent) {
        if (Number(n.agent_id) !== Number(sessionUser.id)) return n;
        count++;
        // Agent returns to Manager pool if manager_id exists, otherwise Owner pool
        return { ...n, agent_id: null, client_id: null, client_name: '', client_username: '', user: '', status: n.manager_id ? 'assigned' : 'active' };
      } else if (isManager) {
        if (Number(n.manager_id) !== Number(sessionUser.id)) return n;
        count++;
        // Manager returns to Owner pool
        return { ...n, manager_id: null, agent_id: null, client_id: null, client_name: '', client_username: '', user: '', status: 'active' };
      }
      return n;
    });

    writeDb('numbers', numbers);
    res.json({ success: true, returned: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recall from Manager downward into Owner pool
app.post('/api/numbers/recall-manager', requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    if (sRole !== 'owner' && sRole !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const managerId = Number(req.body.manager_id);
    if (!managerId) return res.status(400).json({ error: 'manager_id is required' });

    let numbers = readDb('numbers') || [];
    let count = 0;
    numbers = numbers.map(n => {
      if (Number(n.manager_id) === managerId) {
        if (!n.fixed_for_test && !n.is_test_panel && !isTestNumber(n.number)) {
          count++;
          return { ...n, manager_id: null, agent_id: null, client_id: null, client_name: '', client_username: '', user: '', status: 'active' };
        }
      }
      return n;
    });
    writeDb('numbers', numbers);
    res.json({ success: true, recalled: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single number assign (Fix 3)
app.post('/api/numbers/:id/assign', requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';

    if (!isOwner && !isManager && !isAgent) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    if (req.body.payterm) {
      const norm = normalizePaytermKey(req.body.payterm);
      if (!isValidPayterm(norm)) {
        return res.status(400).json({ error: `Invalid payterm "${req.body.payterm}". Must be one of: ${getMasterPayterms().join(', ')}` });
      }
    }
    if (req.body.client_payterm) {
      const norm = normalizePaytermKey(req.body.client_payterm);
      if (!isValidPayterm(norm)) {
        return res.status(400).json({ error: `Invalid client_payterm "${req.body.client_payterm}". Must be one of: ${getMasterPayterms().join(', ')}` });
      }
    }

    const rawId = String(req.params.id);
    let numbers = readDb('numbers') || [];
    const n = numbers.find(x => String(x.id) === rawId || String(x.number) === rawId);
    if (!n) return res.status(404).json({ error: 'Number not found' });
    if (!isOwner && (n.fixed_for_test || n.is_test_panel || isTestNumber(n.number))) {
      return res.status(400).json({ error: 'This number is fixed for Test Panel and cannot be assigned. Remove it from Test Panel first.' });
    }

    const targetType = (req.body.target_type || 'client').toLowerCase();
    const targetId = Number(req.body.target_id || req.body.client_id);
    const notes = req.body.notes || '';
    if (!targetId) return res.status(400).json({ error: 'target_id is required' });

    // A holder can only give away numbers from his own pool
    if (isOwner) {
      if (Boolean(n.manager_id) || Boolean(n.agent_id) || Boolean(n.client_id)) {
        return res.status(400).json({ error: 'Number is held downline. Recall it to Owner pool first before assigning.' });
      }
      if (targetType === 'client') {
        return res.status(400).json({ error: 'Owner cannot assign directly to client. Flow is Owner -> Manager -> Agent -> Client.' });
      }
    } else if (isManager) {
      if (Number(n.manager_id) !== Number(sessionUser.id) || Boolean(n.agent_id) || Boolean(n.client_id)) {
        return res.status(403).json({ error: 'Forbidden. You can only assign unallocated numbers inside your own pool.' });
      }
      if (targetType !== 'agent') {
        return res.status(400).json({ error: 'Manager can only assign numbers to Agents in their own chain.' });
      }
    } else if (isAgent) {
      if (Number(n.agent_id) !== Number(sessionUser.id)) {
        return res.status(403).json({ error: 'Forbidden. You can only assign numbers inside your own pool.' });
      }
      if (targetType !== 'client') {
        return res.status(400).json({ error: 'Agent can only assign numbers to Clients.' });
      }
    }

    let toUsername = '';
    let toRole = '';

    if (targetType === 'manager') {
      if (!isOwner) return res.status(403).json({ error: 'Only Owner can assign numbers to Managers.' });
      const users = readDb('users') || [];
      const mgr = users.find(u => Number(u.id) === targetId && (u.role || '').toLowerCase() === 'manager');
      if (!mgr) return res.status(404).json({ error: 'Manager not found' });
      n.manager_id = targetId;
      n.agent_id = null;
      n.client_id = null;
      n.client_name = '';
      n.client_username = '';
      n.user = '';
      toUsername = mgr.username;
      toRole = 'Manager';
    } else if (targetType === 'agent') {
      if (!isOwner && !isManager) return res.status(403).json({ error: 'Only Owner or Manager can assign numbers to Agents.' });
      const agents = readDb('agents') || [];
      const ag = agents.find(a => Number(a.id) === targetId);
      if (!ag) return res.status(404).json({ error: 'Agent not found' });
      if (isManager && Number(ag.manager_id) !== Number(sessionUser.id)) {
        return res.status(403).json({ error: 'Forbidden. You can only assign to agents in your own chain.' });
      }
      if (req.body.payterm) {
        const norm = normalizePaytermKey(req.body.payterm);
        if (!isValidPayterm(norm)) {
          return res.status(400).json({ error: `Invalid payterm "${req.body.payterm}". Must be one of: ${getMasterPayterms().join(', ')}` });
        }
      }
      const payterm = normalizePaytermKey(req.body.payterm || n.payterm || 'Weekly');
      const ranges = readDb('sms_ranges') || [];
      const rng = ranges.find(r => Number(r.id) === Number(n.range_id)) || ranges.find(r => r.range_name === n.range_name);
      const fixedAgentRate = getRangeAgentRate(rng, payterm);

      n.manager_id = isManager ? Number(sessionUser.id) : (ag.manager_id != null ? Number(ag.manager_id) : null);
      n.agent_id = targetId;
      n.client_id = null;
      n.client_name = '';
      n.client_username = '';
      n.user = '';
      n.payterm = payterm;
      n.agent_rate = fixedAgentRate;
      n.payout = fixedAgentRate;
      toUsername = ag.username;
      toRole = 'Agent';
    } else {
      const clients = readDb('clients') || [];
      const cl = clients.find(c => Number(c.id) === targetId);
      if (!cl) return res.status(404).json({ error: 'Client not found' });

      // When assigning to a Client, derive manager_id from the client's agent if the client row lacks it
      let effectiveManagerId = cl.manager_id || null;
      let effectiveAgentId = cl.agent_id || null;
      const agents = readDb('agents') || [];
      if (!effectiveManagerId && effectiveAgentId) {
        const ag = agents.find(a => Number(a.id) === Number(effectiveAgentId));
        if (ag && ag.manager_id) effectiveManagerId = Number(ag.manager_id);
      }

      if (isManager && effectiveManagerId && Number(effectiveManagerId) !== Number(sessionUser.id)) {
        return res.status(403).json({ error: 'Forbidden. You can only assign to clients in your own chain.' });
      }
      if (isAgent && Number(cl.agent_id) !== Number(sessionUser.id)) {
        return res.status(403).json({ error: 'Forbidden. You can only assign to your own clients.' });
      }

      if (req.body.client_payterm) {
        const norm = normalizePaytermKey(req.body.client_payterm);
        if (!isValidPayterm(norm)) {
          return res.status(400).json({ error: `Invalid client_payterm "${req.body.client_payterm}". Must be one of: ${getMasterPayterms().join(', ')}` });
        }
      } else if (req.body.payterm) {
        const norm = normalizePaytermKey(req.body.payterm);
        if (!isValidPayterm(norm)) {
          return res.status(400).json({ error: `Invalid payterm "${req.body.payterm}". Must be one of: ${getMasterPayterms().join(', ')}` });
        }
      }
      const clientPayterm = normalizePaytermKey(req.body.client_payterm || req.body.payterm || n.client_payterm || n.payterm || 'Weekly');
      const ranges = readDb('sms_ranges') || [];
      const rng = ranges.find(r => Number(r.id) === Number(n.range_id)) || ranges.find(r => r.range_name === n.range_name);
      const agentRate = (n.agent_rate !== undefined && n.agent_rate !== null && Number(n.agent_rate) > 0)
        ? Number(n.agent_rate)
        : getRangeAgentRate(rng, n.payterm || 'Weekly');

      const rawClientRate = req.body.client_rate !== undefined ? req.body.client_rate : req.body.client_payout;
      let clientRate = 0;
      if (rawClientRate !== undefined && rawClientRate !== null && !isNaN(Number(rawClientRate))) {
        clientRate = Number(rawClientRate);
        // Hard server-side rule: client_rate must be strictly less than agent_rate
        if (agentRate > 0 && clientRate >= agentRate) {
          return res.status(400).json({
            error: `Client rate ($${clientRate}) must be strictly less than agent rate ($${agentRate}) for this range.`
          });
        }
      } else {
        if (cl.client_rate !== undefined && cl.client_rate !== null && Number(cl.client_rate) > 0 && Number(cl.client_rate) < agentRate) {
          clientRate = Number(cl.client_rate);
        } else if (agentRate > 0) {
          clientRate = Math.round(agentRate * 0.9 * 10000) / 10000;
        } else {
          clientRate = 0;
        }
      }

      n.manager_id = effectiveManagerId || (isManager ? Number(sessionUser.id) : n.manager_id || null);
      n.agent_id = effectiveAgentId || (isAgent ? Number(sessionUser.id) : n.agent_id || null);
      n.client_id = targetId;
      n.client_name = cl.username;
      n.client_username = cl.username;
      n.user = cl.username;
      n.client_payterm = clientPayterm;
      n.client_rate = clientRate;
      n.client_payout = clientRate;
      toUsername = cl.username;
      toRole = 'Client';
    }

    n.status = 'assigned';
    n.fixed_for_test = false;
    n.is_test_panel = false;
    n.notes = notes;
    writeDb('numbers', numbers);

    if (isOwner) {
      try {
        let testNumbers = readDb('test_numbers') || [];
        const cleanNum = String(n.number || '').trim();
        const filtered = testNumbers.filter(t => String(t.number).trim() !== cleanNum);
        if (filtered.length !== testNumbers.length) {
          writeDb('test_numbers', filtered);
        }
      } catch (e) {}
    }

    // Instant Notification
    if (targetType === 'client') {
      const rngLabel = n.range_name || n.country || 'Direct';
      sendInstantNotification({
        recipient_role: 'client',
        recipient_id: targetId,
        recipient_username: toUsername,
        title: 'Number Allocated (1)',
        message: `Your Agent has allocated number ${n.number} in range "${rngLabel}" to your panel.`,
        type: 'allocation',
        count: 1,
        range_id: n.range_id,
        range_name: rngLabel,
        actor_role: 'Agent',
        actor_name: 'Agent'
      });
    } else if (targetType === 'agent') {
      const rngLabel = n.range_name || n.country || 'Direct';
      sendInstantNotification({
        recipient_role: 'agent',
        recipient_id: targetId,
        recipient_username: toUsername,
        title: 'Number Allocated (1)',
        message: `Manager has allocated number ${n.number} in range "${rngLabel}" to your panel.`,
        type: 'allocation',
        count: 1,
        range_id: n.range_id,
        range_name: rngLabel,
        actor_role: 'Manager',
        actor_name: 'Manager'
      });
    } else if (targetType === 'manager') {
      const rngLabel = n.range_name || n.country || 'Direct';
      sendInstantNotification({
        recipient_role: 'manager',
        recipient_id: targetId,
        recipient_username: toUsername,
        title: 'Numbers Assigned by Owner (1)',
        message: `Owner Kamran_Bhatti assigned number ${n.number} in range "${rngLabel}" to your account.`,
        type: 'allocation',
        count: 1,
        range_id: n.range_id,
        range_name: rngLabel,
        actor_role: 'Owner',
        actor_name: 'Kamran_Bhatti'
      });
    }

    const transfers = readDb('number_transfers') || [];
    transfers.unshift({
      id: nextId(transfers),
      from_user_id: null,
      from_username: sessionUser.username || 'Owner',
      from_role: sessionUser.role || 'Owner',
      to_user_id: targetId,
      to_username: toUsername,
      to_role: toRole,
      count: 1,
      number_ids: [n.id],
      service: n.app || '',
      notes: notes,
      timestamp: new Date().toISOString(),
      status: 'completed'
    });
    writeDb('number_transfers', transfers);
    logAudit(sessionUser.username || 'Owner', 'Assign Number', `${n.number} -> ${toRole} '${toUsername}'`, 'Numbers');

    res.json({ success: true, ...n, data: n });
  } catch (err) {
    console.error('Assign number error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk assign selected numbers (Fix 3)
app.post('/api/numbers/bulk-assign-many', requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';

    if (!isOwner && !isManager && !isAgent) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    if (req.body.payterm) {
      const norm = normalizePaytermKey(req.body.payterm);
      if (!isValidPayterm(norm)) {
        return res.status(400).json({ error: `Invalid payterm "${req.body.payterm}". Must be one of: ${getMasterPayterms().join(', ')}` });
      }
      req.body.payterm = norm;
    }
    if (req.body.client_payterm) {
      const norm = normalizePaytermKey(req.body.client_payterm);
      if (!isValidPayterm(norm)) {
        return res.status(400).json({ error: `Invalid client_payterm "${req.body.client_payterm}". Must be one of: ${getMasterPayterms().join(', ')}` });
      }
      req.body.client_payterm = norm;
    }

    const rawNumberIds = (req.body.number_ids || []).map(Number);
    if (!rawNumberIds.length) return res.status(400).json({ error: 'No numbers selected' });

    const targetType = (req.body.target_type || 'client').toLowerCase();
    const targetId = Number(req.body.target_id || req.body.client_id);
    const notes = req.body.notes || '';
    if (!targetId) return res.status(400).json({ error: 'target_id is required' });

    let numbers = readDb('numbers') || [];
    const testIds = new Set(numbers.filter(n => n.fixed_for_test || n.is_test_panel || isTestNumber(n.number)).map(n => Number(n.id)));
    // If Owner is assigning: Owner can allocate any number in the Master Pool (and release it from Test Panel).
    // For non-owner roles (manager, agent): numbers fixed for Test Panel are never in their pool.
    const assignableIds = isOwner ? rawNumberIds : rawNumberIds.filter(id => !testIds.has(id));

    if (!isOwner && !assignableIds.length && rawNumberIds.length > 0) {
      return res.status(400).json({ error: 'Selected numbers are fixed for Test Panel and cannot be assigned. Remove them from Test Panel first.' });
    }
    if (!assignableIds.length) return res.status(400).json({ error: 'No numbers selected' });

    // Role pool constraint: A holder can only give away numbers from his own pool
    if (isOwner) {
      const outsidePool = assignableIds.some(id => {
        const num = numbers.find(n => Number(n.id) === id);
        return !num || num.manager_id !== null || num.agent_id !== null || num.client_id !== null;
      });
      if (outsidePool) {
        return res.status(400).json({ error: 'Selected numbers contain numbers held downline. Recall them first.' });
      }
      if (targetType === 'client') {
        return res.status(400).json({ error: 'Owner cannot assign directly to client. Flow is Owner -> Manager -> Agent -> Client.' });
      }
    } else if (isManager) {
      const outsidePool = assignableIds.some(id => {
        const num = numbers.find(n => Number(n.id) === id);
        return !num || Number(num.manager_id) !== Number(sessionUser.id) || num.agent_id !== null || num.client_id !== null;
      });
      if (outsidePool) {
        return res.status(403).json({ error: 'Forbidden. You can only assign unallocated numbers inside your own pool.' });
      }
      if (targetType !== 'agent') {
        return res.status(400).json({ error: 'Manager can only assign numbers to Agents in their own chain.' });
      }
    } else if (isAgent) {
      const outsidePool = assignableIds.some(id => {
        const num = numbers.find(n => Number(n.id) === id);
        return !num || Number(num.agent_id) !== Number(sessionUser.id);
      });
      if (outsidePool) {
        return res.status(403).json({ error: 'Forbidden. You can only assign numbers inside your own pool.' });
      }
      if (targetType !== 'client') {
        return res.status(400).json({ error: 'Agent can only assign numbers to Clients.' });
      }
    }

    const numberIds = new Set(assignableIds);

    let toUsername = '';
    let toRole = '';
    let parentManagerId = null;
    let parentAgentId = null;

    if (targetType === 'manager') {
      if (!isOwner) return res.status(403).json({ error: 'Only Owner can assign numbers to Managers.' });
      const users = readDb('users') || [];
      const mgr = users.find(u => Number(u.id) === targetId && (u.role || '').toLowerCase() === 'manager');
      if (!mgr) return res.status(404).json({ error: 'Manager not found' });
      toUsername = mgr.username;
      toRole = 'Manager';
    } else if (targetType === 'agent') {
      if (!isOwner && !isManager) return res.status(403).json({ error: 'Only Owner or Manager can assign numbers to Agents.' });
      const agents = readDb('agents') || [];
      const ag = agents.find(a => Number(a.id) === targetId);
      if (!ag) return res.status(404).json({ error: 'Agent not found' });
      if (isManager && Number(ag.manager_id) !== Number(sessionUser.id)) {
        return res.status(403).json({ error: 'Forbidden. You can only assign to agents in your own chain.' });
      }
      toUsername = ag.username;
      toRole = 'Agent';
      parentManagerId = isManager ? Number(sessionUser.id) : (ag.manager_id || null);
    } else {
      const clients = readDb('clients') || [];
      const cl = clients.find(c => Number(c.id) === targetId);
      if (!cl) return res.status(404).json({ error: 'Client not found' });
      toUsername = cl.username;
      toRole = 'Client';
      parentManagerId = cl.manager_id || null;
      parentAgentId = cl.agent_id || null;

      // When assigning to a Client, derive manager_id from the client's agent if client row lacks it
      if (!parentManagerId && parentAgentId) {
        const agents = readDb('agents') || [];
        const ag = agents.find(a => Number(a.id) === Number(parentAgentId));
        if (ag && ag.manager_id) parentManagerId = Number(ag.manager_id);
      }

      if (isManager && parentManagerId && Number(parentManagerId) !== Number(sessionUser.id)) {
        return res.status(403).json({ error: 'Forbidden. You can only assign to clients in your own chain.' });
      }
      if (isAgent && Number(cl.agent_id) !== Number(sessionUser.id)) {
        return res.status(403).json({ error: 'Forbidden. You can only assign to your own clients.' });
      }
    }

    let clientRateToSet = null;
    let clientPaytermToSet = normalizePaytermKey(req.body.client_payterm || req.body.payterm || 'Weekly');
    if (targetType === 'client') {
      const rawClientRate = req.body.client_rate !== undefined ? req.body.client_rate : req.body.client_payout;
      if (rawClientRate !== undefined && rawClientRate !== null && !isNaN(Number(rawClientRate))) {
        clientRateToSet = Number(rawClientRate);
        for (const numObj of numbers) {
          if (numberIds.has(Number(numObj.id))) {
            const agRate = Number(numObj.agent_rate || 0);
            if (agRate > 0 && clientRateToSet >= agRate) {
              return res.status(400).json({
                error: `Client rate ($${clientRateToSet}) must be strictly less than agent rate ($${agRate}) for number ${numObj.number || numObj.id}.`
              });
            }
          }
        }
      }
    }

    let updatedCount = 0;
    const assignedIds = [];

    numbers = numbers.map(n => {
      if (numberIds.has(Number(n.id))) {
        updatedCount++;
        assignedIds.push(n.id);
        if (targetType === 'manager') {
          return { ...n, manager_id: targetId, agent_id: null, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned', fixed_for_test: false, is_test_panel: false, notes };
        } else if (targetType === 'agent') {
          return { ...n, manager_id: parentManagerId || (isManager ? Number(sessionUser.id) : n.manager_id || null), agent_id: targetId, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned', fixed_for_test: false, is_test_panel: false, notes };
        } else {
          return {
            ...n,
            manager_id: parentManagerId || (isManager ? Number(sessionUser.id) : n.manager_id || null),
            agent_id: parentAgentId || (isAgent ? Number(sessionUser.id) : n.agent_id || null),
            client_id: targetId,
            client_name: toUsername,
            client_username: toUsername,
            user: toUsername,
            client_rate: clientRateToSet !== null ? clientRateToSet : n.client_rate,
            client_payout: clientRateToSet !== null ? clientRateToSet : (n.client_payout ?? n.client_rate),
            client_payterm: clientPaytermToSet,
            status: 'assigned',
            fixed_for_test: false,
            is_test_panel: false,
            notes
          };
        }
      }
      return n;
    });

    writeDb('numbers', numbers);

    // If Owner assigned numbers that were previously in test_numbers, remove them from test_numbers so they don't get re-synced
    if (isOwner && assignedIds.length > 0) {
      try {
        let testNumbers = readDb('test_numbers') || [];
        const assignedSet = new Set(assignedIds.map(Number));
        const assignedNumStrings = new Set(
          numbers.filter(n => assignedSet.has(Number(n.id))).map(n => String(n.number || '').trim())
        );
        const filteredTests = testNumbers.filter(t => !assignedNumStrings.has(String(t.number || '').trim()));
        if (filteredTests.length !== testNumbers.length) {
          writeDb('test_numbers', filteredTests);
        }
      } catch (e) {
        console.warn('Error syncing test_numbers on bulk assign:', e);
      }
    }

    if (updatedCount > 0) {
      const transfers = readDb('number_transfers') || [];
      transfers.unshift({
        id: nextId(transfers),
        from_user_id: null,
        from_username: 'Owner',
        from_role: 'Owner',
        to_user_id: targetId,
        to_username: toUsername,
        to_role: toRole,
        count: updatedCount,
        number_ids: assignedIds,
        notes: notes,
        timestamp: new Date().toISOString(),
        status: 'completed'
      });
      writeDb('number_transfers', transfers);
      logAudit('Owner', 'Bulk Assign Numbers', `${updatedCount} numbers -> ${toRole} '${toUsername}'`, 'Numbers');

      // Instant Notification to Client or Agent
      const affectedNums = numbers.filter(n => numberIds.has(Number(n.id)));
      const rngNames = [...new Set(affectedNums.map(n => n.range_name || n.country || 'Direct'))].filter(Boolean);
      const rngLabel = rngNames.length ? rngNames.join(', ') : 'Direct';
      if (targetType === 'client') {
        sendInstantNotification({
          recipient_role: 'client',
          recipient_id: targetId,
          recipient_username: toUsername,
          title: `Numbers Allocated (${updatedCount})`,
          message: `Your Agent has allocated ${updatedCount} number(s) in range "${rngLabel}" to your panel.`,
          type: 'allocation',
          count: updatedCount,
          range_name: rngLabel,
          actor_role: 'Agent',
          actor_name: 'Agent'
        });
      } else if (targetType === 'agent') {
        sendInstantNotification({
          recipient_role: 'agent',
          recipient_id: targetId,
          recipient_username: toUsername,
          title: `Numbers Allocated (${updatedCount})`,
          message: `Manager has allocated ${updatedCount} number(s) in range "${rngLabel}" to your panel.`,
          type: 'allocation',
          count: updatedCount,
          range_name: rngLabel,
          actor_role: 'Manager',
          actor_name: 'Manager'
        });
      } else if (targetType === 'manager') {
        sendInstantNotification({
          recipient_role: 'manager',
          recipient_id: targetId,
          recipient_username: toUsername,
          title: `Numbers Assigned by Owner (${updatedCount})`,
          message: `Owner Kamran_Bhatti assigned ${updatedCount} number(s) in range "${rngLabel}" to your account.`,
          type: 'allocation',
          count: updatedCount,
          range_name: rngLabel,
          actor_role: 'Owner',
          actor_name: 'Kamran_Bhatti'
        });
      }
    }

    res.json({ success: true, assigned: updatedCount });
  } catch (err) {
    console.error('bulk-assign-many error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Resolve effective number acquisition mode ("request" vs "self_allocate") & quota limits for any user
function resolveAllocationPolicy(sessionUser) {
  const sRole = String(sessionUser?.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const settings = readDb('settings') || {};
  const allowMgrConfig = settings.allow_manager_alloc_config !== false;
  const allowAgtConfig = settings.allow_agent_alloc_config !== false;

  if (isOwner) {
    return {
      mode: 'self_allocate',
      daily_limit: 0,
      total_limit: 0,
      used_today: 0,
      daily_remaining: null,
      total_held: 0,
      pending_requested: 0,
      total_remaining: null,
      can_configure_downline: true,
      allow_manager_alloc_config: allowMgrConfig,
      allow_agent_alloc_config: allowAgtConfig
    };
  }

  let dbTable = 'users';
  if (sRole === 'agent') dbTable = 'agents';
  else if (sRole === 'client' || sRole === 'reseller') dbTable = 'clients';

  const records = readDb(dbTable) || [];
  const acct = (Array.isArray(records) ? records.find(x => Number(x.id) === Number(sessionUser.id)) : null) || sessionUser;

  const roleKey = sRole === 'manager' ? 'manager' : (sRole === 'agent' ? 'agent' : 'client');
  const defaultMode = settings[`${roleKey}_alloc_mode`] === 'self_allocate' ? 'self_allocate' : 'request';
  const defaultDaily = Math.max(0, parseInt(settings[`${roleKey}_alloc_daily_limit`], 10) || 0);
  const defaultTotal = Math.max(0, parseInt(settings[`${roleKey}_alloc_total_limit`], 10) || 0);

  const acctMode = acct.alloc_mode === 'self_allocate' || acct.alloc_mode === 'request' ? acct.alloc_mode : null;
  const mode = acctMode || defaultMode;

  const daily_limit = (acct.alloc_daily_limit !== undefined && acct.alloc_daily_limit !== null && acct.alloc_daily_limit !== '')
    ? Math.max(0, parseInt(acct.alloc_daily_limit, 10) || 0)
    : defaultDaily;
  const total_limit = (acct.alloc_total_limit !== undefined && acct.alloc_total_limit !== null && acct.alloc_total_limit !== '')
    ? Math.max(0, parseInt(acct.alloc_total_limit, 10) || 0)
    : defaultTotal;

  const todayIso = new Date().toISOString().slice(0, 10);
  const numbers = readDb('numbers') || [];
  const total_held = Array.isArray(numbers) ? numbers.filter(n => {
    if (!n) return false;
    if (sRole === 'manager') return Number(n.manager_id) === Number(sessionUser.id);
    if (sRole === 'agent') return Number(n.agent_id) === Number(sessionUser.id);
    return Number(n.client_id) === Number(sessionUser.id);
  }).length : 0;

  const requests = readDb('number_requests') || [];
  const myRequests = Array.isArray(requests) ? requests.filter(r => {
    if (!r) return false;
    if (r.requester_role) {
      return String(r.requester_role).toLowerCase() === roleKey && Number(r.requester_id) === Number(sessionUser.id);
    }
    if (sRole === 'client') return Number(r.client_id) === Number(sessionUser.id);
    if (sRole === 'agent') return Number(r.agent_id) === Number(sessionUser.id) && !r.client_id;
    return Number(r.manager_id) === Number(sessionUser.id) && !r.agent_id && !r.client_id;
  }) : [];

  const pending_requested = myRequests
    .filter(r => String(r.status || '').toLowerCase() === 'pending')
    .reduce((sum, r) => sum + (parseInt(r.quantity, 10) || 0), 0);

  let used_today = 0;
  if (mode === 'request') {
    used_today = myRequests
      .filter(r => String(r.status || '').toLowerCase() !== 'rejected' && String(r.created || r.timestamp || '').slice(0, 10) === todayIso)
      .reduce((sum, r) => sum + (parseInt(r.quantity, 10) || 0), 0);
  } else {
    const history = readDb('allocation_history') || [];
    used_today = Array.isArray(history) ? history.filter(h => {
      if (!h) return false;
      const d = String(h.timestamp || h.created || '').slice(0, 10);
      if (d !== todayIso) return false;
      if (h.to_user_id != null && Number(h.to_user_id) === Number(sessionUser.id) && String(h.to_role || '').toLowerCase() === sRole) return true;
      return String(h.to_user || '').toLowerCase() === String(sessionUser.username || '').toLowerCase()
          && String(h.to_role || '').toLowerCase() === sRole;
    }).reduce((sum, h) => sum + (parseInt(h.count, 10) || 0), 0) : 0;
  }

  const daily_remaining = daily_limit > 0 ? Math.max(0, daily_limit - used_today) : null;
  const total_remaining = total_limit > 0 ? Math.max(0, total_limit - total_held - (mode === 'request' ? pending_requested : 0)) : null;

  return {
    mode,
    daily_limit,
    total_limit,
    used_today,
    daily_remaining,
    total_held,
    pending_requested,
    total_remaining,
    can_configure_downline: (sRole === 'manager' && allowMgrConfig) || (sRole === 'agent' && allowAgtConfig),
    allow_manager_alloc_config: allowMgrConfig,
    allow_agent_alloc_config: allowAgtConfig
  };
}

app.get('/api/numbers/allocation-policy', requireAuth, (req, res) => {
  try {
    const policy = resolveAllocationPolicy(req.sessionUser);
    res.json({ success: true, ...policy });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Self Range Allocation Endpoint (Manager / Agent / Client when mode === 'self_allocate')
app.post('/api/numbers/agent-allocate', requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser?.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';
    const isClient = sRole === 'client' || sRole === 'reseller';

    if (!isOwner && !isManager && !isAgent && !isClient) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const policy = resolveAllocationPolicy(sessionUser);
    if (!isOwner && policy.mode !== 'self_allocate') {
      return res.status(403).json({ error: 'Self-allocate is disabled for your account. Please use Number Request instead.' });
    }

    const { range_name, range_id, count, quantity, payterm } = req.body || {};
    const qty = parseInt(count ?? quantity, 10) || 1;
    if (qty <= 0) return res.status(400).json({ error: 'Quantity must be at least 1' });

    if (!isOwner && policy.daily_remaining !== null && qty > policy.daily_remaining) {
      return res.status(400).json({ error: `Daily self-allocate limit exceeded. Remaining today: ${policy.daily_remaining}` });
    }
    if (!isOwner && policy.total_remaining !== null && qty > policy.total_remaining) {
      return res.status(400).json({ error: `Overall allocation limit exceeded. Remaining allowed: ${policy.total_remaining}` });
    }

    let numbers = readDb('numbers') || [];
    const rId = range_id ? Number(range_id) : null;
    const cleanRangeName = String(range_name || '').trim().toLowerCase();

    // Find available numbers in the target range
    const available = numbers.filter(n => {
      if (!n || n.client_id) return false;
      if (n.fixed_for_test || n.is_test_panel || isTestNumber(n.number)) return false;

      const nRange = String(n.range_name || n.name || '').trim().toLowerCase();
      const nRid = n.range_id ? Number(n.range_id) : null;
      const matchesRange = (rId && nRid === rId) || (cleanRangeName && (nRange === cleanRangeName || nRange.includes(cleanRangeName)));
      if (!matchesRange) return false;

      if (isClient) {
        if (sessionUser.agent_id) {
          return Number(n.agent_id) === Number(sessionUser.agent_id) && !n.client_id;
        }
        if (sessionUser.manager_id) {
          return Number(n.manager_id) === Number(sessionUser.manager_id) && !n.agent_id && !n.client_id;
        }
        return !n.manager_id && !n.agent_id && !n.client_id;
      } else if (isAgent) {
        if (sessionUser.manager_id) {
          return (Number(n.manager_id) === Number(sessionUser.manager_id) && !n.agent_id) || (!n.manager_id && !n.agent_id);
        }
        return !n.manager_id && !n.agent_id;
      } else if (isManager) {
        return !n.manager_id && !n.agent_id;
      }
      return !n.manager_id && !n.agent_id;
    });

    if (available.length === 0) {
      return res.status(400).json({ error: 'No available numbers in this range to allocate right now.' });
    }

    const toAllocate = available.slice(0, qty);
    const now = new Date().toISOString();
    const targetPayterm = payterm || '7/1';

    toAllocate.forEach(n => {
      if (isClient) {
        n.client_id = sessionUser.id;
        n.client_username = sessionUser.username;
        n.client_name = sessionUser.full_name || sessionUser.username;
        n.user = sessionUser.username;
        n.agent_id = sessionUser.agent_id || n.agent_id || null;
        n.manager_id = sessionUser.manager_id || n.manager_id || null;
      } else if (isAgent) {
        n.agent_id = sessionUser.id;
        n.agent_username = sessionUser.username;
        n.manager_id = sessionUser.manager_id || n.manager_id || null;
      } else if (isManager) {
        n.manager_id = sessionUser.id;
        n.manager_username = sessionUser.username;
        n.agent_id = null;
      }
      n.status = 'assigned';
      n.payterm = targetPayterm;
      n.assigned_date = now;
      n.updated_at = now;
    });

    writeDb('numbers', numbers);

    // Record allocation in allocation_history
    const history = readDb('allocation_history') || [];
    const historyEntry = {
      id: nextId(history),
      from_user: isClient ? (sessionUser.agent_id ? 'Agent' : (sessionUser.manager_id ? 'Manager' : 'Owner')) : (isAgent ? (sessionUser.manager_id ? 'Manager' : 'Owner') : 'Owner'),
      to_user_id: sessionUser.id,
      to_user: sessionUser.username,
      to_role: sessionUser.role,
      range_name: range_name || toAllocate[0]?.range_name || 'General Range',
      count: toAllocate.length,
      sample_start: toAllocate[0]?.number,
      sample_end: toAllocate[toAllocate.length - 1]?.number,
      timestamp: now,
      created: now
    };
    history.unshift(historyEntry);
    writeDb('allocation_history', history);

    logAudit(sessionUser.username, 'Range Self-Allocation', `Self-allocated ${toAllocate.length} numbers from ${historyEntry.range_name}`, 'Numbers');

    res.json({ success: true, allocated: toAllocate.length, range_name: historyEntry.range_name });
  } catch (err) {
    console.error('agent-allocate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk Allocate Numbers
app.post('/api/numbers/bulk-allocate', (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    const sRole = (sessionUser?.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';

    const targetType = (req.body.target_type || 'client').toLowerCase();
    const targetId = Number(req.body.target_id || req.body.client_id);
    const count = parseInt(req.body.count) || 0;
    const rangeId = req.body.range_id ? Number(req.body.range_id) : null;
    const rangeStart = String(req.body.range_start || '').trim();
    const rangeEnd = String(req.body.range_end || '').trim();
    const notes = req.body.notes || '';

    if (!targetId) return res.status(400).json({ error: 'target_id is required' });

    if (isManager && targetType !== 'agent') {
      return res.status(403).json({ error: 'Managers can only allocate numbers to Agents.' });
    }

    const rawPayterm = String(req.body.payterm || '').trim();
    let allocPayterm = null;
    if (rawPayterm && rawPayterm !== 'From range' && rawPayterm !== 'from_range') {
      const norm = normalizePaytermKey(rawPayterm);
      if (!isValidPayterm(norm)) {
        return res.status(400).json({ error: `Invalid payterm "${rawPayterm}". Must be one of: ${getMasterPayterms().join(', ')}` });
      }
      allocPayterm = norm;
      req.body.payterm = norm;
    }
    if (req.body.client_payterm) {
      const norm = normalizePaytermKey(req.body.client_payterm);
      if (!isValidPayterm(norm)) {
        return res.status(400).json({ error: `Invalid client_payterm "${req.body.client_payterm}". Must be one of: ${getMasterPayterms().join(', ')}` });
      }
      req.body.client_payterm = norm;
    }

    let toUsername = '';
    let toRole = '';
    let parentManagerId = isManager ? Number(sessionUser.id) : null;
    let parentAgentId = null;

    if (targetType === 'manager') {
      const users = readDb('users') || [];
      const mgr = users.find(u => Number(u.id) === targetId && (u.role || '').toLowerCase() === 'manager');
      if (!mgr) return res.status(404).json({ error: 'Manager not found' });
      toUsername = mgr.username;
      toRole = 'Manager';
    } else if (targetType === 'agent') {
      const agents = readDb('agents') || [];
      const ag = agents.find(a => Number(a.id) === targetId);
      if (!ag) return res.status(404).json({ error: 'Agent not found' });
      if (isManager && Number(ag.manager_id) !== Number(sessionUser.id)) {
        return res.status(403).json({ error: 'Agent does not belong to your manager account.' });
      }
      toUsername = ag.username;
      toRole = 'Agent';
      parentManagerId = isManager ? Number(sessionUser.id) : (ag.manager_id || null);
    } else {
      const clients = readDb('clients') || [];
      const cl = clients.find(c => Number(c.id) === targetId);
      if (!cl) return res.status(404).json({ error: 'Client not found' });
      toUsername = cl.username;
      toRole = 'Client';
      parentManagerId = cl.manager_id || null;
      parentAgentId = cl.agent_id || null;
    }

    let numbers = readDb('numbers') || [];
    let pool;
    if (isManager) {
      pool = numbers.filter(n => Number(n.manager_id) === Number(sessionUser.id) && !n.agent_id && !n.client_id);
    } else {
      pool = numbers.filter(n => !n.manager_id && !n.agent_id && !n.client_id && !n.fixed_for_test && !n.is_test_panel && !isTestNumber(n.number));
    }

    // Filter by range_id if provided
    let rng = null;
    if (rangeId) {
      const ranges = readDb('sms_ranges') || [];
      rng = ranges.find(r => Number(r.id) === rangeId);
      if (rng) {
        pool = pool.filter(n => (n.range_id && Number(n.range_id) === rangeId) || (n.country === rng.country && n.provider === rng.provider));
      }
    } else if (rangeStart && rangeEnd) {
      pool = pool.filter(n => {
        const num = String(n.number || '');
        return num >= rangeStart && num <= rangeEnd;
      });
    }

    if (!pool.length) {
      return res.status(400).json({ error: 'No free numbers available for this selection' });
    }

    const allocCount = count > 0 ? Math.min(count, pool.length) : pool.length;
    const selectedNumbers = pool.slice(0, allocCount);
    const selectedIds = new Set(selectedNumbers.map(n => n.id));
    const rngLabel = rng ? (rng.range_name || rng.name || rng.country) : (rangeStart && rangeEnd ? `${rangeStart} - ${rangeEnd}` : 'Direct');

    numbers = numbers.map(n => {
      if (selectedIds.has(n.id)) {
        const paytermUpdate = allocPayterm ? { payterm: allocPayterm } : {};
        if (targetType === 'manager') {
          return { ...n, ...paytermUpdate, manager_id: targetId, agent_id: null, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned', notes };
        } else if (targetType === 'agent') {
          return { ...n, ...paytermUpdate, manager_id: parentManagerId, agent_id: targetId, client_id: null, client_name: '', client_username: '', user: '', status: 'assigned', notes };
        } else {
          return { ...n, ...paytermUpdate, manager_id: parentManagerId, agent_id: parentAgentId, client_id: targetId, client_name: toUsername, client_username: toUsername, user: toUsername, status: 'assigned', notes };
        }
      }
      return n;
    });

    writeDb('numbers', numbers);

    const history = readDb('allocation_history') || [];
    const entry = {
      id: nextId(history),
      from_user: isOwner ? 'Owner' : (sessionUser?.username || 'Manager'),
      to_user: toUsername,
      to_role: toRole,
      target_id: targetId,
      agent_id: targetType === 'agent' ? targetId : null,
      range_id: rangeId,
      range_name: rngLabel,
      payterm: allocPayterm || (rng?.payterm || 'From range'),
      range_start: rangeStart,
      range_end: rangeEnd,
      count: allocCount,
      number_ids: Array.from(selectedIds),
      timestamp: new Date().toISOString(),
      status: 'completed',
      notes: notes
    };
    history.unshift(entry);
    writeDb('allocation_history', history);

    logAudit(isOwner ? 'Owner' : (sessionUser?.username || 'Manager'), 'Bulk Allocate', `Allocated ${allocCount} numbers to ${toRole} '${toUsername}'`, 'Numbers');

    // Instant Notification
    if (targetType === 'client') {
      sendInstantNotification({
        recipient_role: 'client',
        recipient_id: targetId,
        recipient_username: toUsername,
        title: `Numbers Allocated (${allocCount})`,
        message: `Your Agent has allocated ${allocCount} number(s) in range "${rngLabel}" to your panel.`,
        type: 'allocation',
        count: allocCount,
        range_id: rangeId,
        range_name: rngLabel,
        actor_role: 'Agent',
        actor_name: 'Agent'
      });
    } else if (targetType === 'agent') {
      sendInstantNotification({
        recipient_role: 'agent',
        recipient_id: targetId,
        recipient_username: toUsername,
        title: `Numbers Allocated (${allocCount})`,
        message: `Manager has allocated ${allocCount} number(s) in range "${rngLabel}" to your panel.`,
        type: 'allocation',
        count: allocCount,
        range_id: rangeId,
        range_name: rngLabel,
        actor_role: 'Manager',
        actor_name: 'Manager'
      });
    } else if (targetType === 'manager') {
      sendInstantNotification({
        recipient_role: 'manager',
        recipient_id: targetId,
        recipient_username: toUsername,
        title: `Numbers Assigned by Owner (${allocCount})`,
        message: `Owner Kamran_Bhatti assigned ${allocCount} number(s) in range "${rngLabel}" to your account.`,
        type: 'allocation',
        count: allocCount,
        range_id: rangeId,
        range_name: rngLabel,
        actor_role: 'Owner',
        actor_name: 'Kamran_Bhatti'
      });
    }

    res.json({ success: true, allocated: allocCount, to_user: toUsername, ...entry });
  } catch (err) {
    console.error('bulk-allocate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Undo Allocation Endpoint ──────────────────────────────────────
app.post('/api/numbers/allocation-history/:id/undo', requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser?.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';
    if (!isOwner && !isManager && !isAgent) return res.status(403).json({ error: 'Access denied' });

    const id = Number(req.params.id);
    const history = readDb('allocation_history') || [];
    const entry = history.find(h => Number(h.id) === id);
    if (!entry) return res.status(404).json({ error: 'Allocation record not found' });
    if (entry.status === 'undone') return res.status(400).json({ error: 'This allocation has already been undone.' });

    // Ownership check: Non-owners can only undo allocations they initiated (or manager undoing downline)
    if (!isOwner) {
      const fromMe = String(entry.from_user || '').toLowerCase() === String(sessionUser.username || '').toLowerCase() ||
                     (entry.from_user_id && Number(entry.from_user_id) === Number(sessionUser.id));
      if (!fromMe) {
        if (isManager) {
          const agents = readDb('agents') || [];
          const myAgent = agents.find(a => Number(a.manager_id) === Number(sessionUser.id) &&
            (Number(a.id) === Number(entry.target_id) || (a.username && a.username.toLowerCase() === String(entry.to_user).toLowerCase())));
          if (!myAgent) {
            return res.status(403).json({ error: 'Permission denied: You can only undo your own or downline allocations.' });
          }
        } else {
          return res.status(403).json({ error: 'Permission denied: You can only undo allocations created by you.' });
        }
      }
    }

    let numbers = readDb('numbers') || [];
    const numIdSet = new Set((entry.number_ids || []).map(Number));
    if (numIdSet.size === 0) {
      return res.status(400).json({ error: 'Cannot undo allocation: No specific number IDs recorded in this allocation entry.' });
    }

    const toRole = String(entry.to_role || '').toLowerCase();

    // Downline validation: If target was an Agent, ensure none of these numbers were passed downstream to clients!
    if (toRole === 'agent' || (!toRole && entry.agent_id)) {
      const downstreamAssigned = numbers.filter(n => numIdSet.has(Number(n.id)) && n.client_id);
      if (downstreamAssigned.length > 0) {
        return res.status(400).json({
          error: `Cannot undo: ${downstreamAssigned.length} number(s) have already been allocated to clients downstream. Revoke them from clients first.`
        });
      }
    }

    let revertedCount = 0;
    numbers = numbers.map(n => {
      if (!numIdSet.has(Number(n.id))) return n;
      revertedCount++;

      if (toRole === 'client' || n.client_id) {
        // Returned to Agent's pool (or Manager's pool if assigned directly by Manager to Client)
        const agentStillAssigned = Boolean(n.agent_id || entry.agent_id);
        const managerStillAssigned = Boolean(n.manager_id || entry.manager_id);
        return {
          ...n,
          client_id: null,
          client_name: '',
          client_username: '',
          client_rate: 0,
          user: n.agent_name || n.agent_username || n.manager_name || '',
          status: (agentStillAssigned || managerStillAssigned) ? 'assigned' : 'unassigned'
        };
      } else if (toRole === 'agent' || n.agent_id) {
        // Returned to Manager's pool (or Owner if given directly by Owner to Agent)
        const managerStillAssigned = Boolean(n.manager_id || entry.manager_id);
        return {
          ...n,
          client_id: null,
          client_name: '',
          client_username: '',
          client_rate: 0,
          agent_id: null,
          agent_name: '',
          agent_username: '',
          agent_rate: 0,
          user: n.manager_name || n.manager_username || '',
          status: managerStillAssigned ? 'assigned' : 'unassigned'
        };
      } else {
        // Returned to Owner's master pool
        return {
          ...n,
          client_id: null,
          client_name: '',
          client_username: '',
          client_rate: 0,
          agent_id: null,
          agent_name: '',
          agent_username: '',
          agent_rate: 0,
          manager_id: null,
          manager_name: '',
          manager_username: '',
          user: '',
          status: 'unassigned'
        };
      }
    });

    writeDb('numbers', numbers);
    entry.status = 'undone';
    entry.undone_at = new Date().toISOString();
    entry.undone_by = sessionUser.username;
    writeDb('allocation_history', history);

    // Notify the recipient user
    if (entry.to_user) {
      sendInstantNotification({
        recipient_role: entry.to_role ? String(entry.to_role).toLowerCase() : 'all',
        recipient_username: entry.to_user,
        title: 'Numbers Recalled',
        message: `${revertedCount} number(s) from allocation #${id} were recalled by ${sessionUser.username}.`,
        type: 'warning',
        count: revertedCount,
        actor_role: sessionUser.role,
        actor_name: sessionUser.username
      });
    }

    logAudit(sessionUser.username, 'Undo Allocation', `Undid allocation #${id} (${revertedCount} numbers recalled from ${entry.to_user})`, 'Numbers');
    res.json({ success: true, message: `Successfully recalled ${revertedCount} number(s) back to your pool.`, count: revertedCount });
  } catch (err) {
    console.error('undo allocation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Export Allocation Numbers (TXT / CSV AstraSMS standard) ─────────
app.get('/api/numbers/allocation-history/:id/export', requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const format = String(req.query.format || 'txt').toLowerCase();
    const history = readDb('allocation_history') || [];
    const entry = history.find(h => Number(h.id) === id);
    if (!entry) return res.status(404).send('Not found');

    const numbers = readDb('numbers') || [];
    const numIdSet = new Set((entry.number_ids || []).map(Number));
    let matched = numbers.filter(n => numIdSet.has(Number(n.id)));
    if (!matched.length && entry.range_id) {
      matched = numbers.filter(n => Number(n.range_id) === Number(entry.range_id)).slice(0, entry.count || 25);
    }

    if (format === 'csv') {
      const header = 'Number,Range,Status,AssignedTo\n';
      const rows = matched.map(n => `"${n.number}","${n.range_name || ''}","${n.status || ''}","${entry.to_user || ''}"`).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="allocation_${id}.csv"`);
      return res.send(header + rows);
    } else {
      const lines = matched.map(n => n.number).join('\n');
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="allocation_${id}.txt"`);
      return res.send(lines);
    }
  } catch (err) {
    res.status(500).send('Export error: ' + err.message);
  }
});


// Dedicated Managers endpoint - Scoped & Sanitized
app.get('/api/managers', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isManager = sRole === 'manager';

  if (!isOwner && !isManager) {
    return res.status(403).json({ error: 'Forbidden. Owner or Manager permissions required.' });
  }

  const users = readDb('users') || [];
  let managers = users.filter(u => (u.role || '').toLowerCase() === 'manager');
  if (isManager) {
    managers = managers.filter(u => (u.username && String(u.username).toLowerCase() === String(sessionUser.username).toLowerCase()) || Number(u.id) === Number(sessionUser.id));
  }
  const sanitized = managers.map(safeUser);
  res.json({ data: sanitized, total: sanitized.length });
});
registerPaginatedCrud('agents', 'agents');
registerPaginatedCrud('clients', 'clients');
registerPaginatedCrud('users', 'users');

// ── Balance Adjustment Endpoint with RBAC ──────────────────────
app.post('/api/:table(agents|clients|users)/:id/adjust-balance', requireAuth, (req, res) => {
  const { table, id: rawId } = req.params;
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isManager = sRole === 'manager';
  const isAgent = sRole === 'agent';

  const rows = readDb(table) || [];
  const targetId = Number(rawId);
  const idx = rows.findIndex(r => r && (Number(r.id) === targetId || String(r.id) === String(rawId)));
  if (idx === -1) {
    return res.status(404).json({ error: `${table.slice(0, -1)} not found` });
  }

  const target = rows[idx];

  // RBAC Permission checks: Manager can adjust his agents/clients; Agent his clients; Owner all
  if (!isOwner) {
    if (table === 'users') {
      return res.status(403).json({ error: 'Forbidden. Only Owner can adjust user balances.' });
    }
    if (table === 'agents') {
      if (!isManager) {
        return res.status(403).json({ error: 'Forbidden. Only Owner or Manager can adjust agent balances.' });
      }
      if (Number(target.manager_id) !== Number(sessionUser.id) && String(target.manager_username || '').toLowerCase() !== String(sessionUser.username).toLowerCase()) {
        return res.status(403).json({ error: 'Forbidden. You can only adjust balances for your downline agents.' });
      }
    }
    if (table === 'clients') {
      if (isManager) {
        const mgrAgents = new Set((readDb('agents') || []).filter(a => Number(a.manager_id) === Number(sessionUser.id) || String(a.manager_username || '').toLowerCase() === String(sessionUser.username).toLowerCase()).map(a => Number(a.id)));
        const isMyClient = Number(target.manager_id) === Number(sessionUser.id) || (target.agent_id && mgrAgents.has(Number(target.agent_id)));
        if (!isMyClient) {
          return res.status(403).json({ error: 'Forbidden. You can only adjust balances for your downline clients.' });
        }
      } else if (isAgent) {
        if (Number(target.agent_id) !== Number(sessionUser.id) && String(target.agent_username || '').toLowerCase() !== String(sessionUser.username).toLowerCase()) {
          return res.status(403).json({ error: 'Forbidden. You can only adjust balances for your downline clients.' });
        }
      } else {
        return res.status(403).json({ error: 'Forbidden. You do not have permission to adjust balances.' });
      }
    }
  }

  const { operation = 'add', amount = 0, reason = '' } = req.body || {};
  const amt = Number(amount);
  if (isNaN(amt) || amt < 0) {
    return res.status(400).json({ error: 'Amount must be a valid non-negative number.' });
  }

  const before = Number(target.balance || 0);
  let after = before;
  const op = String(operation).toLowerCase();
  if (op === 'add') {
    after = before + amt;
  } else if (op === 'subtract') {
    after = Math.max(0, before - amt);
  } else if (op === 'set') {
    after = amt;
  } else {
    return res.status(400).json({ error: 'Invalid operation. Must be add, subtract, or set.' });
  }

  after = Math.round(after * 100) / 100;
  target.balance = after;
  rows[idx] = target;
  writeDb(table, rows);

  logAudit(sessionUser.username, `Balance Adjustment (${op})`, `${table} #${target.id} (${target.username}): ${before} -> ${after}. Reason: ${reason}`, 'Finance');

  res.json({
    success: true,
    before,
    after,
    user: safeUser(target)
  });
});

// ── Owner-only System Announcements & Global Broadcasts ─────────
app.post('/api/announcements', (req, res) => {
  try {
    let announcements = readDb('announcements');
    if (!Array.isArray(announcements)) announcements = [];

    const { title, body, type, is_popup, target_role, recipient_role, role: reqRole, sender_role } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    // Role check: Only Owner / Admin can broadcast
    const senderRoleNorm = (sender_role || '').toLowerCase();
    if (senderRoleNorm && senderRoleNorm !== 'admin' && senderRoleNorm !== 'owner') {
      return res.status(403).json({ error: 'Only the System Owner (Kamran_Bhatti) can send broadcasts and announcements.' });
    }

    const now = new Date().toISOString();
    const effectiveTarget = (target_role || recipient_role || reqRole || 'All').toLowerCase();
    const isPopup = is_popup !== false; // Default true for pop-up

    const entry = {
      id: nextId(announcements),
      title: title.trim(),
      body: body.trim(),
      type: type || 'info',
      role: effectiveTarget === 'all' ? 'All' : (effectiveTarget.charAt(0).toUpperCase() + effectiveTarget.slice(1)),
      target_role: effectiveTarget,
      is_popup: isPopup,
      is_broadcast: true,
      sender_role: 'Owner',
      sender_name: 'Kamran_Bhatti (Owner)',
      created: now,
      created_at: now
    };

    announcements.unshift(entry);
    if (announcements.length > 500) announcements.pop();
    writeDb('announcements', announcements);

    // Also trigger instant notification
    const notif = sendInstantNotification({
      recipient_role: effectiveTarget,
      title: `📢 Announcement from Owner: ${entry.title}`,
      message: entry.body,
      type: entry.type === 'warning' ? 'warning' : 'announcement',
      actor_role: 'Owner',
      actor_name: 'Kamran_Bhatti',
      metadata: {
        is_popup: isPopup,
        announcement_id: entry.id
      }
    });

    // Real-time broadcast specifically for popup modal
    broadcastWs({
      type: 'owner_broadcast',
      data: entry,
      notification: notif
    });

    logAudit('Owner', 'Broadcast Announcement', `Broadcast "${entry.title}" to ${effectiveTarget}`, 'Announcements');

    res.json(entry);
  } catch (err) {
    console.error('POST /api/announcements error:', err);
    res.status(500).json({ error: err.message });
  }
});

registerPaginatedCrud('announcements', 'announcements');
registerPaginatedCrud('audit-logs', 'audit_logs');

// Clear/Wipe Audit Logs (Owner/Admin only)
app.post(['/api/audit-logs/clear', '/api/audit-logs/wipe'], requireApiRole(['owner', 'admin']), (req, res) => {
  writeDb('audit_logs', []);
  res.json({ success: true, message: 'Audit logs cleared successfully' });
});
app.delete('/api/audit-logs', requireApiRole(['owner', 'admin']), (req, res) => {
  writeDb('audit_logs', []);
  res.json({ success: true, message: 'Audit logs cleared successfully' });
});

// Clear/Wipe Login Activity (Owner/Admin only)
app.post(['/api/login-activity/clear', '/api/login-activity/wipe'], requireApiRole(['owner', 'admin']), (req, res) => {
  writeDb('login_activity', []);
  res.json({ success: true, message: 'Login activity cleared successfully' });
});
app.delete('/api/login-activity', requireApiRole(['owner', 'admin']), (req, res) => {
  writeDb('login_activity', []);
  res.json({ success: true, message: 'Login activity cleared successfully' });
});

// Clear/Wipe Firewall Events (Owner/Admin only)
app.post(['/api/firewall/events/clear', '/api/firewall/events/wipe'], requireApiRole(['owner', 'admin']), (req, res) => {
  writeDb('firewall_events', []);
  res.json({ success: true, message: 'Firewall events cleared successfully' });
});
app.delete('/api/firewall/events', requireApiRole(['owner', 'admin']), (req, res) => {
  writeDb('firewall_events', []);
  res.json({ success: true, message: 'Firewall events cleared successfully' });
});

// Clear/Wipe Announcements (Owner/Admin only)
app.post(['/api/announcements/clear', '/api/announcements/wipe'], requireApiRole(['owner', 'admin']), (req, res) => {
  writeDb('announcements', []);
  res.json({ success: true, message: 'Announcements cleared successfully' });
});
app.delete('/api/announcements', requireApiRole(['owner', 'admin']), (req, res) => {
  writeDb('announcements', []);
  res.json({ success: true, message: 'Announcements cleared successfully' });
});

registerPaginatedCrud('firewall/events', 'firewall_events');
registerPaginatedCrud('rate-limits', 'rate_limits');
registerPaginatedCrud('payout-requests', 'payout_requests');
registerPaginatedCrud('bank-accounts', 'bank_accounts');
registerPaginatedCrud('testpanel-accounts', 'testpanel_credentials');
registerPaginatedCrud('number-transfers', 'number_transfers');
app.post('/api/number-transfers/:id/cancel', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isManager = sRole === 'manager';

  if (!isOwner && !isManager) {
    return res.status(403).json({ success: false, error: 'Only Owner and Managers can cancel number transfers.' });
  }

  const transferId = Number(req.params.id);
  const transfers = readDb('number_transfers') || [];
  const idx = transfers.findIndex(t => Number(t.id) === transferId);

  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Transfer not found.' });
  }

  const transfer = transfers[idx];
  if (isManager && Number(transfer.manager_id) !== Number(sessionUser.id) && String(transfer.manager_username || '').toLowerCase() !== String(sessionUser.username).toLowerCase()) {
    return res.status(403).json({ success: false, error: 'Access denied. You can only cancel transfers for your own account.' });
  }

  transfers[idx].status = 'cancelled';
  transfers[idx].updated_at = new Date().toISOString();
  writeDb('number_transfers', transfers);

  logAudit(sessionUser.username, 'Cancel Transfer', `Cancelled number transfer #${transferId}`, 'Transfers');
  return res.json({ success: true, message: 'Transfer cancelled successfully', transfer: transfers[idx] });
});
registerPaginatedCrud('login-activity', 'login_activity');

// ── Notifications Endpoints (Real-time Sensitive) ────────────
app.get('/api/notifications', (req, res) => {
  try {
    const notifications = readDb('notifications') || [];
    let { role, recipient_id, recipient_username, unread } = req.query;
    {
      const su = req.sessionUser; const sr = normRole(su && su.role);
      if (sr !== 'owner') { role = sr; recipient_id = su.id; recipient_username = su.username; }
    }
    let list = Array.isArray(notifications) ? [...notifications] : [];

    if (role && role !== 'all') {
      const r = String(role).trim().toLowerCase();
      list = list.filter(n => {
        const nr = (n.recipient_role || '').trim().toLowerCase();
        if (!nr || nr === 'all') return true;
        if (r === 'owner' || r === 'admin') return true;
        return nr === r;
      });
    }
    if (recipient_username) {
      const uname = String(recipient_username).trim().toLowerCase();
      list = list.filter(n => {
        if (!n.recipient_username) return true;
        return n.recipient_username.trim().toLowerCase() === uname;
      });
    }
    if (unread === 'true' || unread === '1') {
      list = list.filter(n => !n.read);
    }

    const unreadCount = list.filter(n => !n.read).length;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100;
    const start = (page - 1) * limit;

    res.json({
      data: list.slice(start, start + limit),
      unread_count: unreadCount,
      total: list.length
    });
  } catch (err) {
    console.error('GET /api/notifications error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Professional Header Notification & Live Activity Feed (Includes min 5 SMS records)
app.get('/api/notifications/header-feed', (req, res) => {
  try {
    const notifications = readDb('notifications') || [];
    let smsLog = readDb('sms_log') || [];
    const announcements = readDb('announcements') || [];
    const { role, recipient_id, recipient_username } = req.query;

    const r = (role || 'all').trim().toLowerCase();
    const uname = (recipient_username || '').trim().toLowerCase();
    const rid = recipient_id ? Number(recipient_id) : null;

    // Filter user notifications
    let filteredNotifs = Array.isArray(notifications) ? [...notifications] : [];
    if (r && r !== 'all') {
      filteredNotifs = filteredNotifs.filter(n => {
        const nr = (n.recipient_role || '').trim().toLowerCase();
        if (!nr || nr === 'all') return true;
        if (r === 'owner' || r === 'admin') return true;
        return nr === r;
      });
    }
    if (uname) {
      filteredNotifs = filteredNotifs.filter(n => {
        if (!n.recipient_username) return true;
        return n.recipient_username.trim().toLowerCase() === uname;
      });
    }
    const unreadCount = filteredNotifs.filter(n => !n.read).length;

    // Filter or get last 5-10 SMS records
    let recentSms = Array.isArray(smsLog) ? [...smsLog] : [];
    if (r === 'client' && uname) {
      const clientSms = recentSms.filter(s => (s.user || '').toLowerCase() === uname || (s.client_username || '').toLowerCase() === uname);
      if (clientSms.length > 0) recentSms = clientSms;
    } else if (r === 'agent' && rid) {
      const agentSms = recentSms.filter(s => Number(s.agent_id) === rid);
      if (agentSms.length > 0) recentSms = agentSms;
    } else if (r === 'manager' && rid) {
      const mgrSms = recentSms.filter(s => Number(s.manager_id) === rid);
      if (mgrSms.length > 0) recentSms = mgrSms;
    }

    const latestSms = recentSms.slice(0, 8);

    // Latest Owner Broadcast (for popup modal on open)
    const latestBroadcast = (Array.isArray(announcements) ? announcements : []).find(a => {
      const aRole = (a.role || a.target_role || 'All').toLowerCase();
      const isOwnerPost = a.sender_role === 'Owner' || a.sender_role === 'Admin' || a.is_broadcast;
      const targetMatches = aRole === 'all' || aRole === r || r === 'owner' || r === 'admin';
      return isOwnerPost && targetMatches && a.is_popup !== false;
    }) || null;

    res.json({
      notifications: filteredNotifs.slice(0, 10),
      unread_count: unreadCount,
      recent_sms: latestSms,
      latest_broadcast: latestBroadcast
    });
  } catch (err) {
    console.error('GET /api/notifications/header-feed error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications', (req, res) => {
  try {
    const notif = sendInstantNotification(req.body);
    res.json({ success: true, notification: notif });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/:id/read', (req, res) => {
  try {
    const notifications = readDb('notifications') || [];
    const id = Number(req.params.id);
    const notif = notifications.find(n => n.id === id);
    if (notif) {
      notif.read = true;
      writeDb('notifications', notifications);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/mark-all-read', (req, res) => {
  try {
    let notifications = readDb('notifications') || [];
    const { role, recipient_id, recipient_username } = req.body || {};
    notifications.forEach(n => {
      let match = true;
      if (role && n.recipient_role !== 'all' && n.recipient_role !== String(role).toLowerCase()) match = false;
      if (recipient_id && n.recipient_id && Number(n.recipient_id) !== Number(recipient_id)) match = false;
      if (recipient_username && n.recipient_username && n.recipient_username.toLowerCase() !== String(recipient_username).toLowerCase()) match = false;
      if (match) n.read = true;
    });
    writeDb('notifications', notifications);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Wipe & Clean Notifications endpoints (Clean & Wipe functionality)
app.all(['/api/notifications/wipe', '/api/notifications/clear'], (req, res) => {
  try {
    let notifications = readDb('notifications') || [];
    let { role, recipient_id, recipient_username, clear_all } = req.body || {};
    const su = req.sessionUser;
    const sr = normRole(su && su.role);
    if (sr !== 'owner') {
      role = sr;
      recipient_id = su ? su.id : null;
      recipient_username = su ? su.username : '';
      clear_all = false;
    } else {
      if (req.query && req.query.clear_all === 'true') clear_all = true;
      if (req.body && req.body.clear_all === true) clear_all = true;
    }
    const r = (role || '').trim().toLowerCase();
    const uname = (recipient_username || '').trim().toLowerCase();
    const rid = recipient_id ? Number(recipient_id) : null;

    const initialLen = notifications.length;
    if (clear_all && (sr === 'owner')) {
      notifications = [];
    } else {
      notifications = notifications.filter(n => {
        let match = false;
        if (r && n.recipient_role === r) match = true;
        if (rid && n.recipient_id && Number(n.recipient_id) === rid) match = true;
        if (uname && n.recipient_username && n.recipient_username.toLowerCase() === uname) match = true;
        return !match;
      });
    }

    writeDb('notifications', notifications);
    res.json({ success: true, count: initialLen - notifications.length, message: 'Notifications cleared successfully' });
  } catch (err) {
    console.error('Clear notifications error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/notifications/:id', (req, res) => {
  try {
    let notifications = readDb('notifications') || [];
    const id = Number(req.params.id);
    const initialLen = notifications.length;
    notifications = notifications.filter(n => n.id !== id);
    if (notifications.length !== initialLen) {
      writeDb('notifications', notifications);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Live Number Requests & Hierarchy Dispatch Control ─────────────
app.get('/api/agent-requests', requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';
    const isClient = sRole === 'client' || sRole === 'reseller';

    if (!isOwner && !isManager && !isAgent && !isClient) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const requests = readDb('number_requests') || [];
    let list = Array.isArray(requests) ? [...requests] : [];

    if (isClient) {
      list = list.filter(r => Number(r.client_id) === Number(sessionUser.id));
    } else if (isManager) {
      list = list.filter(r => Number(r.manager_id) === Number(sessionUser.id));
    } else if (isAgent) {
      list = list.filter(r => Number(r.agent_id) === Number(sessionUser.id));
    }

    const { status, scope } = req.query;
    if (scope === 'downline') {
      if (isManager) {
        list = list.filter(r => (r.requester_role ? String(r.requester_role).toLowerCase() !== 'manager' : !!(r.agent_id || r.client_id)));
      } else if (isAgent) {
        list = list.filter(r => String(r.requester_role || '').toLowerCase() === 'client' || !!r.client_id);
      }
    } else if (scope === 'mine') {
      if (isManager) {
        list = list.filter(r => String(r.requester_role || '').toLowerCase() === 'manager' && Number(r.requester_id || r.manager_id) === Number(sessionUser.id));
      } else if (isAgent) {
        list = list.filter(r => (!r.requester_role || String(r.requester_role).toLowerCase() === 'agent') && !r.client_id);
      }
    }

    if (status) {
      list = list.filter(r => (r.status || '').toLowerCase() === String(status).toLowerCase());
    }
    res.json(list);
  } catch (err) {
    console.error('GET /api/agent-requests error:', err);
    res.status(500).json({ error: err.message });
  }
});

function handleCreateNumberRequest(req, res) {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isAgent = sRole === 'agent';
    const isManager = sRole === 'manager';
    const isClient = sRole === 'client' || sRole === 'reseller';

    if (!isOwner && !isAgent && !isManager && !isClient) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const policy = resolveAllocationPolicy(sessionUser);
    if (!isOwner && policy.mode !== 'request') {
      return res.status(403).json({ error: 'Number Request mode is disabled for your account. Use Self-Allocate instead.' });
    }

    const { range_id, range_name, country, app_name, service_name, quantity, urgency, notes, payterm } = req.body || {};
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      return res.status(400).json({ error: 'Please enter a valid quantity of numbers' });
    }

    if (!isOwner && policy.daily_remaining !== null && qty > policy.daily_remaining) {
      return res.status(400).json({ error: `Daily request limit exceeded. Remaining today: ${policy.daily_remaining}` });
    }
    if (!isOwner && policy.total_remaining !== null && qty > policy.total_remaining) {
      return res.status(400).json({ error: `Overall number limit exceeded. Remaining allowed: ${policy.total_remaining}` });
    }

    // Derive requester identity securely from session
    const requesterRole = isClient ? 'Client' : (isAgent ? 'Agent' : (isManager ? 'Manager' : 'Owner'));
    const effectiveClientId = isClient ? sessionUser.id : null;
    const effectiveClientUsername = isClient ? sessionUser.username : '';
    const effectiveAgentId = isClient ? (sessionUser.agent_id || null) : (isAgent ? sessionUser.id : (isManager ? null : (Number(req.body.agent_id) || null)));
    const effectiveAgentUsername = isClient ? (sessionUser.agent_username || (sessionUser.agent_id ? `Agent #${sessionUser.agent_id}` : '')) : (isAgent ? sessionUser.username : (isManager ? (sessionUser.username + ' (Manager)') : (req.body.agent_username || '')));
    const effectiveManagerId = (isClient || isAgent) ? (sessionUser.manager_id || null) : (isManager ? sessionUser.id : (Number(req.body.manager_id) || null));

    const requests = readDb('number_requests') || [];
    const now = new Date().toISOString();
    const cleanApp = (app_name || service_name || 'General Application').trim();
    const cleanDisplayActor = isClient ? sessionUser.username : String(effectiveAgentUsername || sessionUser.username || 'User').trim();
    const entry = {
      id: nextId(requests),
      requester_role: requesterRole,
      requester_id: sessionUser.id,
      requester_username: sessionUser.username,
      client_id: effectiveClientId,
      client_username: effectiveClientUsername,
      agent_id: effectiveAgentId,
      agent_username: cleanDisplayActor,
      manager_id: effectiveManagerId,
      manager_username: isManager ? sessionUser.username : (sessionUser.manager_username || ''),
      range_id: range_id ? Number(range_id) : null,
      range_name: (range_name || country || 'General SMS Range').trim(),
      country: (country || '').trim(),
      app_name: cleanApp,
      payterm: payterm || '7/1',
      quantity: qty,
      urgency: urgency || 'normal',
      notes: (notes || '').trim(),
      status: 'pending',
      created: now,
      timestamp: now
    };

    requests.unshift(entry);
    writeDb('number_requests', requests);

    // Instant WebSocket broadcast for Live Requests Queue
    broadcastWs({
      type: 'agent_number_request',
      data: entry,
      message: `New Number Request: ${requesterRole} ${sessionUser.username} requested ${entry.quantity} numbers in range "${entry.range_name}"`
    });

    // Send instant notification up the chain
    if (isManager) {
      sendInstantNotification({
        recipient_role: 'owner',
        recipient_id: null,
        title: `New Manager Number Request: ${entry.quantity} Numbers (${cleanApp})`,
        message: `Manager ${sessionUser.username} has requested ${entry.quantity} number(s) in range "${entry.range_name}".`,
        type: 'request',
        count: entry.quantity,
        range_name: entry.range_name,
        actor_role: 'Manager',
        actor_name: sessionUser.username,
        metadata: { request_id: entry.id, manager_id: sessionUser.id }
      });
    } else if (isClient) {
      sendInstantNotification({
        recipient_role: effectiveAgentId ? 'agent' : (effectiveManagerId ? 'manager' : 'owner'),
        recipient_id: effectiveAgentId || effectiveManagerId || null,
        title: `New Client Number Request: ${entry.quantity} Numbers`,
        message: `Client ${sessionUser.username} requested ${entry.quantity} number(s) in range "${entry.range_name}".`,
        type: 'request',
        count: entry.quantity,
        range_name: entry.range_name,
        actor_role: 'Client',
        actor_name: sessionUser.username,
        metadata: { request_id: entry.id, client_id: sessionUser.id }
      });
    } else {
      sendInstantNotification({
        recipient_role: 'manager',
        recipient_id: effectiveManagerId || null,
        title: `New Agent Number Request: ${entry.quantity} Numbers (${cleanApp})`,
        message: `Agent ${entry.agent_username} has requested ${entry.quantity} number(s) in range "${entry.range_name}" for app "${cleanApp}".`,
        type: 'request',
        count: entry.quantity,
        range_name: entry.range_name,
        app_name: cleanApp,
        actor_role: 'Agent',
        actor_name: entry.agent_username,
        metadata: { request_id: entry.id, agent_id: entry.agent_id, app_name: cleanApp }
      });
    }

    res.json({ success: true, request: entry });
  } catch (err) {
    console.error('POST /api/numbers/request error:', err);
    res.status(500).json({ error: err.message });
  }
}

app.post('/api/agent-requests', requireAuth, (req, res) => {
  const sRole = (req.sessionUser?.role || '').toLowerCase();
  if (sRole === 'client' || sRole === 'reseller') {
    return res.status(403).json({ error: 'Access denied.' });
  }
  return handleCreateNumberRequest(req, res);
});

app.post(['/api/numbers/request', '/api/client-requests'], requireAuth, handleCreateNumberRequest);

// Fulfill / Accept Request & Dispatch Numbers downline
app.post('/api/agent-requests/:id/fulfill', requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';

    const id = Number(req.params.id);
    const requests = readDb('number_requests') || [];
    const reqItem = requests.find(r => r.id === id);
    if (!reqItem) return res.status(404).json({ error: 'Request not found' });

    const reqRoleLower = String(reqItem.requester_role || (reqItem.client_id ? 'client' : (reqItem.agent_id ? 'agent' : 'manager'))).toLowerCase();
    const canFulfill = isOwner
      || (isManager && Number(reqItem.manager_id) === Number(sessionUser.id) && reqRoleLower !== 'manager')
      || (isAgent && Number(reqItem.agent_id) === Number(sessionUser.id) && reqRoleLower === 'client');

    if (!canFulfill) {
      return res.status(403).json({ error: 'Forbidden. You can only fulfill requests submitted by your downline.' });
    }

    const payload = req.body || {};
    const allocCount = parseInt(payload.count || reqItem.quantity, 10) || reqItem.quantity;
    const rangeId = payload.range_id ? Number(payload.range_id) : reqItem.range_id;
    const ranges = readDb('sms_ranges') || [];
    const rng = ranges.find(r => Number(r.id) === Number(rangeId)) || null;
    const rangeLabel = (payload.range_name || (rng && (rng.range_name || rng.name)) || reqItem.range_name || 'Direct Range').trim();
    const prefix = (rng && rng.prefix) || '';
    const country = (rng && rng.country) || reqItem.country || 'International';
    const provider = (rng && rng.provider) || 'Manual';

    let numbers = readDb('numbers') || [];
    let allocatedNumbers = [];

    const targetManagerId = reqItem.manager_id ? Number(reqItem.manager_id) : (isManager ? Number(sessionUser.id) : null);
    const isClientReq = reqRoleLower === 'client' && !!reqItem.client_id;
    const isManagerReq = reqRoleLower === 'manager';
    const targetPayterm = reqItem.payterm || payload.payterm || '7/1';
    const targetRecipientName = isClientReq ? reqItem.client_username : (isManagerReq ? (reqItem.requester_username || reqItem.manager_username) : reqItem.agent_username);

    const applyAssignment = (n) => ({
      ...n,
      manager_id: targetManagerId !== null ? targetManagerId : (n.manager_id || null),
      agent_id: isManagerReq ? null : (reqItem.agent_id || (isAgent ? sessionUser.id : null)),
      agent_name: isManagerReq ? '' : (reqItem.agent_username || (isAgent ? sessionUser.username : '')),
      client_id: isClientReq ? reqItem.client_id : null,
      client_name: isClientReq ? (reqItem.client_username || '') : '',
      client_username: isClientReq ? (reqItem.client_username || '') : '',
      user: targetRecipientName,
      payterm: targetPayterm,
      status: 'assigned',
      allocated_at: new Date().toISOString(),
      notes: `Allocated via Request #${reqItem.id}`
    });

    if (Array.isArray(payload.selected_number_ids) && payload.selected_number_ids.length > 0) {
      const selectedIdSet = new Set(payload.selected_number_ids.map(Number));
      for (const n of numbers) {
        if (selectedIdSet.has(Number(n.id))) {
          if (n.client_id || (!isClientReq && n.agent_id) || n.fixed_for_test || n.is_test_panel || isTestNumber(n.number)) {
            return res.status(400).json({ error: `Number ${n.number} is already allocated or fixed for Test Panel.` });
          }
          if (isManager && Number(n.manager_id) !== Number(sessionUser.id)) {
            return res.status(403).json({ error: `Number ${n.number} does not belong to your manager pool.` });
          }
          if (isAgent && Number(n.agent_id) !== Number(sessionUser.id)) {
            return res.status(403).json({ error: `Number ${n.number} does not belong to your agent pool.` });
          }
        }
      }
      numbers = numbers.map(n => {
        if (selectedIdSet.has(Number(n.id))) {
          const updated = applyAssignment(n);
          allocatedNumbers.push(updated);
          return updated;
        }
        return n;
      });
    } else if (payload.numbers_text && String(payload.numbers_text).trim()) {
      const rawLines = String(payload.numbers_text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const validLines = rawLines.filter(l => !/^(number|phone|msisdn|mobile)$/i.test(l));
      const baseNumId = nextId(numbers);
      validLines.forEach((num, idx) => {
        const item = applyAssignment({
          id: baseNumId + idx,
          number: num,
          range_id: rangeId || null,
          range_name: rangeLabel,
          prefix: prefix,
          app: 'Unassigned',
          country: country,
          provider: provider,
          otp_limit: (rng && rng.otp_limit) || 0,
          last_sms: null,
          sms_count: 0
        });
        numbers.push(item);
        allocatedNumbers.push(item);
      });
    } else {
      let pool = [];
      if (isAgent) {
        pool = numbers.filter(n => Number(n.agent_id) === Number(sessionUser.id) && !n.client_id && !n.fixed_for_test && !n.is_test_panel && !isTestNumber(n.number));
      } else if (isManager) {
        pool = numbers.filter(n => Number(n.manager_id) === Number(sessionUser.id) && !n.agent_id && !n.client_id && !n.fixed_for_test && !n.is_test_panel && !isTestNumber(n.number));
      } else {
        if (targetManagerId && !isManagerReq) {
          pool = numbers.filter(n => Number(n.manager_id) === Number(targetManagerId) && !n.agent_id && !n.client_id && !n.fixed_for_test && !n.is_test_panel && !isTestNumber(n.number));
        }
        if (pool.length < allocCount) {
          pool = numbers.filter(n => !n.manager_id && !n.agent_id && !n.client_id && !n.fixed_for_test && !n.is_test_panel && !isTestNumber(n.number));
        }
      }

      if (rangeId) {
        const rangePool = pool.filter(n => (n.range_id && Number(n.range_id) === rangeId) || (n.country === country && n.provider === provider));
        if (rangePool.length >= allocCount) {
          pool = rangePool;
        }
      } else if (rangeLabel) {
        const namePool = pool.filter(n => String(n.range_name || n.name || '').trim().toLowerCase() === rangeLabel.toLowerCase());
        if (namePool.length >= allocCount) {
          pool = namePool;
        }
      }

      if (pool.length < allocCount) {
        return res.status(400).json({ error: `Not enough available numbers in pool. Only ${pool.length} available.` });
      }

      const selected = pool.slice(0, allocCount);
      const selectedIds = new Set(selected.map(n => n.id));
      numbers = numbers.map(n => {
        if (selectedIds.has(n.id)) {
          const updated = applyAssignment(n);
          allocatedNumbers.push(updated);
          return updated;
        }
        return n;
      });
    }

    writeDb('numbers', numbers);

    // Generate Stamped File
    const cleanActor = String(targetRecipientName || 'Account').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanRange = String(rangeLabel || 'Range').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Batch_${cleanActor}_${cleanRange}_${Date.now()}.txt`;
    const filePath = path.join(AGENT_FILES_DIR, filename);

    const fileContent = [
      '================================================================================',
      'HUMEX SMS GATEWAY — OFFICIAL NUMBER ALLOCATION FILE',
      '================================================================================',
      `RECIPIENT       : ${targetRecipientName} (${reqItem.requester_role || 'Agent'})`,
      `REQUEST ID      : #${reqItem.id}`,
      `RANGE NAME      : ${rangeLabel}`,
      `COUNTRY / PREFIX: ${country} (${prefix || 'Standard'})`,
      `TOTAL ALLOCATED : ${allocatedNumbers.length}`,
      `DISPATCHED DATE : ${new Date().toISOString()}`,
      `DISPATCHED BY   : ${sessionUser.username} (${sessionUser.role})`,
      '================================================================================',
      '',
      '--- NUMBERS LIST ---',
      ...allocatedNumbers.map(n => n.number),
      '',
      '================================================================================',
      'END OF BATCH ALLOCATION FILE',
      '================================================================================'
    ].join('\n');

    fs.writeFileSync(filePath, fileContent, 'utf-8');

    // Update request state
    reqItem.status = 'approved';
    reqItem.fulfilled_at = new Date().toISOString();
    reqItem.fulfilled_by = payload.fulfilled_by || sessionUser.username;
    reqItem.fulfilled_count = allocatedNumbers.length;
    reqItem.fulfilled_range = rangeLabel;
    reqItem.batch_filename = filename;
    writeDb('number_requests', requests);

    // Record in number_transfers
    const transfers = readDb('number_transfers') || [];
    transfers.unshift({
      id: nextId(transfers),
      from_user_id: sessionUser.id,
      from_username: sessionUser.username,
      from_role: sessionUser.role,
      to_user_id: isClientReq ? reqItem.client_id : (isManagerReq ? reqItem.manager_id : reqItem.agent_id),
      to_username: targetRecipientName,
      to_role: reqItem.requester_role || 'Agent',
      count: allocatedNumbers.length,
      number_ids: allocatedNumbers.map(n => n.id),
      batch_filename: filename,
      notes: `Fulfillment of Request #${reqItem.id} (${rangeLabel})`,
      timestamp: new Date().toISOString(),
      status: 'completed'
    });
    writeDb('number_transfers', transfers);

    // Record in allocation_history
    const history = readDb('allocation_history') || [];
    history.unshift({
      id: nextId(history),
      from_user: sessionUser.username,
      to_user_id: isClientReq ? reqItem.client_id : (isManagerReq ? reqItem.manager_id : reqItem.agent_id),
      to_user: targetRecipientName,
      to_role: reqItem.requester_role || 'Agent',
      range_id: rangeId,
      range_name: rangeLabel,
      count: allocatedNumbers.length,
      batch_filename: filename,
      timestamp: new Date().toISOString(),
      status: 'completed',
      notes: `Request #${reqItem.id} fulfilled`
    });
    writeDb('allocation_history', history);

    // Send instant notification to requester
    const notifyRole = isClientReq ? 'client' : (isManagerReq ? 'manager' : 'agent');
    const notifyId = isClientReq ? reqItem.client_id : (isManagerReq ? reqItem.manager_id : reqItem.agent_id);
    sendInstantNotification({
      recipient_role: notifyRole,
      recipient_id: notifyId,
      recipient_username: targetRecipientName,
      title: `Number Request Approved (${allocatedNumbers.length})`,
      message: `Your number request for range "${rangeLabel}" has been approved! ${allocatedNumbers.length} number(s) have been dispatched to your account.`,
      type: 'allocation',
      count: allocatedNumbers.length,
      range_id: rangeId,
      range_name: rangeLabel,
      actor_role: sessionUser.role,
      actor_name: sessionUser.username,
      metadata: { request_id: reqItem.id, filename: filename }
    });

    broadcastWs({
      type: 'agent_request_updated',
      data: reqItem,
      message: `Request #${reqItem.id} fulfilled: ${allocatedNumbers.length} numbers dispatched to ${targetRecipientName}`
    });

    res.json({
      success: true,
      request: reqItem,
      allocated: allocatedNumbers.length,
      batch_filename: filename
    });
  } catch (err) {
    console.error('fulfill agent-request error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Reject Number Request
app.post('/api/agent-requests/:id/reject', requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';

    const id = Number(req.params.id);
    const requests = readDb('number_requests') || [];
    const reqItem = requests.find(r => r.id === id);
    if (!reqItem) return res.status(404).json({ error: 'Request not found' });

    const reqRoleLower = String(reqItem.requester_role || (reqItem.client_id ? 'client' : (reqItem.agent_id ? 'agent' : 'manager'))).toLowerCase();
    const canReject = isOwner
      || (isManager && Number(reqItem.manager_id) === Number(sessionUser.id) && reqRoleLower !== 'manager')
      || (isAgent && Number(reqItem.agent_id) === Number(sessionUser.id) && reqRoleLower === 'client');

    if (!canReject) {
      return res.status(403).json({ error: 'Forbidden. You can only reject requests submitted by your downline.' });
    }

    const reason = (req.body && req.body.reason) || 'Capacity unavailable at this time';
    reqItem.status = 'rejected';
    reqItem.rejected_at = new Date().toISOString();
    reqItem.rejected_reason = reason;
    writeDb('number_requests', requests);

    const isClientReq = reqRoleLower === 'client' && !!reqItem.client_id;
    const isManagerReq = reqRoleLower === 'manager';
    const notifyRole = isClientReq ? 'client' : (isManagerReq ? 'manager' : 'agent');
    const notifyId = isClientReq ? reqItem.client_id : (isManagerReq ? reqItem.manager_id : reqItem.agent_id);
    const notifyName = isClientReq ? reqItem.client_username : (isManagerReq ? (reqItem.requester_username || reqItem.manager_username) : reqItem.agent_username);

    sendInstantNotification({
      recipient_role: notifyRole,
      recipient_id: notifyId,
      recipient_username: notifyName,
      title: 'Number Request Rejected',
      message: `Your request for ${reqItem.quantity} numbers in range "${reqItem.range_name}" was declined. Reason: ${reason}`,
      type: 'revocation',
      count: reqItem.quantity,
      range_name: reqItem.range_name,
      actor_role: sessionUser.role,
      actor_name: sessionUser.username
    });

    broadcastWs({
      type: 'agent_request_updated',
      data: reqItem
    });

    res.json({ success: true, request: reqItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download / View Allocation File
app.get('/api/agent-requests/:id/file', requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const sRole = (sessionUser.role || '').toLowerCase();
    const isOwner = sRole === 'owner' || sRole === 'admin';
    const isManager = sRole === 'manager';
    const isAgent = sRole === 'agent';

    const id = Number(req.params.id);
    const requests = readDb('number_requests') || [];
    const reqItem = requests.find(r => r.id === id);
    if (!reqItem || !reqItem.batch_filename) {
      return res.status(404).json({ error: 'File not found for this request' });
    }

    const canAccess = isOwner ||
      (isAgent && Number(reqItem.agent_id) === Number(sessionUser.id)) ||
      (isManager && Number(reqItem.manager_id) === Number(sessionUser.id));

    if (!canAccess) {
      return res.status(403).json({ error: 'Forbidden. You do not have permission to download this allocation file.' });
    }

    const filePath = path.join(AGENT_FILES_DIR, reqItem.batch_filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File does not exist on disk' });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${reqItem.batch_filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registration Requests
app.get('/api/registration-requests', (req, res) => {
  const data = readDb('registration_requests') || [];
  if (req.query.page || (req.query.limit && req.query.limit !== '10000')) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const start = (page - 1) * limit;
    return res.json({ data: data.slice(start, start + limit), total: data.length });
  }
  res.json(data);
});

app.post('/api/registration-requests', (req, res) => {
  const data = readDb('registration_requests') || [];
  if (req.body && req.body.username && isUsernameTaken(req.body.username)) {
    return res.status(400).json({ error: 'This username already exists', detail: 'This username already exists. Please choose a different username.' });
  }
  const item = { id: nextId(data), ...req.body, status: req.body.status || 'pending', timestamp: new Date().toISOString() };
  data.unshift(item);
  writeDb('registration_requests', data);
  res.json(item);
});

app.patch('/api/registration-requests/:id', (req, res) => {
  const data = readDb('registration_requests') || [];
  const id = Number(req.params.id);
  const idx = data.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Request not found' });
  data[idx] = { ...data[idx], ...req.body };
  writeDb('registration_requests', data);
  res.json(data[idx]);
});

app.delete('/api/registration-requests/:id', (req, res) => {
  const data = readDb('registration_requests') || [];
  const id = Number(req.params.id);
  writeDb('registration_requests', data.filter(x => x.id !== id));
  res.json({ success: true });
});

// CR API Connections
app.get('/api/cr-api-connections', (req, res) => {
  const data = readDb('cr_api_connections') || [];
  const mapped = data.map(c => ({
    ...c,
    token_masked: (c.token && c.token.length > 8) ? `${c.token.slice(0, 4)}…${c.token.slice(-4)}` : (c.token ? '••••••••' : '—')
  }));
  if (req.query.page) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const start = (page - 1) * limit;
    return res.json({ data: mapped.slice(start, start + limit), total: mapped.length });
  }
  res.json({ data: mapped, total: mapped.length });
});

app.post('/api/cr-api-connections', (req, res) => {
  const data = readDb('cr_api_connections') || [];
  const { panel_name, panel_url, token } = req.body || {};
  if (!panel_url || !token) {
    return res.status(400).json({ error: 'panel_url and token are required' });
  }

  const cleanUrl = String(panel_url).trim().replace(/\/+$/, '');
  const cleanToken = String(token).trim();
  const cleanName = String(panel_name || 'CR API Panel').trim();

  // Strict duplicate check: token or same panel URL + name
  const dupToken = data.find(c => String(c.token || '').trim() === cleanToken);
  if (dupToken) {
    return res.status(409).json({
      error: `Connection with this API token already exists ("${dupToken.panel_name}")`,
      detail: `This API token is already attached to connection #${dupToken.id} (${dupToken.panel_name}).`
    });
  }

  const dupUrl = data.find(c => String(c.panel_url || '').trim().replace(/\/+$/, '') === cleanUrl && String(c.panel_name || '').trim().toLowerCase() === cleanName.toLowerCase());
  if (dupUrl) {
    return res.status(409).json({
      error: `Connection with URL "${cleanUrl}" and name "${cleanName}" already exists`,
      detail: `A connection matching this panel URL and name is already registered (#${dupUrl.id}).`
    });
  }

  const item = {
    id: nextId(data),
    panel_name: cleanName,
    panel_url: cleanUrl,
    token: cleanToken,
    interval: req.body.interval ? Math.max(3, parseInt(req.body.interval)) : 5,
    active: req.body.active !== undefined ? Boolean(req.body.active) : true,
    last_pulled_at: null,
    last_status: 'Not polled yet',
    total_pulled: 0,
    created: new Date().toISOString()
  };
  data.push(item);
  writeDb('cr_api_connections', data);
  logAudit('Admin', 'Add CR API Connection', `Connected '${item.panel_name}' (Provider registered)`, 'CR API');
  pollSingleCrApiConnection(item.id, true).catch(e => console.error('CR API poll error:', e));
  res.json(item);
});

app.post('/api/cr-api-connections/:id/pull', async (req, res) => {
  const id = Number(req.params.id);
  const conns = readDb('cr_api_connections') || [];
  const conn = conns.find(c => c.id === id);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  try {
    const pulled = await pollSingleCrApiConnection(id, true);
    const updated = (readDb('cr_api_connections') || []).find(c => c.id === id);
    res.json({ success: true, pulled: pulled || 0, status: updated?.last_status || 'OK' });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.patch('/api/cr-api-connections/:id', (req, res) => {
  const data = readDb('cr_api_connections') || [];
  const id = Number(req.params.id);
  const idx = data.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Connection not found' });
  data[idx] = { ...data[idx], ...req.body };
  writeDb('cr_api_connections', data);
  res.json(data[idx]);
});

app.delete('/api/cr-api-connections/:id', (req, res) => {
  const data = readDb('cr_api_connections') || [];
  const id = Number(req.params.id);
  writeDb('cr_api_connections', data.filter(x => x.id !== id));
  logAudit('Admin', 'Delete CR API Connection', `Deleted connection #${id}`, 'CR API');
  res.json({ success: true });
});

// Login Panels (Web Scraping)
app.get('/api/login-panels', (req, res) => {
  const panels = readDb('login_panels') || [];
  const safe = panels.map(p => {
    const { password, ...rest } = p;
    return { ...rest, has_password: Boolean(password) };
  });
  if (req.query.page) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const start = (page - 1) * limit;
    return res.json({ data: safe.slice(start, start + limit), total: safe.length });
  }
  res.json({ data: safe, total: safe.length });
});

app.post('/api/login-panels', (req, res) => {
  const { name, username, password, panel_url, data_url, interval, rows, columns } = req.body || {};
  if (!username || !panel_url || !data_url || !password) {
    return res.status(400).json({ error: 'Username, password, panel_url, and data_url are required' });
  }
  const panels = readDb('login_panels') || [];
  let defaultName = name;
  if (!defaultName) {
    try { defaultName = new URL(panel_url).hostname; } catch(e) { defaultName = 'Login Panel'; }
  }
  const newPanel = {
    id: nextId(panels),
    name: defaultName,
    username: String(username).trim(),
    password: String(password),
    panel_url: String(panel_url).trim(),
    data_url: String(data_url).trim(),
    interval: Math.max(10, parseInt(interval) || 20),
    rows: parseInt(rows) || 200,
    columns: columns || null,
    status: 'stopped',
    total_sms: 0,
    last_run: null,
    last_error: '',
    created: new Date().toISOString()
  };
  panels.push(newPanel);
  writeDb('login_panels', panels);
  logAudit('Admin', 'Add Login Panel', `Added panel '${newPanel.name}'`, 'Login Panel');
  const { password: _, ...safe } = newPanel;
  res.json({ ...safe, has_password: true });
});

app.patch('/api/login-panels/:id', (req, res) => {
  const panels = readDb('login_panels') || [];
  const id = Number(req.params.id);
  const idx = panels.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Login panel not found' });
  const updates = { ...req.body };
  if (updates.interval) updates.interval = Math.max(10, parseInt(updates.interval) || 20);
  panels[idx] = { ...panels[idx], ...updates };
  writeDb('login_panels', panels);
  const { password: _, ...safe } = panels[idx];
  res.json({ ...safe, has_password: Boolean(panels[idx].password) });
});

app.delete('/api/login-panels/:id', (req, res) => {
  const panels = readDb('login_panels') || [];
  const id = Number(req.params.id);
  writeDb('login_panels', panels.filter(p => p.id !== id));
  logAudit('Admin', 'Delete Login Panel', `Deleted panel #${id}`, 'Login Panel');
  res.json({ success: true });
});

app.post('/api/login-panels/:id/start', (req, res) => {
  const panels = readDb('login_panels') || [];
  const id = Number(req.params.id);
  const panel = panels.find(p => p.id === id);
  if (!panel) return res.status(404).json({ error: 'Login panel not found' });
  panel.status = 'running';
  panel.last_error = '';
  writeDb('login_panels', panels);
  logAudit('Admin', 'Start Login Panel', `Started scraping panel '${panel.name}'`, 'Login Panel');
  pollSingleLoginPanel(panel.id).catch(e => console.error('Start poll error:', e));
  res.json({ success: true, status: 'running' });
});

app.post('/api/login-panels/:id/stop', (req, res) => {
  const panels = readDb('login_panels') || [];
  const id = Number(req.params.id);
  const panel = panels.find(p => p.id === id);
  if (!panel) return res.status(404).json({ error: 'Login panel not found' });
  panel.status = 'stopped';
  writeDb('login_panels', panels);
  logAudit('Admin', 'Stop Login Panel', `Stopped scraping panel '${panel.name}'`, 'Login Panel');
  res.json({ success: true, status: 'stopped' });
});

app.post('/api/login-panels/:id/test', async (req, res) => {
  const panels = readDb('login_panels') || [];
  const id = Number(req.params.id);
  const panel = panels.find(p => p.id === id);
  if (!panel) return res.status(404).json({ error: 'Login panel not found' });
  try {
    const scraperScript = path.join(RTX_DIR, 'panel_scraper.py');
    if (!fs.existsSync(scraperScript)) {
      return res.json({ success: false, error: 'Scraper engine not installed' });
    }
    const { stdout } = await execFileAsync('python3', [scraperScript, 'test', JSON.stringify(panel)], { timeout: 60000 });
    const result = JSON.parse(stdout || '{}');
    res.json(result);
  } catch (err) {
    const errorMsg = err.killed ? 'Connection timed out. Please try again.' : (err.message || 'Scraper failed');
    res.json({ success: false, error: errorMsg });
  }
});

app.post('/api/login-panels/:id/pull', async (req, res) => {
  const panels = readDb('login_panels') || [];
  const id = Number(req.params.id);
  const panel = panels.find(p => p.id === id);
  if (!panel) return res.status(404).json({ error: 'Login panel not found' });
  try {
    const added = await pollSingleLoginPanel(id, true);
    const updated = (readDb('login_panels') || []).find(p => p.id === id);
    res.json({
      success: !updated?.last_error,
      pulled: added || 0,
      total: updated?.total_sms || 0,
      error: updated?.last_error || ''
    });
  } catch (err) {
    const errorMsg = err.killed ? 'Connection timed out. Please try again.' : (err.message || 'Scraper pull failed');
    res.json({ success: false, error: errorMsg });
  }
});

// ── Manager Endpoints ──────────────────────────────────────────
app.get('/api/manager/:manager_id/stats', requireAuth, (req, res) => {
  const mid = String(req.params.manager_id);
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  if (!isOwner && (sRole !== 'manager' || String(sessionUser.id) !== mid)) {
    return res.status(403).json({ error: 'Forbidden. You can only access your own manager stats.' });
  }

  const agents = (readDb('agents') || []).filter(a => String(a.manager_id) === mid);
  const clients = (readDb('clients') || []).filter(c => String(c.manager_id) === mid);
  const clientUsernames = new Set(clients.filter(c => c.username).map(c => c.username.toLowerCase()));
  const numbers = (readDb('numbers') || []).filter(n => String(n.manager_id) === mid);

  const sms = readDb('sms_log') || [];
  const mySms = sms.filter(s => Number(s.manager_id) === Number(mid));

  const todayStr = new Date().toISOString().slice(0, 10);
  const smsToday = mySms.filter(s => (s.timestamp || '').slice(0, 10) === todayStr);

  const now = new Date();
  const trafficData = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600000);
    const hourKey = d.toISOString().slice(0, 13);
    trafficData.push(mySms.filter(s => (s.timestamp || '').slice(0, 13) === hourKey).length);
  }

  const topAgents = [...agents]
    .sort((a, b) => (Number(b.clients_count) || 0) - (Number(a.clients_count) || 0))
    .slice(0, 5);

  const totalCommission = Math.round(mySms.reduce((acc, s) => acc + (Number(s.manager_amount != null ? s.manager_amount : s.profit) || 0), 0) * 10000) / 10000;
  const todayCommission = Math.round(smsToday.reduce((acc, s) => acc + (Number(s.manager_amount != null ? s.manager_amount : s.profit) || 0), 0) * 10000) / 10000;

  res.json({
    total_agents: agents.length,
    active_agents: agents.filter(a => a.status === 'active').length,
    total_clients: clients.length,
    active_clients: clients.filter(c => c.status === 'active').length,
    total_balance: Math.round(clients.reduce((acc, c) => acc + (Number(c.balance) || 0), 0) * 100) / 100,
    total_sms: mySms.length,
    revenue_today: Math.round(smsToday.reduce((acc, s) => acc + (Number(s.profit) || 0), 0) * 100) / 100,
    commission_earned: totalCommission,
    today_commission: todayCommission,
    numbers_assigned: numbers.length,
    traffic_data: trafficData,
    top_agents: topAgents
  });
});

app.get('/api/manager/:manager_id/earnings', requireAuth, (req, res) => {
  const mid = String(req.params.manager_id);
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  if (!isOwner && (sRole !== 'manager' || String(sessionUser.id) !== mid)) {
    return res.status(403).json({ error: 'Forbidden. You can only access your own manager earnings.' });
  }

  const sms = readDb('sms_log') || [];
  const mySms = sms.filter(s => Number(s.manager_id) === Number(mid));

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMonthEndStr = lastMonthDate.toISOString().slice(0, 10);
  const lastMonthStartStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;

  const sumProfit = (records) => Math.round(records.reduce((acc, r) => acc + (Number(r.manager_amount != null ? r.manager_amount : r.profit) || 0), 0) * 10000) / 10000;

  const todaySms = mySms.filter(s => (s.timestamp || '').slice(0, 10) === todayStr);
  const monthSms = mySms.filter(s => (s.timestamp || '').slice(0, 10) >= monthStartStr);
  const lastMonthSms = mySms.filter(s => {
    const ts = (s.timestamp || '').slice(0, 10);
    return ts >= lastMonthStartStr && ts <= lastMonthEndStr;
  });

  const chartData = [];
  const history = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dayStr = d.toISOString().slice(0, 10);
    const daySms = mySms.filter(s => (s.timestamp || '').slice(0, 10) === dayStr);
    const dayEarn = sumProfit(daySms);
    chartData.push(dayEarn);
    if (daySms.length > 0) {
      history.push({
        date: dayStr,
        sms_count: daySms.length,
        rate: 5,
        commission: dayEarn,
        status: i > 0 ? 'paid' : 'pending'
      });
    }
  }

  res.json({
    today: sumProfit(todaySms),
    this_month: sumProfit(monthSms),
    last_month: sumProfit(lastMonthSms),
    all_time: sumProfit(mySms),
    commission_earned: sumProfit(mySms),
    chart_data: chartData,
    history: history.reverse()
  });
});

// ── Agent Endpoints ──────────────────────────────────────────
app.get('/api/agent/:agent_id/earnings', requireAuth, (req, res) => {
  const aid = String(req.params.agent_id);
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isAgentSelf = sRole === 'agent' && String(sessionUser.id) === aid;
  const isAgentManager = sRole === 'manager' && (readDb('agents') || []).some(a => String(a.id) === aid && Number(a.manager_id) === Number(sessionUser.id));

  if (!isOwner && !isAgentSelf && !isAgentManager) {
    return res.status(403).json({ error: 'Forbidden. You can only access your own agent earnings.' });
  }

  const agents = readDb('agents') || [];
  const agent = agents.find(a => String(a.id) === aid);

  const sms = readDb('sms_log') || [];
  const mySms = sms.filter(s => Number(s.agent_id) === Number(aid));

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMonthEndStr = lastMonthDate.toISOString().slice(0, 10);
  const lastMonthStartStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;

  const sumProfit = (records) => Math.round(records.reduce((acc, r) => acc + (Number(r.profit) || 0), 0) * 100) / 100;

  const todaySms = mySms.filter(s => (s.timestamp || '').slice(0, 10) === todayStr);
  const monthSms = mySms.filter(s => (s.timestamp || '').slice(0, 10) >= monthStartStr);
  const lastMonthSms = mySms.filter(s => {
    const ts = (s.timestamp || '').slice(0, 10);
    return ts >= lastMonthStartStr && ts <= lastMonthEndStr;
  });

  // UTC Mon-Sun Weekly Settlement Cycle (Sunday 23:59:59 UTC cutoff -> shifts to Main Balance)
  const diffToMonday = (now.getUTCDay() + 6) % 7;
  const currentWeekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday, 0, 0, 0, 0));
  const currentWeekEnd = new Date(currentWeekStart.getTime() + 7 * 86400000 - 1);
  const currentWeekStartIso = currentWeekStart.toISOString();
  const currentWeekEndIso = currentWeekEnd.toISOString();
  const monStr = currentWeekStartIso.slice(0, 10);
  const sunStr = currentWeekEndIso.slice(0, 10);
  const weekRangeStr = `${monStr} – ${sunStr} UTC`;

  const thisWeekSms = mySms.filter(s => {
    const ts = s.timestamp || s.created_at || s.date || '';
    return ts >= currentWeekStartIso && ts <= currentWeekEndIso;
  });
  const thisWeekEarnings = sumProfit(thisWeekSms);

  const previousSettledSms = mySms.filter(s => {
    const ts = s.timestamp || s.created_at || s.date || '';
    return ts < currentWeekStartIso;
  });
  const previousSettledEarnings = sumProfit(previousSettledSms);

  const allPayouts = readDb('payout_requests') || [];
  const agentPayouts = allPayouts.filter(p => String(p.agent_id) === aid && p.status !== 'rejected');
  const totalPayoutsDeducted = agentPayouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const agentBaseBal = Number(agent?.balance || 0);
  const mainBalance = Math.max(0, Math.round((agentBaseBal + previousSettledEarnings - totalPayoutsDeducted) * 100) / 100);

  const chartData = [];
  const history = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dayStr = d.toISOString().slice(0, 10);
    const daySms = mySms.filter(s => (s.timestamp || '').slice(0, 10) === dayStr);
    const dayEarn = sumProfit(daySms);
    chartData.push(dayEarn);
    if (daySms.length > 0) {
      history.push({
        date: dayStr,
        sms_count: daySms.length,
        rate: agent ? (agent.commission_rate || 5) : 5,
        commission: dayEarn,
        status: i > 0 ? 'paid' : 'pending'
      });
    }
  }

  res.json({
    main_balance: mainBalance,
    balance: mainBalance,
    this_week: thisWeekEarnings,
    week_range: weekRangeStr,
    week_start: monStr,
    week_end: sunStr,
    today: sumProfit(todaySms),
    this_month: sumProfit(monthSms),
    last_month: sumProfit(lastMonthSms),
    all_time: sumProfit(mySms),
    chart_data: chartData,
    history: history.reverse()
  });
});

app.get('/api/agents/:agent_id/weekly-earnings', requireAuth, (req, res) => {
  res.json({ data: [], total: 0 });
});

// ── Client Endpoints ──────────────────────────────────────────
app.get('/api/client/:client_id/stats', requireAuth, (req, res) => {
  const cid = String(req.params.client_id);
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const clients = readDb('clients') || [];
  const client = clients.find(c => String(c.id) === cid);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const isClientSelf = sRole === 'client' && String(sessionUser.id) === cid;
  const isClientAgent = sRole === 'agent' && Number(client.agent_id) === Number(sessionUser.id);
  const isClientManager = sRole === 'manager' && Number(client.manager_id) === Number(sessionUser.id);

  if (!isOwner && !isClientSelf && !isClientAgent && !isClientManager) {
    return res.status(403).json({ error: 'Forbidden. You can only access your own client data.' });
  }

  const numbers = readDb('numbers') || [];
  const numbersAssigned = numbers.filter(n => String(n.client_id) === cid).length;

  res.json({
    numbers_assigned: numbersAssigned,
    total_sms: client.total_sms || 0,
    balance: client.balance || 0,
    daily_limit: client.daily_limit || 0,
    monthly_limit: client.monthly_limit || 0,
    status: client.status || 'active'
  });
});

app.get('/api/client/:client_id/earnings', requireAuth, (req, res) => {
  const cid = String(req.params.client_id);
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const clients = readDb('clients') || [];
  const client = clients.find(c => String(c.id) === cid);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const isClientSelf = sRole === 'client' && String(sessionUser.id) === cid;
  const isClientAgent = sRole === 'agent' && Number(client.agent_id) === Number(sessionUser.id);
  const isClientManager = sRole === 'manager' && Number(client.manager_id) === Number(sessionUser.id);

  if (!isOwner && !isClientSelf && !isClientAgent && !isClientManager) {
    return res.status(403).json({ error: 'Forbidden. You can only access your own client earnings.' });
  }

  const sms = readDb('sms_log') || [];
  const clientSms = sms.filter(s => {
    return String(s.client_id) === cid || String(s.client) === cid || (client && (s.client === client.username || s.user === client.username));
  });

  const sumClientPayout = (records) => Math.round(records.reduce((acc, r) => acc + (Number(r.client_payout != null ? r.client_payout : (r.client_rate || r.payout || 0)) || 0), 0) * 100) / 100;

  const now = new Date();
  const diffToMonday = (now.getUTCDay() + 6) % 7;
  const currentWeekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday, 0, 0, 0, 0));
  const currentWeekEnd = new Date(currentWeekStart.getTime() + 7 * 86400000 - 1);
  const currentWeekStartIso = currentWeekStart.toISOString();
  const currentWeekEndIso = currentWeekEnd.toISOString();
  const monStr = currentWeekStartIso.slice(0, 10);
  const sunStr = currentWeekEndIso.slice(0, 10);
  const weekRangeStr = `${monStr} – ${sunStr} UTC`;

  const thisWeekSms = clientSms.filter(s => {
    const ts = s.timestamp || s.created_at || s.date || '';
    return ts >= currentWeekStartIso && ts <= currentWeekEndIso;
  });
  const thisWeekEarnings = sumClientPayout(thisWeekSms);

  const previousSettledSms = clientSms.filter(s => {
    const ts = s.timestamp || s.created_at || s.date || '';
    return ts < currentWeekStartIso;
  });
  const previousSettledEarnings = sumClientPayout(previousSettledSms);

  const allPayouts = readDb('payout_requests') || [];
  const clientPayouts = allPayouts.filter(p => String(p.client_id) === cid && p.status !== 'rejected');
  const totalPayoutsDeducted = clientPayouts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const clientBaseBal = Number(client?.balance || 0);
  const mainBalance = Math.max(0, Math.round((clientBaseBal + previousSettledEarnings - totalPayoutsDeducted) * 100) / 100);

  const todayStr = now.toISOString().slice(0, 10);
  const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const todaySms = clientSms.filter(s => (s.timestamp || '').slice(0, 10) === todayStr);
  const monthSms = clientSms.filter(s => (s.timestamp || '').slice(0, 10) >= monthStartStr);

  res.json({
    main_balance: mainBalance,
    balance: mainBalance,
    this_week: thisWeekEarnings,
    week_range: weekRangeStr,
    week_start: monStr,
    week_end: sunStr,
    today: sumClientPayout(todaySms),
    this_month: sumClientPayout(monthSms),
    all_time: sumClientPayout(clientSms)
  });
});

app.get('/api/client/:client_id/numbers', requireAuth, (req, res) => {
  const cid = String(req.params.client_id);
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const clients = readDb('clients') || [];
  const client = clients.find(c => String(c.id) === cid);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const isClientSelf = sRole === 'client' && String(sessionUser.id) === cid;
  const isClientAgent = sRole === 'agent' && Number(client.agent_id) === Number(sessionUser.id);
  const isClientManager = sRole === 'manager' && Number(client.manager_id) === Number(sessionUser.id);

  if (!isOwner && !isClientSelf && !isClientAgent && !isClientManager) {
    return res.status(403).json({ error: 'Forbidden. You cannot view this client numbers.' });
  }

  const numbers = (readDb('numbers') || []).filter(n => String(n.client_id) === cid);
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const start = (page - 1) * limit;
  res.json({ data: numbers.slice(start, start + limit), total: numbers.length });
});

app.get('/api/client/:client_id/transactions', requireAuth, (req, res) => {
  res.json({ data: [], total: 0 });
});

app.get('/api/sms/client-logs', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser && sessionUser.role ? String(sessionUser.role).toLowerCase() : '');
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const enrich = buildSmsEnricher();
  let data = getScopedSmsList(req).map(s => {
    const item = enrich(s);
    if (!isOwner) {
      item.cli = serverMaskCli(item.cli || item.app || item.sender);
      delete item.company_rate;
      delete item.company_cost;
      delete item.owner_amount;
      delete item.profit;
      delete item.admin_profit;
      delete item.gross_margin;
    }
    return item;
  });
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const start = (page - 1) * limit;
  res.json({ data: data.slice(start, start + limit), total: data.length });
});

// ── Token API /api/sms (Fix 6: Token-Only, Deny Missing/Invalid, Scoped by Token Owner) ──
app.get('/api/sms', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const apiKeyHeader = req.headers['x-api-key'] || '';
  let tokenStr = '';
  if (authHeader.startsWith('Bearer ')) {
    tokenStr = authHeader.slice(7).trim();
  } else if (apiKeyHeader) {
    tokenStr = String(apiKeyHeader).trim();
  } else if (req.query.token) {
    tokenStr = String(req.query.token).trim();
  }

  if (!tokenStr) {
    return res.status(401).json({ status: 'error', error: 'Authentication required. Missing API token.' });
  }

  const tokens = readDb('api_tokens') || [];
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return res.status(401).json({ status: 'error', error: 'Unauthorized. No active API tokens found.' });
  }

  const tokenRec = findTokenRecord(tokens, tokenStr);
  if (tokenRec && (tokenRec.status === 'revoked' || tokenRec.status === 'inactive')) {
    return res.status(401).json({ status: 'error', error: 'Unauthorized. Invalid API token.' });
  }
  if (!tokenRec) {
    return res.status(401).json({ status: 'error', error: 'Unauthorized. Invalid API token.' });
  }

  // Update token stats
  tokenRec.calls = (tokenRec.calls || 0) + 1;
  tokenRec.last_used = new Date().toISOString();
  writeDb('api_tokens', tokens);

  let list = readDb('sms_log') || [];

  // Scope results by token owner's role and chain
  if (tokenRec.client_id) {
    const cid = Number(tokenRec.client_id);
    list = list.filter(s => Number(s.client_id) === cid);
  } else if (tokenRec.agent_id) {
    const aid = Number(tokenRec.agent_id);
    list = list.filter(s => Number(s.agent_id) === aid);
  } else if (tokenRec.manager_id) {
    const mid = Number(tokenRec.manager_id);
    list = list.filter(s => Number(s.manager_id) === mid);
  } else if (tokenRec.role && tokenRec.role.toLowerCase() !== 'owner' && tokenRec.role.toLowerCase() !== 'admin') {
    list = [];
  }
  // Owner level token has no manager/agent/client restriction

  if (req.query.number) {
    const numDigits = String(req.query.number).replace(/\D/g, '');
    list = list.filter(s => String(s.number || '').replace(/\D/g, '').includes(numDigits));
  }
  if (req.query.cli) {
    const qCli = String(req.query.cli).toLowerCase();
    list = list.filter(s => String(s.cli || '').toLowerCase().includes(qCli));
  }
  if (req.query.from_date) {
    list = list.filter(s => (s.timestamp || s.date || '').slice(0, 10) >= String(req.query.from_date));
  }
  if (req.query.to_date) {
    list = list.filter(s => (s.timestamp || s.date || '').slice(0, 10) <= String(req.query.to_date));
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 100));
  const start = (page - 1) * limit;

  res.json({
    status: 'success',
    total: list.length,
    page,
    limit,
    data: list.slice(start, start + limit)
  });
});

app.all(['/crapi/viewstats', '/crapi/:user/viewstats', '/api/sms/viewstats'], (req, res) => {
  const p = { ...(req.query || {}), ...(req.body || {}) };
  const authHeader = req.headers.authorization || '';
  const token = p.token || (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '');

  const tokens = readDb('api_tokens') || [];
  let currentToken = null;
  {
    // A valid token is ALWAYS required (previously this was open when no tokens existed)
    currentToken = findTokenRecord(tokens, token);
    if (!currentToken || currentToken.status !== 'active') {
      return res.status(401).json({ status: 'error', msg: 'Not Authorized' });
    }
    currentToken.calls = (currentToken.calls || 0) + 1;
    currentToken.last_used = new Date().toISOString();
    writeDb('api_tokens', tokens);
  }

  let sms = readDb('sms_log') || [];

  if (currentToken && currentToken.agent_id) {
    const clients = readDb('clients') || [];
    const myUsernames = new Set(
      clients.filter(c => String(c.agent_id) === String(currentToken.agent_id) && c.username)
             .map(c => c.username.toLowerCase())
    );
    sms = sms.filter(s => myUsernames.has((s.user || '').toLowerCase()) || String(s.agent_id) === String(currentToken.agent_id));
  }

  const dt1 = p.dt1 ? p.dt1.replace(' ', 'T').replace('%20', 'T') : '';
  const dt2 = p.dt2 ? p.dt2.replace(' ', 'T').replace('%20', 'T') : '';
  if (dt1) sms = sms.filter(s => (s.timestamp || '') >= dt1);
  if (dt2) sms = sms.filter(s => (s.timestamp || '') <= dt2);

  if (p.filternum) {
    const fn = String(p.filternum).trim();
    sms = sms.filter(s => (s.number || '').includes(fn));
  }

  if (p.filtercli) {
    const fc = String(p.filtercli).trim().toLowerCase();
    sms = sms.filter(s => (s.cli || s.sender || '').toLowerCase().includes(fc));
  }

  const records = Math.min(Math.max(1, parseInt(p.records) || 25), 200);
  sms.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  const sliced = sms.slice(0, records);

  const data = sliced.map(s => ({
    dt: (s.timestamp || '').replace('T', ' ').slice(0, 19),
    num: s.number || '',
    cli: s.cli || s.sender || '',
    message: s.message || '',
    payout: String(s.profit || s.payout || 0)
  }));

  res.json({
    status: 'success',
    total: data.length,
    data
  });
});

function serverMaskCli(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '—') return '—';
  return s.slice(0, 1) + 'XXXXX';
}

function cleanSmsHierarchyName(val) {
  const s = String(val || '').trim();
  if (!s) return '';
  const sl = s.toLowerCase();
  if (['—', '-', 'direct', 'general', 'unassigned', 'unallocated', 'test panel', 'unknown', 'none', 'null', 'n/a'].includes(sl)) return '';
  return s;
}

function cleanSmsMetaVal(val) {
  const s = String(val || '').trim();
  if (!s) return '';
  const sl = s.toLowerCase();
  if (['—', '-', 'manual', 'direct', 'general range', 'unknown', 'none', 'null'].includes(sl)) return '';
  return s;
}

function buildSmsEnricher() {
  const agents = readDb('agents') || [];
  const agentMap = {};
  const agentByUsername = {};
  agents.forEach(a => {
    if (!a) return;
    if (a.id != null) agentMap[Number(a.id)] = a;
    if (a.username) agentByUsername[String(a.username).trim().toLowerCase()] = a;
  });

  const clients = readDb('clients') || [];
  const clientMap = {};
  const clientByUsername = {};
  clients.forEach(c => {
    if (!c) return;
    if (c.id != null) clientMap[Number(c.id)] = c;
    if (c.username) clientByUsername[String(c.username).trim().toLowerCase()] = c;
  });

  const managers = (readDb('users') || []).filter(u => u && String(u.role || '').toLowerCase() === 'manager');
  const managerMap = {};
  const managerByUsername = {};
  managers.forEach(m => {
    if (!m) return;
    if (m.id != null) managerMap[Number(m.id)] = m;
    if (m.username) managerByUsername[String(m.username).trim().toLowerCase()] = m;
  });

  const numbers = readDb('numbers') || [];
  const numByRaw = new Map();
  const numByDigits = new Map();
  numbers.forEach(n => {
    if (!n || !n.number) return;
    const raw = String(n.number).trim();
    const dig = raw.replace(/\D/g, '');
    if (raw) numByRaw.set(raw, n);
    if (dig) numByDigits.set(dig, n);
  });

  const testNumbers = readDb('test_numbers') || [];
  const testNumByRaw = new Map();
  const testNumByDigits = new Map();
  testNumbers.forEach(t => {
    if (!t || !t.number) return;
    const raw = String(t.number).trim();
    const dig = raw.replace(/\D/g, '');
    if (raw) testNumByRaw.set(raw, t);
    if (dig) testNumByDigits.set(dig, t);
  });

  const ranges = readDb('sms_ranges') || [];
  const rangeById = new Map();
  const rangeByName = new Map();
  ranges.forEach(r => {
    if (!r) return;
    if (r.id != null) rangeById.set(Number(r.id), r);
    const rn = String(r.range_name || r.name || '').trim().toLowerCase();
    if (rn) rangeByName.set(rn, r);
  });

  return function enrichSms(s) {
    const item = { ...s };
    const numRaw = String(item.number || '').trim();
    const numDig = numRaw.replace(/\D/g, '');
    const numRec = numByRaw.get(numRaw) || (numDig ? numByDigits.get(numDig) : null) || null;
    const testRec = testNumByRaw.get(numRaw) || (numDig ? testNumByDigits.get(numDig) : null) || null;

    const rCandidate = cleanSmsMetaVal(item.range_name || item.range_label || item.range);
    const rng = (item.range_id && rangeById.get(Number(item.range_id)))
      || (rCandidate && rangeByName.get(rCandidate.toLowerCase()))
      || (numRec && numRec.range_id && rangeById.get(Number(numRec.range_id)))
      || (numRec && numRec.range_name && rangeByName.get(String(numRec.range_name).trim().toLowerCase()))
      || (testRec && testRec.range_id && rangeById.get(Number(testRec.range_id)))
      || (testRec && (testRec.range_name || testRec.range_label) && rangeByName.get(String(testRec.range_name || testRec.range_label).trim().toLowerCase()))
      || null;

    // Provider (backfill from panel_name/company for CR API & Login Panel records when not matched to an internal range)
    const panelProviderFallback = (item.source === 'cr_api' || item.source === 'login_panel' || item.panel_name)
      ? (cleanSmsMetaVal(item.panel_name) || cleanSmsMetaVal(item.company))
      : '';
    const providerVal = cleanSmsMetaVal(item.provider)
      || cleanSmsMetaVal(rng && rng.provider)
      || cleanSmsMetaVal(numRec && numRec.provider)
      || cleanSmsMetaVal(testRec && testRec.provider)
      || panelProviderFallback
      || '';

    // Range (also upgrade generic 'International' if dial code resolves to a real country)
    const detectedCtry = numDig ? detectCountry(numDig) : '';
    const rawRangeVal = cleanSmsMetaVal(item.range_name || item.range_label || item.range)
      || cleanSmsMetaVal(rng && (rng.range_name || rng.name))
      || cleanSmsMetaVal(numRec && (numRec.range_name || numRec.range_label || numRec.range))
      || cleanSmsMetaVal(testRec && (testRec.range_name || testRec.range_label || testRec.range))
      || cleanSmsMetaVal(item.country)
      || cleanSmsMetaVal(rng && rng.country)
      || cleanSmsMetaVal(numRec && numRec.country)
      || '';
    const rangeVal = (rawRangeVal === 'International' && detectedCtry && detectedCtry !== 'International' && detectedCtry !== '—')
      ? detectedCtry
      : (rawRangeVal || (detectedCtry !== '—' ? detectedCtry : ''));

    // Type: strictly 'Test Panel' or 'General'
    const isTestPanel = Boolean(
      testRec
      || String(item.source || '').toLowerCase() === 'test'
      || String(item.type || '').toLowerCase() === 'test panel'
      || (numRec && (numRec.fixed_for_test || numRec.is_test_panel || numRec.user === 'Test Panel'))
    );
    const smsType = isTestPanel ? 'Test Panel' : 'General';

    // Hierarchy: Client -> Agent -> Manager (strictly '' when not attached)
    let clientName = cleanSmsHierarchyName(item.client_username)
      || cleanSmsHierarchyName(item.client)
      || cleanSmsHierarchyName(item.client_name);
    let clientRec = (item.client_id != null && clientMap[Number(item.client_id)]) || null;
    if (!clientName && clientRec) clientName = cleanSmsHierarchyName(clientRec.username || clientRec.name);
    if (!clientName) {
      const uName = cleanSmsHierarchyName(item.user);
      if (uName && clientByUsername[uName.toLowerCase()]) {
        clientRec = clientByUsername[uName.toLowerCase()];
        clientName = cleanSmsHierarchyName(clientRec.username || clientRec.name);
      }
    }
    if (!clientRec && clientName) {
      clientRec = clientByUsername[clientName.toLowerCase()] || null;
    }

    let agentName = cleanSmsHierarchyName(item.agent_username)
      || cleanSmsHierarchyName(item.agent)
      || cleanSmsHierarchyName(item.agent_name);
    let agentRec = (item.agent_id != null && agentMap[Number(item.agent_id)]) || null;
    if (!agentName && agentRec) agentName = cleanSmsHierarchyName(agentRec.username || agentRec.name);
    if (!agentName && clientRec && clientRec.agent_id && agentMap[Number(clientRec.agent_id)]) {
      agentRec = agentMap[Number(clientRec.agent_id)];
      agentName = cleanSmsHierarchyName(agentRec.username || agentRec.name);
    }
    if (!agentRec && agentName) {
      agentRec = agentByUsername[agentName.toLowerCase()] || null;
    }

    let managerName = cleanSmsHierarchyName(item.manager_username)
      || cleanSmsHierarchyName(item.manager);
    let managerRec = (item.manager_id != null && managerMap[Number(item.manager_id)]) || null;
    if (!managerName && managerRec) managerName = cleanSmsHierarchyName(managerRec.username || managerRec.name);
    if (!managerName && agentRec && agentRec.manager_id && managerMap[Number(agentRec.manager_id)]) {
      managerRec = managerMap[Number(agentRec.manager_id)];
      managerName = cleanSmsHierarchyName(managerRec.username || managerRec.name);
    }
    if (!managerName && clientRec && clientRec.manager_id && managerMap[Number(clientRec.manager_id)]) {
      managerRec = managerMap[Number(clientRec.manager_id)];
      managerName = cleanSmsHierarchyName(managerRec.username || managerRec.name);
    }

    if (!(Number(item.company_rate) > 0)) {
      const fallbackCoRate = parseRateValue(item.company_payout) || parseRateValue(item.carrier_revenue) || 0;
      if (fallbackCoRate > 0) item.company_rate = fallbackCoRate;
    }
    item.provider = providerVal;
    item.range = rangeVal;
    item.range_name = rangeVal;
    item.range_label = rangeVal;
    item.type = smsType;
    item.client = clientName || '';
    item.agent = agentName || '';
    item.manager = managerName || '';
    item.number = numRaw;
    item.cli = String(item.cli || item.app || item.sender || '').trim();
    item.message = String(item.message || '');
    return item;
  };
}

function handleSmsLogsQuery(req, res) {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser && sessionUser.role ? String(sessionUser.role).toLowerCase() : '');
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isClient = sRole === 'client';
  const isAgent = sRole === 'agent';
  const isManager = sRole === 'manager';

  // Fix 2 & F3: Scoped strictly from session user, seamlessly loading archives
  const dateFrom = req.query.date_from || '';
  const enrichSms = buildSmsEnricher();
  let list = getScopedSmsList(req, dateFrom).map(enrichSms);

  const {
    date_from,
    date_to,
    period,
    filter_period,
    range,
    search,
    number,
    cli,
    status,
    group_by
  } = req.query;

  const causeFilter = req.query.fcause || req.query.cause || status;
  if (causeFilter) {
    const sLower = String(causeFilter).toLowerCase().trim();
    if (sLower === '1' || sLower === 'success') {
      list = list.filter(s => s.status === 'delivered' || s.status === 'success' || (s.cause || '').toLowerCase() === 'success');
    } else if (sLower === '2' || sLower === 'scrubag') {
      list = list.filter(s => (s.cause || '').toLowerCase() === 'scrubag' || (s.status || '').toLowerCase() === 'scrubag');
    } else if (sLower === '3' || sLower === 'others') {
      list = list.filter(s => s.status !== 'delivered' && s.status !== 'success' && (s.cause || '').toLowerCase() !== 'success' && (s.cause || '').toLowerCase() !== 'scrubag');
    } else if (sLower !== 'all' && sLower !== '') {
      list = list.filter(s => String(s.status).toLowerCase() === sLower || String(s.cause || '').toLowerCase() === sLower);
    }
  }

  if (req.query.provider) {
    const pLower = String(req.query.provider).trim().toLowerCase();
    list = list.filter(s => String(s.provider || '').toLowerCase().includes(pLower));
  }

  // Predefined period filtering (today, yesterday, month, year, etc.)
  const activePeriod = (period || filter_period || '').trim().toLowerCase();
  const { todaySet, yesterdaySet, weekStartStr, monthStartStr, yearStartStr } = getDateRangeBuckets();
  if (activePeriod === 'today' || activePeriod === 'daily') {
    list = list.filter(s => todaySet.has(extractDateStr(s)));
  } else if (activePeriod === 'yesterday') {
    list = list.filter(s => yesterdaySet.has(extractDateStr(s)));
  } else if (activePeriod === 'this_week' || activePeriod === 'week') {
    list = list.filter(s => extractDateStr(s) >= weekStartStr);
  } else if (activePeriod === 'this_month' || activePeriod === 'month') {
    list = list.filter(s => extractDateStr(s) >= monthStartStr);
  } else if (activePeriod === 'this_year' || activePeriod === 'year') {
    list = list.filter(s => extractDateStr(s) >= yearStartStr);
  }

  if (date_from) {
    let df = String(date_from).trim();
    if (df.length === 10) df = df + ' 00:00:00';
    list = list.filter(s => {
      const ts = (s.timestamp || '').replace('T', ' ');
      const ds = extractDateStr(s);
      return ts >= df || ds >= df.slice(0, 10);
    });
  }
  if (date_to) {
    let dt = String(date_to).trim();
    if (dt.length === 10) dt = dt + ' 23:59:59';
    list = list.filter(s => {
      const ts = (s.timestamp || '').replace('T', ' ');
      const ds = extractDateStr(s);
      return ts <= dt || ds <= dt.slice(0, 10);
    });
  }
  if (range) {
    const rLower = String(range).toLowerCase();
    list = list.filter(s =>
      String(s.range_id) === String(range) ||
      String(s.range || '').toLowerCase().includes(rLower) ||
      String(s.range_label || '').toLowerCase().includes(rLower) ||
      String(s.range_name || '').toLowerCase().includes(rLower) ||
      String(s.country || '').toLowerCase().includes(rLower)
    );
  }
  const numQ = (number || search || '').trim().toLowerCase();
  if (numQ) {
    list = list.filter(s =>
      String(s.number || '').includes(numQ) ||
      String(s.message || '').toLowerCase().includes(numQ)
    );
  }
  if (cli) {
    const cliQ = String(cli).trim().toLowerCase();
    list = list.filter(s =>
      String(s.cli || s.app || '').toLowerCase().includes(cliQ)
    );
  }

  // Sort descending by timestamp
  list.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

  const isExport = req.query.export === 'csv' || req.path.endsWith('/export');

  // ── Group By Logic ──
  if (group_by) {
    const rawKeys = Array.isArray(group_by)
      ? group_by
      : String(group_by).split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

    const validKeys = rawKeys.filter(k => ['hour', 'date', 'daily', 'day', 'month', 'year', 'provider', 'range', 'manager', 'agent', 'client', 'number', 'cli'].includes(k));

    if (validKeys.length > 0) {
      const groups = new Map();

      for (const s of list) {
        const keyParts = {};
        const dStr = extractDateStr(s);
        for (const k of validKeys) {
          if (k === 'hour') {
            const ts = (s.timestamp || s.created || '').replace('T', ' ');
            keyParts.hour = ts.length >= 13 ? ts.slice(0, 13) + ':00' : (dStr ? dStr + ' 00:00' : 'Unknown');
          } else if (k === 'date' || k === 'daily' || k === 'day') {
            keyParts.date = dStr || 'Unknown';
          } else if (k === 'month') {
            keyParts.month = dStr ? dStr.slice(0, 7) : 'Unknown';
          } else if (k === 'year') {
            keyParts.year = dStr ? dStr.slice(0, 4) : 'Unknown';
          } else if (k === 'provider') {
            keyParts.provider = s.provider || '';
          } else if (k === 'range') {
            keyParts.range = s.range_name || s.range_label || s.range || '';
          } else if (k === 'client') {
            keyParts.client = s.client || '';
          } else if (k === 'agent') {
            keyParts.agent = s.agent || '';
          } else if (k === 'manager') {
            keyParts.manager = s.manager || '';
          } else if (k === 'number') {
            keyParts.number = s.number || '';
          } else if (k === 'cli') {
            keyParts.cli = s.cli || '';
          }
        }

        const mapKey = validKeys.map(k => `${k}:${keyParts[k]}`).join('|');
        let grp = groups.get(mapKey);
        if (!grp) {
          grp = {
            ...keyParts,
            sms_count: 0,
            delivered_count: 0,
            failed_count: 0,
            currency: s.currency || 'USD',
            payout: 0,
            agent_payout: 0,
            client_payout: 0,
            profit: 0,
            key: validKeys.map(k => keyParts[k]).join(' / ')
          };
          groups.set(mapKey, grp);
        }

        grp.sms_count++;
        if (s.status === 'delivered' || s.status === 'success') {
          grp.delivered_count++;
        } else if (s.status === 'failed') {
          grp.failed_count++;
        }

        const agp = parseFloat(s.agent_payout ?? s.agent_rate ?? 0) || 0;
        const cp = parseFloat(s.client_payout ?? s.client_amount ?? 0) || 0;
        let rolePayout = 0;
        let prof = 0;
        if (isAgent) {
          rolePayout = agp;
          prof = parseFloat(s.agent_amount ?? Math.max(0, rolePayout - cp)) || 0;
        } else if (isManager) {
          rolePayout = parseFloat(s.manager_amount != null ? s.manager_amount : (s.manager_payout || 0)) || 0;
          prof = rolePayout;
        } else if (isClient) {
          rolePayout = cp;
          prof = 0;
        } else {
          rolePayout = parseFloat(s.company_rate ?? s.company_payout ?? s.carrier_revenue ?? s.payout ?? 0) || 0;
          prof = parseFloat(s.owner_amount ?? s.profit ?? Math.max(0, rolePayout - agp)) || 0;
        }
        grp.payout = Math.round((grp.payout + rolePayout) * 10000) / 10000;
        grp.agent_payout = Math.round((grp.agent_payout + agp) * 10000) / 10000;
        grp.client_payout = Math.round((grp.client_payout + cp) * 10000) / 10000;
        grp.profit = Math.round((grp.profit + prof) * 10000) / 10000;
      }

      const groupedResult = Array.from(groups.values());
      groupedResult.sort((a, b) => b.sms_count - a.sms_count);

      // Global summary totals across all groups
      let totalSms = 0, totalDelivered = 0, totalFailed = 0, totalPayout = 0, totalAgentPayout = 0, totalClientPayout = 0, totalProfit = 0;
      for (const g of groupedResult) {
        totalSms += g.sms_count || 0;
        totalDelivered += g.delivered_count || 0;
        totalFailed += g.failed_count || 0;
        totalPayout += g.payout || 0;
        totalAgentPayout += g.agent_payout || 0;
        totalClientPayout += g.client_payout || 0;
        totalProfit += g.profit || 0;
      }
      const summary = {
        total_sms: totalSms,
        total_groups: groupedResult.length,
        delivered_count: totalDelivered,
        failed_count: totalFailed,
        currency: 'USD',
        payout: Math.round(totalPayout * 10000) / 10000,
        agent_payout: Math.round(totalAgentPayout * 10000) / 10000,
        client_payout: Math.round(totalClientPayout * 10000) / 10000,
        profit: Math.round(totalProfit * 10000) / 10000
      };

      if (isExport) {
        const filename = `sms_cdr_grouped_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-cache');
        const secondPayoutLabel = (isOwner || isManager) ? 'AGENT PAYOUT' : 'CLIENT PAYOUT';
        const headers = [...validKeys.map(k => k.toUpperCase()), 'SMS COUNT', 'DELIVERED', 'FAILED', 'CURRENCY', 'MY PAYOUT'];
        if (!isClient) headers.push(secondPayoutLabel, 'PROFIT');
        res.write(headers.map(h => `"${h}"`).join(',') + '\r\n');
        for (const g of groupedResult) {
          const row = [
            ...validKeys.map(k => {
              if (k === 'cli' && !isOwner) return serverMaskCli(g[k]);
              if (k === 'manager' || k === 'agent' || k === 'client') return g[k] || '';
              return g[k] || '—';
            }),
            g.sms_count || 0,
            g.delivered_count || 0,
            g.failed_count || 0,
            g.currency || 'USD',
            Number(g.payout || 0).toFixed(4)
          ];
          if (!isClient) {
            row.push(Number((isOwner || isManager) ? (g.agent_payout || 0) : (g.client_payout || 0)).toFixed(4));
            row.push(Number(g.profit || 0).toFixed(4));
          }
          res.write(row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\r\n');
        }
        const footRow = [
          `Total Groups: ${groupedResult.length}`,
          ...Array(Math.max(0, validKeys.length - 1)).fill(''),
          summary.total_sms,
          summary.delivered_count,
          summary.failed_count,
          summary.currency,
          summary.payout.toFixed(4)
        ];
        if (!isClient) {
          footRow.push(((isOwner || isManager) ? summary.agent_payout : summary.client_payout).toFixed(4));
          footRow.push(summary.profit.toFixed(4));
        }
        res.write(footRow.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\r\n');
        return res.end();
      }

      const rawLimit = String(req.query.limit || '').trim().toLowerCase();
      const isAll = rawLimit === 'all' || rawLimit === '0' || rawLimit === '-1';
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = isAll ? groupedResult.length : Math.max(1, parseInt(req.query.limit, 10) || 500);
      const start = isAll ? 0 : (page - 1) * limit;
      const totalPages = isAll ? 1 : (limit > 0 ? Math.ceil(groupedResult.length / limit) : 1);
      if (isClient) {
        delete summary.profit;
        delete summary.agent_payout;
      }

      const pageSlice = isAll ? groupedResult : groupedResult.slice(start, start + limit);
      const safeGroupedResult = isOwner ? pageSlice : pageSlice.map(g => {
        const copy = { ...g };
        if (isClient) {
          delete copy.profit;
          delete copy.agent_payout;
        }
        if (copy.cli) copy.cli = serverMaskCli(copy.cli);
        return copy;
      });

      return res.json({
        data: safeGroupedResult,
        total: groupedResult.length,
        page,
        limit: isAll ? groupedResult.length : limit,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
        grouped: true,
        group_keys: validKeys,
        summary
      });
    }
  }

  // ── Ungrouped Summary Totals across full matched list (Multi-Currency Breakdown) ──
  let totalSms = list.length, totalDelivered = 0, totalFailed = 0, totalPayout = 0, totalAgentPayout = 0, totalClientPayout = 0, totalProfit = 0;
  const currencies = {
    USD: { in: 0, out: 0, profit: 0, count: 0 },
    EUR: { in: 0, out: 0, profit: 0, count: 0 },
    GBP: { in: 0, out: 0, profit: 0, count: 0 }
  };

  for (const s of list) {
    if (s.status === 'delivered' || s.status === 'success') totalDelivered++;
    else if (s.status === 'failed') totalFailed++;
    const agp = parseFloat(s.agent_payout ?? s.agent_rate ?? 0) || 0;
    const cp = parseFloat(s.client_payout ?? s.client_amount ?? 0) || 0;
    let rolePayout = 0;
    let pr = 0;
    if (isAgent) {
      rolePayout = agp;
      pr = parseFloat(s.agent_amount ?? Math.max(0, rolePayout - cp)) || 0;
    } else if (isManager) {
      rolePayout = parseFloat(s.manager_amount != null ? s.manager_amount : (s.manager_payout || 0)) || 0;
      pr = rolePayout;
    } else if (isClient) {
      rolePayout = cp;
      pr = 0;
    } else {
      rolePayout = parseFloat(s.company_rate ?? s.company_payout ?? s.carrier_revenue ?? s.payout ?? 0) || 0;
      pr = parseFloat(s.owner_amount ?? s.profit ?? Math.max(0, rolePayout - agp)) || 0;
    }
    totalPayout += rolePayout;
    totalAgentPayout += agp;
    totalClientPayout += cp;
    totalProfit += pr;

    const cur = String(s.currency || 'USD').toUpperCase();
    if (!currencies[cur]) {
      currencies[cur] = { in: 0, out: 0, profit: 0, count: 0 };
    }
    currencies[cur].in += rolePayout;
    currencies[cur].out += (isOwner || isManager) ? agp : cp;
    currencies[cur].profit += pr;
    currencies[cur].count++;
  }

  // Format multi-currency stats for easy frontend consumption
  const multi_currency = {};
  for (const [k, v] of Object.entries(currencies)) {
    multi_currency[k] = {
      in: Math.round(v.in * 10000) / 10000,
      out: Math.round(v.out * 10000) / 10000,
      profit: Math.round(v.profit * 10000) / 10000,
      count: v.count
    };
  }

  const summary = {
    total_sms: totalSms,
    total_groups: 0,
    delivered_count: totalDelivered,
    failed_count: totalFailed,
    currency: 'USD',
    payout: Math.round(totalPayout * 10000) / 10000,
    agent_payout: Math.round(totalAgentPayout * 10000) / 10000,
    client_payout: Math.round(totalClientPayout * 10000) / 10000,
    profit: Math.round(totalProfit * 10000) / 10000,
    multi_currency
  };

  if (isExport) {
    const filename = `sms_cdr_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    const headers = isOwner
      ? ['Date Time', 'Provider', 'Range', 'Type', 'Number', 'CLI', 'SMS', 'Agent', 'Manager', 'Currency', 'My Payout', 'Agent Payout', 'Profit', 'Cause', 'IP']
      : isManager
      ? ['Date Time', 'Provider', 'Range', 'Type', 'Number', 'CLI', 'SMS', 'Agent', 'Client', 'Currency', 'My Payout', 'Agent Payout', 'Profit']
      : isAgent
      ? ['Date Time', 'Provider', 'Range', 'Type', 'Number', 'CLI', 'SMS', 'Client', 'Currency', 'My Payout', 'Client Payout', 'My Profit']
      : ['Date Time', 'Provider', 'Range', 'Type', 'Number', 'CLI', 'SMS', 'Currency', 'My Payout', 'Cause', 'IP'];
    res.write(headers.map(h => `"${h}"`).join(',') + '\r\n');
    for (const s of list) {
      const safeMsg = String(s.message || '');
      const sanitizedMsg = /^[=\+\-@\t\r]/.test(safeMsg) ? "'" + safeMsg : safeMsg;
      const dtStr = (s.timestamp || '').replace('T', ' ').slice(0, 19);
      const provStr = s.provider || '—';
      const rngStr = s.range_name || s.range_label || s.range || s.country || '—';
      const typeStr = s.type === 'Test Panel' ? 'Test Panel' : 'General';
      const cliStr = isOwner ? (s.cli || '') : serverMaskCli(s.cli || '');
      const agpVal = Number(s.agent_payout ?? s.agent_rate ?? 0);
      const cpVal = Number(s.client_payout ?? s.client_amount ?? 0);
      const curStr = s.currency || 'USD';
      const causeStr = s.cause || (s.status === 'delivered' || s.status === 'success' ? 'Success' : (s.status || '—'));
      let row;
      if (isOwner) {
        const myP = Number(s.company_rate ?? s.company_payout ?? s.carrier_revenue ?? 0);
        const prof = Number(s.owner_amount ?? s.profit ?? Math.max(0, myP - agpVal));
        row = [dtStr, provStr, rngStr, typeStr, s.number || '', cliStr, sanitizedMsg, s.agent || '', s.manager || '', curStr, myP.toFixed(4), agpVal.toFixed(4), prof.toFixed(4), causeStr, s.ip || ''];
      } else if (isManager) {
        const myP = Number(s.manager_amount ?? s.manager_payout ?? 0);
        row = [dtStr, provStr, rngStr, typeStr, s.number || '', cliStr, sanitizedMsg, s.agent || '', s.client || '', curStr, myP.toFixed(4), agpVal.toFixed(4), myP.toFixed(4)];
      } else if (isAgent) {
        const prof = Number(s.agent_amount ?? Math.max(0, agpVal - cpVal));
        row = [dtStr, provStr, rngStr, typeStr, s.number || '', cliStr, sanitizedMsg, s.client || '', curStr, agpVal.toFixed(4), cpVal.toFixed(4), prof.toFixed(4)];
      } else {
        row = [dtStr, provStr, rngStr, typeStr, s.number || '', cliStr, sanitizedMsg, curStr, cpVal.toFixed(4), causeStr, s.ip || ''];
      }
      res.write(row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\r\n');
    }
    const footRow = isOwner
      ? [`Total SMS: ${summary.total_sms}`, '', '', '', '', '', '', '', '', summary.currency, summary.payout.toFixed(4), summary.agent_payout.toFixed(4), summary.profit.toFixed(4), `Delivered: ${summary.delivered_count}`, '']
      : isManager
      ? [`Total SMS: ${summary.total_sms}`, '', '', '', '', '', '', '', '', summary.currency, summary.payout.toFixed(4), summary.agent_payout.toFixed(4), summary.profit.toFixed(4)]
      : isAgent
      ? [`Total SMS: ${summary.total_sms}`, '', '', '', '', '', '', '', summary.currency, summary.payout.toFixed(4), summary.client_payout.toFixed(4), summary.profit.toFixed(4)]
      : [`Total SMS: ${summary.total_sms}`, '', '', '', '', '', '', summary.currency, summary.payout.toFixed(4), `Delivered: ${summary.delivered_count}`, ''];
    res.write(footRow.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\r\n');
    return res.end();
  }

  // ── Ungrouped Standard / Server-side Pagination ──
  const rawLimit = String(req.query.limit || '').trim().toLowerCase();
  const isAll = rawLimit === 'all' || rawLimit === '0' || rawLimit === '-1';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = isAll ? list.length : Math.max(1, parseInt(req.query.limit, 10) || 100);
  const start = isAll ? 0 : (page - 1) * limit;
  const totalPages = isAll ? 1 : (limit > 0 ? Math.ceil(list.length / limit) : 1);
  const sliced = isAll ? list : list.slice(start, start + limit);

  const sanitizedSliced = sliced.map(s => {
    const item = { ...s };

    if (!isOwner) {
      item.cli = serverMaskCli(item.cli || item.app || item.sender);
      delete item.company_rate;
      delete item.company_cost;
      delete item.owner_amount;
      delete item.profit;
      delete item.admin_profit;
      delete item.gross_margin;
      if (isClient) {
        delete item.agent_amount;
        delete item.agent_rate;
        delete item.agent_payout;
        delete item.manager_amount;
        delete item.manager_percent;
        item.my_payout = Number(item.client_amount != null ? item.client_amount : (item.client_payout || 0));
        item.payout = item.my_payout;
      } else if (isAgent) {
        delete item.manager_amount;
        delete item.manager_percent;
        item.my_payout = Number(item.agent_payout != null ? item.agent_payout : (item.agent_rate || 0));
        item.payout = item.my_payout;
      } else if (isManager) {
        item.my_payout = Number(item.manager_amount != null ? item.manager_amount : (item.manager_payout || 0));
        item.payout = item.my_payout;
      }
    } else {
      item.my_payout = Number(item.company_rate != null ? item.company_rate : (item.company_payout != null ? item.company_payout : (item.carrier_revenue || 0)));
    }
    return item;
  });

  const safeSummary = { ...summary };
  if (isClient) {
    delete safeSummary.profit;
    delete safeSummary.agent_payout;
  }

  res.json({
    data: sanitizedSliced,
    total: list.length,
    page,
    limit: isAll ? list.length : limit,
    total_pages: totalPages,
    has_next: page < totalPages,
    has_prev: page > 1,
    grouped: false,
    summary: safeSummary
  });
}

app.get('/api/sms/logs', (req, res) => handleSmsLogsQuery(req, res));
app.get('/api/sms/export', (req, res) => handleSmsLogsQuery(req, res));

// ── AstraSMS-style Real-time CLI Search & Route Inspector ───────
app.all(['/api/cli-search', '/api/sms/cli-search'], requireAuth, (req, res) => {
  try {
    const sessionUser = req.sessionUser;
    const role = normRole(sessionUser?.role);
    const isOwner = role === 'owner' || role === 'admin';
    const isManager = role === 'manager';
    const isAgent = role === 'agent';
    const isClient = role === 'client';

    const q = String(req.query.cli || req.query.search || req.query.q || req.body?.cli || req.body?.search || req.body?.q || '').toLowerCase().trim();
    const hours = parseFloat(req.query.hours || req.body?.hours) || 24;
    const dateFrom = req.query.date_from || req.body?.date_from;
    const dateTo = req.query.date_to || req.body?.date_to;
    const rangeFilter = String(req.query.range || req.body?.range || '').trim();

    // Time window calculation
    let fromTs = 0;
    let toTs = Infinity;
    if (dateFrom) {
      fromTs = new Date(String(dateFrom).replace(' ', 'T')).getTime() || 0;
    } else if (hours > 0) {
      fromTs = Date.now() - (hours * 3600 * 1000);
    }
    if (dateTo) {
      toTs = new Date(String(dateTo).replace(' ', 'T')).getTime() || Infinity;
    }

    // Role-scoped numbers and SMS logs (Historical Owner + Current Number Alignment)
    const allNumbers = readDb('numbers') || [];
    let allowedNumberSet = null;
    const sessionUserId = Number(sessionUser.id);
    if (!isOwner) {
      if (isManager) {
        allowedNumberSet = new Set(allNumbers.filter(n => Number(n.manager_id) === sessionUserId).map(n => String(n.number)));
      } else if (isAgent) {
        allowedNumberSet = new Set(allNumbers.filter(n => Number(n.agent_id) === sessionUserId).map(n => String(n.number)));
      } else if (isClient) {
        allowedNumberSet = new Set(allNumbers.filter(n => Number(n.client_id) === sessionUserId).map(n => String(n.number)));
      }
    }

    const logs = readDb('sms_log') || [];
    const ranges = readDb('sms_ranges') || [];

    // Filter SMS messages strictly enforcing historical recipient or active pool ownership
    const matchedSms = [];
    for (const s of logs) {
      if (!isOwner) {
        const numStr = String(s.number || s.to || '');
        const currentAssigned = allowedNumberSet && allowedNumberSet.has(numStr);
        // Historical verification: If log recorded specific agent/client/manager at delivery time
        if (isManager) {
          const histMatch = s.manager_id != null && Number(s.manager_id) === sessionUserId;
          if (!histMatch && (!currentAssigned || (s.manager_id != null && Number(s.manager_id) !== sessionUserId))) {
            continue;
          }
        } else if (isAgent) {
          const histMatch = s.agent_id != null && Number(s.agent_id) === sessionUserId;
          if (!histMatch && (!currentAssigned || (s.agent_id != null && Number(s.agent_id) !== sessionUserId))) {
            continue;
          }
        } else if (isClient) {
          const histMatch = s.client_id != null && Number(s.client_id) === sessionUserId;
          if (!histMatch && (!currentAssigned || (s.client_id != null && Number(s.client_id) !== sessionUserId))) {
            continue;
          }
        }
      }
      const sTs = new Date(String(s.timestamp || s.date || 0).replace(' ', 'T')).getTime() || 0;
      if (sTs < fromTs || sTs > toTs) continue;

      const cli = String(s.cli || s.app || s.sender || '').toLowerCase();
      const num = String(s.number || s.to || '').toLowerCase();
      const text = String(s.message || s.text || '').toLowerCase();
      const rName = String(s.range || s.range_name || s.range_label || s.country || '').toLowerCase();

      if (q && !cli.includes(q) && !num.includes(q) && !text.includes(q) && !rName.includes(q)) {
        continue;
      }
      if (rangeFilter && !rName.includes(rangeFilter.toLowerCase())) {
        continue;
      }

      matchedSms.push(s);
    }

    // Grouping by Range & CLI
    const groupMap = new Map();
    let totalDelivered = 0;
    let totalFailed = 0;

    for (const s of matchedSms) {
      const isDeliv = s.status === 'delivered' || s.status === 'success' || !s.status;
      if (isDeliv) totalDelivered++; else totalFailed++;

      const rName = s.range || s.range_name || s.range_label || s.country || 'General Range';
      const cliVal = s.cli || s.app || s.sender || '—';
      const key = `${rName}___${cliVal}`;

      if (!groupMap.has(key)) {
        const matchedRange = ranges.find(r => (r.range_name && r.range_name.toLowerCase() === rName.toLowerCase()) || (r.country && rName.toLowerCase().includes(r.country.toLowerCase())));
        groupMap.set(key, {
          key,
          range: rName,
          country: matchedRange?.country || s.country || '—',
          prefix: matchedRange?.prefix || '',
          cli: cliVal,
          count: 0,
          delivered: 0,
          failed: 0,
          last_seen: s.timestamp || s.date || '',
          sample_messages: []
        });
      }

      const g = groupMap.get(key);
      g.count++;
      if (isDeliv) g.delivered++; else g.failed++;
      if (s.timestamp && (!g.last_seen || s.timestamp > g.last_seen)) {
        g.last_seen = s.timestamp;
      }
      if (g.sample_messages.length < 5) {
        g.sample_messages.push({
          id: s.id,
          number: s.number,
          text: s.message || s.text || '',
          timestamp: s.timestamp || s.date || '',
          status: s.status || 'delivered'
        });
      }
    }

    const routes = Array.from(groupMap.values()).map(g => ({
      ...g,
      conversion_rate: g.count > 0 ? Math.round((g.delivered / g.count) * 100) : 100
    })).sort((a, b) => b.count - a.count);

    const uniqueClis = new Set(matchedSms.map(s => s.cli || s.app || s.sender)).size;
    const uniqueRanges = new Set(routes.map(r => r.range)).size;

    return res.json({
      success: true,
      summary: {
        total_sms: matchedSms.length,
        delivered: totalDelivered,
        failed: totalFailed,
        conversion_rate: matchedSms.length > 0 ? Math.round((totalDelivered / matchedSms.length) * 100) : 100,
        unique_clis: uniqueClis,
        unique_ranges: uniqueRanges,
        active_routes: routes.length,
        hours_searched: hours
      },
      routes,
      recent_messages: matchedSms.slice(0, 50).map(s => ({
        id: s.id,
        number: s.number,
        cli: s.cli || s.app || s.sender || '—',
        range: s.range || s.range_name || s.range_label || s.country || '—',
        text: s.message || s.text || '',
        timestamp: s.timestamp || s.date || '',
        status: s.status || 'delivered'
      }))
    });
  } catch (err) {
    console.error('Error in /api/cli-search:', err);
    res.status(500).json({ success: false, error: 'CLI search failed: ' + err.message });
  }
});

app.get('/api/sms/test-logs', (req, res) => {
  let list = readDb('test_sms_logs') || [];
  const ranges = readDb('sms_ranges') || [];
  const testNumbers = readDb('test_numbers') || [];
  const numToRec = {};
  testNumbers.forEach(tn => {
    if (tn.number) numToRec[String(tn.number).trim()] = tn;
  });

  list = list.map(s => {
    const tn = s.number ? numToRec[String(s.number).trim()] : null;
    const foundRng = (s.range_id && ranges.find(r => Number(r.id) === Number(s.range_id)))
      || (tn && tn.range_id && ranges.find(r => Number(r.id) === Number(tn.range_id)))
      || (tn && (tn.range_name || tn.range_label) && ranges.find(r => String(r.range_name || r.name || '').toLowerCase() === String(tn.range_name || tn.range_label).toLowerCase()))
      || null;
    let rName = cleanSmsMetaVal(s.range_name || s.range_label || s.range)
      || cleanSmsMetaVal(tn && (tn.range_name || tn.range_label || tn.range))
      || cleanSmsMetaVal(foundRng && (foundRng.range_name || foundRng.name))
      || cleanSmsMetaVal(s.country)
      || 'Test Range';
    const prov = cleanSmsMetaVal(s.provider)
      || cleanSmsMetaVal(tn && tn.provider)
      || cleanSmsMetaVal(foundRng && foundRng.provider)
      || '';
    return { ...s, range_name: rName, range_label: rName, range: rName, provider: prov, type: 'Test Panel' };
  });

  const { date_from, date_to, period, filter_period, range, search, cli, group_by } = req.query;

  const activePeriod = (period || filter_period || '').trim().toLowerCase();
  const { todaySet, yesterdaySet, weekStartStr, monthStartStr, yearStartStr } = getDateRangeBuckets();
  if (activePeriod === 'today' || activePeriod === 'daily') {
    list = list.filter(s => todaySet.has(extractDateStr(s)));
  } else if (activePeriod === 'yesterday') {
    list = list.filter(s => yesterdaySet.has(extractDateStr(s)));
  } else if (activePeriod === 'this_week' || activePeriod === 'week') {
    list = list.filter(s => extractDateStr(s) >= weekStartStr);
  } else if (activePeriod === 'this_month' || activePeriod === 'month') {
    list = list.filter(s => extractDateStr(s) >= monthStartStr);
  } else if (activePeriod === 'this_year' || activePeriod === 'year') {
    list = list.filter(s => extractDateStr(s) >= yearStartStr);
  }

  if (date_from) {
    let df = String(date_from).trim();
    if (df.length === 10) df = df + ' 00:00:00';
    list = list.filter(s => {
      const ts = (s.timestamp || '').replace('T', ' ');
      const ds = extractDateStr(s);
      return ts >= df || ds >= df.slice(0, 10);
    });
  }
  if (date_to) {
    let dt = String(date_to).trim();
    if (dt.length === 10) dt = dt + ' 23:59:59';
    list = list.filter(s => {
      const ts = (s.timestamp || '').replace('T', ' ');
      const ds = extractDateStr(s);
      return ts <= dt || ds <= dt.slice(0, 10);
    });
  }
  if (range) list = list.filter(s => (s.range_name || s.range || s.range_label || '').toLowerCase().includes(range.toLowerCase()));
  if (search) list = list.filter(s => (s.number || '').includes(search) || (s.message || '').includes(search));
  if (cli) list = list.filter(s => (s.cli || '').toLowerCase().includes(cli.toLowerCase()));

  if (group_by) {
    const rawKeys = Array.isArray(group_by) ? group_by : String(group_by).split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    const validKeys = rawKeys.filter(k => ['hour', 'date', 'daily', 'day', 'month', 'year', 'range', 'number', 'cli'].includes(k));
    if (validKeys.length > 0) {
      const groups = new Map();
      for (const s of list) {
        const kp = {};
        const dStr = extractDateStr(s);
        for (const k of validKeys) {
          if (k === 'hour') {
            const ts = (s.timestamp || s.created || '').replace('T', ' ');
            kp.hour = ts.length >= 13 ? ts.slice(0, 13) + ':00' : (dStr ? dStr + ' 00:00' : 'Unknown');
          } else if (k === 'date' || k === 'daily' || k === 'day') kp.date = dStr || 'Unknown';
          else if (k === 'month') kp.month = dStr ? dStr.slice(0, 7) : 'Unknown';
          else if (k === 'year') kp.year = dStr ? dStr.slice(0, 4) : 'Unknown';
          else if (k === 'range') kp.range = s.range_name || s.range || s.range_label || 'Test Range';
          else if (k === 'number') kp.number = s.number || '—';
          else if (k === 'cli') kp.cli = s.cli || '—';
        }
        const mk = validKeys.map(k => `${k}:${kp[k]}`).join('|');
        let grp = groups.get(mk);
        if (!grp) {
          grp = { ...kp, count: 0, sms_count: 0, key: validKeys.map(k => kp[k]).join(' / ') };
          groups.set(mk, grp);
        }
        grp.count++;
        grp.sms_count++;
      }
      const gr = Array.from(groups.values()).sort((a, b) => b.sms_count - a.sms_count);
      return res.json({ data: gr, total: gr.length, grouped: true, group_keys: validKeys });
    }
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const start = (page - 1) * limit;
  res.json({ data: list.slice(start, start + limit), total: list.length, grouped: false });
});

app.get('/api/sms/test-numbers', (req, res) => {
  const ranges = readDb('sms_ranges') || [];
  const rangeMap = {};
  ranges.forEach(r => {
    rangeMap[r.id] = r;
    if (r.range_name) rangeMap[r.range_name] = r;
  });
  let data = readDb('test_numbers') || [];
  data = data.map(item => {
    const rng = (item.range_id && rangeMap[item.range_id]) || (item.range_name && rangeMap[item.range_name]);
    const rName = item.range_name || item.range_label || item.range || (rng && (rng.range_name || rng.name)) || item.country || '—';
    const prov = cleanSmsMetaVal(item.provider) || cleanSmsMetaVal(rng && rng.provider) || '';
    return {
      ...item,
      provider: prov,
      range_name: rName,
      range_label: rName,
      range: rName
    };
  });

  const search = (req.query.search || '').toLowerCase().trim();
  const rangeFilter = (req.query.range || '').toLowerCase().trim();
  if (search) {
    data = data.filter(d => (d.number || '').toLowerCase().includes(search) || (d.range_name || '').toLowerCase().includes(search));
  }
  if (rangeFilter) {
    data = data.filter(d => String(d.range_id) === rangeFilter || (d.range_name || '').toLowerCase().includes(rangeFilter));
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || data.length;
  const total = data.length;
  const paged = limit < total ? data.slice((page - 1) * limit, page * limit) : data;
  res.json({ data: paged, total });
});

app.post('/api/sms/test-numbers', (req, res) => {
  const data = readDb('test_numbers') || [];
  const ranges = readDb('sms_ranges') || [];
  const rng = req.body.range_id ? ranges.find(r => r.id === Number(req.body.range_id)) : null;
  const rName = (req.body.range_name || req.body.range_label || req.body.range || (rng && (rng.range_name || rng.name)) || req.body.country || 'Range').trim();
  const item = {
    id: nextId(data),
    ...req.body,
    range_name: rName,
    range_label: rName,
    range: rName,
    created: new Date().toISOString()
  };
  data.unshift(item);
  writeDb('test_numbers', data);
  syncTestNumbersWithNumbersPool();
  res.json(item);
});

app.post('/api/sms/test-numbers/bulk', (req, res) => {
  const { range_id, count } = req.body || {};
  const ranges = readDb('sms_ranges') || [];
  const rng = ranges.find(r => String(r.id) === String(range_id));
  if (!rng) return res.status(404).json({ error: 'Range not found' });
  const rName = rng.range_name || rng.name || rng.country || 'Range';
  const numbersPool = readDb('numbers') || [];
  let available = numbersPool.filter(n => n.range_id && Number(n.range_id) === Number(range_id));
  if (!available.length) {
    available = numbersPool.filter(n => n.range_name === rName || (n.country === rng.country && (n.provider === rng.provider || n.provider === 'Manual')));
  }
  const pullCount = Math.min(parseInt(count) || 10, available.length || 10);
  const testNumbers = readDb('test_numbers') || [];
  const added = [];
  const existingSet = new Set(testNumbers.map(tn => tn.number));

  if (available.length) {
    for (const numObj of available) {
      if (added.length >= pullCount) break;
      if (!existingSet.has(numObj.number)) {
        const item = {
          id: nextId(testNumbers) + added.length,
          number: numObj.number,
          range_id: rng.id,
          range_name: rName,
          range_label: rName,
          range: rName,
          country: rng.country,
          provider: rng.provider || 'Manual',
          created: new Date().toISOString()
        };
        added.push(item);
        existingSet.add(numObj.number);
      }
    }
  }

  // If pool was empty or fewer than requested, generate numbers matching range prefix
  const prefix = rng.prefix || '1';
  let genAttempt = 0;
  while (added.length < pullCount && genAttempt < 200) {
    genAttempt++;
    const randomSuffix = Math.floor(1000000 + Math.random() * 9000000);
    const genNum = `${prefix}${randomSuffix}`;
    if (!existingSet.has(genNum)) {
      const item = {
        id: nextId(testNumbers) + added.length,
        number: genNum,
        range_id: rng.id,
        range_name: rName,
        range_label: rName,
        range: rName,
        country: rng.country,
        provider: rng.provider || 'Manual',
        created: new Date().toISOString()
      };
      added.push(item);
      existingSet.add(genNum);
    }
  }

  testNumbers.unshift(...added);
  writeDb('test_numbers', testNumbers);
  syncTestNumbersWithNumbersPool();
  res.json({ success: true, added: added.length, range_name: rName });
});

// Single test number deletion — releases number back to unallocated pool in My Numbers
app.delete('/api/sms/test-numbers/:id', (req, res) => {
  const rawId = String(req.params.id);
  const numId = Number(req.params.id);
  let testNumbers = readDb('test_numbers') || [];
  const target = testNumbers.find(tn => (!isNaN(numId) && tn.id === numId) || String(tn.id) === rawId || String(tn.number) === rawId);
  if (!target) {
    return res.status(404).json({ error: 'Test number not found' });
  }
  const removedNum = String(target.number);
  testNumbers = testNumbers.filter(tn => tn !== target && String(tn.number) !== removedNum);
  writeDb('test_numbers', testNumbers);

  // Release/unfix in numbers pool
  let numbers = readDb('numbers') || [];
  let unfixed = 0;
  numbers = numbers.map(n => {
    if (String(n.number).trim() === removedNum.trim()) {
      unfixed++;
      return {
        ...n,
        fixed_for_test: false,
        is_test_panel: false,
        user: 'unallocated',
        client_name: '',
        client_username: '',
        client_id: null,
        agent_id: null,
        manager_id: null,
        status: 'active',
        notes: (n.notes || '').replace(/\|?\s*Fixed for Test Panel/gi, '').trim()
      };
    }
    return n;
  });
  if (unfixed > 0) {
    writeDb('numbers', numbers);
  }

  logAudit('Owner', 'Remove Test Number', `Removed number ${removedNum} from Test Panel and released to My Numbers pool`, 'Test Panel');
  res.json({ success: true, removed: removedNum, unfixed });
});

// Bulk clear all test numbers — releases all test numbers back to unallocated pool in My Numbers
app.delete('/api/sms/test-numbers', (req, res) => {
  let testNumbers = readDb('test_numbers') || [];
  const count = testNumbers.length;
  const allTestNums = new Set(testNumbers.map(tn => String(tn.number).trim()));
  writeDb('test_numbers', []);

  // Release/unfix all in numbers pool
  let numbers = readDb('numbers') || [];
  let unfixed = 0;
  numbers = numbers.map(n => {
    if (allTestNums.has(String(n.number).trim()) || n.fixed_for_test || n.is_test_panel || n.user === 'Test Panel') {
      unfixed++;
      return {
        ...n,
        fixed_for_test: false,
        is_test_panel: false,
        user: 'unallocated',
        client_name: '',
        client_username: '',
        client_id: null,
        agent_id: null,
        manager_id: null,
        status: 'active',
        notes: (n.notes || '').replace(/\|?\s*Fixed for Test Panel/gi, '').trim()
      };
    }
    return n;
  });
  if (unfixed > 0) {
    writeDb('numbers', numbers);
  }

  logAudit('Owner', 'Clear Test Numbers', `Cleared all ${count} test number(s) from Test Panel and released to My Numbers pool`, 'Test Panel');
  res.json({ success: true, cleared: count, unfixed });
});

app.get('/api/sms/stats', (req, res) => {
  const sms = getScopedSmsList(req);
  const delivered = sms.filter(s => s.status === 'delivered');
  const failed = sms.filter(s => s.status === 'failed');

  const sessionUser = getSessionUser(req);
  const sRole = (sessionUser?.role || '').toLowerCase();

  let total_profit = 0;
  sms.forEach(s => {
    if (sRole === 'owner' || sRole === 'admin') {
      total_profit += (Number(s.owner_amount) || Number(s.profit) || 0);
    } else if (sRole === 'manager') {
      total_profit += (Number(s.manager_amount) || 0);
    } else if (sRole === 'agent') {
      total_profit += (Number(s.agent_amount) || 0);
    } else {
      total_profit += (Number(s.client_amount) || Number(s.payout) || 0);
    }
  });
  total_profit = Math.round(total_profit * 10000) / 10000;

  const daily_profit = Array.from({ length: 30 }, () => 0);
  const now = new Date();
  sms.forEach(s => {
    if (!s.timestamp) return;
    const d = new Date(s.timestamp);
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays < 30) {
      const idx = 29 - diffDays;
      let amt = 0;
      if (sRole === 'owner' || sRole === 'admin') amt = Number(s.owner_amount) || Number(s.profit) || 0;
      else if (sRole === 'manager') amt = Number(s.manager_amount) || 0;
      else if (sRole === 'agent') amt = Number(s.agent_amount) || 0;
      else amt = Number(s.client_amount) || Number(s.payout) || 0;
      daily_profit[idx] = Math.round((daily_profit[idx] + amt) * 10000) / 10000;
    }
  });

  const hourly_traffic = Array.from({ length: 24 }, () => 0);
  sms.forEach(s => {
    if (!s.timestamp) return;
    const d = new Date(s.timestamp);
    const hr = d.getHours();
    if (hr >= 0 && hr < 24) {
      hourly_traffic[hr]++;
    }
  });

  const app_breakdown = {};
  sms.forEach(s => {
    const app = s.app || s.service || 'Other';
    app_breakdown[app] = (app_breakdown[app] || 0) + 1;
  });

  res.json({
    total: sms.length,
    total_sms: sms.length,
    delivered: delivered.length,
    failed: failed.length,
    success_rate: sms.length ? Math.round((delivered.length / sms.length) * 100) : 0,
    total_profit,
    daily_profit,
    hourly_traffic,
    app_breakdown: Object.keys(app_breakdown).length ? app_breakdown : { Direct: sms.length }
  });
});

app.get('/api/sms/client-stats', (req, res) => {
  const sms = getScopedSmsList(req);
  res.json({
    total: sms.length,
    delivered: sms.filter(s => s.status === 'delivered').length,
    failed: sms.filter(s => s.status === 'failed').length
  });
});

// ── Settings & Permissions ────────────────────────────────────
app.get('/api/settings', (req, res) => {
  try {
    let settings = readDb('settings');
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      settings = {};
    }
    const masterPayterms = getMasterPayterms();
    settings.payterms = masterPayterms;
    const user = getSessionUser(req);
    const isOwner = user && (String(user.role).toLowerCase() === 'owner' || String(user.role).toLowerCase() === 'admin');
    if (isOwner) {
      return res.json(settings);
    }
    const safeSettings = {
      site_name: settings.site_name || 'HUMEX SMS',
      site_title: settings.site_title || 'HUMEX SMS',
      logo_url: settings.logo_url || '',
      logo_data: settings.logo_data || '',
      favicon_url: settings.favicon_url || '',
      header_gradient: settings.header_gradient || '',
      header_gradient_preset: settings.header_gradient_preset || '',
      header_text_color: settings.header_text_color || '#ffffff',
      header_font_weight: settings.header_font_weight || '700',
      grad_color_1: settings.grad_color_1 || '',
      grad_stop_1: settings.grad_stop_1 || 0,
      grad_color_2: settings.grad_color_2 || '',
      grad_stop_2: settings.grad_stop_2 || 50,
      grad_color_3: settings.grad_color_3 || '',
      grad_stop_3: settings.grad_stop_3 || 100,
      grad_angle: settings.grad_angle || '180deg',
      theme_color: settings.theme_color || '#166534',
      theme_mode: settings.theme_mode || 'dark',
      font_family: settings.font_family || 'roboto',
      tagline: settings.tagline || '',
      footer_text: settings.footer_text || '',
      default_currency: settings.default_currency || 'USD',
      currency: settings.currency || 'USD',
      payterms: masterPayterms
    };
    res.json(safeSettings);
  } catch (err) {
    console.error('Error in /api/settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.post('/api/settings', (req, res) => {
  const sessionUser = req.sessionUser || getSessionUser(req);
  const sRole = sessionUser ? (sessionUser.role || '').toLowerCase() : '';
  const isOwner = sRole === 'owner' || sRole === 'admin';
  if (!isOwner) {
    return res.status(403).json({ error: 'Forbidden. Owner only.' });
  }
  const settings = readDb('settings') || {};
  if (req.body.payterms !== undefined) {
    if (!Array.isArray(req.body.payterms) || req.body.payterms.length === 0) {
      return res.status(400).json({ error: 'payterms must be a non-empty array of strings' });
    }
    const cleaned = Array.from(new Set(req.body.payterms.map(s => normalizePaytermKey(String(s).trim())).filter(Boolean)));
    if (!cleaned.length) {
      return res.status(400).json({ error: 'payterms cannot be empty' });
    }
    req.body.payterms = cleaned;
  }
  const updated = { ...settings, ...req.body };
  writeDb('settings', updated);
  syncSmppServerFromSettings(updated);
  broadcastWs({ type: 'brand_theme_updated', settings: updated });
  broadcastWs({ type: 'brand_updated', settings: updated });
  broadcastWs({ type: 'settings_updated', settings: updated });
  res.json(updated);
});

// Dedicated Payterms Endpoints (R2)
app.get('/api/payterms', (req, res) => {
  res.json({ payterms: getMasterPayterms() });
});

app.post('/api/payterms', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser?.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  if (!isOwner) return res.status(403).json({ error: 'Forbidden. Owner only.' });

  const rawList = Array.isArray(req.body) ? req.body : (req.body && req.body.payterms);
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return res.status(400).json({ error: 'payterms must be a non-empty array of strings' });
  }
  const cleaned = Array.from(new Set(rawList.map(s => normalizePaytermKey(String(s).trim())).filter(Boolean)));
  if (!cleaned.length) return res.status(400).json({ error: 'payterms cannot be empty' });

  const settings = readDb('settings') || {};
  settings.payterms = cleaned;
  writeDb('settings', settings);
  res.json({ success: true, payterms: cleaned });
});

app.put('/api/payterms', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser?.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  if (!isOwner) return res.status(403).json({ error: 'Forbidden. Owner only.' });

  const rawList = Array.isArray(req.body) ? req.body : (req.body && req.body.payterms);
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return res.status(400).json({ error: 'payterms must be a non-empty array of strings' });
  }
  const cleaned = Array.from(new Set(rawList.map(s => normalizePaytermKey(String(s).trim())).filter(Boolean)));
  if (!cleaned.length) return res.status(400).json({ error: 'payterms cannot be empty' });

  const settings = readDb('settings') || {};
  settings.payterms = cleaned;
  writeDb('settings', settings);
  res.json({ success: true, payterms: cleaned });
});

// ── Custom Theme Presets API (Create, List, Delete) ─────────────
app.post('/api/settings/presets', (req, res) => {
  try {
    const { key, name, c1, s1, c2, s2, c3, s3, a, txt, desc } = req.body || {};
    if (!name || !c1 || !c2 || !c3) {
      return res.status(400).json({ error: 'Missing preset parameters (name, colors)' });
    }
    const presetKey = key || ('custom_' + Date.now());
    if (presetKey === 'dark_green') {
      return res.status(400).json({ error: 'The Primary Default preset is locked and cannot be modified' });
    }
    const settings = readDb('settings') || {};
    const customPresets = Array.isArray(settings.custom_presets) ? [...settings.custom_presets] : [];
    const existingIdx = customPresets.findIndex(p => p.key === presetKey);
    const newPreset = {
      key: presetKey,
      name: name.trim(),
      desc: desc ? desc.trim() : `${c1} • ${c2} • ${c3}`,
      c1, s1: s1 !== undefined ? parseInt(s1) : 0,
      c2, s2: s2 !== undefined ? parseInt(s2) : 50,
      c3, s3: s3 !== undefined ? parseInt(s3) : 100,
      a: a || '180deg',
      txt: txt || '#ffffff',
      isCustom: true
    };
    if (existingIdx >= 0) {
      customPresets[existingIdx] = newPreset;
    } else {
      customPresets.push(newPreset);
    }
    settings.custom_presets = customPresets;

    // Remove from deleted_preset_keys if it was previously marked deleted
    if (Array.isArray(settings.deleted_preset_keys)) {
      settings.deleted_preset_keys = settings.deleted_preset_keys.filter(k => k !== presetKey);
    }

    writeDb('settings', settings);
    broadcastWs({ type: 'brand_theme_updated', settings });
    res.json({ success: true, preset: newPreset, settings });
  } catch (err) {
    console.error('Error in /api/settings/presets POST:', err);
    res.status(500).json({ error: 'Failed to create preset' });
  }
});

app.delete('/api/settings/presets/:key', (req, res) => {
  try {
    const key = req.params.key;
    if (!key || key === 'dark_green') {
      return res.status(400).json({ error: 'The Primary Default preset is locked and cannot be deleted.' });
    }
    const settings = readDb('settings') || {};
    let customPresets = Array.isArray(settings.custom_presets) ? settings.custom_presets : [];
    customPresets = customPresets.filter(p => p.key !== key);
    settings.custom_presets = customPresets;

    const deletedKeys = Array.isArray(settings.deleted_preset_keys) ? [...settings.deleted_preset_keys] : [];
    if (!deletedKeys.includes(key)) {
      deletedKeys.push(key);
    }
    settings.deleted_preset_keys = deletedKeys;

    // If the active preset was the one deleted, fall back to the primary default dark_green
    if (settings.header_gradient_preset === key) {
      settings.header_gradient_preset = 'dark_green';
      settings.header_gradient = 'linear-gradient(180deg, #1b4332 0%, #143627 50%, #081c15 100%)';
      settings.grad_color_1 = '#1b4332';
      settings.grad_stop_1 = 0;
      settings.grad_color_2 = '#143627';
      settings.grad_stop_2 = 50;
      settings.grad_color_3 = '#081c15';
      settings.grad_stop_3 = 100;
      settings.grad_angle = '180deg';
    }

    writeDb('settings', settings);
    broadcastWs({ type: 'brand_theme_updated', settings });
    res.json({ success: true, key, settings });
  } catch (err) {
    console.error('Error in /api/settings/presets DELETE:', err);
    res.status(500).json({ error: 'Failed to delete preset' });
  }
});

app.post('/api/settings/upload-logo', (req, res) => {
  try {
    const image = (req.body && (req.body.image || req.body.logo || req.body.data)) || '';
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }

    let ext = 'png';
    let base64Payload = image.trim();
    if (base64Payload.startsWith('data:')) {
      const commaIdx = base64Payload.indexOf(',');
      if (commaIdx !== -1) {
        const header = base64Payload.slice(0, commaIdx).toLowerCase();
        if (header.includes('jpeg') || header.includes('jpg')) ext = 'jpg';
        else if (header.includes('svg')) ext = 'svg';
        else if (header.includes('webp')) ext = 'webp';
        else if (header.includes('gif')) ext = 'gif';
        base64Payload = base64Payload.slice(commaIdx + 1);
      }
    }

    base64Payload = base64Payload.replace(/\s+/g, '');
    const buffer = Buffer.from(base64Payload, 'base64');
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid image data' });
    }

    const imgDir = path.join(STATIC_DIR, 'img');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

    const filename = `custom-logo.${ext}`;
    const filePath = path.join(imgDir, filename);
    fs.writeFileSync(filePath, buffer);

    // Also persist custom logo into uploadsDir (DATA_DIR/uploads) so it survives VPS code updates
    try {
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);
      fs.writeFileSync(path.join(uploadsDir, 'custom-logo.png'), buffer);
    } catch (_) {}

    // Also maintain custom-logo.png and sync all fallbacks so old logos never persist
    try {
      fs.writeFileSync(path.join(imgDir, 'custom-logo.png'), buffer);
      fs.writeFileSync(path.join(imgDir, 'humex-sms-logo.png'), buffer);
      fs.writeFileSync(path.join(imgDir, 'humax-sms-logo.png'), buffer);
      fs.writeFileSync(path.join(imgDir, 'humex-sms-dp.jpg'), buffer);
      const b64 = buffer.toString('base64');
      const dataUri = `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${b64}`;
      const svgFallback = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%"><image href="${dataUri}" width="1024" height="1024" /></svg>\n`;
      fs.writeFileSync(path.join(imgDir, 'humex-sms-circle-logo.svg'), svgFallback);
      fs.writeFileSync(path.join(imgDir, 'humex-sms-logo.svg'), svgFallback);
      fs.writeFileSync(path.join(imgDir, 'custom-logo.svg'), svgFallback);
    } catch(e) {}

    const logoUrl = `/static/img/${filename}?v=${Date.now()}`;
    const settings = readDb('settings') || {};
    settings.logo_url = logoUrl;
    settings.logo_data = `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${base64Payload}`;
    writeDb('settings', settings);

    broadcastWs({ type: 'brand_theme_updated', settings });
    broadcastWs({ type: 'brand_updated', settings });
    broadcastWs({ type: 'settings_updated', settings });

    return res.json({ success: true, logo_url: logoUrl, settings });
  } catch (err) {
    console.error('Error uploading logo:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to upload logo' });
  }
});

app.get('/api/settings/min-payout', (req, res) => {
  const settings = readDb('settings') || {};
  res.json({ min_payout: Number(settings.min_payout || 0) });
});

app.get('/api/permissions', (req, res) => {
  res.json(readDb('permissions') || {});
});

app.post('/api/permissions', (req, res) => {
  writeDb('permissions', req.body || {});
  res.json({ success: true });
});

app.get('/api/webhook/config', (req, res) => {
  res.json(readDb('webhook_config') || {});
});

app.post('/api/webhook/config', (req, res) => {
  const current = readDb('webhook_config') || {};
  const updated = { ...current, ...req.body };
  writeDb('webhook_config', updated);
  res.json({ success: true, data: updated });
});

app.post('/api/webhook/test', (req, res) => {
  res.json({ success: true, message: 'Webhook test received' });
});

// ── System Backup & Restore ──────────────────────────────────
app.get('/api/backup/export', (req, res) => {
  try {
    const settings = readDb('settings') || {};
    const siteName = (settings.site_name || 'HUMEX SMS').trim();
    const safePrefix = siteName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'alpha_sms';
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${safePrefix}_backup_${dateStr}.zip`;

    const zip = new AdmZip();

    if (fs.existsSync(DATA_DIR)) {
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && !f.includes('.tmp.'));
      for (const f of files) {
        const fullPath = path.join(DATA_DIR, f);
        try {
          const content = fs.readFileSync(fullPath);
          zip.addFile(`data/${f}`, content);
        } catch (readErr) {
          console.warn(`Could not read ${f} for backup:`, readErr.message);
        }
      }

      const manifest = {
        app: siteName,
        exported_at: new Date().toISOString(),
        files: files
      };
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    }

    const zipBuffer = zip.toBuffer();

    try {
      const auditLogs = readDb('audit_logs') || [];
      auditLogs.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        timestamp: new Date().toISOString(),
        user: 'Admin',
        action: 'Backup Exported',
        detail: `Downloaded full system backup (${filename})`,
        module: 'System',
        ip: req.ip || '127.0.0.1'
      });
      writeDb('audit_logs', auditLogs.slice(0, 2000));
    } catch (_) {}

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    return res.end(zipBuffer);
  } catch (err) {
    console.error('Error in /api/backup/export:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Export failed: ' + err.message });
    }
  }
});

// ── Direct Project Codebase Zip Download ───────────────────────
app.get(['/api/download-project-zip', '/download-project', '/api/project/download-zip'], requireAuth, requireApiRole(['owner', 'admin']), (req, res) => {
  try {
    const settings = readDb('settings') || {};
    const siteName = (settings.site_name || 'HUMEX SMS').trim();
    const safePrefix = siteName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'humex_sms';
    const downloadFilename = `humex-sms-complete-project.zip`;

    const distDir = path.join(__dirname, 'dist');
    let zipPath = null;
    if (fs.existsSync(distDir)) {
      const zips = fs.readdirSync(distDir).filter(f => f.startsWith('humex-sms-vps-') && f.endsWith('.zip')).sort().reverse();
      if (zips.length > 0) zipPath = path.join(distDir, zips[0]);
    }
    if (!zipPath || !fs.existsSync(zipPath)) {
      return res.status(404).json({ error: 'Production VPS package not found in dist/. Please run build script first.' });
    }
    const stat = fs.statSync(zipPath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    res.setHeader('Content-Length', stat.size);
    const readStream = fs.createReadStream(zipPath);
    return readStream.pipe(res);
  } catch (err) {
    console.error('Error downloading project zip:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Download failed: ' + err.message });
    }
  }
});

app.post('/api/backup/restore', upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Please upload a .zip backup file' });
    }

    let zip;
    try {
      zip = new AdmZip(req.file.buffer);
    } catch (e) {
      return res.status(400).json({ error: 'That file is not a valid zip archive' });
    }

    const zipEntries = zip.getEntries();
    const jsonEntries = zipEntries.filter(entry => {
      const name = entry.entryName;
      return !entry.isDirectory && (name.startsWith('data/') || !name.includes('/')) && name.endsWith('.json') && !name.endsWith('manifest.json');
    });

    if (jsonEntries.length === 0) {
      return res.status(400).json({ error: 'No valid data JSON files found inside this backup' });
    }

    const safetyDir = path.join(BACKUP_DIR, 'before_restore_' + new Date().toISOString().replace(/[:.]/g, '-'));
    try {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.cpSync(DATA_DIR, safetyDir, { recursive: true, filter: src => !src.includes(`${path.sep}archive`) });
      const old = fs.readdirSync(BACKUP_DIR).filter(n => n.startsWith('before_restore_')).sort().reverse().slice(3);
      for (const n of old) fs.rmSync(path.join(BACKUP_DIR, n), { recursive: true, force: true });
    } catch (e) {
      console.warn('Safety copy warning:', e.message);
    }

    const restored = [];
    for (const entry of jsonEntries) {
      const fileName = path.basename(entry.entryName);
      if (!fileName.endsWith('.json')) continue;
      try {
        const rawContent = entry.getData().toString('utf8');
        const parsed = JSON.parse(rawContent);
        const targetPath = path.join(DATA_DIR, fileName);
        fs.writeFileSync(targetPath, rawContent, 'utf8');

        const dbName = fileName.replace(/\.json$/, '');
        DB_CACHE.set(dbName, parsed);
        DB_MTIME.set(dbName, Date.now());
        restored.push(fileName);
      } catch (entryErr) {
        console.warn(`Skipping invalid JSON file ${entry.entryName}:`, entryErr.message);
      }
    }

    try {
      const auditLogs = readDb('audit_logs') || [];
      auditLogs.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        timestamp: new Date().toISOString(),
        user: 'Admin',
        action: 'Backup Restored',
        detail: `Restored ${restored.length} file(s) from uploaded backup`,
        module: 'System',
        ip: req.ip || '127.0.0.1'
      });
      writeDb('audit_logs', auditLogs.slice(0, 2000));
    } catch (_) {}

    return res.json({ success: true, restored_files: restored.length, files: restored });
  } catch (err) {
    console.error('Error restoring backup:', err);
    return res.status(500).json({ error: 'Failed to restore backup: ' + err.message });
  }
});

// ── Search (Scoped by Role & Sanitized with safeUser) ───────────
app.get('/api/search', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  const isManager = sRole === 'manager';
  const isAgent = sRole === 'agent';
  const isClient = sRole === 'client';

  const q = (req.query.q || '').trim().toLowerCase();
  if (q.length < 2) {
    return res.json({ numbers: [], clients: [], agents: [], managers: [] });
  }

  let allNumbers = readDb('numbers') || [];
  let allClients = readDb('clients') || [];
  let allAgents = readDb('agents') || [];
  let allManagers = (readDb('users') || []).filter(u => (u.role || '').toLowerCase() === 'manager');

  if (isManager) {
    const mgrAgents = new Set(allAgents.filter(a => Number(a.manager_id) === Number(sessionUser.id) || String(a.manager_username || '').toLowerCase() === String(sessionUser.username).toLowerCase()).map(a => Number(a.id)));
    allAgents = allAgents.filter(a => Number(a.manager_id) === Number(sessionUser.id) || String(a.manager_username || '').toLowerCase() === String(sessionUser.username).toLowerCase());
    allClients = allClients.filter(c => Number(c.manager_id) === Number(sessionUser.id) || (c.agent_id && mgrAgents.has(Number(c.agent_id))));
    allNumbers = allNumbers.filter(n => Number(n.manager_id) === Number(sessionUser.id));
    allManagers = allManagers.filter(u => String(u.username).toLowerCase() === String(sessionUser.username).toLowerCase());
  } else if (isAgent) {
    allAgents = allAgents.filter(a => String(a.username).toLowerCase() === String(sessionUser.username).toLowerCase() || Number(a.id) === Number(sessionUser.id));
    allClients = allClients.filter(c => Number(c.agent_id) === Number(sessionUser.id) || String(c.agent_username || '').toLowerCase() === String(sessionUser.username).toLowerCase());
    allNumbers = allNumbers.filter(n => Number(n.agent_id) === Number(sessionUser.id));
    allManagers = [];
  } else if (isClient) {
    allAgents = [];
    allManagers = [];
    allClients = allClients.filter(c => String(c.username).toLowerCase() === String(sessionUser.username).toLowerCase() || Number(c.id) === Number(sessionUser.id));
    allNumbers = allNumbers.filter(n => Number(n.client_id) === Number(sessionUser.id) || (n.user && String(n.user).toLowerCase() === String(sessionUser.username).toLowerCase()));
  }

  const numbers = allNumbers.filter(n => (n.number || '').toLowerCase().includes(q)).slice(0, 10);
  const clients = allClients.filter(c => (c.username || '').toLowerCase().includes(q)).slice(0, 10).map(safeUser);
  const agents = allAgents.filter(a => (a.username || '').toLowerCase().includes(q)).slice(0, 10).map(safeUser);
  const managers = allManagers.filter(u => (u.username || '').toLowerCase().includes(q)).slice(0, 10).map(safeUser);

  res.json({ numbers, clients, agents, managers });
});

app.get('/api/reports/business', (req, res) => {
  let sms = readDb('sms_log') || [];
  const { date_from, date_to } = req.query;

  if (date_from) {
    const df = String(date_from).trim().slice(0, 19);
    sms = sms.filter(s => (s.timestamp || '').replace('T', ' ') >= df);
  }
  if (date_to) {
    let dt = String(date_to).trim().slice(0, 19);
    if (dt.length === 10) dt = dt + ' 23:59:59';
    sms = sms.filter(s => (s.timestamp || '').replace('T', ' ') <= dt);
  }

  const delivered = sms.filter(s => s.status === 'delivered' || s.status === 'success');
  const failed = sms.filter(s => s.status !== 'delivered' && s.status !== 'success');

  const total_revenue = Math.round(sms.reduce((sum, s) => {
    const rev = parseFloat(s.carrier_revenue ?? s.profit ?? s.payout ?? 0) || 0;
    return sum + rev;
  }, 0) * 100) / 100;

  const clients = readDb('clients') || [];
  const agents = readDb('agents') || [];

  const clientToAgent = {};
  clients.forEach(c => {
    if (c && c.username) clientToAgent[String(c.username).toLowerCase()] = c.agent_id;
  });

  const agentNames = {};
  agents.forEach(a => {
    if (a && a.id) agentNames[a.id] = a.username || a.name || `Agent #${a.id}`;
  });

  const agentTotals = {};
  for (const s of sms) {
    let aid = s.agent_id;
    if (!aid && s.user && clientToAgent[String(s.user).toLowerCase()]) {
      aid = clientToAgent[String(s.user).toLowerCase()];
    }
    const agentName = aid ? (agentNames[aid] || `Agent #${aid}`) : (s.agent || s.user || 'Direct');
    if (!agentTotals[agentName]) {
      agentTotals[agentName] = { agent: agentName, sms_count: 0, revenue: 0 };
    }
    agentTotals[agentName].sms_count++;
    const p = parseFloat(s.profit ?? s.payout ?? 0) || 0;
    agentTotals[agentName].revenue = Math.round((agentTotals[agentName].revenue + p) * 100) / 100;
  }

  const top_agents = Object.values(agentTotals)
    .sort((a, b) => b.revenue - a.revenue || b.sms_count - a.sms_count)
    .slice(0, 10);

  const numberTotals = {};
  for (const s of sms) {
    const num = s.number;
    if (!num) continue;
    numberTotals[num] = (numberTotals[num] || 0) + 1;
  }

  const top_numbers = Object.entries(numberTotals)
    .map(([number, sms_count]) => ({ number, sms_count }))
    .sort((a, b) => b.sms_count - a.sms_count)
    .slice(0, 10);

  const dailyMap = {};
  for (const s of sms) {
    const day = (s.timestamp || '').slice(0, 10);
    if (!day) continue;
    if (!dailyMap[day]) {
      dailyMap[day] = { date: day, total: 0, delivered: 0, failed: 0, revenue: 0 };
    }
    dailyMap[day].total++;
    if (s.status === 'delivered' || s.status === 'success') {
      dailyMap[day].delivered++;
    } else {
      dailyMap[day].failed++;
    }
    const rev = parseFloat(s.carrier_revenue ?? s.profit ?? s.payout ?? 0) || 0;
    dailyMap[day].revenue = Math.round((dailyMap[day].revenue + rev) * 100) / 100;
  }
  const daily_breakdown = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

  res.json({
    date_from: date_from || 'all-time',
    date_to: date_to || 'now',
    total_sms: sms.length,
    delivered: delivered.length,
    failed: failed.length,
    success_rate: Math.round((delivered.length / Math.max(sms.length, 1)) * 1000) / 10,
    total_revenue,
    top_agents,
    top_numbers,
    daily_breakdown
  });
});

app.get('/api/firewall/stats', (req, res) => {
  const blocked = readDb('blocked_ips') || [];
  const events = readDb('firewall_events') || [];
  res.json({
    blocked_count: blocked.length,
    events_count: events.length,
    active_threats: events.filter(e => e.severity === 'high').length
  });
});

app.get('/api/smpp/server-info', (req, res) => {
  const settings = readDb('settings') || {};
  const sessions = readDb('smpp_sessions') || [];
  const listening = Boolean(smppServerState.listening && smppServerInstance);
  res.json({
    host: smppServerState.host || settings.smpp_host || '0.0.0.0',
    port: smppServerState.port || settings.smpp_port || 2775,
    status: listening ? 'online' : (smppServerState.last_error ? 'error' : 'offline'),
    listening,
    started_at: smppServerState.started_at,
    last_error: smppServerState.last_error,
    bound_connections: sessions.length,
    accounts_count: (readDb('smpp_accounts') || []).length,
    active_sessions: sessions.length
  });
});

app.get('/api/smpp/throughput', (req, res) => {
  res.json(getSmppThroughputStats());
});

app.get('/api/smpp/dlr', (req, res) => {
  const sms = readDb('sms_log') || [];
  const delivered = sms.filter(s => (s.status || '').toLowerCase() === 'delivered').length;
  const pending = sms.filter(s => (s.status || '').toLowerCase() === 'pending').length;
  const failed = sms.filter(s => (s.status || '').toLowerCase() === 'failed').length;

  const now = Date.now();
  const hourlyData = [];
  for (let i = 23; i >= 0; i--) {
    const startHour = now - (i + 1) * 3600000;
    const endHour = now - i * 3600000;
    const inHour = sms.filter(s => {
      const t = new Date(s.timestamp || s.date || 0).getTime();
      return t >= startHour && t < endHour;
    });
    const delivInHour = inHour.filter(s => (s.status || '').toLowerCase() === 'delivered').length;
    const rate = inHour.length > 0 ? Math.round((delivInHour / inHour.length) * 100) : 0;
    hourlyData.push(rate);
  }

  res.json({
    dlr_rate: sms.length ? Math.round((delivered / sms.length) * 100) : 0,
    delivered,
    pending,
    failed,
    data: hourlyData
  });
});

// CSV Download for Numbers
app.get('/api/numbers/download', (req, res) => {
  const numbers = readDb('numbers') || [];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="numbers.csv"');
  let csv = 'ID,Number,Country,Provider,Service,Status,Manager,Agent,Client,Created\n';
  numbers.forEach(n => {
    csv += `"${n.id || ''}","${n.number || ''}","${n.country || ''}","${n.provider || ''}","${n.app || ''}","${n.status || ''}","${n.manager_id || ''}","${n.agent_id || ''}","${n.client_id || ''}","${n.created || ''}"\n`;
  });
  res.send(csv);
});

// Inbound Carrier / Webhook SMS API
app.all(['/api/sms/inbound', '/api/inbound', '/api/sms/receive'], (req, res) => {
  const p = { ...(req.query || {}), ...(req.body || {}) };

  const sender = p.from || p.sender || p.cli || p.source || '';
  const to_number = p.to || p.recipient || p.number || p.num || p.fnum || '';

  let message = p.message || p.msg || p.text || p.body || '';
  if (!message && p.msg64base) {
    try {
      message = Buffer.from(p.msg64base, 'base64').toString('utf-8');
    } catch (e) {
      message = p.msg64base;
    }
  }

  const sms_id = p.sms_id || p.uuid || p.id || '';
  const company = p.company || p.system_id || p.provider || '';
  const inboundRate = extractCrApiRate(p);
  const inboundCompanyRate = parseRateValue(p.company_rate ?? p.company_cost ?? p.cost ?? p.carrier_rate);

  if (!to_number) {
    return res.status(400).json({ status: 'error', error: 'Missing destination number (to)' });
  }
  if (!String(message || '').trim()) {
    return res.status(400).json({ status: 'error', error: 'Missing message text' });
  }

  const result = ingestSms({
    sender,
    to_number,
    message: String(message).slice(0, 2000),
    sms_id,
    company,
    provider: p.provider || company || '',
    range: p.range || p.range_name || p.range_label || '',
    country: p.country || '',
    currency: p.currency || '',
    payout: Number.isFinite(inboundRate) ? inboundRate : undefined,
    company_rate: Number.isFinite(inboundCompanyRate) ? inboundCompanyRate : undefined,
    source: 'inbound_http'
  });

  res.json(result);
});

// ── WebSockets ────────────────────────────────────────────────

function getReqIp(req) {
  if (!req) return '127.0.0.1';
  if (req.ip) return req.ip;
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff && typeof xff === 'string') {
    return xff.split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

server.prependListener('upgrade', (req, socket) => {
  const ip = getReqIp(req);
  if (isIpBlocked(ip)) {
    logFirewallEvent(ip, 'WebSocket Handshake Blocked', req.url || '/ws');
    try {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
    } catch (_) {}
  }
});

const wsConnPerIp = new Map();
function wsOriginAllowed(req) {
  const origin = req && req.headers && req.headers.origin;
  if (!origin) return true; // non-browser clients
  try { if (new URL(origin).host === req.headers.host) return true; } catch (e) { return false; }
  return String(process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean).includes(origin);
}
wss.on('connection', (ws, req) => {
  const ip = getReqIp(req);
  if (isIpBlocked(ip)) {
    logFirewallEvent(ip, 'WebSocket Blocked IP Attempt', '/ws');
    try { ws.close(1008, 'ip blocked'); } catch (e) { /* ignore */ }
    return;
  }
  const user = req ? getSessionUser(req) : null;
  if (!user || !wsOriginAllowed(req)) { try { ws.close(1008, 'unauthorized'); } catch (e) { /* ignore */ } return; }
  const open = wsConnPerIp.get(ip) || 0;
  if (open >= 10) { try { ws.close(1013, 'too many connections'); } catch (e) { /* ignore */ } return; }
  wsConnPerIp.set(ip, open + 1);
  // The live-feed routing in broadcastWs relies on this (Owner: all; others: only their own id)
  ws.user = { id: user.id, role: user.role, username: user.username };
  const now = new Date().toISOString();
  ws.send(JSON.stringify({ type: 'connected', time: now, timestamp: now }));
  ws.on('error', () => { /* ignore unhandled socket drops */ });
  const interval = setInterval(() => {
    if (ws.readyState === 1) {
      const ts = new Date().toISOString();
      const live = liveTrafficStats();
      const cachedLog = DB_CACHE.get('sms_log');
      const totalCount = Array.isArray(cachedLog) ? cachedLog.length : (readDb('sms_log') || []).length;
      ws.send(JSON.stringify({
        type: 'heartbeat',
        time: ts,
        timestamp: ts,
        mps: live.mps,
        total: totalCount,
        success_rate: live.success_rate,
        dlr: live.dlr
      }));
    }
  }, 3000);
  ws.on('close', () => { clearInterval(interval); wsConnPerIp.set(ip, Math.max(0, (wsConnPerIp.get(ip) || 1) - 1)); });
});

// ── Read-Only Owner Orphans Report (Fix 12) ───────────────────
app.get('/api/reports/orphans', requireAuth, (req, res) => {
  const sessionUser = req.sessionUser;
  const sRole = (sessionUser.role || '').toLowerCase();
  const isOwner = sRole === 'owner' || sRole === 'admin';
  if (!isOwner) {
    return res.status(403).json({ error: 'Forbidden. Owner permissions required.' });
  }

  const users = readDb('users') || [];
  const agents = readDb('agents') || [];
  const clients = readDb('clients') || [];
  const numbers = readDb('numbers') || [];

  const managerIds = new Set(users.filter(u => (u.role || '').toLowerCase() === 'manager').map(u => Number(u.id)));
  const agentIds = new Set(agents.map(a => Number(a.id)));
  const clientIds = new Set(clients.map(c => Number(c.id)));

  const orphanedAgents = agents.filter(a => a.manager_id && !managerIds.has(Number(a.manager_id)));
  const orphanedClients = clients.filter(c => {
    const hasMissingAgent = c.agent_id && !agentIds.has(Number(c.agent_id));
    const hasMissingManager = c.manager_id && !managerIds.has(Number(c.manager_id));
    return hasMissingAgent || hasMissingManager;
  });
  const orphanedNumbers = numbers.filter(n => {
    if (n.fixed_for_test || n.is_test_panel || isTestNumber(n.number)) return false;
    const hasMissingClient = n.client_id && !clientIds.has(Number(n.client_id));
    const hasMissingAgent = n.agent_id && !agentIds.has(Number(n.agent_id));
    const hasMissingManager = n.manager_id && !managerIds.has(Number(n.manager_id));
    return hasMissingClient || hasMissingAgent || hasMissingManager;
  });

  res.json({
    success: true,
    summary: {
      orphaned_agents_count: orphanedAgents.length,
      orphaned_clients_count: orphanedClients.length,
      orphaned_numbers_count: orphanedNumbers.length
    },
    orphaned_agents: orphanedAgents,
    orphaned_clients: orphanedClients,
    orphaned_numbers: orphanedNumbers
  });
});

// ── CRITICAL: Safe API 404 handler (Must ALWAYS return JSON, never HTML) ─────
app.all('/api/*', (req, res) => {
  console.warn(`[404 NOT FOUND] ${req.method} ${req.originalUrl || req.url || req.path}`);
  res.status(404).json({ error: 'Endpoint not found', path: req.path, method: req.method });
});

// Fallback for HTML routing
app.use((req, res) => {
  if (req.accepts('html')) {
    sendInjectedHtml(res, path.join(STATIC_DIR, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ── Read-Only Orphaned Numbers Check (Fix 12: Do NOT delete automatically) ──
function cleanupOrphanedNumbers() {
  try {
    const ranges = readDb('sms_ranges') || [];
    if (!Array.isArray(ranges) || ranges.length === 0) return;
    const validRangeIds = new Set(ranges.map(r => Number(r.id)));
    const numbers = readDb('numbers') || [];
    if (!Array.isArray(numbers) || numbers.length === 0) return;
    const orphanCount = numbers.filter(n => n.range_id && !validRangeIds.has(Number(n.range_id))).length;
    if (orphanCount > 0) {
      console.log(`[Audit Check] Notice: ${orphanCount} number(s) reference non-existent ranges (read-only audit, preserved).`);
    }
  } catch (err) {
    console.error('cleanupOrphanedNumbers error:', err);
  }
}

const BIND_HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, BIND_HOST, () => {
  initSmppEngine();
  runPaytermMigration();
  cleanupOrphanedNumbers();
  syncTestNumbersWithNumbersPool();
  console.log(`[HUMEX SMS] Server running on http://${BIND_HOST}:${PORT}`);
  console.log(`  ➜  Local:   http://localhost:${PORT}/`);
  console.log(`  ➜  Network: http://${BIND_HOST}:${PORT}/`);
});
