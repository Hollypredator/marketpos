import React, { useState } from 'react';

import { PaginationControls } from '../components/PaginationControls';
import { useClientPagination } from '../hooks/use-client-pagination';
import type { StockTransfer } from '../domain/stock-transfers/api';
import type { Product, Branch } from '../domain/shared/types';

interface StockTransfersPageProps {
  transfers: StockTransfer[];
  transfersLoading: boolean;
  transfersError: string | null;
  transfersPagination: { page: number; totalPages: number; total: number };
  onTransfersPageChange: (page: number) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  selectedTransferId: string;
  onSelectTransfer: (id: string) => void;
  transferDetail: StockTransfer | null;
  transferDetailLoading: boolean;
  /* create */
  branches: Branch[];
  products: Product[];
  onCreateTransfer: (payload: {
    sourceBranchId: string;
    targetBranchId: string;
    items: Array<{ productId: string; quantity: number }>;
    note?: string;
  }) => void;
  isCreating: boolean;
  /* status update */
  onUpdateTransferStatus: (id: string, status: 'ACCEPTED' | 'REJECTED' | 'CANCELLED', note?: string) => void;
  isUpdatingStatus: boolean;
  /* formatting */
  toDateTime: (value?: string | null) => string;
}

const TRANSFER_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Bekliyor', cls: 'amber' },
  ACCEPTED: { label: 'Kabul Edildi', cls: 'green' },
  REJECTED: { label: 'Reddedildi', cls: 'red' },
  CANCELLED: { label: 'İptal', cls: 'gray' },
};

