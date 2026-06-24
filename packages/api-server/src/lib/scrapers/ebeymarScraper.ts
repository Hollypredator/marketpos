import axios from 'axios';
import * as cheerio from 'cheerio';
import { toMinor } from '../../lib/money';
import prisma from '../../lib/prisma';

export interface ScrapedProduct {
  name: string;
  barcode: string;
  price: number;
  categoryName: string;
}

const CATEGORIES = [
  { name: 'ATIŞTIRMALIK', url: 'https://ebeymar.com/atistirmalik' },
  { name: 'TEMEL GIDA', url: 'https://ebeymar.com/temel-gida' },
  { name: 'DETERJAN & TEMİZLİK', url: 'https://ebeymar.com/deterjan-temizlik' },
  { name: 'KAHVALTILIKLAR', url: 'https://ebeymar.com/kahvaltiliklar' },
  { name: 'SÜTLER VE YOĞURTLAR', url: 'https://ebeymar.com/sutler-ve-yogurtlar' },
  { name: 'KİŞİSEL BAKIM', url: 'https://ebeymar.com/kisisel-bakim' },
  { name: 'MEYVE & SEBZE', url: 'https://ebeymar.com/meyvesebze' },
  { name: 'İÇECEKLER', url: 'https://ebeymar.com/sicak-ve-soguk-icecekler' },
  { name: 'HAZIR YEMEKLER', url: 'https://ebeymar.com/hazir-yemekler-ve-soslar' },
];

export class EbeymarScraper {
  static async scrapeCategory(url: string, categoryName: string): Promise<ScrapedProduct[]> {
    try {
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const $ = cheerio.load(data);
      const products: ScrapedProduct[] = [];

      $('.productItem').each((_, el) => {
        let name = $(el).find('.productItemTitle strong').text().trim();
        if (!name) name = $(el).find('[itemprop="name"]').text().trim();
        
        const priceText = $(el).find('.calcDisPrice').text().trim();
        
        let barcode = $(el).find('.productItemBarcode').text().trim();
        if (barcode.includes(':')) {
          barcode = barcode.split(':').pop()?.trim() || '';
        }

        // Clean price text: "125,50 TL" -> 125.50
        const priceClean = priceText.replace(/[^\d,\.]/g, '').replace(',', '.').trim();
        const price = parseFloat(priceClean);

        if (name && barcode && !isNaN(price)) {
          products.push({
            name,
            barcode,
            price,
            categoryName,
          });
        }
      });

      return products;
    } catch (error) {
      console.error(`Error scraping category ${url}:`, error);
      return [];
    }
  }

  static async syncProducts(companyId: string) {
    console.log(`Starting sync for company: ${companyId}`);
    let totalSynced = 0;

    for (const cat of CATEGORIES) {
      console.log(`Scraping category: ${cat.name}`);
      const products = await this.scrapeCategory(cat.url, cat.name);
      
      // 1. Ensure category exists for this company
      let category = await prisma.category.findFirst({
        where: {
          companyId,
          name: cat.name,
          deletedAt: null,
        },
      });

      if (!category) {
        category = await prisma.category.create({
          data: {
            companyId,
            name: cat.name,
          },
        });
      }

      // 2. Upsert products
      for (const p of products) {
        await prisma.product.upsert({
          where: {
            companyId_barcode: {
              barcode: p.barcode,
              companyId,
            },
          },
          update: {
            name: p.name,
            salePriceMinor: toMinor(p.price),
            salePrice: p.price,
            categoryId: category.id,
          },
          create: {
            barcode: p.barcode,
            companyId,
            name: p.name,
            salePrice: p.price,
            salePriceMinor: toMinor(p.price),
            purchasePrice: 0,
            purchasePriceMinor: 0n,
            vatRate: 20, // Default VAT
            categoryId: category.id,
            unitType: 'PIECE',
          },
        });
        totalSynced++;
      }
    }

    return totalSynced;
  }
}
