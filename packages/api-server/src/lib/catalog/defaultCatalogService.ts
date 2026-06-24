import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';

import { toMinor } from '../money';
import prisma from '../prisma';

interface ScrapedProduct {
  barcode: string;
  name: string;
  price: number;
}

interface DiscoveredCategory {
  name: string;
  slug: string;
  url: string;
}

interface PageInfo {
  pageNumber: number;
  pageSize: number;
  totalNumber: number;
}

const BASE_URL = 'https://ebeymar.com';
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_PAGE_SIZE = 24;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const FALLBACK_TOP_LEVEL_SLUGS = [
  'anne-bebek',
  'atistirmalik',
  'deterjan-temizlik',
  'dondurma',
  'ettavukbalik',
  'ev-yasam',
  'hazir-yemekler-ve-soslar',
  'indirimdekiler',
  'kahvaltiliklar',
  'kisisel-bakim',
  'kuruyemislokumseker',
  'meyvesebze',
  'sicak-ve-soguk-icecekler',
  'sutler-ve-yogurtlar',
  'temel-gida',
] as const;

const EXCLUDED_TOP_LEVEL_SLUGS = new Set<string>([
  'sayfa',
  'kullanici',
  'odeme',
  'arama',
  'markalar',
  'marka',
  'blog',
  'sepet',
  'hesabim',
]);

const LOW_PRIORITY_CATEGORY_SLUGS = new Set<string>(['indirimdekiler']);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function slugToDisplayName(slug: string): string {
  return slug
    .split('-')
    .map((part) => {
      if (part.length === 0) {
        return part;
      }
      return part[0].toUpperCase() + part.slice(1);
    })
    .join(' ')
    .toLocaleUpperCase('tr-TR');
}

export class DefaultCatalogService {
  private static readonly httpClient: AxiosInstance = axios.create({
    headers: {
      'User-Agent': USER_AGENT,
    },
    timeout: REQUEST_TIMEOUT_MS,
    validateStatus: (status) => status >= 200 && status < 500,
  });

  private static buildFallbackCategories(): DiscoveredCategory[] {
    return FALLBACK_TOP_LEVEL_SLUGS.map((slug) => ({
      name: slugToDisplayName(slug),
      slug,
      url: `${BASE_URL}/${slug}`,
    }));
  }

  private static extractSlug(url: string): string | null {
    try {
      const parsed = new URL(url);
      const [firstSegment] = parsed.pathname.split('/').filter(Boolean);
      return firstSegment ?? null;
    } catch {
      return null;
    }
  }

