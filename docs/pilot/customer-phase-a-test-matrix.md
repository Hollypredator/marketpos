# Customer Side - Phase A Test Matrix

Bu matris A fazinin musteri tarafi kabul testlerini tek listede toplar.

## A2 - Gunluk Operasyon

| Senaryo | Beklenen |
|---|---|
| Barkod bulunamadi | "Barkod bulunamadi" uyarisi gorulur, satis bozulmaz |
| Baglanti kesik satis | Satis kuyruga alinur, UI kilitlenmez |
| Odeme sonrasi yazici kapali | Satis kaydedilir, donanim uyarisi + operator adimi gorulur |
| Iade (online) | Fis bulunur, secilen kalem iadesi kuyruga alinur |
| Gun sonu kasa kapama | Kapanis bakiyesi ile oturum kapanir, operator bilgilendirilir |

## A3 - Offline ve Lisans Guvenligi

| Senaryo | Beklenen |
|---|---|
| Offline sure doldu | Tam kilit ekrani acilir, online login zorunlu olur |
| Cihaz saati geri alindi | Guvenlik kilidi acilir, offline erisim durur |
| SUSPENDED firma | Login ve korumali islem bloklanir, paket mesaji gosterilir |
| Unsuspend sonrasi online login | Erisim geri gelir, operasyon devam eder |

## A4 - Donanim ve Operasyonel Hazirlik

| Senaryo | Beklenen |
|---|---|
| LAN_FAST profil uygulama | Hedef/timeout/pulse degerleri profile gore dolar |
| USB_WINDOWS profil uygulama | USB mod + yazici adi profile gore dolar |
| Test fisi | Basariliysa adim tamamlanir, hatada adim kilitli kalir |
| Cekmece testi | Basariliysa adim tamamlanir, hatada operator adimi gosterilir |
| Son fis tekrar basim | Kayit varsa tekrar basim calisir, yoksa anlamli hata doner |

## A5 - Faz Cikis Kriterleri

- [ ] Tek kasa kurulum suresi <= 30 dakika
- [ ] 1 gunluk karisik online/offline pilot tamamlandi
- [ ] Kritik P0/P1 bug sayisi 0
- [ ] Kurulum + operasyon + ariza runbook son revizyonu yayinlandi

