# Subscription Access Control (Annual Packages)

## Goal
- Block usage for customers who do not renew annual packages.
- Keep short offline tolerance to avoid operational outages.

## Enforced Points
- API login (`/api/auth/login`) checks company package status.
- API protected routes check package status (`server.ensureCompanyAccess`).
- Desktop app caches package snapshot on successful online login and sync checks.
- Offline mode is allowed only until `offlineAccessValidUntil`.

## Company Fields
Stored in `companies`:
- `package_type` (`MONTHLY | YEARLY`)
- `package_status` (`ACTIVE | SUSPENDED`)
- `package_started_at`
- `package_expires_at`
- `package_grace_ends_at`

Computed runtime statuses returned to clients:
- `ACTIVE`, `GRACE`, `EXPIRED`, `SUSPENDED`, `UNCONFIGURED`

## Recommended Policy (Annual)
1. `package_expires_at = contract_end_date`
2. `package_grace_ends_at = package_expires_at + 7 days`
3. If no payment after grace: access becomes blocked automatically.
4. For immediate manual block: set `package_status = 'SUSPENDED'`.

## Offline Grace
- Env var: `MARKETPOS_OFFLINE_ACCESS_GRACE_DAYS` (default: `7`, max: `30`)
- Even if internet is down, app access continues only until cached `offlineAccessValidUntil`.
- POS desktop records local last-seen time and blocks offline usage if device clock is moved backwards significantly (anti-tamper).

## Operational Examples
### Renew for 1 year
```sql
UPDATE companies
SET package_status = 'ACTIVE',
    package_started_at = NOW(),
    package_expires_at = NOW() + INTERVAL '1 year',
    package_grace_ends_at = NOW() + INTERVAL '1 year' + INTERVAL '7 days',
    updated_at = NOW()
WHERE id = '<company_id>';
```

### Immediate block
```sql
UPDATE companies
SET package_status = 'SUSPENDED',
    updated_at = NOW()
WHERE id = '<company_id>';
```
