# MarketPOS — SaaS'tan Ömür Boyu Lisansa Geçiş Planı

**Karar tarihi:** 2026-08-04
**Son revizyon:** 2026-08-04 (`/plan-eng-review` + `/plan-design-review` sonrası)
**Hedef:** Tek makinede, sunucusuz, kurup unutulabilir bir masaüstü ürünü.

## Alınan Kararlar

| Konu | Karar |
|---|---|
| Mimari | Tamamen tek makine. `api-server` ve şubeler arası sync kaldırılır. |
| Yönetim paneli | `web-dashboard` Electron içine "Yönetim" sekmesi olarak taşınır. |
| **Lisans kontrolü** | **Yok.** Kurulum doğrulaması, lisans dosyası, aktivasyon, kilit ekranı — hiçbiri olmayacak. |
| Dağıtım | Installer'ı müşteriye sen iletirsin. Güncelleme dosyaları public GitHub Releases'ta. |
| Güncelleme | electron-updater, GitHub Releases feed, kademeli yayın, kullanıcı onaylı kurulum. |
| Sıralama | **Sil-önce:** silinecek pakette refactor yapılmaz. |
| Mevcut müşteri | **Yok.** Göç aracı, pg_dump ve geçiş politikası gerekmiyor. |
| Tasarım sistemi | Mevcut `index.css`'ten gerçek tokenler belgelenecek; yanıltıcı `design-system/` silinecek. |

## Kapsam Dışı (bilerek düşürülen işler)

- **Lisans zorlaması ve kopya koruması.** Ürün kurulduğu her makinede çalışır. Kopyalanmasını engelleyen teknik bir mekanizma yok; kapı satış kanalıyla tutulur, kodla değil.
- **Çoklu şube ve şubeler arası stok transferi.** `StockTransfer`, `StockTransferItem`, `stock-transfers` domaini gider.
- **Çoklu kasa senkronizasyonu.** Tek kurulum = tek kasa.
- **Uzaktan yönetim ve destek erişimi.** Müşterinin verisine erişimin kalmaz.
- **e-Fatura ve ÖKC entegrasyonu.** İkisi de mock; üründen çıkarılıyor (Faz 5.1). Gerçek entegrasyon ayrı bir ürün kararı.
- **Bulut veri göçü ve `pg_dump`.** Ödeyen müşteri olmadığı için konusuz.
- **Telemetri / crash reporting.** Sunucusuz kalma kararıyla çelişir; yerini kademeli yayın alıyor.
- **Repository bölünmesi.** Gerekli ama kritik yolda değil — v1.1 olarak ayrı sürüme alındı.
- **Süresiz Electron yükseltme taahhüdü.** Bir kez güncellenecek, sonrası EULA'da kapsam dışı.

## Zaten Var Olanlar (yeniden yazılmayacak)

| Var olan | Nerede | Plana etkisi |
|---|---|---|
| Otomatik yedek + saklama süresi + bozulmada geri yükleme | `main.ts:349-533`, `main.ts:173-193` | Sıfırdan yazılmayacak; sadece harici hedef eklenecek |
| Yerel şifre doğrulama | `database.ts:1494` `verifyPassword` | Offline login altyapısı hazır; eksik olan şifreyi **yazan** yol |
| Kalıcı tablolara yerel yazma | `database.ts:3882` `applyQueuedProductOperation` | "Yerel DB'yi kaynak yap" işi sanılandan küçük |
| Ürün tam metin arama (FTS5) | `database.ts:4360` `products_fts` | Aynen korunuyor |
| Kurulum sihirbazı iskeleti | `SetupGate.tsx` — `STEP_ORDER`, `setup-pill`, `setup-check` | Genişletilecek, sıfırdan yazılmayacak |
| NSIS installer + code signing | `package.json:53-79` | Korunuyor; `publisherName` ve `publish` düzeltilecek |
| Gerçek tasarım tokenleri | `index.css:15-60` | `DESIGN.md`'ye çıkarılacak referans |

---

## Mimari: Bugün ve Hedef

