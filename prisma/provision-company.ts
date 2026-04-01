import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

type UnitType = 'KG' | 'LITER' | 'PIECE';

interface TemplateCategory {
  color: string | null;
  name: string;
  sortOrder: number;
}

interface TemplateProduct {
  barcode: string;
  category: string | null;
  description: string | null;
  isQuickAccess: boolean;
  minStock: number | null;
  name: string;
  openingStock: number | null;
  purchasePrice: number;
  quickAccessColor: string | null;
  quickAccessOrder: number | null;
  salePrice: number;
  unitType: UnitType;
  vatRate: number;
}

interface CatalogTemplate {
  categories: TemplateCategory[];
  code: string;
  defaultMinStock: number;
  defaultOpeningStock: number;
  displayName: string;
  products: TemplateProduct[];
}

interface CliArgs {
  [key: string]: boolean | string;
}

interface ProvisionOptions {
  adminFullName: string;
  adminPassword: string;
  adminUsername: string;
  branchName: string;
  companyAddress: string | null;
  companyEmail: string | null;
  companyId: string | null;
  companyName: string | null;
  companyPhone: string | null;
  companyTaxNumber: string | null;
  graceDays: number;
  overwriteStock: boolean;
  packageDays: number;
  registerName: string;
}

interface ProvisionSummary {
  branchCreated: boolean;
  companyCreated: boolean;
  companyId: string;
  companyName: string;
  productsCreated: number;
  productsUpdated: number;
  registerCreated: boolean;
  stockCreated: number;
  stockUpdated: number;
}

const prisma = new PrismaClient();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, pathName: string, options?: { allowEmpty?: boolean }): string {
  if (typeof value !== 'string') {
    throw new Error(`${pathName} string olmalidir`);
  }
  const trimmed = value.trim();
  if (!options?.allowEmpty && trimmed.length === 0) {
    throw new Error(`${pathName} bos olamaz`);
  }
  return trimmed;
}

function asNumber(value: unknown, pathName: string, options?: { integer?: boolean; min?: number }): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${pathName} number olmalidir`);
  }
  if (options?.integer && !Number.isInteger(value)) {
    throw new Error(`${pathName} integer olmalidir`);
  }
  if (typeof options?.min === 'number' && value < options.min) {
    throw new Error(`${pathName} en az ${options.min} olmali`);
  }
  return value;
}

function asOptionalString(value: unknown, pathName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return asString(value, pathName, { allowEmpty: true }) || null;
}

function asOptionalNumber(value: unknown, pathName: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  return asNumber(value, pathName);
}

function asBoolean(value: unknown, pathName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${pathName} boolean olmalidir`);
  }
  return value;
}

