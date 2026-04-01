# MarketPOS — Geliştirme Kuralları

Bu belge, MarketPOS projesinin tüm geliştirme süreçlerinde uyulması gereken kuralları tanımlar.

---

## 1. Proje Yapısı

- **Monorepo** yapısı kullanılır: `npm workspaces + Turborepo`
- Tüm paketler `packages/` altında yer alır
- Ortak kod **mutlaka** `@marketpos/shared` paketinde tutulur
- Paketler arası tip paylaşımı barrel export (`index.ts`) üzerinden yapılır
- Her paketin kendi `tsconfig.json`'u olur, `tsconfig.base.json`'dan extend eder

```
MARKETPOS/
├── packages/
│   ├── shared/          # Ortak tipler, validasyon, sabitler
│   ├── api-server/      # Cloud API (Fastify)
│   ├── pos-desktop/     # Electron POS uygulaması
│   └── web-dashboard/   # Yönetim paneli
├── prisma/              # DB şema ve migration
├── turbo.json
└── tsconfig.base.json
```

---

## 2. Kod Yazım Kuralları

### TypeScript
- **Strict mode** her zaman açık (`"strict": true`)
- `any` kullanımı **yasak** — gerekiyorsa `unknown` + type guard kullan
- Tüm fonksiyonlarda **dönüş tipi** belirtilmeli
- Enum'lar `@marketpos/shared/constants` içinde merkezi tanımlanır
- Interface isimleri `PascalCase`, değişkenler `camelCase`, sabitler `UPPER_SNAKE_CASE`

### Dosya İsimlendirme
- Dosyalar: `kebab-case.ts` (ör: `sale-page.tsx`, `auth-routes.ts`)
- React bileşenleri: `PascalCase.tsx` (ör: `SalePage.tsx`, `Numpad.tsx`)
- Test dosyaları: `*.test.ts` veya `*.spec.ts`

### Import Sırası
1. Node.js built-in modülleri
2. Üçüncü parti paketler
3. `@marketpos/*` paketleri
4. Göreli import'lar (`./`, `../`)
5. Tip import'ları (`import type { ... }`)

---

## 3. API Kuralları

### Genel
- Tüm endpoint'ler `/api/` prefix'i ile başlar
- Tüm yanıtlar `{ success: boolean, data?: T, error?: string }` formatında döner
- Sayfalı listeler `{ pagination: { page, limit, total, totalPages } }` içerir
- **Soft delete** kullanılır — `deletedAt` alanı `null` değilse kayıt silinmiş sayılır

### Validasyon
- Tüm input'lar **Zod** ile validate edilir
- Zod şemaları `@marketpos/shared/validators` içinde tanımlanır
- Validasyon hatası → `400 Bad Request`

### Auth
- JWT access token: **15 dakika** ömür
- JWT refresh token: **7 gün** ömür, DB'de saklanır
- Refresh rotasyonu: her kullanımda eski token silinir, yeni token üretilir
- Protected route'lar `server.authenticate` hook'u ile korunur

### Hata Kodları
| Kod | Anlamı |
|-----|--------|
| 400 | Validasyon hatası |
| 401 | Yetkisiz (token yok/geçersiz) |
| 403 | Yetersiz yetki (rol kontrolü) |
| 404 | Kayıt bulunamadı |
| 409 | Çakışma (duplicate barkod vb.) |
| 500 | Sunucu hatası |

---

## 4. Veritabanı Kuralları

### PostgreSQL (Cloud)
- Tablo isimleri: `snake_case`, çoğul (ör: `sale_items`, `stock_levels`)
- Sütun isimleri: `snake_case` (Prisma `@map()` ile eşlenir)
- Her tabloda **mutlaka**: `id` (UUID), `created_at`, `updated_at`
- Silinebilir tablolarda: `deleted_at` (soft delete)
- İlişkiler: foreign key + Prisma relation
- Index: sık sorgulanan alanlara index eklenir

### SQLite (Lokal — POS Desktop)
- Cloud DB'nin alt kümesi — sadece ilgili şubeye ait veriler
- Senkronizasyon `updated_at` timestamp tabanlı çalışır
- Conflict resolution: **cloud kazanır** (master-slave)

### Migration
- Migration her zaman `npx prisma migrate dev` ile oluşturulur
- Migration isimleri açıklayıcı: `add_customer_loyalty_table`
- Production'da `npx prisma migrate deploy` kullanılır

---

## 5. POS Desktop (Electron) Kuralları

### Mimari
- **Main Process:** DB, donanım, dosya sistemi, senkronizasyon
- **Renderer Process:** React UI
- İletişim: `contextBridge` + `ipcMain/ipcRenderer` — **`nodeIntegration` kapalı**
- Preload script ile güvenli API bridge

