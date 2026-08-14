import React, { useState } from 'react';
import type { AnnualLicenseInfo } from '@marketpos/shared';
import { AnnualLicenseService } from '../services/annual-license';

interface AccessLockScreenProps {
  licenseInfo: AnnualLicenseInfo;
  onLicenseRenewed: (newInfo: AnnualLicenseInfo) => void;
}

export const AccessLockScreen: React.FC<AccessLockScreenProps> = ({
  licenseInfo,
  onLicenseRenewed,
}) => {
  const [checking, setChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCheckLicense = async () => {
    setChecking(true);
    setErrorMessage(null);
    try {
      const updated = await AnnualLicenseService.checkLicense({
        companyId: licenseInfo.companyId,
      });
      if (updated.isExpired) {
        setErrorMessage('Lisansınız henüz yenilenmedi veya sunucuya ulaşılamadı.');
      } else {
        onLicenseRenewed(updated);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Bağlantı hatası oluştu');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/95 backdrop-blur-md p-6 text-white">
      <div className="max-w-lg w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-3xl font-bold border border-rose-500/30">
          🔒
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-100">
            Yıllık Lisans Süreniz Dolmuştur
          </h2>
          <p className="text-sm text-slate-400">
            {licenseInfo.companyName} firmasına ait MarketPOS kullanım süresi sonlanmıştır. Satış ve işlem yapabilmek için lisansınızı yenileyiniz.
          </p>
        </div>

        <div className="bg-slate-900/80 rounded-xl p-4 text-left border border-slate-700/50 space-y-2 text-xs text-slate-300">
          <div className="flex justify-between">
            <span className="text-slate-400">Firma kenti:</span>
            <span className="font-semibold text-slate-200">{licenseInfo.companyId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Lisans Tipi:</span>
            <span className="font-semibold text-emerald-400">Yıllık Abonelik</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Son Geçerlilik:</span>
            <span className="font-semibold text-rose-400">
              {new Date(licenseInfo.expiresAt).toLocaleDateString('tr-TR')}
            </span>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-lg">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={handleCheckLicense}
            disabled={checking}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium rounded-xl transition shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2"
          >
            {checking ? (
              <span>Kontrol Ediliyor...</span>
            ) : (
              <>
                <span>🔄</span>
                <span>Lisans Durumunu Yeniden Kontrol Et</span>
              </>
            )}
          </button>
        </div>

        <div className="pt-2 text-xs text-slate-500 border-t border-slate-700/50">
          Yenileme ve destek için: <span className="text-slate-400 font-medium">+90 (850) 000 00 00</span> veya <span className="text-slate-400 font-medium">destek@marketpos.com</span>
        </div>
      </div>
    </div>
  );
};
