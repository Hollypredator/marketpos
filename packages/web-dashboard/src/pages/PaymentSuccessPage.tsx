import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { requestEnvelope } from '../lib/http/api-client';

interface PaymentStatusResponse {
  companyId: string;
  name: string;
  isActive: boolean;
  packageStatus: string;
  packageType: string;
  packageExpiresAt: string | null;
  licenseKey: string | null;
  adminUsername: string | null;
}

export function PaymentSuccessPage(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get('companyId') || searchParams.get('company_id'); // support both camel and snake case

  const [status, setStatus] = useState<'PROCESSING' | 'ACTIVE' | 'ERROR'>('PROCESSING');
  const [companyData, setCompanyData] = useState<PaymentStatusResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setStatus('ERROR');
      return;
    }

    let intervalId: any;
    let attempts = 0;
    const maxAttempts = 120; // 4 minutes maximum polling

    const checkPaymentStatus = async () => {
      attempts++;
      try {
        const response = await requestEnvelope<PaymentStatusResponse>(`/api/payments/status/${companyId}`, {
          auth: false,
          method: 'GET',
        });

        if (response.success && response.data) {
          const data = response.data;
          if (data.isActive && data.licenseKey) {
            setCompanyData(data);
            setStatus('ACTIVE');
            clearInterval(intervalId);
          }
        }
      } catch (err) {
        console.error('Error polling payment status:', err);
      }

      if (attempts >= maxAttempts) {
        setStatus('ERROR');
        clearInterval(intervalId);
      }
    };

    // Run first check immediately, then poll every 2.5 seconds
    void checkPaymentStatus();
    intervalId = setInterval(checkPaymentStatus, 2500);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [companyId]);

  const copyLicenseKey = () => {
    if (companyData?.licenseKey) {
      void navigator.clipboard.writeText(companyData.licenseKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadUrl = 'https://github.com/Hollypredator/marketpos/releases/download/v1.0.0/MarketPOS-1.0.0-setup.exe';

  return (
    <div className="success-container">
      <style>{`
        .success-container {
          width: 100%;
          min-height: 100vh;
          background: var(--bg-0);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          color: var(--fg-2);
          position: relative;
          overflow-y: auto;
        }

        .success-glow {
          position: absolute;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(113, 112, 255, 0.07) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .success-card {
          width: 100%;
          max-width: 560px;
          background: var(--bg-1);
          border: 1px solid var(--border);
          border-radius: var(--r-xl);
          padding: 40px;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
          position: relative;
          z-index: 1;
        }

        /* Loading / Processing styles */
        .spinner {
          width: 56px;
          height: 56px;
          border: 4px solid var(--border);
          border-top-color: var(--accent-v);
          border-radius: 50%;
          margin: 0 auto 24px;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .success-title {
          font-size: 24px;
          font-weight: 600;
          color: var(--fg-1);
          margin-bottom: 12px;
          letter-spacing: -0.5px;
        }

        .success-desc {
          font-size: 13px;
          color: var(--fg-3);
          line-height: 1.6;
          margin-bottom: 24px;
        }

        /* Activated State styles */
        .success-checkmark {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(39, 166, 68, 0.1);
          border: 2px solid var(--green);
          color: var(--green);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          margin: 0 auto 24px;
          box-shadow: 0 0 20px rgba(39, 166, 68, 0.2);
        }

        .license-box {
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: var(--r-lg);
          padding: 16px;
          margin-bottom: 24px;
          text-align: left;
        }

        .license-label {
          font-size: 11px;
          color: var(--fg-4);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 6px;
          display: block;
        }

        .license-key-wrapper {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .license-key {
          font-family: var(--font-mono);
          font-size: 18px;
          font-weight: 600;
          color: var(--accent-h);
          letter-spacing: 1px;
        }

        .btn-copy {
          background: rgba(113, 112, 255, 0.1);
          border: 1px solid rgba(113, 112, 255, 0.2);
          color: var(--accent-h);
          font-size: 11px;
          font-weight: 500;
          padding: 4px 10px;
          border-radius: var(--r-md);
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-copy:hover {
          background: var(--accent);
          color: #fff;
          border-color: var(--accent);
        }

        .credential-info {
          font-size: 12px;
          color: var(--fg-3);
          margin-bottom: 30px;
          background: rgba(255,255,255,0.01);
          padding: 8px 12px;
          border-radius: var(--r-sm);
          border-left: 3px solid var(--accent);
          text-align: left;
        }

        .btn-download {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          height: 44px;
          background: var(--accent);
          color: #fff;
          border: 1px solid var(--accent);
          border-radius: var(--r-lg);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(94, 106, 210, 0.35);
          text-decoration: none;
          margin-bottom: 32px;
        }

        .btn-download:hover {
          background: var(--accent-h);
          border-color: var(--accent-h);
          transform: translateY(-1px);
        }

        /* Steps list styling */
        .instruction-steps {
          text-align: left;
          border-top: 1px solid var(--border-s);
          padding-top: 24px;
        }

        .instruction-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--fg-1);
          margin-bottom: 16px;
        }

        .step-item {
          display: flex;
          gap: 12px;
          margin-bottom: 14px;
          font-size: 12px;
          line-height: 1.5;
        }

        .step-badge {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--bg-3);
          color: var(--fg-2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 600;
          flex-shrink: 0;
        }
      `}</style>
      <div className="success-glow"></div>

      <div className="success-card">
        {status === 'PROCESSING' && (
          <div>
            <div className="spinner"></div>
            <h2 className="success-title">Ödemeniz Doğrulanıyor</h2>
            <p className="success-desc">
              LemonSqueezy ödemeniz alındı. Lisans anahtarınız üretilip hesabınız aktifleştiriliyor. Lütfen bu sayfayı kapatmayın, süreç birkaç saniye sürebilir...
            </p>
          </div>
        )}

        {status === 'ACTIVE' && (
          <div>
            <div className="success-checkmark">✓</div>
            <h2 className="success-title">Aboneliğiniz Aktif Edildi!</h2>
            <p className="success-desc">
              Ödemeniz başarıyla doğrulandı ve <strong>{companyData?.name}</strong> firması için lisans kodunuz oluşturuldu. Kasa kurulum adımlarına geçebilirsiniz.
            </p>

            <div className="license-box">
              <span className="license-label">Lisans Kodunuz</span>
              <div className="license-key-wrapper">
                <span className="license-key">{companyData?.licenseKey}</span>
                <button className="btn-copy" onClick={copyLicenseKey}>
                  {copied ? 'Kopyalandı!' : 'Kopyala'}
                </button>
              </div>
            </div>

            <div className="credential-info">
              <span><strong>Masaüstü Kasa Kullanıcı Adınız:</strong> <code>{companyData?.adminUsername}</code></span>
            </div>

            <a href={downloadUrl} className="btn-download">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Masaüstü Kurulum Dosyasını (.exe) İndir
            </a>

            <div className="instruction-steps">
              <h3 className="instruction-title">Kurulum Adımları</h3>
              <div className="step-item">
                <div className="step-badge">1</div>
                <div>
                  <strong>Yükleyiciyi İndirin ve Çalıştırın:</strong> Yukarıdaki indirme butonuyla <code>.exe</code> dosyasını indirin, ardından çalıştırıp kurulumu tamamlayın.
                </div>
              </div>
              <div className="step-item">
                <div className="step-badge">2</div>
                <div>
                  <strong>Lisans Kodunu Etkinleştirin:</strong> Masaüstü uygulamasını ilk kez açtığınızda yukarıda kopyaladığınız Lisans Kodunu girerek <em>Aktivasyon</em> işlemini başlatın.
                </div>
              </div>
              <div className="step-item">
                <div className="step-badge">3</div>
                <div>
                  <strong>Kasa Bilgilerini Belirleyin:</strong> Aktivasyon ekranında şube, kasa adı ve yönetici bilgilerinizi onaylayarak kasa veritabanını hazırlayın.
                </div>
              </div>
              <div className="step-item">
                <div className="step-badge">4</div>
                <div>
                  <strong>Satışa Başlayın:</strong> Kurulum sırasında belirlediğiniz kullanıcı adınız (<code>{companyData?.adminUsername}</code>) ve şifrenizle giriş yaparak anında satışa başlayın!
                </div>
              </div>
            </div>
          </div>
        )}

        {status === 'ERROR' && (
          <div>
            <div className="success-checkmark" style={{ borderColor: 'var(--red)', color: 'var(--red)', background: 'rgba(239, 68, 68, 0.1)' }}>!</div>
            <h2 className="success-title">Aktivasyon Zaman Aşımına Uğradı</h2>
            <p className="success-desc">
              Ödemeniz alındı ancak lisans kaydı doğrulanırken bir gecikme yaşandı. Lütfen e-posta kutunuzu kontrol edin veya destek ekibimizle iletişime geçin.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn" style={{ flex: '1', height: '36px' }} onClick={() => window.location.reload()}>Tekrar Dene</button>
              <a href="mailto:destek@marketpos.com" className="btn primary" style={{ flex: '1', height: '36px', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Destek Al</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
