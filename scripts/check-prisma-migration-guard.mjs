import { execSync } from 'node:child_process';

function getGitOutput(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function resolveComparisonRange() {
  const baseSha = process.env.GITHUB_BASE_SHA;
  if (baseSha && baseSha.length > 0) {
    return `${baseSha}...HEAD`;
  }

  const originMain = getGitOutput('git rev-parse --verify origin/main');
  if (originMain.length > 0) {
    return 'origin/main...HEAD';
  }

  const previousCommit = getGitOutput('git rev-parse --verify HEAD~1');
  if (previousCommit.length > 0) {
    return 'HEAD~1...HEAD';
  }

  return null;
}

const range = resolveComparisonRange();
if (!range) {
  console.log('SKIP: comparison range not found; migration guard not enforced in this context.');
  process.exit(0);
}

const changedFilesRaw = getGitOutput(`git diff --name-only ${range}`);
const changedFiles = changedFilesRaw
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const schemaChanged = changedFiles.includes('prisma/schema.prisma');
const migrationChanged = changedFiles.some((filePath) => filePath.startsWith('prisma/migrations/'));

if (schemaChanged && !migrationChanged) {
  console.error('prisma/schema.prisma changed but no prisma/migrations/* changes were found.');
  console.error('Create and commit a migration alongside schema changes.');
  process.exit(1);
}

console.log('OK: prisma migration guard passed.');
