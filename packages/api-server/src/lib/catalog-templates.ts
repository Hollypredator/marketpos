import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const templateProductSchema = z.object({
  barcode: z.string().trim().min(1),
  category: z.string().trim().min(1).nullable().optional(),
  description: z.string().trim().nullable().optional(),
  isQuickAccess: z.boolean().optional().default(false),
  minStock: z.number().int().min(0).nullable().optional(),
  name: z.string().trim().min(1),
  openingStock: z.number().min(0).nullable().optional(),
  purchasePrice: z.number().min(0),
  quickAccessColor: z.string().trim().nullable().optional(),
  quickAccessOrder: z.number().int().nullable().optional(),
  salePrice: z.number().min(0),
  unitType: z.enum(['KG', 'LITER', 'PIECE']).optional().default('PIECE'),
  vatRate: z.number().int().min(0),
});

const templateCategorySchema = z.object({
  color: z.string().trim().nullable().optional(),
  name: z.string().trim().min(1),
  sortOrder: z.number().int(),
});

const catalogTemplateSchema = z.object({
  categories: z.array(templateCategorySchema).min(1),
  code: z.string().trim().regex(/^[a-z0-9-]+$/u),
  defaultMinStock: z.number().int().min(0).default(0),
  defaultOpeningStock: z.number().min(0).default(0),
  displayName: z.string().trim().min(1),
  products: z.array(templateProductSchema).min(1),
});

const TEMPLATE_FILE_REGEX = /^[a-z0-9-]+\.json$/u;

export type CatalogTemplate = z.infer<typeof catalogTemplateSchema>;
export type CatalogTemplateProduct = z.infer<typeof templateProductSchema>;

export interface CatalogTemplateSummary {
  categoryCount: number;
  code: string;
  defaultMinStock: number;
  defaultOpeningStock: number;
  displayName: string;
  productCount: number;
}

export class TemplateCatalogError extends Error {}

function resolveTemplateDirectory(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const envDir = process.env.CATALOG_TEMPLATE_DIR;
  const candidates = [
    envDir && envDir.trim().length > 0 ? envDir.trim() : null,
    resolve(process.cwd(), 'prisma/catalog-templates'),
    resolve(process.cwd(), '../../prisma/catalog-templates'),
    resolve(moduleDir, '../../../prisma/catalog-templates'),
    resolve(moduleDir, '../../../../prisma/catalog-templates'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new TemplateCatalogError('Template klasoru bulunamadi');
}

function parseTemplate(raw: string, sourceLabel: string): CatalogTemplate {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new TemplateCatalogError(`Template JSON parse edilemedi: ${sourceLabel}`);
  }
  const parsed = catalogTemplateSchema.safeParse(json);
  if (!parsed.success) {
    throw new TemplateCatalogError(
      `Template gecersiz: ${sourceLabel} (${parsed.error.errors[0]?.message ?? 'validation'})`,
    );
  }
  return parsed.data;
}

export async function loadCatalogTemplateByCode(code: string): Promise<CatalogTemplate> {
  if (!/^[a-z0-9-]+$/u.test(code)) {
    throw new TemplateCatalogError('Template kodu gecersiz');
  }

  const templateDir = resolveTemplateDirectory();
  const templatePath = resolve(templateDir, `${code}.json`);
  if (!existsSync(templatePath)) {
    throw new TemplateCatalogError(`Template bulunamadi: ${code}`);
  }
  const raw = await readFile(templatePath, 'utf8');
  const parsed = parseTemplate(raw, `${code}.json`);
  if (parsed.code !== code) {
    throw new TemplateCatalogError(
      `Template code uyusmuyor: beklenen ${code}, bulunan ${parsed.code}`,
    );
  }
  return parsed;
}

export async function listCatalogTemplateSummaries(): Promise<CatalogTemplateSummary[]> {
  const templateDir = resolveTemplateDirectory();
  const files = await readdir(templateDir, { withFileTypes: true });
  const jsonFiles = files
    .filter((entry) => entry.isFile() && TEMPLATE_FILE_REGEX.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'tr'));

  const summaries: CatalogTemplateSummary[] = [];
  for (const fileName of jsonFiles) {
    const raw = await readFile(resolve(templateDir, fileName), 'utf8');
    const template = parseTemplate(raw, fileName);
    summaries.push({
      categoryCount: template.categories.length,
      code: template.code,
      defaultMinStock: template.defaultMinStock,
      defaultOpeningStock: template.defaultOpeningStock,
      displayName: template.displayName,
      productCount: template.products.length,
    });
  }

  return summaries.sort((left, right) => left.displayName.localeCompare(right.displayName, 'tr'));
}
