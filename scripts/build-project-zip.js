import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
let safePrefix = 'humax_sms';
try {
  const settingsPath = path.join(ROOT_DIR, 'Alpha SMS', 'data', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (s && s.site_name) {
      safePrefix = s.site_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'humax_sms';
    }
  }
} catch (e) {}

const OUTPUT_ZIP = path.join(ROOT_DIR, 'Alpha SMS', 'static', `${safePrefix}-project.zip`);
const FALLBACK_ZIP = path.join(ROOT_DIR, 'Alpha SMS', 'static', 'alpha-sms-project.zip');

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.aistudio',
  '.cache',
  '.tmp',
  'sessions',
  'coverage',
  '.vscode',
  '.idea'
];

function shouldInclude(filePath) {
  const rel = path.relative(ROOT_DIR, filePath);
  if (!rel || rel === '.' || rel.startsWith('..')) return true;

  // Never include attachments or AI Studio assets
  if (rel.startsWith(path.join('public', 'assets', 'aistudio')) || rel.includes('aistudio')) {
    return false;
  }

  // Never include the target zip file or any other archives
  if (filePath.toLowerCase().endsWith('.zip') || 
      filePath.toLowerCase().endsWith('.tar') || 
      filePath.toLowerCase().endsWith('.gz') ||
      filePath.toLowerCase().endsWith('.tgz')) {
    return false;
  }

  // Exclude heavy video / audio files
  if (/\.(mp4|mov|avi|mkv|webm|mp3|wav|ogg)$/i.test(filePath)) {
    return false;
  }

  // Check against ignore directory/file patterns
  const parts = rel.split(path.sep);
  for (const part of parts) {
    if (IGNORE_PATTERNS.includes(part)) {
      return false;
    }
  }

  return true;
}

function addDirectoryToZip(zip, dirPath, zipSubdir = '') {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (!shouldInclude(fullPath)) continue;

    const entryZipPath = zipSubdir ? path.join(zipSubdir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, fullPath, entryZipPath);
    } else if (entry.isFile()) {
      try {
        const content = fs.readFileSync(fullPath);
        zip.addFile(entryZipPath, content);
      } catch (e) {
        console.warn('Skipping file:', fullPath, e.message);
      }
    }
  }
}

try {
  console.log(`Building ${safePrefix}-project.zip...`);
  const zip = new AdmZip();
  addDirectoryToZip(zip, ROOT_DIR, '');
  zip.writeZip(OUTPUT_ZIP);
  zip.writeZip(FALLBACK_ZIP);
  const stat = fs.statSync(OUTPUT_ZIP);
  console.log(`Successfully created ${OUTPUT_ZIP} and ${FALLBACK_ZIP} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
} catch (err) {
  console.error('Error building zip:', err);
  process.exit(1);
}
