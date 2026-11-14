#!/usr/bin/env node
/**
 * CLI Script: Reset Owner Password
 * Usage: node reset-owner-password.js "NewPassword"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const newPassword = process.argv[2];

if (!newPassword || String(newPassword).trim().length < 6) {
  console.error('Error: Please provide a new password with at least 6 characters.');
  console.error('Usage: node reset-owner-password.js "NewPassword"');
  process.exit(1);
}

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'humex-sms', 'data');
const usersFile = path.join(dataDir, 'users.json');
const sessionsFile = path.join(dataDir, 'sessions.json');

if (!fs.existsSync(usersFile)) {
  console.error(`Error: users.json not found at ${usersFile}`);
  process.exit(1);
}

try {
  const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  let ownerIndex = users.findIndex(u => {
    if (!u) return false;
    const name = String(u.username || '').toLowerCase();
    const role = String(u.role || '').toLowerCase();
    return name === 'kamran_bhatti' || role === 'owner';
  });

  if (ownerIndex === -1) {
    console.error('Error: Owner user (Kamran_Bhatti / role Owner) not found in users.json');
    process.exit(1);
  }

  const hashedPassword = bcrypt.hashSync(String(newPassword).trim(), 10);
  users[ownerIndex].password = hashedPassword;
  users[ownerIndex].updated_at = new Date().toISOString();

  // Atomic write to users.json
  const tmpUsers = usersFile + '.tmp';
  fs.writeFileSync(tmpUsers, JSON.stringify(users, null, 2), 'utf8');
  fs.renameSync(tmpUsers, usersFile);

  // Clear all sessions
  if (fs.existsSync(sessionsFile)) {
    fs.writeFileSync(sessionsFile, JSON.stringify({}, null, 2), 'utf8');
  }

  console.log(`[HUMEX SMS] Successfully updated password for Owner (${users[ownerIndex].username})`);
  console.log('[HUMEX SMS] All active sessions have been cleared.');
} catch (err) {
  console.error('Failed to reset owner password:', err.message);
  process.exit(1);
}
