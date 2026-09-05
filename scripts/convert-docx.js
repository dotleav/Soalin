// scripts/convert-docx.js
// Konversi file .docx (soal + gambar) menjadi file data/questions.js
// Jalankan: node scripts/convert-docx.js path/ke/file.docx
//
// FORMAT YANG HARUS DIIKUTI DI DALAM DOCX:
//
// === BAGIAN 1 — Soal Normal ===
// (heading H2: "Bagian 1" atau di awal dokumen sebelum tabel)
//
//   1. Pertanyaan soal di sini...
//      [gambar soal taruh di sini, langsung di bawah teks soal]
//   A. Opsi A
//   B. Opsi B
//   C. Opsi C
//   D. Opsi D
//   E. Opsi E
//   Kunci: C
//   Penjelasan: Teks penjelasan...
//      [gambar penjelasan taruh di sini]
//
// === BAGIAN 2 — Soal Rusak ===
// (heading H2: "Bagian 2" atau mengandung "Gagal Diperbaiki")
// Berupa tabel dengan 3 kolom:
//   | No | Soal Asli (dari rekapan) | Gambar Penjelasan |
//
// Soal rusak di-output sebagai { isBroken: true } — di app ditampilkan
// sebagai kartu tap-to-reveal (tekan kartu → gambar penjelasan muncul).
//
// ID soal akan dibuat otomatis (Q1, Q2, ...) kecuali kamu menulis baris
// "ID: namaID" tepat sebelum nomor soal.

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import mammoth from "mammoth";

const docxPath = process.argv[2];
if (!docxPath) {
  console.error("Pakai: node scripts/convert-docx.js path/ke/file.docx [kategori] [judul-paket]");
  process.exit(1);
}
// Kategori & judul paket bersifat opsional. Kalau kategori tidak diisi,
// konversi jalan seperti biasa (mode lama): tulis langsung ke data/questions.js
// + images/ di root project. Kalau kategori diisi, soal disimpan sebagai
// "paket" terpisah di data/packages/<id>/questions.js + images/packages/<id>/,
// dan didaftarkan ke data/manifest.js supaya muncul di pemilih kategori di app.
const kategoriArg = (process.argv[3] || "").trim();
const paketArg = (process.argv[4] || "").trim();
const usePackageMode = kategoriArg.length > 0;

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "paket";
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const paketTitle = usePackageMode
  ? (paketArg || path.basename(docxPath, path.extname(docxPath)))
  : "";
const packageId = usePackageMode ? `${slugify(kategoriArg)}__${slugify(paketTitle)}` : "";

const imagesDir = usePackageMode
  ? path.join(projectRoot, "images", "packages", packageId)
  : path.join(projectRoot, "images");
const dataDir = usePackageMode
  ? path.join(projectRoot, "data", "packages", packageId)
  : path.join(projectRoot, "data");