### UI/UX — Dokunmatik Tasarım
- Minimum buton boyutu: **48×48px** (dokunmatik uyumluluk)
- Kritik butonlar (ödeme al, iptal): minimum **64×64px**
- Font boyutları: Normal **16px**, Fiyat/Toplam **24-32px**
- Koyu tema varsayılan (göz yorgunluğu azaltma, LED ekran uyumu)
- Barkod input alanı her zaman **odakta** (focus)
- Animasyon süresi: max **200ms** (anlık his)
- Scroll yerine **sayfalama** tercih edilmeli
- Onay gerektiren işlemlerde **modal dialog** kullanılır

### Offline
- Tüm satış işlemleri **önce SQLite'a** yazılır
- Online olunca arka planda senkronize edilir
- Senkronizasyon durumu status bar'da gösterilir
- Offline'da kullanılamayacak özellikler: yeni kullanıcı ekleme, ürün fiyat güncelleme

---

## 6. Güvenlik

- Şifreler **bcrypt** (salt rounds: 12) ile hash'lenir, düz metin **asla** saklanmaz
- API yanıtlarında `passwordHash`, `pin` gibi hassas alanlar **asla** dönülmez
- JWT secret production'da **en az 32 karakter** rastgele string
- `.env` dosyaları **asla** repo'ya eklenmez (`.gitignore`'da listelenmiş)
- SQL injection koruması: Prisma ORM + parameterized query
- XSS koruması: React varsayılan escaping + dangerouslySetInnerHTML **yasak**

---

## 7. KDV ve Fiyatlandırma

- KDV oranları: **%1, %10, %20** (Türkiye güncel oranları)
- Fiyatlar **KDV dahil** saklanır ve gösterilir
- Para birimi: **TRY (₺)**
- Ondalık: **2 basamak** (kuruş)
- Yuvarlama: `Math.round(amount * 100) / 100`
- Tüm hesaplamalar `@marketpos/shared/utils` fonksiyonlarıyla yapılır

---

## 8. Senkronizasyon

- **Push:** Kasa → Cloud (satışlar, iadeler, stok hareketleri, oturumlar)
- **Pull:** Cloud → Kasa (ürünler, kategoriler, kullanıcılar, stok seviyeleri)
- Strateji: **timestamp-based delta sync** (`updatedAt > lastSyncAt`)
- Conflict: Cloud her zaman master — kasadan gelen veri üzerine yazılır
- Otomatik sync: her **5 dakikada** bir (online ise)
- Manuel sync: kullanıcı isteği ile tetiklenebilir
- Hata durumu: başarısız sync log'lanır, bir sonraki turda tekrar denenir

---

## 9. Git & Versiyon Yönetimi

### Branch Stratejisi
- `main` — production-ready kod
- `develop` — aktif geliştirme
- `feature/xxx` — yeni özellikler
- `fix/xxx` — bug fix'ler
- `release/x.x.x` — release adayı

### Commit Mesajları (Conventional Commits)
```
feat: yeni satış ekranı eklendi
fix: barkod okuma hatası düzeltildi
refactor: stok hesaplama utils'e taşındı
docs: API dokümantasyonu güncellendi
chore: bağımlılıklar güncellendi
```

### Versiyon
- **Semantic Versioning:** `MAJOR.MINOR.PATCH`
- Breaking change → MAJOR
- Yeni özellik → MINOR
- Bug fix → PATCH

---

## 10. Test

- Test framework: **Vitest**
- Minimum kapsam: API route'ları, shared utils, fiyat hesaplamaları
- Her yeni route → en az 1 test (happy path + error case)
- Test DB: ayrı PostgreSQL veritabanı veya SQLite in-memory
- CI'da tüm testler geçmeden merge yapılmaz

---

## 11. Performans

- API yanıt süresi hedefi: **< 200ms** (CRUD), **< 500ms** (raporlar)
- Electron başlatma süresi: **< 3 saniye**
- SQLite sorguları: **< 50ms**
- Gereksiz re-render: `React.memo`, `useMemo`, `useCallback` ile önlenir
- Büyük listeler: **sanal scroll** (react-window / virtualized)

---

## 12. Deployment

- **Cloud API:** Docker container → VPS (Hetzner / DigitalOcean / AWS)
- **Web Dashboard:** Static build → Nginx veya Vercel
- **POS Desktop:** electron-builder → `.exe` installer + auto-update
- **Veritabanı:** Managed PostgreSQL veya Docker PostgreSQL
- Environment'lar: `development`, `staging`, `production`
