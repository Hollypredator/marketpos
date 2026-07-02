import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import Fastify from 'fastify';

process.env.SYNC_V2_ENABLED = process.env.SYNC_V2_ENABLED ?? 'true';

const {
  buildCompanyAccessSnapshot,
  buildPackageGraceEndsAt,
  calculateQuickRenewedExpiresAt,
  endOfTrDay,
  normalizePackageGraceDays,
} = await import('../dist/lib/company-access.js');
const {
  findRestrictedSubscriptionFields,
  mapSystemEventType,
} = await import('../dist/lib/subscription-admin-helpers.js');
const {
  ensureCompanyOwnership,
  resolveScopedCompanyId,
} = await import('../dist/lib/request-scope.js');
const {
  canAssignRole,
  canManageRole,
} = await import('../dist/lib/role-hierarchy.js');
const { authPlugin } = await import('../dist/plugins/auth.js');
const { authRoutes } = await import('../dist/routes/auth.js');
const { refundRoutes } = await import('../dist/routes/refunds.js');
const { reportRoutes } = await import('../dist/routes/reports.js');
const { saleRoutes } = await import('../dist/routes/sales.js');
const { purchaseInvoiceRoutes } = await import('../dist/routes/purchase-invoices.js');
const { supplierRoutes } = await import('../dist/routes/suppliers.js');
const { syncRoutes } = await import('../dist/routes/sync.js');
const { subscriptionRoutes } = await import('../dist/routes/subscription.js');
const { userRoutes } = await import('../dist/routes/users.js');
const prisma = (await import('../dist/lib/prisma.js')).default;
const { DefaultCatalogService } = await import('../dist/lib/catalog/defaultCatalogService.js');

function cloneDate(value) {
  return value instanceof Date ? new Date(value) : value;
}

