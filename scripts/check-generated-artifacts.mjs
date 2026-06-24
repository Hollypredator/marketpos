import { execSync } from 'node:child_process';

const trackedFiles = execSync('git ls-files', { encoding: 'utf8' })
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const blockedPatterns = [
  /^packages\/[^/]+\/dist\//u,
  /^packages\/[^/]+\/dist-electron\//u,
  /^packages\/[^/]+\/release\//u,
];

const violations = trackedFiles.filter((filePath) =>
  blockedPatterns.some((pattern) => pattern.test(filePath)),
);

if (violations.length > 0) {
  console.error('Generated build artifacts must not be committed. Remove these tracked files:');
  for (const violation of violations) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log('OK: no generated build artifacts are tracked in git.');
