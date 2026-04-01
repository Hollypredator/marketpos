# Code Signing and SmartScreen Runbook

Bu runbook, MarketPOS desktop installer'larini imzali ve SmartScreen dostu sekilde yayinlamak icin standart sureci tanimlar.

## 1. Sertifika Gereksinimi

- Tavsiye: EV Code Signing Certificate
- Minimum: Standard Code Signing Certificate
- Sertifika saglayicidan `.pfx` + private key alin

Not:

- EV sertifika SmartScreen itibarini daha hizli toplar.
- Sertifika suresi dolmadan yenileme plani yapilmalidir.

## 2. CI Secret Konfigurasyonu

GitHub repository secrets:

- `CSC_LINK`: Base64 veya URL olarak sertifika dosyasi
- `CSC_KEY_PASSWORD`: Sertifika sifresi
- Opsiyonel: `CSC_NAME` veya `CSC_TEAM_NAME`

Hizli yukleme (GitHub CLI):

```bash
npm run desktop:signing:secrets -- \
  -Repo "OWNER/REPO" \
  -CertificatePath "C:\\secure\\marketpos-signing.pfx" \
  -CertificatePassword "SERTIFIKA_SIFRESI"
```

Secret kontrolu:

```bash
npm run desktop:signing:check -- -Repo "OWNER/REPO"
```

## 3. Signed Release Komutu

Lokal signed release:

```bash
npm run electron:release:signed --workspace @marketpos/pos-desktop
```

GitHub Actions signed release tetikleme:

```bash
npm run desktop:signing:dispatch -- -Repo "OWNER/REPO" -Watch
```

Komut asamalari:

1. Signing env kontrolu
2. Icon generate
3. Electron build + installer
4. Release manifest olusturma
5. Authenticode imza dogrulama

## 4. SmartScreen Icin Yayin Prensipleri

- Installer'lari her zaman ayni resmi alan adindan dagit.
- Dosya adi ve urun adi surekli olsun (`MarketPOS`).
- Her release'de timestamp zorunlu olsun.
- Imzasiz pilot paket dagitimi sadece test ortami ile sinirli kalsin.
- Eski ve yeni imzali surumleri ayni publisher kimligiyle yayinla.

## 5. Operasyonel Kontrol Listesi

- [ ] `electron:release:signed` basarili
- [ ] `release-manifest.json` olustu
- [ ] `verify-release-signature` adimi gecti
- [ ] Installer hash dogrulandi
- [ ] Dagitim notu + rollback notu hazirlandi

## 6. Sik Hata Senaryolari

`Code signing config not found`
- `CSC_LINK` / `WIN_CSC_LINK` / `CSC_NAME` eksik.

`CSC_KEY_PASSWORD is required`
- PFX sifresi set edilmemis veya yanlis.

`Timestamp certificate is missing`
- Timestamp sunucusu ulasilamiyor veya sign akisi timestamp eklememis.
