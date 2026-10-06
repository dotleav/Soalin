# Peta file — kirim ke Claude cuma yang relevan

| Mau ubah / debug | Kirim file ini |
|---|---|
| Parser .docx (Bagian 1/2/3) | `js/convert.js`, `scripts/convert-docx.js` |
| Konstanta, util, suara benar/salah | `js/core.js` |
| Efek tema (P5 pedang, SxF, ransom, tema) | `js/fx.js`, `css/p5.css` / `css/sxf.css` / `css/doksli.css` |
| Stiker tema Doksli/Koceng/Capy | `js/doksli.js`, `css/doksli.css` |
| State, paket soal, Custom Quiz (IndexedDB) | `js/state.js` |
| Klik jawaban, timer, mulai/reset Tentamen | `js/handlers.js` |
| Kartu soal, soal rusak, soal isian | `js/render-cards.js` |
| Header, mode bar, Mode Latihan | `js/render-latihan.js` |
| Mode Tentamen (setup/running/hasil) | `js/render-tentamen.js` |
| Pemilih paket, pengaturan, kartu Custom Quiz | `js/render-picker.js` |
| render() utama + event listener + boot | `js/main.js` |
| Warna/token dasar, tema terang, komponen | `css/base.css`, `css/components.css` |

Urutan load di `index.html` wajib sama: semua `js/*.js` skrip klasik (bukan module), saling berbagi variabel global.
Gambar/font hasil ekstrak: `images/ui/`, `images/doksli/`, `fonts/`.
