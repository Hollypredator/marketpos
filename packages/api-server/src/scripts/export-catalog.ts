/**
 * export-catalog.ts
 * Neon PostgreSQL'deki mevcut ürün kataloğunu catalog.json olarak dışa aktarır.
 * Çalıştır: npx tsx packages/api-server/src/scripts/export-catalog.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import prisma from '../lib/prisma';

interface CatalogProduct {
  barcode: string;
  name: string;
  categoryName: string;
  salePrice: number;
  vatRate: number;
  unitType: string;
}

interface CatalogCategory {
  name: string;
  products: CatalogProduct[];
}

interface CatalogFile {
  exportedAt: string;
  totalProducts: number;
  categories: CatalogCategory[];
}

async function main() {
  console.log('Neon veritabanından katalog dışa aktarılıyor...');

  // Herhangi bir şirketten ürün çek (hepsi aynı katalog)
  const company = await prisma.company.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  if (!company) {
    throw new Error('Hiç şirket bulunamadı.');
  }

  console.log(`Şirket: ${company.name} (${company.id})`);

  const categories = await prisma.category.findMany({
    include: {
      products: {
        orderBy: { name: 'asc' },
        where: { deletedAt: null, isActive: true },
      },
    },
    orderBy: { name: 'asc' },
    where: { companyId: company.id, deletedAt: null },
  });

  const catalogCategories: CatalogCategory[] = [];
  let totalProducts = 0;

  for (const cat of categories) {
    if (cat.products.length === 0) continue;

    const products: CatalogProduct[] = cat.products.map((p) => ({
      barcode: p.barcode,
      categoryName: cat.name,
      name: p.name,
      salePrice: p.salePrice,
      unitType: p.unitType,
      vatRate: p.vatRate,
    }));

    catalogCategories.push({ name: cat.name, products });
    totalProducts += products.length;
  }

  const catalog: CatalogFile = {
    categories: catalogCategories,
    exportedAt: new Date().toISOString(),
    totalProducts,
  };

  const outputPath = path.join(
    process.cwd(),
    'packages/api-server/src/lib/catalog/catalog.json',
  );

  fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2), 'utf-8');

  console.log(`\n✅ Katalog dışa aktarıldı!`);
  console.log(`   Toplam ürün: ${totalProducts}`);
  console.log(`   Kategori: ${catalogCategories.length}`);
  console.log(`   Dosya: ${outputPath}`);
}

main()
  .catch((err) => {
    console.error('Hata:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
