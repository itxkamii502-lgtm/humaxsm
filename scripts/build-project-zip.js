import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_ZIP = path.join(ROOT_DIR, 'Humex-SMS-Production-VPS.zip');

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

  // Never ship data/ inside the deployable package (data belongs outside code tree on VPS)
  if (rel === 'humex-sms/data' || rel.startsWith('humex-sms/data/') ||
      rel === 'Alpha SMS/data' || rel.startsWith('Alpha SMS/data/')) {
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
  console.log(`Building Humex-SMS-Production-VPS.zip...`);
  const zip = new AdmZip();
  addDirectoryToZip(zip, ROOT_DIR, '');
  zip.writeZip(OUTPUT_ZIP);
  const stat = fs.statSync(OUTPUT_ZIP);
  console.log(`Successfully created ${OUTPUT_ZIP} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
} catch (err) {
  console.error('Error building zip:', err);
  process.exit(1);
}
