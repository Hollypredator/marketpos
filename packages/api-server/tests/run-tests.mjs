import assert from 'node:assert/strict';
import Fastify from 'fastify';

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
const { subscriptionRoutes } = await import('../dist/routes/subscription.js');
const { userRoutes } = await import('../dist/routes/users.js');
const prisma = (await import('../dist/lib/prisma.js')).default;

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

  const mockAuditDelegate = {
    count: async (args = {}) => {
      const companyId = args?.where?.companyId;
      return auditRows.filter((row) => row.companyId === companyId).length;
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

      let rows = auditRows
        .filter((row) => row.companyId === companyId)
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

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
    [prisma.company, 'findFirst', mockCompanyDelegate.findFirst],
    [prisma.company, 'findMany', mockCompanyDelegate.findMany],
    [prisma.company, 'update', mockCompanyDelegate.update],
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

function createUserFixtureList(companyId) {
  const createdAt = new Date('2025-01-01T00:00:00.000Z');
  const updatedAt = new Date('2025-01-01T00:00:00.000Z');
  return [
    {
      branchId: null,
      companyId,
      createdAt,
      deletedAt: null,
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
      const id = args?.where?.id;
      if (!id) {
        return null;
      }
      const row = findUserById(id);
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
      assert.equal(normalizePackageGraceDays(99), 30);
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
