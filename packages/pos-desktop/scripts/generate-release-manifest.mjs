import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const packageDir = resolve(scriptDir, '..');
const releaseDir = resolve(packageDir, 'release');
const manifestPath = resolve(releaseDir, 'release-manifest.json');

const FILE_PATTERNS = [
  /\.exe$/iu,
  /\.blockmap$/iu,
  /\.yml$/iu,
];

function matchesPattern(fileName) {
  return FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

function sha256Of(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

if (!existsSync(releaseDir)) {
  console.error('Release klasoru bulunamadi. Once npm run electron:build calistirin.');
  process.exit(1);
}

const files = readdirSync(releaseDir)
  .filter((name) => matchesPattern(name))
  .map((name) => {
    const absolutePath = resolve(releaseDir, name);
    const stat = statSync(absolutePath);
    return {
      fileName: name,
      sha256: sha256Of(absolutePath),
      sizeBytes: stat.size,
    };
  })
  .sort((left, right) => left.fileName.localeCompare(right.fileName));

if (files.length === 0) {
  console.error('Release klasorunde manifest icin uygun dosya bulunamadi.');
  process.exit(1);
}

const manifest = {
  files,
  generatedAt: new Date().toISOString(),
  packageName: process.env.npm_package_name ?? '@marketpos/pos-desktop',
  version: process.env.npm_package_version ?? 'unknown',
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Release manifest olusturuldu: ${manifestPath}`);
