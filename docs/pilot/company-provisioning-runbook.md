# Company Provisioning Runbook

Bu runbook, her firmayi urunleri ve stoklari yuklu sekilde teslim etmek icin standart akisi tanimlar.

## 1. Hazirlik

```bash
npm install
npm run db:push --workspace @marketpos/api-server
```

## 2. Yeni Firma Provision

```bash
npm run db:provision --workspace @marketpos/api-server -- \
  --company-name "Ornek Market" \
  --tax-number "1234567890" \
  --admin-email "admin@ornekmarket.com" \
  --admin-username "admin" \
  --admin-password "DegistirBeni123" \
  --template bakkal-v1
```

Notlar:

- Yeni firma acilisinda `adminEmail` zorunludur.
- Admin email global unique olmali; duplicate durumda API `409 EMAIL_ALREADY_IN_USE` dondurur.
- Email kaydi lowercase normalize edilerek saklanir.

Provision komutu su varliklari olusturur veya gunceller:

- company (yeni veya mevcut `--company-id`)
- branch (varsayilan: `Merkez Sube`)
- register (varsayilan: `K01`)
- admin user (`ADMIN` rol)
- category + product katalogu
- stock seviyeleri

## 3. Mevcut Firmaya Template Uygulama

```bash
npm run db:provision --workspace @marketpos/api-server -- \
  --company-id "<company-uuid>" \
  --admin-password "DegistirBeni123" \
  --template bakkal-v1
```

Mevcut firmaya template uygularken `adminEmail` opsiyoneldir.

## 4. Kritik Opsiyonlar

- `--template-path <dosya>`: Ozellestirilmis template JSON yolu
- `--overwrite-stock`: Mevcut stok miktarlarini template miktariyla yazar
- `--package-days <gun>`: Paket suresi (varsayilan `365`)
- `--grace-days <gun>`: Grace suresi (varsayilan `7`)

## 5. Teslim Oncesi Kontrol

1. Admin kullaniciyla login
2. Dashboard `catalog` ekraninda urun sayisi kontrolu
3. `stock` ekraninda stok miktarlari kontrolu
4. POS cihazinda urun arama + satis denemesi
5. Ilk giristen sonra admin sifresi degistirme

## 6. Backoffice SaaS Yonetim Uclari

- `GET /api/subscription/admin/templates`
  Template kutuphanesi listesi
- `POST /api/subscription/admin/provision`
  Backoffice panelden yeni firma olusturma veya mevcut firmaya template uygulama
  Yeni firma acilisinda payload icinde `adminEmail` zorunludur.

## 7. Backoffice Wizard Akisi

SUPER_ADMIN rolunde onboarding yalnizca `Firma Kurulum (Setup Wizard)` modulunden yapilir:

1. Firma Bilgileri
2. Admin Hesabi (`adminEmail` yeni firmada zorunlu)
3. Paket ve Template
4. Onay
