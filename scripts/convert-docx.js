// scripts/convert-docx.js
// Konversi file .docx (soal + gambar) menjadi file data/questions.js
// Jalankan: node scripts/convert-docx.js path/ke/file.docx
//
// FORMAT YANG HARUS DIIKUTI DI DALAM DOCX (lihat README.md untuk detail):
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
//   2. Soal berikutnya...
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

// --- 2. Pecah HTML jadi urutan "token" per baris (teks atau gambar) ---
// Setiap <p>/<h1>/<h2>/<h3>...</...> jadi satu baris. Tag <img> di dalamnya diekstrak terpisah.
// Heading (h1/h2/h3) ditandai isHeading: true supaya bisa dipakai sebagai kategori soal.
const blockRegex = /<(p|h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/g;
const lines = [];
let m;
while ((m = blockRegex.exec(html)) !== null) {
  const tag = m[1];
  const inner = m[2];
  const imgs = [...inner.matchAll(/<img[^>]*src="([^"]+)"[^>]*>/g)].map((x) => x[1]);
  const text = inner
    .replace(/<img[^>]*>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
  if (text || imgs.length) {
    lines.push({ text, images: imgs, isHeading: tag !== "p" });
  }
}

// --- 3. Parse baris-baris itu jadi struktur soal ---
const questions = [];
let current = null;
let pendingId = null;
let currentCategory = "";
let mode = null; // 'question' | 'explanation'

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
  const { text, images, isHeading } = line;

  // Heading di docx (Style Heading 1/2/3) otomatis jadi kategori soal
  // untuk semua soal berikutnya sampai ketemu heading lain.
  if (isHeading) {
    currentCategory = text;
    continue;
  }

  // Alternatif: kategori juga bisa ditulis manual sebagai paragraf biasa
  // dengan format "Kategori: nama kategori" tepat sebelum nomor soal.
  if (categoryLine.test(text)) {
    currentCategory = text.match(categoryLine)[1].trim();
    continue;
  }

  if (idLine.test(text)) {
    pendingId = text.match(idLine)[1].trim();
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
    };
    mode = "question";
    continue;
  }

  if (!current) continue; // skip teks sebelum soal pertama

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

  // baris lanjutan (multi-line) — tambahkan ke bagian yang sedang aktif
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

// --- 4. Tulis hasil ke data/questions.js ---
const outPath = path.join(dataDir, "questions.js");
const fileContent = `// File ini DIBUAT OTOMATIS oleh scripts/convert-docx.js dari: ${path.basename(
  docxPath
)}
// Jangan diedit manual kalau masih mau re-generate dari docx.
// Untuk soal manual tambahan, edit array di bawah ini langsung (boleh kok).

export const questions = ${JSON.stringify(questions, null, 2)};
`;
fs.writeFileSync(outPath, fileContent, "utf-8");

console.log(`Selesai. ${questions.length} soal berhasil diparse.`);
console.log(`-> ${outPath}`);
console.log(`-> ${imagesDir} (${imageCounter} gambar)`);
if (questions.length === 0) {
  console.log("\nTIDAK ADA SOAL TERDETEKSI. Cek apakah format docx mengikuti README.md.");
}
