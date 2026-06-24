# MarketPOS Pilot Installer Runbook

Bu dokuman tek sube pilot icin manuel installer modelini standartlastirir.
Not: Uygulamada auto-update kontrolu vardir; feed tanimi olmayan ortamlarda manuel installer akisi fallback olarak kullanilir.

## Build Alma

```bash
npm run electron:release --workspace @marketpos/pos-desktop
```

Signed dagitim icin:

```bash
npm run electron:release:signed --workspace @marketpos/pos-desktop
```

CI/calistirma sonunda installer ciktilari:

- `packages/pos-desktop/release/*.exe`
- `packages/pos-desktop/release/*.blockmap`
- `packages/pos-desktop/release/release-manifest.json`

`release-manifest.json` dosyasi SHA-256 hash ve boyut dogrulamasi icin referans kaynaktir.

## Installer Dogrulama

1. `release-manifest.json` icindeki `.exe` kaydini acin.
2. Dagitilacak `.exe` dosya boyutunun manifest ile ayni oldugunu kontrol edin.
3. Gerekirse sahada hash dogrulama yapin:

```powershell
Get-FileHash .\MarketPOS-<versiyon>-setup.exe -Algorithm SHA256
```

4. Hash degeri manifestteki `sha256` ile birebir esit olmali.

Signed build kullaniliyorsa imza dogrulamasi:

```bash
npm run release:verify-signature --workspace @marketpos/pos-desktop
```

## Pilot Dagitim Akisi

1. Yeni installer dosyasini versiyon etiketiyle arsivleyin.
2. Magazadaki mevcut uygulamayi kapatin.
3. Yeni installer'i calistirin, ayni klasore kurulum yapin.
4. Uygulama acildiginda:
   - login
   - test satis
   - test fis
   - test cekmece
   - manuel sync
5. Sonuclari pilot checklist'e isleyin.

Detayli saha rollout adimlari icin:

- `docs/pilot/desktop-rollout-checklist.md`
- `docs/pilot/code-signing-smartscreen-runbook.md`

## Ilk Kurulum (Zorunlu Sihirbaz)

Kurulum bitmeden login ve satis ekrani acilmaz. Asagidaki 5 adim zorunludur:

1. Runtime kontrolu
   - API base URL dogrulandi
   - database path dogrulandi
   - Electron bridge dogrulandi
2. Donanim profili
   - LAN/USB secimi
   - yazici hedefi + port + timeout
   - drawer pulse degerleri
3. Donanim testi
   - test fisi basarili
   - cekmece testi basarili
4. Online aktivasyon
   - sadece online login kabul edilir
   - basarili aktivasyonla lisans snapshot cache'e yazilir
5. Operasyona gecis onayi
   - tum adimlar tamamlandiysa kurulum kapanir ve canli kullanima gecilir

## Offline Lisans ve Kilit Davranisi

- Offline kullanima izin verilir ancak `offlineAccessValidUntil` gecildiginde tam kilit uygulanir.
- Cihaz saati geri alma tespit edilirse guvenlik kilidi uygulanir.
- Kilit ekraninda operator:
  1. internete baglanir
  2. online login ile dogrulama yapar
  3. gerekirse merkez ekipten paket durumunu kontrol ettirir

## Offline Kuyruk ve Conflict Kurallari

- Kuyruk davranisi:
  - Satis/iade istekleri yerelde kuyruga `PENDING` olarak yazilir.
  - Baglanti geldiginde push basarili ise `SYNCED`, basarisiz ise `FAILED` isaretlenir.
  - Operator manuel sync butonu ile yeniden deneme tetikleyebilir.
- Conflict / hata cozum adimlari:
  - `FAILED` kayitlarinda once ag ve token dogrulamasi kontrol edilir.
  - Ayni kaydin tekrar push edilmesini engellemek icin local id korunur.
  - Isletme karari gerektiren durumlarda (iptal/duzeltme) merkezde kayit dogrulanir, sonra ilgili satis/iade manuel islenir.
  - Zorunlu durumda kuyruq temizligi sadece merkez onayi ile ve loglanarak yapilir.

## Otomatik Yedekleme Politikasi

Varsayilan politika:

- aktif: `true`
- aralik: `8` saat
- saklama suresi: `21` gun
- maksimum yedek: `60`

Yonetim:

1. POS uygulamasinda `Operasyon` sayfasina gecin.
2. `Cihaz ve Yedekleme` alaninda politika degerlerini guncelleyin.
3. `Yedekleme Politikasini Kaydet` ile aktif edin.
4. `Lokal Yedek Olustur` ile anlik manuel yedek alin.

Not:

- Sistem acilisinda son yedek zamani araligi asmissa otomatik yedek tetiklenir.
- Retention kurali hem gun bazli hem de maksimum dosya adedi bazli uygulanir.

## Saha Kabul Kriterleri

- Kurulumdan canli satisa gecis hedefi: tek kasa <= 30 dakika.
- 1 gunluk pilot kosusu:
  - online + offline karmasi
  - satis / iade / stok / manuel sync senaryolari
  - yazici kapali / kagit bitti / cekmece hatasi durumlari
- Cikis kosulu:
  - kritik P0/P1 hata: 0
  - operatorden "kurulum tamam" onayi alinmis

## A Fazi E2E Kontrol Listesi

- [ ] Kurulum sihirbazi 5/5 adim tamamlandi.
- [ ] Satis -> odeme -> fis -> kuyruk/sync akisi dogrulandi.
- [ ] Iade akisi dogrulandi.
- [ ] Gun sonu kasa kapama akisi dogrulandi.
- [ ] Yazici yok/kagit bitti/timeout senaryolari operator adimlariyla test edildi.
- [ ] Offline sure dolumu kilidi ve online geri acma dogrulandi.
- [ ] Saat geri alma guvenlik kilidi dogrulandi.

## SmartScreen Notu (Imzasiz Installer)

Pilot surum imzasiz oldugu icin Windows SmartScreen uyari verebilir.

Operator adimlari:

1. "More info" (Daha fazla bilgi) secin.
2. "Run anyway" (Yine de calistir) secin.
3. Kurulum tamamlandiktan sonra MarketPOS'u normal sekilde acin.

## Rollback

1. Sorunlu surumu kaldirin.
2. Bir onceki stabil installer'i yeniden kurun.
3. Cihazdaki `userData` altindaki SQLite dosyasini koruyun (veri kaybi olmamasi icin).