export function StockTransfersPage({
  transfers,
  transfersLoading,
  transfersError,
  transfersPagination,
  onTransfersPageChange,
  statusFilter,
  onStatusFilterChange,
  selectedTransferId,
  onSelectTransfer,
  transferDetail,
  transferDetailLoading,
  branches,
  products,
  onCreateTransfer,
  isCreating,
  onUpdateTransferStatus,
  isUpdatingStatus,
  toDateTime,
}: StockTransfersPageProps): React.ReactElement {
  const [activePanel, setActivePanel] = useState<'detail' | 'create'>('detail');
  const [sourceBranchId, setSourceBranchId] = useState('');
  const [targetBranchId, setTargetBranchId] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferItems, setTransferItems] = useState<Array<{ productId: string; quantity: string }>>([
    { productId: '', quantity: '1' },
  ]);
  const [actionNote, setActionNote] = useState('');

  const transfersPag = useClientPagination(transfers, { pageSize: 20 });
  const statusInfo = (status: string) => TRANSFER_STATUS[status] ?? { label: status, cls: '' };

  const addItem = () => setTransferItems([...transferItems, { productId: '', quantity: '1' }]);
  const removeItem = (index: number) => setTransferItems(transferItems.filter((_, i) => i !== index));
  const updateItem = (index: number, field: 'productId' | 'quantity', value: string) => {
    setTransferItems(transferItems.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const handleCreate = () => {
    const validItems = transferItems
      .filter((i) => i.productId && Number(i.quantity) > 0)
      .map((i) => ({ productId: i.productId, quantity: Number(i.quantity) }));
    if (validItems.length === 0 || !sourceBranchId || !targetBranchId || sourceBranchId === targetBranchId) return;
    onCreateTransfer({
      sourceBranchId,
      targetBranchId,
      items: validItems,
      note: transferNote || undefined,
    });
    setTransferItems([{ productId: '', quantity: '1' }]);
    setTransferNote('');
    setActivePanel('detail');
  };

  return (
    <section className="sub-layout-grid">
      {/* Left — List */}
      <div>
        <article className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Stok Transferleri ({transfers.length})</div>
              <div className="card-sub">Şubeler arası stok transfer yönetimi</div>
            </div>
            <button
              type="button"
              className={`btn tab ${activePanel === 'create' ? 'active' : ''}`}
              onClick={() => setActivePanel(activePanel === 'create' ? 'detail' : 'create')}
            >
              + Yeni Transfer
            </button>
          </div>

          {/* Status filter */}
          <div className="segmented-control" style={{ marginBottom: '10px' }}>
            {['', 'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'].map((s) => (
              <button
                key={s}
                type="button"
                className={`segment ${statusFilter === s ? 'active' : ''}`}
                onClick={() => onStatusFilterChange(s)}
              >
                {s === '' ? 'Tümü' : (TRANSFER_STATUS[s]?.label ?? s)}
              </button>
            ))}
          </div>

          {transfersError && <div className="banner error">{transfersError}</div>}
          {transfersLoading && <p className="muted">Yükleniyor...</p>}

          <div className="table-wrap tall">
            <table>
              <thead>
                <tr>
                  <th>Kaynak</th>
                  <th>Hedef</th>
                  <th>Durum</th>
                  <th>Tarih</th>
                  <th>Oluşturan</th>
                </tr>
              </thead>
              <tbody>
                {transfersPag.visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '2rem' }}>
                      Transfer bulunamadı
                    </td>
                  </tr>
                ) : (
                  transfersPag.visibleRows.map((transfer: StockTransfer) => {
                    const si = statusInfo(transfer.status);
                    return (
                      <tr
                        key={transfer.id}
                        className={transfer.id === selectedTransferId ? 'row-selected' : ''}
                        onClick={() => { onSelectTransfer(transfer.id); setActivePanel('detail'); }}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>{transfer.sourceBranch?.name ?? '—'}</td>
                        <td>{transfer.targetBranch?.name ?? '—'}</td>
                        <td><span className={`pill ${si.cls}`}>{si.label}</span></td>
                        <td>{toDateTime(transfer.createdAt)}</td>
                        <td>{transfer.createdBy?.fullName ?? '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {transfersPag.totalPages > 1 && (
            <PaginationControls
              page={transfersPag.page}
              pageSize={transfersPag.pageSize}
              onPageChange={transfersPag.setPage}
              total={transfers.length}
            />
          )}
        </article>
      </div>

      {/* Right — Detail / Create */}
      <div>
        {activePanel === 'create' ? (
          <article className="card">
            <h2>Yeni Transfer Oluştur</h2>
            <form className="form-grid" onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
              <div className="inline-row">
                <label>
                  Kaynak Şube *
                  <select value={sourceBranchId} onChange={(e) => setSourceBranchId(e.target.value)}>
                    <option value="">Seçin</option>
                    {branches.filter((b) => b.isActive).map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Hedef Şube *
                  <select value={targetBranchId} onChange={(e) => setTargetBranchId(e.target.value)}>
                    <option value="">Seçin</option>
                    {branches.filter((b) => b.isActive && b.id !== sourceBranchId).map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Not (opsiyonel)
                <input type="text" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} />
              </label>

              <div className="divider" />
              <h3 style={{ fontSize: '13px', color: 'var(--fg-2)' }}>Ürünler</h3>

              {transferItems.map((item, index) => (
                <div key={index} className="inline-row three">
                  <label>
                    Ürün
                    <select value={item.productId} onChange={(e) => updateItem(index, 'productId', e.target.value)}>
                      <option value="">Seçin</option>
                      {products.filter((p) => p.isActive).map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.barcode})</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Miktar
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                    />
                  </label>
                  <div className="report-action">
                    {transferItems.length > 1 && (
                      <button type="button" className="btn danger" onClick={() => removeItem(index)} style={{ marginTop: '18px' }}>
                        Kaldır
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <button type="button" className="btn ghost" onClick={addItem}>
                + Ürün Ekle
              </button>

              <button
                type="submit"
                className="btn primary"
                disabled={isCreating || !sourceBranchId || !targetBranchId || sourceBranchId === targetBranchId}
              >
                {isCreating ? 'Oluşturuluyor...' : 'Transfer Oluştur'}
              </button>
            </form>
          </article>
        ) : transferDetailLoading ? (
          <article className="card"><p className="muted">Yükleniyor...</p></article>
        ) : transferDetail ? (
          <>
            <article className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Transfer Detayı</div>
                  <div className="card-sub">{toDateTime(transferDetail.createdAt)}</div>
                </div>
                <span className={`pill ${statusInfo(transferDetail.status).cls}`}>
                  {statusInfo(transferDetail.status).label}
                </span>
              </div>

              <div className="metric-grid">
                <div className="metric-card">
                  <span>Kaynak Şube</span>
                  <strong style={{ fontSize: '14px' }}>{transferDetail.sourceBranch?.name ?? '—'}</strong>
                </div>
                <div className="metric-card">
                  <span>Hedef Şube</span>
                  <strong style={{ fontSize: '14px' }}>{transferDetail.targetBranch?.name ?? '—'}</strong>
                </div>
              </div>

              {transferDetail.note && (
                <p className="muted" style={{ marginTop: '8px' }}>Not: {transferDetail.note}</p>
              )}
              <p className="muted" style={{ marginTop: '4px' }}>Oluşturan: {transferDetail.createdBy?.fullName ?? '—'}</p>
            </article>

            {/* Items */}
            <article className="card" style={{ marginTop: '14px' }}>
              <h2>Transfer Ürünleri ({transferDetail.items.length})</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th>Barkod</th>
                      <th>Miktar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferDetail.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.product?.name ?? item.productId}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{item.product?.barcode ?? '—'}</td>
                        <td style={{ fontWeight: 500 }}>{item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            {/* Actions for PENDING */}
            {transferDetail.status === 'PENDING' && (
              <article className="card" style={{ marginTop: '14px' }}>
                <h2>İşlem</h2>
                <label style={{ marginBottom: '8px' }}>
                  Not (opsiyonel)
                  <input
                    type="text"
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder="Onay/red sebebi..."
                  />
                </label>
                <div className="subscription-action-row">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={isUpdatingStatus}
                    onClick={() => onUpdateTransferStatus(transferDetail.id, 'ACCEPTED', actionNote || undefined)}
                  >
                    Onayla
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    disabled={isUpdatingStatus}
                    onClick={() => onUpdateTransferStatus(transferDetail.id, 'REJECTED', actionNote || undefined)}
                  >
                    Reddet
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={isUpdatingStatus}
                    onClick={() => onUpdateTransferStatus(transferDetail.id, 'CANCELLED', actionNote || undefined)}
                  >
                    İptal Et
                  </button>
                </div>
              </article>
            )}
          </>
        ) : (
          <article className="card">
            <div className="empty-state">
              <div className="empty-state-title">Transfer seçin</div>
              <div className="empty-state-sub">Sol listeden bir transfer seçerek detaylarını görüntüleyin</div>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