const imagesUrlPrefix = usePackageMode ? `images/packages/${packageId}` : "images";
fs.mkdirSync(imagesDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

let imageCounter = 0;

// --- 1. Convert docx -> HTML, ekstrak gambar ke /images ---
const result = await mammoth.convertToHtml(
  { path: docxPath },
  {
    convertImage: mammoth.images.imgElement(async (image) => {
      imageCounter += 1;
      const ext = (image.contentType || "image/png").split("/")[1] || "png";
      const filename = `img-${String(imageCounter).padStart(3, "0")}.${ext}`;
      const buffer = await image.read("base64");
      fs.writeFileSync(path.join(imagesDir, filename), Buffer.from(buffer, "base64"));
      return { src: `${imagesUrlPrefix}/${filename}` };
    }),
  }
);

const html = result.value;
if (result.messages?.length) {
  console.log("Catatan dari mammoth:", result.messages.map((m) => m.message).join("; "));
}

// --- 2. Deteksi batas Bagian 1 vs Bagian 2 ---
// Bagian 2 ditandai dengan heading yang mengandung "Bagian 2" atau
// "Gagal Diperbaiki". Semua <table> di bawahnya dianggap tabel soal rusak.
// Jika tidak ada heading Bagian 2, seluruh dokumen diparsing sebagai Bagian 1.

const part2HeadingRegex = /bagian\s*2|gagal\s+diperbaiki/i;

// Cari index awal Bagian 2 (heading h1/h2/h3 yang cocok + tabel setelahnya)
function splitParts(html) {
  // Cari semua heading h1/h2/h3 untuk tanda batas
  const headingRe = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/gi;
  let lastPart2HeadingEnd = -1;
  let match;
  while ((match = headingRe.exec(html)) !== null) {
    const headingText = match[2].replace(/<[^>]+>/g, "").trim();
    if (part2HeadingRegex.test(headingText)) {
      lastPart2HeadingEnd = match.index;
    }
  }

  if (lastPart2HeadingEnd < 0) {
    // Tidak ada Bagian 2 — cek apakah ada <table> saja
    const tableIdx = html.indexOf("<table");
    if (tableIdx < 0) return { part1Html: html, part2Html: "" };
    // Ada tabel tapi tidak ada heading Bagian 2 — anggap semua sebelum tabel = Bagian 1
    return {
      part1Html: html.substring(0, tableIdx),
      part2Html: html.substring(tableIdx),
    };
  }

  return {
    part1Html: html.substring(0, lastPart2HeadingEnd),
    part2Html: html.substring(lastPart2HeadingEnd),
  };
}

const { part1Html, part2Html } = splitParts(html);

// --- 3. Helper: bersihkan teks dari tag HTML ---
function cleanText(fragment) {
  return fragment
    .replace(/<img[^>]*>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function extractImages(fragment) {
  return [...fragment.matchAll(/<img[^>]*src="([^"]+)"[^>]*>/g)].map((x) => x[1]);
}

// --- 4. Parse Bagian 1 — soal MCQ normal ---

// Fallback: kadang seluruh soal (pertanyaan + opsi a-e + Kunci Jawaban)
// ada dalam SATU paragraf tanpa line break (tidak ada <br>/<p> pemisah).
// Kalau begitu, opsi & kunci jawaban tidak akan pernah terdeteksi oleh
// parser baris-per-baris di bawah. Fungsi ini mendeteksi pola inline
// "... a. opsi b. opsi c. opsi d. opsi e. opsi Kunci Jawaban: X" di dalam
// satu baris teks dan memecahnya jadi { question, options, answer }.
function splitInlineQuestion(rawText) {
  let text = rawText;
  let answer = "";
  const ansMatch = text.match(/\bKunci(?:\s*Jawaban)?\s*:?\s*([A-Ea-e])\b\s*$/i);
  if (ansMatch) {
    answer = ansMatch[1].toUpperCase();
    text = text.slice(0, ansMatch.index).trim();
  }
  const optRe = /\s([A-Ea-e])[.)]\s+/g;
  const matches = [...text.matchAll(optRe)];
  // Butuh minimal 3 opsi terdeteksi dan harus mulai dari A/a supaya yakin
  // ini memang daftar opsi, bukan kebetulan (mis. singkatan "dr." di kalimat).
  if (matches.length < 3) return null;
  if (matches[0][1].toUpperCase() !== "A") return null;

  const first = matches[0];
  const questionText = text.slice(0, first.index).trim();
  const options = {};
  for (let i = 0; i < matches.length; i++) {
    const letter = matches[i][1].toUpperCase();
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    options[letter] = text.slice(start, end).trim();
  }
  return { question: questionText, options, answer };
}

function parsePart1(html) {
  // Pecah HTML jadi baris-baris token (teks/gambar)
  const blockRegex = /<(p|h1|h2|h3|ol|ul)[^>]*>([\s\S]*?)<\/\1>/g;
  const lines = [];
  let m;
  while ((m = blockRegex.exec(html)) !== null) {
    const tag = m[1];
    const inner = m[2];
    const isHeading = tag === "h1" || tag === "h2" || tag === "h3";

    if (tag === "ol" || tag === "ul") {
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/g;
      let lm;
      while ((lm = liRegex.exec(inner)) !== null) {
        const liInner = lm[1];
        const subParts = liInner.split(/<br\s*\/?>/i);
        subParts.forEach((part, idx) => {
          const imgs = extractImages(part);
          const text = cleanText(part);
          if (text || imgs.length) {
            lines.push({
              text,
              images: imgs,
              isHeading: false,
              isListItem: tag === "ol" && idx === 0,
            });
          }
        });
      }
      continue;
    }

    const subParts = inner.split(/<br\s*\/?>/i);
    subParts.forEach((part) => {
      const imgs = extractImages(part);
      const text = cleanText(part);
      if (text || imgs.length) {
        lines.push({ text, images: imgs, isHeading, isListItem: false });
      }
    });
  }

  // Parse baris jadi soal
  const questions = [];
  let current = null;
  let pendingId = null;
  let currentCategory = "";
  let mode = null; // 'question' | 'explanation' | 'options' | 'answer'

  const questionStart = /^(\d+)[.)]\s*(.*)$/;
  const idLine = /^ID\s*:\s*(.+)$/i;
  const optionLine = /^([A-Ea-e])[.)]\s*(.*)$/;
  // Terima "Kunci: X", "Jawaban: X", ATAU gabungan "Kunci Jawaban: X"
  const answerLine = /^(?:Kunci\s*Jawaban|Jawaban\s*Kunci|Kunci|Jawaban)\s*:?\s*([A-Ea-e])\b.*$/i;
  const explanationLine = /^Penjelasan\s*:?\s*(.*)$/i;
  const categoryLine = /^Kategori\s*:\s*(.+)$/i;

  function pushCurrent() {
    if (current) questions.push(current);
    current = null;
  }

  for (const line of lines) {
    const { text, images, isHeading, isListItem } = line;

    if (isHeading) {
      currentCategory = text;
      continue;
    }

    if (categoryLine.test(text)) {
      currentCategory = text.match(categoryLine)[1].trim();
      continue;
    }

    if (idLine.test(text)) {
      pendingId = text.match(idLine)[1].trim();
      continue;
    }

    if (isListItem) {
      pushCurrent();
      const autoId = pendingId || `Q${questions.length + 1}`;
      pendingId = null;
      const inline = splitInlineQuestion(text);
      current = {
        id: autoId,
        category: currentCategory,
        question: inline ? inline.question : text,
        questionImages: [...images],
        options: inline ? inline.options : {},
        answer: inline ? inline.answer : "",
        explanation: "",
        explanationImages: [],
        isBroken: false,
      };
      mode = inline ? "answer" : "question";
      continue;
    }

    const qStart = text.match(questionStart);
    if (qStart) {
      pushCurrent();
      const autoId = pendingId || `Q${questions.length + 1}`;
      pendingId = null;
      const rawQuestionText = qStart[2].trim();
      const inline = splitInlineQuestion(rawQuestionText);
      current = {
        id: autoId,
        category: currentCategory,
        question: inline ? inline.question : rawQuestionText,
        questionImages: [...images],
        options: inline ? inline.options : {},
        answer: inline ? inline.answer : "",
        explanation: "",
        explanationImages: [],
        isBroken: false,
      };
      mode = inline ? "answer" : "question";
      continue;
    }

    if (!current) continue;

    const optMatch = text.match(optionLine);
    if (optMatch) {
      current.options[optMatch[1].toUpperCase()] = optMatch[2].trim();
      current.questionImages.push(...images);
      mode = "options";
      continue;
    }

    const ansMatch = text.match(answerLine);
    if (ansMatch) {
      current.answer = ansMatch[1].toUpperCase();
      mode = "answer";
      continue;
    }

    const expMatch = text.match(explanationLine);
    if (expMatch) {
      current.explanation = expMatch[1].trim();
      current.explanationImages.push(...images);
      mode = "explanation";
      continue;
    }

    if (mode === "question") {
      current.question += (current.question ? " " : "") + text;
      current.questionImages.push(...images);
    } else if (mode === "explanation") {
      current.explanation += (current.explanation ? " " : "") + text;
      current.explanationImages.push(...images);
    } else if (mode === "options" && images.length) {
      current.questionImages.push(...images);
    }
  }
  pushCurrent();
  return questions;
}

