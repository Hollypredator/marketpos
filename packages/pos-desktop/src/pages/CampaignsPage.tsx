import React, { useState, useMemo } from 'react';
import { formatCurrency } from '@marketpos/shared';
import { useApp, useToast } from '../store';
import { getCampaignLabel } from '../services/campaign-logic';
import type { Campaign } from '@marketpos/shared';

export default function CampaignsPage() {
  const { state, dispatch } = useApp();
  const toast = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Local state for custom campaign form
  const [targetProduct, setTargetProduct] = useState<any>(null);
  const [buyX, setBuyX] = useState('2');
  const [payY, setPayY] = useState('1');

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      // Show ALL products by default in a scrollable list
      return state.products;
    }
    return state.products.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.barcode.toLowerCase().includes(query)
    );
  }, [state.products, searchQuery]);

  const handleApplyPreset = (productId: string, x: number, y: number) => {
    const productName = state.products.find(p => p.id === productId)?.name || 'Urun';
    const campaign: Campaign = { type: 'BUY_X_PAY_Y', x, y };

    dispatch({
      type: 'SET_PRODUCT_CAMPAIGN',
      payload: { productId, campaign }
    });
    toast.success(`${productName}: ${x} Al ${y} Ode tanimlandi.`);
  };

  const handleRemoveCampaign = (productId: string) => {
    dispatch({
      type: 'SET_PRODUCT_CAMPAIGN',
      payload: { productId, campaign: null }
    });
    toast.info('Kampanya kaldirildi.');
  };

  const openCustomModal = (product: any) => {
    setTargetProduct(product);
    setBuyX(product.campaign?.x?.toString() || '2');
    setPayY(product.campaign?.y?.toString() || '1');
    setIsModalOpen(true);
  };

  const handleSaveCustomCampaign = () => {
    if (!targetProduct) return;

    const x = parseInt(buyX);
    const y = parseInt(payY);

    if (isNaN(x) || isNaN(y) || x <= 0 || y <= 0 || y >= x) {
      toast.error('Gecersiz kampanya degerleri.');
      return;
    }

    handleApplyPreset(targetProduct.id, x, y);
    resetForm();
  };

  const resetForm = () => {
    setIsModalOpen(false);
    setTargetProduct(null);
    setBuyX('2');
    setPayY('1');
  };

  return (
    <div style={{ padding: '1.5rem', height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Kampanya Yonetimi</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Urun listesi uzerinden hizli kampanya islemlerini yonetin.</p>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ position: 'relative', maxWidth: '500px' }}>
          <input 
            className="input"
            style={{ paddingLeft: '2.5rem', height: '3rem', fontSize: '1rem', borderRadius: '8px' }}
            placeholder="Urun adi veya barkod ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
        </div>
      </div>

      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table className="table table-excel" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                <th style={{ width: '40%' }}>Urun Bilgisi</th>
                <th>Barkod</th>
                <th>Birim Fiyat</th>
                <th>Aktif Kampanya</th>
                <th style={{ textAlign: 'center' }}>Hizli Islemler</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    Urun bulunamadi.
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{p.barcode}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(p.salePrice)}</td>
                    <td>
                      {p.campaign ? (
                        <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.85rem' }}>
                          {getCampaignLabel(p.campaign)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Yok</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
                        <button 
                          className="btn btn-sm btn-ghost"
                          title="2 Al 1 Ode"
                          onClick={() => handleApplyPreset(p.id, 2, 1)}
                        >
                          2'ye 1
                        </button>
                        <button 
                          className="btn btn-sm btn-ghost"
                          title="3 Al 2 Ode"
                          onClick={() => handleApplyPreset(p.id, 3, 2)}
                        >
                          3'e 2
                        </button>
                        <button 
                          className="btn btn-sm btn-ghost"
                          title="Ozel Ayar"
                          onClick={() => openCustomModal(p)}
                        >
                          ⚙️
                        </button>
                        {p.campaign && (
                          <button 
                            className="btn btn-sm btn-ghost"
                            style={{ color: 'var(--danger)' }}
                            title="Kampanyayi Sil"
                            onClick={() => handleRemoveCampaign(p.id)}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Ozel Kampanya</h2>
              <button className="btn btn-ghost" onClick={resetForm}>Kapat</button>
            </div>

            <div style={{ padding: '1rem 0' }}>
              <div style={{ backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius)', marginBottom: '1.5rem' }}>
                <div style={{ fontWeight: 700 }}>{targetProduct?.name}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="login-field">
                  <label>Kac Alsin? (X)</label>
                  <input type="number" className="input" value={buyX} onChange={(e) => setBuyX(e.target.value)} />
                </div>
                <div className="login-field">
                  <label>Kac Odesin? (Y)</label>
                  <input type="number" className="input" value={payY} onChange={(e) => setPayY(e.target.value)} />
                </div>
              </div>

              <button className="btn btn-primary btn-block" onClick={handleSaveCustomCampaign}>
                Kampanyayi Uygula
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