function parseTemplate(raw: unknown): CatalogTemplate {
  if (!isRecord(raw)) {
    throw new Error('Template objesi gecersiz');
  }

  const code = asString(raw.code, 'template.code');
  const displayName = asString(raw.displayName, 'template.displayName');
  const defaultMinStock = asNumber(raw.defaultMinStock ?? 10, 'template.defaultMinStock', {
    integer: true,
    min: 0,
  });
  const defaultOpeningStock = asNumber(
    raw.defaultOpeningStock ?? 0,
    'template.defaultOpeningStock',
    { min: 0 },
  );

  if (!Array.isArray(raw.categories) || raw.categories.length === 0) {
    throw new Error('template.categories bos olamaz');
  }
  if (!Array.isArray(raw.products) || raw.products.length === 0) {
    throw new Error('template.products bos olamaz');
  }

  const categories = raw.categories.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`template.categories[${index}] objesi gecersiz`);
    }
    return {
      color: asOptionalString(item.color, `template.categories[${index}].color`),
      name: asString(item.name, `template.categories[${index}].name`),
      sortOrder: asNumber(item.sortOrder ?? index + 1, `template.categories[${index}].sortOrder`, {
        integer: true,
      }),
    } satisfies TemplateCategory;
  });

  const products = raw.products.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`template.products[${index}] objesi gecersiz`);
    }
    const unitType = (item.unitType ?? 'PIECE') as UnitType;
    if (unitType !== 'PIECE' && unitType !== 'KG' && unitType !== 'LITER') {
      throw new Error(`template.products[${index}].unitType gecersiz`);
    }
    return {
      barcode: asString(item.barcode, `template.products[${index}].barcode`),
      category: asOptionalString(item.category, `template.products[${index}].category`),
      description: asOptionalString(item.description, `template.products[${index}].description`),
      isQuickAccess: asBoolean(item.isQuickAccess ?? false, `template.products[${index}].isQuickAccess`),
      minStock: asOptionalNumber(item.minStock, `template.products[${index}].minStock`),
      name: asString(item.name, `template.products[${index}].name`),
      openingStock: asOptionalNumber(item.openingStock, `template.products[${index}].openingStock`),
      purchasePrice: asNumber(item.purchasePrice, `template.products[${index}].purchasePrice`, { min: 0 }),
      quickAccessColor: asOptionalString(item.quickAccessColor, `template.products[${index}].quickAccessColor`),
      quickAccessOrder: asOptionalNumber(item.quickAccessOrder, `template.products[${index}].quickAccessOrder`),
      salePrice: asNumber(item.salePrice, `template.products[${index}].salePrice`, { min: 0 }),
      unitType,
      vatRate: asNumber(item.vatRate, `template.products[${index}].vatRate`, {
        integer: true,
        min: 0,
      }),
    } satisfies TemplateProduct;
  });

  const categoryNames = new Set<string>();
  for (const category of categories) {
    if (categoryNames.has(category.name)) {
      throw new Error(`Ayni kategori ismi tekrar ediyor: ${category.name}`);
    }
    categoryNames.add(category.name);
  }

  const barcodes = new Set<string>();
  for (const product of products) {
    if (barcodes.has(product.barcode)) {
      throw new Error(`Ayni barcode template icinde tekrar ediyor: ${product.barcode}`);
    }
    barcodes.add(product.barcode);
    if (product.category && !categoryNames.has(product.category)) {
      throw new Error(
        `Urun kategorisi bulunamadi: ${product.name} -> ${product.category}`,
      );
    }
  }

  return {
    categories,
    code,
    defaultMinStock,
    defaultOpeningStock,
    displayName,
    products,
  };
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const body = token.slice(2);
    const separatorIndex = body.indexOf('=');
    if (separatorIndex >= 0) {
      const key = body.slice(0, separatorIndex);
      const value = body.slice(separatorIndex + 1);
      args[key] = value;
      continue;
    }

    const key = body;
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
      continue;
    }
    args[key] = true;
  }
  return args;
}

function getStringArg(args: CliArgs, key: string, fallback?: string): string {
  const value = args[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`--${key} zorunludur`);
}

