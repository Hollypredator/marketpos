import type { FastifyReply, FastifyRequest } from 'fastify';

function trimOptional(value?: string | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sendForbidden(reply: FastifyReply, message: string): void {
  reply.status(403).send({
    error: message,
    success: false,
  });
}

function sendBadRequest(reply: FastifyReply, message: string): void {
  reply.status(400).send({
    error: message,
    success: false,
  });
}

export function resolveScopedCompanyId(
  request: FastifyRequest,
  reply: FastifyReply,
  requestedCompanyId?: string | null,
  options?: { requiredForSuperAdmin?: boolean },
): string | null {
  const normalizedRequestedCompanyId = trimOptional(requestedCompanyId);

  if (request.user.role === 'SUPER_ADMIN') {
    if (normalizedRequestedCompanyId) {
      return normalizedRequestedCompanyId;
    }
    if (options?.requiredForSuperAdmin) {
      sendBadRequest(reply, 'companyId zorunludur');
      return null;
    }
    return null;
  }

  const ownCompanyId = request.user.companyId;
  if (!ownCompanyId) {
    sendForbidden(reply, 'Firma bilgisi bulunamadi');
    return null;
  }
  if (normalizedRequestedCompanyId && normalizedRequestedCompanyId !== ownCompanyId) {
    sendForbidden(reply, 'Sadece kendi firma verisine erisebilirsiniz');
    return null;
  }
  return ownCompanyId;
}

export function ensureCompanyOwnership(
  request: FastifyRequest,
  reply: FastifyReply,
  targetCompanyId?: string | null,
): boolean {
  const normalizedTargetCompanyId = trimOptional(targetCompanyId);
  if (!normalizedTargetCompanyId) {
    sendBadRequest(reply, 'companyId zorunludur');
    return false;
  }

  if (request.user.role === 'SUPER_ADMIN') {
    return true;
  }

  if (normalizedTargetCompanyId !== request.user.companyId) {
    sendForbidden(reply, 'Sadece kendi firma verisine erisebilirsiniz');
    return false;
  }

  return true;
}

export function isCompanyInScope(
  request: FastifyRequest,
  targetCompanyId: string,
): boolean {
  return request.user.role === 'SUPER_ADMIN' || request.user.companyId === targetCompanyId;
}

