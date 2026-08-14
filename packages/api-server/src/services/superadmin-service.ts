import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';
import { DefaultCatalogService } from '../lib/catalog/defaultCatalogService';
import { listCatalogTemplateSummaries } from '../lib/catalog-templates';

export interface OnboardTenantInput {
  companyName: string;
  adminFullName: string;
  adminUsername: string;
  adminPassword: string;
  adminEmail?: string;
  branchName?: string;
  registerName?: string;
  taxNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  templateCode?: string;
  packageDays?: number;
}

export class SuperAdminService {
  /**
   * Get central system-wide platform statistics & telemetry
   */
  static async getOverview() {
    const now = new Date();
    const [totalCompanies, totalBranches, totalRegisters, totalUsers, totalSales, salesVolumeResult] = await Promise.all([
      prisma.company.count({ where: { deletedAt: null } }),
      prisma.branch.count({ where: { deletedAt: null } }),
      prisma.register.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.sale.count({ where: { deletedAt: null } }),
      prisma.sale.aggregate({
        _sum: { grandTotal: true },
        where: { deletedAt: null, status: 'COMPLETED' },
      }),
    ]);

    const companies = await prisma.company.findMany({
      select: {
        id: true,
        isActive: true,
        packageExpiresAt: true,
        packageStatus: true,
      },
      where: { deletedAt: null },
    });

    let activeCount = 0;
    let suspendedCount = 0;
    let expiredCount = 0;

    for (const c of companies) {
      if (c.packageStatus === 'SUSPENDED' || !c.isActive) {
        suspendedCount++;
      } else if (c.packageExpiresAt && c.packageExpiresAt < now) {
        expiredCount++;
      } else {
        activeCount++;
      }
    }

    const availableTemplates = await listCatalogTemplateSummaries();

    return {
      branches: totalBranches,
      companies: {
        active: activeCount,
        expired: expiredCount,
        suspended: suspendedCount,
        total: totalCompanies,
      },
      registers: totalRegisters,
      sales: {
        totalCount: totalSales,
        totalVolume: salesVolumeResult._sum.grandTotal || 0,
      },
      templates: availableTemplates,
      users: totalUsers,
    };
  }

  /**
   * List all market tenants with search, pagination, and status filters
   */
  static async listTenants(options: { page?: number; limit?: number; search?: string; status?: string }) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (options.search?.trim()) {
      where.OR = [
        { name: { contains: options.search.trim() } },
        { taxNumber: { contains: options.search.trim() } },
        { email: { contains: options.search.trim() } },
      ];
    }

