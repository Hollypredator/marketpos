import React, { useState } from 'react';
import { useClientPagination } from '../hooks/use-client-pagination';
import { PaginationControls } from '../components/PaginationControls';
import { TableState } from '../components/TableState';
import type { SystemAuditRow } from '../domain/subscription/api';

interface AuditLogPageProps {
  rows: SystemAuditRow[];
  loading: boolean;
  errorText: string | null;
  toDateTime: (value?: string | null) => string;
}

const EVENT_LABELS: Record<string, string> = {
  RENEW_QUICK: 'Hızlı Yenileme',
  RENEW_MANUAL: 'Manuel Yenileme',
  SUSPEND_MANUAL: 'Askıya Alma',
  UNSUSPEND_MANUAL: 'Askıdan Çıkarma',
  SYSTEM_ENTER_GRACE: 'Ek Süre Başlangıcı',
  SYSTEM_BLOCK_EXPIRED: 'Süre Dolumu',
  SYSTEM_RESTORE_ACTIVE: 'Sistem Aktifleştirme',
  SYSTEM_SEED_FAILURE: 'Katalog Kurulum Hatası',
};

function renderDiff(previous: any, next: any) {
  if (!previous && !next) return <p className="muted">Detaylı veri bulunmuyor.</p>;

  const prevData = typeof previous === 'string' ? JSON.parse(previous) : previous || {};
  const nextData = typeof next === 'string' ? JSON.parse(next) : next || {};

  // Check if it's a seed failure or contains an error block
  if (nextData.error || prevData.error) {
    const errorMsg = nextData.error || prevData.error;
    const stackTrace = nextData.stack || prevData.stack;
    return (
      <div className="error-details">
        <h4 className="error-title">Hata Mesajı:</h4>
        <div className="code-block error-message">{errorMsg}</div>
        {stackTrace && (
          <>
            <h4 className="error-title" style={{ marginTop: '12px' }}>Yığın İzi (Stack Trace):</h4>
            <pre className="code-block error-stack">{stackTrace}</pre>
          </>
        )}
      </div>
    );
  }

  // Collect all keys
  const allKeys = Array.from(new Set([...Object.keys(prevData), ...Object.keys(nextData)]));

  const formatVal = (v: any) => {
    if (v === null || v === undefined) return '-';
    if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  return (
    <div className="table-wrap">
      <table className="diff-table">
        <thead>
          <tr>
            <th>Alan Adı</th>
            <th>Eski Değer</th>
            <th>Yeni Değer</th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key) => {
            if (key === 'companyAccess') return null; // Skip complex nested JSON objects
            const prevVal = prevData[key];
            const nextVal = nextData[key];
            const isChanged = JSON.stringify(prevVal) !== JSON.stringify(nextVal);

            return (
              <tr key={key} className={isChanged ? 'diff-row-changed' : ''}>
                <td><strong>{key}</strong></td>
                <td>{formatVal(prevVal)}</td>
                <td>{formatVal(nextVal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AuditLogPage({
  rows,
  loading,
  errorText,
  toDateTime,
}: AuditLogPageProps): React.ReactElement {
  const pagination = useClientPagination(rows, { pageSize: 50 });
  const [selectedRow, setSelectedRow] = useState<SystemAuditRow | null>(null);

  return (
    <section className="panel-grid">
      <article className="card">
        <h2>Denetim Kaydı (Audit Log)</h2>
        <p className="muted">Tüm firmalardaki abonelik ve paket değişikliklerinin kronolojik kaydı. Detayları görmek için bir satıra tıklayın.</p>

        <div className="table-wrap tall" style={{ marginTop: '16px' }}>
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Firma</th>
                <th>İşlem</th>
                <th>Aktör</th>
                <th>Durum Değişimi</th>
                <th>Açıklama</th>
                <th style={{ width: '80px', textAlign: 'center' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={7}
                emptyText="Henuz denetim kaydı bulunmuyor."
                errorText={errorText}
                loading={loading}
                rowCount={pagination.total}
              />
              {pagination.visibleRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedRow(row)}
                  style={{ cursor: 'pointer' }}
                  className="hover-row"
                >
                  <td>{toDateTime(row.createdAt)}</td>
                  <td style={{ fontWeight: 600 }}>{row.company?.name ?? row.companyId}</td>
                  <td>
                    <span className={`event-badge ${row.eventType === 'SYSTEM_SEED_FAILURE' ? 'danger' : ''}`}>
                      {EVENT_LABELS[row.eventType] ?? row.eventType}
                    </span>
                  </td>
                  <td>
                    {row.actorType === 'SYSTEM'
                      ? 'Sistem'
                      : `${row.actorUser?.fullName ?? '-'} (${row.actorUser?.username ?? '-'})`}
                  </td>
                  <td>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>
                      {row.previousStatus ?? '-'}
                    </span>
                    <span style={{ margin: '0 4px' }}>→</span>
                    <span style={{ fontWeight: 600 }}>{row.nextStatus}</span>
                  </td>
                  <td>{row.note?.trim() ? row.note : '-'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="btn secondary sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRow(row);
                      }}
                    >
                      Detay
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.total > 0 && (
          <PaginationControls
            onPageChange={pagination.setPage}
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
          />
        )}
      </article>

      {/* Details Side Drawer */}
      {selectedRow && (
        <div className="drawer-overlay" onClick={() => setSelectedRow(null)}>
          <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>İşlem Detayları</h3>
              <button className="drawer-close-btn" onClick={() => setSelectedRow(null)}>
                &times;
              </button>
            </div>
            <div className="drawer-body">
              <div className="drawer-meta-section">
                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">Tarih</span>
                  <span className="drawer-meta-value">{toDateTime(selectedRow.createdAt)}</span>
                </div>
                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">Firma</span>
                  <span className="drawer-meta-value">{selectedRow.company?.name ?? selectedRow.companyId}</span>
                </div>
                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">İşlem Tipi</span>
                  <span className="drawer-meta-value">{EVENT_LABELS[selectedRow.eventType] ?? selectedRow.eventType}</span>
                </div>
                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">Aktör</span>
                  <span className="drawer-meta-value">
                    {selectedRow.actorType === 'SYSTEM'
                      ? 'Sistem'
                      : `${selectedRow.actorUser?.fullName ?? '-'} (${selectedRow.actorUser?.username ?? '-'})`}
                  </span>
                </div>
                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">Eski Durum</span>
                  <span className="drawer-meta-value">{selectedRow.previousStatus ?? '-'}</span>
                </div>
                <div className="drawer-meta-item">
                  <span className="drawer-meta-label">Yeni Durum</span>
                  <span className="drawer-meta-value" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                    {selectedRow.nextStatus}
                  </span>
                </div>
              </div>

              {selectedRow.note && (
                <div style={{ marginBottom: '24px' }}>
                  <span className="drawer-meta-label">Açıklama / Not</span>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem', color: 'var(--fg-2)' }}>
                    {selectedRow.note}
                  </p>
                </div>
              )}

              <span className="drawer-meta-label">Veri Değişiklikleri (Diff)</span>
              <div style={{ marginTop: '8px' }}>
                {renderDiff(selectedRow.previousPayload, selectedRow.nextPayload)}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