function getOptionalStringArg(args: CliArgs, key: string): string | null {
  const value = args[key];
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getNumberArg(args: CliArgs, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${key} sayisal olmalidir`);
  }
  return parsed;
}

function getBooleanArg(args: CliArgs, key: string): boolean {
  const value = args[key];
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

function buildOptions(args: CliArgs): ProvisionOptions {
  const companyId = getOptionalStringArg(args, 'company-id');
  const companyName = getOptionalStringArg(args, 'company-name');
  if (!companyId && !companyName) {
    throw new Error('--company-id veya --company-name zorunludur');
  }

  const packageDays = Math.floor(getNumberArg(args, 'package-days', 365));
  const graceDays = Math.floor(getNumberArg(args, 'grace-days', 7));
  if (packageDays < 1) {
    throw new Error('--package-days en az 1 olmalidir');
  }
  if (graceDays < 1 || graceDays > 30) {
    throw new Error('--grace-days 1 ile 30 arasinda olmalidir');
  }

  const adminPassword = getStringArg(args, 'admin-password');
  if (adminPassword.length < 6) {
    throw new Error('--admin-password en az 6 karakter olmalidir');
  }

  return {
    adminFullName: getStringArg(args, 'admin-full-name', 'Sistem Yoneticisi'),
    adminPassword,
    adminUsername: getStringArg(args, 'admin-username', 'admin'),
    branchName: getStringArg(args, 'branch-name', 'Merkez Sube'),
    companyAddress: getOptionalStringArg(args, 'address'),
    companyEmail: getOptionalStringArg(args, 'email'),
    companyId,
    companyName,
    companyPhone: getOptionalStringArg(args, 'phone'),
    companyTaxNumber: getOptionalStringArg(args, 'tax-number'),
    graceDays,
    overwriteStock: getBooleanArg(args, 'overwrite-stock'),
    packageDays,
    registerName: getStringArg(args, 'register-name', 'K01'),
  };
}

function resolveTemplatePath(args: CliArgs): string {
  const customPath = getOptionalStringArg(args, 'template-path');
  if (customPath) {
    return path.isAbsolute(customPath)
      ? customPath
      : path.resolve(process.cwd(), customPath);
  }

  const templateCode = getStringArg(args, 'template', 'bakkal-v1');
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  return path.resolve(currentDir, 'catalog-templates', `${templateCode}.json`);
}

async function readTemplate(templatePath: string): Promise<CatalogTemplate> {
  const raw = await fs.readFile(templatePath, 'utf8');
  return parseTemplate(JSON.parse(raw));
}

async function provisionCompany(
  options: ProvisionOptions,
  template: CatalogTemplate,
): Promise<ProvisionSummary> {
  const now = new Date();
  const packageExpiresAt = new Date(now.getTime() + options.packageDays * 24 * 60 * 60 * 1000);
  const packageGraceEndsAt = new Date(
    packageExpiresAt.getTime() + options.graceDays * 24 * 60 * 60 * 1000,
  );
  const adminPasswordHash = await bcrypt.hash(options.adminPassword, 12);

  return prisma.$transaction(async (tx) => {
    let companyCreated = false;
    let company = null as Awaited<ReturnType<typeof tx.company.findFirst>>;

    if (options.companyId) {
      company = await tx.company.findFirst({
        where: { deletedAt: null, id: options.companyId },
      });
      if (!company) {
        throw new Error(`Firma bulunamadi: ${options.companyId}`);
      }
    } else {
      companyCreated = true;
      company = await tx.company.create({
        data: {
          address: options.companyAddress,
          email: options.companyEmail,
          name: options.companyName!,
          packageExpiresAt,
          packageGraceDays: options.graceDays,
          packageGraceEndsAt,
          packageStartedAt: now,
          phone: options.companyPhone,
          taxNumber: options.companyTaxNumber,
        },
      });
    }

    let branchCreated = false;
    let branch = await tx.branch.findFirst({
      where: {
        companyId: company.id,
        deletedAt: null,
        name: options.branchName,
      },
    });
    if (!branch) {
      branchCreated = true;
      branch = await tx.branch.create({
        data: {
          address: company.address,
          companyId: company.id,
          name: options.branchName,
          phone: company.phone,
        },
      });
    }

    let registerCreated = false;
    let register = await tx.register.findFirst({
      where: {
        branchId: branch.id,
        deletedAt: null,
        name: options.registerName,
      },
    });
    if (!register) {
      registerCreated = true;
      register = await tx.register.create({
        data: {
          branchId: branch.id,
          name: options.registerName,
        },
      });
    }

    const existingAdmin = await tx.user.findUnique({
      where: {
        companyId_username: {
          companyId: company.id,
          username: options.adminUsername,
        },
      },
    });

    if (existingAdmin) {
      await tx.user.update({
        where: { id: existingAdmin.id },
        data: {
          branchId: branch.id,
          deletedAt: null,
          fullName: options.adminFullName,
          isActive: true,
          passwordHash: adminPasswordHash,
          pin: null,
          role: 'ADMIN',
        },
      });
    } else {
      await tx.user.create({
        data: {
          branchId: branch.id,
          companyId: company.id,
          fullName: options.adminFullName,
          passwordHash: adminPasswordHash,
          role: 'ADMIN',
          username: options.adminUsername,
        },
      });
    }

    const categoryIdByName = new Map<string, string>();
    for (const category of template.categories) {
      const existingCategory = await tx.category.findFirst({
        where: {
          companyId: company.id,
          deletedAt: null,
          name: category.name,
        },
      });
      if (existingCategory) {
        const updatedCategory = await tx.category.update({
          where: { id: existingCategory.id },
          data: {
            color: category.color,
            deletedAt: null,
            sortOrder: category.sortOrder,
          },
        });
        categoryIdByName.set(category.name, updatedCategory.id);
      } else {
        const createdCategory = await tx.category.create({
          data: {
            color: category.color,
            companyId: company.id,
            name: category.name,
            sortOrder: category.sortOrder,
          },
        });
        categoryIdByName.set(category.name, createdCategory.id);
      }
    }

    let productsCreated = 0;
    let productsUpdated = 0;
    let stockCreated = 0;
    let stockUpdated = 0;

    for (const productTemplate of template.products) {
      const categoryId =
        productTemplate.category === null
          ? null
          : categoryIdByName.get(productTemplate.category) ?? null;

      if (productTemplate.category !== null && categoryId === null) {
        throw new Error(`Kategori bulunamadi: ${productTemplate.category}`);
      }

      const existingProduct = await tx.product.findUnique({
        where: {
          companyId_barcode: {
            barcode: productTemplate.barcode,
            companyId: company.id,
          },
        },
      });

      const minStock = productTemplate.minStock ?? template.defaultMinStock;
      const openingStock = productTemplate.openingStock ?? template.defaultOpeningStock;

      const productData = {
        categoryId,
        description: productTemplate.description,
        isActive: true,
        isQuickAccess: productTemplate.isQuickAccess,
        minStock,
        name: productTemplate.name,
        purchasePrice: productTemplate.purchasePrice,
        quickAccessColor: productTemplate.quickAccessColor,
        quickAccessOrder: productTemplate.quickAccessOrder,
        salePrice: productTemplate.salePrice,
        unitType: productTemplate.unitType,
        vatRate: productTemplate.vatRate,
      } as const;

      let productId = '';
      if (existingProduct) {
        productsUpdated += 1;
        const updatedProduct = await tx.product.update({
          where: { id: existingProduct.id },
          data: {
            ...productData,
            deletedAt: null,
          },
        });
        productId = updatedProduct.id;
      } else {
        productsCreated += 1;
        const createdProduct = await tx.product.create({
          data: {
            ...productData,
            barcode: productTemplate.barcode,
            companyId: company.id,
          },
        });
        productId = createdProduct.id;
      }

      const existingStock = await tx.stockLevel.findUnique({
        where: {
          productId_branchId: {
            branchId: branch.id,
            productId,
          },
        },
      });

      if (existingStock) {
        if (options.overwriteStock) {
          stockUpdated += 1;
          await tx.stockLevel.update({
            where: { id: existingStock.id },
            data: { quantity: openingStock },
          });
        }
      } else {
        stockCreated += 1;
        await tx.stockLevel.create({
          data: {
            branchId: branch.id,
            productId,
            quantity: openingStock,
          },
        });
      }
    }

    return {
      branchCreated,
      companyCreated,
      companyId: company.id,
      companyName: company.name,
      productsCreated,
      productsUpdated,
      registerCreated,
      stockCreated,
      stockUpdated,
    } satisfies ProvisionSummary;
  });
}

function printUsage(): void {
  console.log(`
Kullanim:
  npm run db:provision --workspace @marketpos/api-server -- \\
    --company-name "Ornek Market" \\
    --admin-password "GizliSifre" \\
    --template bakkal-v1

Opsiyonel:
  --company-id <uuid>            Mevcut firmaya template uygular
  --admin-username <string>      Varsayilan: admin
  --admin-full-name <string>     Varsayilan: Sistem Yoneticisi
  --branch-name <string>         Varsayilan: Merkez Sube
  --register-name <string>       Varsayilan: K01
  --tax-number <string>
  --address <string>
  --phone <string>
  --email <string>
  --template <code>              Varsayilan: bakkal-v1
  --template-path <dosya>        JSON template dosyasi
  --package-days <number>        Varsayilan: 365
  --grace-days <number>          Varsayilan: 7
  --overwrite-stock              Mevcut stok miktarlarini template ile yazar
`);
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  if (getBooleanArg(args, 'help')) {
    printUsage();
    return;
  }

  const options = buildOptions(args);
  const templatePath = resolveTemplatePath(args);
  const template = await readTemplate(templatePath);

  const summary = await provisionCompany(options, template);

  console.log('\nProvision tamamlandi.');
  console.log(`Firma: ${summary.companyName} (${summary.companyId})`);
  console.log(`Template: ${template.code} - ${template.displayName}`);
  console.log(`Company: ${summary.companyCreated ? 'created' : 'existing'}`);
  console.log(`Branch: ${summary.branchCreated ? 'created' : 'existing'}`);
  console.log(`Register: ${summary.registerCreated ? 'created' : 'existing'}`);
  console.log(`Products created: ${summary.productsCreated}`);
  console.log(`Products updated: ${summary.productsUpdated}`);
  console.log(`Stock rows created: ${summary.stockCreated}`);
  console.log(`Stock rows updated: ${summary.stockUpdated}`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Provision hatasi: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
