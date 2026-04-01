import 'fastify';

import type { PreHandlerHookHandler } from 'fastify';

import type { AuthJwtPayload } from './auth';
import type { CompanyAccessSnapshot } from '../lib/company-access';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthJwtPayload;
    user: AuthJwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: PreHandlerHookHandler;
    ensureCompanyAccess: PreHandlerHookHandler;
    ensureBackofficeWriter: PreHandlerHookHandler;
    ensureReportReader: PreHandlerHookHandler;
    ensureSuperAdmin: PreHandlerHookHandler;
  }

  interface FastifyRequest {
    companyAccess?: CompanyAccessSnapshot;
  }
}
