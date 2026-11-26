// ── AI Builder: unggah file → rekonstruksi soal (file soal) atau buat soal dari materi ──
// Semua panggilan AI lewat Cloud Function aiChat (kunci Classai hanya di server).
const AI_ENDPOINT = "https://asia-southeast1-soalin-multiplayer.cloudfunctions.net/aiChat";
const AI_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const AI_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const AI_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const UPLOADS_KEY = "uploads";
const ISIAN_VERDICT_KEY = "soalin_isian_verdict_v1";
const AI_SYS_JSON = "Balas HANYA dengan JSON valid. Tanpa penjelasan, tanpa markdown, tanpa pagar kode.";
const LETTERS5 = ["A", "B", "C", "D", "E"];
const MCQ_MODES = {
  "5": { letters: ["A", "B", "C", "D", "E"], title: "Pilihan 5 opsi" },
  "4": { letters: ["A", "B", "C", "D"], title: "Pilihan 4 opsi" },
  "tf": { letters: ["A", "B"], title: "Benar-Salah", tf: true },
};
const GEN_LABEL = { "5": "Membuat soal 5 opsi", "4": "Membuat soal 4 opsi", "tf": "Membuat soal Benar-Salah", flash: "Membuat flashcards", isian: "Membuat soal isian" };
const AI_DL_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/></svg>`;

let uploads = [];          // [{ id, name, kind: "soal"|"materi", ext, savedAt, blob }]
let uploadSel = null;      // id file yang sedang dipilih
let uploadsReady = null;   // promise: daftar upload sudah dibaca dari IndexedDB
let aiBusy = false;        // satu job AI dalam satu waktu
const isianBusyIds = new Set();
let isianVerdicts = {};
try { isianVerdicts = JSON.parse(localStorage.getItem(ISIAN_VERDICT_KEY)) || {}; } catch { isianVerdicts = {}; }

const aiUid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const aiSafeName = (s) => String(s || "kuis").replace(/[\\/:*?"<>|]+/g, "_").trim() || "kuis";
const baseName = (n) => n.replace(/\.(docx|pdf)$/i, "");

// ── Panggilan AI ──────────────────────────────────────────────────────────
async function aiCall(system, user, maxTokens = 4000) {
  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, user, maxTokens }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.text !== "string") throw new Error(data.error || `AI tidak merespons (${res.status}).`);
  return data.text;
}

function aiJson(text) {
  const s = String(text).replace(/```(?:json)?/gi, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("Format balasan AI tidak valid.");
  try { return JSON.parse(s.slice(a, b + 1)); } catch { throw new Error("Format balasan AI tidak valid."); }
}

