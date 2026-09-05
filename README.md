# Soalin

Quiz app statis buat belajar dari soal-soal ujian. Intinya: kamu punya file Word berisi bank soal/soal tahun lalu, jalankan satu perintah, langsung jadi quiz interaktif yang bisa dibuka di browser — atau di-host di GitHub Pages biar bisa diakses dari HP juga.

Tidak butuh server, tidak butuh build step, tidak butuh internet waktu dipakai.

## Cara kerja sekilas

File `.docx` kamu dibaca oleh `scripts/convert-docx.js`, yang mengekstrak teks soal dan gambar-gambarnya lalu menyusunnya jadi `data/questions.js`. File itu yang kemudian dibaca langsung oleh `index.html` di browser.

```
file.docx  →  [convert-docx.js]  →  data/questions.js  +  images/
                                                               ↓
                                                         index.html  →  browser
```

## Mulai pakai

```bash
npm install
npm run convert -- path/ke/file-soal.docx
# buka index.html di browser
```

Kalau mau langsung edit soalnya manual tanpa docx, buka `data/questions.js` dan edit array-nya. Gambar taruh di folder `images/`, isi path-nya di field `questionImages` / `explanationImages`.

## Kategori & paket soal (opsional)

Kalau kamu punya banyak file docx (misalnya per blok kuliah, per topik, dsb.) dan mau bisa milih-milih paket soal mana yang mau dikerjakan langsung dari app, kasih argumen kategori & nama paket saat convert:

```bash
npm run convert -- path/ke/file-soal.docx "Blok 2E" "Neuro Batch 1"
```

- Argumen ke-3 = **kategori** (contoh: nama blok).
- Argumen ke-4 = **nama paket** (opsional — kalau dikosongkan, dipakai nama file docx-nya).

Tiap kali dijalankan dengan kategori, script akan:
1. Menulis soal & gambar paket itu ke folder sendiri: `data/packages/<id>/questions.js` dan `images/packages/<id>/`, terpisah dari paket lain.
2. Mendaftarkan (atau meng-update kalau sudah ada) paket itu ke `data/manifest.js` — file ini yang dibaca app untuk menampilkan daftar kategori & paket.

Kalau argumen kategori **tidak** diisi, convert tetap jalan seperti biasa (mode lama): langsung ke `data/questions.js` + `images/` di root, tanpa manifest. Dua mode ini bisa dipakai bergantian; app otomatis pakai mode paket kalau `data/manifest.js` ada isinya, dan fallback ke mode lama kalau tidak ada paket terdaftar sama sekali.

Di app, kalau ada lebih dari satu paket terdaftar, akan muncul tombol **"Pilih paket soal"** / **"Ganti paket"** di header. Tekan tombol itu untuk membuka daftar kategori (bisa di-expand), lalu pilih paket soal yang mau dikerjakan. Progres Mode Latihan disimpan terpisah per paket, jadi jawaban di satu paket tidak akan tercampur dengan paket lain.

<<<<<<< HEAD
Pengguna Windows yang pakai `soalin.bat`/`convert.ps1` (GUI) juga bisa isi kolom "Kategori" & "Nama paket" di jendela konversi — kosongkan kalau mau pakai mode lama. Kolom Kategori sekarang berupa dropdown yang bisa memilih kategori yang sudah ada (biar tidak ke-split gara-gara typo/beda kapital) atau ketik nama baru. Tab "Kelola Paket" juga punya tombol ganti nama kategori dan ganti nama paket, selain hapus paket.
=======
Pengguna Windows yang pakai `convert.bat`/`convert.ps1` (GUI) juga bisa isi kolom "Kategori" & "Nama paket" di jendela konversi — kosongkan kalau mau pakai mode lama.
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887

## Format docx

Parser membaca dua bagian dalam satu file docx: soal normal (Bagian 1) dan soal rusak (Bagian 2).

### Bagian 1 — soal MCQ normal

Tulis soal dengan pola ini di Word:

