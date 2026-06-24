# Plan: MarketPOS Desktop App — Offline + Dağıtıma Hazır Paket

Generated: 2026-06-24
Status: APPROVED
Mode: Solo developer + AI tools

## Goal

MarketPOS'u tamamen offline (internete ihtiyaç duymayan), dağıtıma hazır bir desktop paketine çevirmek.

## Decisions

1. Lisans aktivasyonu: Online aktivasyon korunsun, sonra tam offline (365+15 gün)
2. api-server + web-dashboard: Opsiyonel kal, iki paket (desktop installer + optional cloud)
3. Öncelik: Paralel — dağıtım kalitesi + offline deneyim aynı anda

## Current State

- Desktop app: offline satış/stok/iade/rapor ✓ (SQLite)
- Grace period: 7 gün (30 gün clamp) → 365 güne çıkarılacak
- Installer: NSIS + code signing yapılandırılmış, test edilmemiş
- CI: 3/4 paket typecheck temiz, 97/100 test passing
- Working tree: 136 untracked, scratch files, debug scripts

## Track 1: Dağıtım Kalitesi

### 1.1 Working tree temizliği
- Sil: build_error*.txt, build_final.txt, scratch_*, tmp-*, api-debug-*.log
- Sil: check_categories.js, check_stats.js, debug_db.js, test_db_connection.js, test_discounts.js
- Sil: tests/checkDb.ts, tests/testScraper.ts, prisma/ewewrwr, prisma/dev.db
- .gitignore genişlet: scratch_*, tmp-*, prisma/*.db, generated/
- 136 untracked dosyayı 9 mantıksal commit'te commit'le

### 1.2 Typecheck düzelt (2 error → 0)
- web-dashboard/src/domain/reports/types.ts: LedgerSummary export ekle
- web-dashboard/src/domain/reports/hooks.test.tsx:105: ledgerSummary field ekle

### 1.3 Test düzelt (3 failed → 0)
- pos-desktop/src/components/SetupGate.test.tsx: mock call count drift düzelt

### 1.4 AI tool context
- AGENTS.md oluştur
- .env.example oluştur

## Track 2: Offline Deneyim

### 2.1 Grace period 365 gün (KRİTİK)
- packages/api-server/src/lib/company-access.ts:50: 7 → 365
- packages/api-server/src/lib/company-access.ts:101: 30 clamp → 400
- Sonuç: 365+15 gün tam offline

### 2.2 AccessLockScreen düzelt
- packages/pos-desktop/src/App.tsx:452-465: OFFLINE_EXPIRED'de lock screen gösterme
- Sadece SUBSCRIPTION_BLOCKED'da lock screen

### 2.3 Offline readiness otomatik
- SetupGate.tsx:926-967: Manuel checkbox → otomatik test
- Test satışı + kuyruk doğrulama + sync doğrulama

### 2.4 Sync heartbeat backoff
- main.ts:554-557: 60s → 5dk → 15dk → 30dk

### 2.5 Offline özellik doğrulama
- Satış/iade/stok/rapor/müşteri/tedarikçi/kampanya/vardiya/backup: ✓ offline
- E-fatura: offline'da uyarı göster (mock zaten)

## Track 3: Dağıtım Paketi

### 3.1 NSIS installer E2E test
- Temiz Windows VM'de installer çalıştır

### 3.2 Code signing doğrulama
- check-signing-env → verify-release-signature akışını test et

### 3.3 Auto-update feed
- MARKETPOS_UPDATE_FEED_URL yapılandır
- Feed host kararı (GitHub releases öneriliyor)

### 3.4 Release dokümantasyon
- manual-installer-runbook.md + desktop-rollout-checklist.md güncelle

### 3.5 Opsiyonel cloud paketi
- api-server/deploy/README.md güncelle (Docker compose)
- Cloud sync ayarlar menüsünden opsiyonel

## Execution Order

```
Track 1                        Track 2                        Track 3
──────────                     ──────────                     ──────────
1.1 Working tree               2.1 Grace period 365           (1.1 + 1.2 + 1.3 + 2.1 sonrası)
1.2 Typecheck                  2.2 Lock screen                3.1 Installer E2E
1.3 Test                       2.3 Offline readiness          3.2 Code signing
1.4 AGENTS.md                  2.4 Sync backoff               3.3 Auto-update feed
                               2.5 Offline doğrulama          3.4 Release docs
                                                              3.5 Cloud guide
```

Dependencies:
- 1.1 + 1.2 + 1.3 → 3.1 (temiz repo + yeşil CI ile build)
- 2.1 → 3.1 (offline davranış doğru olmalı)
- Track 1 ve Track 2 paralel

## Open Questions

1. Auto-update feed URL host yeri? (GitHub releases öneriliyor)
2. Code signing sertifikası mevcut mu?
3. Offline readiness test sırasında gerçek satış mı, dry-run mı?

## Success Criteria

- [ ] git status temiz (untracked yok)
- [ ] 4/4 paket typecheck temiz
- [ ] 100/100 test geçer
- [ ] AGENTS.md + .env.example var
- [ ] Grace period 365 gün
- [ ] 365+15 gün internet gerekmez
- [ ] AccessLockScreen sadece lisans expire'da
- [ ] Offline readiness otomatik
- [ ] NSIS installer temiz Windows'ta çalışır
- [ ] Code signing test edilmiş
- [ ] Auto-update feed yapılandırılmış
- [ ] Release proses dokümante
- [ ] Health score 9.0+/10

## First Actions

1. .gitignore genişlet + scratch dosyaları sil (Track 1.1)
2. company-access.ts:50 grace period 7 → 365 (Track 2.1)
3. web-dashboard LedgerSummary export ekle (Track 1.2)
4. SetupGate test mock call count düzelt (Track 1.3)
5. 136 untracked dosyayı logical commit'lerle commit'le
