import * as fs from 'node:fs';
import * as path from 'node:path';

import axios, { type AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';

import { toMinor } from '../money';
import prisma from '../prisma';

const UPSERT_BATCH_SIZE = 200;

interface CatalogJsonProduct {
  barcode: string;
  name: string;
  categoryName: string;
  salePrice: number;
  vatRate: number;
  unitType: string;
}

interface CatalogJsonCategory {
  name: string;
  products: CatalogJsonProduct[];
}

interface CatalogJsonFile {
  exportedAt: string;
  totalProducts: number;
  categories: CatalogJsonCategory[];
}

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
   * Loads the bundled static catalog JSON from disk.
   */
  private static loadBundledCatalog(): CatalogJsonFile | null {
    try {
      const candidates = [
        path.resolve(process.cwd(), 'packages/api-server/src/lib/catalog/catalog.json'),
        path.resolve(process.cwd(), 'src/lib/catalog/catalog.json'),
        path.resolve(process.cwd(), '../api-server/src/lib/catalog/catalog.json'),
      ];
      const catalogPath = candidates.find((p) => fs.existsSync(p));
      if (!catalogPath) return null;
      const raw = fs.readFileSync(catalogPath, 'utf-8');
      return JSON.parse(raw) as CatalogJsonFile;
    } catch (err) {
      console.error('Failed to load bundled catalog.json:', err);
      return null;
    }
  }

  /**
   * Seeds the product catalog for a specific company from the bundled catalog.json.
   * Fast and reliable — no external dependencies.
   * After seeding, triggers a background price refresh from ebeymar.com.
   */
  static async seedForCompany(companyId: string): Promise<number> {
    console.log(`[Catalog] Starting fast JSON seeding for company: ${companyId}`);

    try {
      const catalog = this.loadBundledCatalog();

      if (!catalog || catalog.categories.length === 0) {
        console.warn('[Catalog] Bundled catalog.json not found or empty, falling back to live scrape.');
        return this.refreshPricesForCompany(companyId);
      }

      console.log(`[Catalog] Loaded ${catalog.totalProducts} products from bundled catalog (exported: ${catalog.exportedAt}).`);

      let totalSynced = 0;
      const syncedBarcodes = new Set<string>();

      for (const catalogCategory of catalog.categories) {
        let category = await prisma.category.findFirst({
          where: { companyId, deletedAt: null, name: catalogCategory.name },
        });

        if (!category) {
          category = await prisma.category.create({
            data: { companyId, name: catalogCategory.name, sortOrder: 0 },
          });
        }

        const productsToUpsert = catalogCategory.products.filter(
          (p) => !syncedBarcodes.has(p.barcode),
        );

        for (let i = 0; i < productsToUpsert.length; i += UPSERT_BATCH_SIZE) {
          const batch = productsToUpsert.slice(i, i + UPSERT_BATCH_SIZE);
          try {
            await prisma.$transaction(
              batch.map((product) => {
                syncedBarcodes.add(product.barcode);
                return prisma.product.upsert({
                  create: {
                    barcode: product.barcode,
                    categoryId: category.id,
                    companyId,
                    minStock: 0,
                    name: product.name,
                    purchasePrice: 0,
                    purchasePriceMinor: 0n,
                    salePrice: product.salePrice,
                    salePriceMinor: toMinor(product.salePrice),
                    unitType: product.unitType as import('@prisma/client').UnitType,
                    vatRate: product.vatRate,
                  },
                  update: {
                    categoryId: category.id,
                    deletedAt: null,
                    isActive: true,
                    name: product.name,
                    salePrice: product.salePrice,
                    salePriceMinor: toMinor(product.salePrice),
                    updatedAt: new Date(),
                  },
                  where: { companyId_barcode: { barcode: product.barcode, companyId } },
                });
              }),
            );
            totalSynced += batch.length;
          } catch (error) {
            console.error(`[Catalog] Batch upsert failed (${batch.length} products):`, error);
            throw error;
          }
        }
      }

      console.log(`[Catalog] Fast seeding complete. ${totalSynced} products written.`);

      // Trigger background price refresh from ebeymar.com (non-blocking)
      void this.refreshPricesForCompany(companyId).catch((err) => {
        console.error(`[Catalog] Background price refresh failed for company ${companyId}:`, err);
      });

      return totalSynced;
    } catch (error: any) {
      console.error(`[Catalog] Seeding failed for company ${companyId}:`, error);

      try {
        const company = await prisma.company.findFirst({ where: { id: companyId } });
        if (company) {
          await prisma.companySubscriptionAudit.create({
            data: {
              actorType: 'SYSTEM',
              companyId,
              eventType: 'SYSTEM_SEED_FAILURE',
              nextStatus: company.packageStatus === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
              nextPayload: {
                error: error?.message || String(error),
                stack: error?.stack || null,
              },
              note: `Catalog seeding failed: ${error?.message || 'Unknown error'}`,
            },
          });
        }
      } catch (auditError) {
        console.error('[Catalog] Failed to write seed failure audit log:', auditError);
      }

      throw error;
    }
  }

  /**
   * Refreshes product prices for a company by scraping ebeymar.com.
   * This is a best-effort operation — used as a background price updater.
   * Can also be called directly for a full live re-sync.
   */
  static async refreshPricesForCompany(companyId: string): Promise<number> {
    console.log(`[Catalog] Starting ebeymar price refresh for company: ${companyId}`);

    const categories = await this.discoverCategories();
    console.log(`[Catalog] Discovered ${categories.length} categories to refresh.`);

    let totalSynced = 0;
    let categoriesWithProducts = 0;
    const syncedBarcodes = new Set<string>();

    for (const categoryInfo of categories) {
      console.log(`Processing category: ${categoryInfo.name} (${categoryInfo.url})`);
      const products = await this.scrapeCategory(categoryInfo.url, categoryInfo.name);

      if (products.length === 0) continue;
      categoriesWithProducts += 1;

      let category = await prisma.category.findFirst({
        where: { companyId, deletedAt: null, name: categoryInfo.name },
      });

      if (!category) {
        category = await prisma.category.create({
          data: { companyId, name: categoryInfo.name, sortOrder: 0 },
        });
      }

      const productsToUpsert = products.filter(
        (p) => !syncedBarcodes.has(p.barcode),
      );

      for (let i = 0; i < productsToUpsert.length; i += UPSERT_BATCH_SIZE) {
        const batch = productsToUpsert.slice(i, i + UPSERT_BATCH_SIZE);
        try {
          await prisma.$transaction(
            batch.map((product) => {
              syncedBarcodes.add(product.barcode);
              return prisma.product.upsert({
                create: {
                  barcode: product.barcode,
                  categoryId: category.id,
                  companyId,
                  minStock: 0,
                  name: product.name,
                  purchasePrice: 0,
                  purchasePriceMinor: 0n,
                  salePrice: product.price,
                  salePriceMinor: toMinor(product.price),
                  unitType: 'PIECE',
                  vatRate: 20,
                },
                update: {
                  categoryId: category.id,
                  deletedAt: null,
                  isActive: true,
                  name: product.name,
                  salePrice: product.price,
                  salePriceMinor: toMinor(product.price),
                  updatedAt: new Date(),
                },
                where: { companyId_barcode: { barcode: product.barcode, companyId } },
              });
            }),
          );
          totalSynced += batch.length;
        } catch (error) {
          console.error(`[Catalog] Batch upsert failed (${batch.length} products):`, error);
        }
      }
    }

    const shouldDeactivateStaleProducts =
      syncedBarcodes.size > 0 &&
      categoriesWithProducts >= Math.max(1, Math.ceil(categories.length * 0.7));

    if (shouldDeactivateStaleProducts) {
      const staleResult = await prisma.product.updateMany({
        data: { deletedAt: new Date(), isActive: false, updatedAt: new Date() },
        where: {
          barcode: { notIn: Array.from(syncedBarcodes) },
          companyId,
          deletedAt: null,
          isActive: true,
        },
      });
      if (staleResult.count > 0) {
        console.log(`[Catalog] Deactivated ${staleResult.count} stale products.`);
      }
    }

    console.log(`[Catalog] Price refresh complete. ${totalSynced} products updated.`);
    return totalSynced;
  }
}