  private static normalizeTopLevelCategoryUrl(rawHref: string): string | null {
    try {
      const parsed = new URL(rawHref, BASE_URL);
      if (parsed.origin !== BASE_URL) {
        return null;
      }

      parsed.hash = '';
      parsed.search = '';

      let pathname = parsed.pathname.replace(/\/+/g, '/');
      if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }

      const segments = pathname.split('/').filter(Boolean);
      if (segments.length !== 1) {
        return null;
      }

      const slug = segments[0]?.toLowerCase();
      if (!slug || EXCLUDED_TOP_LEVEL_SLUGS.has(slug) || slug.startsWith('prd-')) {
        return null;
      }

      parsed.pathname = `/${slug}`;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private static buildCategoryName(url: string, rawText: string): string {
    const cleaned = normalizeWhitespace(rawText).replace(/\s+-\s*tumu$/i, '');
    if (cleaned.length > 0 && !/^tum[uı]$/i.test(cleaned)) {
      return cleaned.toLocaleUpperCase('tr-TR');
    }

    const slug = this.extractSlug(url);
    if (!slug) {
      return 'KATEGORI';
    }

    return slugToDisplayName(slug);
  }

  private static async fetchHtml(url: string): Promise<string | null> {
    try {
      const response = await this.httpClient.get(url);
      if (response.status >= 400) {
        return null;
      }
      return String(response.data ?? '');
    } catch (error) {
      console.error(`Failed to fetch page ${url}:`, error);
      return null;
    }
  }

  private static parsePageInfo(html: string): PageInfo | null {
    const match = html.match(/pageInfo\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (!match) {
      return null;
    }

    const totalNumber = Number.parseInt(match[1], 10);
    const pageNumber = Number.parseInt(match[2], 10);
    const pageSize = Number.parseInt(match[3], 10);

    if (
      !Number.isFinite(totalNumber) ||
      !Number.isFinite(pageNumber) ||
      !Number.isFinite(pageSize) ||
      totalNumber < 0 ||
      pageNumber < 1 ||
      pageSize < 1
    ) {
      return null;
    }

    return {
      pageNumber,
      pageSize,
      totalNumber,
    };
  }

  private static parsePrice(value: string): number | null {
    const cleaned = value.replace(/[^\d,.-]/g, '').trim();
    if (cleaned.length === 0) {
      return null;
    }

    let normalized = cleaned;
    const commaIndex = normalized.lastIndexOf(',');
    const dotIndex = normalized.lastIndexOf('.');

    if (commaIndex > -1 && dotIndex > -1) {
      if (commaIndex > dotIndex) {
        normalized = normalized.replace(/\./g, '').replace(',', '.');
      } else {
        normalized = normalized.replace(/,/g, '');
      }
    } else {
      normalized = normalized.replace(',', '.');
    }

    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return Math.round(parsed * 100) / 100;
  }

  private static parseBarcode(value: string): string {
    const directMatch = value.match(/\b\d{4,14}\b/);
    if (directMatch) {
      return directMatch[0];
    }

    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length >= 4) {
      return digitsOnly;
    }

    return '';
  }

  private static parseProducts(html: string): ScrapedProduct[] {
    const $ = cheerio.load(html);
    const products: ScrapedProduct[] = [];

    $('.productItem').each((_, element) => {
      const rawName =
        normalizeWhitespace($(element).find('.productItemTitle strong').first().text()) ||
        normalizeWhitespace($(element).find('[itemprop="name"]').first().text()) ||
        normalizeWhitespace($(element).find('.productItemTitle').first().text());

      const name = normalizeWhitespace(
        rawName
          .replace(/Stok\s*Kodu\s*:\s*\d+/gi, '')
          .replace(/Barkodu?\s*:\s*\d+/gi, ''),
      );
      const priceText = normalizeWhitespace($(element).find('.calcDisPrice').first().text());
      const barcodeText = normalizeWhitespace($(element).find('.productItemBarcode').first().text());

      const barcode = this.parseBarcode(barcodeText);
      const price = this.parsePrice(priceText);

      if (name.length > 0 && barcode.length > 0 && price !== null) {
        products.push({
          barcode,
          name,
          price,
        });
      }
    });

    return products;
  }

  private static buildPageUrl(baseUrl: string, page: number): string {
    const parsed = new URL(baseUrl);
    parsed.searchParams.set('p', String(page));
    return parsed.toString();
  }

  private static sortCategories(categories: DiscoveredCategory[]): DiscoveredCategory[] {
    return [...categories].sort((left, right) => {
      const leftPriority = LOW_PRIORITY_CATEGORY_SLUGS.has(left.slug) ? 1 : 0;
      const rightPriority = LOW_PRIORITY_CATEGORY_SLUGS.has(right.slug) ? 1 : 0;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.name.localeCompare(right.name, 'tr');
    });
  }

  static async discoverCategories(): Promise<DiscoveredCategory[]> {
    const html = await this.fetchHtml(BASE_URL);
    if (!html) {
      console.warn('Category discovery failed, using fallback category list.');
      return this.buildFallbackCategories();
    }

    const $ = cheerio.load(html);
    const discoveredByUrl = new Map<string, DiscoveredCategory>();

    $('a[href]').each((_, element) => {
      const rawHref = String($(element).attr('href') ?? '').trim();
      if (rawHref.length === 0) {
        return;
      }

      const normalizedUrl = this.normalizeTopLevelCategoryUrl(rawHref);
      if (!normalizedUrl) {
        return;
      }

      const slug = this.extractSlug(normalizedUrl);
      if (!slug) {
        return;
      }

      const rawText = String($(element).text() ?? '');
      const name = this.buildCategoryName(normalizedUrl, rawText);
      const existing = discoveredByUrl.get(normalizedUrl);

      if (!existing) {
        discoveredByUrl.set(normalizedUrl, {
          name,
          slug,
          url: normalizedUrl,
        });
        return;
      }

      if (existing.name === slugToDisplayName(slug) && name.length > 0) {
        discoveredByUrl.set(normalizedUrl, {
          name,
          slug,
          url: normalizedUrl,
        });
      }
    });

    const discovered = this.sortCategories(Array.from(discoveredByUrl.values()));
    if (discovered.length > 0) {
      return discovered;
    }

    console.warn('No categories discovered on homepage, using fallback category list.');
    return this.buildFallbackCategories();
  }

  /**
   * Scrapes all pages for a category URL.
   */
  static async scrapeCategory(url: string, categoryName: string): Promise<ScrapedProduct[]> {
    const firstPageHtml = await this.fetchHtml(url);
    if (!firstPageHtml) {
      return [];
    }

    const pageInfo = this.parsePageInfo(firstPageHtml);
    const firstPageProducts = this.parseProducts(firstPageHtml);
    const productsByBarcode = new Map<string, ScrapedProduct>();

    for (const product of firstPageProducts) {
      productsByBarcode.set(product.barcode, product);
    }

    const totalPages = pageInfo
      ? Math.max(1, Math.ceil(pageInfo.totalNumber / Math.max(1, pageInfo.pageSize)))
      : (firstPageProducts.length >= DEFAULT_PAGE_SIZE ? 2 : 1);

    for (let page = 2; page <= totalPages; page += 1) {
      const pageUrl = this.buildPageUrl(url, page);
      const pageHtml = await this.fetchHtml(pageUrl);
      if (!pageHtml) {
        continue;
      }

      const productsInPage = this.parseProducts(pageHtml);
      if (productsInPage.length === 0) {
        continue;
      }

      for (const product of productsInPage) {
        if (!productsByBarcode.has(product.barcode)) {
          productsByBarcode.set(product.barcode, product);
        }
      }
    }

    const products = Array.from(productsByBarcode.values());
    console.log(`Scraped ${products.length} unique products from ${categoryName} (${url})`);
    return products;
  }

  /**
   * Seeds the product catalog for a specific company by scraping current market data.
   */
  static async seedForCompany(companyId: string): Promise<number> {
    console.log(`Starting catalog seeding for company: ${companyId}`);

    const categories = await this.discoverCategories();
    console.log(`Discovered ${categories.length} categories to process.`);

    let totalSynced = 0;
    let categoriesWithProducts = 0;
    const syncedBarcodes = new Set<string>();

    for (const categoryInfo of categories) {
      console.log(`Processing category: ${categoryInfo.name} (${categoryInfo.url})`);
      const products = await this.scrapeCategory(categoryInfo.url, categoryInfo.name);

      if (products.length === 0) {
        continue;
      }
      categoriesWithProducts += 1;

      let category = await prisma.category.findFirst({
        where: {
          companyId,
          name: categoryInfo.name,
          deletedAt: null,
        },
      });

      if (!category) {
        category = await prisma.category.create({
          data: {
            companyId,
            name: categoryInfo.name,
            sortOrder: 0,
          },
        });
      }

      for (const product of products) {
        if (syncedBarcodes.has(product.barcode)) {
          continue;
        }

        try {
          await prisma.product.upsert({
            where: {
              companyId_barcode: {
                barcode: product.barcode,
                companyId,
              },
            },
            update: {
              categoryId: category.id,
              deletedAt: null,
              isActive: true,
              name: product.name,
              salePriceMinor: toMinor(product.price),
              salePrice: product.price,
              updatedAt: new Date(),
            },
            create: {
              name: product.name,
              barcode: product.barcode,
              salePrice: product.price,
              salePriceMinor: toMinor(product.price),
              companyId,
              categoryId: category.id,
              purchasePrice: 0,
              purchasePriceMinor: 0n,
              vatRate: 20,
              unitType: 'PIECE',
              minStock: 0,
            },
          });

          syncedBarcodes.add(product.barcode);
          totalSynced += 1;
        } catch (error) {
          console.error(`Failed to upsert product ${product.barcode}:`, error);
        }
      }
    }

    const shouldDeactivateStaleProducts =
      syncedBarcodes.size > 0 &&
      categoriesWithProducts >= Math.max(1, Math.ceil(categories.length * 0.7));

    if (shouldDeactivateStaleProducts) {
      const staleProducts = await prisma.product.updateMany({
        data: {
          deletedAt: new Date(),
          isActive: false,
          updatedAt: new Date(),
        },
        where: {
          barcode: {
            notIn: Array.from(syncedBarcodes),
          },
          companyId,
          deletedAt: null,
          isActive: true,
        },
      });
      if (staleProducts.count > 0) {
        console.log(`Deactivated ${staleProducts.count} stale products not found on eBeymar.`);
      }
    } else {
      console.warn(
        `Skipped stale product cleanup because scrape coverage was too low (${categoriesWithProducts}/${categories.length}).`,
      );
    }

    console.log(`Seeding completed. Unique records synced: ${totalSynced}`);
    return totalSynced;
  }
}