function createCompanyFixture(overrides = {}) {
  return {
    address: 'Demo Address',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    deletedAt: null,
    email: 'demo@example.com',
    id: 'company-1',
    isActive: true,
    name: 'Demo Company',
    packageExpiresAt: new Date('2025-01-10T03:00:00.000Z'),
    packageGraceDays: 7,
    packageGraceEndsAt: new Date('2025-01-17T20:59:59.999Z'),
    packageStartedAt: new Date('2024-01-10T00:00:00.000Z'),
    packageStatus: 'ACTIVE',
    packageType: 'YEARLY',
    phone: '5550000000',
    taxNumber: '1234567890',
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function cloneCompany(company) {
  return {
    ...company,
    createdAt: cloneDate(company.createdAt),
    deletedAt: cloneDate(company.deletedAt),
    packageExpiresAt: cloneDate(company.packageExpiresAt),
    packageGraceEndsAt: cloneDate(company.packageGraceEndsAt),
    packageStartedAt: cloneDate(company.packageStartedAt),
    updatedAt: cloneDate(company.updatedAt),
  };
}

function installPrismaMocks(company, auditRows) {
  const usersById = new Map([
    [
      'super-1',
      {
        fullName: 'Super Admin',
        id: 'super-1',
        role: 'SUPER_ADMIN',
        username: 'super-admin',
      },
    ],
  ]);

  let auditCounter = auditRows.length;

  const mockCompanyDelegate = {
    count: async () => 1,
    findFirst: async (args = {}) => {
      const id = args?.where?.id;
      const mustBeUndeleted = args?.where?.deletedAt === null;
      if (id && id !== company.id) {
        return null;
      }
      if (mustBeUndeleted && company.deletedAt !== null) {
        return null;
      }
      return cloneCompany(company);
    },
    findMany: async () => [cloneCompany(company)],
    update: async (args = {}) => {
      if (args?.where?.id !== company.id) {
        throw new Error('Company not found for update');
      }
      Object.assign(company, args?.data ?? {});
      return cloneCompany(company);
    },
  };

  const mockUserDelegate = {
    count: async () => 1,
  };

  const mockBranchDelegate = {
    count: async () => 1,
  };

  const mockAuditDelegate = {
    count: async (args = {}) => {
      const companyId = args?.where?.companyId;
      if (companyId) {
        return auditRows.filter((row) => row.companyId === companyId).length;
      }
      return auditRows.length;
    },
    create: async (args = {}) => {
      auditCounter += 1;
      const data = args?.data ?? {};
      const row = {
        actorType: data.actorType,
        actorUserId: data.actorUserId ?? null,
        companyId: data.companyId,
        createdAt: new Date(Date.now() + auditCounter * 1000),
        eventType: data.eventType,
        id: `audit-${auditCounter}`,
        nextPayload: data.nextPayload,
        nextStatus: data.nextStatus,
        note: data.note ?? null,
        previousPayload: data.previousPayload ?? null,
        previousStatus: data.previousStatus ?? null,
      };
      auditRows.push(row);
      return { ...row };
    },
    findFirst: async (args = {}) => {
      const companyId = args?.where?.companyId;
      const filtered = auditRows
        .filter((row) => row.companyId === companyId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      if (filtered.length === 0) {
        return null;
      }
      const latest = filtered[0];
      return {
        nextPayload: latest.nextPayload,
        nextStatus: latest.nextStatus,
      };
    },
    findMany: async (args = {}) => {
      const companyId = args?.where?.companyId;
      const includeActor = Boolean(args?.include?.actorUser);
      const skip = Number.isFinite(args?.skip) ? args.skip : 0;
      const take = Number.isFinite(args?.take) ? args.take : undefined;

      let rows = auditRows;
      if (companyId) {
        rows = rows.filter((row) => row.companyId === companyId);
      }
      rows = [...rows].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

      if (skip > 0) {
        rows = rows.slice(skip);
      }
      if (typeof take === 'number') {
        rows = rows.slice(0, take);
      }

      return rows.map((row) => ({
        ...row,
        actorUser: includeActor && row.actorUserId ? usersById.get(row.actorUserId) ?? null : undefined,
        createdAt: new Date(row.createdAt),
      }));
    },
    groupBy: async () => {
      const latest = auditRows
        .filter((row) => row.companyId === company.id)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
      return [
        {
          _max: { createdAt: latest?.createdAt ?? null },
          companyId: company.id,
        },
      ];
    },
  };

  const patches = [
    [prisma.company, 'count', mockCompanyDelegate.count],
    [prisma.company, 'findFirst', mockCompanyDelegate.findFirst],
    [prisma.company, 'findMany', mockCompanyDelegate.findMany],
    [prisma.company, 'update', mockCompanyDelegate.update],
    [prisma.user, 'count', mockUserDelegate.count],
    [prisma.branch, 'count', mockBranchDelegate.count],
    [prisma.companySubscriptionAudit, 'count', mockAuditDelegate.count],
    [prisma.companySubscriptionAudit, 'create', mockAuditDelegate.create],
    [prisma.companySubscriptionAudit, 'findFirst', mockAuditDelegate.findFirst],
    [prisma.companySubscriptionAudit, 'findMany', mockAuditDelegate.findMany],
    [prisma.companySubscriptionAudit, 'groupBy', mockAuditDelegate.groupBy],
  ];

  const restoreFns = patches.map(([target, key, replacement]) => {
    const original = target[key];
    target[key] = replacement;
    return () => {
      target[key] = original;
    };
  });

  return () => {
    for (let index = restoreFns.length - 1; index >= 0; index -= 1) {
      restoreFns[index]();
    }
  };
}

async function withSubscriptionServer(run) {
  const company = createCompanyFixture();
  const auditRows = [];
  const restorePrisma = installPrismaMocks(company, auditRows);

  const server = Fastify({ logger: false });
  await authPlugin(server);
  await server.register(subscriptionRoutes, { prefix: '/api/subscription' });
  await server.ready();

  try {
    await run({
      auditRows,
      company,
      makeToken(role, userId = 'super-1') {
        return server.jwt.sign({
          branchId: null,
          companyId: company.id,
          id: userId,
          role,
        });
      },
      server,
    });
  } finally {
    await server.close();
    restorePrisma();
  }
}

async function withAuthGuardsServer(run) {
  const server = Fastify({ logger: false });
  await authPlugin(server);
  server.get(
    '/guard/write',
    {
      preHandler: [server.authenticate, server.ensureBackofficeWriter],
    },
    async () => ({ success: true }),
  );
  server.get(
    '/guard/report',
    {
      preHandler: [server.authenticate, server.ensureReportReader],
    },
    async () => ({ success: true }),
  );
  await server.ready();

  try {
    await run({
      makeToken(role) {
        return server.jwt.sign({
          branchId: null,
          companyId: 'company-1',
          id: `${role.toLowerCase()}-1`,
          role,
        });
      },
      server,
    });
  } finally {
    await server.close();
  }
}

async function withSalesAndRefundsSchemaServer(run) {
  const originalCompanyFindFirst = prisma.company.findFirst;
  prisma.company.findFirst = async () => ({
    deletedAt: null,
    id: 'company-1',
    isActive: true,
    packageExpiresAt: new Date('2030-01-10T03:00:00.000Z'),
    packageGraceDays: 7,
    packageGraceEndsAt: new Date('2030-01-17T20:59:59.999Z'),
    packageStatus: 'ACTIVE',
  });

  const server = Fastify({ logger: false });
  await authPlugin(server);
  await server.register(saleRoutes, { prefix: '/api/sales' });
  await server.register(refundRoutes, { prefix: '/api/refunds' });
  await server.ready();

  try {
    await run({
      makeToken(role = 'ADMIN') {
        return server.jwt.sign({
          branchId: 'branch-1',
          companyId: 'company-1',
          id: `${role.toLowerCase()}-1`,
          role,
        });
      },
      server,
    });
  } finally {
    await server.close();
    prisma.company.findFirst = originalCompanyFindFirst;
  }
}

function installSyncRoutePrismaMocks() {
  const company = {
    deletedAt: null,
    id: 'company-1',
    isActive: true,
    packageExpiresAt: new Date('2030-01-10T03:00:00.000Z'),
    packageGraceDays: 7,
    packageGraceEndsAt: new Date('2030-01-17T20:59:59.999Z'),
    packageStatus: 'ACTIVE',
  };

  const register = {
    branch: {
      companyId: 'company-1',
      id: 'branch-1',
      name: 'Merkez',
    },
    branchId: 'branch-1',
    id: '11111111-1111-4111-8111-111111111111',
  };

  const ingestionStore = new Map();

  const patches = [
    [prisma.company, 'findFirst', async () => company],
    [prisma.register, 'findFirst', async (args = {}) => {
      if (args?.where?.id && args.where.id !== register.id) {
        return null;
      }
      return {
        ...register,
        branch: { companyId: register.branch.companyId },
      };
    }],
    [prisma.register, 'findUnique', async (args = {}) => {
      if (args?.where?.id && args.where.id !== register.id) {
        return null;
      }
      return {
        ...register,
      };
    }],
    [prisma.syncLog, 'create', async () => ({ id: 'sync-log-1' })],
    [prisma.product, 'findMany', async () => []],
    [prisma.category, 'findMany', async () => []],
    [prisma.user, 'findMany', async () => []],
    [prisma.stockLevel, 'findMany', async () => []],
    [prisma.supplier, 'findMany', async () => []],
    [prisma.purchaseInvoice, 'findMany', async () => []],
    [prisma.customer, 'findMany', async () => []],
    [prisma, '$queryRawUnsafe', async (query, ...params) => {
      if (typeof query !== 'string' || !query.includes('FROM sync_ingestion_operations')) {
        return [];
      }
      const [registerId, operationKey] = params;
      const key = `${registerId}:${operationKey}`;
      const row = ingestionStore.get(key);
      return row ? [row] : [];
    }],
    [prisma, '$executeRawUnsafe', async (query, ...params) => {
      if (typeof query !== 'string') {
        return 0;
      }
      if (query.includes('INSERT INTO sync_ingestion_operations')) {
        const [registerId, operationKey, entityType, localId, status, payloadHash, errorCode, errorMessage] = params;
        const key = `${registerId}:${operationKey}`;
        ingestionStore.set(key, {
          entity_type: entityType,
          error_code: errorCode ?? null,
          error_message: errorMessage ?? null,
          local_id: localId,
          operation_key: operationKey,
          payload_hash: payloadHash ?? null,
          status,
        });
        return 1;
      }
      return 0;
    }],
  ];

  const restoreFns = patches.map(([target, key, replacement]) => {
    const original = target[key];
    target[key] = replacement;
    return () => {
      target[key] = original;
    };
  });

  return () => {
    for (let index = restoreFns.length - 1; index >= 0; index -= 1) {
      restoreFns[index]();
    }
  };
}

async function withSyncRoutesServer(run) {
  const restorePrisma = installSyncRoutePrismaMocks();
  const server = Fastify({ logger: false });
  await authPlugin(server);

  const routeHitCount = {
    productOps: 0,
    refunds: 0,
    sales: 0,
    stockOps: 0,
  };

  server.post('/api/sales', async () => {
    routeHitCount.sales += 1;
    return { data: { id: `sale-${routeHitCount.sales}` }, success: true };
  });
  server.post('/api/refunds', async () => {
    routeHitCount.refunds += 1;
    return { data: { id: `refund-${routeHitCount.refunds}` }, success: true };
  });
  server.post('/api/stock/movement', async () => {
    routeHitCount.stockOps += 1;
    return { data: { id: `movement-${routeHitCount.stockOps}` }, success: true };
  });
  server.post('/api/products', async () => {
    routeHitCount.productOps += 1;
    return { data: { id: `product-${routeHitCount.productOps}` }, success: true };
  });
  server.put('/api/products/:id', async () => {
    routeHitCount.productOps += 1;
    return { data: { id: `product-${routeHitCount.productOps}` }, success: true };
  });

  await server.register(syncRoutes, { prefix: '/api/sync' });
  await server.ready();

  try {
    await run({
      makeToken(role = 'ADMIN') {
        return server.jwt.sign({
          branchId: 'branch-1',
          companyId: 'company-1',
          id: `${role.toLowerCase()}-1`,
          role,
        });
      },
      routeHitCount,
      server,
    });
  } finally {
    await server.close();
    restorePrisma();
  }
}

function createUserFixtureList(companyId) {
  const createdAt = new Date('2025-01-01T00:00:00.000Z');
  const updatedAt = new Date('2025-01-01T00:00:00.000Z');
  return [
    {
      branchId: null,
      companyId,
      createdAt,
      deletedAt: null,
      email: 'admin-1@demo.test',
      fullName: 'Admin Actor',
      id: 'admin-1',
      isActive: true,
      passwordHash: 'hash-admin-1',
      pin: null,
      role: 'ADMIN',
      updatedAt,
      username: 'admin-1',
    },
    {
      branchId: null,
      companyId,
      createdAt,
      deletedAt: null,
      email: 'admin-2@demo.test',
      fullName: 'Admin Peer',
      id: 'admin-2',
      isActive: true,
      passwordHash: 'hash-admin-2',
      pin: null,
      role: 'ADMIN',
      updatedAt,
      username: 'admin-2',
    },
    {
      branchId: null,
      companyId,
      createdAt,
      deletedAt: null,
      email: 'cashier-1@demo.test',
      fullName: 'Cashier One',
      id: 'cashier-1',
      isActive: true,
      passwordHash: 'hash-cashier-1',
      pin: null,
      role: 'CASHIER',
      updatedAt,
      username: 'cashier-1',
    },
  ];
}

function installUsersPrismaMocks(company, users) {
  let userCounter = users.length;

  const mockCompanyDelegate = {
    findFirst: async (args = {}) => {
      const id = args?.where?.id;
      if (id && id !== company.id) {
        return null;
      }
      return cloneCompany(company);
    },
  };

  const mockBranchDelegate = {
    findFirst: async (args = {}) => {
      const requestedCompanyId = args?.where?.companyId;
      const requestedBranchId = args?.where?.id;
      if (!requestedBranchId || requestedCompanyId !== company.id) {
        return null;
      }
      if (requestedBranchId !== 'branch-1') {
        return null;
      }
      return {
        companyId: company.id,
        deletedAt: null,
        id: 'branch-1',
        name: 'Merkez',
      };
    },
  };

  const cloneUser = (user) => ({
    ...user,
    createdAt: cloneDate(user.createdAt),
    deletedAt: cloneDate(user.deletedAt),
    updatedAt: cloneDate(user.updatedAt),
  });

  const findUserById = (id) =>
    users.find((row) => row.id === id && row.deletedAt === null) ?? null;

  const matchesUserWhere = (row, where = {}) => {
    if (where.deletedAt === null && row.deletedAt !== null) {
      return false;
    }
    if (typeof where.id === 'string' && row.id !== where.id) {
      return false;
    }
    if (typeof where.companyId === 'string' && row.companyId !== where.companyId) {
      return false;
    }
    if (typeof where.email === 'string' && row.email !== where.email) {
      return false;
    }
    if (typeof where.username === 'string' && row.username !== where.username) {
      return false;
    }
    if (where.NOT && typeof where.NOT === 'object' && typeof where.NOT.id === 'string' && row.id === where.NOT.id) {
      return false;
    }
    return true;
  };

  const mockUserDelegate = {
    count: async (args = {}) => {
      const companyId = args?.where?.companyId;
      return users.filter((row) => {
        if (row.deletedAt !== null) {
          return false;
        }
        if (!companyId) {
          return true;
        }
        return row.companyId === companyId;
      }).length;
    },
    create: async (args = {}) => {
      const data = args?.data ?? {};
      userCounter += 1;
      const now = new Date(Date.now() + userCounter * 1_000);
      const row = {
        branchId: data.branchId ?? null,
        companyId: data.companyId,
        createdAt: now,
        deletedAt: null,
        email: data.email ?? null,
        fullName: data.fullName,
        id: `user-${userCounter}`,
        isActive: true,
        passwordHash: data.passwordHash,
        pin: data.pin ?? null,
        role: data.role,
        updatedAt: now,
        username: data.username,
      };
      users.push(row);
      return cloneUser(row);
    },
    findFirst: async (args = {}) => {
      const where = args?.where ?? {};
      if (typeof where.id === 'string') {
        const rowById = findUserById(where.id);
        return rowById ? cloneUser(rowById) : null;
      }
      const row = users.find((candidate) => matchesUserWhere(candidate, where)) ?? null;
      return row ? cloneUser(row) : null;
    },
    findMany: async (args = {}) => {
      const companyId = args?.where?.companyId;
      const filtered = users.filter((row) => {
        if (row.deletedAt !== null) {
          return false;
        }
        if (!companyId) {
          return true;
        }
        return row.companyId === companyId;
      });
      return filtered.map(cloneUser);
    },
    update: async (args = {}) => {
      const id = args?.where?.id;
      const data = args?.data ?? {};
      const index = users.findIndex((row) => row.id === id);
      if (index < 0) {
        throw new Error('User not found for update');
      }
      users[index] = {
        ...users[index],
        ...data,
        updatedAt: new Date(Date.now() + (userCounter + 1) * 1_000),
      };
      return cloneUser(users[index]);
    },
  };

  const patches = [
    [prisma.company, 'findFirst', mockCompanyDelegate.findFirst],
    [prisma.branch, 'findFirst', mockBranchDelegate.findFirst],
    [prisma.user, 'count', mockUserDelegate.count],
    [prisma.user, 'create', mockUserDelegate.create],
    [prisma.user, 'findFirst', mockUserDelegate.findFirst],
    [prisma.user, 'findMany', mockUserDelegate.findMany],
    [prisma.user, 'update', mockUserDelegate.update],
  ];

  const restoreFns = patches.map(([target, key, replacement]) => {
    const original = target[key];
    target[key] = replacement;
    return () => {
      target[key] = original;
    };
  });

  return () => {
    for (let index = restoreFns.length - 1; index >= 0; index -= 1) {
      restoreFns[index]();
    }
  };
}

async function withUsersServer(run) {
  const company = createCompanyFixture({
    id: '11111111-1111-4111-8111-111111111111',
    packageExpiresAt: new Date('2030-01-10T03:00:00.000Z'),
    packageGraceEndsAt: new Date('2030-01-17T20:59:59.999Z'),
    packageStatus: 'ACTIVE',
  });
  const users = createUserFixtureList(company.id);
  const restorePrisma = installUsersPrismaMocks(company, users);

  const server = Fastify({ logger: false });
  await authPlugin(server);
  await server.register(userRoutes, { prefix: '/api/users' });
  await server.ready();

  try {
    await run({
      company,
      makeToken(role, userId = 'admin-1') {
        return server.jwt.sign({
          branchId: null,
          companyId: company.id,
          id: userId,
          role,
        });
      },
      server,
      users,
    });
  } finally {
    await server.close();
    restorePrisma();
  }
}

function installAuthPrismaMocks(companies, users) {
  let refreshCounter = 0;
  const companyById = new Map(companies.map((company) => [company.id, company]));

  const cloneUserWithRelations = (user) => ({
    ...user,
    branch: user.branchId
      ? {
          id: user.branchId,
          name: 'Merkez',
        }
      : null,
    company: cloneCompany(companyById.get(user.companyId)),
    createdAt: cloneDate(user.createdAt),
    deletedAt: cloneDate(user.deletedAt),
    updatedAt: cloneDate(user.updatedAt),
  });

  const mockUserDelegate = {
    findFirst: async (args = {}) => {
      const where = args?.where ?? {};
      const row =
        users.find((candidate) => {
          if (where.deletedAt === null && candidate.deletedAt !== null) {
            return false;
          }
          if (where.isActive === true && candidate.isActive !== true) {
            return false;
          }
          if (typeof where.email === 'string' && candidate.email !== where.email) {
            return false;
          }
          if (typeof where.username === 'string' && candidate.username !== where.username) {
            return false;
          }
          if (typeof where.companyId === 'string' && candidate.companyId !== where.companyId) {
            return false;
          }
          return true;
        }) ?? null;

      return row ? cloneUserWithRelations(row) : null;
    },
  };

  const mockRefreshTokenDelegate = {
    create: async (args = {}) => {
      const data = args?.data ?? {};
      refreshCounter += 1;
      return {
        ...data,
        id: `refresh-${refreshCounter}`,
      };
    },
  };

  const patches = [
    [prisma.user, 'findFirst', mockUserDelegate.findFirst],
    [prisma.refreshToken, 'create', mockRefreshTokenDelegate.create],
  ];

  const restoreFns = patches.map(([target, key, replacement]) => {
    const original = target[key];
    target[key] = replacement;
    return () => {
      target[key] = original;
    };
  });

  return () => {
    for (let index = restoreFns.length - 1; index >= 0; index -= 1) {
      restoreFns[index]();
    }
  };
}

async function withAuthRoutesServer(run) {
  const companyOne = createCompanyFixture({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Tenant One',
    packageExpiresAt: new Date('2030-01-10T03:00:00.000Z'),
    packageGraceEndsAt: new Date('2030-01-17T20:59:59.999Z'),
    packageStatus: 'ACTIVE',
  });
  const companyTwo = createCompanyFixture({
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Tenant Two',
    packageExpiresAt: new Date('2030-02-10T03:00:00.000Z'),
    packageGraceEndsAt: new Date('2030-02-17T20:59:59.999Z'),
    packageStatus: 'ACTIVE',
  });
  const hashedPassword = await bcrypt.hash('Strong123', 4);
  const createdAt = new Date('2025-01-01T00:00:00.000Z');
  const users = [
    {
      branchId: null,
      companyId: companyOne.id,
      createdAt,
      deletedAt: null,
      email: 'admin@tenant-one.test',
      fullName: 'Tenant One Admin',
      id: 'auth-user-1',
      isActive: true,
      passwordHash: hashedPassword,
      pin: null,
      role: 'ADMIN',
      updatedAt: createdAt,
      username: 'admin',
    },
    {
      branchId: null,
      companyId: companyTwo.id,
      createdAt,
      deletedAt: null,
      email: 'admin@tenant-two.test',
      fullName: 'Tenant Two Admin',
      id: 'auth-user-2',
      isActive: true,
      passwordHash: hashedPassword,
      pin: null,
      role: 'ADMIN',
      updatedAt: createdAt,
      username: 'admin',
    },
  ];

  const restorePrisma = installAuthPrismaMocks([companyOne, companyTwo], users);
  const server = Fastify({ logger: false });
  await authPlugin(server);
  await server.register(authRoutes, { prefix: '/api/auth' });
  await server.ready();

  try {
    await run({
      companyOne,
      companyTwo,
      server,
    });
  } finally {
    await server.close();
    restorePrisma();
  }
}

function installReportsPrismaMocks(company) {
  const registerId = '11111111-1111-4111-8111-111111111111';
  const mockCompanyDelegate = {
    findFirst: async (args = {}) => {
      const id = args?.where?.id;
      if (id && id !== company.id) {
        return null;
      }
      return cloneCompany(company);
    },
  };

  const mockBranchDelegate = {
    findFirst: async (args = {}) => {
      const id = args?.where?.id;
      const scopedCompanyId = args?.where?.companyId;
      if (scopedCompanyId !== company.id) {
        return null;
      }
      if (id !== 'branch-1') {
        return null;
      }
      return { id: 'branch-1', name: 'Merkez' };
    },
    findMany: async (args = {}) => {
      if (args?.include?.registers) {
        return [
          {
            id: 'branch-1',
            name: 'Merkez',
            registers: [
              {
                id: registerId,
                isActive: true,
                name: 'Kasa 1',
              },
            ],
          },
        ];
      }
      return [{ id: 'branch-1', name: 'Merkez' }];
    },
  };

  const mockSaleDelegate = {
    aggregate: async () => ({
      _count: 1,
      _sum: {
        grandTotal: 100,
        totalDiscount: 0,
        totalVat: 10,
      },
    }),
    groupBy: async () => [
      {
        _count: 3,
        _sum: {
          grandTotal: 300,
          totalVat: 30,
        },
        branchId: 'branch-1',
      },
    ],
  };

  const mockRefundDelegate = {
    aggregate: async () => ({
      _count: 0,
      _sum: {
        totalAmount: 0,
      },
    }),
    groupBy: async () => [
      {
        _count: 1,
        _sum: {
          totalAmount: 25,
        },
        branchId: 'branch-1',
      },
    ],
  };

  const mockPaymentDelegate = {
    groupBy: async () => [],
  };

  const mockRegisterSessionDelegate = {
    count: async () => 2,
    findMany: async (args = {}) => {
      if (args?.where?.status === 'OPEN') {
        return [
          {
            registerId,
            updatedAt: new Date('2026-03-02T12:00:00.000Z'),
          },
        ];
      }
      return [
        {
          closedAt: new Date('2026-03-02T12:00:00.000Z'),
          closingBalance: 500,
          createdAt: new Date('2026-03-02T08:00:00.000Z'),
          difference: 0,
          id: 'session-1',
          openingBalance: 300,
          register: { name: 'Kasa 1' },
          status: 'CLOSED',
          user: { fullName: 'Kasiyer 1' },
        },
        {
          closedAt: new Date('2026-03-01T20:00:00.000Z'),
          closingBalance: 420,
          createdAt: new Date('2026-03-01T10:00:00.000Z'),
          difference: -5,
          id: 'session-2',
          openingBalance: 250,
          register: { name: 'Kasa 1' },
          status: 'CLOSED',
          user: { fullName: 'Kasiyer 2' },
        },
      ];
    },
  };

  const mockSyncLogDelegate = {
    groupBy: async (args = {}) => {
      const by = Array.isArray(args?.by) ? args.by : [];
      if (by.includes('status')) {
        return [
          {
            _count: { _all: 3 },
            registerId,
            status: 'PENDING',
          },
          {
            _count: { _all: 1 },
            registerId,
            status: 'FAILED',
          },
        ];
      }
      return [
        {
          _max: {
            createdAt: new Date('2026-03-02T12:00:00.000Z'),
            syncedAt: new Date('2026-03-02T12:00:00.000Z'),
          },
          registerId,
        },
      ];
    },
  };

  const patches = [
    [prisma.company, 'findFirst', mockCompanyDelegate.findFirst],
    [prisma.branch, 'findFirst', mockBranchDelegate.findFirst],
    [prisma.branch, 'findMany', mockBranchDelegate.findMany],
    [prisma.sale, 'aggregate', mockSaleDelegate.aggregate],
    [prisma.sale, 'groupBy', mockSaleDelegate.groupBy],
    [prisma.refund, 'aggregate', mockRefundDelegate.aggregate],
    [prisma.refund, 'groupBy', mockRefundDelegate.groupBy],
    [prisma.payment, 'groupBy', mockPaymentDelegate.groupBy],
    [prisma.registerSession, 'findMany', mockRegisterSessionDelegate.findMany],
    [prisma.registerSession, 'count', mockRegisterSessionDelegate.count],
    [prisma.syncLog, 'groupBy', mockSyncLogDelegate.groupBy],
    [prisma, '$queryRawUnsafe', async (query) => {
      if (typeof query !== 'string') {
        return [];
      }
      if (query.includes('FROM register_sync_snapshots')) {
        return [
          {
            last_sync_error_code: null,
            last_sync_status: 'OK',
            oldest_pending_age_sec: 120,
            pending_count: 3,
            product_ops: 0,
            queue_peak: 8,
            refunds: 0,
            register_id: registerId,
            sales: 3,
            server_observed_at: new Date('2026-03-02T12:00:00.000Z'),
            stock_ops: 0,
          },
        ];
      }
      if (query.includes('FROM sync_ingestion_operations')) {
        return [
          {
            accepted_24h: 10,
            failed_24h: 2,
            register_id: registerId,
            replayed_24h: 5,
          },
        ];
      }
      return [];
    }],
  ];

  const restoreFns = patches.map(([target, key, replacement]) => {
    const original = target[key];
    target[key] = replacement;
    return () => {
      target[key] = original;
    };
  });

  return () => {
    for (let index = restoreFns.length - 1; index >= 0; index -= 1) {
      restoreFns[index]();
    }
  };
}

async function withReportsServer(run) {
  const company = createCompanyFixture({
    id: '11111111-1111-4111-8111-111111111111',
    packageExpiresAt: new Date('2030-01-10T03:00:00.000Z'),
    packageGraceEndsAt: new Date('2030-01-17T20:59:59.999Z'),
    packageStatus: 'ACTIVE',
  });
  const restorePrisma = installReportsPrismaMocks(company);

  const server = Fastify({ logger: false });
  await authPlugin(server);
  await server.register(reportRoutes, { prefix: '/api/reports' });
  await server.ready();

  try {
    await run({
      company,
      makeToken(role, options = {}) {
        return server.jwt.sign({
          branchId: options.branchId ?? null,
          companyId: options.companyId ?? company.id,
          id: options.userId ?? `${role.toLowerCase()}-1`,
          role,
        });
      },
      server,
    });
  } finally {
    await server.close();
    restorePrisma();
  }
}

function createUuidFromCounter(counter) {
  return `${String(counter).padStart(8, '0')}-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}

function installPurchaseSupplierPrismaMocks(company) {
  const branch = {
    companyId: company.id,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Merkez',
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const suppliers = new Map([
    [
      '33333333-3333-4333-8333-333333333333',
      {
        address: null,
        balance: 0,
        balanceMinor: 0n,
        companyId: company.id,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
        email: null,
        id: '33333333-3333-4333-8333-333333333333',
        isActive: true,
        name: 'Demo Supplier',
        phone: null,
        taxNumber: null,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  ]);

  const products = new Map([
    [
      '44444444-4444-4444-8444-444444444444',
      {
        barcode: 'P-0001',
        companyId: company.id,
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Demo Product',
        purchasePrice: 10,
        purchasePriceMinor: 1000n,
        salePrice: 20,
        salePriceMinor: 2000n,
      },
    ],
  ]);

  const stockLevels = new Map([
    [
      `${branch.id}:44444444-4444-4444-8444-444444444444`,
      {
        branchId: branch.id,
        id: 'stock-1',
        productId: '44444444-4444-4444-8444-444444444444',
        quantity: 10,
      },
    ],
  ]);
  const stockMovements = [];
  const purchaseInvoices = new Map();
  const purchaseInvoiceItems = new Map();
  const supplierTransactions = [];

  let invoiceCounter = 100;
  let invoiceItemCounter = 200;
  let transactionCounter = 300;

  const clone = (value) => ({ ...value });

  const applyInvoiceWhere = (invoice, where = {}) => {
    if (where.deletedAt === null && invoice.deletedAt !== null) {
      return false;
    }
    if (typeof where.id === 'string' && invoice.id !== where.id) {
      return false;
    }
    if (typeof where.companyId === 'string' && invoice.companyId !== where.companyId) {
      return false;
    }
    if (typeof where.branchId === 'string' && invoice.branchId !== where.branchId) {
      return false;
    }
    if (typeof where.supplierId === 'string' && invoice.supplierId !== where.supplierId) {
      return false;
    }
    if (typeof where.documentType === 'string' && invoice.documentType !== where.documentType) {
      return false;
    }
    if (
      Object.prototype.hasOwnProperty.call(where, 'sourceDispatchId') &&
      invoice.sourceDispatchId !== where.sourceDispatchId
    ) {
      return false;
    }
    if (typeof where.status === 'string' && invoice.status !== where.status) {
      return false;
    }
    return true;
  };

  const applySupplierWhere = (supplier, where = {}) => {
    if (where.deletedAt === null && supplier.deletedAt !== null) {
      return false;
    }
    if (typeof where.id === 'string' && supplier.id !== where.id) {
      return false;
    }
    if (typeof where.companyId === 'string' && supplier.companyId !== where.companyId) {
      return false;
    }
    if (typeof where.isActive === 'boolean' && supplier.isActive !== where.isActive) {
      return false;
    }
    return true;
  };

  const applySupplierTransactionWhere = (transaction, where = {}) => {
    if (typeof where.supplierId === 'string' && transaction.supplierId !== where.supplierId) {
      return false;
    }
    if (typeof where.type === 'string' && transaction.type !== where.type) {
      return false;
    }
    if (where.createdAt && typeof where.createdAt === 'object') {
      if (where.createdAt.gte && transaction.createdAt < where.createdAt.gte) {
        return false;
      }
      if (where.createdAt.lte && transaction.createdAt > where.createdAt.lte) {
        return false;
      }
    }
    return true;
  };

  const mockCompanyDelegate = {
    findFirst: async (args = {}) => {
      if (args?.where?.id && args.where.id !== company.id) {
        return null;
      }
      if (args?.where?.deletedAt === null && company.deletedAt !== null) {
        return null;
      }
      return cloneCompany(company);
    },
  };

  const mockBranchDelegate = {
    findUnique: async (args = {}) => {
      if (args?.where?.id !== branch.id) {
        return null;
      }
      return clone(branch);
    },
  };

  const mockSupplierDelegate = {
    count: async (args = {}) => {
      const where = args?.where ?? {};
      return [...suppliers.values()].filter((row) => applySupplierWhere(row, where)).length;
    },
    create: async (args = {}) => {
      const data = args?.data ?? {};
      const id = createUuidFromCounter(suppliers.size + 900);
      const now = new Date();
      const row = {
        address: data.address ?? null,
        balance: data.balance ?? 0,
        balanceMinor: data.balanceMinor ?? 0n,
        companyId: data.companyId,
        createdAt: now,
        deletedAt: null,
        email: data.email ?? null,
        id,
        isActive: data.isActive ?? true,
        name: data.name,
        phone: data.phone ?? null,
        taxNumber: data.taxNumber ?? null,
        updatedAt: now,
      };
      suppliers.set(id, row);
      return clone(row);
    },
    findFirst: async (args = {}) => {
      const where = args?.where ?? {};
      const row = [...suppliers.values()].find((candidate) => applySupplierWhere(candidate, where));
      return row ? clone(row) : null;
    },
    findMany: async (args = {}) => {
      const where = args?.where ?? {};
      let rows = [...suppliers.values()].filter((candidate) => applySupplierWhere(candidate, where));
      rows = rows.sort((left, right) => left.name.localeCompare(right.name));
      if (Number.isFinite(args?.skip) && args.skip > 0) {
        rows = rows.slice(args.skip);
      }
      if (Number.isFinite(args?.take)) {
        rows = rows.slice(0, args.take);
      }
      return rows.map(clone);
    },
    update: async (args = {}) => {
      const id = args?.where?.id;
      const row = suppliers.get(id);
      if (!row) {
        throw new Error('Supplier not found');
      }
      const data = args?.data ?? {};
      if (data.balance && typeof data.balance === 'object' && typeof data.balance.increment === 'number') {
        row.balance += data.balance.increment;
      } else if (typeof data.balance === 'number') {
        row.balance = data.balance;
      }
      if (data.balanceMinor && typeof data.balanceMinor === 'object' && typeof data.balanceMinor.increment === 'bigint') {
        row.balanceMinor += data.balanceMinor.increment;
      } else if (typeof data.balanceMinor === 'bigint') {
        row.balanceMinor = data.balanceMinor;
      }
      if (typeof data.name === 'string') {
        row.name = data.name;
      }
      if (typeof data.phone === 'string' || data.phone === null) {
        row.phone = data.phone;
      }
      row.updatedAt = new Date();
      suppliers.set(id, row);
      return clone(row);
    },
  };

  const mockProductDelegate = {
    update: async (args = {}) => {
      const id = args?.where?.id;
      const row = products.get(id);
      if (!row) {
        throw new Error('Product not found');
      }
      const data = args?.data ?? {};
      if (typeof data.purchasePrice === 'number') {
        row.purchasePrice = data.purchasePrice;
      }
      if (typeof data.purchasePriceMinor === 'bigint') {
        row.purchasePriceMinor = data.purchasePriceMinor;
      }
      if (typeof data.salePrice === 'number') {
        row.salePrice = data.salePrice;
      }
      if (typeof data.salePriceMinor === 'bigint') {
        row.salePriceMinor = data.salePriceMinor;
      }
      products.set(id, row);
      return clone(row);
    },
  };

  const mockStockLevelDelegate = {
    findUnique: async (args = {}) => {
      const key = `${args?.where?.productId_branchId?.branchId}:${args?.where?.productId_branchId?.productId}`;
      const row = stockLevels.get(key);
      return row ? clone(row) : null;
    },
    upsert: async (args = {}) => {
      const key = `${args?.where?.productId_branchId?.branchId}:${args?.where?.productId_branchId?.productId}`;
      const row = stockLevels.get(key);
      if (row) {
        const increment = args?.update?.quantity?.increment ?? 0;
        row.quantity += increment;
        stockLevels.set(key, row);
        return clone(row);
      }

      const created = {
        branchId: args?.create?.branchId,
        id: createUuidFromCounter(stockLevels.size + 500),
        productId: args?.create?.productId,
        quantity: args?.create?.quantity ?? 0,
      };
      stockLevels.set(key, created);
      return clone(created);
    },
  };

  const mockStockMovementDelegate = {
    create: async (args = {}) => {
      const data = args?.data ?? {};
      const row = {
        ...data,
        createdAt: new Date(),
        id: createUuidFromCounter(stockMovements.length + 700),
      };
      stockMovements.push(row);
      return clone(row);
    },
  };

  const mockPurchaseInvoiceDelegate = {
    count: async (args = {}) => {
      const where = args?.where ?? {};
      return [...purchaseInvoices.values()].filter((row) => applyInvoiceWhere(row, where)).length;
    },
    create: async (args = {}) => {
      invoiceCounter += 1;
      const id = createUuidFromCounter(invoiceCounter);
      const now = new Date();
      const data = args?.data ?? {};
      const row = {
        branchId: data.branchId,
        companyId: data.companyId,
        convertedAt: data.convertedAt ?? null,
        convertedToInvoiceId: data.convertedToInvoiceId ?? null,
        createdAt: now,
        deletedAt: null,
        dispatchNumber: data.dispatchNumber ?? null,
        documentDate: data.documentDate ?? null,
        documentType: data.documentType,
        dueDate: data.dueDate ?? null,
        grandTotal: data.grandTotal,
        grandTotalMinor: data.grandTotalMinor ?? 0n,
        id,
        invoiceNumber: data.invoiceNumber,
        note: data.note ?? null,
        sourceDispatchId: data.sourceDispatchId ?? null,
        status: data.status,
        subtotal: data.subtotal,
        subtotalMinor: data.subtotalMinor ?? 0n,
        supplierId: data.supplierId,
        totalDiscount: data.totalDiscount,
        totalDiscountMinor: data.totalDiscountMinor ?? 0n,
        totalVat: data.totalVat,
        totalVatMinor: data.totalVatMinor ?? 0n,
        updatedAt: now,
        userId: data.userId,
      };
      purchaseInvoices.set(id, row);

      const items = Array.isArray(data?.items?.create)
        ? data.items.create.map((item) => {
            invoiceItemCounter += 1;
            return {
              createdAt: now,
              discount: item.discount,
              discountMinor: item.discountMinor ?? 0n,
              id: createUuidFromCounter(invoiceItemCounter),
              invoiceId: id,
              lineTotal: item.lineTotal,
              lineTotalMinor: item.lineTotalMinor ?? 0n,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              unitPriceMinor: item.unitPriceMinor ?? 0n,
              vatAmount: item.vatAmount,
              vatAmountMinor: item.vatAmountMinor ?? 0n,
              vatRate: item.vatRate,
            };
          })
        : [];
      purchaseInvoiceItems.set(id, items);

      return clone(row);
    },
    findFirst: async (args = {}) => {
      const where = args?.where ?? {};
      const row = [...purchaseInvoices.values()].find((candidate) => applyInvoiceWhere(candidate, where));
      if (!row) {
        return null;
      }

      const response = clone(row);
      if (args?.include?.items) {
        const items = purchaseInvoiceItems.get(row.id) ?? [];
        if (args.include.items.include?.product) {
          response.items = items.map((item) => ({
            ...item,
            product: (() => {
              const product = products.get(item.productId);
              return product ? { barcode: product.barcode, name: product.name } : null;
            })(),
          }));
        } else {
          response.items = items.map(clone);
        }
      }
      if (args?.include?.supplier) {
        const supplier = suppliers.get(row.supplierId);
        response.supplier = supplier
          ? {
              id: supplier.id,
              name: supplier.name,
            }
          : null;
      }
      if (args?.include?.branch) {
        response.branch = {
          id: branch.id,
          name: branch.name,
        };
      }
      return response;
    },
    findMany: async (args = {}) => {
      const where = args?.where ?? {};
      let rows = [...purchaseInvoices.values()].filter((candidate) => applyInvoiceWhere(candidate, where));
      rows = rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      if (Number.isFinite(args?.skip) && args.skip > 0) {
        rows = rows.slice(args.skip);
      }
      if (Number.isFinite(args?.take)) {
        rows = rows.slice(0, args.take);
      }

      return rows.map((row) => {
        const response = clone(row);
        if (args?.include?.supplier) {
          const supplier = suppliers.get(row.supplierId);
          response.supplier = supplier
            ? {
                id: supplier.id,
                name: supplier.name,
              }
            : null;
        }
        if (args?.include?.branch) {
          response.branch = {
            id: branch.id,
            name: branch.name,
          };
        }
        return response;
      });
    },
    update: async (args = {}) => {
      const id = args?.where?.id;
      const row = purchaseInvoices.get(id);
      if (!row) {
        throw new Error('Purchase invoice not found');
      }
      const data = args?.data ?? {};
      Object.assign(row, data, { updatedAt: new Date() });
      purchaseInvoices.set(id, row);
      return clone(row);
    },
  };

  const mockSupplierTransactionDelegate = {
    count: async (args = {}) => {
      const where = args?.where ?? {};
      return supplierTransactions.filter((row) => applySupplierTransactionWhere(row, where)).length;
    },
    create: async (args = {}) => {
      transactionCounter += 1;
      const data = args?.data ?? {};
      const row = {
        amount: data.amount,
        amountMinor: data.amountMinor ?? 0n,
        createdAt: new Date(),
        description: data.description ?? null,
        id: createUuidFromCounter(transactionCounter),
        invoiceId: data.invoiceId ?? null,
        supplierId: data.supplierId,
        type: data.type,
      };
      supplierTransactions.push(row);
      return clone(row);
    },
    findMany: async (args = {}) => {
      const where = args?.where ?? {};
      let rows = supplierTransactions.filter((candidate) => applySupplierTransactionWhere(candidate, where));
      rows = rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      if (Number.isFinite(args?.skip) && args.skip > 0) {
        rows = rows.slice(args.skip);
      }
      if (Number.isFinite(args?.take)) {
        rows = rows.slice(0, args.take);
      }

      return rows.map((row) => {
        const response = clone(row);
        if (args?.include?.invoice) {
          const invoice = row.invoiceId ? purchaseInvoices.get(row.invoiceId) : null;
          response.invoice = invoice
            ? {
                documentType: invoice.documentType,
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
              }
            : null;
        }
        return response;
      });
    },
  };

  const patches = [
    [prisma.company, 'findFirst', mockCompanyDelegate.findFirst],
    [prisma.branch, 'findUnique', mockBranchDelegate.findUnique],
    [prisma.supplier, 'count', mockSupplierDelegate.count],
    [prisma.supplier, 'create', mockSupplierDelegate.create],
    [prisma.supplier, 'findFirst', mockSupplierDelegate.findFirst],
    [prisma.supplier, 'findMany', mockSupplierDelegate.findMany],
    [prisma.supplier, 'update', mockSupplierDelegate.update],
    [prisma.product, 'update', mockProductDelegate.update],
    [prisma.stockLevel, 'findUnique', mockStockLevelDelegate.findUnique],
    [prisma.stockLevel, 'upsert', mockStockLevelDelegate.upsert],
    [prisma.stockMovement, 'create', mockStockMovementDelegate.create],
    [prisma.purchaseInvoice, 'count', mockPurchaseInvoiceDelegate.count],
    [prisma.purchaseInvoice, 'create', mockPurchaseInvoiceDelegate.create],
    [prisma.purchaseInvoice, 'findFirst', mockPurchaseInvoiceDelegate.findFirst],
    [prisma.purchaseInvoice, 'findMany', mockPurchaseInvoiceDelegate.findMany],
    [prisma.purchaseInvoice, 'update', mockPurchaseInvoiceDelegate.update],
    [prisma.supplierTransaction, 'count', mockSupplierTransactionDelegate.count],
    [prisma.supplierTransaction, 'create', mockSupplierTransactionDelegate.create],
    [prisma.supplierTransaction, 'findMany', mockSupplierTransactionDelegate.findMany],
    [
      prisma,
      '$transaction',
      async (callback) => {
        if (typeof callback !== 'function') {
          return callback;
        }
        return callback({
          product: mockProductDelegate,
          purchaseInvoice: mockPurchaseInvoiceDelegate,
          stockLevel: mockStockLevelDelegate,
          stockMovement: mockStockMovementDelegate,
          supplier: mockSupplierDelegate,
          supplierTransaction: mockSupplierTransactionDelegate,
        });
      },
    ],
  ];

  const restoreFns = patches.map(([target, key, replacement]) => {
    const original = target[key];
    target[key] = replacement;
    return () => {
      target[key] = original;
    };
  });

  return {
    fixtures: {
      branch,
      productId: '44444444-4444-4444-8444-444444444444',
      supplierId: '33333333-3333-4333-8333-333333333333',
    },
    state: {
      products,
      purchaseInvoiceItems,
      purchaseInvoices,
      stockLevels,
      stockMovements,
      supplierTransactions,
      suppliers,
    },
    restore() {
      for (let index = restoreFns.length - 1; index >= 0; index -= 1) {
        restoreFns[index]();
      }
    },
  };
}

async function withPurchaseAndSuppliersServer(run) {
  const company = createCompanyFixture({
    id: '11111111-1111-4111-8111-111111111111',
    packageExpiresAt: new Date('2030-01-10T03:00:00.000Z'),
    packageGraceEndsAt: new Date('2030-01-17T20:59:59.999Z'),
    packageStatus: 'ACTIVE',
  });
  const { fixtures, restore, state } = installPurchaseSupplierPrismaMocks(company);

  const server = Fastify({ logger: false });
  await authPlugin(server);
  await server.register(supplierRoutes, { prefix: '/api/suppliers' });
  await server.register(purchaseInvoiceRoutes, { prefix: '/api/purchase-invoices' });
  await server.ready();

  try {
    await run({
      company,
      fixtures,
      makeToken(role, options = {}) {
        return server.jwt.sign({
          branchId: options.branchId ?? fixtures.branch.id,
          companyId: options.companyId ?? company.id,
          id: options.userId ?? `${role.toLowerCase()}-1`,
          role,
        });
      },
      server,
      state,
    });
  } finally {
    await server.close();
    restore();
  }
}

function createReplyMock() {
  return {
    payload: null,
    sent: false,
    statusCode: 200,
    send(payload) {
      this.payload = payload;
      this.sent = true;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
  };
}

const tests = [
  {
    name: 'normalizePackageGraceDays clamps out-of-range values',
    run() {
      assert.equal(normalizePackageGraceDays(undefined), 7);
      assert.equal(normalizePackageGraceDays(0), 1);
      assert.equal(normalizePackageGraceDays(99), 99);
      assert.equal(normalizePackageGraceDays(500), 400);
      assert.equal(normalizePackageGraceDays(9), 9);
    },
  },
  {
    name: 'endOfTrDay normalizes date to Turkey day end',
    run() {
      const end = endOfTrDay(new Date('2026-03-31T04:15:00.000Z'));
      assert.equal(end.toISOString(), '2026-03-31T20:59:59.999Z');
    },
  },
  {
    name: 'buildCompanyAccessSnapshot applies ACTIVE -> GRACE -> EXPIRED transitions',
    run() {
      const source = {
        id: 'company-1',
        isActive: true,
        packageExpiresAt: new Date('2026-03-31T03:00:00.000Z'),
        packageGraceDays: 5,
        packageGraceEndsAt: null,
        packageStatus: 'ACTIVE',
      };

      const active = buildCompanyAccessSnapshot(source, new Date('2026-03-31T19:30:00.000Z'));
      assert.equal(active.status, 'ACTIVE');
      assert.equal(active.isAccessAllowed, true);

      const grace = buildCompanyAccessSnapshot(source, new Date('2026-04-01T00:00:00.000Z'));
      assert.equal(grace.status, 'GRACE');
      assert.equal(grace.isAccessAllowed, true);

      const expired = buildCompanyAccessSnapshot(source, new Date('2026-04-06T21:00:00.000Z'));
      assert.equal(expired.status, 'EXPIRED');
      assert.equal(expired.isAccessAllowed, false);
    },
  },
  {
    name: 'buildPackageGraceEndsAt derives grace end from expiresAt and grace days',
    run() {
      const graceEndsAt = buildPackageGraceEndsAt(new Date('2026-03-31T03:00:00.000Z'), 7);
      assert.equal(graceEndsAt?.toISOString(), '2026-04-07T20:59:59.999Z');
    },
  },
  {
    name: 'calculateQuickRenewedExpiresAt keeps active/grace anchor on current expires date',
    run() {
      const renewed = calculateQuickRenewedExpiresAt({
        currentExpiresAt: new Date('2026-03-31T10:00:00.000Z'),
        currentStatus: 'ACTIVE',
        now: new Date('2026-04-10T08:00:00.000Z'),
      });
      assert.equal(renewed.toISOString(), '2027-03-31T20:59:59.999Z');
    },
  },
  {
    name: 'calculateQuickRenewedExpiresAt uses now for EXPIRED statuses',
    run() {
      const renewed = calculateQuickRenewedExpiresAt({
        currentExpiresAt: new Date('2026-03-31T10:00:00.000Z'),
        currentStatus: 'EXPIRED',
        now: new Date('2026-04-10T08:00:00.000Z'),
      });
      assert.equal(renewed.toISOString(), '2027-04-10T20:59:59.999Z');
    },
  },
  {
    name: 'findRestrictedSubscriptionFields returns blocked keys',
    run() {
      const keys = findRestrictedSubscriptionFields({
        name: 'Demo',
        packageExpiresAt: '2027-01-01T00:00:00.000Z',
        packageGraceDays: 10,
      });
      assert.deepEqual(keys.sort(), ['packageExpiresAt', 'packageGraceDays']);
    },
  },
  {
    name: 'mapSystemEventType maps expected transitions',
    run() {
      assert.equal(mapSystemEventType('ACTIVE', 'GRACE'), 'SYSTEM_ENTER_GRACE');
      assert.equal(mapSystemEventType(null, 'GRACE'), 'SYSTEM_ENTER_GRACE');
      assert.equal(mapSystemEventType('GRACE', 'EXPIRED'), 'SYSTEM_BLOCK_EXPIRED');
      assert.equal(mapSystemEventType('EXPIRED', 'ACTIVE'), 'SYSTEM_RESTORE_ACTIVE');
      assert.equal(mapSystemEventType('GRACE', 'GRACE'), null);
      assert.equal(mapSystemEventType(null, 'ACTIVE'), null);
    },
  },
  {
    name: 'resolveScopedCompanyId blocks non-super user from querying another company',
    run() {
      const request = {
        user: {
          companyId: 'company-1',
          role: 'ADMIN',
        },
      };
      const reply = createReplyMock();

      const scopedCompanyId = resolveScopedCompanyId(
        request,
        reply,
        'company-2',
      );

      assert.equal(scopedCompanyId, null);
      assert.equal(reply.sent, true);
      assert.equal(reply.statusCode, 403);
    },
  },
  {
    name: 'ensureCompanyOwnership blocks non-super user from writing another company',
    run() {
      const request = {
        user: {
          companyId: 'company-1',
          role: 'ADMIN',
        },
      };
      const reply = createReplyMock();

      const ok = ensureCompanyOwnership(request, reply, 'company-2');

      assert.equal(ok, false);
      assert.equal(reply.sent, true);
      assert.equal(reply.statusCode, 403);
    },
  },
  {
    name: 'role hierarchy helper enforces strict manage/assign ordering',
    run() {
      assert.equal(canManageRole('SUPER_ADMIN', 'SUPER_ADMIN'), true);
      assert.equal(canManageRole('ADMIN', 'ADMIN'), false);
      assert.equal(canManageRole('ADMIN', 'CASHIER'), true);
      assert.equal(canManageRole('ACCOUNTANT', 'CASHIER'), true);
      assert.equal(canManageRole('CASHIER', 'ACCOUNTANT'), false);

      assert.equal(canAssignRole('SUPER_ADMIN', 'SUPER_ADMIN'), true);
      assert.equal(canAssignRole('ADMIN', 'ADMIN'), false);
      assert.equal(canAssignRole('ADMIN', 'ACCOUNTANT'), true);
      assert.equal(canAssignRole('ACCOUNTANT', 'ADMIN'), false);
    },
  },
  {
    name: 'user routes enforce company-internal role hierarchy and self-protection',
    async run() {
      await withUsersServer(async ({ company, makeToken, server, users }) => {
        const adminToken = makeToken('ADMIN', 'admin-1');

        const createAdminResponse = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'POST',
          payload: {
            companyId: company.id,
            fullName: 'Attempted Admin',
            password: 'Strong123',
            role: 'ADMIN',
            username: 'attempt-admin',
          },
          url: '/api/users',
        });
        assert.equal(createAdminResponse.statusCode, 403);
        assert.equal(
          createAdminResponse.json().errorCode,
          'ROLE_HIERARCHY_FORBIDDEN',
        );

        const createCashierResponse = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'POST',
          payload: {
            companyId: company.id,
            fullName: 'Cashier Two',
            password: 'Strong123',
            role: 'CASHIER',
            username: 'cashier-2',
          },
          url: '/api/users',
        });
        assert.equal(createCashierResponse.statusCode, 201);

        const updatePeerAdminResponse = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'PUT',
          payload: {
            fullName: 'Admin Peer Updated',
          },
          url: '/api/users/admin-2',
        });
        assert.equal(updatePeerAdminResponse.statusCode, 403);
        assert.equal(
          updatePeerAdminResponse.json().errorCode,
          'ROLE_HIERARCHY_FORBIDDEN',
        );

        const selfRoleChangeResponse = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'PUT',
          payload: {
            role: 'CASHIER',
          },
          url: '/api/users/admin-1',
        });
        assert.equal(selfRoleChangeResponse.statusCode, 400);
        assert.equal(
          selfRoleChangeResponse.json().errorCode,
          'SELF_ROLE_CHANGE_FORBIDDEN',
        );

        const selfDeleteResponse = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'DELETE',
          url: '/api/users/admin-1',
        });
        assert.equal(selfDeleteResponse.statusCode, 400);
        assert.equal(
          selfDeleteResponse.json().errorCode,
          'SELF_DELETE_FORBIDDEN',
        );

        const deleteCashierResponse = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'DELETE',
          url: '/api/users/cashier-1',
        });
        assert.equal(deleteCashierResponse.statusCode, 200);

        const deletedCashier = users.find((row) => row.id === 'cashier-1');
        assert.notEqual(deletedCashier?.deletedAt, null);
      });
    },
  },
  {
    name: 'user routes return deterministic 409 when email is already in use',
    async run() {
      await withUsersServer(async ({ company, makeToken, server }) => {
        const adminToken = makeToken('ADMIN', 'admin-1');

        const duplicateCreateResponse = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'POST',
          payload: {
            companyId: company.id,
            email: 'ADMIN-2@demo.test',
            fullName: 'Duplicate Email User',
            password: 'Strong123',
            role: 'CASHIER',
            username: 'cashier-2',
          },
          url: '/api/users',
        });
        assert.equal(duplicateCreateResponse.statusCode, 409);
        assert.equal(
          duplicateCreateResponse.json().errorCode,
          'EMAIL_ALREADY_IN_USE',
        );

        const duplicateUpdateResponse = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'PUT',
          payload: {
            email: 'admin-2@demo.test',
          },
          url: '/api/users/cashier-1',
        });
        assert.equal(duplicateUpdateResponse.statusCode, 409);
        assert.equal(
          duplicateUpdateResponse.json().errorCode,
          'EMAIL_ALREADY_IN_USE',
        );
      });
    },
  },
  {
    name: 'auth login supports email and legacy flows with deterministic email-first precedence',
    async run() {
      await withAuthRoutesServer(async ({ companyOne, companyTwo, server }) => {
        const emailLoginResponse = await server.inject({
          method: 'POST',
          payload: {
            email: 'ADMIN@TENANT-ONE.TEST',
            password: 'Strong123',
          },
          url: '/api/auth/login',
        });
        assert.equal(emailLoginResponse.statusCode, 200);
        assert.equal(emailLoginResponse.json().data.user.companyId, companyOne.id);

        const legacyLoginResponse = await server.inject({
          method: 'POST',
          payload: {
            companyId: companyTwo.id,
            password: 'Strong123',
            username: 'admin',
          },
          url: '/api/auth/login',
        });
        assert.equal(legacyLoginResponse.statusCode, 200);
        assert.equal(legacyLoginResponse.json().data.user.companyId, companyTwo.id);

        const precedenceResponse = await server.inject({
          method: 'POST',
          payload: {
            companyId: companyTwo.id,
            email: 'unknown@tenant-one.test',
            password: 'Strong123',
            username: 'admin',
          },
          url: '/api/auth/login',
        });
        assert.equal(precedenceResponse.statusCode, 401);
        assert.equal(precedenceResponse.json().errorCode, 'INVALID_CREDENTIALS');
      });
    },
  },
  {
    name: 'sales route rejects invalid payload with 400 before database work',
    async run() {
      await withSalesAndRefundsSchemaServer(async ({ makeToken, server }) => {
        const response = await server.inject({
          headers: { authorization: `Bearer ${makeToken('ADMIN')}` },
          method: 'POST',
          payload: {
            items: [],
            payments: [],
          },
          url: '/api/sales',
        });

        assert.equal(response.statusCode, 400);
        assert.equal(response.json().success, false);
      });
    },
  },
  {
    name: 'refund route rejects invalid payload with 400 before database work',
    async run() {
      await withSalesAndRefundsSchemaServer(async ({ makeToken, server }) => {
        const response = await server.inject({
          headers: { authorization: `Bearer ${makeToken('ADMIN')}` },
          method: 'POST',
          payload: {
            items: [],
            registerId: '',
            saleId: '',
            sessionId: '',
          },
          url: '/api/refunds',
        });

        assert.equal(response.statusCode, 400);
        assert.equal(response.json().success, false);
      });
    },
  },
  {
    name: 'sync push applies idempotency and replays duplicate operationKey as no-op',
    async run() {
      await withSyncRoutesServer(async ({ makeToken, routeHitCount, server }) => {
        const token = makeToken('ADMIN');
        const payload = {
          productOps: [],
          refunds: [],
          registerId: '11111111-1111-4111-8111-111111111111',
          sales: [
            {
              localId: 'sale-local-1',
              payload: {
                clientRequestId: 'sale-client-1',
                items: [],
                payments: [],
                registerId: '11111111-1111-4111-8111-111111111111',
                sessionId: 'session-1',
              },
            },
          ],
          stockOps: [],
        };

        const firstResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload,
          url: '/api/sync/push',
        });
        assert.equal(firstResponse.statusCode, 200);
        const firstBody = firstResponse.json();
        assert.equal(firstBody.success, true);
        assert.equal(firstBody.data.acceptedCount, 1);
        assert.equal(firstBody.data.replayedCount, 0);
        assert.equal(firstBody.data.failedCount, 0);
        assert.equal(firstBody.data.resultsByEntity.sales[0].status, 'ACCEPTED');
        assert.equal(routeHitCount.sales, 1);

        const secondResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload,
          url: '/api/sync/push',
        });
        assert.equal(secondResponse.statusCode, 200);
        const secondBody = secondResponse.json();
        assert.equal(secondBody.success, true);
        assert.equal(secondBody.data.acceptedCount, 0);
        assert.equal(secondBody.data.replayedCount, 1);
        assert.equal(secondBody.data.failedCount, 0);
        assert.equal(secondBody.data.resultsByEntity.sales[0].status, 'REPLAYED');
        assert.equal(routeHitCount.sales, 1);
      });
    },
  },
  {
    name: 'sync pull returns nextCursor and accepts cursor query',
    async run() {
      await withSyncRoutesServer(async ({ makeToken, server }) => {
        const token = makeToken('ADMIN');
        const firstResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'GET',
          url: '/api/sync/pull?registerId=11111111-1111-4111-8111-111111111111',
        });
        assert.equal(firstResponse.statusCode, 200);
        const firstBody = firstResponse.json();
        assert.equal(firstBody.success, true);
        assert.equal(typeof firstBody.data.nextCursor, 'string');
        assert.equal(Array.isArray(firstBody.data.products), true);
        assert.equal(Array.isArray(firstBody.data.categories), true);
        assert.equal(Array.isArray(firstBody.data.users), true);
        assert.equal(Array.isArray(firstBody.data.stockLevels), true);
        assert.equal(Array.isArray(firstBody.data.suppliers), true);
        assert.equal(Array.isArray(firstBody.data.purchaseInvoices), true);
        assert.equal(Array.isArray(firstBody.data.customers), true);

        const secondResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'GET',
          url: `/api/sync/pull?registerId=11111111-1111-4111-8111-111111111111&cursor=${encodeURIComponent(firstBody.data.nextCursor)}`,
        });
        assert.equal(secondResponse.statusCode, 200);
        const secondBody = secondResponse.json();
        assert.equal(secondBody.success, true);
        assert.equal(typeof secondBody.data.nextCursor, 'string');
      });
    },
  },
  {
    name: 'sync heartbeat accepts valid payload and enforces company scope',
    async run() {
      await withSyncRoutesServer(async ({ makeToken, server }) => {
        const token = makeToken('ADMIN');
        const payload = {
          clientObservedAt: '2026-04-19T09:00:00.000Z',
          lastSyncErrorCode: null,
          lastSyncedAt: '2026-04-19T08:59:30.000Z',
          lastSyncStatus: 'OK',
          oldestPendingAgeSec: 0,
          pendingCount: 0,
          productOps: 0,
          queuePeak: 3,
          refunds: 0,
          registerId: '11111111-1111-4111-8111-111111111111',
          sales: 0,
          stockOps: 0,
        };

        const okResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload,
          url: '/api/sync/heartbeat',
        });
        assert.equal(okResponse.statusCode, 200);
        const okBody = okResponse.json();
        assert.equal(okBody.success, true);
        assert.equal(typeof okBody.data.serverObservedAt, 'string');

        const foreignToken = server.jwt.sign({
          branchId: 'branch-1',
          companyId: 'company-2',
          id: 'admin-foreign',
          role: 'ADMIN',
        });
        const forbiddenResponse = await server.inject({
          headers: { authorization: `Bearer ${foreignToken}` },
          method: 'POST',
          payload,
          url: '/api/sync/heartbeat',
        });
        assert.equal(forbiddenResponse.statusCode, 403);
      });
    },
  },
  {
    name: 'purchase ORDER keeps stock and supplier debt unchanged with DRAFT status',
    async run() {
      await withPurchaseAndSuppliersServer(async ({ fixtures, makeToken, server, state }) => {
        const token = makeToken('ADMIN');
        const stockKey = `${fixtures.branch.id}:${fixtures.productId}`;
        const initialQty = state.stockLevels.get(stockKey).quantity;

        const response = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload: {
            branchId: fixtures.branch.id,
            documentType: 'ORDER',
            invoiceNumber: 'ORD-1001',
            items: [
              {
                discount: 0,
                productId: fixtures.productId,
                quantity: 2,
                unitPrice: 50,
                vatRate: 10,
              },
            ],
            supplierId: fixtures.supplierId,
            totalDiscount: 0,
          },
          url: '/api/purchase-invoices',
        });

        assert.equal(response.statusCode, 201);
        const body = response.json();
        assert.equal(body.data.documentType, 'ORDER');
        assert.equal(body.data.status, 'DRAFT');
        assert.equal(state.stockLevels.get(stockKey).quantity, initialQty);
        assert.equal(state.suppliers.get(fixtures.supplierId).balance, 0);
        assert.equal(state.supplierTransactions.length, 0);
      });
    },
  },
  {
    name: 'purchase DISPATCH increments stock only and create INVOICE increments stock and debt',
    async run() {
      await withPurchaseAndSuppliersServer(async ({ fixtures, makeToken, server, state }) => {
        const token = makeToken('ADMIN');
        const stockKey = `${fixtures.branch.id}:${fixtures.productId}`;

        const dispatchResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload: {
            branchId: fixtures.branch.id,
            dispatchNumber: 'DISP-1',
            documentDate: '2026-04-20T00:00:00.000Z',
            documentType: 'DISPATCH',
            invoiceNumber: 'DISP-DOC-1',
            items: [
              {
                discount: 0,
                productId: fixtures.productId,
                quantity: 3,
                unitPrice: 20,
                vatRate: 10,
              },
            ],
            supplierId: fixtures.supplierId,
            totalDiscount: 0,
          },
          url: '/api/purchase-invoices',
        });
        assert.equal(dispatchResponse.statusCode, 201);
        assert.equal(state.stockLevels.get(stockKey).quantity, 13);
        assert.equal(state.suppliers.get(fixtures.supplierId).balance, 0);
        assert.equal(state.supplierTransactions.length, 0);

        const invoiceResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload: {
            branchId: fixtures.branch.id,
            documentDate: '2026-04-20T00:00:00.000Z',
            documentType: 'INVOICE',
            dueDate: '2026-04-30T00:00:00.000Z',
            invoiceNumber: 'INV-1',
            items: [
              {
                discount: 0,
                productId: fixtures.productId,
                quantity: 2,
                unitPrice: 50,
                vatRate: 10,
              },
            ],
            supplierId: fixtures.supplierId,
            totalDiscount: 0,
          },
          url: '/api/purchase-invoices',
        });
        assert.equal(invoiceResponse.statusCode, 201);
        assert.equal(state.stockLevels.get(stockKey).quantity, 15);
        assert.equal(state.suppliers.get(fixtures.supplierId).balance, 110);
        assert.equal(state.suppliers.get(fixtures.supplierId).balanceMinor, 11000n);
        assert.equal(state.supplierTransactions.length, 1);
        assert.equal(state.supplierTransactions[0].type, 'DEBT');
      });
    },
  },
  {
    name: 'dispatch to invoice conversion adds debt without double stock and blocks duplicate conversion',
    async run() {
      await withPurchaseAndSuppliersServer(async ({ fixtures, makeToken, server, state }) => {
        const token = makeToken('ADMIN');
        const stockKey = `${fixtures.branch.id}:${fixtures.productId}`;

        const dispatchResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload: {
            branchId: fixtures.branch.id,
            dispatchNumber: 'DISP-2',
            documentDate: '2026-04-20T00:00:00.000Z',
            documentType: 'DISPATCH',
            invoiceNumber: 'DISP-DOC-2',
            items: [
              {
                discount: 0,
                productId: fixtures.productId,
                quantity: 3,
                unitPrice: 20,
                vatRate: 10,
              },
            ],
            supplierId: fixtures.supplierId,
            totalDiscount: 0,
          },
          url: '/api/purchase-invoices',
        });
        assert.equal(dispatchResponse.statusCode, 201);
        const dispatchId = dispatchResponse.json().data.id;
        assert.equal(state.stockLevels.get(stockKey).quantity, 13);

        const convertResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload: {
            documentDate: '2026-04-21T00:00:00.000Z',
            dueDate: '2026-05-01T00:00:00.000Z',
            invoiceNumber: 'INV-CONVERT-1',
          },
          url: `/api/purchase-invoices/${dispatchId}/convert-to-invoice`,
        });
        assert.equal(convertResponse.statusCode, 201);
        assert.equal(state.stockLevels.get(stockKey).quantity, 13);
        assert.equal(state.suppliers.get(fixtures.supplierId).balance, 66);
        assert.equal(state.suppliers.get(fixtures.supplierId).balanceMinor, 6600n);
        assert.equal(state.supplierTransactions.length, 1);
        assert.equal(state.supplierTransactions[0].type, 'DEBT');

        const dispatchRow = state.purchaseInvoices.get(dispatchId);
        assert.equal(typeof dispatchRow.convertedToInvoiceId, 'string');
        const convertedInvoice = state.purchaseInvoices.get(dispatchRow.convertedToInvoiceId);
        assert.equal(convertedInvoice.sourceDispatchId, dispatchId);

        const duplicateResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload: {
            invoiceNumber: 'INV-CONVERT-2',
          },
          url: `/api/purchase-invoices/${dispatchId}/convert-to-invoice`,
        });
        assert.equal(duplicateResponse.statusCode, 409);
      });
    },
  },
  {
    name: 'supplier transactions enforce invoice ownership and update balance with filters/pagination',
    async run() {
      await withPurchaseAndSuppliersServer(async ({ fixtures, makeToken, server, state }) => {
        const token = makeToken('ADMIN');

        const invalidInvoiceResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload: {
            amount: 10,
            invoiceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            type: 'DEBT',
          },
          url: `/api/suppliers/${fixtures.supplierId}/transactions`,
        });
        assert.equal(invalidInvoiceResponse.statusCode, 400);

        const debtResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload: {
            amount: 50,
            description: 'Ek borc',
            type: 'DEBT',
          },
          url: `/api/suppliers/${fixtures.supplierId}/transactions`,
        });
        assert.equal(debtResponse.statusCode, 201);

        const paymentResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
          payload: {
            amount: 20,
            description: 'Odeme',
            type: 'PAYMENT',
          },
          url: `/api/suppliers/${fixtures.supplierId}/transactions`,
        });
        assert.equal(paymentResponse.statusCode, 201);

        assert.equal(state.suppliers.get(fixtures.supplierId).balance, 30);
        assert.equal(state.suppliers.get(fixtures.supplierId).balanceMinor, 3000n);

        const paymentListResponse = await server.inject({
          headers: { authorization: `Bearer ${token}` },
          method: 'GET',
          url: `/api/suppliers/${fixtures.supplierId}/transactions?type=PAYMENT&limit=1&page=1`,
        });
        assert.equal(paymentListResponse.statusCode, 200);
        const paymentListBody = paymentListResponse.json();
        assert.equal(paymentListBody.data.length, 1);
        assert.equal(paymentListBody.data[0].type, 'PAYMENT');
        assert.equal(paymentListBody.pagination.total, 1);
      });
    },
  },
  {
    name: 'cashier role cannot mutate purchase invoices or supplier transactions',
    async run() {
      await withPurchaseAndSuppliersServer(async ({ fixtures, makeToken, server }) => {
        const cashierToken = makeToken('CASHIER');

        const invoiceForbiddenResponse = await server.inject({
          headers: { authorization: `Bearer ${cashierToken}` },
          method: 'POST',
          payload: {
            branchId: fixtures.branch.id,
            documentDate: '2026-04-20T00:00:00.000Z',
            documentType: 'INVOICE',
            dueDate: '2026-04-30T00:00:00.000Z',
            invoiceNumber: 'INV-FORBIDDEN',
            items: [
              {
                discount: 0,
                productId: fixtures.productId,
                quantity: 1,
                unitPrice: 10,
                vatRate: 10,
              },
            ],
            supplierId: fixtures.supplierId,
            totalDiscount: 0,
          },
          url: '/api/purchase-invoices',
        });
        assert.equal(invoiceForbiddenResponse.statusCode, 403);

        const supplierTxForbiddenResponse = await server.inject({
          headers: { authorization: `Bearer ${cashierToken}` },
          method: 'POST',
          payload: {
            amount: 10,
            type: 'DEBT',
          },
          url: `/api/suppliers/${fixtures.supplierId}/transactions`,
        });
        assert.equal(supplierTxForbiddenResponse.statusCode, 403);
      });
    },
  },
  {
    name: 'auth guards enforce writer and report-reader role matrix',
    async run() {
      await withAuthGuardsServer(async ({ makeToken, server }) => {
        const adminToken = makeToken('ADMIN');
        const superToken = makeToken('SUPER_ADMIN');
        const cashierToken = makeToken('CASHIER');
        const accountantToken = makeToken('ACCOUNTANT');

        const adminWrite = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'GET',
          url: '/guard/write',
        });
        assert.equal(adminWrite.statusCode, 200);

        const superWrite = await server.inject({
          headers: { authorization: `Bearer ${superToken}` },
          method: 'GET',
          url: '/guard/write',
        });
        assert.equal(superWrite.statusCode, 200);

        const cashierWrite = await server.inject({
          headers: { authorization: `Bearer ${cashierToken}` },
          method: 'GET',
          url: '/guard/write',
        });
        assert.equal(cashierWrite.statusCode, 403);

        const cashierReport = await server.inject({
          headers: { authorization: `Bearer ${cashierToken}` },
          method: 'GET',
          url: '/guard/report',
        });
        assert.equal(cashierReport.statusCode, 200);

        const accountantReport = await server.inject({
          headers: { authorization: `Bearer ${accountantToken}` },
          method: 'GET',
          url: '/guard/report',
        });
        assert.equal(accountantReport.statusCode, 200);
      });
    },
  },
  {
    name: 'reports enforce branch scope for CASHIER/ACCOUNTANT while ADMIN keeps company-wide access',
    async run() {
      await withReportsServer(async ({ company, makeToken, server }) => {
        const adminToken = makeToken('ADMIN', { branchId: null });
        const adminResponse = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'GET',
          url: `/api/reports/daily?companyId=${company.id}&branchId=branch-1`,
        });
        assert.equal(adminResponse.statusCode, 200);

        const cashierToken = makeToken('CASHIER', {
          branchId: 'branch-1',
          userId: 'cashier-1',
        });
        const cashierForbiddenResponse = await server.inject({
          headers: { authorization: `Bearer ${cashierToken}` },
          method: 'GET',
          url: `/api/reports/daily?companyId=${company.id}&branchId=branch-2`,
        });
        assert.equal(cashierForbiddenResponse.statusCode, 403);
        assert.equal(
          cashierForbiddenResponse.json().errorCode,
          'BRANCH_SCOPE_FORBIDDEN',
        );

        const accountantNoBranchToken = makeToken('ACCOUNTANT', {
          branchId: null,
          userId: 'accountant-1',
        });
        const branchRequiredResponse = await server.inject({
          headers: { authorization: `Bearer ${accountantNoBranchToken}` },
          method: 'GET',
          url: `/api/reports/daily?companyId=${company.id}&branchId=branch-1`,
        });
        assert.equal(branchRequiredResponse.statusCode, 403);
        assert.equal(
          branchRequiredResponse.json().errorCode,
          'BRANCH_SCOPE_REQUIRED',
        );
      });
    },
  },
  {
    name: 'reports sessions endpoint returns bounded pagination meta',
    async run() {
      await withReportsServer(async ({ company, makeToken, server }) => {
        const adminToken = makeToken('ADMIN', { branchId: null });
        const response = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'GET',
          url: `/api/reports/sessions?companyId=${company.id}&from=2026-03-01&to=2026-03-31&limit=5000&page=1`,
        });

        assert.equal(response.statusCode, 200);
        const body = response.json();
        assert.equal(body.success, true);
        assert.equal(body.meta.limit, 1000);
        assert.equal(body.meta.page, 1);
        assert.equal(body.meta.total, 2);
        assert.equal(body.meta.totalPages, 1);
        assert.equal(body.data.length, 2);
      });
    },
  },
  {
    name: 'reports branch-comparison endpoint returns ranked branch rows',
    async run() {
      await withReportsServer(async ({ company, makeToken, server }) => {
        const adminToken = makeToken('ADMIN', { branchId: null });
        const response = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'GET',
          url: `/api/reports/branch-comparison?companyId=${company.id}&from=2026-03-01&to=2026-03-31`,
        });

        assert.equal(response.statusCode, 200);
        const body = response.json();
        assert.equal(body.success, true);
        assert.equal(body.data.length, 1);
        assert.equal(body.data[0].branchId, 'branch-1');
        assert.equal(body.data[0].totalSales, 300);
        assert.equal(body.data[0].totalRefunds, 25);
        assert.equal(body.data[0].netSales, 275);
      });
    },
  },
  {
    name: 'reports operations-health returns heartbeat and ingestion aggregates',
    async run() {
      await withReportsServer(async ({ company, makeToken, server }) => {
        const adminToken = makeToken('ADMIN', { branchId: null });
        const response = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'GET',
          url: `/api/reports/operations-health?companyId=${company.id}`,
        });

        assert.equal(response.statusCode, 200);
        const body = response.json();
        assert.equal(body.success, true);
        assert.equal(body.data.summary.queuePeakMax, 8);
        assert.equal(body.data.summary.oldestPendingAgeSecMax, 120);
        assert.equal(body.data.summary.accepted24hTotal, 10);
        assert.equal(body.data.summary.replayed24hTotal, 5);
        assert.equal(body.data.summary.failed24hTotal, 2);
        assert.equal(Number(body.data.summary.replayRate24h.toFixed(2)), 33.33);
        assert.equal(body.data.branches[0].registers[0].queuePeak, 8);
        assert.equal(body.data.branches[0].registers[0].failed24h, 2);
      });
    },
  },
  {
    name: 'subscription provisioning requires adminEmail for new company onboarding',
    async run() {
      await withSubscriptionServer(async ({ makeToken, server }) => {
        const superToken = makeToken('SUPER_ADMIN');
        const response = await server.inject({
          headers: { authorization: `Bearer ${superToken}` },
          method: 'POST',
          payload: {
            adminFullName: 'Yeni Admin',
            adminPassword: 'Strong123',
            adminUsername: 'new-admin',
            branchName: 'Merkez',
            companyName: 'Yeni Firma',
            graceDays: 7,
            packageDays: 365,
            registerName: 'Kasa 1',
            templateCode: 'bakkal-v1',
          },
          url: '/api/subscription/admin/provision',
        });
        assert.equal(response.statusCode, 400);
        assert.match(response.json().error, /adminEmail/i);
      });
    },
  },
  {
    name: 'subscription admin flows renew -> suspend -> unsuspend and write ordered audits',
    async run() {
      await withSubscriptionServer(async ({ auditRows, company, makeToken, server }) => {
        const superToken = makeToken('SUPER_ADMIN');

        const renewResponse = await server.inject({
          headers: { authorization: `Bearer ${superToken}` },
          method: 'POST',
          payload: { note: 'Yillik hizli yenileme' },
          url: `/api/subscription/admin/companies/${company.id}/renew-quick`,
        });
        assert.equal(renewResponse.statusCode, 200);

        const suspendResponse = await server.inject({
          headers: { authorization: `Bearer ${superToken}` },
          method: 'POST',
          payload: { note: 'Odeme gecikti' },
          url: `/api/subscription/admin/companies/${company.id}/suspend`,
        });
        assert.equal(suspendResponse.statusCode, 200);

        const unsuspendResponse = await server.inject({
          headers: { authorization: `Bearer ${superToken}` },
          method: 'POST',
          payload: { note: 'Odeme alindi' },
          url: `/api/subscription/admin/companies/${company.id}/unsuspend`,
        });
        assert.equal(unsuspendResponse.statusCode, 200);

        assert.equal(company.packageStatus, 'ACTIVE');

        const auditHistoryResponse = await server.inject({
          headers: { authorization: `Bearer ${superToken}` },
          method: 'GET',
          url: `/api/subscription/admin/companies/${company.id}/audit?page=1&limit=10`,
        });
        assert.equal(auditHistoryResponse.statusCode, 200);

        const auditHistoryBody = auditHistoryResponse.json();
        const eventTypes = auditHistoryBody.data.map((row) => row.eventType);
        assert.deepEqual(eventTypes.slice(0, 3), [
          'UNSUSPEND_MANUAL',
          'SUSPEND_MANUAL',
          'RENEW_QUICK',
        ]);
        assert.equal(auditRows.length, 3);
      });
    },
  },
  {
    name: 'SUPER_ADMIN can query global subscription stats and audit logs',
    async run() {
      await withSubscriptionServer(async ({ company, makeToken, server }) => {
        const superToken = makeToken('SUPER_ADMIN');

        const statsResponse = await server.inject({
          headers: { authorization: `Bearer ${superToken}` },
          method: 'GET',
          url: '/api/subscription/admin/stats',
        });
        assert.equal(statsResponse.statusCode, 200);
        const stats = statsResponse.json();
        assert.equal(stats.success, true);
        assert.equal(typeof stats.data.companies.total, 'number');
        assert.equal(typeof stats.data.users.total, 'number');

        const globalAuditResponse = await server.inject({
          headers: { authorization: `Bearer ${superToken}` },
          method: 'GET',
          url: '/api/subscription/admin/audit?page=1&limit=10',
        });
        assert.equal(globalAuditResponse.statusCode, 200);
        const globalAudit = globalAuditResponse.json();
        assert.equal(globalAudit.success, true);
        assert.equal(Array.isArray(globalAudit.data), true);
      });
    },
  },
  {
    name: 'DefaultCatalogService.seedForCompany logs seed failure event to audit log on failure',
    async run() {
      const companyId = 'company-1';
      const mockCompany = { id: companyId, packageStatus: 'ACTIVE', deletedAt: null };
      const auditRows = [];
      const restorePrisma = installPrismaMocks(mockCompany, auditRows);

      const originalLoad = DefaultCatalogService.loadBundledCatalog;
      DefaultCatalogService.loadBundledCatalog = () => {
        throw new Error('Disk read failure simulation');
      };

      try {
        await DefaultCatalogService.seedForCompany(companyId);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert.equal(error.message, 'Disk read failure simulation');
      } finally {
        DefaultCatalogService.loadBundledCatalog = originalLoad;
      }

      assert.equal(auditRows.length, 1);
      assert.equal(auditRows[0].companyId, companyId);
      assert.equal(auditRows[0].actorType, 'SYSTEM');
      assert.equal(auditRows[0].eventType, 'SYSTEM_SEED_FAILURE');
      assert.equal(auditRows[0].note, 'Catalog seeding failed: Disk read failure simulation');

      restorePrisma();
    },
  },
  {
    name: 'ADMIN role is blocked from subscription admin endpoints while SUPER_ADMIN can read audit',
    async run() {
      await withSubscriptionServer(async ({ company, makeToken, server }) => {
        const adminToken = makeToken('ADMIN', 'admin-1');
        const superToken = makeToken('SUPER_ADMIN');

        const adminListResponse = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'GET',
          url: '/api/subscription/admin/companies',
        });
        assert.equal(adminListResponse.statusCode, 403);

        const adminAuditResponse = await server.inject({
          headers: { authorization: `Bearer ${adminToken}` },
          method: 'GET',
          url: `/api/subscription/admin/companies/${company.id}/audit`,
        });
        assert.equal(adminAuditResponse.statusCode, 403);

        const superAuditResponse = await server.inject({
          headers: { authorization: `Bearer ${superToken}` },
          method: 'GET',
          url: `/api/subscription/admin/companies/${company.id}/audit`,
        });
        assert.equal(superAuditResponse.statusCode, 200);
      });
    },
  },
];

let failed = 0;
for (const t of tests) {
  try {
    await t.run();
    console.log(`PASS ${t.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${t.name}`);
    console.error(error);
  }
}

await prisma.$disconnect();

if (failed > 0) {
  console.error(`\n${failed} test failed.`);
  process.exit(1);
}
console.log(`\n${tests.length} tests passed.`);
