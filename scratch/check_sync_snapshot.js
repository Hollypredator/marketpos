const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const registerId = '76464c57-8fdd-4dea-b009-ed207532b24d';
  // Use queryRaw because the model might not be in Prisma client if not generated recently
  const rows = await prisma.$queryRawUnsafe('SELECT * FROM register_sync_snapshots WHERE register_id = $1', registerId);
  console.log(JSON.stringify(rows, null, 2));
}

main();
