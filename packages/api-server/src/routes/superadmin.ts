import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SuperAdminService } from '../services/superadmin-service';

const onboardSchema = z.object({
  address: z.string().optional(),
  adminEmail: z.string().email().optional(),
  adminFullName: z.string().min(2),
  adminPassword: z.string().min(6),
  adminUsername: z.string().min(3),
  branchName: z.string().optional(),
  companyName: z.string().min(2),
  email: z.string().email().optional(),
  packageDays: z.number().int().positive().optional(),
  phone: z.string().optional(),
  registerName: z.string().optional(),
  taxNumber: z.string().optional(),
  templateCode: z.string().default('bakkal-v1'),
});

const statusSchema = z.object({
  note: z.string().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(6),
});

export async function superadminRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureSuperAdmin);

  // Platform Overview & Telemetry
  server.get('/overview', async () => {
    const data = await SuperAdminService.getOverview();
    return { data, success: true };
  });

  // List all market tenants
  server.get('/tenants', async (request: FastifyRequest) => {
    const query = request.query as { limit?: string; page?: string; search?: string; status?: string };
    const result = await SuperAdminService.listTenants({
      limit: query.limit ? Number(query.limit) : 20,
      page: query.page ? Number(query.page) : 1,
      search: query.search,
      status: query.status,
    });
    return { ...result, success: true };
  });

  // 1-Click Onboard New Market Tenant
  server.post('/tenants/onboard', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = onboardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message || 'Gersiz istek verisi',
        success: false,
      });
    }

    try {
      const data = await SuperAdminService.onboardTenant(parsed.data, request.user?.id);
      return reply.status(201).send({ data, success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Market kurulum hatası', success: false });
    }
  });

  // Toggle Tenant Status (ACTIVE / SUSPENDED)
  server.put('/tenants/:id/status', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Geçersiz status verisi', success: false });
    }

    try {
      const data = await SuperAdminService.updateTenantStatus(
        request.params.id,
        parsed.data.status,
        parsed.data.note,
        request.user?.id,
      );
      return { data, success: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message, success: false });
    }
  });

  // Reset Admin Password
  server.post('/tenants/:id/reset-password', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'En az 6 karakterli şifre giriniz.', success: false });
    }

    try {
      const data = await SuperAdminService.resetAdminPassword(request.params.id, parsed.data.newPassword);
      return { data, success: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message, success: false });
    }
  });

  // Audit Logs
  server.get('/audit-logs', async (request: FastifyRequest) => {
    const query = request.query as { limit?: string; page?: string };
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 20;
    const result = await SuperAdminService.getAuditLogs(page, limit);
    return { ...result, success: true };
  });
}
