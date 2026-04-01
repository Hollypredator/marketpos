import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';

import prisma from './prisma';
import {
  loadCatalogTemplateByCode,
  TemplateCatalogError,
  type CatalogTemplate,
} from './catalog-templates';

export interface ProvisionCompanyParams {
  actorUserId: string;
  address?: string | null;
  adminFullName: string;
  adminPassword: string;
  adminUsername: string;
  branchName: string;
  companyId?: string;
  companyName?: string;
  email?: string | null;
  graceDays: number;
  overwriteStock: boolean;
  packageDays: number;
  phone?: string | null;
  registerName: string;
  taxNumber?: string | null;
  templateCode: string;
}

export interface ProvisionCompanyResult {
  branch: { id: string; name: string };
  company: { id: string; name: string };
  register: { id: string; name: string };
  stats: {
    categoriesCreatedOrUpdated: number;
    productsCreated: number;
    productsUpdated: number;
    stockCreated: number;
    stockUpdated: number;
  };
  template: {
    code: string;
    displayName: string;
  };
}

export class ProvisioningInputError extends Error {}

function cleanOptional(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateProvisionParams(params: ProvisionCompanyParams): void {
  const usingExisting = typeof params.companyId === 'string' && params.companyId.trim().length > 0;
  const usingNew = typeof params.companyName === 'string' && params.companyName.trim().length > 0;

  if (!usingExisting && !usingNew) {
    throw new ProvisioningInputError('Mevcut firma id veya yeni firma adi zorunludur');
  }
  if (params.adminPassword.trim().length < 6) {
    throw new ProvisioningInputError('Admin sifresi en az 6 karakter olmalidir');
  }
  if (params.packageDays < 1 || params.packageDays > 3650) {
    throw new ProvisioningInputError('Paket gunu 1 ile 3650 arasinda olmalidir');
  }
  if (params.graceDays < 1 || params.graceDays > 30) {
    throw new ProvisioningInputError('Grace gunu 1 ile 30 arasinda olmalidir');
  }
}

async function upsertCategories(
  tx: Prisma.TransactionClient,
  companyId: string,
  template: CatalogTemplate,
): Promise<Map<string, string>> {
  const categoryIdByName = new Map<string, string>();

  for (const category of template.categories) {
    const existing = await tx.category.findFirst({
      where: {
        companyId,
        deletedAt: null,
        name: category.name,
      },
    });

    if (existing) {
      const updated = await tx.category.update({
        where: { id: existing.id },
        data: {
          color: cleanOptional(category.color),
          deletedAt: null,
          sortOrder: category.sortOrder,
        },
      });
      categoryIdByName.set(category.name, updated.id);
      continue;
    }

    const created = await tx.category.create({
      data: {
        color: cleanOptional(category.color),
        companyId,
        name: category.name,
        sortOrder: category.sortOrder,
      },
    });
    categoryIdByName.set(category.name, created.id);
  }

  return categoryIdByName;
}

async function upsertProductsAndStock(params: {
  tx: Prisma.TransactionClient;
  branchId: string;
  categoryIdByName: Map<string, string>;
  companyId: string;
  overwriteStock: boolean;
  template: CatalogTemplate;
}): Promise<{
  productsCreated: number;
  productsUpdated: number;
  stockCreated: number;
  stockUpdated: number;
}> {
  let productsCreated = 0;
  let productsUpdated = 0;
  let stockCreated = 0;
  let stockUpdated = 0;

  for (const productTemplate of params.template.products) {
    const categoryId =
      productTemplate.category === null || productTemplate.category === undefined
        ? null
        : params.categoryIdByName.get(productTemplate.category) ?? null;

    if (productTemplate.category && categoryId === null) {
      throw new ProvisioningInputError(
        `Template kategorisi bulunamadi: ${productTemplate.category}`,
      );
    }

    const existing = await params.tx.product.findUnique({
      where: {
        companyId_barcode: {
          barcode: productTemplate.barcode,
          companyId: params.companyId,
        },
      },
    });

    const minStock = productTemplate.minStock ?? params.template.defaultMinStock;
    const openingStock = productTemplate.openingStock ?? params.template.defaultOpeningStock;

    const patch = {
      categoryId,
      description: cleanOptional(productTemplate.description),
      isActive: true,
      isQuickAccess: productTemplate.isQuickAccess,
      minStock,
      name: productTemplate.name,
      purchasePrice: productTemplate.purchasePrice,
      quickAccessColor: cleanOptional(productTemplate.quickAccessColor),
      quickAccessOrder: productTemplate.quickAccessOrder ?? null,
      salePrice: productTemplate.salePrice,
      unitType: productTemplate.unitType,
      vatRate: productTemplate.vatRate,
    } as const;

    const product = existing
      ? await params.tx.product.update({
          where: { id: existing.id },
          data: {
            ...patch,
            deletedAt: null,
          },
        })
      : await params.tx.product.create({
          data: {
            ...patch,
            barcode: productTemplate.barcode,
            companyId: params.companyId,
          },
        });

    if (existing) {
      productsUpdated += 1;
    } else {
      productsCreated += 1;
    }

    const existingStock = await params.tx.stockLevel.findUnique({
      where: {
        productId_branchId: {
          branchId: params.branchId,
          productId: product.id,
        },
      },
    });

    if (!existingStock) {
      stockCreated += 1;
      await params.tx.stockLevel.create({
        data: {
          branchId: params.branchId,
          productId: product.id,
          quantity: openingStock,
        },
      });
      continue;
    }

    if (params.overwriteStock) {
      stockUpdated += 1;
      await params.tx.stockLevel.update({
        where: { id: existingStock.id },
        data: {
          quantity: openingStock,
        },
      });
    }
  }

  return { productsCreated, productsUpdated, stockCreated, stockUpdated };
}

export async function provisionCompanyFromTemplate(
  params: ProvisionCompanyParams,
): Promise<ProvisionCompanyResult> {
  validateProvisionParams(params);

  let template: CatalogTemplate;
  try {
    template = await loadCatalogTemplateByCode(params.templateCode);
  } catch (error) {
    if (error instanceof TemplateCatalogError) {
      throw new ProvisioningInputError(error.message);
    }
    throw error;
  }

  const now = new Date();
  const packageExpiresAt = new Date(
    now.getTime() + params.packageDays * 24 * 60 * 60 * 1000,
  );
  const packageGraceEndsAt = new Date(
    packageExpiresAt.getTime() + params.graceDays * 24 * 60 * 60 * 1000,
  );
  const adminPasswordHash = await bcrypt.hash(params.adminPassword.trim(), 12);

  return prisma.$transaction(async (tx) => {
    const companyIdInput = params.companyId?.trim() ?? '';
    const companyNameInput = params.companyName?.trim() ?? '';
    const creatingCompany = companyIdInput.length === 0;

    const company = creatingCompany
      ? await tx.company.create({
          data: {
            address: cleanOptional(params.address),
            email: cleanOptional(params.email),
            name: companyNameInput,
            packageExpiresAt,
            packageGraceDays: params.graceDays,
            packageGraceEndsAt,
            packageStartedAt: now,
            phone: cleanOptional(params.phone),
            taxNumber: cleanOptional(params.taxNumber),
          },
        })
      : await tx.company.findFirst({
          where: {
            deletedAt: null,
            id: companyIdInput,
          },
        });

    if (!company) {
      throw new ProvisioningInputError(`Firma bulunamadi: ${companyIdInput}`);
    }

    const normalizedBranchName = params.branchName.trim();
    const normalizedRegisterName = params.registerName.trim();

    let branch = await tx.branch.findFirst({
      where: {
        companyId: company.id,
        deletedAt: null,
        name: normalizedBranchName,
      },
    });
    if (!branch) {
      branch = await tx.branch.create({
        data: {
          address: cleanOptional(params.address) ?? company.address,
          companyId: company.id,
          name: normalizedBranchName,
          phone: cleanOptional(params.phone) ?? company.phone,
        },
      });
    }

    let register = await tx.register.findFirst({
      where: {
        branchId: branch.id,
        deletedAt: null,
        name: normalizedRegisterName,
      },
    });
    if (!register) {
      register = await tx.register.create({
        data: {
          branchId: branch.id,
          name: normalizedRegisterName,
        },
      });
    }

    const existingAdmin = await tx.user.findUnique({
      where: {
        companyId_username: {
          companyId: company.id,
          username: params.adminUsername.trim(),
        },
      },
    });

    if (existingAdmin) {
      await tx.user.update({
        where: { id: existingAdmin.id },
        data: {
          branchId: branch.id,
          deletedAt: null,
          fullName: params.adminFullName.trim(),
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
          fullName: params.adminFullName.trim(),
          passwordHash: adminPasswordHash,
          role: 'ADMIN',
          username: params.adminUsername.trim(),
        },
      });
    }

    const categoryIdByName = await upsertCategories(tx, company.id, template);
    const stats = await upsertProductsAndStock({
      tx,
      branchId: branch.id,
      categoryIdByName,
      companyId: company.id,
      overwriteStock: params.overwriteStock,
      template,
    });

    return {
      branch: {
        id: branch.id,
        name: branch.name,
      },
      company: {
        id: company.id,
        name: company.name,
      },
      register: {
        id: register.id,
        name: register.name,
      },
      stats: {
        categoriesCreatedOrUpdated: template.categories.length,
        productsCreated: stats.productsCreated,
        productsUpdated: stats.productsUpdated,
        stockCreated: stats.stockCreated,
        stockUpdated: stats.stockUpdated,
      },
      template: {
        code: template.code,
        displayName: template.displayName,
      },
    };
  });
}
