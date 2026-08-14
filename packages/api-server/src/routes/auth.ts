import bcrypt from 'bcrypt';
import type { Prisma } from '@prisma/client';
import { loginSchema } from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { buildCompanyAccessSnapshot } from '../lib/company-access';
import prisma from '../lib/prisma';
import type { AuthJwtPayload } from '../types/auth';

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 10 * 60 * 1000;

interface LoginAttemptState {
  failedCount: number;
  lockedUntil: number | null;
}

const loginAttemptsByKey = new Map<string, LoginAttemptState>();

function normalizeOptionalEmail(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalUsername(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function buildLoginAttemptKey(identifier: string, ipAddress: string): string {
  return `${identifier.toLowerCase()}|${ipAddress}`;
}

function clearLoginAttempts(key: string): void {
  loginAttemptsByKey.delete(key);
}

function registerFailedAttempt(key: string): LoginAttemptState {
  const current = loginAttemptsByKey.get(key) ?? {
    failedCount: 0,
    lockedUntil: null,
  };
  const nextFailed = current.failedCount + 1;
  const nextState: LoginAttemptState = {
    failedCount: nextFailed,
    lockedUntil: nextFailed >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCK_WINDOW_MS : null,
  };
  loginAttemptsByKey.set(key, nextState);
  return nextState;
}

function readActiveLock(key: string): number | null {
  const state = loginAttemptsByKey.get(key);
  if (!state?.lockedUntil) {
    return null;
  }
  if (state.lockedUntil <= Date.now()) {
    loginAttemptsByKey.delete(key);
    return null;
  }
  return state.lockedUntil;
}

export async function authRoutes(server: FastifyInstance): Promise<void> {
  server.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz giris verisi',
        success: false,
      });
    }

    const { companyId, password } = parsed.data;
    const normalizedEmail = normalizeOptionalEmail(parsed.data.email);
    const normalizedUsername = normalizeOptionalUsername(parsed.data.username);
    if (!normalizedEmail && !normalizedUsername) {
      return reply.status(400).send({
        error: 'Email veya kullanici adi zorunludur',
        success: false,
      });
    }
    const loginIdentifier = normalizedEmail ?? normalizedUsername ?? 'unknown';
    const attemptKey = buildLoginAttemptKey(loginIdentifier, request.ip);
    const activeLockUntil = readActiveLock(attemptKey);
    if (activeLockUntil !== null) {
      const waitSeconds = Math.ceil((activeLockUntil - Date.now()) / 1000);
      return reply.status(429).send({
        error: `Cok fazla hatali giris denemesi. Lutfen ${waitSeconds} saniye sonra tekrar deneyin`,
        errorCode: 'LOGIN_RATE_LIMITED',
        success: false,
      });
    }

    const whereClause: Prisma.UserWhereInput = {
      deletedAt: null,
      isActive: true,
    };
    if (normalizedEmail) {
      whereClause.email = normalizedEmail;
    } else if (normalizedUsername) {
      whereClause.username = normalizedUsername;
      if (companyId) {
        const isUuid = isValidUuid(companyId);
        const targetCompany = await prisma.company.findFirst({
          where: isUuid
            ? { OR: [{ id: companyId }, { licenseKey: companyId }] }
            : { licenseKey: companyId },
        });
        if (targetCompany) {
          whereClause.companyId = targetCompany.id;
        } else if (isUuid) {
          whereClause.companyId = companyId;
        } else {
          registerFailedAttempt(attemptKey);
          return reply.status(401).send({
            error: 'Gecerli bir Lisans Kodu veya Kullanici Bulunamadi',
            success: false,
          });
        }
      }
    }

    const user = await prisma.user.findFirst({
      include: {
        branch: true,
        company: true,
      },
      where: whereClause,
    });

    if (!user) {
      registerFailedAttempt(attemptKey);
      return reply.status(401).send({
        error: 'Kullanici adi veya sifre hatali',
        errorCode: 'INVALID_CREDENTIALS',
        success: false,
      });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      registerFailedAttempt(attemptKey);
      return reply.status(401).send({
        error: 'Kullanici adi veya sifre hatali',
        errorCode: 'INVALID_CREDENTIALS',
        success: false,
      });
    }

    clearLoginAttempts(attemptKey);
    const companyAccess = buildCompanyAccessSnapshot({
      id: user.company.id,
      isActive: user.company.isActive && user.company.deletedAt === null,
      packageExpiresAt: user.company.packageExpiresAt,
      packageGraceDays: user.company.packageGraceDays,
      packageGraceEndsAt: user.company.packageGraceEndsAt,
      packageStatus: user.company.packageStatus,
    });

    if (!companyAccess.isAccessAllowed) {
      return reply.status(402).send({
        data: { companyAccess },
        error: companyAccess.summary,
        errorCode: 'SUBSCRIPTION_BLOCKED',
        success: false,
      });
    }

    const payload: AuthJwtPayload = {
      branchId: user.branchId,
      companyId: user.companyId,
      id: user.id,
      role: user.role,
    };

    const accessToken = server.jwt.sign(payload);
    const refreshToken = server.jwt.sign(
      {
        ...payload,
        type: 'refresh',
      },
      { expiresIn: '7d' },
    );

    await prisma.refreshToken.create({
      data: {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        token: refreshToken,
        userId: user.id,
      },
    });

    const { passwordHash: _passwordHash, pin: _pin, ...userPublic } = user;

    return {
      data: {
        accessToken,
        branch: user.branch,
        companyAccess,
        company: user.company,
        refreshToken,
        user: userPublic,
      },
      success: true,
    };
  });

  server.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Refresh token gerekli',
        success: false,
      });
    }

    const { refreshToken } = parsed.data;
    const storedToken = await prisma.refreshToken.findUnique({
      include: {
        user: {
          include: {
            branch: true,
            company: true,
          },
        },
      },
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) {
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      }
      return reply.status(401).send({
        error: 'Gecersiz veya suresi dolmus token',
        success: false,
      });
    }

    const companyAccess = buildCompanyAccessSnapshot({
      id: storedToken.user.company.id,
      isActive:
        storedToken.user.company.isActive &&
        storedToken.user.company.deletedAt === null,
      packageExpiresAt: storedToken.user.company.packageExpiresAt,
      packageGraceDays: storedToken.user.company.packageGraceDays,
      packageGraceEndsAt: storedToken.user.company.packageGraceEndsAt,
      packageStatus: storedToken.user.company.packageStatus,
    });
    if (!companyAccess.isAccessAllowed) {
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      return reply.status(402).send({
        data: { companyAccess },
        error: companyAccess.summary,
        errorCode: 'SUBSCRIPTION_BLOCKED',
        success: false,
      });
    }

    const payload: AuthJwtPayload = {
      branchId: storedToken.user.branchId,
      companyId: storedToken.user.companyId,
      id: storedToken.user.id,
      role: storedToken.user.role,
    };

    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    const newAccessToken = server.jwt.sign(payload);
    const newRefreshToken = server.jwt.sign(
      {
        ...payload,
        type: 'refresh',
      },
      { expiresIn: '7d' },
    );

    await prisma.refreshToken.create({
      data: {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        token: newRefreshToken,
        userId: storedToken.user.id,
      },
    });

    return {
      data: {
        accessToken: newAccessToken,
        companyAccess,
        refreshToken: newRefreshToken,
      },
      success: true,
    };
  });

  server.post('/logout', async (request: FastifyRequest) => {
    const parsed = logoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return {
        success: true,
      };
    }

    if (parsed.data.refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: parsed.data.refreshToken },
      });
    }

    return {
      message: 'Cikis yapildi',
      success: true,
    };
  });
}