// ── Baca isi file (docx / pdf) jadi baris teks; gambar → placeholder [[IMG:k]] ──
async function dumpSource(buf) {
  const read = isPdfBuffer(buf) ? await pdfDocxReader(buf) : await openZip(buf);
  const td = new TextDecoder();
  const docBytes = await read("word/document.xml");
  if (!docBytes) throw new Error("Isi dokumen tidak terbaca.");
  const doc = new DOMParser().parseFromString(td.decode(docBytes), "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("XML dokumen rusak.");

  const rels = {};
  const relBytes = await read("word/_rels/document.xml.rels");
  if (relBytes) {
    const rd = new DOMParser().parseFromString(td.decode(relBytes), "application/xml");
    for (const r of rd.getElementsByTagName("Relationship")) rels[r.getAttribute("Id")] = r.getAttribute("Target");
  }

  const images = [];
  const imgToken = async (rid) => {
    const target = rels[rid];
    if (!target) return "";
    const path = decodeURIComponent(new URL(target, "http://x/word/document.xml").pathname.slice(1));
    const bytes = await read(path);
    if (!bytes) return "";
    images.push(new Blob([bytes]));
    return `[[IMG:${images.length - 1}]]`;
  };
  const textOf = async (el) => {
    let out = "";
    for (const n of el.childNodes) {
      if (n.nodeType !== 1) continue;
      const name = n.localName;
      if (name === "t") out += n.textContent;
      else if (name === "tab") out += "\t";
      else if (name === "br") out += "\n";
      else if (name === "blip") out += await imgToken(n.getAttributeNS(AI_R, "embed"));
      else out += await textOf(n);
    }
    return out;
  };

  const body = doc.getElementsByTagNameNS(AI_W, "body")[0];
  if (!body) throw new Error("Isi dokumen tidak terbaca.");
  const lines = [];
  for (const node of body.childNodes) {
    if (node.nodeType !== 1) continue;
    if (node.localName === "p") {
      const t = (await textOf(node)).trim();
      if (t) lines.push(t);
    } else if (node.localName === "tbl") {
      for (const tr of node.getElementsByTagNameNS(AI_W, "tr")) {
        const cells = [];
        for (const tc of tr.childNodes) {
          if (tc.nodeType !== 1 || tc.localName !== "tc") continue;
          const paras = [];
          for (const p of tc.childNodes) if (p.nodeType === 1 && p.localName === "p") paras.push((await textOf(p)).trim());
          cells.push(paras.filter(Boolean).join(" / "));
        }
        if (cells.some(Boolean)) lines.push(cells.join(" | "));
      }
    }
  }
  return { lines: lines.flatMap((l) => l.split("\n").map((s) => s.trim()).filter(Boolean)), images };
}

// Soal = minimal 2 nomor soal + 2 opsi huruf, atau 2 baris kunci/tabel bernomor. Selain itu materi.
function classifyDump(lines) {
  const nums = lines.filter((l) => /^\d{1,3}[.)]\s/.test(l)).length;
  const opts = lines.filter((l) => /^[A-E][.)]\s/.test(l)).length;
  const tabled = lines.filter((l) => /^(kunci|\d{1,3}\s*\|)/i.test(l)).length;
  return (nums >= 2 && opts >= 2) || tabled >= 2 ? "soal" : "materi";
}

// Potong teks per ±max karakter di batas baris (supaya soal tidak terpotong di tengah).
function chunkLines(lines, max = 8000) {
  const out = [];
  let cur = "";
  for (const l of lines) {
    if (cur && cur.length + l.length + 1 > max) { out.push(cur); cur = ""; }
    cur += (cur ? "\n" : "") + l;
  }
  if (cur) out.push(cur);
  return out;
}

// ── Prompt ────────────────────────────────────────────────────────────────
function reconPrompt(chunk) {
  return `Rekonstruksi soal ujian kedokteran berikut ke format kuis. Keluarkan SEMUA soal bernomor yang ada di teks. Jangan menambah atau membuang nomor, dan jangan membuat soal baru.

ATURAN OPSI
1. Soal dengan 3 opsi atau lebih: TIDAK rusak. Pertahankan opsi asli, lalu tambahkan opsi buatanmu sendiri sampai total 5 opsi (A–E).
2. Soal dengan 2 opsi: TIDAK rusak. Tambahkan opsi sampai total 5 (A–E).
3. Soal dengan hanya 1 opsi dan opsi itu adalah kunci: TIDAK rusak. Buat 4 pengecoh sendiri sampai total 5 (A–E).
4. Soal tanpa opsi sama sekali: rusak=true. Isi "stem" dengan teks soal asli dan "penjelasan" dengan penjelasan jawaban yang benar bila bisa disimpulkan dari teks. "opsi" dikosongkan.
5. Pengecoh harus masuk akal, setopik, dan tidak boleh menjadi jawaban benar kedua.

ANTI-KEBOCORAN
- Hapus semua penanda jawaban dari stem dan opsi, misalnya "(benar)", "(kunci)", "(jawaban)", tanda bintang, tanda panah, atau keterangan unik yang hanya dimiliki kunci.
- Panjang, gaya, dan tingkat detail kunci harus setara dengan pengecoh.

LAINNYA
- "kunci" berupa satu huruf A–E yang ada di "opsi".
- "penjelasanOpsi" singkat per opsi (boleh kosong). "penjelasan" singkat untuk jawaban.
- Jika kunci di sumber tidak jelas, pilih jawaban paling tepat secara medis.
- Soal yang berada di bagian "Soal Isian", "Bagian 3", atau tabel isian dengan kolom jawaban masuk ke "isian" (bukan "soal").
- Teks berisi [[IMG:k]] adalah gambar. Jika gambar termasuk bagian soal, sebutkan indeksnya di "gambarSoal" sebagai angka. Jangan memasukkan gambar ke opsi.

Format JSON:
{"soal":[{"no":1,"stem":"","gambarSoal":[],"opsi":{"A":""},"penjelasanOpsi":{"A":""},"kunci":"A","penjelasan":"","rusak":false}],"isian":[{"no":1,"soal":"","jawaban":""}]}

TEKS SUMBER:
${chunk}`;
}

