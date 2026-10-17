# İnternetten kullanım — 0.6.0

Telefon ve bilgisayar, ortak sunucudaki aynı muhasebe uygulamasına tarayıcıyla giriş yapar. Bilgisayarı kapattığında sunucu çalışmaya devam eder. Aynı Wi-Fi gerektirmez. Bu sürüm kurulum dosyasının yanında bağımsız bir Node web sunucusu içerir; mevcut Windows verileri kendiliğinden internete yüklenmez.

## Mevcut sunucun yoksa: Render kurulumu

[Render hesabında kurulumu başlat](https://render.com/deploy?repo=https://github.com/duruarven/muhasebe)

1. Bir Render hesabı oluştur ve bağlantıyı aç. GitHub deposunu bağlamanı isterse `duruarven/muhasebe` deposunu seç.
2. Blueprint ekranında `isletmem-muhasebe` servisini ve kalıcı diskini incele. `starter` servis ve 1 GB disk **ücretlidir**; sağlayıcının gösterdiği tutarı onaylamadan ödeme başlatma. Bu dosya hiçbir hesabı otomatik olarak ücretlendirmez.
3. Kurulumu başlat. `render.yaml` Node 24, başlatma komutu, HTTPS kontrolü, kalıcı veri dizini ve rastgele giriş şifresini tanımlar.
4. Servis hazır olunca Render'ın verdiği `https://…onrender.com` adresini aç. **Environment** bölümündeki `APP_PASSWORD` değerini kendi hesabında görüntüle ve giriş yap. Bu şifreyi sohbete veya GitHub'a yazma. Kendi şifrenle değiştireceksen en az 16 karakter kullan; servis yeniden başlatılır ve oturumlar kapanır.
5. Aynı adresi telefonunda ve bilgisayarında aç. Telefonun tarayıcı menüsünden ana ekrana kısayol ekleyebilirsin.

Bu çalışma alanına bağlı bir Render hesabı bulunmadığından canlı servis oluşturulmadı. Yukarıdaki bağlantı, senin hesabında hazır yapılandırmayla kurulumu başlatır. Gerçek `.onrender.com` adresi dağıtımdan sonra Render tarafından verilir.

Özel alan adı eklersen `APP_ORIGIN` değişkenini o HTTPS adresi olarak ayarla. `APP_ORIGIN` yoksa Render'ın `RENDER_EXTERNAL_URL` değeri kullanılır. Adresin sonuna sayfa yolu ekleme. HTTPS'yi Render sağlar.

## Mevcut Windows kayıtlarını aktarma

1. Windows programındaki **Verilerimi yedekle** ile JSON yedeğini bilgisayarına kaydet.
2. Yeni internet adresine bilgisayardan giriş yap; **Dosya → Masaüstü yedeğini aktar (boş sistem)** seç ve yedeği aç.
3. Cari ve hesap bakiyelerini kontrol et. Aktarım mevcut kimlikleri, faturaları, tahsilatları ve kuruş tutarlarını korur; toplamları yeniden hesaplayıp değiştirmez.
4. Bundan sonra ortak işlemler için bilgisayarda da aynı internet adresini kullan. Eski Windows uygulamasındaki yerel dosya ile sunucu arasında otomatik çift yönlü eşitleme yoktur.

Aktarım yalnızca boş sisteme yapılabilir; dolu sistemin üzerine yazılmaz. Hatalı bağlantılar, tutarlar ve fatura toplamları reddedilir. Web aktarım sınırı 15 MB'tır. Daha büyük yedek için sunucuyu durdurup doğrulanmış JSON dosyasını kalıcı dizine yönetici olarak taşı; mevcut dosyayı önce dışarıya yedekle.

## Kalıcı kayıtlar ve yedekler

`DATA_DIR` kalıcı diskte olmalıdır. Sunucu uygulama dizinine veya geçici diske yazmaz. Tek Node süreci ve tek sunucu örneği kullanılır; aynı JSON dosyasına birden fazla süreç bağlanmamalıdır. Render'ın diskli servisini çoğaltma veya çok süreçli cluster başlatma.

Sunucu başlangıçta ve saatlik kontrol sırasında, o güne ait ilk mevcut veri dosyasını `DATA_DIR/backups` içine kopyalar. Son 14 günlük kopya saklanır. Bunlar aynı disktedir; diskin tamamen kaybolmasına karşı bağımsız yedek sayılmaz. Düzenli olarak uygulamadaki **Verileri yedekle** ile kendi cihazına da indir. Servisi silerken kalıcı diski de silmek kayıtları kaldırır.

Oturumlar 8 saat geçerlidir; sunucu yeniden başlayınca tekrar giriş gerekir. Giriş denemeleri bağlantı adresi başına dakikada 10 ile sınırlıdır. HTTPS girişinde Secure, HttpOnly, SameSite=Strict ve `__Host-` kapsamlı çerez kullanılır. Yazma istekleri yalnızca yapılandırılmış site adresinden kabul edilir. Uygulama tek işletmenin sahibi için tek şifre kullanır; ayrı personel rolleri ve değişiklik denetim günlüğü içermez.

## Kendi VPS sunucunda

Docker Compose ve alan adı A/AAAA kaydı hazır olduğunda:

```sh
cp deploy/.env.example deploy/.env
# deploy/.env içinde alan adını ve en az 16 karakterlik benzersiz şifreyi düzenle.
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

80 ve 443 portları Caddy'ye aittir; Caddy HTTPS sertifikasını otomatik alır. Uygulamanın 3000 portu internete yayımlanmaz. `accounting` adlı Docker volume verileri korur; `down -v` bu volume'u siler. Veri klasörü UID 1000 kullanıcısına yazılabilir olmalıdır. VPS/Docker seçeneği bu çalışma alanında çalıştırılmadı; otomatik testler Node sunucusunu gerçek bir yerel HTTPS ters vekili arkasında doğrular.

## Doğrulama

`npm test`: şifre/origin doğrulaması, iki ayrı oturumun ortak bakiyesi, yeniden başlatmada kalıcı kayıtlar, yedek aktarımı ve muhasebe hesapları.

`UI_BROWSER_PATH=/usr/bin/chromium npm run test:hosted`: geçici test sertifikasıyla gerçek HTTPS girişleri; ayrı bilgisayar ve telefon tarayıcı oturumları; masaüstü yedeği aktarımı; telefondan tahsilatın bilgisayarda görünmesi; bilgisayar tarayıcısı kapandıktan sonra telefonda işlem; sunucu yeniden başladıktan sonra kayıtların korunması. Test sertifikası yalnızca testte kullanılır; gerçek dağıtımda geçerli HTTPS sertifikası gerekir.
