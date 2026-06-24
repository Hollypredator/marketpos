const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const companyId = '07d27fba-9cc9-443e-a426-767184a15a31';
  const categories = await prisma.category.findMany({
    where: { companyId }
  });
  console.log(JSON.stringify(categories, null, 2));
}

main();
