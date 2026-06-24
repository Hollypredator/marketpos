import { DefaultCatalogService } from '../lib/catalog/defaultCatalogService';
import prisma from '../lib/prisma';

async function main(): Promise<void> {
  const companyId = process.argv[2]?.trim();
  if (!companyId) {
    throw new Error('Usage: npx tsx src/scripts/reseed-company.ts <companyId>');
  }

  const synced = await DefaultCatalogService.seedForCompany(companyId);
  const [activeTotal, inactiveTotal] = await Promise.all([
    prisma.product.count({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
      },
    }),
    prisma.product.count({
      where: {
        companyId,
        isActive: false,
      },
    }),
  ]);

  console.log(
    JSON.stringify(
      {
        activeTotal,
        companyId,
        inactiveTotal,
        synced,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