// --- 5. Parse Bagian 2 — tabel soal rusak ---
// Kolom: 0=No, 1=Soal Asli, 2=Gambar Penjelasan
// Output: { id, question, explanationImages, isBroken: true }

function parsePart2(html, startingQNumber) {
  const brokenQuestions = [];
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[0];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let isFirstRow = true;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1];
      // Detect header row: contains <th> or "Soal Asli" / "No" keywords
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells = [];
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(cellMatch[1]);
      }

      if (cells.length < 2) continue;

      // Skip header row (first row or row with "Soal Asli" / "Gambar")
      const firstCellText = cleanText(cells[0]);
      const secondCellText = cleanText(cells[1] || "");
      if (
        isFirstRow ||
        /soal\s+asli|gambar\s+penjelasan/i.test(secondCellText) ||
        /^no\.?$/i.test(firstCellText)
      ) {
        isFirstRow = false;
        // Still might be a data row if first cell is a number
        if (!/^\d+$/.test(firstCellText)) continue;
      }
      isFirstRow = false;

      // col 0: number (used as original question number reference)
      // col 1: broken question text
      // col 2: explanation image(s)
      const origNo = firstCellText;
      const questionText = secondCellText;
      const explanationImages = cells[2] ? extractImages(cells[2]) : [];
      // Also grab any images from question cell itself
      const questionImages = extractImages(cells[1] || "");

      if (!questionText) continue;

      const qNum = startingQNumber + brokenQuestions.length + 1;
      brokenQuestions.push({
        id: `QB${origNo || qNum}`,
        category: "Soal Rusak",
        question: questionText,
        questionImages,
        options: {},
        answer: "",
        explanation: "",
        explanationImages,
        isBroken: true,
      });
    }
  }

  return brokenQuestions;
}

