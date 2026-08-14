import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PlatformAdminService } from '../services/platform-admin-service';

export const platformAdminRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Public Endpoint: Register Heartbeat Ping from desktop/web clients
  server.post<{
    Body: {
      appVersion: string;
      branchId: string;
      companyId: string;
      isOnline: boolean;
      pendingQueueSize: number;
      registerId: string;
      registerName?: string;
    };
  }>('/telemetry/heartbeat', async (request, reply) => {
    const { appVersion, branchId, companyId, isOnline, pendingQueueSize, registerId, registerName } = request.body;
    if (!registerId || !companyId || !branchId) {
      return reply.status(400).send({ error: 'Eksik parametreler', success: false });
    }

    const result = PlatformAdminService.recordRegisterHeartbeat({
      appVersion: appVersion || '1.0.0',
      branchId,
      companyId,
      isOnline: isOnline ?? true,
      pendingQueueSize: pendingQueueSize || 0,
      registerId,
      registerName,
    });

    return reply.send({ data: result, success: true });
  });

  // Public Endpoint: Client Software Auto-Update Check
  server.get<{
    Querystring: { currentVersion?: string };
  }>('/releases/check', async (request, reply) => {
    const currentVersion = request.query.currentVersion;
    const result = PlatformAdminService.getLatestRelease(currentVersion);
    return reply.send({ data: result, success: true });
  });

  // PROTECTED SUPERADMIN ENDPOINTS BELOW:
  const superAdminAuth = {
    preHandler: [server.authenticate, server.ensureSuperAdmin],
  };

  // 1. BACKUP ENGINE: Create Database Snapshot
  server.post<{
    Body: { note?: string };
  }>('/backups/create', superAdminAuth, async (request, reply) => {
    try {
      const actorUserId = (request.user as any)?.id;
      const backup = await PlatformAdminService.createDatabaseBackup(request.body?.note, actorUserId);
      return reply.send({ data: backup, success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Yedek oluşturulamadı', success: false });
    }
  });

  // 1. BACKUP ENGINE: List Database Backups
  server.get('/backups', superAdminAuth, async (_request, reply) => {
    try {
      const backups = await PlatformAdminService.listDatabaseBackups();
      return reply.send({ data: backups, success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Yedekler listelenemedi', success: false });
    }
  });

  // 2. TELEMETRY MAP: Get live status of all market register terminals
  server.get('/telemetry/map', superAdminAuth, async (_request, reply) => {
    try {
      const map = await PlatformAdminService.getTelemetryMap();
      return reply.send({ data: map, success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Telemetri haritası alınamadı', success: false });
    }
  });

  // 3. AUTO-UPDATER: Publish a new software release
  server.post<{
    Body: {
      downloadUrl?: string;
      isMandatory?: boolean;
      minRequiredVersion?: string;
      releaseNotes: string;
      version: string;
    };
  }>('/releases/publish', superAdminAuth, async (request, reply) => {
    try {
      const { downloadUrl, isMandatory, minRequiredVersion, releaseNotes, version } = request.body;
      if (!version || !releaseNotes) {
        return reply.status(400).send({ error: 'Versiyon ve Sürüm Notları zorunludur', success: false });
      }

      const release = PlatformAdminService.publishRelease({
        downloadUrl,
        isMandatory,
        minRequiredVersion,
        releaseNotes,
        version,
      });

      return reply.send({ data: release, success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Sürüm yayınlanamadı', success: false });
    }
  });

  // 4. RESELLER PORTAL: List Resellers
  server.get('/resellers', superAdminAuth, async (_request, reply) => {
    try {
      const resellers = PlatformAdminService.listResellers();
      return reply.send({ data: resellers, success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Bayiler listelenemedi', success: false });
    }
  });

  // 4. RESELLER PORTAL: Create Reseller
  server.post<{
    Body: {
      email: string;
      name: string;
      phone: string;
      quota?: number;
      region: string;
    };
  }>('/resellers/create', superAdminAuth, async (request, reply) => {
    try {
      const { email, name, phone, quota, region } = request.body;
      if (!name || !email || !phone || !region) {
        return reply.status(400).send({ error: 'Lütfen zorunlu alanları doldurunuz', success: false });
      }

      const reseller = PlatformAdminService.createReseller({ email, name, phone, quota, region });
      return reply.send({ data: reseller, success: true });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'Bayi eklenemedi', success: false });
    }
  });
};
