import React from 'react';
import type { AnnualLicenseInfo } from '@marketpos/shared';

interface LicenseBannerProps {
  licenseInfo: AnnualLicenseInfo;
}

export const LicenseBanner: React.FC<LicenseBannerProps> = ({ licenseInfo }) => {
  if (licenseInfo.isExpired) {
    return null; // AccessLockScreen handles expired state
  }

  const showWarning = licenseInfo.inGracePeriod || (licenseInfo.daysRemaining !== null && licenseInfo.daysRemaining <= 15);

  if (!showWarning) {
    return null;
  }

  const isGrace = licenseInfo.inGracePeriod;
  const bgColor = isGrace ? 'bg-amber-600' : 'bg-amber-500/90';

  return (
    <div className={`w-full ${bgColor} text-white px-4 py-1.5 text-xs font-medium flex items-center justify-between shadow-sm`}>
      <div className="flex items-center gap-2">
        <span className="text-sm">⚠️</span>
        <span>
          {isGrace
            ? 'Yıllık lisans süreniz doldu! Grace period (ek süre) içindesiniz. Lütfen en kısa sürede lisansınızı yenileyiniz.'
            : `Yıllık lisansınızın bitmesine ${licenseInfo.daysRemaining} gün kaldı. Kesintisiz hizmet için yenileme yapabilirsiniz.`}
        </span>
      </div>
      <div className="text-[11px] opacity-90 underline cursor-pointer">
        Detaylar & Destek
      </div>
    </div>
  );
};