const MCQ_STYLE = `Tulis setiap soal sebagai KASUS klinis singkat (vignette) dengan pertanyaan tentang diagnosis, pemeriksaan, tatalaksana, obat, mekanisme, atau langkah berikutnya. Jangan membuat pertanyaan hafalan, dan jangan memakai frasa "menurut materi".`;

function mcqPrompt(chunk, mode) {
  const m = MCQ_MODES[mode];
  const rule = m.tf
    ? `Buat pernyataan (bukan kasus) yang bisa benar atau salah. Opsi HANYA "A": "Benar" dan "B": "Salah". Kunci A atau B.`
    : `${MCQ_STYLE} Buat opsi ${m.letters.join(", ")}: satu kunci dan pengecoh yang masuk akal, setopik, serta setara panjang dan gayanya. Kunci tidak boleh ditandai dengan cara apa pun.`;
  return `Buat maksimal 8 soal pilihan ganda dari materi berikut. ${rule}
Setiap opsi punya "penjelasanOpsi" singkat, dan soal punya "penjelasan" singkat.
Format JSON: {"soal":[{"stem":"","opsi":{"A":""},"penjelasanOpsi":{"A":""},"kunci":"A","penjelasan":""}]}

MATERI:
${chunk}`;
}

const flashPrompt = (chunk) => `Buat maksimal 8 flashcard dari materi berikut. "depan" berisi istilah, konsep, atau pertanyaan singkat. "belakang" berisi definisi atau jawaban inti yang ringkas dengan terminologi baku.
Format JSON: {"kartu":[{"depan":"","belakang":""}]}

MATERI:
${chunk}`;

const isianPrompt = (chunk) => `Buat maksimal 8 soal isian singkat dari materi berikut. Setiap soal menanyakan konsep inti. "jawaban" berisi kunci jawaban yang inti dan ringkas (satu istilah atau satu kalimat pendek) dengan terminologi baku.
Format JSON: {"isian":[{"soal":"","jawaban":""}]}

MATERI:
${chunk}`;

const ISIAN_RULES = `Tentukan verdict:
- "benar": inti jawaban sama dengan kunci. Sinonim, parafrase, singkatan, atau definisi yang setara tetap benar. Jangan disalahkan hanya karena kata-katanya berbeda.
- "hampir": topiknya sama, tetapi tingkat terminologinya berbeda. Misalnya peserta menulis contoh spesifik (nama obat) untuk kunci berupa terminologi payung (kelas obat), atau sebaliknya, dan keduanya masih satu keluarga konsep.
- "salah": topik atau konsepnya berbeda, walaupun mirip dalam kata.
Contoh:
- Kunci "Visum et Repertum Psikiatrikum", jawaban "Visum et Repertum" → salah (dua hal berbeda).
- Kunci "Obat antikoagulan", jawaban "Rivaroxaban" → hampir (spesifik vs payung).
- Kunci "Obat antikoagulan", jawaban "Antikoagulan" → benar (definisi dan terminologi sama).
Balas: {"verdict":"benar"|"hampir"|"salah","alasan":"satu kalimat singkat"}`;

