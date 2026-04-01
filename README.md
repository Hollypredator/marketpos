# MarketPOS

MarketPOS, coklu sube destekli ve offline calisabilen yazarkasa POS sistemidir.

## Runtime Standardi

- Node.js: `20.x LTS` (`.nvmrc` ile sabitlendi)
- npm: `10.x`

## Kurulum

```bash
nvm use
npm install
```

## Build Dogrulama Sirasi

```bash
npm run build --workspace @marketpos/shared
npm run build --workspace @marketpos/api-server
npm run build --workspace @marketpos/pos-desktop
npm run build:electron --workspace @marketpos/pos-desktop
npm run build --workspace @marketpos/web-dashboard
```

## Pilot Operasyon Dokumanlari

- API Docker pilot deploy: `packages/api-server/deploy/README.md`
- POS manuel installer + SmartScreen runbook: `docs/pilot/manual-installer-runbook.md`
- Desktop rollout checklist: `docs/pilot/desktop-rollout-checklist.md`
- Code signing + SmartScreen runbook: `docs/pilot/code-signing-smartscreen-runbook.md`
- Yillik paket erisim kesme modeli: `docs/pilot/subscription-access-control.md`
- Firma bazli hazir katalog provisioning: `docs/pilot/company-provisioning-runbook.md`

## POS Installer Release

```bash
npm run electron:release --workspace @marketpos/pos-desktop
```

## POS Signed Release

```bash
npm run electron:release:signed --workspace @marketpos/pos-desktop
```

## GitHub Signed Release Automation

```bash
npm run desktop:signing:secrets -- -Repo "OWNER/REPO" -CertificatePath "C:\\secure\\marketpos-signing.pfx" -CertificatePassword "*****"
npm run desktop:signing:check -- -Repo "OWNER/REPO"
npm run desktop:signing:dispatch -- -Repo "OWNER/REPO" -Watch
```

## Firma Provision (Hazir Katalog)

```bash
npm run db:provision --workspace @marketpos/api-server -- \
  --company-name "Ornek Market" \
  --admin-password "DegistirBeni123" \
  --template bakkal-v1
```

SUPER_ADMIN rolundeki backoffice kullanicilari ayni islemleri `subscription` sekmesindeki
`SaaS Provisioning Merkezi` panelinden de yonetebilir.

## POS Desktop Test

```bash
npm run test --workspace @marketpos/pos-desktop
```
