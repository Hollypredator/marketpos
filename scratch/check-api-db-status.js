const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const companyCount = await prisma.company.count();
  console.log('Total companies on API server:', companyCount);
  
  const companies = await prisma.company.findMany();
  console.log('Companies:', companies.map(c => ({ id: c.id, name: c.name, licenseKey: c.licenseKey })));

  const productCount = await prisma.product.count();
  console.log('Total products on API server:', productCount);

  const productCountsByCompany = await prisma.product.groupBy({
    by: ['companyId'],
    _count: {
      id: true
    }
  });
  console.log('Products count by company on API server:', productCountsByCompany);
  
  const pendingLogs = await prisma.syncLog.count({
    where: {
      status: 'PENDING'
    }
  });
  console.log('Pending sync logs on API server:', pendingLogs);
}

main().catch(console.error).finally(() => prisma.$disconnect());
