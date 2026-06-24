# Desktop Rollout Checklist (Production Ready)

Bu checklist, MarketPOS desktop surumunu sahaya guvenli ve tekrarlanabilir sekilde yayina almak icin zorunlu adimlari listeler.

## 1. Release Oncesi Hazirlik

- [ ] API ve web kalite kapisi gecti (`typecheck + test + build`).
- [ ] POS desktop kalite kapisi gecti (`test + build + build:electron`).
- [ ] Prisma dogrulama gecti (`npm run prisma:validate`).
- [ ] Schema degisimi varsa migration guard gecti (`npm run prisma:migration:check`).
- [ ] Installer `electron:release` ile alindi.
- [ ] Production dagitimi ise `electron:release:signed` ile imzali paket alindi.
- [ ] `release-manifest.json` olustu ve `.exe` hash dogrulandi.
- [ ] Signed dagitimda Authenticode dogrulamasi gecti.
- [ ] Version notlari hazirlandi (degisiklikler + rollback notlari).

## 2. Kurulum Oncesi Magaza Kontrolu

- [ ] Cihaz internet baglantisi test edildi.
- [ ] Yazici ve cekmece fiziksel baglanti kontrol edildi.
- [ ] Cihaz saati otomatik saat modunda.
- [ ] Eski surum tamamen kapatildi.
- [ ] Mevcut lokal DB yedegi alindi (opsiyonel ama onerilir).

## 3. Kurulum ve Ilk Acilis

- [ ] Yeni installer calistirildi ve ayni klasore kuruldu.
- [ ] Ilk acilista setup adimlari tamamlandi:
- Runtime check
- Donanim profili
- Donanim testi
- Online aktivasyon
- Go-live onayi
- [ ] Login basarili.

## 4. Operasyon Smoke Test

- [ ] Test satis -> odeme -> fis.
- [ ] Kasa cekmecesi acma testi.
- [ ] Iade islemi.
- [ ] Gun sonu kapama akisi.
- [ ] Manuel sync calisti.
- [ ] Operasyon ekraninda yedek listesi gorunuyor.
- [ ] Otomatik yedek politikasi kontrol edildi.

## 5. Operasyonel Guvenlik Kontrolu

- [ ] Sepet temizleme yonetici onayi calisiyor.
- [ ] Iade yonetici onayi calisiyor.
- [ ] Kasa kapama yonetici onayi calisiyor.
- [ ] Security audit tablosunda olaylar gorunuyor.

## 6. Kapanis Kriteri

- [ ] Kritik P0/P1 bug yok.
- [ ] Magaza operatoru canli kullanima onay verdi.
- [ ] Merkez ekip rollout formunu imzaladi.

## 7. Rollback Plani

Sorun durumunda:

1. MarketPOS uygulamasini kapat.
2. Sorunlu surumu kaldir.
3. Bir onceki stabil installer'i kur.
4. Gerekirse son lokal yedekten restore yap.
5. Olayi security log + merkez ticket kaydina isle.
