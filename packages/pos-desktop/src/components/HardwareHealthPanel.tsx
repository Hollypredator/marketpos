import React, { useState } from 'react';
import type { CashDrawerActionResult, HardwareConfig, PrinterActionResult } from '../electron-api';
import { useToast } from '../store';

interface HardwareHealthPanelProps {
  hardwareConfig: HardwareConfig | null;
  onRefreshConfig?: () => Promise<void>;
}

export default function HardwareHealthPanel({ hardwareConfig, onRefreshConfig }: HardwareHealthPanelProps) {
  const toast = useToast();
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [testingDrawer, setTestingDrawer] = useState(false);
  const [lastPrinterResult, setLastPrinterResult] = useState<PrinterActionResult | null>(null);
  const [lastDrawerResult, setLastDrawerResult] = useState<CashDrawerActionResult | null>(null);

  // Terazi & Barkod okuyucu canlı test simülasyon alanı
  const [barcodeScanInput, setBarcodeScanInput] = useState('');
  const [parsedBarcodeResult, setParsedBarcodeResult] = useState<{
    code: string;
    weightKg: number | null;
    isScale: boolean;
  } | null>(null);

  const handleTestPrinter = async () => {
    if (!window.electronAPI) {
      toast.error('Electron API erişilemedi.');
      return;
    }
    setTestingPrinter(true);
    try {
      const res = await window.electronAPI.testHardwarePrint();
      setLastPrinterResult(res);
      if (res.success) {
        toast.success('Termal yazıcı test fişi basıldı.');
      } else {
        toast.error(`Yazıcı Hatası: ${res.message}`);
      }
    } catch {
      toast.error('Yazıcı testi sırasında hata oluştu.');
    } finally {
      setTestingPrinter(false);
    }
  };

  const handleTestDrawer = async () => {
    if (!window.electronAPI) {
      toast.error('Electron API erişilemedi.');
      return;
    }
    setTestingDrawer(true);
    try {
      const res = await window.electronAPI.testHardwareDrawer();
      setLastDrawerResult(res);
      if (res.success) {
        toast.success('Para çekmecesi tetiklendi ve açıldı.');
      } else {
        toast.error(`Çekmece Hatası: ${res.message}`);
      }
    } catch {
      toast.error('Çekmece testi sırasında hata oluştu.');
    } finally {
      setTestingDrawer(false);
    }
  };

  const handleBarcodeInputChange = (val: string) => {
    setBarcodeScanInput(val);
    if (!val || val.length < 5) {
      setParsedBarcodeResult(null);
      return;
    }

    // Terazi barkodu örneği: 2700123004501 -> 27 (terazi ön eki), 00123 (ürün kodu), 00450 (450 gr = 0.450 kg), 1 (checksum)
    if (val.startsWith('27') && val.length === 13) {
      const productCode = val.substring(2, 7);
      const weightGram = parseInt(val.substring(7, 12), 10);
      if (!isNaN(weightGram)) {
        setParsedBarcodeResult({
          code: productCode,
          weightKg: weightGram / 1000,
          isScale: true,
        });
        return;
      }
    }

    setParsedBarcodeResult({
      code: val,
      weightKg: null,
      isScale: false,
    });
  };

  const printerEnabled = hardwareConfig?.printer?.enabled ?? true;
  const drawerEnabled = hardwareConfig?.cashDrawer?.enabled ?? true;

  return (
    <div className="hardware-health-panel" style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>
          💻 Donanım Canlı Sağlık ve Bağlantı Teşhisi
        </h3>
        {onRefreshConfig && (
          <button className="btn btn-ghost btn-sm" onClick={() => void onRefreshConfig()}>
            Config Yenile
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        {/* 1. TERMAL YAZICI KARTI */}
        <div className="glass-card" style={{ padding: '1rem', borderLeft: `4px solid ${printerEnabled ? 'var(--success)' : 'var(--warning)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>🖨️ Termal Yazıcı (ESC/POS)</span>
            <span className={`status-dot ${printerEnabled ? 'online' : 'offline'}`} />
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            <div>Arayüz: <strong>{hardwareConfig?.printer?.type || 'EPSON / Thermal'}</strong></div>
            <div>Sürücü / Port: <strong>{hardwareConfig?.printer?.target || 'Yerel USB / Spooler'}</strong></div>
            <div>Son Durum: <strong>{lastPrinterResult ? (lastPrinterResult.success ? '✅ Bağlantı Başarılı' : `❌ ${lastPrinterResult.message}`) : 'Boşta'}</strong></div>
          </div>
          <button
            className="btn btn-ghost btn-sm tactile-press"
            disabled={testingPrinter}
            onClick={() => void handleTestPrinter()}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {testingPrinter ? 'Yazdırılıyor...' : 'Test Fişi Yazdır'}
          </button>
        </div>

        {/* 2. PARA ÇEKMECESİ KARTI */}
        <div className="glass-card" style={{ padding: '1rem', borderLeft: `4px solid ${drawerEnabled ? 'var(--success)' : 'var(--warning)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>💵 Otomatik Para Çekmecesi</span>
            <span className={`status-dot ${drawerEnabled ? 'online' : 'offline'}`} />
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            <div>Bağlantı: <strong>Yazıcı RJ11 Portu / DK Signal</strong></div>
            <div>Sinyal Süresi: <strong>Pulse On: 50ms / Off: 100ms</strong></div>
            <div>Son Durum: <strong>{lastDrawerResult ? (lastDrawerResult.success ? '✅ Sinyal Gönderildi' : `❌ ${lastDrawerResult.message}`) : 'Boşta'}</strong></div>
          </div>
          <button
            className="btn btn-ghost btn-sm tactile-press"
            disabled={testingDrawer}
            onClick={() => void handleTestDrawer()}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {testingDrawer ? 'Açılıyor...' : 'Çekmeceyi Aç'}
          </button>
        </div>

        {/* 3. BARKOD OKUYUCU VE TERAZİ TESTİ */}
        <div className="glass-card" style={{ padding: '1rem', borderLeft: '4px solid var(--accent-gold, #eab308)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>🔍 Barkod & Terazi Test Ekranı</span>
            <span className="status-dot online" />
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Barkod okuyucu veya terazi barkodunu okutarak test edin:
          </div>
          <input
            className="input"
            onChange={(e) => handleBarcodeInputChange(e.target.value)}
            placeholder="Örn: 2700123004501 veya 869000000001"
            style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem', marginBottom: '0.5rem' }}
            type="text"
            value={barcodeScanInput}
          />
          {parsedBarcodeResult && (
            <div style={{ padding: '0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', fontSize: '0.8rem' }}>
              {parsedBarcodeResult.isScale ? (
                <div style={{ color: 'var(--success)' }}>
                  ⚖️ <strong>Terazi Barkodu Tespiti:</strong> Ürün Kodu: <code>{parsedBarcodeResult.code}</code> | Ağırlık: <strong>{parsedBarcodeResult.weightKg} kg</strong>
                </div>
              ) : (
                <div style={{ color: 'var(--text-main)' }}>
                  📦 <strong>Standart Barkod:</strong> Code: <code>{parsedBarcodeResult.code}</code>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