// --- 6. Acak opsi + kunci jawaban, tapi jaga distribusi kunci tetap rata ---
// Kenapa perlu: kalau urutan A/B/C/D/E ditulis apa adanya oleh penulis soal,
// kunci jawaban seringkali menumpuk di huruf tertentu (contoh: kebanyakan C
// atau E). Fungsi ini mengacak urutan opsi tiap soal (isi opsi ikut pindah
// bersama statusnya benar/salah), lalu membagikan "slot kunci" (A/B/C/D/E)
// secara merata ke semua soal yang punya 5 opsi lengkap — sehingga total
// count tiap huruf sebagai kunci jawaban selisihnya maksimal 1.
//
// Aman untuk penjelasan (Penjelasan: ...) karena penjelasan di format ini
// merujuk ke ISI opsi (nama/istilah), bukan ke huruf opsi — jadi tidak perlu
// diubah saat opsi diacak ulang.

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function letterKey(options) {
  return Object.keys(options).sort().join(",");
}

function rebalanceAnswerDistribution(questions) {
  // Hanya soal normal (bukan isBroken), punya kunci, dan opsi utuh yang diproses.
  const eligible = questions.filter(
    (q) =>
      !q.isBroken &&
      q.answer &&
      q.options &&
      Object.keys(q.options).length >= 2 &&
      q.options[q.answer] !== undefined
  );
  if (eligible.length === 0) return { changed: 0, groups: {} };

  // Kelompokkan berdasarkan set huruf opsi (mis. "A,B,C,D,E") — hanya
  // kelompok dengan set huruf yang sama yang dibagi rata bersama, supaya
  // soal dengan jumlah opsi berbeda tidak saling mengacaukan.
  const groups = new Map();
  for (const q of eligible) {
    const key = letterKey(q.options);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }

  let changed = 0;
  const summary = {};

  for (const [key, group] of groups.entries()) {
    const letters = key.split(",");
    const n = group.length;
    const base = Math.floor(n / letters.length);
    const rem = n % letters.length;

    // Acak huruf mana saja yang kebagian "jatah lebih" (+1), supaya adil
    // antar-huruf tiap kali file di-convert ulang.
    const lettersShuffled = shuffleArray([...letters]);
    const countPerLetter = {};
    letters.forEach((L) => (countPerLetter[L] = base));
    for (let i = 0; i < rem; i++) countPerLetter[lettersShuffled[i]] += 1;

    // Bangun pool target kunci sesuai jatah, lalu acak urutannya.
    let pool = [];
    letters.forEach((L) => {
      for (let k = 0; k < countPerLetter[L]; k++) pool.push(L);
    });
    shuffleArray(pool);

    // Acak urutan soal supaya assignment target tidak berkorelasi dengan
    // urutan asli soal di dokumen.
    const groupShuffled = shuffleArray([...group]);

    groupShuffled.forEach((q, idx) => {
      const targetLetter = pool[idx];
      const correctText = q.options[q.answer];
      const otherEntries = letters
        .filter((L) => L !== q.answer)
        .map((L) => q.options[L]);
      shuffleArray(otherEntries);

      const newOptions = {};
      let oi = 0;
      letters.forEach((L) => {
        if (L === targetLetter) {
          newOptions[L] = correctText;
        } else {
          newOptions[L] = otherEntries[oi++];
        }
      });

      q.options = newOptions;
      q.answer = targetLetter;
      changed += 1;
    });

    summary[key] = countPerLetter;
  }

  return { changed, groups: summary };
}

