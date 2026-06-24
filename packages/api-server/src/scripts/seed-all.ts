import prisma from '../lib/prisma';
import { DefaultCatalogService } from '../lib/catalog/defaultCatalogService';

async function main() {
  console.log('--- STARTING BULK CATALOG SEEDING ---');
  
  try {
    const companies = await prisma.company.findMany({
      where: {
        deletedAt: null,
      },
    });

    console.log(`Found ${companies.length} companies to process.`);

    for (const company of companies) {
      console.log(`\n> Seeding company: ${company.name} (${company.id})`);
      try {
        const count = await DefaultCatalogService.seedForCompany(company.id);
        console.log(`Successfully seeded ${count} products.`);
      } catch (err) {
        console.error(`Error seeding company ${company.id}:`, err);
      }
    }

    console.log('\n--- BULK SEEDING FINISHED SUCCESFULLY ---');
  } catch (error) {
    console.error('Fatal error during bulk seeding:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
