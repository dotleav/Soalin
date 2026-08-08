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
import { fileURLToPath } from "url";
import mammoth from "mammoth";

const docxPath = process.argv[2];
if (!docxPath) {
  console.error("Pakai: node scripts/convert-docx.js path/ke/file.docx");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const imagesDir = path.join(projectRoot, "images");
const dataDir = path.join(projectRoot, "data");
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
      return { src: `images/${filename}` };
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
// (logika sama persis seperti sebelumnya)

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
  const optionLine = /^([A-E])[.)]\s*(.*)$/;
  const answerLine = /^(Kunci|Jawaban)\s*:?\s*([A-E])\b.*$/i;
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
      current = {
        id: autoId,
        category: currentCategory,
        question: text,
        questionImages: [...images],
        options: {},
        answer: "",
        explanation: "",
        explanationImages: [],
        isBroken: false,
      };
      mode = "question";
      continue;
    }

    const qStart = text.match(questionStart);
    if (qStart) {
      pushCurrent();
      const autoId = pendingId || `Q${questions.length + 1}`;
      pendingId = null;
      current = {
        id: autoId,
        category: currentCategory,
        question: qStart[2].trim(),
        questionImages: [...images],
        options: {},
        answer: "",
        explanation: "",
        explanationImages: [],
        isBroken: false,
      };
      mode = "question";
      continue;
    }

    if (!current) continue;

    const optMatch = text.match(optionLine);
    if (optMatch) {
      current.options[optMatch[1]] = optMatch[2].trim();
      current.questionImages.push(...images);
      mode = "options";
      continue;
    }

    const ansMatch = text.match(answerLine);
    if (ansMatch) {
      current.answer = ansMatch[2].toUpperCase();
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

// --- 6. Gabungkan hasil kedua bagian ---
const part1Questions = parsePart1(part1Html);
const part2Questions = parsePart2(part2Html, part1Questions.length);
const allQuestions = [...part1Questions, ...part2Questions];

// --- 7. Tulis hasil ke data/questions.js ---
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

const part1Count = part1Questions.length;
const part2Count = part2Questions.length;
console.log(`Selesai. ${allQuestions.length} soal berhasil diparse.`);
console.log(`  Bagian 1 (normal)  : ${part1Count} soal`);
console.log(`  Bagian 2 (rusak)   : ${part2Count} soal`);
console.log(`-> ${outPath}`);
console.log(`-> ${imagesDir} (${imageCounter} gambar)`);
if (allQuestions.length === 0) {
  console.log("\nTIDAK ADA SOAL TERDETEKSI. Cek apakah format docx mengikuti README.md.");
}
