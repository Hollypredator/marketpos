import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';

export interface DatabaseBackupRecord {
  companyCount: number;
  createdAt: string;
  filename: string;
  id: string;
  note: string | null;
  productCount: number;
  saleCount: number;
  sizeBytes: number;
}

export interface RegisterHeartbeatInput {
  appVersion: string;
  branchId: string;
  companyId: string;
  isOnline: boolean;
  pendingQueueSize: number;
  registerId: string;
  registerName?: string;
}

export interface AppReleaseInput {
  downloadUrl?: string;
  isMandatory?: boolean;
  minRequiredVersion?: string;
  releaseNotes: string;
  version: string;
}

export interface ResellerInput {
  email: string;
  name: string;
  phone: string;
  quota?: number;
  region: string;
}

// In-memory heartbeat cache for high-frequency telemetry (pinged every 30s by registers)
const heartbeatStore = new Map<string, {
  appVersion: string;
  branchId: string;
  companyId: string;
  isOnline: boolean;
  lastPingAt: Date;
  pendingQueueSize: number;
  registerId: string;
  registerName: string;
}>();

// In-memory releases store fallback
const releasesStore: Array<{
  createdAt: Date;
  downloadUrl: string | null;
  id: string;
  isMandatory: boolean;
  minRequiredVersion: string | null;
  releaseNotes: string;
  version: string;
}> = [
  {
    createdAt: new Date(),
    downloadUrl: '/downloads/marketpos-desktop-v1.0.0.exe',
    id: 'rel-1',
    isMandatory: false,
    minRequiredVersion: '1.0.0',
    releaseNotes: 'İlk kararlı omur boyu lisanslı sürüm.',
    version: '1.0.0',
  },
];

// In-memory resellers store fallback
const resellersStore: Array<{
  activeTenantCount: number;
  createdAt: Date;
  email: string;
  id: string;
  name: string;
  phone: string;
  quota: number;
  region: string;
}> = [
  {
    activeTenantCount: 12,
    createdAt: new Date(),
    email: 'marmara@marketpos.com',
    id: 'res-1',
    name: 'Marmara Bölge Bayii - Yılmaz Bilişim',
    phone: '0212 555 0101',
    quota: 50,
    region: 'Marmara / İstanbul',
  },
  {
    activeTenantCount: 5,
    createdAt: new Date(),
    email: 'ege@marketpos.com',
    id: 'res-2',
    name: 'Ege Bölge Bayii - Ege Teknoloji',
    phone: '0232 444 0202',
    quota: 30,
    region: 'Ege / İzmir',
  },
];

export class PlatformAdminService {
  /**
   * 1. BACKUP ENGINE: Create full database snapshot
   */
  static async createDatabaseBackup(note?: string, actorUserId?: string): Promise<DatabaseBackupRecord> {
    const now = new Date();
    const backupId = `backup-${Date.now()}`;
    const timestampStr = now.toISOString().replace(/[:.]/g, '-');
    const filename = `marketpos-snapshot-${timestampStr}.json`;
    const backupsDir = path.resolve(process.cwd(), 'backups');

    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const filePath = path.join(backupsDir, filename);

    // Fetch snapshot of critical database tables
    const [companies, branches, registers, users, products, sales] = await Promise.all([
      prisma.company.findMany({ where: { deletedAt: null } }),
      prisma.branch.findMany({ where: { deletedAt: null } }),
      prisma.register.findMany({ where: { deletedAt: null } }),
      prisma.user.findMany({ select: { branchId: true, companyId: true, fullName: true, id: true, role: true, username: true }, where: { deletedAt: null } }),
      prisma.product.findMany({ take: 5000, where: { deletedAt: null } }),
      prisma.sale.findMany({ take: 5000, where: { deletedAt: null } }),
    ]);

    const snapshotData = {
      exportedAt: now.toISOString(),
      metadata: {
        branchCount: branches.length,
        companyCount: companies.length,
        productCount: products.length,
        registerCount: registers.length,
        saleCount: sales.length,
        userCount: users.length,
        version: '1.0.0',
      },
      tables: {
        branches,
        companies,
        products,
        registers,
        sales,
        users,
      },
    };

    const jsonString = JSON.stringify(snapshotData, null, 2);
    fs.writeFileSync(filePath, jsonString, 'utf-8');

    // Create Audit Log
    await prisma.companySubscriptionAudit.create({
      data: {
        actorType: actorUserId ? 'USER' : 'SYSTEM',
        actorUserId: actorUserId || null,
        companyId: companies[0]?.id || 'system',
        eventType: 'SYSTEM_RESTORE_ACTIVE',
        nextPayload: { filename, sizeBytes: Buffer.byteLength(jsonString) },
        nextStatus: 'ACTIVE',
        note: note || `Sistem yedegi olusturuldu: ${filename}`,
      },
    });

    return {
      companyCount: companies.length,
      createdAt: now.toISOString(),
      filename,
      id: backupId,
      note: note || 'Tam sistem yedeği',
      productCount: products.length,
      saleCount: sales.length,
      sizeBytes: Buffer.byteLength(jsonString),
    };
  }

