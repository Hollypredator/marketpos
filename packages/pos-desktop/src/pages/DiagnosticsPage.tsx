import React, { useEffect, useState } from 'react';

import type {
  CustomerOpQueueRecord,
  PendingRefundRecord,
  PendingSaleRecord,
  ProductOpQueueRecord,
  PurchaseOpQueueRecord,
  RuntimeInfo,
  StockOpQueueRecord,
  SupplierOpQueueRecord,
  SyncStatusSummary,
} from '../electron-api';
import { useApp, useToast } from '../store';
import ManagerApprovalModal from '../components/ManagerApprovalModal';
import type { ManagerApprovalPayload } from '../components/ManagerApprovalModal';

export default function DiagnosticsPage() {
  const { state } = useApp();
  const toast = useToast();
  const [summary, setSummary] = useState<SyncStatusSummary | null>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);

  const [failedSales, setFailedSales] = useState<PendingSaleRecord[]>([]);
  const [failedRefunds, setFailedRefunds] = useState<PendingRefundRecord[]>([]);
  const [failedCustomerOps, setFailedCustomerOps] = useState<CustomerOpQueueRecord[]>([]);
  const [failedProductOps, setFailedProductOps] = useState<ProductOpQueueRecord[]>([]);
  const [failedSupplierOps, setFailedSupplierOps] = useState<SupplierOpQueueRecord[]>([]);
  const [failedPurchaseOps, setFailedPurchaseOps] = useState<PurchaseOpQueueRecord[]>([]);
  const [failedStockOps, setFailedStockOps] = useState<StockOpQueueRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDiagnostics = async () => {
    setIsLoading(true);
    try {
      const [
        sum,
        run,
        sales,
        refunds,
        customerOps,
        productOps,
        supplierOps,
        purchaseOps,
        stockOps,
      ] = await Promise.all([
        window.electronAPI.getQueueStatus(),
        window.electronAPI.getRuntimeInfo(),
        window.electronAPI
          .listPendingSales(100)
          .then((list) => list.filter((i) => i.syncStatus === 'FAILED')),
        window.electronAPI
          .listPendingRefunds(100)
          .then((list) => list.filter((i) => i.syncStatus === 'FAILED')),
        window.electronAPI
          .listPendingCustomerOps(100)
          .then((list) => list.filter((i) => i.syncStatus === 'FAILED')),
        window.electronAPI
          .listPendingProductOps(100)
          .then((list) => list.filter((i) => i.syncStatus === 'FAILED')),
        window.electronAPI
          .listPendingSupplierOps(100)
          .then((list) => list.filter((i) => i.syncStatus === 'FAILED')),
        window.electronAPI
          .listPendingPurchaseOps(100)
          .then((list) => list.filter((i) => i.syncStatus === 'FAILED')),
        window.electronAPI
          .listPendingStockOps(100)
          .then((list) => list.filter((i) => i.syncStatus === 'FAILED')),
      ]);

      setSummary(sum);
      setRuntime(run);
      setFailedSales(sales);
      setFailedRefunds(refunds);
      setFailedCustomerOps(customerOps);
      setFailedProductOps(productOps);
      setFailedSupplierOps(supplierOps);
      setFailedPurchaseOps(purchaseOps);
      setFailedStockOps(stockOps);
    } catch {
      toast.error('Diagnostik veriler alinamadi.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadDiagnostics();
    const interval = setInterval(loadDiagnostics, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSyncNow = async () => {
    try {
      toast.info('Senkronizasyon baslatildi...');
      const result = await window.electronAPI.runSync({
        registerId: state.registerId || '',
      });
      if (result.success) {
        toast.success('Senkronizasyon basariyla tamamlandi.');
      } else {
        toast.warn(`${result.errors.length} hata ile tamamlandi.`);
      }
      await loadDiagnostics();
    } catch {
      toast.error('Senkronizasyon sirasinda hata olustu.');
    }
  };

  const [pendingApprovalAction, setPendingApprovalAction] = useState<{
    type: 'retry' | 'clear';
    entity: string;
    id: string;
  } | null>(null);

  const handleApprovalSuccess = async (approval: ManagerApprovalPayload) => {
    if (!pendingApprovalAction) return;
    const { type, entity, id } = pendingApprovalAction;
    try {
      if (type === 'retry') {
        const success = await window.electronAPI.retryQueueRecord(entity, id);
        if (success) {
          toast.success('Kayit durumu tekrar denenecek sekilde guncellendi.');
        } else {
          toast.error('Kayit guncellenemedi.');
        }
      } else {
        const success = await window.electronAPI.deleteQueueRecord(entity, id);
        if (success) {
          toast.success('Kayit kuyruktan temizlendi.');
        } else {
          toast.error('Kayit silinemedi.');
        }
      }
      setPendingApprovalAction(null);
      await loadDiagnostics();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Islem basarisiz.');
    }
  };

  const handleTestPrint = async () => {
    try {
      toast.info('Yazici testi gonderiliyor...');
      const res = await window.electronAPI.testHardwarePrint();
      if (res.success) {
        toast.success('Yazici test fisi basariyla gonderildi.');
      } else {
        toast.error(`Yazici test hatasi: ${res.message}`);
      }
    } catch {
      toast.error('Yazici testi sirasinda hata olustu.');
    }
  };

  const handleTestDrawer = async () => {
    try {
      toast.info('Cekmece tetikleniyor...');
      const res = await window.electronAPI.testHardwareDrawer();
      if (res.success) {
        toast.success('Cekmece basariyla acildi.');
      } else {
        toast.error(`Cekmece hatasi: ${res.message}`);
      }
    } catch {
      toast.error('Cekmece tetikleme sirasinda hata olustu.');
    }
  };

  const failedTotal =
    failedSales.length +
    failedRefunds.length +
    failedCustomerOps.length +
    failedProductOps.length +
    failedSupplierOps.length +
    failedPurchaseOps.length +
    failedStockOps.length;

  return (
    <div className="diagnostics-page">
      <div className="header">
        <span className="header-title">Sistem Teşhis ve Senkronizasyon</span>
        <div className="header-actions">
          <button className="btn btn-ghost tactile-press" onClick={handleTestPrint}>
            Yazıcı Test Fişi Yazdır
          </button>
          <button className="btn btn-ghost tactile-press" onClick={handleTestDrawer}>
            Kasa Çekmecesini Aç
          </button>
          <button className="btn btn-primary tactile-press" onClick={handleSyncNow} disabled={isLoading}>
            Şimdi Senkronize Et
          </button>
          <button className="btn btn-ghost tactile-press" onClick={loadDiagnostics}>
            Yenile
          </button>
        </div>
      </div>

      <div className="diagnostics-grid">
        <section className="diagnostics-card glass-card health-overview">
          <div className="card-header">
            <h3>Sistem Sağlığı</h3>
          </div>
          <div className="health-stats">
            <div className="stat-item">
              <span className="label">Bağlantı</span>
              <span className={`value status-${state.isOnline ? 'online' : 'offline'}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className={`status-dot ${state.isOnline ? 'online pulse-status' : 'offline pulse-status-offline'}`} />
                {state.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
              </span>
            </div>
            <div className="stat-item">
              <span className="label">Sync Durumu</span>
              <span className={`value health-${summary?.lastSyncStatus.toLowerCase() || 'idle'}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className={`status-dot ${summary?.lastSyncStatus === 'OK' ? 'online pulse-status' : summary?.lastSyncStatus === 'DEGRADED' ? 'warn pulse-status' : 'offline'}`} style={{ backgroundColor: summary?.lastSyncStatus === 'OK' ? 'var(--success)' : summary?.lastSyncStatus === 'DEGRADED' ? 'var(--warning)' : 'var(--text-muted)' }} />
                {summary?.lastSyncStatus === 'OK'
                  ? 'Sağlıklı'
                  : summary?.lastSyncStatus === 'DEGRADED'
                    ? 'Zayıf'
                    : 'Boşta'}
              </span>
            </div>
            <div className="stat-item">
              <span className="label">Toplam Bekleyen</span>
              <span className="value">{summary?.pendingCount || 0}</span>
            </div>
            <div className="stat-item">
              <span className="label">Son Sync</span>
              <span className="value">
                {summary?.lastSyncedAt ? new Date(summary.lastSyncedAt).toLocaleString() : 'Hiç'}
              </span>
            </div>
            <div className="stat-item">
              <span className="label">Son Hata Kodu</span>
              <span className="value">{summary?.lastSyncErrorCode ?? '-'}</span>
            </div>
          </div>
        </section>

        <section className="diagnostics-card glass-card queue-breakdown">
          <div className="card-header">
            <h3>Kuyruk Detaylari</h3>
          </div>
          <div className="queue-stats">
            <div className="queue-row">
              <span>Satislar</span>
              <span className="count">{summary?.sales || 0}</span>
            </div>
            <div className="queue-row">
              <span>Iadeler</span>
              <span className="count">{summary?.refunds || 0}</span>
            </div>
            <div className="queue-row">
              <span>Musteri Islem</span>
              <span className="count">{summary?.customerOps || 0}</span>
            </div>
            <div className="queue-row">
              <span>Urun Islem</span>
              <span className="count">{summary?.productOps || 0}</span>
            </div>
            <div className="queue-row">
              <span>Tedarikci Islem</span>
              <span className="count">{summary?.supplierOps || 0}</span>
            </div>
            <div className="queue-row">
              <span>Alis Faturasi Islem</span>
              <span className="count">{summary?.purchaseOps || 0}</span>
            </div>
            <div className="queue-row">
              <span>Stok Islem</span>
              <span className="count">{summary?.stockOps || 0}</span>
            </div>
            <div className="queue-row">
              <span>Kuyruk Tepe</span>
              <span className="count">{summary?.queuePeak || 0}</span>
            </div>
            <div className="queue-row">
              <span>En Eski Bekleyen (sn)</span>
              <span className="count">
                {typeof summary?.oldestPendingAgeSec === 'number'
                  ? summary.oldestPendingAgeSec
                  : '-'}
              </span>
            </div>
          </div>

          <div className="table-wrapper" style={{ marginTop: '0.75rem' }}>
            <table className="diagnostics-table">
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Queued</th>
                  <th>Pending</th>
                  <th>Synced</th>
                  <th>Failed</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'sales', label: 'Satis' },
                  { key: 'refunds', label: 'Iade' },
                  { key: 'customerOps', label: 'Musteri' },
                  { key: 'productOps', label: 'Urun' },
                  { key: 'supplierOps', label: 'Tedarikci' },
                  { key: 'purchaseOps', label: 'Alis Faturasi' },
                  { key: 'stockOps', label: 'Stok' },
                ].map((row) => {
                  const entitySummary =
                    summary?.queueByEntity?.[
                      row.key as keyof SyncStatusSummary['queueByEntity']
                    ];
                  return (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{entitySummary?.queued ?? 0}</td>
                      <td>{entitySummary?.pending ?? 0}</td>
                      <td>{entitySummary?.synced ?? 0}</td>
                      <td>{entitySummary?.failed ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="diagnostics-card glass-card failed-items full-width">
          <div className="card-header">
            <h3>Hata Alan Kayıtlar</h3>
          </div>
          <div className="failed-table-container">
            {failedTotal === 0 ? (
              <div className="empty-state">Hatali kayit bulunmuyor. Sistem temiz.</div>
            ) : (
              <table className="diagnostics-table">
                <thead>
                  <tr>
                    <th>Tur</th>
                    <th>ID</th>
                    <th>Olusturulma</th>
                    <th>Deneme</th>
                    <th>Son Hata</th>
                    <th style={{ textAlign: 'right' }}>Aksiyon</th>
                  </tr>
                </thead>
                <tbody>
                  {failedSales.map((row) => (
                    <tr key={row.id}>
                      <td className="type-sale">SATIS</td>
                      <td className="id-cell">{row.id.slice(0, 8)}...</td>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>{row.failureCount} / 5</td>
                      <td className="error-cell" title={row.syncError || ''}>
                        {row.syncError || 'Bilinmeyen hata'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px', marginRight: '4px' }}
                          onClick={() => setPendingApprovalAction({ type: 'retry', entity: 'sales', id: row.id })}
                        >
                          Dene
                        </button>
                        <button
                          className="btn btn-danger btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px' }}
                          onClick={() => setPendingApprovalAction({ type: 'clear', entity: 'sales', id: row.id })}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                  {failedRefunds.map((row) => (
                    <tr key={row.id}>
                      <td className="type-refund">IADE</td>
                      <td className="id-cell">{row.id.slice(0, 8)}...</td>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>{row.failureCount} / 5</td>
                      <td className="error-cell" title={row.syncError || ''}>
                        {row.syncError || 'Bilinmeyen hata'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px', marginRight: '4px' }}
                          onClick={() => setPendingApprovalAction({ type: 'retry', entity: 'refunds', id: row.id })}
                        >
                          Dene
                        </button>
                        <button
                          className="btn btn-danger btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px' }}
                          onClick={() => setPendingApprovalAction({ type: 'clear', entity: 'refunds', id: row.id })}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                  {failedCustomerOps.map((row) => (
                    <tr key={row.id}>
                      <td>MUSTERI_OP</td>
                      <td className="id-cell">{row.id.slice(0, 8)}...</td>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>{row.failureCount} / 5</td>
                      <td className="error-cell" title={row.syncError || ''}>
                        {row.syncError || 'Bilinmeyen hata'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px', marginRight: '4px' }}
                          onClick={() => setPendingApprovalAction({ type: 'retry', entity: 'customerOps', id: row.id })}
                        >
                          Dene
                        </button>
                        <button
                          className="btn btn-danger btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px' }}
                          onClick={() => setPendingApprovalAction({ type: 'clear', entity: 'customerOps', id: row.id })}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                  {failedProductOps.map((row) => (
                    <tr key={row.id}>
                      <td>URUN_OP</td>
                      <td className="id-cell">{row.id.slice(0, 8)}...</td>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>{row.failureCount} / 5</td>
                      <td className="error-cell" title={row.syncError || ''}>
                        {row.syncError || 'Bilinmeyen hata'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px', marginRight: '4px' }}
                          onClick={() => setPendingApprovalAction({ type: 'retry', entity: 'productOps', id: row.id })}
                        >
                          Dene
                        </button>
                        <button
                          className="btn btn-danger btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px' }}
                          onClick={() => setPendingApprovalAction({ type: 'clear', entity: 'productOps', id: row.id })}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                  {failedSupplierOps.map((row) => (
                    <tr key={row.id}>
                      <td>SUPPLIER_OP</td>
                      <td className="id-cell">{row.id.slice(0, 8)}...</td>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>{row.failureCount} / 5</td>
                      <td className="error-cell" title={row.syncError || ''}>
                        {row.syncError || 'Bilinmeyen hata'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px', marginRight: '4px' }}
                          onClick={() => setPendingApprovalAction({ type: 'retry', entity: 'supplierOps', id: row.id })}
                        >
                          Dene
                        </button>
                        <button
                          className="btn btn-danger btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px' }}
                          onClick={() => setPendingApprovalAction({ type: 'clear', entity: 'supplierOps', id: row.id })}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                  {failedPurchaseOps.map((row) => (
                    <tr key={row.id}>
                      <td>PURCHASE_OP</td>
                      <td className="id-cell">{row.id.slice(0, 8)}...</td>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>{row.failureCount} / 5</td>
                      <td className="error-cell" title={row.syncError || ''}>
                        {row.syncError || 'Bilinmeyen hata'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px', marginRight: '4px' }}
                          onClick={() => setPendingApprovalAction({ type: 'retry', entity: 'purchaseOps', id: row.id })}
                        >
                          Dene
                        </button>
                        <button
                          className="btn btn-danger btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px' }}
                          onClick={() => setPendingApprovalAction({ type: 'clear', entity: 'purchaseOps', id: row.id })}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                  {failedStockOps.map((row) => (
                    <tr key={row.id}>
                      <td>STOK_OP</td>
                      <td className="id-cell">{row.id.slice(0, 8)}...</td>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>{row.failureCount} / 5</td>
                      <td className="error-cell" title={row.syncError || ''}>
                        {row.syncError || 'Bilinmeyen hata'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px', marginRight: '4px' }}
                          onClick={() => setPendingApprovalAction({ type: 'retry', entity: 'stockOps', id: row.id })}
                        >
                          Dene
                        </button>
                        <button
                          className="btn btn-danger btn-sm tactile-press"
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px' }}
                          onClick={() => setPendingApprovalAction({ type: 'clear', entity: 'stockOps', id: row.id })}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="diagnostics-card glass-card environment-info">
          <div className="card-header">
            <h3>Çalışma Alanı Bilgileri</h3>
          </div>
          <div className="env-stats">
            <div className="env-row">
              <span>Versiyon</span>
              <span>v{runtime?.version}</span>
            </div>
            <div className="env-row">
              <span>Veritabani</span>
              <span className="path-text" title={runtime?.databasePath}>
                {runtime?.databasePath.split('\\').pop()}
              </span>
            </div>
            <div className="env-row">
              <span>API Endpoint</span>
              <span>{runtime?.apiBaseUrl}</span>
            </div>
          </div>
        </section>
      </div>
      {pendingApprovalAction && (
        <ManagerApprovalModal
          actionLabel={pendingApprovalAction.type === 'retry' ? 'Kuyruk Yeniden Deneme Onayı' : 'Kuyruk Silme Onayı'}
          companyId={state.user?.companyId}
          description={
            pendingApprovalAction.type === 'retry'
              ? 'Hata alan bu kaydı tekrar denemek için yönetici şifre onayı gereklidir.'
              : 'Bu kaydı senkronizasyon kuyruğundan silmek için yönetici şifre onayı gereklidir.'
          }
          onCancel={() => setPendingApprovalAction(null)}
          onApproved={handleApprovalSuccess}
          reasonLabel="Onay Nedeni"
          reasonPlaceholder="Örnek: Hatalı kayıt tespiti veya el ile düzeltme"
          requireReason
        />
      )}
    </div>
  );
}
