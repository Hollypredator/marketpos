import type { AnnualLicenseInfo, LicenseStatus } from '@marketpos/shared';
import { ensureElectronApi } from './pos-runtime';

export interface CompanyAccessSnapshotFromApi {
  checkedAt: string;
  companyId: string;
  daysRemaining: number | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
  isAccessAllowed: boolean;
  offlineAccessGraceDays: number;
  offlineAccessValidUntil: string;
  operatorAction: string;
  packageGraceDays: number;
  reasonCode: string;
  status: LicenseStatus;
  summary: string;
  signature: string;
}

const LOCAL_STORAGE_LICENSE_KEY = 'marketpos_annual_license_snapshot';

export class AnnualLicenseService {
  /**
   * Lisansı doğrular. Önce online API'yi dener; erişilemezse yerel kaydedilmiş snapshot'ı kontrol eder.
   */
  public static async checkLicense(params: {
    companyId: string;
    apiBaseUrl?: string;
  }): Promise<AnnualLicenseInfo> {
    const electronApi = ensureElectronApi();
    const now = new Date();
    const baseUrl = params.apiBaseUrl ?? (await this.getApiBaseUrl());

    // 1. Online Doğrulama Dene
    try {
      const response = await fetch(`${baseUrl}/api/license/status?companyId=${encodeURIComponent(params.companyId)}`, {
        headers: { 'Content-Type': 'application/json' },
        method: 'GET',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const apiSnapshot: CompanyAccessSnapshotFromApi = result.data;
          
          // Yerel ayara kaydet
          await electronApi.setLocalSetting(
            LOCAL_STORAGE_LICENSE_KEY,
            JSON.stringify(apiSnapshot),
          );

          return this.formatSnapshotToLicenseInfo(apiSnapshot, now);
        }
      }
    } catch {
      // Offline fallback
    }

    // 2. Offline Fallback: Kaydedilmiş Snapshot'ı Kontrol Et
    const cachedRaw = await electronApi.getLocalSetting(LOCAL_STORAGE_LICENSE_KEY);
    if (cachedRaw) {
      try {
        const cachedSnapshot: CompanyAccessSnapshotFromApi = JSON.parse(cachedRaw);
        return this.evaluateOfflineSnapshot(cachedSnapshot, now);
      } catch {
        // Parse error fallback
      }
    }

    // 3. Hiç kayıt yoksa varsayılan varsayım (ilk kurulum / deneme)
    return {
      companyId: params.companyId,
      companyName: 'Pazaryeri Market',
      daysRemaining: 7,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      graceEndsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      gracePeriodDays: 7,
      inGracePeriod: false,
      isExpired: false,
      lastVerifiedAt: now.toISOString(),
      packageType: 'YEARLY',
      status: 'TRIAL',
    };
  }

  private static formatSnapshotToLicenseInfo(
    snapshot: CompanyAccessSnapshotFromApi,
    now: Date,
  ): AnnualLicenseInfo {
    const expiresAt = snapshot.expiresAt ? new Date(snapshot.expiresAt) : new Date();
    const daysRemaining = snapshot.daysRemaining ?? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const isExpired = !snapshot.isAccessAllowed;
    const inGracePeriod = snapshot.status === 'GRACE_PERIOD' || snapshot.reasonCode === 'PACKAGE_EXPIRED_GRACE';

    return {
      companyId: snapshot.companyId,
      companyName: 'MarketPOS İşletmesi',
      daysRemaining,
      expiresAt: snapshot.expiresAt ?? now.toISOString(),
      graceEndsAt: snapshot.graceEndsAt ?? now.toISOString(),
      gracePeriodDays: snapshot.packageGraceDays,
      inGracePeriod,
      isExpired,
      lastVerifiedAt: snapshot.checkedAt || now.toISOString(),
      offlineToken: snapshot.signature,
      packageType: 'YEARLY',
      status: snapshot.status,
    };
  }

  private static evaluateOfflineSnapshot(
    snapshot: CompanyAccessSnapshotFromApi,
    now: Date,
  ): AnnualLicenseInfo {
    const offlineValidUntil = snapshot.offlineAccessValidUntil
      ? new Date(snapshot.offlineAccessValidUntil)
      : new Date(0);

    const isOfflineGraceExpired = now.getTime() > offlineValidUntil.getTime();
    const isExpired = !snapshot.isAccessAllowed || isOfflineGraceExpired;
    const expiresAt = snapshot.expiresAt ? new Date(snapshot.expiresAt) : new Date();
    const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    let status: LicenseStatus = snapshot.status;
    if (isOfflineGraceExpired && status === 'ACTIVE') {
      status = 'EXPIRED';
    }

    return {
      companyId: snapshot.companyId,
      companyName: 'MarketPOS İşletmesi',
      daysRemaining: isOfflineGraceExpired ? 0 : daysRemaining,
      expiresAt: snapshot.expiresAt ?? now.toISOString(),
      graceEndsAt: snapshot.graceEndsAt ?? now.toISOString(),
      gracePeriodDays: snapshot.packageGraceDays,
      inGracePeriod: status === 'GRACE_PERIOD',
      isExpired,
      lastVerifiedAt: snapshot.checkedAt,
      offlineToken: snapshot.signature,
      packageType: 'YEARLY',
      status,
    };
  }

  private static async getApiBaseUrl(): Promise<string> {
    try {
      const runtime = await ensureElectronApi().getRuntimeInfo();
      return runtime.apiBaseUrl || 'https://marketpos-api-fiq6.onrender.com';
    } catch {
      return 'https://marketpos-api-fiq6.onrender.com';
    }
  }
}
