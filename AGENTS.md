# AGENTS.md — MarketPOS

MarketPOS, coklu sube destekli ve offline calisabilen yazarkasa POS sistemidir. Elektron + React 19 desktop app, Fastify API server, ve React web dashboard iceren npm workspaces + Turborepo monorepo'dur.

## Hizli Baslangic

```bash
nvm use              # Node 20 LTS
npm install          # tum paketleri yukle
npm run build --workspace @marketpos/shared   # ONCE shared build et
npx prisma db push --schema prisma/schema.prisma  # DB olustur
npm run db:seed --workspace @marketpos/api-server  # seed data
```

## Package Yapisi

| Package | Aciklama | Tech |
|---------|----------|------|
| `packages/shared` | Ortak tipler, sabitler, Zod validatorleri | TypeScript 5, Zod 3 |
| `packages/api-server` | Cloud API (lisans aktivasyon, sync, yonetim) | Fastify 5, Prisma 6, SQLite |
| `packages/pos-desktop` | Desktop POS uygulamasi (offline satis) | Electron 33, React 19, SQLite (better-sqlite3) |
| `packages/web-dashboard` | Web yonetim paneli (backoffice) | React 19, Vite 6, TanStack Query |

**Onemli:** `shared` paketi once build edilmeli (diger paketler onun dist'ini import eder).

## Build Komutlari

```bash
npm run build --workspace @marketpos/shared       # shared (once)
npm run build --workspace @marketpos/api-server   # API
npm run build --workspace @marketpos/pos-desktop  # desktop web (Vite)
npm run build:electron --workspace @marketpos/pos-desktop  # desktop electron (tsc)
npm run build --workspace @marketpos/web-dashboard  # web dashboard
# veya hepsi birden:
npm run build   # turbo run build
```

## Test Komutlari

```bash
npm run test --workspace @marketpos/shared        # yok (tip-only)
npm run test --workspace @marketpos/api-server    # custom runner (32 test)
npm run test --workspace @marketpos/pos-desktop   # vitest (39 test)
npm run test --workspace @marketpos/web-dashboard # vitest (29 test)
```

## Typecheck

```bash
npm run typecheck   # turbo run typecheck (4 paket)
```

## Dev Komutlari

```bash
npm run dev --workspace @marketpos/api-server     # tsx watch, port 3001
npm run electron:dev --workspace @marketpos/pos-desktop  # Vite + Electron (Windows)
npm run dev --workspace @marketpos/web-dashboard  # Vite dev server
```

## Cevre Degiskenleri

`.env` dosyasini `.env.example`'dan kopyala:

| Degisken | Paket | Aciklama |
|----------|-------|----------|
| `DATABASE_URL` | api-server | Prisma DB URL (SQLite: `file:./dev.db`) |
| `JWT_SECRET` | api-server | JWT access token secret |
| `JWT_REFRESH_SECRET` | api-server | JWT refresh token secret |
| `PORT` | api-server | API port (default 3001) |
| `MARKETPOS_API_BASE_URL` | pos-desktop | API URL (default localhost:3001) |
| `MARKETPOS_UPDATE_FEED_URL` | pos-desktop | Auto-update feed URL |
| `MARKETPOS_OFFLINE_ACCESS_GRACE_DAYS` | api-server | Offline grace period (default 365) |
| `SYNC_V2_ENABLED` | api-server, pos-desktop | V2 sync motoru (default false) |

## Dosya Konvensiyonlari

- **Kaynak kod:** `packages/*/src/` (renderer), `packages/*/electron/` (main process)
- **Testler:** `packages/*/src/**/*.test.ts(x)`, `packages/api-server/tests/`
- **Prisma schema:** `prisma/schema.prisma` (repo root)
- **Migrationlar:** `prisma/migrations/`
- **Dokumanlar:** `docs/` (pilot, runbook, checklist)

## Dokunmayin

- `scratch_*`, `tmp-*`, `build_error*.txt` — gecici ciktilar, commit etmeyin
- `prisma/dev.db` — gelistirme DB'si, gitignore'da
- `generated/` — uretilmis dosyalar
- `dist/`, `dist-electron/`, `release/` — build ciktilari

## Lisans Modeli

- Ilk kurulumda online aktivasyon gerekir (lisans kodu -> API -> HMAC-signed snapshot)
- 365+15 gun tam offline (grace period 365 gun)
- 365. gunde AccessLockScreen -> online yenileme
- HMAC imza + clock rollback korumasi

## Mevcut Durum (2026-06-24)

- Desktop app offline calisiyor (satis, stok, iade, raporlar)
- api-server SQLite kullaniyor (PostgreSQL'e gecis hazir)
- 4/4 paket typecheck temiz
- 100/100 test geciyor
- NSIS installer + code signing yapilandirilmis
- Auto-update (electron-updater) hazir