```
BUGÜN (SaaS)                              HEDEF (tek makine)
─────────────────────────────             ─────────────────────────────
  [Neon Postgres]                           [ yok ]
        │
  [api-server :3001]                        [ yok ]
   │  │  │
   │  │  └─ provisioning + 908KB katalog ──► pos-desktop içine gömülü
   │  └─ pull ──► cached_*  (önbellek)        products / customers /
   └─ push ◄── local_*_ops (giden kuyruk)     sales (normalize, indeksli)
           │                                          │
           ▼                                          ▼
    [ POS Electron ]                          [ POS Electron ]
           │                                     │        │
     userData/backups/                    userData/    harici hedef
     (aynı disk — tek arıza noktası)       backups/    (USB/ağ/bulut)

  [web-dashboard] ──HTTP──► api-server      Electron "Yönetim" sekmesi (IPC)
```

---

## Faz 0 — Hazırlık

1. `git tag saas-final` ve push. Tek geri dönüş noktası bu.
2. Yeni dal: `feat/lifetime-license`.
3. pos-desktop'ın mevcut test sayısını not et (39). Faz 4'te iki paket silinince toplam mekanik olarak düşecek; regresyon ölçütü **pos-desktop'ın kendi sayısı** olmalı.

---

## Faz 1 — Abonelik ve Lisans Söküm (yalnızca pos-desktop)

**Sil-önce kuralı:** `api-server` ve `web-dashboard` içinde hiçbir düzenleme yapılmaz; Faz 4'te bütün olarak silinirler. `prisma/schema.prisma` da dokunulmaz.

| Dosya | İşlem |
|---|---|
| `src/components/AccessLockScreen.tsx` | **Tamamen silinir.** Kilitlenecek bir durum kalmıyor |
| `electron/services/database.ts:1356-1391` | HMAC snapshot doğrulaması **tamamen silinir** (`setCompanyAccessSnapshot` / `getCompanyAccessSnapshot` dahil) |
| `src/services/pos-runtime.ts` | `CompanyAccessBlockError`, `CompanyAccessSnapshot`, `companyAccessRefreshAtByCompanyId` ve snapshot tazeleme silinir |
| `src/components/SetupGate.tsx` | `LICENSE` ve `ACTIVATION` adımları çıkar; `/api/license/activate` çağrısı silinir |
| `shared/src/types.ts` | `CompanyAccessSnapshot` ve ilgili tipler silinir |
| `.env` / `.env.example` | `MARKETPOS_OFFLINE_ACCESS_GRACE_DAYS`, `SUBSCRIPTION_WEBHOOK_URL`, `SYNC_V2_ENABLED` kaldırılır |
| `AGENTS.md` | "Lisans Modeli" bölümü silinir; "Auto-update hazır" ifadesi düzeltilir (yapılandırılmamış) |

> **Not:** `database.ts:1361`'deki gömülü HMAC anahtarı bir güvenlik açığıydı (simetrik imza istemcide). Düzeltilmiyor — lisans kontrolüyle birlikte tamamen kaldırılıyor.

**Doğrulama:** `npm run typecheck` temiz, pos-desktop testleri geçiyor.

---

## Faz 2 — Yerelleştirme (en büyük faz)

Amaç: sunucuya hiç bağlanmayan, kendi kendine yeten ürün.

### 2.1 Yerel provisioning ve ilk yönetici (BLOKAJ — önce bu)

Bugün `SetupGate.tsx:490` → `/api/license/activate` çağrısı firmayı, şubeyi, kasayı **ve yönetici kullanıcıyı** yaratıyor, ardından 908 KB'lık hazır katalogu seed ediyor. Ayrıca `database.ts:1432` `cacheOnlineLogin()` — `password_hash`'i yazan tek yer — şifreyi ancak **online giriş anında** hash'liyor. Sunucu gidince ilk hesabı yaratacak yol kalmıyor.

Taşınacaklar (api-server → pos-desktop):
- `lib/catalog/catalog.json` (908 KB) → installer'a gömülür
- `lib/catalog/defaultCatalogService.ts` → yerel seeding
- `lib/catalog-templates.ts` → sektör şablonları
- `lib/company-provisioning.ts` (448 satır) → yerel firma/şube/kasa kurulumu

Yeni: **ilk yönetici hesabı adımı** — şifre doğrudan yerelde hash'lenir, `cacheOnlineLogin` bağımlılığı kalkar.

**Kurulum sihirbazı — 4 adım** (lisans adımı kaldırıldı):