// --- 7. Gabungkan hasil kedua bagian ---
const part1Questions = parsePart1(part1Html);
const { changed: rebalancedCount, groups: rebalanceSummary } =
  rebalanceAnswerDistribution(part1Questions);
const part2Questions = parsePart2(part2Html, part1Questions.length);
const allQuestions = [...part1Questions, ...part2Questions];

// --- 8. Tulis hasil ke questions.js (mode lama: data/questions.js, mode paket: data/packages/<id>/questions.js) ---
const outPath = path.join(dataDir, "questions.js");
const fileContent = `// File ini DIBUAT OTOMATIS oleh scripts/convert-docx.js dari: ${path.basename(docxPath)}
// Jangan diedit manual kalau masih mau re-generate dari docx.
// Untuk soal manual tambahan, edit array di bawah ini langsung (boleh kok).
//
// Soal dengan isBroken: true = soal rusak dari Bagian 2 (tabel).
// Di app ditampilkan sebagai kartu tap-to-reveal — tekan kartu untuk melihat
// gambar penjelasan (explanationImages).

export const questions = ${JSON.stringify(allQuestions, null, 2)};
`;
fs.writeFileSync(outPath, fileContent, "utf-8");

// --- 9. Mode paket: daftarkan/update entry di data/manifest.js ---
async function upsertManifest() {
  const manifestPath = path.join(projectRoot, "data", "manifest.js");
  let packages = [];
  if (fs.existsSync(manifestPath)) {
    try {
      const mod = await import(pathToFileURL(manifestPath).href + `?t=${Date.now()}`);
      packages = Array.isArray(mod.packages) ? mod.packages : [];
    } catch (e) {
      console.log("Catatan: gagal baca manifest lama, membuat manifest baru. (" + e.message + ")");
      packages = [];
    }
  }

  const entry = {
    id: packageId,
    category: kategoriArg,
    title: paketTitle,
    file: `./data/packages/${packageId}/questions.js`,
    count: allQuestions.length,
    convertedAt: new Date().toISOString(),
    source: path.basename(docxPath),
  };
  const idx = packages.findIndex((p) => p.id === packageId);
  if (idx >= 0) packages[idx] = entry;
  else packages.push(entry);

  packages.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

  const manifestContent = `// File ini DIBUAT/DIKELOLA OTOMATIS oleh scripts/convert-docx.js.
// Berisi daftar semua "paket soal" (hasil konversi docx per kategori).
// Jangan diedit manual kecuali kamu tahu apa yang kamu lakukan — bisa
// dihapus/ditimpa lagi saat konversi berikutnya jalan untuk paket yang sama.

export const packages = ${JSON.stringify(packages, null, 2)};
`;
  fs.writeFileSync(manifestPath, manifestContent, "utf-8");
  return packages.length;
}

const part1Count = part1Questions.length;
const part2Count = part2Questions.length;
console.log(`Selesai. ${allQuestions.length} soal berhasil diparse.`);
console.log(`  Bagian 1 (normal)  : ${part1Count} soal`);
console.log(`  Bagian 2 (rusak)   : ${part2Count} soal`);
if (rebalancedCount > 0) {
  console.log(`  Opsi diacak & kunci diratakan untuk ${rebalancedCount} soal:`);
  for (const [key, counts] of Object.entries(rebalanceSummary)) {
    console.log(`    [${key}] ->`, counts);
  }
}
if (usePackageMode) {
  console.log(`  Kategori           : ${kategoriArg}`);
  console.log(`  Paket              : ${paketTitle} (id: ${packageId})`);
}
console.log(`-> ${outPath}`);
console.log(`-> ${imagesDir} (${imageCounter} gambar)`);
if (usePackageMode) {
  const totalPackages = await upsertManifest();
  console.log(`-> ${path.join(projectRoot, "data", "manifest.js")} (${totalPackages} paket terdaftar)`);
}
if (allQuestions.length === 0) {
  console.log("\nTIDAK ADA SOAL TERDETEKSI. Cek apakah format docx mengikuti README.md.");
}
