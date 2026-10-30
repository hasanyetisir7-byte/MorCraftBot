# MorCraftBot

MorCraft SMP için Mineflayer botu ve korumalı yönetim API'si.

## Render dağıtımı

1. Render hesabında **New + → Blueprint** seç ve bu depoyu bağla.
2. Render, kökteki `render.yaml` dosyasını okuyarak `morcraftbot-api` servisini oluşturur.
3. `ADMIN_PASSWORD` için en az 16 karakterlik, başka yerde kullanmadığın güçlü bir parola belirle. Bu değeri yalnızca Render servisinin Environment bölümüne ekle; GitHub'a veya `index.html` dosyasına yazma.
4. Dağıtım tamamlanınca servisin `https://...onrender.com` adresini açıp `/api/health` yolunda `{"ok":true}` yanıtını doğrula.
5. GitHub Pages panelini aç, arka uç adresi alanına Render adresini yaz ve aynı yönetici parolasıyla giriş yap.

## Ortam değişkenleri

- `ADMIN_PASSWORD`: Zorunlu; en az 16 karakter.
- `ALLOWED_ORIGIN`: Varsayılan panel origin'i `https://hasanyetisir7-byte.github.io`.
- `MC_HOST`: Varsayılan `MorCraftSmp.aternos.me`.
- `MC_PORT`: Varsayılan `64006`.
- `BOT_USERNAME`: Varsayılan `MorCraftBot`.

## Önemli sınırlar

- GitHub Pages yalnızca statik paneli barındırır; botu çalıştırmaz.
- Render ücretsiz web servisleri boşta kaldığında uykuya geçebilir. Bu nedenle ücretsiz plan 7/24 kesintisiz bot garantisi vermez.
- Aternos sunucusu kapalıysa bot bağlanamaz. Bu proje Aternos'un açılma/uyku kurallarını aşmaya çalışmaz.
- Kick komutu, MorCraftBot hesabının sunucuda gerekli yetkiye sahip olmasına ve sunucunun komutu kabul etmesine bağlıdır.
- Yönetim API'si için yönetici oturumu gerekir. HTTPS kullan; parolanı paylaşma.