```
1. Firma bilgisi  2. Sektör seçimi  3. Yönetici hesabı  4. Yedekleme hedefi
   ────────────      ────────────      ────────────       ────────────
   ad, vergi no      şablon → katalog  kullanıcı+şifre    USB/ağ/bulut klasörü
```

Mevcut `STEP_ORDER` / `setup-pill` deseni genişletilir. Her adımda tanımlanması gereken durumlar: boş form, geçersiz giriş, işlem sürüyor, hata + tekrar dene.

### 2.2 Şema: kalıcı tablolar, doğru tipler

Sahada hiç kurulum olmadığı için **veri dönüşümü migration'ı yazılmıyor** — şema baştan doğru tanımlanıyor.

- `cached_*` önekleri kalkar: `products`, `customers`, `suppliers`, `categories`, `users`, `purchase_invoices`
- `local_*_ops` kuyruk tabloları ve `sync.ts` (1439 satır) **silinir**
- **Para kolonları `INTEGER` (kuruş).** Bugünkü `REAL` float aritmetiği demek; bir POS'ta gün sonu kasanın tutmaması demek. `api-server/src/lib/money.ts` **paket silinmeden önce** `packages/shared`'a taşınır.
- **`local_sales` / `local_refunds` normalize edilir.** Bugün satış `payload_data TEXT` içinde JSON; raporlar masaüstüne taşınınca indekslenemez. Gerçek kolonlar + `prisma/schema.prisma:475`'teki indekslerin SQLite karşılıkları kurulur.

### 2.3 Migration runner (`PRAGMA user_version`)

Bugünkü mekanizma kodun kendi ifadesiyle geçici (`database.ts:4373`): *"Ideally handled by a dedicated migration system, but for now we try/catch or ignore failure"* — ve `catch` boş.

SQLite'ın yerleşik `user_version` alanı kullanılır:
- Her migration tek transaction içinde; başarılıysa sürüm artar, hata olursa rollback
- Migration öncesi otomatik yedek (mevcut altyapı üzerinden)
- Sonrasında `PRAGMA integrity_check`; başarısızsa kullanıcıya **görünür** hata

### 2.4 Harici yedek hedefi (zorunlu)

Yedekler bugün `userData/backups/` altına, veritabanıyla **aynı diske** yazılıyor (`main.ts:349`). Sunucu gidince ikinci kopya kalmıyor.

- Kurulum sihirbazının 4. adımında hedef seçilmeden kurulum tamamlanmaz
- Her otomatik yedek oraya da kopyalanır
- Hedef N gündür erişilemiyorsa POS ekranında kalıcı uyarı

**Uyarı tasarımı:** kasa ekranının üstünde ince bir şerit, `--warning` tonunda, kapatılabilir ama her açılışta geri gelir. Sert bir modal değil — kasiyer satış ortasında engellenmemeli. Metin eylem içermeli: "Yedek 6 gündür alınamıyor. USB takılı değil." + "Ayarları aç".

### 2.5 Kullanıcı yönetimi ve firma ayarları

Bunlar olmadan Faz 2 sonunda ürün açılsa bile yeni kasiyer eklenemez, şifre sıfırlanamaz.

**Doğrulama:** Ağ kablosu çekili makinede tam döngü — kurulum → sektör seç → katalog seed → yönetici oluştur → yedek hedefi → kasiyer ekle → sat → tahsilat → iade → gün sonu → vardiya devri → yedek → kapat/aç.

---

## Faz 3 — Panelin Electron'a Taşınması

POS'ta **zaten var:** Satış, Ödeme, İade, Müşteriler, Stok, Tedarikçiler, Gün Raporu, Vardiya, Masraflar, Kampanyalar, Hızlı Ürünler, Operasyonlar, Tanılama.

