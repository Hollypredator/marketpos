# TODOS

## Subscription Management / Admin Portal

- [ ] **Soft Delete Database Indeksleri**
  - **Priority:** P1
  - **Description:** Prisma şemasında (`schema.prisma`) `deletedAt` kolonu bulunan tüm tablolar için `@@index([deletedAt])` eklenmesi. SQL sorgularının performansını optimize etmek ve full table scan'leri önlemek için.
  - **Deferred from plan:** [implementation_plan.md](file:///c:/Users/coban/OneDrive/Masa%C3%BCst%C3%BC/MARKETPOS/implementation_plan.md)

- [ ] **Katalog Seeding Dayanıklılığı ve Audit**
  - **Priority:** P1
  - **Description:** `DefaultCatalogService.seedForCompany` hata fırlattığında veya yarım kaldığında bunun loglanıp `CompanySubscriptionAudit` tablosuna `SYSTEM` aktörlü bir hata event'i olarak kaydedilmesi.
  - **Deferred from plan:** [implementation_plan.md](file:///c:/Users/coban/OneDrive/Masa%C3%BCst%C3%BC/MARKETPOS/implementation_plan.md)

- [ ] **Audit Log Detay Paneli (Web Dashboard)**
  - **Priority:** P1
  - **Description:** Audit Log sayfasında her bir satıra tıklandığında, o değişikliğin detaylı JSON diff'ini gösteren modern bir side-drawer panel veya akordeon görünümü eklenmesi.
  - **Deferred from plan:** [implementation_plan.md](file:///c:/Users/coban/OneDrive/Masa%C3%BCst%C3%BC/MARKETPOS/implementation_plan.md)

- [ ] **Abonelik Durum Değişikliği Bildirimleri (Webhooks)**
  - **Priority:** P1
  - **Description:** Cloud API'de bir webhook tetikleyici eklenmesi (Slack/Discord webhook URL'leri destekli). Lisans durumu `ACTIVE -> GRACE` veya `GRACE -> EXPIRED` olduğunda kanala anlık bildirim gönderilmesi.
  - **Deferred from plan:** [implementation_plan.md](file:///c:/Users/coban/OneDrive/Masa%C3%BCst%C3%BC/MARKETPOS/implementation_plan.md)

## Completed