// ── Normalisasi hasil AI ─────────────────────────────────────────────────
// Ambil opsi huruf valid, urut A–E. Null kalau kunci tidak ada di opsi atau opsi < 2.
function normMcq(s, letters) {
  const raw = s.opsi || {}, rawExpl = s.penjelasanOpsi || {};
  const opsi = {}, expl = {};
  for (const L of letters) {
    const key = Object.keys(raw).find((k) => String(k).trim().toUpperCase() === L);
    const t = key !== undefined ? String(raw[key] ?? "").trim() : "";
    if (!t) continue;
    opsi[L] = t;
    const ek = Object.keys(rawExpl).find((k) => String(k).trim().toUpperCase() === L);
    const e = ek !== undefined ? String(rawExpl[ek] ?? "").trim() : "";
    if (e) expl[L] = e;
  }
  const kunci = String(s.kunci || "").trim().toUpperCase();
  if (Object.keys(opsi).length < 2 || !opsi[kunci]) return null;
  return { opsi, expl, kunci };
}

function mcqQuestion(id, stem, m, questionImages, explanation) {
  return {
    id, category: "", question: stem, questionImages, options: m.opsi, optionExplanations: m.expl,
    answer: m.kunci, explanation: explanation || "", explanationImages: [], isBroken: false,
  };
}

// Hasil rekonstruksi → daftar soal kuis + blobs gambar (indeks sama dengan format convert.js).
function reconBuild(soal, isian, images) {
  const blobs = [], map = new Map();
  const imgRef = (k) => {
    const i = Number(k);
    if (!images[i]) return null;
    if (!map.has(i)) { map.set(i, blobs.length); blobs.push(images[i]); }
    return map.get(i);
  };
  const byNo = (a, b) => Number(a.no) - Number(b.no);
  const seen = new Set(), seenI = new Set(), normal = [], broken = [], isianQs = [], nos = new Set();

  for (const s of [...soal].sort(byNo)) {
    const no = Number(s.no);
    if (!no || seen.has(no)) continue;
    seen.add(no); nos.add(no);
    const stem = String(s.stem || "").trim();
    const m = s.rusak ? null : normMcq(s, LETTERS5);
    if (!m) {
      broken.push({ id: `Q${no}`, category: "Soal Rusak", question: stem, questionImages: [], options: {}, optionExplanations: {}, answer: "", explanation: String(s.penjelasan || "").trim(), explanationImages: [], isBroken: true });
      continue;
    }
    const imgs = (s.gambarSoal || []).map(imgRef).filter((x) => x !== null);
    normal.push(mcqQuestion(`Q${no}`, stem, m, imgs, s.penjelasan));
  }
  for (const s of [...isian].sort(byNo)) {
    const no = Number(s.no), soalTxt = String(s.soal || "").trim();
    if (!no || !soalTxt || seenI.has(no) || seen.has(no)) continue;
    seenI.add(no); nos.add(no);
    isianQs.push({ id: `QI${no}`, category: "Soal Isian", question: soalTxt, questionImages: [], options: {}, answer: String(s.jawaban || "").trim(), explanation: "", explanationImages: [], isBroken: false, isIsian: true, aiGrade: true });
  }
  const questions = [...normal, ...broken, ...isianQs];
  return { questions, blobs, nos, counts: { normal: normal.length, broken: broken.length, isian: isianQs.length } };
}

// ── Pemanggilan per bagian (paralel) ─────────────────────────────────────
async function reconRun(dump, progress) {
  const chunks = chunkLines(dump.lines, 8000);
  if (chunks.length > 12) throw new Error(`File terlalu panjang (${chunks.length} bagian). Pecah file dulu.`);
  const soal = [], isian = [];
  let done = 0;
  await Promise.all(chunks.map(async (c) => {
    const j = aiJson(await aiCall(AI_SYS_JSON, reconPrompt(c), 8000));
    soal.push(...(j.soal || []));
    isian.push(...(j.isian || []));
    progress(`Merekonstruksi bagian ${++done}/${chunks.length}…`);
  }));
  return { soal, isian };
}

async function materiRun(dump, mkPrompt, progress) {
  const all = chunkLines(dump.lines, 9000);
  const chunks = all.slice(0, 6);
  const parts = [];
  let done = 0;
  await Promise.all(chunks.map(async (c, i) => {
    parts[i] = aiJson(await aiCall(AI_SYS_JSON, mkPrompt(c), 6000));
    progress(`Membuat soal ${++done}/${chunks.length}…`);
  }));
  return { parts: parts.filter(Boolean), truncated: all.length > 6 };
}

