// Baca teks PDF per baris (pakai koordinat y), lalu gabungkan baris lanjutan.
const PDF_START_RE = /^(\d+[.)]\s|[A-Ea-e][.)]\s|Kunci|Jawaban|Answer|Key|Correct|Penjelasan|Explanation|Gambar\s+Penjelasan|Sumber\s*:|ID\s*:|Kategori|Category|Bagian\s+\d)/i;

function pdfLinesFromPages(pages) {
  const lines = [];
  for (const items of pages) {
    const pts = items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0 }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let row = [], rowY = null;
    const flush = () => {
      if (!row.length) return;
      row.sort((a, b) => a.x - b.x);
      let text = "", endX = null;
      for (const p of row) {
        if (endX !== null && p.x - endX > 1.5) text += " ";
        text += p.s;
        endX = p.x + p.w;
      }
      const clean = text.replace(/\s+/g, " ").trim();
      if (clean) lines.push(clean);
      row = [];
    };
    for (const p of pts) {
      if (rowY === null || Math.abs(p.y - rowY) > 2) { flush(); rowY = p.y; }
      row.push(p);
    }
    flush();
  }
  // Baris yang bukan penanda (nomor soal, opsi, Kunci, Penjelasan, dst.) dianggap lanjutan
  // dari baris sebelumnya — jadi teks soal/opsi/penjelasan yang turun ke baris baru tetap utuh.
  const out = [];
  for (const l of lines) {
    if (out.length && !PDF_START_RE.test(l)) out[out.length - 1] += " " + l;
    else out.push(l);
  }
  return out;
}

// ── Node: baca PDF (pdfjs-dist) jadi HTML sederhana, satu <p> per baris ──
// Output dipakai sebagai pengganti hasil mammoth, jadi parser soal yang sama bisa dipakai.
// Gambar di PDF belum diekstrak (hanya teks).
import fs from "fs";

export async function pdfToHtml(pdfPath) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push(content.items);
  }
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return pdfLinesFromPages(pages)
    .map((l) => (/^Bagian\s+\d/i.test(l) ? `<h2>${esc(l)}</h2>` : `<p>${esc(l)}</p>`))
    .join("\n");
}
