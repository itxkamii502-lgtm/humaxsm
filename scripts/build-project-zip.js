import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Date stamp YYYYMMDD
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const dateStr = `${year}${month}${day}`;

const DIST_DIR = path.join(ROOT_DIR, 'dist');
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Clean up older vps zips in dist/
const oldZips = fs.readdirSync(DIST_DIR).filter(f => f.startsWith('humex-sms-vps-') && f.endsWith('.zip'));
for (const oldZip of oldZips) {
  try {
    fs.unlinkSync(path.join(DIST_DIR, oldZip));
    console.log(`Cleaned older build archive: dist/${oldZip}`);
  } catch (e) {}
}

const OUTPUT_ZIP = path.join(DIST_DIR, `humex-sms-vps-${dateStr}.zip`);

// Strict Whitelist
const ROOT_FILES_WHITELIST = [
  'server.js',
  'ecosystem.config.cjs',
  'reset-owner-password.js',
  'README.md',
  'VPS_DEPLOYMENT_GUIDE.md',
  'STEP_BY_STEP_VPS_GUIDE.md',
  'RENAME_MAP.md'
];

// Production-only package.json with the 8 proven runtime dependencies
const RUNTIME_PKG = {
  name: 'humex-sms',
  private: true,
  version: '1.0.0',
  type: 'module',
  scripts: {
    start: 'node server.js --port 3000',
    lint: 'node --check server.js'
  },
  dependencies: {
    'adm-zip': '^0.6.1',
    'bcryptjs': '^3.0.3',
    'compression': '^1.8.2',
    'express': '^4.21.2',
    'multer': '^2.4.0',
    'qrcode': '^1.5.4',
    'smpp': '0.5.0',
    'ws': '^8.18.0'
  }
};

try {
  console.log(`Building production package: dist/humex-sms-vps-${dateStr}.zip...`);
  const zip = new AdmZip();

  // 1. Add whitelisted root files directly from workspace
  for (const rel of ROOT_FILES_WHITELIST) {
    const fullPath = path.join(ROOT_DIR, rel);
    if (fs.existsSync(fullPath)) {
      const buf = fs.readFileSync(fullPath);
      zip.addFile(rel, buf);
      console.log(`  + [WHITELIST] ${rel}`);
    } else {
      console.warn(`  ! [MISSING] Whitelisted file not found: ${rel}`);
    }
  }

  // 2. Add pruned runtime-only package.json
  const pkgJsonStr = JSON.stringify(RUNTIME_PKG, null, 2) + '\n';
  zip.addFile('package.json', Buffer.from(pkgJsonStr, 'utf8'));
  console.log('  + [RUNTIME PKG] package.json (8 runtime dependencies)');

  // 3. Add humex-sms/static/** (HTML, JS, CSS, IMG, ICONS)
  const staticDir = path.join(ROOT_DIR, 'humex-sms', 'static');
  function addStaticFiles(dir, subDir = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const relZipPath = subDir ? `${subDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        addStaticFiles(full, relZipPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.tmp') || entry.name.endsWith('.bak') || entry.name.endsWith('.zip')) {
          continue;
        }
        const buf = fs.readFileSync(full);
        zip.addFile(`humex-sms/static/${relZipPath}`, buf);
      }
    }
  }

  if (fs.existsSync(staticDir)) {
    addStaticFiles(staticDir);
    console.log('  + [STATIC ASSETS] humex-sms/static/** added successfully');
  } else {
    throw new Error('Static directory not found at humex-sms/static');
  }

  zip.writeZip(OUTPUT_ZIP);
  const stat = fs.statSync(OUTPUT_ZIP);
  console.log(`\nSuccessfully created production package:`);
  console.log(`  Destination: ${OUTPUT_ZIP}`);
  console.log(`  Package Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB (${stat.size} bytes)`);
} catch (err) {
  console.error('Error building production package:', err);
  process.exit(1);
}