// ── Simpan kuis hasil AI sebagai Custom Quiz (memakai jalur IndexedDB yang sama dengan .docx) ──
async function saveBuiltQuiz(title, questions, blobs) {
  const rec = { id: aiUid(), title, questions, blobs, savedAt: Date.now() };
  let saved = true;
  await idb("readwrite", (st) => st.put(rec, "cq:" + rec.id)).catch(() => { saved = false; });
  customQuizzes.unshift({ ...customMeta(rec, "cq:" + rec.id), transient: !saved });
  await saveCustomIndex();
  clearCustomProgress(rec.id);
  return rec;
}

// ── Job: rekonstruksi file soal ──────────────────────────────────────────
async function jobRekon(u, progress) {
  const dump = await dumpSource(await u.blob.arrayBuffer());
  const res = await reconRun(dump, progress);
  const built = reconBuild(res.soal, res.isian, dump.images);
  if (!built.questions.length) throw new Error("Tidak ada soal yang bisa dibaca dari file ini.");
  const dumpNos = [...new Set(dump.lines.map((l) => l.match(/^(\d{1,3})(?:[.)]\s|\s*\|)/)?.[1]).filter(Boolean).map(Number))];
  const missing = dumpNos.filter((n) => !built.nos.has(n));
  const rec = await saveBuiltQuiz(`${baseName(u.name)} (rekonstruksi)`, built.questions, built.blobs);
  const c = built.counts;
  const msg = `${c.normal} soal${c.broken ? ` + ${c.broken} soal rusak` : ""}${c.isian ? ` + ${c.isian} soal isian` : ""}.` +
    (missing.length ? ` [warn] nomor tidak terbaca: ${missing.join(", ")}` : "");
  return { rec, msg };
}

// ── Job: buat soal dari materi ───────────────────────────────────────────
async function jobMateri(u, kind, progress) {
  const dump = await dumpSource(await u.blob.arrayBuffer());
  const mk = kind === "flash" ? flashPrompt : kind === "isian" ? isianPrompt : (c) => mcqPrompt(c, kind);
  const { parts, truncated } = await materiRun(dump, mk, progress);
  const questions = [];
  const nextId = (p) => `${p}${questions.length + 1}`;
  for (const p of parts) {
    if (kind === "flash") {
      for (const k of p.kartu || []) {
        const d = String(k.depan || "").trim(), b = String(k.belakang || "").trim();
        if (d && b) questions.push({ id: nextId("QI"), category: "Flashcards", question: d, questionImages: [], options: {}, answer: b, explanation: "", explanationImages: [], isBroken: false, isIsian: true, aiGrade: false });
      }
    } else if (kind === "isian") {
      for (const s of p.isian || []) {
        const q = String(s.soal || "").trim(), a = String(s.jawaban || "").trim();
        if (q && a) questions.push({ id: nextId("QI"), category: "Soal Isian", question: q, questionImages: [], options: {}, answer: a, explanation: "", explanationImages: [], isBroken: false, isIsian: true, aiGrade: true });
      }
    } else {
      for (const s of p.soal || []) {
        const m = normMcq(s, MCQ_MODES[kind].letters);
        if (m) questions.push(mcqQuestion(nextId("Q"), String(s.stem || "").trim(), m, [], s.penjelasan));
      }
    }
  }
  if (!questions.length) throw new Error("AI tidak menghasilkan soal dari materi ini.");
  const title = `${baseName(u.name)} — ${kind === "flash" ? "Flashcards" : kind === "isian" ? "Soal isian" : MCQ_MODES[kind].title}`;
  const rec = await saveBuiltQuiz(title, questions, []);
  const msg = `${questions.length} soal dibuat.` + (truncated ? " [warn] Materi panjang: hanya 6 bagian pertama yang dibaca." : "");
  return { rec, msg };
}

