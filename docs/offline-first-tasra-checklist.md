# MARKETPOS Tasra Modu (Offline-First) Checklist

Bu belge, interneti zayif veya kesintili isletmelerde sistemin guvenli sekilde calismasi icin teknik ve operasyonel kontrol listesidir.

## 1) Zorunlu Ilke

- [x] Merkez sistem online PostgreSQL, kasa cihazlari offline/local SQLite ile calisir.
- [ ] Satis, iade, vardiya, kasa hareketi internetsiz calisir.
- [ ] Yerel kuyruktaki hicbir kayit internet kesintisinde kaybolmaz.
- [ ] Internet geri geldiginde manuel islem olmadan otomatik senkron baslar.
- [ ] Kullaniciya anlik durum net gosterilir: `Cevrimdisi`, `Kuyruk`, `Son Senkron`.

## 2) Uygulama Davranisi

- [x] Online login basarisiz olursa offline fallback denenir.
- [x] Satis/iade once yerel kuyruga yazilir, sonra sync denenir.
- [x] Sync hatasinda kayit `FAILED/PENDING` olarak kalir, kayit silinmez.
- [x] Manuel sync butonu mevcut.
- [x] Periyodik sessiz sync mevcut.
- [x] Periyodik sync, sadece online durumuna bagli olmadan `accessToken` varsa denenecek sekilde guncellendi.

## 3) Veri Butunlugu

- [x] Satis payload'inda satir indirimi/ikram/sepet indirimi hesaba katilir.
- [x] Kuyruk push asamasinda `clientRequestId` yoksa `localId` ile otomatik tamamlanir.
- [x] Kuyruk push asamasinda gecersiz `registerId/sessionId` degeleri aktif oturum degerleri ile iyilestirilir.
- [x] API tarafinda satis/iade (`clientRequestId`) ve stok hareketi (`branchId + clientRequestId`) replay korumasi aktif.
- [x] API tarafinda urun olusturma retry'si icin sabit `id` replay korumasi aktif.
- [x] Sunucu toplam aktif urun sayisi ile local cache sayisi uyusmazsa otomatik tam katalog senkronu uygulanir.
- [ ] Senkron catismasi kurallari belgelenip testle garanti altina alinsin.

## 4) Operasyon ve Sahadaki Kullanim

- [ ] Ilk kurulum adiminda "Offline Hazirlik Testi" ekrani olsun:
  - [ ] internet yokken giris testi
  - [ ] test satisi olusturma
  - [ ] kuyrukta kayit goruntuleme
  - [ ] internet gelince otomatik sync dogrulamasi
- [ ] Kasiyer ekraninda kalici mini durum cubugu:
  - [ ] baglanti durumu
  - [ ] bekleyen satis/iade adedi
  - [ ] son basarili sync zamani
- [ ] Sirket icin minimum operasyon proseduru:
  - [ ] Gun basi: 1 kez baglanti ve sync kontrolu
  - [ ] Gun ici: kuyruk adedi > esikse yonetici uyarisi
  - [ ] Gun sonu: kuyruk sifir degilse raporla kapanis

## 5) Dayaniklilik

- [x] Yerel DB yedegi zamanlayiciyla otomatik alinmali.
- [x] SQLite bozulmasinda otomatik yedekten donus + checkpoint sifirlama ile tam sync'e hazirlama aktif.
- [ ] Bozuk kuyruk satiri oldugunda diger satirlarin sync'i devam etmeli.
- [ ] Saat geri alma / cihaz saati oynama tespitinde guvenli blok + acik operator mesaji.
- [ ] Elektrik kesintisi senaryosunda yarim kalan islemler icin recover testi.

## 6) Test Paketi (Mutlaka)

- [ ] 24 saat internet yokken ard arda satis/iade stresi.
- [ ] 5.000+ kuyruk kaydinda performans.
- [ ] Agin sik gidip geldigi durumda duplicate/eksik kayit testi.
- [ ] Farkli cihaz saatleri ile paket erisim ve offline pencere testi.
- [ ] "Offline login + internet geri gelişi + otomatik sync" uc uca test.

## 7) Kisa Yol Haritasi

1. Sprint 1: veri butunlugu + idempotency + saha paneli
2. Sprint 2: setup offline testi + operasyon kurallari + alarm mekanizmasi
3. Sprint 3: yuk testleri + kaos testleri + saha pilot olcumleri
