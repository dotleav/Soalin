# Soalin

Quiz app statis untuk belajar dengan soal custom.

## Pakai

- **Kuis dari file sendiri:** seret file `.docx` atau `.pdf` ke app (atau pilih lewat tombol). File dikonversi di browser, termasuk gambarnya, lalu disimpan sebagai kuis custom di browser (IndexedDB).

## Format soal di file

- Soal normal (Bagian 1): `1. Pertanyaan`, lalu opsi `A.` sampai `E.` dengan penjelasan di dalam `{...}`, lalu `Kunci: X`. Gambar ditaruh di paragraf sendiri.
- Soal rusak (Bagian 2): tabel dengan kolom `No | Soal Asli | Penjelasan`, setelah heading "Bagian 2" atau "Gagal Diperbaiki".
- Soal isian (Bagian 3): tabel dengan kolom `No | Soal | Jawaban`, setelah heading "Bagian 3" atau "Soal Isian".
- Paragraf yang di-highlight dianggap kunci jawaban, kalau tidak ada baris `Kunci:`.

## Pengembangan

- `npm install` hanya diperlukan untuk `npm run audio-manifest`.
- Setiap kali mengubah file, naikkan nama cache di `sw.js` supaya browser mengambil versi baru.
