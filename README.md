# İşletmem Muhasebe · 0.2.0

Windows x64 için Türkçe, yerel çalışan ön muhasebe uygulaması. Cari kartı üzerinden ürünlü fatura, tahsilat/ödeme, hesap ekstresi ve stok takibi.

## İndirme ve güncelleme

[Son Windows kurulum paketini indirin](https://github.com/duruarven/muhasebe/releases/latest). `Isletmem-Muhasebe-Setup.exe` dosyasını çalıştırın. Paket kod imzalı değildir.

0.1.0 sürümünden güncelliyorsanız önce **Verilerimi yedekle** ile yedek alın ve uygulamayı tamamen kapatın. Aynı Windows hesabı altında güncelleyin. Uygulama kimliği ve veri konumu değişmedi. İlk açılışta eski dosya `.v1-backup` olarak korunur, ardından ürün modülü eklenir. Mevcut faturalar ve kasa hareketleri aynen kalır. Eski sürüme dönmeniz gerekirse uygulama kapalıyken v1 yedeğini geri yükleyin; yeni sürümde eklediğiniz hareketler bu eski yedekte bulunmaz.

Eski toplam tutarlı faturalar cariye yansır ancak ürün satırları olmadığı için stok oluşturmaz. Önceki sürümde kasa hareketleri cariye bağlı değildi: **Tahsilat & ödeme → Düzenle** ile mevcut hareketi doğru cari ve faturaya bağlayın. Aynı tahsilatı tekrar eklemek kasa bakiyesini iki kez artırır.

## Cari üzerinden çalışma

1. **Kasa & banka → Yeni hesap**: nakit veya banka hesabınızı açın.
2. **Cari hesaplar → Yeni cari**: müşteri, tedarikçi veya her ikisi türünde kart açın. Cari kodu, vergi bilgileri, telefon, adres ve isteğe bağlı devir bakiyesi girilebilir.
3. Cari adına tıklayın. **Hesap ekstresi**, **Faturalar**, **Tahsilat & ödeme** ve **Cari bilgileri** sekmeleri açılır.
4. **Ürün kartı** ile ürün kodu, birim, KDV hariç alış/satış fiyatları, KDV oranı ve açılış stoğunu girin.
5. **Satış faturası / Alış faturası** ile ürün seçin; miktar, birim fiyat, iskonto ve KDV girin. Birden çok satır eklenebilir. Vade tarihi ve fatura numarası kaydedilir.
6. Fatura kaydında cari bakiye ve stok birlikte güncellenir. Fatura nakit hareketi değildir.
7. **Tahsilat al / Ödeme yap** ile kasa/banka hesabını seçin. İsterseniz ilgili faturayı seçerek kısmi veya tam ödeme girin. Fatura detayı içindeki düğme ilişkili faturayı otomatik seçer.
8. Ekstrede borç, alacak ve işlem sonrası bakiye görünür. Fatura detayı ve cari ekstresi için yazdırma düğmesi vardır.

### Hesaplama kuralları

- Pozitif cari net bakiyesi işletmenizin alacağıdır. Negatif net bakiye işletmenizin borcudur.
- Satış faturası ve cariye ödeme borç sütununa; alış faturası ve cariden tahsilat alacak sütununa yazılır.
- Açılış/devir bakiyesi kasayı etkilemez. Eski faturaları tekrar devir bakiyesine eklemeyin.
- Faturasız avanslar cari net bakiyesine girer; belirli bir faturanın kalanından otomatik düşmez. Hareketi düzenleyerek faturaya bağlayabilirsiniz.
- Kalan tutar yalnızca faturaya bağlı ödemelerden hesaplanır. Fazla veya yanlış cariye/yöne bağlı fatura ödemesi reddedilir.
- Miktar üç, fiyat ve oranlar iki ondalık basamak destekler. Her satırda brüt tutar, iskonto ve KDV kuruşa yuvarlanır. Toplamlar sunucuda yeniden hesaplanır.
- Stok = açılış + alış faturası miktarları − satış faturası miktarları. Negatif stok girişine izin verilir ve kırmızı gösterilir.
- Ürün kartının fiyatı veya adı değişse de önceki fatura satırları korunur. Hareketi olan ürünün birimi değiştirilemez.
- Bağlı hareketi olan cari/hesap/ürün ve bağlı ödemesi olan fatura silinemez. Hatalı faturayı düzeltmek için önce bağlı ödemeleri kaldırın, sonra faturayı silip doğru kaydı oluşturun. Silme stok ve bakiyeleri geri alır.

## Veri ve yedek

Veriler Electron `userData` klasöründeki `muhasebe.json` dosyasındadır. Windows'ta genellikle `%APPDATA%\isletmem-muhasebe` veya `%APPDATA%\İşletmem Muhasebe` altındadır; Electron paketinin uygulama adına göre değişebilir. Dosya JSON biçimindedir ve şifreli değildir. Düzenli olarak farklı diske yedek alın.

Yedeği geri almak için uygulamayı tamamen kapatın, mevcut dosyayı ayrıca koruyun ve uyumlu yedek dosyasını aynı klasöre `muhasebe.json` adıyla kopyalayın. Uygulama açıkken veri dosyasını değiştirmeyin.

## Geliştirme ve test

Node.js 22/24 ve npm gerekir. Mevcut checkout'u kullanın; yeni worktree gerekmez.

```sh
npm ci
node node_modules/electron/install.js
npm test
npm start
```

Electron paketinin bu sürümünde ikili dosya kurulumu ayrı komutla yapılır. Grafik masaüstü ve Electron sandbox desteği gerekir. Bulut Linux ortamında pencere açılışı doğrulanmamıştır.

Arayüz testi gerçek Store ile tarayıcı köprüsü üzerinden:

```sh
npx playwright-core install chromium
npm run test:ui
```

Yüklü Chromium kullanmak için `UI_BROWSER_PATH` verilebilir. Linux bulutta `UI_BROWSER_PATH=/usr/bin/chromium npm run test:ui` kullanıldı. Gerçek Electron ana süreci ve preload/IPC ile masaüstü testi:

```sh
npm run test:desktop
```

Bu testler geçici veri klasörü kullanır; kullanıcı verilerine yazmaz. Fiziksel yazıcı ve dosya seçme iletişim kutusu test edilmez.

Windows kurulum dosyası:

```sh
npm run dist:win -- --publish never
```

main dalına gönderim, GitHub Actions üzerinde Windows hesaplama ve masaüstü testlerini, paketlemeyi ve Releases yayımını başlatır. Kurulum dosyası `dist/Isletmem-Muhasebe-Setup.exe` adıyla yayımlanır.

## Kapsam

Bu uygulama iç takip içindir. Resmi e-Fatura/e-Arşiv gönderimi, e-Defter, beyanname, banka entegrasyonu, iade/irsaliye, dövizli işlem, maliyet muhasebesi, çoklu kullanıcı ve ağ üzerinden veri paylaşımı içermez. KTS Pro ile bağlantılı değildir; cari merkezli bir çalışma akışı sunar.
