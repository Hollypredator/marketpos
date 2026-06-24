import { execSync } from 'node:child_process';

const env = { ...process.env };
if (!env.DATABASE_URL || env.DATABASE_URL.trim().length === 0) {
  env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/marketpos_ci';
}

try {
  execSync('npx prisma validate --schema prisma/schema.prisma', {
    env,
    stdio: 'inherit',
  });
} catch {
  process.exit(1);
}
