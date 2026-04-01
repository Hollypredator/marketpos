# Web Yonetim - Faz B Test Matrisi

Bu matris Faz B kabulunu merkez operasyon akislarina gore tek listede toplar.

## B1 - Operasyon Paneli

| Senaryo | Beklenen |
|---|---|
| Paket takip filtreleme/siralama | Liste, secilen filtre ve siralama ile deterministik guncellenir |
| Yaklasan yenileme CSV export | Sadece secili liste satirlari dogru kolonlarla disa aktarilir |
| Saglik ozeti | Firma/sube/kasa online-offline ve kuyruk verileri rapor panelinde gorulur |

## B2 - Finans ve Raporlama

| Senaryo | Beklenen |
|---|---|
| KPI kartlari | Gunluk satis/iade/stok KPI alanlari tek formatta gorulur |
| Sube karsilastirma | Secilen tarih araliginda sube bazli net/satis/iade verileri listelenir |
| Operasyon health endpoint | Dashboard yenilemede veri gecikmeden okunur, bos durumda anlamli fallback doner |

## B3 - Yetki ve Paket Operasyonu

| Senaryo | Beklenen |
|---|---|
| SUPER_ADMIN hizli yenileme | Islem basarili, audit kaydi `RENEW_QUICK` yazilir |
| SUPER_ADMIN suspend/unsuspend | Islemler basarili, audit kayitlari `SUSPEND_MANUAL` ve `UNSUSPEND_MANUAL` yazilir |
| ADMIN paket endpoint erisimi | `/api/subscription/admin/*` erisimi `403` ile bloklanir |
| SUPER_ADMIN audit goruntuleme | `/api/subscription/admin/companies/:id/audit` `200` ve sayfali audit doner |

## Otomasyon Notu

- `packages/api-server/tests/run-tests.mjs` icinde B3 acceptance testleri vardir.
- Test kapsami:
  - renew -> suspend -> unsuspend API zinciri
  - role gate (`SUPER_ADMIN` izinli, `ADMIN` bloklu)
  - audit gecmisinin SUPER_ADMIN tarafinda okunabilmesi
