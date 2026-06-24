const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const companyId = '07d27fba-9cc9-443e-a426-767184a15a31';
  const recent = await prisma.product.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(recent, null, 2));
}

main();
