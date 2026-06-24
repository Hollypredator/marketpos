const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const categories = await prisma.category.findMany({
      where: { companyId: '07d27fba-9cc9-443e-a426-767184a15a31' }
    });
    console.log(JSON.stringify(categories, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
