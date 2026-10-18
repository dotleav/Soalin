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

// ── Browser: baca PDF lewat pdf.js (dimuat dari CDN saat pertama dipakai) ──
// Teks PDF diubah jadi "dokumen docx" sintetis, jadi parser yang sama bisa dipakai.
// Gambar di PDF belum diekstrak (hanya teks).
const PDFJS_BASE = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
const PDF_W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
let pdfjsPromise = null;

function isPdfBuffer(buf) {
  const b = new Uint8Array(buf, 0, 4);
  return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // "%PDF"
}

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = PDFJS_BASE + "pdf.min.js";
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + "pdf.worker.min.js";
        res(window.pdfjsLib);
      };
      s.onerror = () => { pdfjsPromise = null; rej(new Error("Gagal memuat pdf.js — cek koneksi internet.")); };
      document.head.appendChild(s);
    });
  }
  return pdfjsPromise;
}

// Pengganti openZip() untuk PDF: hanya word/document.xml yang ada (berisi satu paragraf per baris).
async function pdfDocxReader(buf) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push(content.items);
  }
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paras = pdfLinesFromPages(pages)
    .map((l) => `<p><r><t xml:space="preserve">${esc(l)}</t></r></p>`)
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><document xmlns="${PDF_W_NS}"><body>${paras}</body></document>`;
  const bytes = new TextEncoder().encode(xml);
  return async (name) => (name === "word/document.xml" ? bytes : null);
}