    if (options.status === 'SUSPENDED') {
      where.packageStatus = 'SUSPENDED';
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        include: {
          _count: {
            select: {
              branches: true,
              products: true,
              sales: true,
              users: true,
            },
          },
          branches: {
            select: {
              id: true,
              name: true,
              registers: { select: { id: true, name: true } },
            },
            where: { deletedAt: null },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        where,
      }),
      prisma.company.count({ where }),
    ]);

    const now = new Date();
    const rows = companies.map((c) => {
      let runtimeStatus: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' = 'ACTIVE';
      if (c.packageStatus === 'SUSPENDED' || !c.isActive) {
        runtimeStatus = 'SUSPENDED';
      } else if (c.packageExpiresAt && c.packageExpiresAt < now) {
        runtimeStatus = 'EXPIRED';
      }

      let daysRemaining: number | null = null;
      if (c.packageExpiresAt) {
        const diffMs = c.packageExpiresAt.getTime() - now.getTime();
        daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      }

      return {
        address: c.address,
        branchCount: c._count.branches,
        branches: c.branches,
        createdAt: c.createdAt.toISOString(),
        daysRemaining,
        email: c.email,
        id: c.id,
        licenseKey: c.licenseKey,
        name: c.name,
        packageExpiresAt: c.packageExpiresAt?.toISOString() || null,
        phone: c.phone,
        productCount: c._count.products,
        runtimeStatus,
        salesCount: c._count.sales,
        taxNumber: c.taxNumber,
        userCount: c._count.users,
      };
    });

    return {
      data: rows,
      pagination: {
        limit,
        page,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 1-Click Tenant Onboarding: Creates Company, Branch, Register, Admin User, and Seeds Catalog Template
   */
  static async onboardTenant(input: OnboardTenantInput, actorUserId?: string) {
    const now = new Date();
    const packageDays = input.packageDays || 365;
    const packageExpiresAt = new Date(now.getTime() + packageDays * 24 * 60 * 60 * 1000);
    const packageGraceEndsAt = new Date(packageExpiresAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const passwordHash = await bcrypt.hash(input.adminPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Company
      const company = await tx.company.create({
        data: {
          address: input.address || null,
          email: input.email || input.adminEmail || null,
          name: input.companyName.trim(),
          packageExpiresAt,
          packageGraceDays: 7,
          packageGraceEndsAt,
          packageStartedAt: now,
          packageStatus: 'ACTIVE',
          phone: input.phone || null,
          taxNumber: input.taxNumber || null,
        },
      });

      // 2. Create Branch
      const branch = await tx.branch.create({
        data: {
          address: company.address,
          companyId: company.id,
          name: input.branchName || 'Merkez Şube',
          phone: company.phone,
        },
      });

      // 3. Create Register
      const register = await tx.register.create({
        data: {
          branchId: branch.id,
          name: input.registerName || 'Kasa 01',
        },
      });

      // 4. Create Admin User
      const adminUser = await tx.user.create({
        data: {
          branchId: branch.id,
          companyId: company.id,
          email: input.adminEmail || input.email || null,
          fullName: input.adminFullName.trim(),
          passwordHash,
          role: 'ADMIN',
          username: input.adminUsername.trim(),
        },
      });

      // 5. Create Audit Log
      await tx.companySubscriptionAudit.create({
        data: {
          actorType: actorUserId ? 'USER' : 'SYSTEM',
          actorUserId: actorUserId || null,
          companyId: company.id,
          eventType: 'SYSTEM_RESTORE_ACTIVE',
          nextPayload: {
            adminUsername: adminUser.username,
            branchName: branch.name,
            companyName: company.name,
            templateCode: input.templateCode,
          },
          nextStatus: 'ACTIVE',
          note: `Market kuruldu: ${company.name} (Şablon: ${input.templateCode})`,
        },
      });

      return { adminUser, branch, company, register };
    });

    // Seed default catalog asynchronously in background
    void DefaultCatalogService.seedForCompany(result.company.id).catch((err) => {
      console.error(`Catalog seeding failed for company ${result.company.id}:`, err);
    });

    return {
      adminUsername: result.adminUser.username,
      branchId: result.branch.id,
      companyId: result.company.id,
      companyName: result.company.name,
      packageExpiresAt: result.company.packageExpiresAt?.toISOString() || null,
      registerId: result.register.id,
    };
  }

  /**
   * Update Tenant Access Status (ACTIVE / SUSPENDED)
   */
  static async updateTenantStatus(companyId: string, status: 'ACTIVE' | 'SUSPENDED', note?: string, actorUserId?: string) {
    const existing = await prisma.company.findFirst({ where: { deletedAt: null, id: companyId } });
    if (!existing) {
      throw new Error('Market bulunamadı');
    }

    const updated = await prisma.company.update({
      data: {
        isActive: status === 'ACTIVE',
        packageStatus: status,
        updatedAt: new Date(),
      },
      where: { id: companyId },
    });

    await prisma.companySubscriptionAudit.create({
      data: {
        actorType: actorUserId ? 'USER' : 'SYSTEM',
        actorUserId: actorUserId || null,
        companyId,
        eventType: status === 'SUSPENDED' ? 'SUSPEND_MANUAL' : 'UNSUSPEND_MANUAL',
        nextPayload: { packageStatus: status },
        nextStatus: status,
        note: note || `Market durumu değiştirildi: ${status}`,
        previousStatus: existing.packageStatus,
      },
    });

    return updated;
  }

  /**
   * Reset Admin Password for a specific market tenant
   */
  static async resetAdminPassword(companyId: string, newPassword: string) {
    const adminUser = await prisma.user.findFirst({
      where: { companyId, deletedAt: null, role: 'ADMIN' },
    });

    if (!adminUser) {
      throw new Error('Market yöneticisi bulunamadı');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      data: { passwordHash },
      where: { id: adminUser.id },
    });

    return { success: true, username: adminUser.username };
  }

  /**
   * List system audit logs across all companies
   */
  static async getAuditLogs(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      prisma.companySubscriptionAudit.findMany({
        include: {
          actorUser: { select: { fullName: true, role: true, username: true } },
          company: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.companySubscriptionAudit.count(),
    ]);

    return {
      data: logs.map((log) => ({
        actorName: log.actorUser?.fullName || 'Sistem',
        companyName: log.company?.name || 'Sistem',
        createdAt: log.createdAt.toISOString(),
        eventType: log.eventType,
        id: log.id,
        nextStatus: log.nextStatus,
        note: log.note,
        previousStatus: log.previousStatus,
      })),
      pagination: { limit, page, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }
}
