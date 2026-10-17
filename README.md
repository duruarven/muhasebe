# İşletmem Muhasebe

Windows için Türkçe, çevrimdışı ön muhasebe uygulamasının ilk sürümü. Gelir/gider, müşteri/tedarikçi, kasa/banka, fatura kayıtları ve JSON yedek dışa aktarımı içerir. Tutarlar tam sayı kuruş olarak saklanır.

## Geliştirme

Node.js 22 veya 24 ve npm gerekir. Mevcut checkout'u kullanın; yeni worktree gerekmez.

```sh
npm ci
npm test
npm start
```

## Windows kurulum dosyası

Windows bilgisayarda:

```sh
npm ci
npm run dist:win
```

`dist` içindeki Setup `.exe` dosyasını çalıştırın. İlk sürüm kod imzalı değildir. Linux'tan Windows paketlemesi ek Wine araçları gerektirebilir; Windows üzerinde paketleme önerilir.

## Kullanım

1. Kasa & banka bölümünden hesap ekleyin.
2. Gelir & gider bölümünde tahsilat ve ödeme kaydedin. Açılış bakiyesi için açıklaması açıkça belirtilmiş gelir/gider kaydı girilebilir; rapor toplamlarını da etkiler.
3. Müşteri & tedarikçi bölümünden cari ekleyin.
4. Fatura kayıtları bölümünde satış için müşteri, alış için tedarikçi seçin. Tutar vergiler dahil toplamdır.
5. Düzenli olarak Yedek al düğmesiyle farklı bir diske yedek kaydedin.

Veriler Electron userData klasöründeki `muhasebe.json` dosyasındadır; Windows'ta varsayılan olarak `%APPDATA%\isletmem-muhasebe\muhasebe.json`. Yedeği geri almak için uygulamayı tamamen kapatın, mevcut veri dosyasını ayrıca koruyun ve aynı biçimdeki yedek dosyasını `muhasebe.json` adıyla yerine kopyalayın. Uygulama açıkken veri dosyasını değiştirmeyin. Dosya şifreli değildir; bilgisayar hesabınızın ve yedeklerinizin erişimini koruyun.

## İlk sürümün kapsamı

Fatura kayıtları resmi e-Fatura/e-Arşiv oluşturmaz veya göndermez. Faturalar nakit hareketlerini otomatik etkilemez; tahsilat/ödemeler ayrıca girilir. Cari borç/alacak mutabakatı, stok, KDV hesaplaması, çoklu kullanıcı, banka entegrasyonu ve resmi muhasebe beyannameleri bu sürümde yoktur. Gerçek verilerle kullanmadan önce örnek kayıtlarla iş akışınızı doğrulayın.

### Hazır ZIP paketi ve otomatik derleme

Bulut ortamındaki `dist/İşletmem Muhasebe-0.1.0-win.zip` paketi Windows x64 içindir. ZIP'in tamamını bir klasöre çıkarın ve içindeki `İşletmem Muhasebe.exe` dosyasını çalıştırın; EXE'yi yanındaki dosyalardan ayırmayın. ZIP sürümü kurulum sihirbazı içermez; verileri yine AppData altında tutar.

GitHub'a kod aktarıldıktan sonra Actions → Windows kurulum paketi → Run workflow ile Windows makinede Setup EXE üretilebilir. main dalına gönderilen değişiklikler Windows derlemesini otomatik başlatır; başarılı derleme kurulum dosyasını GitHub Releases sayfasında yayımlar. Bulut Linux ortamında NSIS kurulum paketi Wine bulunmadığı için tamamlanmamıştır; Windows'ta gerçek açılış/kurulum kontrolü yapılmalıdır.