Kalan taşınacaklar (kullanıcı yönetimi ve firma ayarları Faz 2.5'te taşındı):

| Alan | Kaynak |
|---|---|
| Alış faturaları | `domain/invoices/`, `pages/invoices/` |
| Detaylı raporlar | `domain/reports/`, `pages/reports/` |
| Katalog yönetimi | `domain/catalog/`, `CatalogPage.tsx` |

**Taşınmayacak:** `subscription/`, `stock-transfers/`, `auth/`, `LandingPage`, `PaymentSuccessPage`.

**Yöntem:** her `domain/*/api.ts` içindeki `fetch` çağrıları `window.electronAPI.*` IPC çağrılarına çevrilir. `.tsx` bileşenleri büyük ölçüde olduğu gibi taşınır.

**Yönetim sekmesi bilgi mimarisi** — beş alan düz bir listede değil, kullanım sıklığına göre gruplanır:

```
Yönetim
├── Günlük        Raporlar · Alış faturaları
├── Katalog       Ürünler · Kategoriler · Tedarikçiler
└── Kurulum       Kullanıcılar · Firma ayarları · Yedekleme
```

Sadece `ADMIN` / `MANAGER` görür. "Kurulum" grubu nadiren açılır, en altta.

---

## Faz 4 — Temizlik, Çalışma Zamanı ve Dağıtım

1. **Paket silme:** `packages/api-server` ve `packages/web-dashboard` tek commit'te kaldırılır. Prisma bağımlılığı gider; `schema.prisma` referans olarak `docs/` altına taşınır.
2. **Electron yükseltme:** `33.3.0` destek dışı, yamalanmamış Chromium açıkları taşıyor. Güncel ana sürüme çıkılır; `better-sqlite3` yeniden derlenir, tüm akışlar yeniden test edilir.
3. **Font bağımlılığı (offline'da kırılıyor).** `packages/pos-desktop/src/index.css:1`:
   ```css
   @import url('https://fonts.googleapis.com/css2?family=Inter...');
   ```
   Ürün tamamen offline'a geçiyor; bu satır internetsiz makinede sessizce başarısız olur ve uygulama yedek fonta düşer. Inter woff2 dosyaları paketin içine alınıp `@font-face` ile yerel olarak tanımlanır.
4. **Auto-update — bugün çalışmıyor.** `package.json:55` `"publish": null`, yani `latest.yml` hiç üretilmiyor.
   - `publish` → public releases reposu. **Installer müşteriye elden iletilir**; public repoda yalnızca güncelleme dosyaları (`latest.yml`, blockmap, nsis paketi) durur.
   - `publisherName: "MarketPOS Team"` (`package.json:71`) gerçek sertifika ünvanıyla eşitlenir. `verifyUpdateCodeSignature: true` olduğu için isim tutmazsa electron-updater **her güncellemeyi sessizce reddeder** — sonradan düzeltme yolu yok, **ilk imzalı sürümden önce** yapılmalı.
   - `autoInstallOnAppQuit` (`main.ts:705`) kapatılır — kapanışta, kimse başında yokken şema migration'ı çalışmamalı. Güncelleme kullanıcı onayıyla, gün başında kurulur.
   - **Kademeli yayın:** önce tek makinede doğrulanır, sonra `latest.yml` güncellenir.
   - v1.0.0 → v1.0.1 yükseltmesi gerçek bir kurulumda uçtan uca test edilir. *Test edilmemiş güncelleme kanalı, olmayan güncelleme kanalıdır.*
5. **CI:** yalnızca POS build + test + imzalı release.
6. **README / AGENTS.md** baştan yazılır.

---

## Faz 5 — Ticari, Hukuki ve Tasarım Temizliği

1. **Mock entegrasyonların kaldırılması (satıştan önce, zorunlu).**
   - `e-invoice.ts` — `https://mock-gib-portal.gov.tr/...` sahte adres üretiyor.
   - `yn-okc.ts:49` — `Math.random()` ile **Z numarası ve fiş numarası uyduruyor**, ve `main.ts:1097` `YNOKC_PROCESS_PAYMENT` ile **canlı ödeme akışına bağlı**. Türkiye'de ÖKC sertifikalı cihazdır, Z raporu resmi kayıttır. Uydurulmuş Z numarası = kaydedilmemiş satış.
   - İkisi de servis + IPC handler + ekran + ayar seçeneği düzeyinde kaldırılır.
2. **Tasarım sistemi düzeltmesi.** `design-system/marketpos-checkout/` otomatik üretilmiş ve bir B2B pazarlama sitesini tarif ediyor: "Hero (Video/Mission)", "Client Logos", "Contact Sales" bölümleri, "E-commerce Luxury" kategorisi, Rubik/Nunito Sans fontları, "Liquid Glass" efektleri. Kod ise Inter ve düz bir kasa arayüzü kullanıyor; `sales-flow.md` kendi içinde de MASTER ile çelişiyor (navy/grey vs. black/gold). Kaldırılır; yerine `index.css:15-60`'taki gerçek tokenlerden kök dizine kısa bir `DESIGN.md` yazılır. (`index.css:4` yorumu "koyu tema" diyor ama değerler açık tema — o da düzeltilir.)
3. **EULA.** Tek makine tavsiyesi, devir koşulları, garanti reddi, sorumluluk sınırı, destek kapsamı.
4. **"Ömür boyu lisans" ≠ "ömür boyu destek".** Satış anında yazılı ayrım; kurulum desteği dahil, sonrası ayrı ücretli.
5. **Güncelleme taahhüdünün sınırı.** Kapsam dışı maddesi yalnızca mevzuatı değil, **güvenlik ve çalışma zamanı bakımını** da kapsamalı.
6. **Yedekleme sorumluluğu.** Veri müşterinin makinesinde; veri kaybı sorumluluğunun sende olmadığı açıkça yer almalı.

---

## Sıralama ve Bağımlılıklar

```
Faz 0 ──► Faz 1 ──► Faz 2 ──► Faz 3 ──► Faz 4
                       │
                       └─ 2.1 (provisioning + ilk yönetici) BLOKAJ,
                          2.2/2.3/2.4/2.5'ten önce

Faz 5 paralel yürür, Faz 4'ten önce biter.
v1.1 (repository bölme + karakterizasyon testleri) — ürün sattıktan SONRA.
```

**Ağırlık:** Faz 2 toplam işin ~yarısı (2.1 tek başına belirgin bir dilim), Faz 3 ~çeyreği.

### Paralel şeritler

| Adım | Dokunduğu modüller | Bağımlı |
|---|---|---|
| Faz 1 söküm | `pos-desktop/src`, `pos-desktop/electron` | — |
| Faz 2.1 provisioning | `pos-desktop/electron/services`, `pos-desktop/src` | Faz 1 |
| Faz 2.2-2.5 veri katmanı | `pos-desktop/electron/services/database.ts` | Faz 2.1 |
| Faz 3 panel taşıma | `pos-desktop/src/pages` | Faz 2 |
| Faz 4 Electron + dağıtım | kök `package.json`, native modüller | Faz 3 |
| Faz 5 hukuki + tasarım | `docs/`, `design-system/`, EULA | — |

```
Şerit A: Faz 1 → Faz 2.1 → Faz 2.2-2.5 → Faz 3 → Faz 4   (sıralı, hepsi pos-desktop)
Şerit B: Faz 5 (hukuki metinler, DESIGN.md, mock kaldırma)  (bağımsız)
```

**Çakışma uyarısı:** Şerit A'nın neredeyse tamamı `database.ts` üzerinde. Paralel çalışma yok; worktree ayırmak fayda vermez. Şerit B'nin mock kaldırma kısmı `pos-desktop` dosyalarına dokunur — Faz 1 bittikten sonra araya sıkıştırılmalı.

---

## Test Planı

QA girdisi: `~/.gstack/projects/Hollypredator-marketpos/coban-feat-subscription-management-eng-review-test-plan-20260804-190528.md`

**Kritik tespit:** `LocalDatabaseService` (4459 satır, ~123 metot) doğrudan testsiz. Onu referans alan tek test yok; `backup-policy.test.ts` ve `setup-state.test.ts` yalnızca saf JSON ayrıştırıcıları test ediyor.

**Karar: tüm gap'ler kapatılacak.**

```
KOD YOLLARI                                         KULLANICI AKIŞLARI
[+] electron/services/migrations.ts (YENİ)          [+] Sürüm yükseltme
  ├── [GAP] user_version 0 → 1                        ├── [GAP] [→E2E] v1 DB → v2 yükseltme
  ├── [GAP] ortada hata → rollback                    ├── [GAP]        Migration hatası → geri alma
  ├── [GAP] integrity_check başarısız                 └── [GAP]        Yükseltme sonrası bütünlük
  └── [GAP] migration öncesi yedek alındı mı

[+] shared/money.ts INTEGER (YENİ)                  [+] Para doğruluğu
  ├── [GAP] yuvarlama sınırları                       ├── [GAP] [→E2E] 1000 satırlık gün → kasa tutuyor mu
  └── [GAP] KDV hesabı kuruş hassasiyeti              └── [GAP]        KDV oranı değişimi → toplam

[+] Yerel provisioning (YENİ)                       [+] İlk kurulum (4 adım)
  ├── [GAP] sektör şablonu → katalog seed             ├── [GAP] [→E2E] Temiz makine → satışa hazır
  ├── [GAP] ilk yönetici hesabı oluşturma             ├── [GAP]        Her adımda geçersiz giriş
  └── [GAP] seed yarım kalırsa geri alma              └── [GAP]        Kasiyer ekle → giriş yap

[+] Harici yedek (YENİ)
  ├── [GAP] hedef erişilemez → uyarı şeridi           └── [GAP] USB çıkarılmış → kullanıcı ne görüyor
  └── [GAP] hedef dolu / yazma izni yok

MEVCUT (korunacak): backup-policy ★★ | setup-state ★★ | SetupGate ★★
                     ipc.contract ★★ | sale-payload ★★ | discount-policy ★★

COVERAGE: 0/16 yeni yol test edildi (0%)  |  GAPS: 16 (3 E2E)
KRİTİK: migration rollback, provisioning bootstrap, para doğruluğu
```

---

## Üretim Hata Senaryoları

| Yeni kod yolu | Gerçekçi hata | Test var mı | Hata yönetimi | Kullanıcı görür mü |
|---|---|---|---|---|
| Migration runner | ALTER ortada patlar, DB yarım | Plana eklendi | Transaction rollback + yedek | Evet, görünür hata |
| INTEGER para geçişi | Yuvarlama yanlış, kasa tutmaz | Plana eklendi | Yok — sessiz | **Hayır → E2E gün sonu testi zorunlu** |
| Yerel provisioning | Katalog seed yarım kalır | Plana eklendi | Transaction + tekrar dene | Evet |
| İlk yönetici adımı | Hesap yaratılamaz, kurulum bitmez | Plana eklendi | Adım tekrar dener | Evet |
| Harici yedek | Hedef erişilemez, sessiz atlanır | Plana eklendi | Kalıcı uyarı şeridi | Evet |
| Yerel font | woff2 yüklenemez, yedek fonta düşer | Manuel | Yok — sessiz | Hayır, ama kozmetik |
| Auto-update imza | `publisherName` uyuşmaz, güncelleme reddedilir | **Manuel doğrulama** | Yok — sessiz | **Hayır → ilk imzalı sürümde elle test** |

**Kritik boşluk (2):** para yuvarlama hatası ve auto-update imza uyuşmazlığı — ikisi de sessiz ve sunucusuz ortamda fark edilmesi çok geç olur.

---

## Implementation Tasks

- [ ] **T1 (P0, human: ~1 hafta / CC: ~2 saat)** — provisioning — yerel seeding + ilk yönetici adımı
  - Surfaced by: Outside voice #1, #2 — `SetupGate.tsx:490`, `database.ts:1432` `cacheOnlineLogin`
  - Files: `catalog.json`, `defaultCatalogService.ts`, `catalog-templates.ts`, `company-provisioning.ts` → pos-desktop
  - Verify: temiz makinede ağsız kurulum → sektör seç → katalog dolu → yönetici ile giriş
- [ ] **T2 (P0, human: ~3 saat / CC: ~15dk)** — compliance — ÖKC ve e-Fatura mock'larını üründen çıkar
  - Surfaced by: Architecture A6 + outside voice #3 — `yn-okc.ts:49`, `main.ts:1097`
  - Files: `yn-okc.ts`, `e-invoice.ts`, `main.ts:1097`, `PaymentPage.tsx`, `PresetSettingsModal.tsx`
  - Verify: ödeme ekranında ÖKC düğmesi yok, ayarlarda seçenek yok
- [ ] **T3 (P1, human: ~1 gün / CC: ~20dk)** — cleanup — lisans ve abonelik kodunu sök
  - Surfaced by: Faz 1 — `AccessLockScreen.tsx`, `database.ts:1356-1391` gömülü HMAC anahtarı
  - Files: `AccessLockScreen.tsx` (sil), `database.ts`, `pos-runtime.ts`, `SetupGate.tsx`, `shared/src/types.ts`
  - Verify: `npm run typecheck` temiz, lisans referansı kalmadı
- [ ] **T4 (P1, human: ~2 gün / CC: ~45dk)** — data — kuyruğu bırak, `sync.ts` sil, tabloları kalıcılaştır
  - Surfaced by: Outside voice #8 — `database.ts:3882`
  - Files: `database.ts`, `sync.ts` (sil), `main.ts` sync IPC handler'ları
  - Verify: ağsız tam satış döngüsü
- [ ] **T5 (P1, human: ~2 gün / CC: ~45dk)** — data — `PRAGMA user_version` migration runner
  - Surfaced by: Architecture A4 — `database.ts:4373` boş `catch`
  - Files: `migrations.ts` (yeni), `database.ts:4372-4430`
  - Verify: migration ortasında hata → rollback, `integrity_check` geçer
- [ ] **T6 (P1, human: ~1 gün / CC: ~20dk)** — data — para kolonlarını `INTEGER` kuruşa çevir
  - Surfaced by: Code Quality C1 — `database.ts:4209`, `money.ts:3`
  - Files: `api-server/src/lib/money.ts` → `packages/shared`, `database.ts` şema
  - Verify: 1000 satırlık günde satır toplamları ile gün sonu birebir eşleşiyor
- [ ] **T7 (P1, human: ~2 gün / CC: ~45dk)** — data — satış/iade tablolarını normalize et + indeksle
  - Surfaced by: Performance P1 — `database.ts:4074`, `schema.prisma:475`
  - Files: `database.ts` şema, satış/iade yazma ve okuma yolları
  - Verify: 180.000 satırlık veri setinde aylık rapor sorgusu indeks kullanıyor
- [ ] **T8 (P1, human: ~1 gün / CC: ~30dk)** — backup — zorunlu harici hedef + uyarı şeridi
  - Surfaced by: Architecture A3 + design DS — `main.ts:349`
  - Files: `main.ts:349-533`, kurulum sihirbazı 4. adım, kasa ekranı uyarı şeridi
  - Verify: hedef seçilmeden kurulum bitmiyor; hedef çıkarılınca şerit çıkıyor ve "Ayarları aç" çalışıyor
- [ ] **T9 (P1, human: ~3 gün / CC: ~1 saat)** — admin — kullanıcı yönetimi + firma ayarları Electron'a
  - Surfaced by: Architecture A5 — `database.ts:4177`
  - Files: `web-dashboard/src/domain/{users,organization}` → `pos-desktop/src/pages`
  - Verify: ağsız yeni kasiyer eklenip o kullanıcıyla giriş yapılabiliyor
- [ ] **T10 (P1, human: ~1 gün / CC: ~30dk)** — dist — güncelleme kanalını kur ve güvenli hale getir
  - Surfaced by: Architecture A2 + outside voice #9 — `package.json:55,71`, `main.ts:705`
  - Files: `pos-desktop/package.json`, `main.ts:704-705`, CI workflow
  - Verify: v1.0.0 → v1.0.1 yükseltmesi gerçek imzalı kurulumda çalışıyor
- [ ] **T11 (P1, human: ~2 gün / CC: ~45dk)** — runtime — Electron'u güncel ana sürüme yükselt
  - Surfaced by: Outside voice #10 — `package.json:45` `"electron": "33.3.0"`
  - Files: `pos-desktop/package.json`, native modül derleme yapılandırması
  - Verify: `better-sqlite3` yeniden derleniyor, testler geçiyor, installer üretiliyor
- [ ] **T12 (P1, human: ~1 hafta / CC: ~2 saat)** — test — 16 test gap'ini kapat
  - Surfaced by: Test review — `LocalDatabaseService` doğrudan testsiz
  - Files: `pos-desktop/electron/services/*.test.ts`, E2E harness
  - Verify: `npm run test --workspace @marketpos/pos-desktop`
- [ ] **T13 (P2, human: ~1 hafta / CC: ~2 saat)** — admin — kalan panel alanlarını taşı + Yönetim IA
  - Surfaced by: Faz 3 + design review — beş alan gruplanmamıştı
  - Files: `web-dashboard/src/domain/{invoices,reports,catalog}` → `pos-desktop/src`
  - Verify: Günlük / Katalog / Kurulum gruplaması çalışıyor, `fetch` çağrısı kalmadı
- [ ] **T14 (P2, human: ~2 saat / CC: ~10dk)** — design — Google Fonts CDN'i kaldır, Inter'i paketle
  - Surfaced by: Design review — `index.css:1` offline'da sessizce başarısız olur
  - Files: `packages/pos-desktop/src/index.css`, `assets/fonts/`
  - Verify: ağsız makinede uygulama Inter ile açılıyor
- [ ] **T15 (P2, human: ~4 saat / CC: ~20dk)** — design — `DESIGN.md` yaz, yanıltıcı sistemi sil
  - Surfaced by: Design review — `design-system/marketpos-checkout/` bir pazarlama sitesini tarif ediyor
  - Files: `DESIGN.md` (yeni), `design-system/` (sil), `index.css:4` yorumu
  - Verify: tokenler `index.css` ile birebir; çelişkili belge kalmadı
- [ ] **T16 (P2, human: ~1 gün / CC: ~20dk)** — cleanup — `api-server` + `web-dashboard` sil, Prisma kaldır
  - Surfaced by: Step 0 — sil-önce sıralaması
  - Files: `packages/api-server`, `packages/web-dashboard`, kök `package.json`, `turbo.json`, CI
  - Verify: `npm run build` ve `npm run typecheck` iki pakette temiz
- [ ] **T17 (P2, human: ~1 gün / CC: —)** — legal — EULA ve destek kapsamı metinleri
  - Surfaced by: Faz 5 + outside voice #10
  - Files: `docs/eula.md` (yeni), `SetupGate.tsx` lisans kabul metni
  - Verify: destek ayrımı, güvenlik/mevzuat kapsam dışı maddeleri mevcut
- [ ] **T18 (P3, human: ~1 hafta / CC: ~2 saat)** — refactor — `LocalDatabaseService`'i böl (**v1.1**)
  - Surfaced by: Code Quality C2 — `database.ts:1398` 4459 satırlık tek sınıf
  - Files: `database.ts` → domain repository modülleri
  - Verify: bölme öncesi karakterizasyon testleri bölme sonrası aynen geçiyor

---

## Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Müşteri diski gider, veri yok olur | Yüksek | Faz 2.4 — zorunlu harici yedek hedefi |
| Migration bozulur, müşteri verisi kırılır | Yüksek | Faz 2.3 — transaction + rollback + öncesinde yedek + `integrity_check` |
| `publisherName` uyuşmazlığı → güncelleme kanalı ölür | Yüksek | Faz 4.4 — ilk imzalı sürümden önce elle doğrulama |
| Para yuvarlama hatası sessiz birikir | Yüksek | T12 — E2E gün sonu mutabakat testi |
| Ürün sınırsız kopyalanır | Orta | **Kabul edilen sınır** — teknik engel yok, kapı satış kanalıyla tutuluyor |
| Electron güncellemesi kırıcı değişiklik getirir | Orta | Faz 4.2 — native modül yeniden derleme + tam regresyon |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 10 issues + 11 outside-voice findings, 2 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 3/10 → 8/10, 4 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** Dış ses (Claude subagent) 11 bulgu getirdi. En önemlisi kritik yol tersliği: inceleme para/normalizasyon/repository-bölme üçünü Faz 2'ye koymuştu, dış ses üçünün de sunucu sökümü için gerekli olmadığını savundu; `database.ts:3882` doğrulandı ve haklı çıktı. "Ödeyen müşteri yok" bilgisi gelince veri riski gerekçesi düştü, para ve normalizasyon Faz 2'ye geri alındı, repository bölme v1.1'e ayrıldı. Dış ses ayrıca planda hiç olmayan iki blokaj buldu: yerel provisioning ve ilk yönetici bootstrap.
- **DESIGN:** Lisans kontrolünün tamamen kaldırılması kararı, tasarım incelemesinin iki bulgusunu (AccessLockScreen çıkışsızlığı, `.lic` hata durumları) konusuz bıraktı. Kalan bulgular plana işlendi: offline'da kırılan Google Fonts CDN importu, ürünü tarif etmeyen tasarım sistemi, Yönetim sekmesi bilgi mimarisi, yedek uyarı şeridinin tasarımı.
- **VERDICT:** ENG + DESIGN CLEARED — uygulamaya hazır.

NO UNRESOLVED DECISIONS