// ── Jalankan job (satu per waktu), tampilkan progres lewat dropMsg, lalu mainkan kuis hasilnya ──
async function runAi(label, job) {
  if (aiBusy) return;
  aiBusy = true; pickerOpen = true; dropMsg = `[wait] ${label}…`; render();
  try {
    const { rec, msg } = await job((m) => { dropMsg = `[wait] ${m}`; render(); });
    dropMsg = `[ok] ${msg}`;
    await selectPackage(customPkg(rec));
    pickerOpen = msg.includes("[warn]");
  } catch (e) {
    dropMsg = `[err] ${e.message}`;
  } finally {
    aiBusy = false;
    render();
  }
}

// ── Daftar upload (IndexedDB, key "uploads") ──────────────────────────────
function loadUploadsOnce() {
  uploadsReady ??= idb("readonly", (st) => st.get(UPLOADS_KEY))
    .then((list) => { uploads = list || []; })
    .catch(() => {});
  return uploadsReady;
}
const saveUploads = () => idb("readwrite", (st) => st.put(uploads, UPLOADS_KEY));

// Unggah / seret-lepas: simpan file asli, deteksi jenis (soal / materi), pilih file itu.
async function handleUpload(fileList) {
  const files = [...fileList].filter((f) => /\.(docx|pdf)$/i.test(f.name));
  pickerOpen = true;
  if (!files.length) { dropMsg = "[warn] Pilih file Word (.docx) atau PDF (.pdf)."; render(); return; }
  await loadUploadsOnce();
  const msgs = [];
  for (const file of files) {
    dropMsg = [...msgs, `[wait] Membaca ${file.name}…`].join("\n"); render();
    try {
      const buf = await file.arrayBuffer();
      const dump = await dumpSource(buf);
      if (!dump.lines.length) throw new Error("isi file kosong.");
      const kind = classifyDump(dump.lines);
      const item = { id: aiUid(), name: file.name, kind, ext: file.name.split(".").pop().toLowerCase(), savedAt: Date.now(), blob: new Blob([buf], { type: file.type }) };
      uploads.unshift(item);
      uploadSel = item.id;
      msgs.push(`[ok] ${file.name}: terdeteksi sebagai ${kind === "soal" ? "file soal" : "materi"}`);
    } catch (e) {
      msgs.push(`[err] ${file.name}: ${e.message}`);
    }
  }
  await saveUploads().catch(() => {});
  dropMsg = msgs.join("\n");
  render();
}

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Blok dokumen dari baris teks (materi). Gambar placeholder [[IMG:k]] jadi gambar sungguhan.
async function dumpBlocks(lines, images, blocks, cache) {
  for (const line of lines) {
    const parts = line.split(/\[\[IMG:(\d+)\]\]/);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) { if (parts[i].trim()) blocks.push({ type: "p", text: parts[i] }); continue; }
      const im = await cachedPng(images, Number(parts[i]), cache);
      if (im) blocks.push({ type: "img", ...im });
    }
  }
}

async function cachedPng(list, i, cache) {
  if (!cache.has(i)) cache.set(i, list[i] ? await docxPngFromBlob(list[i]) : null);
  return cache.get(i);
}

// Kuis → .docx dengan format template Soalin (Bagian 1 / 2 / 3).
async function quizDocxBlob(rec) {
  const blocks = [], cache = new Map();
  const normal = rec.questions.filter((q) => !q.isBroken && !q.isIsian);
  const broken = rec.questions.filter((q) => q.isBroken);
  const isian = rec.questions.filter((q) => q.isIsian);
  let n = 0;
  blocks.push({ type: "p", text: "Bagian 1", bold: true });
  for (const q of normal) {
    n++;
    blocks.push({ type: "p", text: `${n}. ${q.question}` });
    for (const i of q.questionImages || []) {
      const im = await cachedPng(rec.blobs, i, cache);
      if (im) blocks.push({ type: "img", ...im });
    }
    for (const L of Object.keys(q.options || {}).sort()) {
      const e = q.optionExplanations?.[L];
      blocks.push({ type: "p", text: `${L}. ${q.options[L]}${e ? ` {${e}}` : ""}` });
    }
    blocks.push({ type: "p", text: `Kunci: ${q.answer}` });
    if (q.explanation) blocks.push({ type: "p", text: `Penjelasan: ${q.explanation}` });
    blocks.push({ type: "p", text: "" });
  }
  if (broken.length) {
    blocks.push({ type: "p", text: "Bagian 2", bold: true });
    blocks.push({ type: "table", header: ["No", "Soal Asli", "Penjelasan"], rows: broken.map((q) => [++n, q.question, q.explanation]) });
  }
  if (isian.length) {
    blocks.push({ type: "p", text: "Bagian 3", bold: true });
    blocks.push({ type: "table", header: ["No", "Soal", "Jawaban"], rows: isian.map((q) => [++n, q.question, q.answer]) });
  }
  return buildDocx(blocks);
}

