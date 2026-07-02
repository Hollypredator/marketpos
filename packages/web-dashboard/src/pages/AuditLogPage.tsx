import React from 'react';
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
  RENEW_QUICK: 'Hizli Yenileme',
  RENEW_MANUAL: 'Manuel Yenileme',
  SUSPEND_MANUAL: 'Askıya Alma',
  UNSUSPEND_MANUAL: 'Askıdan Çıkarma',
  SYSTEM_ENTER_GRACE: 'Ek Süre Başlangıcı',
  SYSTEM_BLOCK_EXPIRED: 'Süre Dolumu',
  SYSTEM_RESTORE_ACTIVE: 'Sistem Aktifleştirme',
};

export function AuditLogPage({
  rows,
  loading,
  errorText,
  toDateTime,
}: AuditLogPageProps): React.ReactElement {
  const pagination = useClientPagination(rows, { pageSize: 50 });

  return (
    <section className="panel-grid">
      <article className="card">
        <h2>Denetim Kaydı (Audit Log)</h2>
        <p className="muted">Tüm firmalardaki abonelik ve paket değişikliklerinin kronolojik kaydı.</p>

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
              </tr>
            </thead>
            <tbody>
              <TableState
                colSpan={6}
                emptyText="Henuz denetim kaydı bulunmuyor."
                errorText={errorText}
                loading={loading}
                rowCount={pagination.total}
              />
              {pagination.visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>{toDateTime(row.createdAt)}</td>
                  <td style={{ fontWeight: 600 }}>{row.company?.name ?? row.companyId}</td>
                  <td>
                    <span className="event-badge">{EVENT_LABELS[row.eventType] ?? row.eventType}</span>
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
    </section>
  );
}
