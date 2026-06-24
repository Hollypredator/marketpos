# Sync Conflict Rules (Deterministic)

## 1) Idempotency
- Sales ve refunds isteklerinde `clientRequestId` zorunludur.
- Ayni `companyId + clientRequestId` tekrar gelirse yeni kayit acilmaz; mevcut kayit dondurulur.

## 2) Queue Durumlari
- `PENDING`: Henüz push denenmedi.
- `FAILED`: Push denendi, hata alindi.
- `SYNCED`: Cloud kabul etti.

## 3) Catisma Cozumu
- Duplicate push: `200` ve mevcut kayit ile deterministic cevap.
- Gecersiz payload: `400`, local kayit `FAILED` kalir.
- Gecici ag hatasi: local kayit silinmez, tekrar deneme periyodik sync ile yapilir.

## 4) Operator Eylemi
- `FAILED` kayitlar operasyon ekraninda goruntulenir.
- Manuel sync tetiklenebilir.
- `FAILED` kayitlar sifirlanmadan gun sonu raporuna not dusulur.

## 5) Kabul Kriteri
- Ayni idempotency key ile tekrar gonderimde duplicate kayit olusmaz.
- Ag gidip gelme senaryosunda eksik/sapma kayit olmaz.
