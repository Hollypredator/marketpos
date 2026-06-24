# MarketPOS API Pilot Deployment

Bu klasor tek sube pilot icin merkezi VPS uzerinde Docker tabanli calistirma setini icerir.

## 1) Hazirlik

1. `packages/api-server/deploy/.env.pilot.example` dosyasini `.env.pilot` olarak kopyalayin.
2. `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET` degerlerini guvenli degerlerle degistirin.
3. Gerekirse `MARKETPOS_OFFLINE_ACCESS_GRACE_DAYS` ile offline paket grace gununu ayarlayin (onerilen: `7`).
4. VPS uzerinde `docker` ve `docker compose` kurulu oldugundan emin olun.

## 2) Servisleri Baslatma

```bash
cd packages/api-server/deploy
docker compose -f docker-compose.pilot.yml --env-file .env.pilot up -d --build
```

## 3) Veritabani Migration

API container ayaga kalktikten sonra migration uygulayin:

```bash
docker exec -it marketpos-api npx prisma migrate deploy
```

Schema veya migration degisikligi olan release'lerde deploy oncesi su kontroller zorunludur:

```bash
npm run prisma:validate
npm run prisma:migration:check
```

## 4) Operasyon Standartlari

- Healthcheck: `http://<server-ip>:3001/health`
- Log rotasyonu: `json-file` driver ile `max-size=20m`, `max-file=10`
- Gunluk yedek: `db-backup` servisi her 24 saatte bir `./backups` altina gzip SQL dump alir
- Retention: `BACKUP_RETENTION_DAYS` (varsayilan 7 gun)

## 5) Geri Alma / Rollback

1. Servisleri durdurun:
   - `docker compose -f docker-compose.pilot.yml down`
2. Bir onceki image tag'i ile API'yi yeniden baslatin.
3. Gerekirse hedef backup dosyasini restore edin:

```bash
gunzip -c ./backups/marketpos-YYYYMMDD-HHMMSS.sql.gz | \
docker exec -i marketpos-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```
