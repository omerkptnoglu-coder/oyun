# Düşmüş Işık — Bölüm I: Uyanış

Tarayıcıda çalışan izometrik, piksel-art aksiyon RPG (Diablo tarzı). PC ve mobilde oynanır.
Oynamak için `index.html` dosyasını tarayıcıda aç (ya da klasörde `python3 -m http.server` çalıştırıp `http://localhost:8000` adresine git).

## Bölümler
1. **Prolog (platform):** Yağmurlu bir gecede kahraman ve arkadaşı Arin mağaraya sığınır. Engeller, çukur, nehir ve kayalıklar; mağarada kahramanın bebekliğiyle karşılaşma.
2. **Bölüm I (izometrik):** Gökten düşüş, Kül Krateri, mezarlık, şapel ve Kanlı Bekçi.

## Kontroller
**Prolog:** A/D veya ok tuşları ile yürü, Boşluk/W ile zıpla (basılı tutarsan daha yükseğe). Mobilde joystick + ⤒ tuşu.

**İzometrik bölüm:**
| PC | Mobil |
|---|---|
| WASD / Ok tuşları: hareket | Ekranın sol yarısı: sanal joystick |
| Sol tık: kılıç (3'lü kombo) | ⚔ tuşu: kılıç (en yakın düşmana otomatik nişan) |
| Sağ tık: tabanca (8 mermi), R: şarjör | ⌖ tuşu: tabanca |
| Boşluk / Shift: kanat atılışı | ➶ tuşu: kanat atılışı |
| Esc / P: duraklat | |

## Dosyalar
- `index.html`, `style.css` — sayfa ve arayüz
- `js/game.js` — oyun motoru (harita, karakter, düşmanlar, sinematik)
- `assets/` — kapak ve diyalog portresi
- `yildiz-topla.html` — eski ilk deneme oyunu