async function downloadQuizById(recId) {
  try {
    const rec = await loadCustomFull(recId);
    if (!rec) throw new Error("kuis tidak ditemukan.");
    downloadBlob(await quizDocxBlob(rec), `${aiSafeName(rec.title)}.docx`);
  } catch (e) {
    dropMsg = `[err] Unduh gagal: ${e.message}`; pickerOpen = true; render();
  }
}

// File docx asli diunduh apa adanya. PDF diubah jadi docx dari teks + gambarnya.
async function downloadUpload(u) {
  try {
    if (u.ext === "docx") return downloadBlob(u.blob, aiSafeName(u.name));
    const dump = await dumpSource(await u.blob.arrayBuffer());
    const blocks = [];
    await dumpBlocks(dump.lines, dump.images, blocks, new Map());
    downloadBlob(await buildDocx(blocks), `${aiSafeName(baseName(u.name))}.docx`);
  } catch (e) {
    dropMsg = `[err] Unduh gagal: ${e.message}`; pickerOpen = true; render();
  }
}

async function deleteUpload(id) {
  const u = uploads.find((x) => x.id === id);
  if (!u || !confirm(`Hapus "${u.name}" dari daftar?`)) return;
  uploads = uploads.filter((x) => x.id !== id);
  if (uploadSel === id) uploadSel = null;
  await saveUploads().catch(() => {});
  render();
}

// ── Penilaian isian oleh AI ──────────────────────────────────────────────
async function gradeIsian(q, answer) {
  const user = `Soal: ${q.question}\nKunci jawaban: ${q.answer}\nJawaban peserta: ${answer}\n\n${ISIAN_RULES}`;
  const j = aiJson(await aiCall(`Kamu penilai jawaban isian ujian kedokteran yang ketat. Jangan menyetujui jawaban hanya karena terdengar meyakinkan. ${AI_SYS_JSON}`, user, 300));
  const verdict = String(j.verdict || "").toLowerCase();
  if (!["benar", "hampir", "salah"].includes(verdict)) throw new Error("Penilaian AI tidak valid.");
  return { verdict, alasan: String(j.alasan || "").trim() };
}

const isianKey = (qid) => `${activePackage?.id || ""}::${qid}`;
const isianVerdictOf = (qid) => isianVerdicts[isianKey(qid)] || null;
function setIsianVerdict(qid, v) {
  isianVerdicts[isianKey(qid)] = v;
  try { localStorage.setItem(ISIAN_VERDICT_KEY, JSON.stringify(isianVerdicts)); } catch { /* noop */ }
}

const ISIAN_TAG = { benar: ["ok", "check", "Benar"], hampir: ["warn", "warning", "Hampir benar"], salah: ["bad", "close", "Salah"] };
// Label hasil kartu isian. Isian tanpa AI (flashcards) tetap "Benar" seperti sebelumnya.
function isianVerdictTag(q) {
  const v = isianVerdictOf(q.id);
  if (!v) return q.aiGrade ? "" : `<span class="icon ok">${svgIcon("check")}</span> <span class="isianCorrectLabel">Benar</span>`;
  const [cls, icon, label] = ISIAN_TAG[v.verdict] || ISIAN_TAG.salah;
  return `<span class="icon ${cls}">${svgIcon(icon)}</span> <span class="isianCorrectLabel">${label}</span>${v.alasan ? ` <span class="isianWhy">${escapeHtml(v.alasan)}</span>` : ""}`;
}

