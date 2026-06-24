const axios = require('axios');
const cheerio = require('cheerio');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Config
const COMPANY_ID = '07d27fba-9cc9-443e-a426-767184a15a31';
const DRY_RUN = process.env.DRY_RUN === 'true';

async function getSiteCategories() {
  console.log('Fetching site categories...');
  try {
    const { data } = await axios.get('https://ebeymar.com/');
    const $ = cheerio.load(data);
    const categories = [];

    $('.dropdown-menu.menuDropDown.accordionCategory > li > a').each((i, el) => {
      const cleanName = $(el).contents().filter(function() {
        return this.nodeType === 3;
      }).text().trim();
      
      const href = $(el).attr('href');
      if (href && href !== '#' && cleanName) {
        categories.push({
          name: cleanName,
          url: href.startsWith('http') ? href : `https://ebeymar.com${href}`
        });
      }
    });

    return categories;
  } catch (error) {
    console.error('Error fetching site categories:', error.message);
    return [];
  }
}

async function scrapeProductsFromCategory(categoryUrl) {
  let page = 1;
  let allProducts = [];
  let hasMore = true;

  while (hasMore) {
    console.log(`  Scraping ${categoryUrl} - Page ${page}...`);
    try {
      const { data } = await axios.get(`${categoryUrl}?p=${page}`);
      const $ = cheerio.load(data);
      const items = $('.productItem');

      if (items.length === 0) {
        hasMore = false;
        break;
      }

      items.each((i, el) => {
        const name = $(el).find('.productItemTitle strong').text().trim();
        const barcodeText = $(el).find('.productItemTitle .productItemBarcode').text().trim();
        const barcode = barcodeText.replace(/Barkodu\s*:\s*/, '').trim();
        const priceText = $(el).find('.calcDisPrice').text().trim();
        // Convert "119,90 TL" to 119.90
        const price = parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.'));

        if (name && barcode && !isNaN(price)) {
          allProducts.push({ name, barcode, price });
        }
      });

      // Simple heuristic for next page: if we got fewer than 24 items, we might be at the end
      // or check if there is a next page link
      if (items.length < 24) {
        hasMore = false;
      } else {
        page++;
      }
      
      // Safety limit for testing
      if (page > 50) hasMore = false; 

    } catch (error) {
      console.error(`  Error on page ${page}:`, error.message);
      hasMore = false;
    }
  }

  return allProducts;
}

async function main() {
  console.log(`Starting Sync (DRY_RUN: ${DRY_RUN})`);

  // 1. Fetch DB Context
  const dbCategories = await prisma.category.findMany({ where: { companyId: COMPANY_ID } });
  const dbProducts = await prisma.product.findMany({ 
    where: { companyId: COMPANY_ID },
    select: { barcode: true }
  });
  const existingBarcodes = new Set(dbProducts.map(p => p.barcode));

  console.log(`DB Context: ${dbCategories.length} categories, ${existingBarcodes.size} existing products.`);

  // 2. Fetch Site Categories
  const siteCategories = await getSiteCategories();
  
  const toInsert = [];

  for (const siteCat of siteCategories) {
    // Match DB Category
    const dbCat = dbCategories.find(c => c.name.toLowerCase() === siteCat.name.toLowerCase());
    if (!dbCat) {
      console.warn(`Could not match category: ${siteCat.name}. Skipping.`);
      continue;
    }

    console.log(`Syncing category: ${siteCat.name} -> DB: ${dbCat.name} (${dbCat.id})`);
    const siteProducts = await scrapeProductsFromCategory(siteCat.url);
    console.log(`Found ${siteProducts.length} products on site.`);

    for (const prod of siteProducts) {
      if (!existingBarcodes.has(prod.barcode)) {
        toInsert.push({
          companyId: COMPANY_ID,
          categoryId: dbCat.id,
          barcode: prod.barcode,
          name: prod.name,
          purchasePrice: 0,
          salePrice: prod.price,
          unitType: 'PIECE',
          vatRate: 20,
          isActive: true
        });
        // Avoid adding duplicates within the same run if they appear in multiple categories
        existingBarcodes.add(prod.barcode);
      }
    }
  }

  console.log(`Total new products to insert: ${toInsert.length}`);

  if (toInsert.length > 0) {
    if (DRY_RUN) {
      console.log('DRY RUN: Samples:');
      console.log(JSON.stringify(toInsert.slice(0, 5), null, 2));
    } else {
      console.log('Inserting into database...');
      // Batch insert in chunks of 100 to avoid large payload errors
      const chunkSize = 100;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        await prisma.product.createMany({
          data: chunk,
          skipDuplicates: true
        });
        console.log(`  Inserted ${i + chunk.length} / ${toInsert.length}`);
      }
      console.log('Sync completed successfully!');
    }
  } else {
    console.log('No new products found.');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
