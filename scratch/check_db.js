const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const companies = await prisma.company.findMany({
      include: {
        _count: {
          select: { products: true }
        }
      }
    });

    console.log('Companies:');
    companies.forEach(c => {
      console.log(`- ${c.name} (ID: ${c.id}) - Products: ${c._count.products}`);
    });

    const recentProducts = await prisma.product.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' }
    });

    console.log('\nRecent Products:');
    recentProducts.forEach(p => {
      console.log(`- ${p.name} (Barcode: ${p.barcode})`);
    });

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