// ── UI: area upload + panel spec (tombol, bukan chat) ─────────────────────
function renderUploadPanel() {
  if (!uploadsReady) loadUploadsOnce().then(() => render());
  const cur = uploads.find((u) => u.id === uploadSel);
  const rows = uploads.map((u) => `
      <div class="aiUploadRow${u.id === uploadSel ? " active" : ""}">
        <button class="aiUploadPick" data-ai="pick" data-id="${escapeAttr(u.id)}">
          <span class="aiKind ${u.kind}">${u.kind === "soal" ? "Soal" : "Materi"}</span>
          <span class="pkgTitle">${escapeHtml(u.name)}</span>
        </button>
        <button class="resetBtn" data-ai="dl" data-id="${escapeAttr(u.id)}" title="Unduh .docx">${AI_DL_ICON}</button>
        <button class="resetBtn customDelBtn" data-ai="del" data-id="${escapeAttr(u.id)}" title="Hapus">${svgIcon("trash")}</button>
      </div>`).join("");
  return `
      <input type="file" id="docxInput" accept=".docx,.pdf" multiple hidden>
      <label class="dropZone aiDropZone" for="docxInput" data-drop="ai">
        <span class="dropIcon">${svgIcon("sparkle")}</span>
        <span class="dropTitle">Buat/perbaiki soal dengan AI disini</span>
        <span class="dropSub">Drag &amp; drop</span>
        <span class="dropFormats"><code>.docx</code><code>.pdf</code></span>
      </label>
      ${rows ? `<div class="aiUploads">${rows}</div>` : ""}
      ${cur ? renderSpecPanel(cur) : ""}`;
}

function renderSpecPanel(u) {
  const dis = aiBusy ? " disabled" : "";
  if (u.kind === "soal") {
    return `
      <div class="aiSpec">
        <div class="aiSpecRow">
          <button class="aiSpecBtn primary" data-ai="rekon" data-id="${escapeAttr(u.id)}"${dis}>Buat dan Rekonstruksi kuis</button>
          <button class="aiSpecBtn" disabled>Pemilihan opsi</button>
          <button class="aiSpecBtn" disabled>Flashcards</button>
          <button class="aiSpecBtn" disabled>Soal isian</button>
        </div>
        <p class="aiLocked">File ini adalah file soal, opsi yang tersedia hanyalah buat dan rekonstruksi.</p>
      </div>`;
  }
  const gen = (kind, label) => `<button class="aiSpecBtn" data-ai="gen" data-kind="${kind}" data-id="${escapeAttr(u.id)}"${dis}>${label}</button>`;
  return `
      <div class="aiSpec">
        <div class="aiSpecRow">
          <span class="aiSpecLabel">Pemilihan opsi:</span>
          ${gen("5", "5 opsi (A–E)")}${gen("4", "4 opsi (A–D)")}${gen("tf", "Benar / Salah")}
        </div>
        <div class="aiSpecRow">
          ${gen("flash", "Flashcards")}${gen("isian", "Soal isian")}
        </div>
      </div>`;
}

// Delegasi klik / ganti file (panel dirender ulang, jadi tidak pakai listener per elemen).
document.addEventListener("change", (e) => {
  const run = { docxInput: handleUpload, customInput: handleDocx }[e.target.id];
  if (!run) return;
  const files = [...e.target.files];
  e.target.value = "";
  if (files.length) run(files);
});

document.addEventListener("click", (e) => {
  const dl = e.target.closest?.("[data-dl-quiz]");
  if (dl) { downloadQuizById(dl.dataset.dlQuiz); return; }
  const b = e.target.closest?.("[data-ai]");
  if (!b || b.disabled) return;
  const u = uploads.find((x) => x.id === b.dataset.id);
  switch (b.dataset.ai) {
    case "pick": uploadSel = b.dataset.id; render(); break;
    case "dl": if (u) downloadUpload(u); break;
    case "del": deleteUpload(b.dataset.id); break;
    case "rekon": if (u) runAi("Merekonstruksi soal", (p) => jobRekon(u, p)); break;
    case "gen": if (u) runAi(GEN_LABEL[b.dataset.kind], (p) => jobMateri(u, b.dataset.kind, p)); break;
  }
});
