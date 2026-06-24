# MarketPOS V1 Sales Readiness Checklist

## 1) Core Runtime Gate (must pass)
- [ ] Sales, refunds, product, stock, customer, supplier, purchase flows work online/offline.
- [ ] Queue lifecycle visible and consistent for all entities: queued/pending/synced/failed.
- [ ] Sync retry/idempotency checks pass under network flaps.
- [ ] Re-auth recovery verified for token expiry, cache/session corruption, role mismatch.

## 2) Offline Data Safety Gate
- [ ] Auto-backup policy enabled by default (interval/retention/max backups).
- [ ] Backup integrity validation (quick_check) passes on each backup.
- [ ] Startup DB integrity check (quick_check) passes.
- [ ] Restore smoke test executed from latest backup.

## 3) Operations & Support Gate
- [ ] Diagnostics page shows entity queue matrix and failed-item dead-letter table.
- [ ] Support bundle export works (runtime, queue, failed rows, security events).
- [ ] Daily close CSV and offline readiness audit reports generated successfully.

## 4) Deployment Gate
- [ ] Single installer tested on clean machine.
- [ ] Auto-update tested: update available, download, install, rollback scenario.
- [ ] First-run setup wizard tested end-to-end (company/branch/register binding).

## 5) Pilot Acceptance Gate
- [ ] 1-day offline run per profile: market, bakkal, bufet.
- [ ] End-of-day reconciliation: cash/report/queue/sync status.
- [ ] Incident runbook exercised; MTTR measured and acceptable.