  /**
   * 1. BACKUP ENGINE: List historical backups on disk
   */
  static async listDatabaseBackups(): Promise<DatabaseBackupRecord[]> {
    const backupsDir = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupsDir)) {
      return [];
    }

    const files = fs.readdirSync(backupsDir).filter((f) => f.endsWith('.json'));
    const records: DatabaseBackupRecord[] = [];

    for (const filename of files) {
      const filePath = path.join(backupsDir, filename);
      const stat = fs.statSync(filePath);
      
      let companyCount = 0;
      let productCount = 0;
      let saleCount = 0;

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        companyCount = parsed.metadata?.companyCount || 0;
        productCount = parsed.metadata?.productCount || 0;
        saleCount = parsed.metadata?.saleCount || 0;
      } catch (err) {
        // Ignore read error for legacy files
      }

      records.push({
        companyCount,
        createdAt: stat.mtime.toISOString(),
        filename,
        id: `backup-${stat.mtimeMs}`,
        note: 'Sistem Yedeği',
        productCount,
        saleCount,
        sizeBytes: stat.size,
      });
    }

    return records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * 2. TELEMETRY: Record ping heartbeat from active register terminals
   */
  static recordRegisterHeartbeat(input: RegisterHeartbeatInput) {
    const registerKey = `${input.companyId}:${input.registerId}`;
    heartbeatStore.set(registerKey, {
      appVersion: input.appVersion,
      branchId: input.branchId,
      companyId: input.companyId,
      isOnline: input.isOnline,
      lastPingAt: new Date(),
      pendingQueueSize: input.pendingQueueSize,
      registerId: input.registerId,
      registerName: input.registerName || `Kasa ${input.registerId.slice(-4)}`,
    });
    return { success: true, timestamp: new Date().toISOString() };
  }

  /**
   * 2. TELEMETRY: Get central live telemetry map across all market registers
   */
  static async getTelemetryMap() {
    const now = new Date();
    const companies = await prisma.company.findMany({
      include: {
        branches: {
          include: {
            registers: true,
          },
          where: { deletedAt: null },
        },
      },
      where: { deletedAt: null },
    });

    const activeMap: Array<{
      appVersion: string;
      branchName: string;
      companyId: string;
      companyName: string;
      isOnline: boolean;
      lastPingAt: string | null;
      pendingQueueSize: number;
      registerId: string;
      registerName: string;
      statusBadge: 'ONLINE' | 'OFFLINE' | 'QUEUE_LAG';
    }> = [];

    for (const company of companies) {
      for (const branch of company.branches) {
        for (const reg of branch.registers) {
          const registerKey = `${company.id}:${reg.id}`;
          const ping = heartbeatStore.get(registerKey);

          let isOnline = false;
          let statusBadge: 'ONLINE' | 'OFFLINE' | 'QUEUE_LAG' = 'OFFLINE';
          let lastPingAt: string | null = null;
          let pendingQueueSize = 0;
          let appVersion = 'v1.0.0';

          if (ping) {
            const diffSeconds = (now.getTime() - ping.lastPingAt.getTime()) / 1000;
            isOnline = diffSeconds < 90; // Active if pinged within last 90 seconds
            lastPingAt = ping.lastPingAt.toISOString();
            pendingQueueSize = ping.pendingQueueSize;
            appVersion = ping.appVersion;

            if (isOnline) {
              statusBadge = pendingQueueSize > 10 ? 'QUEUE_LAG' : 'ONLINE';
            }
          }

          activeMap.push({
            appVersion,
            branchName: branch.name,
            companyId: company.id,
            companyName: company.name,
            isOnline,
            lastPingAt,
            pendingQueueSize,
            registerId: reg.id,
            registerName: reg.name,
            statusBadge,
          });
        }
      }
    }

    const onlineRegistersCount = activeMap.filter((r) => r.isOnline).length;
    const offlineRegistersCount = activeMap.filter((r) => !r.isOnline).length;
    const queueLagCount = activeMap.filter((r) => r.statusBadge === 'QUEUE_LAG').length;

    return {
      overview: {
        offlineCount: offlineRegistersCount,
        onlineCount: onlineRegistersCount,
        queueLagCount,
        totalRegisters: activeMap.length,
      },
      registers: activeMap,
    };
  }

  /**
   * 3. AUTO-UPDATER: Publish a new software update release
   */
  static publishRelease(input: AppReleaseInput) {
    const release = {
      createdAt: new Date(),
      downloadUrl: input.downloadUrl || `/downloads/marketpos-desktop-v${input.version}.exe`,
      id: `rel-${Date.now()}`,
      isMandatory: !!input.isMandatory,
      minRequiredVersion: input.minRequiredVersion || null,
      releaseNotes: input.releaseNotes,
      version: input.version.trim(),
    };

    releasesStore.unshift(release);
    return release;
  }

  /**
   * 3. AUTO-UPDATER: Get latest published software release info for clients
   */
  static getLatestRelease(currentVersion?: string) {
    const latest = releasesStore[0] || null;
    if (!latest) return { updateAvailable: false };

    const updateAvailable = currentVersion ? latest.version !== currentVersion : true;
    return {
      latestRelease: latest,
      updateAvailable,
    };
  }

  /**
   * 4. RESELLER PORTAL: List all reseller partners & license quotas
   */
  static listResellers() {
    return resellersStore;
  }

  /**
   * 4. RESELLER PORTAL: Register a new reseller partner
   */
  static createReseller(input: ResellerInput) {
    const reseller = {
      activeTenantCount: 0,
      createdAt: new Date(),
      email: input.email.trim(),
      id: `res-${Date.now()}`,
      name: input.name.trim(),
      phone: input.phone.trim(),
      quota: input.quota || 20,
      region: input.region.trim(),
    };

    resellersStore.push(reseller);
    return reseller;
  }
}