```
1. Pertanyaan soal di sini.
[gambar soal kalau ada, langsung di paragraf sebelum opsi A]
A. Opsi A
B. Opsi B
C. Opsi C
D. Opsi D
E. Opsi E
Kunci: C
Penjelasan: Teks penjelasan di sini.
[gambar penjelasan kalau ada]

2. Soal berikutnya...
```

Beberapa hal yang perlu diperhatikan:

- Nomor soal harus diawali angka + titik atau kurung (`1.` atau `1)`). Ini yang jadi penanda soal baru.
- Opsi cukup `A.` sampai `E.`, titik atau kurung tutup boleh.
- Kunci jawaban ditulis `Kunci: X` atau `Jawaban: X`.
- Penjelasan ditulis `Penjelasan: ...` — semua paragraf setelahnya sampai ketemu nomor soal berikutnya dianggap masih bagian penjelasan.
- Gambar diletakkan di posisi yang kamu mau: sebelum opsi A → gambar soal, sesudah baris Penjelasan → gambar penjelasan.
- Kalau mau kasih ID custom (bukan Q1, Q2, ...), tulis `ID: nama-id` tepat sebelum nomor soal.
- Kategori bisa pakai Heading Style di Word (Heading 1/2/3) untuk judul bab, atau tulis manual `Kategori: nama kategori` tepat sebelum nomor soal.

### Bagian 2 — soal rusak

Kalau ada soal yang teksnya tidak lengkap/rusak dan tidak bisa dijadikan MCQ, masukkan ke Bagian 2 dalam format tabel tiga kolom:

| No | Soal Asli (dari rekapan) | Gambar Penjelasan |
|----|--------------------------|-------------------|
| 9  | Soal tentang gagal ginjal pra renal | _(taruh gambar di sini)_ |

Bagian ini ditandai dengan heading `## Bagian 2` atau `## Soal yang Gagal Diperbaiki` di atas tabelnya.

Di app, soal rusak tidak masuk ke quiz — melainkan muncul sebagai kartu tap-to-reveal di Mode Latihan. Tekan kartunya, gambar penjelasan dari kolom ketiga akan muncul. Tekan lagi untuk tutup. Ini biar kamu tetap bisa belajar dari soal-soal itu meskipun tidak bisa dijawab secara formal.

## Mode di app

Ada dua mode yang bisa dipilih dari mode bar.

**Mode Latihan** — semua soal tampil sekaligus dalam satu scroll. Pilih opsi, langsung ketahuan benar/salah + muncul penjelasannya. Progres disimpan otomatis ke localStorage jadi tidak hilang kalau tab ditutup atau di-refresh. Soal dimuat 15 per batch supaya tidak lag kalau soalnya banyak.

**Mode Tentamen** — simulasi ujian: satu soal per layar, ada timer, baru bisa lanjut setelah menjawab atau waktu habis. Progres tidak disimpan (kalau reload di tengah jalan, reset dari awal). Di akhir ada halaman hasil dengan skor dan review per soal.

Tingkat kesulitan Mode Tentamen mengatur durasi timer per soal:

| | Timer |
|--|--|
| 🐆 Cheetah | 30 detik |
| 🧍 Orang Normal | 60 detik |
| 🦥 Folivora | 5 menit |
| 🐌 Bekicot | tanpa timer |

Soal rusak (Bagian 2) tidak ikut masuk ke Mode Tentamen.

## Deploy ke GitHub Pages

```bash
git init
git add .
git commit -m "init"
git remote add origin <url-repo>
git push -u origin main
```

Aktifkan di Settings → Pages → branch `main` / root. Setelah itu quiz bisa diakses lewat link langsung dari HP atau dibagikan ke teman.

## Struktur folder

```
├── index.html
├── benar.mp3 / salah.mp3
├── data/
│   ├── questions.js       # mode lama (tanpa kategori)
│   ├── manifest.js        # daftar paket, dibuat otomatis kalau pakai kategori
│   └── packages/
│       └── <id>/questions.js
├── images/
│   ├── ...                # gambar mode lama
│   └── packages/
│       └── <id>/...
├── scripts/
│   └── convert-docx.js
└── package.json
```
