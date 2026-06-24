const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const registerId = '76464c57-8fdd-4dea-b009-ed207532b24d';
  const logs = await prisma.syncLog.findMany({
    where: { registerId },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(logs, null, 2));
}

main();
