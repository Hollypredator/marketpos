import React, { useEffect, useState } from 'react';
import { requestEnvelope } from '../lib/http/api-client';

interface YonetimPageProps {
  saving: boolean;
  onSetBanner: (banner: { text: string; type: 'error' | 'success' } | null) => void;
}

export function YonetimPage({ saving, onSetBanner }: YonetimPageProps): React.ReactElement {
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [form, setForm] = useState({
    monthlyPrice: 490,
    yearlyPrice: 390,
    ecoSetPrice: 24900,
    proSetPrice: 39900,
  });

  useEffect(() => {
    setLoading(true);
    requestEnvelope<{
      monthlyPrice: number;
      yearlyPrice: number;
      ecoSetPrice: number;
      proSetPrice: number;
    }>('/api/payments/pricing', { auth: true })
      .then((res) => {
        if (res.success && res.data) {
          setForm({
            monthlyPrice: res.data.monthlyPrice,
            yearlyPrice: res.data.yearlyPrice,
            ecoSetPrice: res.data.ecoSetPrice,
            proSetPrice: res.data.proSetPrice,
          });
        }
      })
      .catch((err: any) => {
        setErrorText(err?.message || 'Fiyat bilgileri yüklenirken bir hata oluştu.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const intValue = parseInt(value, 10);
    setForm((prev) => ({
      ...prev,
      [name]: isNaN(intValue) ? 0 : intValue,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorText(null);

    try {
      const res = await requestEnvelope<{
        monthlyPrice: number;
        yearlyPrice: number;
        ecoSetPrice: number;
        proSetPrice: number;
      }>('/api/payments/pricing', {
        auth: true,
        method: 'POST',
        body: form,
      });

      if (res.success && res.data) {
        onSetBanner({ text: 'Fiyatlandırma ayarları başarıyla güncellendi.', type: 'success' });
        setTimeout(() => onSetBanner(null), 4000);
      } else {
        setErrorText('Ayarlar kaydedilemedi. Lütfen alanları kontrol edin.');
      }
    } catch (err: any) {
      setErrorText(err?.message || 'Bir sunucu hatası oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel-grid">
      <article className="card" style={{ maxWidth: '600px' }}>
        <h2>Açılış Sayfası Fiyatlandırma Yönetimi</h2>
        <p className="muted" style={{ marginBottom: '24px' }}>
          MarketPOS tanıtım ve satın alma sayfasında gösterilen güncel paket fiyatlarını buradan dinamik olarak güncelleyebilirsiniz.
        </p>

        {errorText && (
          <div className="banner error" style={{ marginBottom: '16px' }}>
            {errorText}
          </div>
        )}

        {loading && !form.monthlyPrice ? (
          <p className="muted">Fiyatlar yükleniyor...</p>
        ) : (
          <form className="form-grid compact" onSubmit={handleSubmit}>
            <label>
              Aylık Yazılım Lisans Ücreti (TL)
              <input
                type="number"
                name="monthlyPrice"
                value={form.monthlyPrice}
                onChange={handleInputChange}
                min={0}
                required
              />
              <span className="form-help">Örn: 490 (Aylık abonelik seçeneğinde listelenen fiyat)</span>
            </label>

            <label>
              Yıllık Yazılım Lisans Aylık Eşdeğer Ücreti (TL)
              <input
                type="number"
                name="yearlyPrice"
                value={form.yearlyPrice}
                onChange={handleInputChange}
                min={0}
                required
              />
              <span className="form-help">Örn: 390 (Yıllık abonelikte ay başına denk gelen indirimli tutar)</span>
            </label>

            <label>
              Eko Tam Donanım Seti Ücreti (TL)
              <input
                type="number"
                name="ecoSetPrice"
                value={form.ecoSetPrice}
                onChange={handleInputChange}
                min={0}
                required
              />
              <span className="form-help">Örn: 24900 (Mini terminal, 58mm yazıcı, el barkod okuyucu dahil set)</span>
            </label>

            <label>
              Pro Tam Donanım Seti Ücreti (TL)
              <input
                type="number"
                name="proSetPrice"
                value={form.proSetPrice}
                onChange={handleInputChange}
                min={0}
                required
              />
              <span className="form-help">Örn: 39900 (Premium terminal, yazarkasa POS, 80mm yazıcı, masaüstü okuyucu dahil set)</span>
            </label>

            <div style={{ marginTop: '20px' }}>
              <button
                type="submit"
                className="btn primary"
                disabled={loading || saving}
                style={{ width: '100%', height: '36px' }}
              >
                {loading ? 'Güncelleniyor...' : 'Fiyatları Kaydet ve Yayınla'}
              </button>
            </div>
          </form>
        )}
      </article>

      <article className="card" style={{ maxWidth: '500px' }}>
        <h2>ℹ️ Yönetim Bilgilendirmesi</h2>
        <p className="muted" style={{ lineHeight: '1.6', fontSize: '13px' }}>
          Burada yaptığınız değişiklikler doğrudan açılış (Landing) sayfasındaki fiyat kartlarında anlık olarak güncellenir.
        </p>
        <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-s)', marginTop: '16px' }}>
          <h4 style={{ color: 'var(--fg-1)', marginBottom: '8px', fontSize: '14px' }}>Dinamik Entegrasyon:</h4>
          <ul style={{ fontSize: '12px', color: 'var(--fg-3)', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: 0 }}>
            <li>• Kaydedilen fiyatlar, müşterilerin LemonSqueezy sepetine yönlenmeden önce ödeme formlarında doğru olarak hesaplanmasını sağlar.</li>
            <li>• Fiyat değişimleri mevcut aktif aboneleri etkilemez; sadece yeni yapılacak kayıt ve donanım satışları için geçerli olur.</li>
            <li>• Değişiklik sonrasında tarayıcı önbelleğini yenileyerek açılış sayfasındaki yansımaları görebilirsiniz.</li>
          </ul>
        </div>
      </article>
    </section>
  );
}
