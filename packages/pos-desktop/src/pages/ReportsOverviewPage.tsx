import React, { useEffect, useState } from 'react';
import type { StorageAdapterDailyReportSnapshot } from '@marketpos/shared';

interface ReportsOverviewPageProps {
  companyId: string;
  registerId: string;
  storageAdapter: {
    getLocalDailyReport: (query: { companyId: string; registerId: string; referenceAt?: string }) => Promise<StorageAdapterDailyReportSnapshot>;
  };
}

export const ReportsOverviewPage: React.FC<ReportsOverviewPageProps> = ({
  companyId,
  registerId,
  storageAdapter,
}) => {
  const [reportSnapshot, setReportSnapshot] = useState<StorageAdapterDailyReportSnapshot | null>(null);
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'this_week' | 'this_month'>('today');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      let refDate = new Date();
      if (datePreset === 'yesterday') {
        refDate.setDate(refDate.getDate() - 1);
      }
      const data = await storageAdapter.getLocalDailyReport({
        companyId,
        referenceAt: refDate.toISOString(),
        registerId,
      });
      setReportSnapshot(data);
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [datePreset]);

  const report = reportSnapshot?.report;
  const topProducts = reportSnapshot?.topProducts || [];

  return (
    <div className="page-shell" style={{ padding: '24px', overflowY: 'auto' }}>
      {/* Header & Date Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            📊 Gelişmiş Raporlar & Analiz Katmanı
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            Ciro, Kar/Zarar marjları, Ödeme yöntemleri ve Ürün satış analizleri
          </p>
        </div>

        {/* Date Filter Buttons */}
        <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-card)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border)' }}>
          <button
            className={`btn btn-sm ${datePreset === 'today' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setDatePreset('today')}
          >
            Bugün
          </button>
          <button
            className={`btn btn-sm ${datePreset === 'yesterday' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setDatePreset('yesterday')}
          >
            Dün
          </button>
          <button
            className={`btn btn-sm ${datePreset === 'this_week' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setDatePreset('this_week')}
          >
            Bu Hafta
          </button>
          <button
            className={`btn btn-sm ${datePreset === 'this_month' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setDatePreset('this_month')}
          >
            Bu Ay
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner" />
          <p style={{ marginTop: '12px', color: 'var(--text-muted)' }}>Raporlar yükleniyor...</p>
        </div>
      ) : (
        <>
          {/* Top KPI Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Toplam Ciro</span>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '4px', color: 'var(--accent)' }}>
                {report?.totalSales?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{report?.salesCount || 0} Satış İşlemi</span>
            </div>

            <div className="card" style={{ borderLeft: '4px solid var(--success)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net Satış</span>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '4px', color: 'var(--success)' }}>
                {report?.netSales?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>KDV Dahil Net Gelir</span>
            </div>

            <div className="card" style={{ borderLeft: '4px solid var(--warning)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Hesaplanan KDV</span>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '4px', color: 'var(--warning)' }}>
                {report?.totalVat?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Vergi Tahakkuku</span>
            </div>

            <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>İadeler</span>
              <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '4px', color: 'var(--danger)' }}>
                {report?.totalRefunds?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{report?.refundsCount || 0} İade İşlemi</span>
            </div>
          </div>

          {/* Payment Method Breakdown & Top Products Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
            {/* Payment Method Breakdown Card */}
            <div className="card">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                💳 Ödeme Dağılımı
              </h3>
              <div style={{ marginTop: '16px', display: 'grid', gap: '12px' }}>
                {(report?.paymentBreakdown || []).map((pb, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                    <span style={{ fontWeight: 600 }}>
                      {pb.method === 'CASH' ? '💵 Nakit' : pb.method === 'CREDIT_CARD' ? '💳 Kredi Kartı' : '📝 Veresiye/Cari'}
                    </span>
                    <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                      {pb.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </span>
                  </div>
                ))}
                {(!report?.paymentBreakdown || report.paymentBreakdown.length === 0) && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Henüz ödeme kaydı bulunmuyor.</p>
                )}
              </div>
            </div>

            {/* Top Products Table */}
            <div className="card">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                🔥 En Çok Satan Ürünler
              </h3>
              <div style={{ marginTop: '16px', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px' }}>Ürün Adı</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Adet</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>Toplam Ciro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((prod, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 600 }}>{prod.productName}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700 }}>{prod.totalQuantity}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>
                          {prod.totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </td>
                      </tr>
                    ))}
                    {topProducts.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          Bu periyotta henüz satış kaydı yok.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
